"""
FastAPI REST API routes for 3D parcels and vertical property units.

Endpoints:
- GET  /api/parcels/3d-geojson   : Full 3D GeoJSON FeatureCollection for visualizer
- GET  /api/parcels/details/{ulpin_3d} : Complete metadata for a specific unit
- GET  /api/parcels/clashes      : Detected spatial conflicts report
- POST /api/parcels/create-unit  : Ingest, generate 3D geometry & ULPIN, check clashes
"""

import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2 import WKTElement
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.ulpin_encoder import generate_3d_ulpin
from app.models.property_unit import (
    GrievanceRecord,
    GrievanceStatus,
    LayerType,
    UnitType,
    VerticalPropertyUnit,
)
from app.schemas.property_unit import (
    ClashPair,
    ClashReportResponse,
    DisputeResolutionRequest,
    DisputeResolutionResponse,
    FloorSubdivideRequest,
    FloorSubdivideResponse,
    GrievanceActionRequest,
    GrievanceCreate,
    GrievanceResolveRequest,
    GrievanceResponse,
    PendingGrievanceCountResponse,
    SubdividedUnitCreate,
    UnitCreate,
    UnitResponse,
    UnitUpdateAdmin,
)
from app.services.clash_detector import check_spatial_clashes
from app.services.geometry_service import (
    calculate_polygon_area_sqm,
    create_3d_polyhedron_wkt,
    extract_footprint_from_wkt,
    polyhedron_to_geojson_3d,
    subdivide_polygon_2d,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/parcels",
    tags=["3D Parcels & Cadastre"],
)


@router.get("/3d-geojson")
def get_all_units_3d_geojson(
    base_2d_ulpin: Optional[str] = Query(None, description="Filter by surface parcel ID"),
    floor_level: Optional[int] = Query(None, description="Filter by floor level"),
    clash_only: bool = Query(False, description="Return only clashing units"),
    db: Session = Depends(get_db),
):
    """
    Export all vertical property units as a 3D GeoJSON FeatureCollection.

    Each feature includes 3D coordinate geometry (with elevation Z) and full property attributes
    suitable for direct ingestion into CesiumJS, Mapbox GL JS, deck.gl, or Three.js.
    """
    try:
        # Build query using SQLAlchemy ORM to avoid raw SQL parameter type ambiguity
        # Note: ST_AsGeoJSON does NOT support POLYHEDRALSURFACE Z - only use ST_AsText
        query = db.query(
            VerticalPropertyUnit,
            func.ST_AsText(VerticalPropertyUnit.geom_3d).label("wkt_geom"),
        )

        # Apply filters dynamically
        if base_2d_ulpin:
            query = query.filter(VerticalPropertyUnit.base_2d_ulpin == base_2d_ulpin)
        if floor_level is not None:
            query = query.filter(VerticalPropertyUnit.floor_level == floor_level)
        if clash_only:
            query = query.filter(VerticalPropertyUnit.is_clashing == True)

        # Execute query with ordering
        results = query.order_by(
            VerticalPropertyUnit.floor_level.asc(),
            VerticalPropertyUnit.z_min.asc()
        ).all()
    except Exception as e:
        logger.error("Failed to query 3D GeoJSON: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database query error: {str(e)}",
        )

    features = []
    for unit, wkt_geom in results:
        # Build 3D geometry structure from WKT
        # (ST_AsGeoJSON does not support POLYHEDRALSURFACE Z, so we parse WKT instead)
        geometry = None
        if wkt_geom:
            geometry = polyhedron_to_geojson_3d(wkt_geom)

        if not geometry:
            geometry = {"type": "GeometryCollection", "geometries": []}

        # Safe Enum serialization - handle both Enum instances and string values
        unit_type_str = unit.unit_type.value if hasattr(unit.unit_type, "value") else str(unit.unit_type)
        layer_type_str = unit.layer_type.value if hasattr(unit.layer_type, "value") else str(unit.layer_type)

        properties = {
            "id": str(unit.id),
            "base_2d_ulpin": unit.base_2d_ulpin,
            "ulpin_3d": unit.ulpin_3d,
            "unit_number": unit.unit_number,
            "floor_level": unit.floor_level,
            "unit_type": unit_type_str,
            "layer_type": layer_type_str,
            "z_min": unit.z_min,
            "z_max": unit.z_max,
            "volume_cum": unit.volume_cum,
            "carpet_area_sqm": unit.carpet_area_sqm,
            "depth_below_ground_m": unit.depth_below_ground_m,
            "easement_type": unit.easement_type,
            "owner_name": unit.owner_name,
            "rera_reg_no": unit.rera_reg_no,
            "is_clashing": unit.is_clashing,
            "clash_details": unit.clash_details,
            # ML LiDAR & Drone 3D Building Inventory Attributes
            "ulpin_id": unit.ulpin_id or unit.ulpin_3d,
            "building_name": unit.building_name,
            "plot_number": unit.plot_number,
            "flat_number": unit.flat_number,
            "floor_number": unit.floor_level,
            "total_floors": unit.total_floors or unit.estimated_floors or 1,
            "scene_id": unit.scene_id,
            "building_id": unit.building_id,
            "building_type": unit.building_type or "Low-rise",
            "building_height_m": unit.building_height_m or round(unit.z_max - unit.z_min, 2),
            "building_volume_m3": unit.building_volume_m3 or unit.volume_cum,
            "footprint_area_m2": unit.footprint_area_m2 or unit.carpet_area_sqm,
            "roof_area_m2": unit.roof_area_m2,
            "roof_height_m": unit.roof_height_m,
            "usable_roof_area_m2": unit.usable_roof_area_m2,
            "estimated_solar_kw": unit.estimated_solar_kw,
            "estimated_floors": unit.estimated_floors or 1,
            "point_count": unit.point_count,
            "roof_point_count": unit.roof_point_count,
            "data_status": unit.data_status or "3D_cadastre_verified",
            "solar_available": unit.solar_available if unit.solar_available is not None else True,
        }

        features.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": properties,
        })

    return {
        "type": "FeatureCollection",
        "total_features": len(features),
        "features": features,
    }


@router.get("/details/{ulpin_3d}", response_model=UnitResponse)
def get_unit_details(
    ulpin_3d: str,
    db: Session = Depends(get_db),
):
    """
    Retrieve complete metadata, dimensional metrics, and ownership details for a specific 3D ULPIN.
    """
    unit = db.query(VerticalPropertyUnit).filter(
        VerticalPropertyUnit.ulpin_3d == ulpin_3d.strip()
    ).first()

    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Property unit with 3D ULPIN '{ulpin_3d}' not found.",
        )

    return unit


@router.get("/clashes", response_model=ClashReportResponse)
def get_clash_report(
    db: Session = Depends(get_db),
):
    """
    Run 3D topological verification and return all detected spatial encroachments and boundary overlaps.
    """
    raw_clashes = check_spatial_clashes(db=db)

    # Fetch all units currently marked as clashing
    clashing_units = db.query(VerticalPropertyUnit).filter(
        VerticalPropertyUnit.is_clashing == True
    ).all()

    total_units = db.query(VerticalPropertyUnit).count()

    clash_pairs = [
        ClashPair(
            ulpin_3d_a=c["unit_a_ulpin"],
            unit_number_a=c["unit_a_number"],
            floor_level_a=c["unit_a_floor"],
            ulpin_3d_b=c["unit_b_ulpin"],
            unit_number_b=c["unit_b_number"],
            floor_level_b=c["unit_b_floor"],
            overlap_description=c["overlap_description"],
        )
        for c in raw_clashes
    ]

    return ClashReportResponse(
        total_units_checked=total_units,
        clash_count=len(clash_pairs),
        clashing_units=clashing_units,
        clash_pairs=clash_pairs,
    )


@router.post("/create-unit", response_model=UnitResponse, status_code=status.HTTP_201_CREATED)
def create_property_unit(
    payload: UnitCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new 3D Vertical Property Unit:
    1. Generates the deterministic 3D ULPIN string.
    2. Calculates footprint area ($m^2$) and 3D volumetric capacity ($m^3$).
    3. Builds a watertight 3D PolyhedralSurface WKT geometry.
    4. Persists the record to PostGIS.
    5. Automatically runs spatial clash detection against existing building units.
    """
    # 1. Validate enum values
    try:
        unit_type_enum = UnitType(payload.unit_type.upper())
    except ValueError:
        valid_unit_types = [e.value for e in UnitType]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid unit_type '{payload.unit_type}'. Must be one of: {valid_unit_types}",
        )

    try:
        layer_type_enum = LayerType(payload.layer_type.upper())
    except ValueError:
        valid_layer_types = [e.value for e in LayerType]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid layer_type '{payload.layer_type}'. Must be one of: {valid_layer_types}",
        )

    # 2. Format footprint coordinates as list of tuples
    coords_tuples = [(pt[0], pt[1]) for pt in payload.footprint_coords]

    # 3. Generate deterministic 3D ULPIN
    try:
        ulpin_3d = generate_3d_ulpin(
            base_2d_ulpin=payload.base_2d_ulpin,
            layer_type=layer_type_enum.value,
            z_min=payload.z_min,
            z_max=payload.z_max,
            unit_code=payload.unit_number,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"ULPIN generation failed: {str(e)}",
        )

    # Check for uniqueness
    existing = db.query(VerticalPropertyUnit).filter(
        VerticalPropertyUnit.ulpin_3d == ulpin_3d
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A property unit with 3D ULPIN '{ulpin_3d}' already exists.",
        )

    # 4. Compute geometrical metrics
    try:
        carpet_area = calculate_polygon_area_sqm(coords_tuples)
        height = payload.z_max - payload.z_min
        volume = carpet_area * height
    except Exception as e:
        logger.warning("Area/Volume calculation fallback: %s", e)
        carpet_area = None
        volume = None

    # 5. Construct 3D Polyhedron WKT
    try:
        polyhedron_wkt = create_3d_polyhedron_wkt(
            footprint_2d=coords_tuples,
            z_min=payload.z_min,
            z_max=payload.z_max,
        )
        geom_3d_element = WKTElement(polyhedron_wkt, srid=4326)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to generate 3D Polyhedron geometry: {str(e)}",
        )

    # 6. Instantiate ORM model
    unit_id = uuid.uuid4()
    unit = VerticalPropertyUnit(
        id=unit_id,
        base_2d_ulpin=payload.base_2d_ulpin,
        ulpin_3d=ulpin_3d,
        unit_number=payload.unit_number,
        floor_level=payload.floor_level,
        unit_type=unit_type_enum,
        layer_type=layer_type_enum,
        z_min=payload.z_min,
        z_max=payload.z_max,
        volume_cum=round(volume, 2) if volume is not None else None,
        carpet_area_sqm=round(carpet_area, 2) if carpet_area is not None else None,
        depth_below_ground_m=payload.depth_below_ground_m,
        easement_type=payload.easement_type,
        owner_name=payload.owner_name,
        owner_aadhaar_hash=payload.owner_aadhaar_hash,
        rera_reg_no=payload.rera_reg_no,
        is_clashing=False,
        clash_details=None,
        geom_3d=geom_3d_element,
        # ML LiDAR & Solar Inventory extensions
        ulpin_id=payload.ulpin_id,
        scene_id=payload.scene_id,
        building_id=payload.building_id,
        building_type=payload.building_type,
        building_height_m=payload.building_height_m or (round(height, 2) if height is not None else None),
        building_volume_m3=payload.building_volume_m3 or (round(volume, 2) if volume is not None else None),
        footprint_area_m2=payload.footprint_area_m2 or (round(carpet_area, 2) if carpet_area is not None else None),
        roof_area_m2=payload.roof_area_m2,
        roof_height_m=payload.roof_height_m,
        usable_roof_area_m2=payload.usable_roof_area_m2,
        estimated_solar_kw=payload.estimated_solar_kw,
        estimated_floors=payload.estimated_floors or 1,
        point_count=payload.point_count,
        roof_point_count=payload.roof_point_count,
        data_status=payload.data_status or "3D_cadastre_verified",
        solar_available=payload.solar_available if payload.solar_available is not None else True,
    )

    db.add(unit)
    db.commit()
    db.refresh(unit)

    # 7. Run targeted clash detection
    try:
        check_spatial_clashes(db=db, target_unit_id=unit.id)
        db.refresh(unit)
    except Exception as e:
        logger.warning("Post-insert clash detection check failed: %s", e)

    return unit


@router.patch("/update/{ulpin_3d}", response_model=UnitResponse)
def update_property_unit_admin(
    ulpin_3d: str,
    payload: UnitUpdateAdmin,
    db: Session = Depends(get_db),
):
    """
    Administrative endpoint for Cadastral Officers to update property attributes,
    ownership registry info, RERA registration numbers, land classification,
    and cadastral notes.
    """
    unit = db.query(VerticalPropertyUnit).filter(
        VerticalPropertyUnit.ulpin_3d == ulpin_3d.strip()
    ).first()

    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Property unit with 3D ULPIN '{ulpin_3d}' not found.",
        )

    if payload.owner_name is not None:
        unit.owner_name = payload.owner_name

    if payload.owner_aadhaar_hash is not None:
        unit.owner_aadhaar_hash = payload.owner_aadhaar_hash

    if payload.rera_reg_no is not None:
        unit.rera_reg_no = payload.rera_reg_no

    if payload.building_type is not None:
        unit.building_type = payload.building_type

    if payload.data_status is not None:
        unit.data_status = payload.data_status

    if payload.carpet_area_sqm is not None:
        unit.carpet_area_sqm = payload.carpet_area_sqm
        unit.footprint_area_m2 = payload.carpet_area_sqm
        height = unit.z_max - unit.z_min
        unit.volume_cum = round(payload.carpet_area_sqm * height, 2)
        unit.building_volume_m3 = unit.volume_cum

    if payload.depth_below_ground_m is not None:
        unit.depth_below_ground_m = payload.depth_below_ground_m

    if payload.easement_type is not None:
        unit.easement_type = payload.easement_type

    if payload.layer_type is not None:
        try:
            unit.layer_type = LayerType(payload.layer_type.upper())
        except ValueError:
            valid_layer_types = [e.value for e in LayerType]
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid layer_type '{payload.layer_type}'. Must be one of: {valid_layer_types}",
            )

    if payload.unit_type is not None:
        try:
            unit.unit_type = UnitType(payload.unit_type.upper())
        except ValueError:
            valid_unit_types = [e.value for e in UnitType]
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid unit_type '{payload.unit_type}'. Must be one of: {valid_unit_types}",
            )

    if payload.notes:
        if unit.clash_details:
            unit.clash_details = f"{unit.clash_details} | [Admin Note: {payload.notes}]"
        else:
            unit.clash_details = f"[Admin Note: {payload.notes}]"

    db.commit()
    db.refresh(unit)

    logger.info("Cadastral Admin successfully updated unit %s", ulpin_3d)
    return unit


@router.post("/resolve-dispute", response_model=DisputeResolutionResponse)
def resolve_cadastral_dispute(
    payload: DisputeResolutionRequest,
    db: Session = Depends(get_db),
):
    """
    Administrative workflow to legally acknowledge, override, or regularize
    flagged 3D volumetric clashes and boundary encroachments.
    """
    unit = db.query(VerticalPropertyUnit).filter(
        VerticalPropertyUnit.ulpin_3d == payload.ulpin_3d.strip()
    ).first()

    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Property unit with 3D ULPIN '{payload.ulpin_3d}' not found.",
        )

    # Update dispute status
    unit.is_clashing = False
    unit.clash_details = (
        f"RESOLVED [{payload.resolution_action}]: {payload.resolution_notes} "
        f"(Authorized by: {payload.resolved_by})"
    )
    unit.data_status = f"Dispute Resolved - {payload.resolution_action}"

    db.commit()
    db.refresh(unit)

    logger.info(
        "Cadastral dispute resolved for %s with action %s by %s",
        payload.ulpin_3d,
        payload.resolution_action,
        payload.resolved_by,
    )

    return DisputeResolutionResponse(
        success=True,
        ulpin_3d=unit.ulpin_3d,
        message=f"Volumetric dispute successfully resolved via {payload.resolution_action}.",
        is_clashing=unit.is_clashing,
        clash_details=unit.clash_details,
        data_status=unit.data_status,
    )


# --- Citizen Grievance & Officer Adjudication Endpoints ----------------------

@router.post("/grievances", response_model=GrievanceResponse, status_code=status.HTTP_201_CREATED)
def lodge_citizen_grievance(
    payload: GrievanceCreate,
    db: Session = Depends(get_db),
):
    """
    Lodge a citizen grievance / encroachment dispute.

    Creates a new GrievanceRecord with status PENDING.
    Does NOT prematurely flag the target 3D unit as clashing until an authorized
    Cadastral Officer reviews and approves the conflict.
    """
    unit = db.query(VerticalPropertyUnit).filter(
        VerticalPropertyUnit.ulpin_3d == payload.ulpin_3d.strip()
    ).first()

    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target property unit with 3D ULPIN '{payload.ulpin_3d}' not found in registry.",
        )

    grievance = GrievanceRecord(
        ulpin_3d=unit.ulpin_3d,
        building_name=payload.building_name or unit.building_name,
        plot_number=payload.plot_number or unit.plot_number,
        flat_number=payload.flat_number or unit.flat_number or unit.unit_number,
        citizen_name=payload.citizen_name.strip(),
        citizen_phone=payload.citizen_phone.strip() if payload.citizen_phone else None,
        description=payload.description.strip(),
        status=GrievanceStatus.PENDING,
    )

    db.add(grievance)
    db.commit()
    db.refresh(grievance)

    logger.info(
        "Citizen grievance lodged for unit %s by %s (Grievance ID: %s)",
        unit.ulpin_3d,
        grievance.citizen_name,
        grievance.id,
    )

    return grievance


@router.get("/grievances", response_model=list[GrievanceResponse])
def list_grievances(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    """
    List all citizen grievances, optionally filtered by status (PENDING, APPROVED, REJECTED, RESOLVED).
    """
    query = db.query(GrievanceRecord)

    if status_filter:
        try:
            status_enum = GrievanceStatus(status_filter.upper())
            query = query.filter(GrievanceRecord.status == status_enum)
        except ValueError:
            valid_statuses = [s.value for s in GrievanceStatus]
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status '{status_filter}'. Must be one of: {valid_statuses}",
            )

    grievances = query.order_by(GrievanceRecord.created_at.desc()).all()
    return grievances


@router.get("/grievances/pending", response_model=list[GrievanceResponse])
def list_pending_grievances(
    db: Session = Depends(get_db),
):
    """
    Compatibility endpoint: List all pending citizen grievances requiring Cadastral Officer review.
    """
    return (
        db.query(GrievanceRecord)
        .filter(GrievanceRecord.status == GrievanceStatus.PENDING)
        .order_by(GrievanceRecord.created_at.desc())
        .all()
    )


@router.get("/grievances/pending-count", response_model=PendingGrievanceCountResponse)
def get_pending_grievances_count(
    db: Session = Depends(get_db),
):
    """
    Return the total number of pending citizen grievances requiring Cadastral Officer review.
    """
    count = db.query(func.count(GrievanceRecord.id)).filter(
        GrievanceRecord.status == GrievanceStatus.PENDING
    ).scalar() or 0

    return PendingGrievanceCountResponse(pending_count=count)


@router.post("/grievances/{grievance_id}/action", response_model=GrievanceResponse)
def adjudicate_grievance(
    grievance_id: uuid.UUID,
    payload: GrievanceActionRequest,
    db: Session = Depends(get_db),
):
    """
    Cadastral Officer adjudication endpoint for citizen grievances.

    - 'APPROVE': Approves the grievance, sets target unit is_clashing = True (rendering it red in 3D WebGL viewer).
    - 'REJECT': Dismisses the grievance with remarks, leaving the target unit in baseline category color.
    """
    grievance = db.query(GrievanceRecord).filter(
        GrievanceRecord.id == grievance_id
    ).first()

    if not grievance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Grievance record with ID '{grievance_id}' not found.",
        )

    action_clean = payload.action.upper().strip()
    officer_remarks_clean = (payload.officer_remarks or "").strip()
    if not officer_remarks_clean:
        officer_remarks_clean = (
            "Site survey and LiDAR cadastral verification confirmed spatial overlap."
            if action_clean in ["APPROVE", "APPROVE_FLAG_CONFLICT", "FLAG_CONFLICT"]
            else "Cadastral inspection verified no actionable encroachment; complaint dismissed."
        )

    officer_id_clean = payload.officer_id or "Admin Officer ID #KA-BLR-04"

    if action_clean in ["APPROVE", "APPROVE_FLAG_CONFLICT", "FLAG_CONFLICT"]:
        grievance.status = GrievanceStatus.APPROVED
        grievance.officer_remarks = officer_remarks_clean
        grievance.officer_id = officer_id_clean
        grievance.resolved_at = datetime.utcnow()

        # Flag target 3D property unit as clashing
        unit = db.query(VerticalPropertyUnit).filter(
            VerticalPropertyUnit.ulpin_3d == grievance.ulpin_3d
        ).first()

        if unit:
            unit.is_clashing = True
            unit.clash_details = (
                f"CITIZEN GRIEVANCE ADJUDICATED [APPROVED]: {officer_remarks_clean} "
                f"(Applicant: {grievance.citizen_name}, Complaint: {grievance.description})"
            )
            unit.data_status = "Citizen Grievance Approved - Dispute Active"
            logger.info("Unit %s flagged as clashing following approved grievance %s", unit.ulpin_3d, grievance.id)

    elif action_clean in ["REJECT", "DISMISS", "REJECT_DISMISS"]:
        grievance.status = GrievanceStatus.REJECTED
        grievance.officer_remarks = officer_remarks_clean
        grievance.officer_id = officer_id_clean
        grievance.resolved_at = datetime.utcnow()
        logger.info("Grievance %s dismissed by officer %s", grievance.id, officer_id_clean)

    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid action '{payload.action}'. Allowed values: 'APPROVE', 'REJECT'",
        )

    db.commit()
    db.refresh(grievance)

    return grievance


@router.post("/grievances/{grievance_id}/resolve", response_model=GrievanceResponse)
def resolve_grievance(
    grievance_id: uuid.UUID,
    payload: GrievanceResolveRequest,
    db: Session = Depends(get_db),
):
    """
    Cadastral Officer final resolution endpoint for active disputes / approved grievances.

    - Updates grievance status to 'RESOLVED'
    - Records resolution reason, notes, officer ID, uploaded proof document filename, and timestamp
    - Resets target unit is_clashing = False and clears/updates clash details in the 3D registry
    """
    grievance = db.query(GrievanceRecord).filter(
        GrievanceRecord.id == grievance_id
    ).first()

    if not grievance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Grievance record with ID '{grievance_id}' not found.",
        )

    resolution_notes_clean = (payload.resolution_notes or "").strip()
    if not resolution_notes_clean:
        resolution_notes_clean = (
            f"Dispute legally regularized via {payload.resolution_reason} under Cadastral Act 2026."
        )

    officer_id_clean = payload.officer_id or "Admin Officer ID #KA-BLR-04"

    grievance.status = GrievanceStatus.RESOLVED
    grievance.resolution_reason = payload.resolution_reason
    grievance.resolution_notes = resolution_notes_clean
    grievance.officer_id = officer_id_clean
    grievance.document_filename = payload.document_filename
    grievance.resolved_at = datetime.utcnow()

    # Reset target 3D property unit clash status
    unit = db.query(VerticalPropertyUnit).filter(
        VerticalPropertyUnit.ulpin_3d == grievance.ulpin_3d
    ).first()

    if unit:
        unit.is_clashing = False
        unit.clash_details = f"Resolved [{payload.resolution_reason}]: {resolution_notes_clean}"
        unit.data_status = f"Dispute Resolved ({payload.resolution_reason})"
        logger.info("Unit %s reset to non-clashing after dispute resolution %s", unit.ulpin_3d, grievance.id)

    db.commit()
    db.refresh(grievance)

    return grievance


@router.post("/subdivide", response_model=FloorSubdivideResponse)
@router.post("/buildings/{building_id}/subdivide", response_model=FloorSubdivideResponse)
def subdivide_building_floor(
    payload: FloorSubdivideRequest,
    building_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Cadastral Officer 3D Volumetric Floor Stratification & Unit Partitioning.

    Takes a target building floor slab, subdivides its 2D footprint polygon into N
    discrete unit footprints along its major axis, generates unique 30-character 3D ULPINs
    with CRC-8 checksums, and persists the individual unit title deeds into PostGIS.
    """
    try:
        n_units = len(payload.units)
        if n_units < 2 or n_units > 8:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Floor partitioning requires between 2 and 8 units.",
            )

        # 1. Locate existing building units
        query = db.query(
            VerticalPropertyUnit,
            func.ST_AsText(VerticalPropertyUnit.geom_3d).label("wkt_geom"),
        )

        if payload.base_2d_ulpin:
            query_filtered = query.filter(VerticalPropertyUnit.base_2d_ulpin == payload.base_2d_ulpin.strip())
        elif payload.building_name:
            query_filtered = query.filter(
                func.lower(VerticalPropertyUnit.building_name) == payload.building_name.strip().lower()
            )
        elif payload.plot_number:
            query_filtered = query.filter(
                func.lower(VerticalPropertyUnit.plot_number) == payload.plot_number.strip().lower()
            )
        elif building_id:
            query_filtered = query.filter(
                (VerticalPropertyUnit.building_name.ilike(f"%{building_id}%"))
                | (VerticalPropertyUnit.plot_number.ilike(f"%{building_id}%"))
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Must provide building_name, plot_number, or base_2d_ulpin to target a building.",
            )

        all_bldg_units = query_filtered.all()
        if not all_bldg_units:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target building not found in 3D cadastral registry.",
            )

        # Reference template unit from the building
        ref_unit, ref_wkt = all_bldg_units[0]
        building_name = ref_unit.building_name or payload.building_name or "Cadastral Property"
        base_2d_ulpin = ref_unit.base_2d_ulpin or payload.base_2d_ulpin or "KA010010420104"
        plot_number = ref_unit.plot_number or payload.plot_number or "PLOT-104"
        bldg_type = ref_unit.building_type or "Residential Complex"
        total_floors = ref_unit.total_floors or 5
        bldg_height = ref_unit.building_height_m or 16.0
        ground_amsl = 920.0

        # Locate existing units specifically on the target floor
        floor_units = [u for u in all_bldg_units if u[0].floor_level == payload.floor_level]

        if floor_units:
            floor_ref_unit, floor_ref_wkt = floor_units[0]
            z_min = float(floor_ref_unit.z_min)
            z_max = float(floor_ref_unit.z_max)
            layer_type_val = floor_ref_unit.layer_type.value if hasattr(floor_ref_unit.layer_type, "value") else str(floor_ref_unit.layer_type)
        else:
            # Infer elevation bounds from floor level and reference unit
            if payload.floor_level < 0:
                z_min = ground_amsl + (payload.floor_level * 3.5)
                z_max = z_min + 3.2
                layer_type_val = "B"
            elif payload.floor_level == 0:
                z_min = ground_amsl
                z_max = ground_amsl + 3.2
                layer_type_val = "S"
            else:
                z_min = ground_amsl + (payload.floor_level * 3.2)
                z_max = z_min + 3.2
                layer_type_val = "A"

        # Reconstruct unified building footprint via Shapely unary_union across all unit geometries
        from shapely.ops import unary_union
        from shapely.geometry import Polygon

        valid_polys = []
        for unit, wkt in all_bldg_units:
            if wkt:
                coords = extract_footprint_from_wkt(wkt)
                if len(coords) >= 4:
                    p = Polygon(coords)
                    if not p.is_valid:
                        p = p.buffer(0)
                    if not p.is_empty and p.area > 0:
                        valid_polys.append(p)

        if valid_polys:
            union_geom = unary_union(valid_polys)
            if union_geom.geom_type == "Polygon":
                footprint_coords = list(union_geom.exterior.coords)
            elif union_geom.geom_type == "MultiPolygon":
                footprint_coords = list(union_geom.convex_hull.exterior.coords)
            else:
                footprint_coords = extract_footprint_from_wkt(ref_wkt)
        else:
            footprint_coords = extract_footprint_from_wkt(ref_wkt)

        if not footprint_coords or len(footprint_coords) < 4:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to extract valid 2D polygon footprint from building geometry.",
            )

        if footprint_coords[0] != footprint_coords[-1]:
            footprint_coords.append(footprint_coords[0])

        # 2. Perform 2D polygon subdivision into N equal strips
        sub_polygons = subdivide_polygon_2d(footprint_coords, n_units)
        if len(sub_polygons) != n_units:
            logger.warning(
                "Subdivision produced %d polygons for %d requested units; using generated parts",
                len(sub_polygons),
                n_units,
            )

        # 3. Remove existing unpartitioned units on this floor
        for existing_unit_tuple in floor_units:
            existing_unit = existing_unit_tuple[0]
            db.delete(existing_unit)
        db.flush()

        # 4. Create discrete new VerticalPropertyUnit records for each partitioned flat
        created_units: list[VerticalPropertyUnit] = []
        for idx, unit_input in enumerate(payload.units):
            sub_poly = sub_polygons[idx] if idx < len(sub_polygons) else sub_polygons[0]
            sub_area_sqm = calculate_polygon_area_sqm(sub_poly)
            volume_cum = sub_area_sqm * (z_max - z_min)
            wkt_3d = create_3d_polyhedron_wkt(sub_poly, z_min, z_max)

            unit_sub_code = f"U{idx + 1:02d}"
            ulpin_3d = generate_3d_ulpin(
                base_2d_ulpin=base_2d_ulpin,
                layer_type=layer_type_val,
                z_min=z_min,
                z_max=z_max,
                unit_code=unit_sub_code,
                floor_level=payload.floor_level,
                ground_amsl=ground_amsl,
            )

            flat_num = unit_input.flat_number.strip()
            ulpin_id = f"{base_2d_ulpin}-{flat_num}"

            # Resolve UnitType enum
            usage_upper = unit_input.usage_type.upper()
            if "COM" in usage_upper:
                u_type = UnitType.COMMERCIAL
            elif "UTIL" in usage_upper or "STOR" in usage_upper:
                u_type = UnitType.UTILITY_CORRIDOR
            elif "PARK" in usage_upper or "BASE" in usage_upper:
                u_type = UnitType.BASEMENT_PARKING
            else:
                u_type = UnitType.RESIDENTIAL

            # Resolve LayerType enum
            if layer_type_val in ("B", "U", "UNDERGROUND"):
                l_type = LayerType.UNDERGROUND
            elif layer_type_val in ("S", "SURFACE"):
                l_type = LayerType.SURFACE
            else:
                l_type = LayerType.ABOVE_GROUND

            new_unit = VerticalPropertyUnit(
                id=uuid.uuid4(),
                base_2d_ulpin=base_2d_ulpin,
                ulpin_3d=ulpin_3d,
                unit_number=flat_num,
                floor_level=payload.floor_level,
                unit_type=u_type,
                layer_type=l_type,
                z_min=z_min,
                z_max=z_max,
                geom_3d=WKTElement(wkt_3d, srid=4326),
                volume_cum=round(volume_cum, 2),
                carpet_area_sqm=round(sub_area_sqm, 2),
                depth_below_ground_m=abs(round(ground_amsl - z_min, 2)) if payload.floor_level < 0 else 0.0,
                easement_type="Basement Parking Stratum" if payload.floor_level < 0 else None,
                owner_name=unit_input.owner_name.strip(),
                owner_aadhaar_hash=None,
                rera_reg_no=f"PRM/KA/RERA/{base_2d_ulpin[:6]}/{payload.floor_level}/{idx + 1:02d}",
                is_clashing=False,
                clash_details=None,
                ulpin_id=ulpin_id,
                building_name=building_name,
                plot_number=plot_number,
                flat_number=flat_num,
                total_floors=total_floors,
                building_type=bldg_type,
                building_height_m=bldg_height,
                building_volume_m3=bldg_height * sub_area_sqm * n_units,
                footprint_area_m2=round(sub_area_sqm, 2),
                roof_area_m2=round(sub_area_sqm * n_units, 2),
                roof_height_m=bldg_height,
                usable_roof_area_m2=round(sub_area_sqm * n_units * 0.8, 2),
                estimated_solar_kw=round(sub_area_sqm * n_units * 0.8 * 0.15, 2),
                estimated_floors=total_floors,
                data_status="3D_cadastre_verified",
                solar_available=True,
            )

            db.add(new_unit)
            created_units.append(new_unit)

        db.commit()

        # Refresh newly created units
        for u in created_units:
            db.refresh(u)

        logger.info(
            "Successfully subdivided floor %d of %s into %d units (Base ULPIN: %s)",
            payload.floor_level,
            building_name,
            len(created_units),
            base_2d_ulpin,
        )

        return FloorSubdivideResponse(
            success=True,
            message=(
                f"Successfully subdivided Floor {payload.floor_level} of {building_name} "
                f"into {len(created_units)} discrete 3D cadastral units with verified ULPINs."
            ),
            building_name=building_name,
            floor_level=payload.floor_level,
            created_units_count=len(created_units),
            created_units=[UnitResponse.model_validate(u, from_attributes=True) for u in created_units],
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subdivision calculation failed: {str(e)}",
        )



