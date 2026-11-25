"""
Mock ML Computer Vision Microservice for SIH 2026.

Simulates the ML teammate's YOLOv8 + SAM segmentation engine.
Runs on port 8001 as a standalone FastAPI service.

Endpoints:
- GET /health: Service status
- POST /api/ml/extract-building: Extract building footprint from drone imagery
- POST /api/ml/segment-floorplan: Segment floor plan into individual units
"""

import logging
import random
import uuid
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="3D ULPIN ML Engine (Mock)",
    version="0.1.0",
    description="Simulated ML microservice for building extraction and floor plan segmentation",
)

# Allow CORS from main backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Response Models -----------------------------------------------------------
class HealthResponse(BaseModel):
    status: str
    models_loaded: list[str]
    version: str


class BuildingExtractionResponse(BaseModel):
    building_id: str
    footprint_polygon: list[list[float]]  # [[lon, lat], ...]
    base_elevation_amsl: float
    total_height_m: float
    estimated_floor_count: int
    confidence_score: float


class UnitSegment(BaseModel):
    unit_id: str
    unit_type: str
    relative_polygon: list[list[float]]  # [[x, y], ...] in normalized or metric coordinates
    estimated_area_sqm: float
    confidence_score: float


class FloorplanSegmentationResponse(BaseModel):
    floor_number: int
    units: list[UnitSegment]
    total_units_detected: int
    processing_time_ms: int


# --- Endpoints -----------------------------------------------------------------
@app.get("/health", response_model=HealthResponse)
def health_check():
    """ML Engine health check."""
    return HealthResponse(
        status="ML Engine Active",
        models_loaded=["YOLOv8-Footprint", "SAM-FloorParser"],
        version="0.1.0",
    )


@app.post("/api/ml/extract-building", response_model=BuildingExtractionResponse)
async def extract_building(
    file: UploadFile = File(...),
    reference_lat: Optional[float] = Form(None),
    reference_lon: Optional[float] = Form(None),
):
    """
    Extract building footprint from drone/satellite imagery.

    Returns a simulated rectangular footprint centered around reference coordinates.
    In production, this would run YOLOv8 + instance segmentation on GeoTIFF/orthomosaic.
    """
    logger.info(f"Processing building extraction from {file.filename}")

    # Read file bytes (simulated - in production this would be processed by CV model)
    contents = await file.read()
    file_size_kb = len(contents) / 1024

    if file_size_kb > 50000:  # 50 MB limit
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image file too large (max 50 MB)",
        )

    # Use reference coordinates or default to Bangalore CBD
    lat = reference_lat or 12.9716
    lon = reference_lon or 77.5946

    # Simulate building footprint detection
    # Generate a realistic rectangular building ~30m x 40m
    offset_lon = 0.00015  # ~15-20m in longitude
    offset_lat = 0.00012  # ~15-20m in latitude

    footprint = [
        [lon - offset_lon, lat - offset_lat],
        [lon + offset_lon, lat - offset_lat],
        [lon + offset_lon, lat + offset_lat],
        [lon - offset_lon, lat + offset_lat],
        [lon - offset_lon, lat - offset_lat],  # Close the ring
    ]

    # Simulate elevation and height detection (from terrain + shadows/3D reconstruction)
    base_elevation = random.uniform(915.0, 925.0)  # AMSL in metres
    total_height = random.uniform(15.0, 25.0)  # Building height in metres
    estimated_floors = int(total_height / 3.2) + 1  # Assume ~3.2m per floor

    building_id = str(uuid.uuid4())[:8]

    logger.info(
        f"Detected building {building_id}: {estimated_floors} floors, "
        f"{total_height:.1f}m height at {lat:.6f}, {lon:.6f}"
    )

    return BuildingExtractionResponse(
        building_id=building_id,
        footprint_polygon=footprint,
        base_elevation_amsl=base_elevation,
        total_height_m=total_height,
        estimated_floor_count=estimated_floors,
        confidence_score=random.uniform(0.88, 0.97),
    )


@app.post("/api/ml/segment-floorplan", response_model=FloorplanSegmentationResponse)
async def segment_floorplan(
    file: UploadFile = File(...),
    floor_number: int = Form(...),
    building_width_m: Optional[float] = Form(30.0),
    building_depth_m: Optional[float] = Form(40.0),
):
    """
    Segment an architectural floor plan into individual property units.

    In production, this would:
    1. Parse PDF/DXF/PNG floor plan
    2. Run SAM (Segment Anything Model) or custom instance segmentation
    3. Classify units (residential, commercial, common area) using a classifier head
    4. Extract polygon boundaries and compute areas

    For the mock, we generate 4 realistic residential flats + 1 lobby/common area.
    """
    logger.info(f"Processing floor plan segmentation: {file.filename}, floor {floor_number}")

    # Read file bytes
    contents = await file.read()
    file_size_kb = len(contents) / 1024

    if file_size_kb > 10000:  # 10 MB limit for floor plans
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Floor plan file too large (max 10 MB)",
        )

    # Validate file type (simulated - production would use proper parsers)
    filename_lower = file.filename.lower() if file.filename else ""
    valid_extensions = [".png", ".jpg", ".jpeg", ".pdf", ".dxf"]
    if not any(filename_lower.endswith(ext) for ext in valid_extensions):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid file type. Supported: {', '.join(valid_extensions)}",
        )

    # Simulate processing time
    processing_time_ms = random.randint(800, 2500)

    # Generate simulated unit segments
    # Layout: 4 flats (2x2 grid) + 1 central lobby
    units = []

    # Flat-001: Bottom-left quadrant
    units.append(
        UnitSegment(
            unit_id=f"Flat-{floor_number}01",
            unit_type="RESIDENTIAL",
            relative_polygon=[
                [0.0, 0.0],
                [building_width_m / 2 - 1.0, 0.0],
                [building_width_m / 2 - 1.0, building_depth_m / 2 - 1.0],
                [0.0, building_depth_m / 2 - 1.0],
                [0.0, 0.0],
            ],
            estimated_area_sqm=random.uniform(85.0, 95.0),
            confidence_score=random.uniform(0.91, 0.98),
        )
    )

    # Flat-002: Bottom-right quadrant
    units.append(
        UnitSegment(
            unit_id=f"Flat-{floor_number}02",
            unit_type="RESIDENTIAL",
            relative_polygon=[
                [building_width_m / 2 + 1.0, 0.0],
                [building_width_m, 0.0],
                [building_width_m, building_depth_m / 2 - 1.0],
                [building_width_m / 2 + 1.0, building_depth_m / 2 - 1.0],
                [building_width_m / 2 + 1.0, 0.0],
            ],
            estimated_area_sqm=random.uniform(88.0, 98.0),
            confidence_score=random.uniform(0.90, 0.97),
        )
    )

    # Flat-003: Top-left quadrant
    units.append(
        UnitSegment(
            unit_id=f"Flat-{floor_number}03",
            unit_type="RESIDENTIAL",
            relative_polygon=[
                [0.0, building_depth_m / 2 + 1.0],
                [building_width_m / 2 - 1.0, building_depth_m / 2 + 1.0],
                [building_width_m / 2 - 1.0, building_depth_m],
                [0.0, building_depth_m],
                [0.0, building_depth_m / 2 + 1.0],
            ],
            estimated_area_sqm=random.uniform(87.0, 96.0),
            confidence_score=random.uniform(0.89, 0.96),
        )
    )

    # Flat-004: Top-right quadrant
    units.append(
        UnitSegment(
            unit_id=f"Flat-{floor_number}04",
            unit_type="RESIDENTIAL",
            relative_polygon=[
                [building_width_m / 2 + 1.0, building_depth_m / 2 + 1.0],
                [building_width_m, building_depth_m / 2 + 1.0],
                [building_width_m, building_depth_m],
                [building_width_m / 2 + 1.0, building_depth_m],
                [building_width_m / 2 + 1.0, building_depth_m / 2 + 1.0],
            ],
            estimated_area_sqm=random.uniform(90.0, 99.0),
            confidence_score=random.uniform(0.92, 0.98),
        )
    )

    # Central lobby/corridor (common area)
    units.append(
        UnitSegment(
            unit_id=f"Lobby-{floor_number}",
            unit_type="COMMON_AREA",
            relative_polygon=[
                [building_width_m / 2 - 1.0, building_depth_m / 2 - 1.0],
                [building_width_m / 2 + 1.0, building_depth_m / 2 - 1.0],
                [building_width_m / 2 + 1.0, building_depth_m / 2 + 1.0],
                [building_width_m / 2 - 1.0, building_depth_m / 2 + 1.0],
                [building_width_m / 2 - 1.0, building_depth_m / 2 - 1.0],
            ],
            estimated_area_sqm=random.uniform(15.0, 20.0),
            confidence_score=random.uniform(0.85, 0.94),
        )
    )

    logger.info(f"Detected {len(units)} units on floor {floor_number}")

    return FloorplanSegmentationResponse(
        floor_number=floor_number,
        units=units,
        total_units_detected=len(units),
        processing_time_ms=processing_time_ms,
    )


# --- Entry Point ---------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    logger.info("Starting Mock ML Server on port 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
