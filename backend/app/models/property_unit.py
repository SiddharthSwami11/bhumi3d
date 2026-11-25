"""
VerticalPropertyUnit ORM model — the core entity of the 3D cadastre.

Each row represents a single volumetric unit inside a building
(flat, parking bay, stairwell, utility shaft, context building, metro tunnel, subterranean utility, etc.)
anchored to its parent land parcel via base_2d_ulpin and uniquely identified by ulpin_3d.
"""

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class UnitType(str, enum.Enum):
    RESIDENTIAL = "RESIDENTIAL"
    COMMERCIAL = "COMMERCIAL"
    COMMON_AREA = "COMMON_AREA"
    BASEMENT_PARKING = "BASEMENT_PARKING"
    UTILITY_CORRIDOR = "UTILITY_CORRIDOR"
    CONTEXT_PARCEL = "CONTEXT_PARCEL"


class LayerType(str, enum.Enum):
    ABOVE_GROUND = "A"
    SURFACE = "S"
    UNDERGROUND = "U"


class GrievanceStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    RESOLVED = "RESOLVED"


class VerticalPropertyUnit(Base):
    __tablename__ = "vertical_property_units"

    # Primary key
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )

    # Bhu-Aadhaar 14-character surface land parcel ID
    base_2d_ulpin = Column(String(14), index=True, nullable=False)

    # Unique 3D vertical identifier produced by ulpin_encoder
    ulpin_3d = Column(String(60), unique=True, index=True, nullable=False)

    # Human-readable unit label
    unit_number = Column(String(255), nullable=False)

    # Signed floor index: -2 basement 2, -1 basement 1, 0 ground, 4 fourth floor, etc.
    floor_level = Column(Integer, nullable=False)

    unit_type = Column(Enum(UnitType), nullable=False)
    layer_type = Column(Enum(LayerType), nullable=False)

    # Elevation envelope (metres above ground baseline)
    z_min = Column(Float, nullable=False)
    z_max = Column(Float, nullable=False)

    # Derived / computed metrics
    volume_cum = Column(Float, nullable=True)
    carpet_area_sqm = Column(Float, nullable=True)

    # Subsurface / Strata easement attributes
    depth_below_ground_m = Column(Float, nullable=True)
    easement_type = Column(String(255), nullable=True)

    # Ownership (nullable — may be state owned / unregistered)
    owner_name = Column(String(255), nullable=True)
    owner_aadhaar_hash = Column(String(64), nullable=True)
    rera_reg_no = Column(String(100), nullable=True)

    # Spatial clash detection flags
    is_clashing = Column(Boolean, default=False, nullable=False)
    clash_details = Column(Text, nullable=True)

    # ML LiDAR & Drone 3D Building Inventory Attributes
    ulpin_id = Column(String(60), nullable=True, index=True)  # e.g., standardized 3D ULPIN or legacy ID
    building_name = Column(String(255), nullable=True)
    plot_number = Column(String(50), nullable=True)
    flat_number = Column(String(50), nullable=True)
    total_floors = Column(Integer, nullable=True)
    scene_id = Column(Integer, nullable=True)
    building_id = Column(Integer, nullable=True)
    building_type = Column(String(50), nullable=True, default="Low-rise")
    building_height_m = Column(Float, nullable=True)
    building_volume_m3 = Column(Float, nullable=True)
    footprint_area_m2 = Column(Float, nullable=True)
    roof_area_m2 = Column(Float, nullable=True)
    roof_height_m = Column(Float, nullable=True)
    usable_roof_area_m2 = Column(Float, nullable=True)
    estimated_solar_kw = Column(Float, nullable=True)
    estimated_floors = Column(Integer, nullable=True)
    point_count = Column(Integer, nullable=True)
    roof_point_count = Column(Integer, nullable=True)
    data_status = Column(String(50), nullable=True, default="3D_cadastre_verified")
    solar_available = Column(Boolean, default=True, nullable=True)

    # 3D geometry — polyhedral surface with Z, SRID 4326
    geom_3d = Column(
        Geometry(
            geometry_type="GEOMETRYZ",
            srid=4326,
            spatial_index=True,
        ),
        nullable=True,
    )

    def __repr__(self) -> str:
        return (
            f"<VerticalPropertyUnit("
            f"ulpin_3d={self.ulpin_3d!r}, "
            f"unit={self.unit_number!r}, "
            f"floor={self.floor_level})>"
        )


class GrievanceRecord(Base):
    """
    ORM Model for Citizen Grievances & Encroachment Complaints.

    Tracks citizen dispute submissions, target 3D ULPIN units, applicant metadata,
    adjudication status (PENDING, APPROVED, REJECTED, RESOLVED), and officer audit remarks.
    """
    __tablename__ = "grievance_records"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )

    ulpin_3d = Column(String(40), index=True, nullable=False)
    building_name = Column(String(100), nullable=True)
    plot_number = Column(String(50), nullable=True)
    flat_number = Column(String(50), nullable=True)

    citizen_name = Column(String(255), nullable=False)
    citizen_phone = Column(String(50), nullable=True)
    description = Column(Text, nullable=False)

    status = Column(
        Enum(GrievanceStatus),
        default=GrievanceStatus.PENDING,
        nullable=False,
        index=True,
    )

    officer_remarks = Column(Text, nullable=True)
    officer_id = Column(String(100), nullable=True)
    resolution_reason = Column(String(100), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    document_filename = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<GrievanceRecord("
            f"id={self.id!r}, "
            f"ulpin_3d={self.ulpin_3d!r}, "
            f"status={self.status!r})>"
        )

