"""
Ingestion Orchestration Service.

Coordinates the full pipeline:
1. Call ML client to segment floor plan
2. Transform relative unit coordinates to WGS84 geospatial coordinates
3. Compute vertical bounds (z_min, z_max)
4. Generate 3D polyhedron WKT geometries
5. Generate deterministic 3D ULPINs
6. Persist to PostGIS
7. Run spatial clash detection
"""

import logging
import uuid
from typing import Optional

from geoalchemy2 import WKTElement
from sqlalchemy.orm import Session

from app.core.ulpin_encoder import generate_3d_ulpin
from app.models.property_unit import LayerType, UnitType, VerticalPropertyUnit
from app.services.clash_detector import check_spatial_clashes
from app.services.geometry_service import (
    calculate_polygon_area_sqm,
    create_3d_polyhedron_wkt,
)
from app.services.ml_client import ml_client

logger = logging.getLogger(__name__)


class IngestionService:
    """Orchestrates automated floor plan ingestion and 3D ULPIN generation."""

    @staticmethod
    def _map_relative_to_geographic(
        relative_polygon: list[list[float]],
        building_footprint: list[list[float]],
        building_width_m: float,
        building_depth_m: float,
    ) -> list[tuple[float, float]]:
        """
        Map relative metric coordinates from floor plan to WGS84 lon/lat.

        Strategy:
        - Building footprint defines the bounding rectangle in WGS84.
        - Relative polygon vertices are in metres (x, y) within [0, building_width_m] x [0, building_depth_m].
        - Linearly interpolate to find corresponding WGS84 coordinates.

        Parameters
        ----------
        relative_polygon : list[list[float]]
            [[x, y], ...] in metres relative to building origin.
        building_footprint : list[list[float]]
            [[lon, lat], ...] WGS84 polygon (closed ring).
        building_width_m : float
            Building width in metres.
        building_depth_m : float
            Building depth in metres.

        Returns
        -------
        list[tuple[float, float]]
            [(lon, lat), ...] in WGS84 EPSG:4326.
        """
        # Extract bounding box from building footprint
        lons = [pt[0] for pt in building_footprint[:-1]]  # Exclude closing point
        lats = [pt[1] for pt in building_footprint[:-1]]

        lon_min, lon_max = min(lons), max(lons)
        lat_min, lat_max = min(lats), max(lats)

        geographic_coords = []
        for x, y in relative_polygon:
            # Normalize relative coordinates to [0, 1]
            norm_x = x / building_width_m if building_width_m > 0 else 0.0
            norm_y = y / building_depth_m if building_depth_m > 0 else 0.0

            # Map to WGS84 bounding box
            lon = lon_min + norm_x * (lon_max - lon_min)
            lat = lat_min + norm_y * (lat_max - lat_min)

            geographic_coords.append((lon, lat))

        # Ensure polygon is closed
        if geographic_coords and geographic_coords[0] != geographic_coords[-1]:
            geographic_coords.append(geographic_coords[0])

        return geographic_coords

    @staticmethod
    def _determine_layer_type(floor_number: int) -> LayerType:
        """Determine layer type from floor number."""
        if floor_number < 0:
            return LayerType.U  # Underground
        elif floor_number == 0:
            return LayerType.S  # Surface
        else:
            return LayerType.A  # Above ground

    @staticmethod
    def _map_unit_type_str(unit_type_str: str) -> UnitType:
        """Map ML response unit_type string to database enum."""
        unit_type_upper = unit_type_str.upper()
        try:
            return UnitType(unit_type_upper)
        except ValueError:
            logger.warning(f"Unknown unit_type '{unit_type_str}', defaulting to RESIDENTIAL")
            return UnitType.RESIDENTIAL

    async def process_floorplan(
        self,
        db: Session,
        file_bytes: bytes,
        filename: str,
        base_2d_ulpin: str,
        floor_number: int,
        base_elevation: float,
        floor_height: float,
        building_footprint: list[list[float]],
        building_width_m: float,
        building_depth_m: float,
        owner_name: Optional[str] = None,
        rera_reg_no: Optional[str] = None,
    ) -> dict:
        """
        Full pipeline: ML segmentation → 3D geometry → ULPIN generation → PostGIS persistence.

        Parameters
        ----------
        db : Session
            SQLAlchemy database session.
        file_bytes : bytes
            Floor plan file content.
        filename : str
            Original filename.
        base_2d_ulpin : str
            Base 2D parcel ULPIN (e.g., '14KA8829103841').
        floor_number : int
            Floor level (-1 = basement, 0 = ground, 1+ = upper floors).
        base_elevation : float
            Base elevation AMSL in metres (e.g., 920.0).
        floor_height : float
            Floor-to-ceiling height in metres (e.g., 3.2).
        building_footprint : list[list[float]]
            Building footprint as [[lon, lat], ...] in WGS84.
        building_width_m : float
            Building width in metres.
        building_depth_m : float
            Building depth in metres.
        owner_name : Optional[str]
            Default owner name for generated units.
        rera_reg_no : Optional[str]
            RERA registration number.

        Returns
        -------
        dict
            Summary with created units, clash detection results, and processing stats.
        """
        logger.info(
            f"Starting floor plan ingestion: {filename}, floor {floor_number}, "
            f"base ULPIN {base_2d_ulpin}"
        )

        # Step 1: Call ML microservice to segment floor plan
        logger.info("Step 1/7: Calling ML segmentation service...")
        segmentation_result = await ml_client.segment_floorplan_units(
            file_bytes=file_bytes,
            filename=filename,
            floor_number=floor_number,
            building_width_m=building_width_m,
            building_depth_m=building_depth_m,
        )

        detected_units = segmentation_result.get("units", [])
        logger.info(f"ML detected {len(detected_units)} units on floor {floor_number}")

        if not detected_units:
            logger.warning("No units detected by ML service")
            return {
                "status": "completed",
                "floor_number": floor_number,
                "units_created": 0,
                "units_details": [],
                "clashes_detected": 0,
                "message": "No units detected in floor plan",
            }

        # Step 2: Compute vertical bounds
        logger.info("Step 2/7: Computing vertical bounds...")
        z_min = base_elevation + (floor_number * floor_height)
        z_max = z_min + floor_height
        layer_type = self._determine_layer_type(floor_number)

        logger.info(f"Vertical bounds: z_min={z_min:.2f}m, z_max={z_max:.2f}m, layer={layer_type.value}")

        # Step 3-7: Process each detected unit
        created_units = []
        errors = []

        for idx, unit_seg in enumerate(detected_units):
            try:
                unit_id_raw = unit_seg.get("unit_id", f"Unit-{floor_number}-{idx+1}")
                unit_type_str = unit_seg.get("unit_type", "RESIDENTIAL")
                relative_polygon = unit_seg.get("relative_polygon", [])
                estimated_area = unit_seg.get("estimated_area_sqm", 0.0)

                if len(relative_polygon) < 4:
                    logger.warning(f"Unit {unit_id_raw} has invalid polygon, skipping")
                    continue

                # Step 3: Map relative coordinates to WGS84
                logger.info(f"Step 3/7: Mapping {unit_id_raw} to geographic coordinates...")
                geographic_coords = self._map_relative_to_geographic(
                    relative_polygon=relative_polygon,
                    building_footprint=building_footprint,
                    building_width_m=building_width_m,
                    building_depth_m=building_depth_m,
                )

                # Step 4: Generate 3D polyhedron WKT
                logger.info(f"Step 4/7: Creating 3D geometry for {unit_id_raw}...")
                polyhedron_wkt = create_3d_polyhedron_wkt(
                    footprint_2d=geographic_coords,
                    z_min=z_min,
                    z_max=z_max,
                )

                # Calculate accurate geodesic area
                carpet_area_sqm = calculate_polygon_area_sqm(geographic_coords)
                volume_cum = carpet_area_sqm * floor_height

                # Step 5: Generate 3D ULPIN
                logger.info(f"Step 5/7: Generating 3D ULPIN for {unit_id_raw}...")
                ulpin_3d = generate_3d_ulpin(
                    base_2d_ulpin=base_2d_ulpin,
                    layer_type=layer_type.value,
                    z_min=z_min,
                    z_max=z_max,
                    unit_code=unit_id_raw,
                )

                # Map unit type
                unit_type_enum = self._map_unit_type_str(unit_type_str)

                # Step 6: Persist to PostGIS
                logger.info(f"Step 6/7: Persisting {unit_id_raw} to PostGIS...")
                new_unit = VerticalPropertyUnit(
                    id=uuid.uuid4(),
                    base_2d_ulpin=base_2d_ulpin,
                    ulpin_3d=ulpin_3d,
                    unit_number=unit_id_raw,
                    floor_level=floor_number,
                    unit_type=unit_type_enum,
                    layer_type=layer_type,
                    z_min=z_min,
                    z_max=z_max,
                    volume_cum=volume_cum,
                    carpet_area_sqm=carpet_area_sqm,
                    owner_name=owner_name or f"Owner-{unit_id_raw}",
                    rera_reg_no=rera_reg_no,
                    geom_3d=WKTElement(polyhedron_wkt, srid=4326),
                    is_clashing=False,
                    clash_details=None,
                )

                db.add(new_unit)
                db.flush()  # Get the ID without committing

                created_units.append({
                    "id": str(new_unit.id),
                    "ulpin_3d": ulpin_3d,
                    "unit_number": unit_id_raw,
                    "unit_type": unit_type_enum.value,
                    "carpet_area_sqm": carpet_area_sqm,
                    "volume_cum": volume_cum,
                    "z_min": z_min,
                    "z_max": z_max,
                })

                logger.info(f"✓ Created unit {ulpin_3d}")

            except Exception as e:
                logger.error(f"Failed to process unit {unit_id_raw}: {e}")
                errors.append({"unit_id": unit_id_raw, "error": str(e)})

        # Commit all units
        if created_units:
            db.commit()
            logger.info(f"Committed {len(created_units)} units to database")

        # Step 7: Run spatial clash detection
        logger.info("Step 7/7: Running spatial clash detection...")
        clashes = check_spatial_clashes(db=db)
        logger.info(f"Detected {len(clashes)} spatial conflicts")

        return {
            "status": "completed",
            "floor_number": floor_number,
            "units_created": len(created_units),
            "units_details": created_units,
            "clashes_detected": len(clashes),
            "clash_details": clashes,
            "errors": errors,
            "message": f"Successfully created {len(created_units)} units on floor {floor_number}",
        }

    def ingest_ml_building_inventory(
        self,
        db: Session,
        inventory_record: dict,
        base_2d_ulpin: str = "14KA8829103841",
        base_elevation_amsl: float = 920.0,
        anchor_lon: float = 77.5946,
        anchor_lat: float = 12.9716,
    ) -> VerticalPropertyUnit:
        """
        Ingest a single ML LiDAR/Drone 3D Building Inventory record,
        construct its geographic 3D polyhedron, and persist to PostGIS.

        Parameters
        ----------
        db : Session
            SQLAlchemy database session.
        inventory_record : dict
            Teammate's ML LiDAR building output dictionary.
        base_2d_ulpin : str
            Base surface parcel 2D ULPIN.
        base_elevation_amsl : float
            Ground datum in metres AMSL.
        anchor_lon, anchor_lat : float
            Base geographic anchor coordinates.
        """
        ulpin_id = inventory_record.get("ULPIN_ID") or inventory_record.get("ulpin_3d")
        scene_id = inventory_record.get("Scene_ID", 1)
        building_id = inventory_record.get("Building_ID", 1)
        cx = inventory_record.get("Centroid_X", 0.0)
        cy = inventory_record.get("Centroid_Y", 0.0)
        footprint_area = inventory_record.get("Footprint_Area_m2", 72.27)
        bldg_height = inventory_record.get("Building_Height_m", 4.28)
        bldg_volume = inventory_record.get("Building_Volume_m3", round(footprint_area * bldg_height, 2))
        roof_area = inventory_record.get("Roof_Area_m2", round(footprint_area * 0.9, 2))
        roof_height = inventory_record.get("Roof_Height_m", 1.85)
        point_count = inventory_record.get("Point_Count", 1013)
        roof_point_count = inventory_record.get("Roof_Point_Count", 455)
        estimated_floors = inventory_record.get("Estimated_Floors", 1)
        building_type = inventory_record.get("Building_Type", "Low-rise")
        usable_roof_area = inventory_record.get("Usable_Roof_Area_m2", round(roof_area * 0.75, 2))
        solar_capacity = inventory_record.get("Estimated_Solar_Capacity_kW", round(usable_roof_area * 0.1, 2))
        data_status = inventory_record.get("Data_Status", "3D_inventory_only")
        solar_available = inventory_record.get("Solar_Data_Available", True)

        # Convert local centroid (metres) & footprint area to EPSG:4326 bounding box
        # ~111,320m per degree lat, ~108,500m per degree lon in Bangalore (12.97°N)
        side_m = (footprint_area ** 0.5) if footprint_area > 0 else 8.5
        half_side = side_m / 2.0
        deg_lat = 1.0 / 111320.0
        deg_lon = 1.0 / (111320.0 * 0.9745)

        center_lon = anchor_lon + (cx * deg_lon)
        center_lat = anchor_lat + (cy * deg_lat)

        half_w_deg = half_side * deg_lon
        half_h_deg = half_side * deg_lat

        footprint_2d = [
            (center_lon - half_w_deg, center_lat - half_h_deg),
            (center_lon + half_w_deg, center_lat - half_h_deg),
            (center_lon + half_w_deg, center_lat + half_h_deg),
            (center_lon - half_w_deg, center_lat + half_h_deg),
            (center_lon - half_w_deg, center_lat - half_h_deg),
        ]

        z_min = base_elevation_amsl
        z_max = round(base_elevation_amsl + bldg_height, 2)

        polyhedron_wkt = create_3d_polyhedron_wkt(
            footprint_2d=footprint_2d,
            z_min=z_min,
            z_max=z_max,
        )

        ulpin_3d = generate_3d_ulpin(
            base_2d_ulpin=base_2d_ulpin,
            layer_type="A",
            z_min=z_min,
            z_max=z_max,
            unit_code=ulpin_id,
        )

        # Upsert or create
        existing = db.query(VerticalPropertyUnit).filter(
            (VerticalPropertyUnit.ulpin_id == ulpin_id) | (VerticalPropertyUnit.ulpin_3d == ulpin_3d)
        ).first()

        if existing:
            unit = existing
            unit.building_type = building_type
            unit.building_height_m = bldg_height
            unit.building_volume_m3 = bldg_volume
            unit.footprint_area_m2 = footprint_area
            unit.roof_area_m2 = roof_area
            unit.roof_height_m = roof_height
            unit.usable_roof_area_m2 = usable_roof_area
            unit.estimated_solar_kw = solar_capacity
            unit.estimated_floors = estimated_floors
            unit.point_count = point_count
            unit.roof_point_count = roof_point_count
            unit.data_status = data_status
            unit.solar_available = solar_available
        else:
            unit = VerticalPropertyUnit(
                id=uuid.uuid4(),
                base_2d_ulpin=base_2d_ulpin,
                ulpin_3d=ulpin_3d,
                unit_number=f"Building-{ulpin_id}",
                floor_level=1,
                unit_type=UnitType.RESIDENTIAL,
                layer_type=LayerType.A,
                z_min=z_min,
                z_max=z_max,
                volume_cum=bldg_volume,
                carpet_area_sqm=footprint_area,
                owner_name="Karnataka Housing Board",
                rera_reg_no="PRM/KA/RERA/1251/310/PR/260824/005124",
                is_clashing=False,
                clash_details=None,
                geom_3d=WKTElement(polyhedron_wkt, srid=4326),
                ulpin_id=ulpin_id,
                scene_id=scene_id,
                building_id=building_id,
                building_type=building_type,
                building_height_m=bldg_height,
                building_volume_m3=bldg_volume,
                footprint_area_m2=footprint_area,
                roof_area_m2=roof_area,
                roof_height_m=roof_height,
                usable_roof_area_m2=usable_roof_area,
                estimated_solar_kw=solar_capacity,
                estimated_floors=estimated_floors,
                point_count=point_count,
                roof_point_count=roof_point_count,
                data_status=data_status,
                solar_available=solar_available,
            )
            db.add(unit)

        db.commit()
        db.refresh(unit)
        return unit


# Singleton instance
ingestion_service = IngestionService()
