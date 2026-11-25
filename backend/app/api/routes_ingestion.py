"""
FastAPI REST API routes for automated architectural floor plan and imagery ingestion.

Endpoints:
- POST /api/ingestion/upload-floorplan       : Ingest floor plan, run ML segmentation, mint 3D ULPINs
- POST /api/ingestion/upload-building-imagery: Ingest drone imagery, extract building footprint
- GET  /api/ingestion/ml-status              : Check health of ML microservice
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.ingestion_service import ingestion_service
from app.services.ml_client import ml_client

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/ingestion",
    tags=["Automated Ingestion & ML Pipeline"],
)


# --- Response Schemas ----------------------------------------------------------
class MLStatusResponse(BaseModel):
    status: str
    models_loaded: list[str]
    version: Optional[str] = None
    error: Optional[str] = None


class BuildingImageryResponse(BaseModel):
    building_id: str
    footprint_polygon: list[list[float]]
    base_elevation_amsl: float
    total_height_m: float
    estimated_floor_count: int
    confidence_score: float
    message: str


class FloorplanIngestionResponse(BaseModel):
    status: str
    floor_number: int
    units_created: int
    units_details: list[dict]
    clashes_detected: int
    clash_details: list[dict]
    errors: list[dict]
    message: str


# --- Endpoints -----------------------------------------------------------------
@router.get("/ml-status", response_model=MLStatusResponse)
async def get_ml_status():
    """
    Check if the ML microservice is online and inspect loaded models.
    """
    health = await ml_client.check_health()
    return MLStatusResponse(
        status=health.get("status", "Unknown"),
        models_loaded=health.get("models_loaded", []),
        version=health.get("version"),
        error=health.get("error"),
    )


@router.post("/upload-building-imagery", response_model=BuildingImageryResponse)
async def upload_building_imagery(
    file: UploadFile = File(..., description="Drone orthomosaic or GeoTIFF image"),
    reference_lat: Optional[float] = Form(None, description="Approximate latitude"),
    reference_lon: Optional[float] = Form(None, description="Approximate longitude"),
):
    """
    Upload drone / satellite imagery to extract 2D building footprint and elevation profile.
    """
    try:
        contents = await file.read()
        result = await ml_client.extract_building_from_imagery(
            file_bytes=contents,
            filename=file.filename or "imagery.png",
            reference_lat=reference_lat,
            reference_lon=reference_lon,
        )

        return BuildingImageryResponse(
            building_id=result.get("building_id", "bldg-default"),
            footprint_polygon=result.get("footprint_polygon", []),
            base_elevation_amsl=result.get("base_elevation_amsl", 920.0),
            total_height_m=result.get("total_height_m", 16.0),
            estimated_floor_count=result.get("estimated_floor_count", 5),
            confidence_score=result.get("confidence_score", 0.90),
            message="Building footprint extracted successfully",
        )
    except Exception as e:
        logger.error(f"Building imagery processing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process building imagery: {str(e)}",
        )


@router.post("/upload-floorplan", response_model=FloorplanIngestionResponse)
async def upload_floorplan(
    file: UploadFile = File(..., description="Architectural floor plan (.png, .jpg, .pdf, .dxf)"),
    base_2d_ulpin: str = Form(..., description="Base 2D surface parcel ULPIN (e.g. '14KA8829103841')"),
    floor_number: int = Form(..., description="Floor level (-1=Basement, 0=Ground, 1..N=Floors)"),
    base_elevation: float = Form(920.0, description="Base ground elevation AMSL in metres"),
    floor_height: float = Form(3.2, description="Floor height in metres"),
    building_width_m: float = Form(30.0, description="Estimated building width in metres"),
    building_depth_m: float = Form(40.0, description="Estimated building depth in metres"),
    owner_name: Optional[str] = Form(None, description="Default owner name"),
    rera_reg_no: Optional[str] = Form(None, description="RERA registration number"),
    footprint_json: Optional[str] = Form(None, description="Custom building footprint JSON [[lon, lat], ...]"),
    db: Session = Depends(get_db),
):
    """
    Ingest an architectural floor plan, trigger ML segmentation, generate 3D volumetric units,
    mint unique 3D ULPINs, persist to PostGIS, and audit for spatial clashes.
    """
    try:
        # Default Bangalore CBD footprint if not provided
        if footprint_json:
            try:
                building_footprint = json.loads(footprint_json)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid footprint_json format. Expected JSON array of [[lon, lat], ...]",
                )
        else:
            # Standard Bangalore CBD parcel boundary (matching seed_data)
            building_footprint = [
                [77.5945, 12.9715],
                [77.5947, 12.9715],
                [77.5947, 12.9717],
                [77.5945, 12.9717],
                [77.5945, 12.9715],
            ]

        # Read floor plan file bytes
        contents = await file.read()

        # Run ingestion pipeline
        result = await ingestion_service.process_floorplan(
            db=db,
            file_bytes=contents,
            filename=file.filename or "floorplan.png",
            base_2d_ulpin=base_2d_ulpin.strip(),
            floor_number=floor_number,
            base_elevation=base_elevation,
            floor_height=floor_height,
            building_footprint=building_footprint,
            building_width_m=building_width_m,
            building_depth_m=building_depth_m,
            owner_name=owner_name,
            rera_reg_no=rera_reg_no,
        )

        return FloorplanIngestionResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Floor plan ingestion pipeline failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion pipeline failed: {str(e)}",
        )
