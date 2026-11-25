"""
Pydantic schemas for VerticalPropertyUnit API operations.

Request/response models for creating, reading, and reporting on 3D property units.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class UnitCreate(BaseModel):
    """
    Request schema for creating a new vertical property unit.

    The footprint_coords define the 2D boundary polygon at ground level,
    which will be extruded vertically between z_min and z_max to form
    a 3D prismatic volume.
    """

    base_2d_ulpin: str = Field(
        ...,
        min_length=14,
        max_length=14,
        description="14-character Bhu-Aadhaar surface land parcel identifier",
    )

    footprint_coords: list[list[float]] = Field(
        ...,
        description=(
            "Closed polygon coordinates [[lon, lat], ...] in EPSG:4326. "
            "First and last points must match to close the ring."
        ),
    )

    unit_number: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Human-readable unit identifier (e.g., 'Flat-402', 'B1-Parking-04')",
    )

    floor_level: int = Field(
        ...,
        description="Signed floor index: -2 = 2nd basement, 0 = ground, 4 = 4th floor",
    )

    unit_type: str = Field(
        ...,
        description=(
            "One of: RESIDENTIAL, COMMERCIAL, COMMON_AREA, "
            "BASEMENT_PARKING, UTILITY_CORRIDOR, CONTEXT_PARCEL"
        ),
    )

    layer_type: str = Field(
        ...,
        description="Layer classification: 'A' (above ground), 'S' (surface), 'U' (underground)",
    )

    z_min: float = Field(
        ...,
        description="Base elevation in metres above mean sea level (AMSL)",
    )

    z_max: float = Field(
        ...,
        description="Ceiling elevation in metres AMSL",
    )

    # Subsurface / Strata easement attributes
    depth_below_ground_m: Optional[float] = Field(
        None,
        description="Subsurface depth below surface level in metres (positive float)",
    )
    easement_type: Optional[str] = Field(
        None,
        max_length=100,
        description="Subterranean easement type (e.g. 'Metro Transit Right-of-Way', 'Basement Parking C-Bay')",
    )

    owner_name: Optional[str] = Field(
        None,
        max_length=255,
        description="Owner's legal name (nullable for state-owned or unregistered units)",
    )

    owner_aadhaar_hash: Optional[str] = Field(
        None,
        max_length=64,
        description="SHA-256 hash of owner's Aadhaar number for privacy",
    )

    rera_reg_no: Optional[str] = Field(
        None,
        max_length=100,
        description="Real Estate Regulatory Authority registration number",
    )

    # ML LiDAR & Solar Inventory extensions
    ulpin_id: Optional[str] = None
    building_name: Optional[str] = None
    plot_number: Optional[str] = None
    flat_number: Optional[str] = None
    total_floors: Optional[int] = None
    scene_id: Optional[int] = None
    building_id: Optional[int] = None
    building_type: Optional[str] = "Low-rise"
    building_height_m: Optional[float] = None
    building_volume_m3: Optional[float] = None
    footprint_area_m2: Optional[float] = None
    roof_area_m2: Optional[float] = None
    roof_height_m: Optional[float] = None
    usable_roof_area_m2: Optional[float] = None
    estimated_solar_kw: Optional[float] = None
    estimated_floors: Optional[int] = None
    point_count: Optional[int] = None
    roof_point_count: Optional[int] = None
    data_status: Optional[str] = "3D_cadastre_verified"
    solar_available: Optional[bool] = True

    @field_validator("footprint_coords")
    @classmethod
    def validate_closed_ring(cls, v: list[list[float]]) -> list[list[float]]:
        """Ensure the polygon forms a closed ring."""
        if len(v) < 4:
            raise ValueError("Polygon must have at least 4 coordinates (3 vertices + closing point)")

        if v[0] != v[-1]:
            raise ValueError(
                f"First and last coordinates must match to close the ring. "
                f"Got first={v[0]}, last={v[-1]}"
            )

        return v

    @field_validator("z_max")
    @classmethod
    def validate_z_order(cls, v: float, info) -> float:
        """Ensure z_max > z_min."""
        z_min = info.data.get("z_min")
        if z_min is not None and v <= z_min:
            raise ValueError(f"z_max ({v}) must be greater than z_min ({z_min})")
        return v


class UnitResponse(BaseModel):
    """
    Response schema for a single vertical property unit.

    Includes all database fields plus computed geometry metrics.
    """

    id: UUID
    base_2d_ulpin: str
    ulpin_3d: str
    unit_number: str
    floor_level: int
    unit_type: str
    layer_type: str
    z_min: float
    z_max: float
    volume_cum: Optional[float] = Field(
        None,
        description="Computed volume in cubic metres",
    )
    carpet_area_sqm: Optional[float] = Field(
        None,
        description="Footprint area in square metres",
    )
    depth_below_ground_m: Optional[float] = None
    easement_type: Optional[str] = None
    owner_name: Optional[str] = None
    owner_aadhaar_hash: Optional[str] = None
    rera_reg_no: Optional[str] = None
    is_clashing: bool
    clash_details: Optional[str] = None

    # ML LiDAR & Solar Inventory Extensions
    ulpin_id: Optional[str] = None
    building_name: Optional[str] = None
    plot_number: Optional[str] = None
    flat_number: Optional[str] = None
    floor_number: Optional[int] = None
    total_floors: Optional[int] = None
    scene_id: Optional[int] = None
    building_id: Optional[int] = None
    building_type: Optional[str] = None
    building_height_m: Optional[float] = None
    building_volume_m3: Optional[float] = None
    footprint_area_m2: Optional[float] = None
    roof_area_m2: Optional[float] = None
    roof_height_m: Optional[float] = None
    usable_roof_area_m2: Optional[float] = None
    estimated_solar_kw: Optional[float] = None
    estimated_floors: Optional[int] = None
    point_count: Optional[int] = None
    roof_point_count: Optional[int] = None
    data_status: Optional[str] = None
    solar_available: Optional[bool] = True

    class Config:
        from_attributes = True


class ClashPair(BaseModel):
    """A pair of units with detected 3D spatial overlap."""

    ulpin_3d_a: str
    unit_number_a: str
    floor_level_a: int

    ulpin_3d_b: str
    unit_number_b: str
    floor_level_b: int

    overlap_description: str = Field(
        description="Human-readable description of the spatial conflict",
    )


class ClashReportResponse(BaseModel):
    """
    Complete clash detection report.

    Returns all detected 3D spatial conflicts between property units.
    """

    total_units_checked: int
    clash_count: int
    clashing_units: list[UnitResponse]
    clash_pairs: list[ClashPair]


class GeoJSONFeature(BaseModel):
    """Single 3D GeoJSON feature for a property unit."""

    type: str = "Feature"
    geometry: dict = Field(
        description="3D geometry in GeoJSON format (e.g., Polygon with Z coordinates)",
    )
    properties: dict = Field(
        description="Unit metadata (ulpin_3d, unit_number, owner, etc.)",
    )


class GeoJSONFeatureCollection(BaseModel):
    """3D GeoJSON FeatureCollection for visualization in Cesium/deck.gl."""

    type: str = "FeatureCollection"
    features: list[GeoJSONFeature]


class UnitUpdateAdmin(BaseModel):
    """
    Schema for Cadastral Officer administrative update of property unit attributes.
    """

    owner_name: Optional[str] = Field(None, max_length=255)
    owner_aadhaar_hash: Optional[str] = Field(None, max_length=64)
    rera_reg_no: Optional[str] = Field(None, max_length=100)
    layer_type: Optional[str] = None
    building_type: Optional[str] = None
    unit_type: Optional[str] = None
    carpet_area_sqm: Optional[float] = None
    depth_below_ground_m: Optional[float] = None
    easement_type: Optional[str] = None
    notes: Optional[str] = None
    data_status: Optional[str] = None


class DisputeResolutionRequest(BaseModel):
    """
    Schema for legally resolving an active 3D volumetric dispute or boundary encroachment.
    """

    ulpin_3d: str = Field(..., description="Target 3D ULPIN hash of the disputed unit")
    resolution_action: str = Field(
        ...,
        description=(
            "One of: DEMOLITION_ORDERED, REGULARIZED_PENALTY_PAID, "
            "DEED_RECTIFIED, FALSE_POSITIVE_OVERRIDE"
        ),
    )
    resolution_notes: str = Field(..., description="Legal rationale / surveyor remarks")
    resolved_by: str = Field(
        default="Admin Officer ID #KA-BLR-04",
        description="Official ID or badge of the Cadastral Officer",
    )


class DisputeResolutionResponse(BaseModel):
    """Response returned after resolving a 3D cadastral dispute."""

    success: bool
    ulpin_3d: str
    message: str
    is_clashing: bool
    clash_details: Optional[str] = None
    data_status: Optional[str] = None


class GrievanceCreate(BaseModel):
    """Schema for lodging a citizen grievance / encroachment dispute."""

    ulpin_3d: str = Field(..., description="Target 3D ULPIN hash of the unit")
    building_name: Optional[str] = Field(None, description="Building name (e.g. 'Kasturba Heritage Residency')")
    plot_number: Optional[str] = Field(None, description="Land plot identifier (e.g. 'PLOT-104')")
    flat_number: Optional[str] = Field(None, description="Flat or unit identifier (e.g. 'F2-01')")
    citizen_name: str = Field(default="Citizen Applicant", min_length=2, max_length=255, description="Full name of applicant")
    citizen_phone: Optional[str] = Field(default="9876543210", max_length=50, description="Contact phone number")
    description: str = Field(..., min_length=5, description="Detailed description of encroachment / grievance (minimum 5 characters)")


class GrievanceActionRequest(BaseModel):
    """Schema for Cadastral Officer grievance adjudication action."""

    action: str = Field(..., description="'APPROVE' (Flag Conflict) or 'REJECT' (Dismiss)")
    officer_remarks: Optional[str] = Field(
        default="Cadastral officer audit review and verification completed.",
        description="Officer audit notes",
    )
    officer_id: Optional[str] = Field(
        default="Admin Officer ID #KA-BLR-04",
        description="Official ID or badge of the Cadastral Officer",
    )


class GrievanceResolveRequest(BaseModel):
    """Schema for resolving an approved grievance / dispute with official orders and audit logs."""

    resolution_reason: str = Field(
        ...,
        description="Reason for dispute resolution (e.g. 'Boundary Regularization', 'Deed Rectification')",
    )
    resolution_notes: Optional[str] = Field(
        default="Dispute resolved and regularized under Cadastral Act 2026.",
        description="Adjudicator resolution notes",
    )
    officer_id: Optional[str] = Field(
        default="Admin Officer ID #KA-BLR-04",
        description="Official ID or badge of the Cadastral Officer",
    )
    document_filename: Optional[str] = Field(
        None,
        description="Name of uploaded certified proof document (PDF, PNG, JPG, CAD)",
    )


class GrievanceResponse(BaseModel):
    """Response schema for a citizen grievance record."""

    id: UUID
    ulpin_3d: str
    building_name: Optional[str] = None
    plot_number: Optional[str] = None
    flat_number: Optional[str] = None
    citizen_name: str
    citizen_phone: Optional[str] = None
    description: str
    status: str
    officer_remarks: Optional[str] = None
    officer_id: Optional[str] = None
    resolution_reason: Optional[str] = None
    resolution_notes: Optional[str] = None
    document_filename: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PendingGrievanceCountResponse(BaseModel):
    """Response schema for pending grievances count."""

    pending_count: int


class SubdividedUnitCreate(BaseModel):
    """Schema for each unit in a floor subdivision request."""

    flat_number: str = Field(..., min_length=1, max_length=50, description="Flat or unit identifier (e.g. 'F2-01')")
    owner_name: str = Field(..., min_length=1, max_length=255, description="Full name of title holder")
    owner_age: Optional[int] = Field(None, ge=18, le=120, description="Age of title holder")
    owner_phone: Optional[str] = Field(None, max_length=50, description="Contact phone number")
    carpet_area_sqft: float = Field(..., gt=0, description="Carpet area in square feet")
    usage_type: str = Field(default="RESIDENTIAL", description="RESIDENTIAL, COMMERCIAL, or UTILITY_CORRIDOR")


class FloorSubdivideRequest(BaseModel):
    """Schema for Cadastral Officer floor subdivision / stratification request."""

    building_name: Optional[str] = Field(None, description="Building name (e.g. 'Kasturba Heritage Residency')")
    plot_number: Optional[str] = Field(None, description="Plot identifier (e.g. 'PLOT-104')")
    base_2d_ulpin: Optional[str] = Field(None, description="14-char Base 2D ULPIN")
    floor_level: int = Field(..., description="Target floor index, e.g., 0, 1, 2, -1, -2")
    units: list[SubdividedUnitCreate] = Field(..., min_length=2, max_length=8, description="List of 2 to 8 subdivided unit deeds")


class FloorSubdivideResponse(BaseModel):
    """Response schema after committing 3D floor subdivision."""

    success: bool
    message: str
    building_name: str
    floor_level: int
    created_units_count: int
    created_units: list[UnitResponse]



