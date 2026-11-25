"""
Seed Data Script for 3D ULPIN System - City-Scale Multi-Building 3D Urban Cadastre Digital Twin.

Generates realistic 3D cadastre dataset for Bangalore CBD (77.5946°E, 12.9716°N):
- Target Parcel (KA010010420104 / PLOT-104): 5-Storey Residential Building ("Kasturba Heritage Residency")
  + B1/B2 Subsurface Basements + Flat-202X Disputed Mezzanine.
- 45 Street-Aligned Surrounding Buildings: 2-12 vertical storeys (3.2m/floor), rotated footprints (0°-135°),
  diverse typologies (Commercial Towers, Residential Enclaves, Tech Hubs, Civic Blocks, Mixed-Use),
  with authentic Indian title holders, RERA registrations, Aadhaar hashes, and ML LiDAR solar/roof metadata.

Run with:
    Set DATABASE_URL to the target PostgreSQL/PostGIS database, then run
    python backend/seed_data.py

The script uses the same environment-configured SQLAlchemy engine as the API.
"""

import math
import random
import sys
import uuid
from pathlib import Path

# Add app to Python path
sys.path.insert(0, str(Path(__file__).parent))

from geoalchemy2 import WKTElement
from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal, engine, init_db
from app.core.ulpin_encoder import generate_2d_base_ulpin, generate_3d_ulpin
from app.models.property_unit import LayerType, UnitType, VerticalPropertyUnit
from app.services.clash_detector import check_spatial_clashes
from app.services.geometry_service import (
    calculate_polygon_area_sqm,
    create_3d_polyhedron_wkt,
)

# =============================================================================
# CONSTANTS & GEODETIC DATUM
# =============================================================================

# Standardized 14-character Bhu-Aadhaar 2D Base ULPIN for Bangalore CBD Target Parcel
# State (KA) + District (01) + Tehsil (001) + Village (042) + Plot (0104)
BASE_2D_ULPIN = generate_2d_base_ulpin(state="KA", district="01", tehsil="001", village="042", plot="0104")
BASE_LON = 77.5946  # Bangalore CBD longitude (Vidhana Soudha / MG Road zone)
BASE_LAT = 12.9716  # Bangalore CBD latitude
FLOOR_HEIGHT = 3.2  # Standard floor height (metres)

# Target building footprint (~33m x 22m plot)
LON_OFFSET = 0.00030
LAT_OFFSET = 0.00020

BUILDING_FOOTPRINT = [
    (BASE_LON, BASE_LAT),
    (BASE_LON + LON_OFFSET, BASE_LAT),
    (BASE_LON + LON_OFFSET, BASE_LAT + LAT_OFFSET),
    (BASE_LON, BASE_LAT + LAT_OFFSET),
    (BASE_LON, BASE_LAT),
]

FLAT_FOOTPRINTS = {
    "NW": [
        (BASE_LON, BASE_LAT + LAT_OFFSET / 2),
        (BASE_LON + LON_OFFSET / 2, BASE_LAT + LAT_OFFSET / 2),
        (BASE_LON + LON_OFFSET / 2, BASE_LAT + LAT_OFFSET),
        (BASE_LON, BASE_LAT + LAT_OFFSET),
        (BASE_LON, BASE_LAT + LAT_OFFSET / 2),
    ],
    "NE": [
        (BASE_LON + LON_OFFSET / 2, BASE_LAT + LAT_OFFSET / 2),
        (BASE_LON + LON_OFFSET, BASE_LAT + LAT_OFFSET / 2),
        (BASE_LON + LON_OFFSET, BASE_LAT + LAT_OFFSET),
        (BASE_LON + LON_OFFSET / 2, BASE_LAT + LAT_OFFSET),
        (BASE_LON + LON_OFFSET / 2, BASE_LAT + LAT_OFFSET / 2),
    ],
    "SW": [
        (BASE_LON, BASE_LAT),
        (BASE_LON + LON_OFFSET / 2, BASE_LAT),
        (BASE_LON + LON_OFFSET / 2, BASE_LAT + LAT_OFFSET / 2),
        (BASE_LON, BASE_LAT + LAT_OFFSET / 2),
        (BASE_LON, BASE_LAT),
    ],
    "SE": [
        (BASE_LON + LON_OFFSET / 2, BASE_LAT),
        (BASE_LON + LON_OFFSET, BASE_LAT),
        (BASE_LON + LON_OFFSET, BASE_LAT + LAT_OFFSET / 2),
        (BASE_LON + LON_OFFSET / 2, BASE_LAT + LAT_OFFSET / 2),
        (BASE_LON + LON_OFFSET / 2, BASE_LAT),
    ],
}

RESIDENTIAL_OWNERS = [
    "Rajesh Kumar", "Priya Sharma", "Anil Patel", "Sunita Reddy", "Vikram Singh",
    "Meera Iyer", "Suresh Nair", "Lakshmi Rao", "Arjun Desai", "Kavita Joshi",
    "Rohan Gupta", "Deepa Menon", "Nikhil Verma", "Ananya Hegde", "Gautam Pillai",
    "Siddharth Rao", "Pooja Hegde", "Vivek Murthy", "Shweta Kulkarni", "Karan Malhotra",
    "Dr. Arvind Swamy", "Nandini Ramaswamy", "Aditya Chandrasekhar", "Tanvi Bhat",
    "Harish Venkatesh", "Divya Raghavan", "Manish Kothari", "Radhika Shenoy",
    "Bhavana Murugesan", "Tarun Nambiar", "Aparna Kasturi", "Pranav Deshmukh"
]

COMMERCIAL_TENANTS = [
    "Tata Consultancy Services", "Infosys Digital Lab", "Wipro Ventures",
    "HDFC Bank Zonal Office", "Cognizant Technology Solutions", "Razorpay HQ",
    "Zerodha Tech Wing", "Swiggy Engineering", "Flipkart Commercial Hub",
    "Titan Company Ltd", "PhonePe Fintech Lab", "Goldman Sachs Tech",
    "Prestige Estates Projects Ltd", "Brigade Enterprises HQ", "Sobha Developers",
    "KPMG India Tech Hub", "Deloitte Cyber Operations", "Bosch India Innovation Center",
    "Amazon Development Center", "Oracle India Regional HQ", "Cisco Systems India",
    "Morgan Stanley Global Tech", "Ather Energy R&D", "Ola Electric Mobility Labs",
    "Canara Bank Corporate Office", "State Bank of India LHO", "L&T Infotech Hub",
    "Mindtree Global Village", "Mphasis Digital Solutions", "Biocon Innovation Wing"
]


# =============================================================================
# GEOMETRY & ROTATION HELPERS
# =============================================================================

def rotate_polygon(coords: list[tuple[float, float]], angle_deg: float) -> list[tuple[float, float]]:
    """
    Rotate a 2D polygon footprint around its centroid by angle_deg.

    Preserves closed polygon ring topology.
    """
    if angle_deg == 0.0:
        return coords

    # Exclude repeated last coordinate for centroid
    ring = coords[:-1] if (coords[0] == coords[-1] and len(coords) > 1) else coords
    cx = sum(p[0] for p in ring) / len(ring)
    cy = sum(p[1] for p in ring) / len(ring)

    rad = math.radians(angle_deg)
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)

    rotated = []
    for x, y in ring:
        dx = x - cx
        dy = y - cy
        rx = cx + (dx * cos_a - dy * sin_a)
        ry = cy + (dx * sin_a + dy * cos_a)
        rotated.append((round(rx, 7), round(ry, 7)))

    rotated.append(rotated[0])
    return rotated


def create_linear_corridor_polygon(
    p1: tuple[float, float],
    p2: tuple[float, float],
    width_m: float = 6.0,
) -> list[tuple[float, float]]:
    """
    Generate a 2D rectangular corridor polygon between two geodetic points with width_m.
    """
    lon1, lat1 = p1
    lon2, lat2 = p2

    meters_per_deg_lat = 111000.0
    meters_per_deg_lon = 111000.0 * math.cos(math.radians((lat1 + lat2) / 2.0))

    d_lon = lon2 - lon1
    d_lat = lat2 - lat1
    len_m = math.sqrt((d_lon * meters_per_deg_lon) ** 2 + (d_lat * meters_per_deg_lat) ** 2)

    if len_m < 1e-6:
        half_w = (width_m / 2.0) / meters_per_deg_lat
        return [
            (lon1 - half_w, lat1 - half_w),
            (lon1 + half_w, lat1 - half_w),
            (lon1 + half_w, lat1 + half_w),
            (lon1 - half_w, lat1 + half_w),
            (lon1 - half_w, lat1 - half_w),
        ]

    # Unit normal vector
    tx = (d_lon * meters_per_deg_lon) / len_m
    ty = (d_lat * meters_per_deg_lat) / len_m
    nx = -ty
    ny = tx

    off_lon = (nx * (width_m / 2.0)) / meters_per_deg_lon
    off_lat = (ny * (width_m / 2.0)) / meters_per_deg_lat

    return [
        (round(lon1 - off_lon, 7), round(lat1 - off_lat, 7)),
        (round(lon2 - off_lon, 7), round(lat2 - off_lat, 7)),
        (round(lon2 + off_lon, 7), round(lat2 + off_lat, 7)),
        (round(lon1 + off_lon, 7), round(lat1 + off_lat, 7)),
        (round(lon1 - off_lon, 7), round(lat1 - off_lat, 7)),
    ]


def clear_existing_data(db):
    """Delete all existing property units."""
    db.query(VerticalPropertyUnit).delete()
    db.commit()
    print("[CLEAR] Existing property units database cleared.")


def create_unit(
    db,
    base_ulpin: str,
    unit_number: str,
    footprint: list[tuple[float, float]],
    floor_level: int,
    z_min: float,
    z_max: float,
    unit_type: UnitType,
    layer_type: LayerType,
    owner_name: str = None,
    rera_reg_no: str = None,
    # Cadastral Identity Attributes
    building_name: str = None,
    plot_number: str = None,
    flat_number: str = None,
    total_floors: int = None,
    # Subsurface Strata Easement attributes
    depth_below_ground_m: float = None,
    easement_type: str = None,
    # ML LiDAR & Solar inventory attributes
    ulpin_id: str = None,
    scene_id: int = None,
    building_id: int = None,
    building_type: str = "Low-rise",
    building_height_m: float = None,
    roof_area_m2: float = None,
    usable_roof_area_m2: float = None,
    estimated_solar_kw: float = None,
    estimated_floors: int = None,
    point_count: int = None,
    roof_point_count: int = None,
    data_status: str = "3D_cadastre_verified",
    solar_available: bool = True,
):
    """Create a single vertical property unit and persist to PostgreSQL / PostGIS."""
    ulpin_3d = generate_3d_ulpin(
        base_2d_ulpin=base_ulpin,
        layer_type=layer_type.value,
        z_min=z_min,
        z_max=z_max,
        unit_code=flat_number or unit_number,
        floor_level=floor_level,
    )

    carpet_area = calculate_polygon_area_sqm(footprint)
    height = z_max - z_min
    volume = carpet_area * height

    polyhedron_wkt = create_3d_polyhedron_wkt(
        footprint_2d=footprint,
        z_min=z_min,
        z_max=z_max,
    )
    geom_3d_element = WKTElement(polyhedron_wkt, srid=4326)

    unit = VerticalPropertyUnit(
        id=uuid.uuid4(),
        base_2d_ulpin=base_ulpin,
        ulpin_3d=ulpin_3d,
        unit_number=unit_number,
        floor_level=floor_level,
        unit_type=unit_type,
        layer_type=layer_type,
        z_min=z_min,
        z_max=z_max,
        volume_cum=round(volume, 2),
        carpet_area_sqm=round(carpet_area, 2),
        depth_below_ground_m=depth_below_ground_m,
        easement_type=easement_type,
        owner_name=owner_name,
        rera_reg_no=rera_reg_no,
        is_clashing=False,
        clash_details=None,
        geom_3d=geom_3d_element,
        # Cadastral Identity Extensions
        building_name=building_name,
        plot_number=plot_number,
        flat_number=flat_number,
        total_floors=total_floors or estimated_floors or 1,
        # ML LiDAR & Solar Inventory Extensions (Defaults to standardized 3D ULPIN)
        ulpin_id=ulpin_id or ulpin_3d,
        scene_id=scene_id or 1,
        building_id=building_id or 1,
        building_type=building_type,
        building_height_m=building_height_m or round(height, 2),
        building_volume_m3=round(volume, 2),
        footprint_area_m2=round(carpet_area, 2),
        roof_area_m2=roof_area_m2 or round(carpet_area * 0.9, 2),
        roof_height_m=round(height * 0.3, 2),
        usable_roof_area_m2=usable_roof_area_m2 or round(carpet_area * 0.75, 2),
        estimated_solar_kw=estimated_solar_kw or round((carpet_area * 0.75) * 0.1, 2),
        estimated_floors=estimated_floors or total_floors or 1,
        point_count=point_count or random.randint(800, 1500),
        roof_point_count=roof_point_count or random.randint(300, 600),
        data_status=data_status,
        solar_available=solar_available,
    )

    db.add(unit)
    return unit


# =============================================================================
# 45 SURROUNDING CITY-SCALE BUILDINGS SPECIFICATION (Grid Spacing + Rotations)
# =============================================================================
# Clean ~95m x 120m street network grid with realistic setbacks (zero inter-building collisions)
# Base ULPINs generated deterministically with 14-char standard: KA010010420001..KA010010420045
CITY_BUILDINGS_SPEC = [
    # ── ROW 1: North Avenue (dy = +0.0022, MG Road / Vidhana Soudha Commercial) ──
    ("Prestige Cyber Tower", UnitType.COMMERCIAL, -0.0036, 0.0022, 0.00038, 0.00024, 10, 15.0, "KA010010420001"),
    ("Salarpuria Tech Plaza", UnitType.COMMERCIAL, -0.0027, 0.0022, 0.00036, 0.00022, 8, 20.0, "KA010010420002"),
    ("Kasturba Commerce Centre", UnitType.COMMERCIAL, -0.0018, 0.0022, 0.00038, 0.00024, 6, 0.0, "KA010010420003"),
    ("Canara Bank Apex Tower", UnitType.COMMERCIAL, -0.0009, 0.0022, 0.00042, 0.00026, 12, 10.0, "KA010010420004"),
    ("Vidhana Soudha Annex", UnitType.COMMERCIAL, 0.0000, 0.0022, 0.00040, 0.00026, 5, 0.0, "KA010010420005"),
    ("High Court Bar Chambers", UnitType.COMMERCIAL, 0.0009, 0.0022, 0.00035, 0.00022, 4, 15.0, "KA010010420006"),
    ("RMZ Infinity Heights", UnitType.COMMERCIAL, 0.0018, 0.0022, 0.00040, 0.00025, 11, -15.0, "KA010010420007"),
    ("Embassy Prime Commerce", UnitType.COMMERCIAL, 0.0027, 0.0022, 0.00042, 0.00026, 12, -20.0, "KA010010420008"),
    ("Godrej Platinum Living", UnitType.RESIDENTIAL, 0.0036, 0.0022, 0.00036, 0.00022, 8, -10.0, "KA010010420009"),

    # ── ROW 2: Kasturba & Cunningham Promenade (dy = +0.0011) ─────────────────
    ("Chancery Pavilion Annex", UnitType.COMMERCIAL, -0.0036, 0.0011, 0.00038, 0.00024, 7, 0.0, "KA010010420010"),
    ("Ali Asker Commercial Suites", UnitType.COMMERCIAL, -0.0027, 0.0011, 0.00036, 0.00022, 6, 25.0, "KA010010420011"),
    ("Cunningham Road Plaza", UnitType.COMMERCIAL, -0.0018, 0.0011, 0.00040, 0.00024, 9, 20.0, "KA010010420012"),
    ("Central Telegraph Office Wing", UnitType.COMMERCIAL, -0.0009, 0.0011, 0.00038, 0.00024, 6, 0.0, "KA010010420013"),
    ("General Post Office Arcade", UnitType.COMMERCIAL, 0.0000, 0.0011, 0.00040, 0.00025, 5, 0.0, "KA010010420014"),
    ("Cubbon View Executive Suites", UnitType.RESIDENTIAL, 0.0009, 0.0011, 0.00036, 0.00024, 7, 0.0, "KA010010420015"),
    ("Divyasree Greens Tech Hub", UnitType.COMMERCIAL, 0.0018, 0.0011, 0.00040, 0.00024, 7, 0.0, "KA010010420016"),
    ("Sterling Skyline Tower", UnitType.RESIDENTIAL, 0.0027, 0.0011, 0.00038, 0.00024, 9, 30.0, "KA010010420017"),
    ("Kasturba Greens Tower A", UnitType.RESIDENTIAL, 0.0036, 0.0011, 0.00036, 0.00022, 6, 40.0, "KA010010420018"),

    # ── ROW 3: Central CBD & Metro Spine (dy = 0.0000, Target Parcel is at 0.0) ─
    ("UB City Heights Commercial", UnitType.COMMERCIAL, -0.0036, 0.0000, 0.00044, 0.00026, 12, 20.0, "KA010010420019"),
    ("Residency Road Hub", UnitType.COMMERCIAL, -0.0027, 0.0000, 0.00038, 0.00024, 7, 0.0, "KA010010420020"),
    ("Public Utility Building Annex", UnitType.COMMERCIAL, -0.0018, 0.0000, 0.00038, 0.00024, 4, 0.0, "KA010010420021"),
    ("MG Road Metro Interchange Hub", UnitType.COMMERCIAL, -0.0009, 0.0000, 0.00038, 0.00024, 8, 0.0, "KA010010420022"),
    # (dx: 0.0000, dy: 0.0000 is Target Parcel KA010010420104 / PLOT-104)
    ("Barton Centre Tower", UnitType.COMMERCIAL, 0.0009, 0.0000, 0.00040, 0.00025, 10, 0.0, "KA010010420023"),
    ("Cauvery Arts & Trade Plaza", UnitType.COMMERCIAL, 0.0018, 0.0000, 0.00035, 0.00022, 5, 0.0, "KA010010420024"),
    ("Queen's Corner Apex", UnitType.COMMERCIAL, 0.0027, 0.0000, 0.00040, 0.00025, 8, 25.0, "KA010010420025"),
    ("Lavelle Mansions East", UnitType.RESIDENTIAL, 0.0036, 0.0000, 0.00035, 0.00022, 5, 0.0, "KA010010420026"),
    ("Vittal Mallya Tech Park", UnitType.COMMERCIAL, 0.0045, 0.0000, 0.00044, 0.00026, 10, 15.0, "KA010010420027"),

    # ── ROW 4: Residency Road & Brigade Corridor (dy = -0.0011) ────────────────
    ("Brigade Towers South", UnitType.COMMERCIAL, -0.0036, -0.0011, 0.00040, 0.00025, 8, 15.0, "KA010010420028"),
    ("St. Marks Business Bay", UnitType.COMMERCIAL, -0.0027, -0.0011, 0.00042, 0.00025, 9, 20.0, "KA010010420029"),
    ("Museum Road Residences", UnitType.RESIDENTIAL, -0.0018, -0.0011, 0.00035, 0.00022, 4, 25.0, "KA010010420030"),
    ("Brigade Gateway Suites", UnitType.RESIDENTIAL, -0.0009, -0.0011, 0.00038, 0.00024, 6, 35.0, "KA010010420031"),
    ("Shanthala Silk Heritage Court", UnitType.COMMERCIAL, 0.0000, -0.0011, 0.00036, 0.00022, 4, 10.0, "KA010010420032"),
    ("Garuda Parkview Suites", UnitType.RESIDENTIAL, 0.0009, -0.0011, 0.00036, 0.00024, 5, -10.0, "KA010010420033"),
    ("Sobha Emerald Residency", UnitType.RESIDENTIAL, 0.0018, -0.0011, 0.00038, 0.00024, 6, -25.0, "KA010010420034"),
    ("Mantri Royale Apartments", UnitType.RESIDENTIAL, 0.0027, -0.0011, 0.00040, 0.00025, 7, 20.0, "KA010010420035"),
    ("Puravankara Business Bay", UnitType.COMMERCIAL, 0.0036, -0.0011, 0.00044, 0.00026, 9, 10.0, "KA010010420036"),

    # ── ROW 5: Richmond Town & Victoria Road (dy = -0.0022) ───────────────────
    ("Mayo Hall Corporate Annex", UnitType.COMMERCIAL, -0.0036, -0.0022, 0.00042, 0.00025, 7, 10.0, "KA010010420037"),
    ("Brunton Road Luxury Enclave", UnitType.RESIDENTIAL, -0.0027, -0.0022, 0.00038, 0.00024, 4, 30.0, "KA010010420038"),
    ("Commissariat Chambers", UnitType.COMMERCIAL, -0.0018, -0.0022, 0.00036, 0.00022, 5, 0.0, "KA010010420039"),
    ("Richmond Park Estates", UnitType.RESIDENTIAL, -0.0009, -0.0022, 0.00035, 0.00022, 4, 0.0, "KA010010420040"),
    ("Langford Garden Suites", UnitType.RESIDENTIAL, 0.0000, -0.0022, 0.00038, 0.00024, 5, 35.0, "KA010010420041"),
    ("Auckland Heights Living", UnitType.RESIDENTIAL, 0.0009, -0.0022, 0.00040, 0.00025, 6, 15.0, "KA010010420042"),
    ("Victoria Road Commerce", UnitType.COMMERCIAL, 0.0018, -0.0022, 0.00038, 0.00024, 6, -15.0, "KA010010420043"),
    ("Albert Street Villas", UnitType.RESIDENTIAL, 0.0027, -0.0022, 0.00034, 0.00022, 3, 0.0, "KA010010420044"),
    ("Baldwin Enclave Residency", UnitType.RESIDENTIAL, 0.0036, -0.0022, 0.00038, 0.00024, 5, 20.0, "KA010010420045"),
]


# =============================================================================
# MAIN SEED EXECUTION
# =============================================================================

def main():
    print("=" * 80)
    print("Bhumi3D - City-Scale 3D Cadastre Digital Twin Generator (Bangalore CBD)")
    print("=" * 80)
    print(f"Datum Location: Bangalore CBD ({BASE_LAT}°N, {BASE_LON}°E)")
    print(f"Target Parcel: {BASE_2D_ULPIN} (5-Storey Residential + Subsurface B1/B2 + Dispute)")
    print(f"City Layout: 45 Street-Aligned Rotated Buildings (2-12 Floors)")
    print("=" * 80)

    # Initialize database
    print("\n[INIT] Verifying database schema & PostGIS extensions...")
    try:
        with engine.connect() as conn:
            for enum_val in ['CONTEXT_PARCEL']:
                try:
                    conn.execute(text(f"ALTER TYPE unittype ADD VALUE IF NOT EXISTS '{enum_val}';"))
                    conn.commit()
                except Exception:
                    pass

            # Safe migration of ML, Cadastral Identity and Subsurface columns
            ml_cols = [
                ("building_name", "VARCHAR(255)"),
                ("plot_number", "VARCHAR(50)"),
                ("flat_number", "VARCHAR(50)"),
                ("total_floors", "INTEGER"),
                ("ulpin_id", "VARCHAR(60)"),
                ("scene_id", "INTEGER"),
                ("building_id", "INTEGER"),
                ("building_type", "VARCHAR(50) DEFAULT 'Low-rise'"),
                ("building_height_m", "FLOAT"),
                ("building_volume_m3", "FLOAT"),
                ("footprint_area_m2", "FLOAT"),
                ("roof_area_m2", "FLOAT"),
                ("roof_height_m", "FLOAT"),
                ("usable_roof_area_m2", "FLOAT"),
                ("estimated_solar_kw", "FLOAT"),
                ("estimated_floors", "INTEGER"),
                ("point_count", "INTEGER"),
                ("roof_point_count", "INTEGER"),
                ("data_status", "VARCHAR(50) DEFAULT '3D_cadastre_verified'"),
                ("solar_available", "BOOLEAN DEFAULT TRUE"),
                ("depth_below_ground_m", "FLOAT"),
                ("easement_type", "VARCHAR(255)"),
            ]
            for col_name, col_type in ml_cols:
                try:
                    conn.execute(text(f"ALTER TABLE vertical_property_units ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
                    conn.commit()
                except Exception:
                    pass

            # Widen column lengths for existing columns
            for col_name, col_type in [
                ("unit_number", "VARCHAR(255)"),
                ("ulpin_3d", "VARCHAR(60)"),
                ("building_name", "VARCHAR(255)"),
                ("easement_type", "VARCHAR(255)"),
                ("ulpin_id", "VARCHAR(60)"),
            ]:
                try:
                    conn.execute(text(f"ALTER TABLE vertical_property_units ALTER COLUMN {col_name} TYPE {col_type};"))
                    conn.commit()
                except Exception:
                    pass

        init_db()
        print("[OK] Database schema verified with PostGIS extensions.")
    except Exception as e:
        print(f"[ERROR] Database initialization failed: {e}")
        return

    db = SessionLocal()

    try:
        clear_existing_data(db)
        units_created = []
        global_unit_counter = 1

        # =====================================================================
        # 1. TARGET BUILDING: 6-Storey Residential with B1/B2 Subsurface Strata & Rooftop Penthouse Dispute
        # =====================================================================
        print(f"\n[TARGET BUILDING] Generating apartment building with 2-level basement & 6 above-ground storeys on Parcel {BASE_2D_ULPIN}...")

        # Level -2: Deep Basement Parking & Storage (B2)
        b2_basement = create_unit(
            db=db,
            base_ulpin=BASE_2D_ULPIN,
            unit_number="B2-Parking (Resident Bays & Storage)",
            footprint=BUILDING_FOOTPRINT,
            floor_level=-2,
            z_min=-7.0,
            z_max=-3.5,
            unit_type=UnitType.BASEMENT_PARKING,
            layer_type=LayerType.UNDERGROUND,
            owner_name="Resident Welfare Association",
            rera_reg_no="KA/RERA/2024/001",
            building_name="Kasturba Heritage Residency",
            plot_number="PLOT-104",
            flat_number="B2-Parking",
            total_floors=6,
            depth_below_ground_m=7.0,
            easement_type="Basement Parking B2-Bay",
            scene_id=1,
            building_id=1,
            building_type="Mid-rise",
            building_height_m=19.2,
            roof_area_m2=65.02,
            usable_roof_area_m2=48.76,
            estimated_solar_kw=4.88,
            estimated_floors=6,
            point_count=1013,
            roof_point_count=455,
            data_status="3D_cadastre_verified",
        )
        units_created.append(b2_basement)
        global_unit_counter += 1

        # Level -1: Basement Parking (B1)
        b1_basement = create_unit(
            db=db,
            base_ulpin=BASE_2D_ULPIN,
            unit_number="B1-Parking (Resident Bays)",
            footprint=BUILDING_FOOTPRINT,
            floor_level=-1,
            z_min=-3.5,
            z_max=0.0,
            unit_type=UnitType.BASEMENT_PARKING,
            layer_type=LayerType.UNDERGROUND,
            owner_name="Resident Welfare Association",
            rera_reg_no="KA/RERA/2024/001",
            building_name="Kasturba Heritage Residency",
            plot_number="PLOT-104",
            flat_number="B1-Parking",
            total_floors=6,
            depth_below_ground_m=3.5,
            easement_type="Basement Parking B1-Bay",
            scene_id=1,
            building_id=1,
            building_type="Mid-rise",
            building_height_m=19.2,
            roof_area_m2=65.02,
            usable_roof_area_m2=48.76,
            estimated_solar_kw=4.88,
            estimated_floors=6,
            point_count=1013,
            roof_point_count=455,
            data_status="3D_cadastre_verified",
        )
        units_created.append(b1_basement)
        global_unit_counter += 1

        # Levels 0-5: Residential Flats (4 flats per floor, 6 storeys total)
        owner_idx = 0
        for floor in range(6):
            z_floor_min = round(floor * FLOOR_HEIGHT, 2)
            z_floor_max = round(z_floor_min + FLOOR_HEIGHT, 2)

            quadrants = ["NW", "NE", "SW", "SE"]
            for i, quadrant in enumerate(quadrants, start=1):
                unit_num = f"Flat-{floor}0{i}" if floor > 0 else f"Flat-00{i}"
                flat_tag = f"F{floor}-0{i}" if floor > 0 else f"GF-0{i}"
                flat = create_unit(
                    db=db,
                    base_ulpin=BASE_2D_ULPIN,
                    unit_number=unit_num,
                    footprint=FLAT_FOOTPRINTS[quadrant],
                    floor_level=floor,
                    z_min=z_floor_min,
                    z_max=z_floor_max,
                    unit_type=UnitType.RESIDENTIAL,
                    layer_type=LayerType.ABOVE_GROUND,
                    owner_name=RESIDENTIAL_OWNERS[owner_idx % len(RESIDENTIAL_OWNERS)],
                    rera_reg_no=f"KA/RERA/2024/{100 + owner_idx}",
                    building_name="Kasturba Heritage Residency",
                    plot_number="PLOT-104",
                    flat_number=flat_tag,
                    total_floors=6,
                    scene_id=1,
                    building_id=1,
                    building_type="Mid-rise",
                    building_height_m=19.2,
                    roof_area_m2=65.02,
                    usable_roof_area_m2=48.76,
                    estimated_solar_kw=4.88,
                    estimated_floors=6,
                    point_count=1013,
                    roof_point_count=455,
                    data_status="3D_cadastre_verified",
                )
                units_created.append(flat)
                global_unit_counter += 1
                owner_idx += 1

        # Intentional Spatial Dispute: Unauthorized Rooftop Penthouse & Airspace Encroachment on Level 5 / Roof
        z_top_clash_min = 17.6  # Mid-height of Floor 5 (penetrates into Floor 5 unit Flat-502)
        z_top_clash_max = 21.2  # Extends 2.0m above sanctioned 19.2m building roofline into airspace
        top_penthouse_dispute = create_unit(
            db=db,
            base_ulpin=BASE_2D_ULPIN,
            unit_number="Flat-502X (Disputed Rooftop Penthouse)",
            footprint=FLAT_FOOTPRINTS["NE"],
            floor_level=5,
            z_min=z_top_clash_min,
            z_max=z_top_clash_max,
            unit_type=UnitType.RESIDENTIAL,
            layer_type=LayerType.ABOVE_GROUND,
            owner_name="Unauthorized Penthouse Developer",
            rera_reg_no=None,
            building_name="Kasturba Heritage Residency",
            plot_number="PLOT-104",
            flat_number="F5-02X",
            total_floors=6,
            scene_id=1,
            building_id=1,
            building_type="Mid-rise",
            building_height_m=19.2,
            roof_area_m2=65.02,
            usable_roof_area_m2=48.76,
            estimated_solar_kw=4.88,
            estimated_floors=6,
            point_count=1013,
            roof_point_count=455,
            data_status="3D_cadastre_disputed",
        )
        units_created.append(top_penthouse_dispute)
        global_unit_counter += 1
        print(f"  [+] Target Building: {2 + 24 + 1} units created (2 Basements B1/B2, 24 Flats across 6 Floors, 1 Dispute: Level 5 Rooftop Penthouse).")

        # =====================================================================
        # 2. SURROUNDING CITY-SCALE BUILDINGS (45 Street-Aligned Complexes)
        # =====================================================================
        print(f"\n[URBAN SURROUNDINGS] Generating {len(CITY_BUILDINGS_SPEC)} street-aligned multi-storey complexes...")

        surrounding_units_count = 0
        for b_idx, (b_name, b_type, dx, dy, w, h, total_floors, rot_deg, b_ulpin) in enumerate(CITY_BUILDINGS_SPEC, start=2):
            b_lon = BASE_LON + dx
            b_lat = BASE_LAT + dy

            raw_footprint = [
                (b_lon, b_lat),
                (b_lon + w, b_lat),
                (b_lon + w, b_lat + h),
                (b_lon, b_lat + h),
                (b_lon, b_lat),
            ]
            # Rotate footprint along street heading
            b_footprint = rotate_polygon(raw_footprint, rot_deg)

            # Assign building classification
            if total_floors >= 8:
                b_class = "High-rise"
            elif total_floors >= 4:
                b_class = "Mid-rise"
            else:
                b_class = "Low-rise"

            # Assign plot number
            b_plot = f"PLOT-{100 + b_idx}"

            # Add subterranean basements for high-rise buildings (B1 and B2)
            if total_floors >= 8:
                # B2 Basement
                b2_unit = create_unit(
                    db=db,
                    base_ulpin=b_ulpin,
                    unit_number=f"{b_name} - Basement B2 (Deep Storage & Plant)",
                    footprint=b_footprint,
                    floor_level=-2,
                    z_min=-7.0,
                    z_max=-3.5,
                    unit_type=UnitType.BASEMENT_PARKING,
                    layer_type=LayerType.UNDERGROUND,
                    owner_name=f"{b_name} Association / Facility Management",
                    rera_reg_no=f"KA/RERA/COMM/{3000 + surrounding_units_count}",
                    building_name=b_name,
                    plot_number=b_plot,
                    flat_number="B2-01",
                    total_floors=total_floors,
                    depth_below_ground_m=7.0,
                    easement_type="Commercial Subterranean Services & Parking B2",
                    scene_id=1,
                    building_id=b_idx,
                    building_type=b_class,
                    building_height_m=round(total_floors * FLOOR_HEIGHT, 2),
                    estimated_floors=total_floors,
                )
                units_created.append(b2_unit)
                global_unit_counter += 1
                surrounding_units_count += 1

                # B1 Basement
                b1_unit = create_unit(
                    db=db,
                    base_ulpin=b_ulpin,
                    unit_number=f"{b_name} - Basement B1 (Parking)",
                    footprint=b_footprint,
                    floor_level=-1,
                    z_min=-3.5,
                    z_max=0.0,
                    unit_type=UnitType.BASEMENT_PARKING,
                    layer_type=LayerType.UNDERGROUND,
                    owner_name=f"{b_name} Association / Facility Management",
                    rera_reg_no=f"KA/RERA/COMM/{3000 + surrounding_units_count}",
                    building_name=b_name,
                    plot_number=b_plot,
                    flat_number="B1-01",
                    total_floors=total_floors,
                    depth_below_ground_m=3.5,
                    easement_type="Commercial Subterranean Parking B1",
                    scene_id=1,
                    building_id=b_idx,
                    building_type=b_class,
                    building_height_m=round(total_floors * FLOOR_HEIGHT, 2),
                    estimated_floors=total_floors,
                )
                units_created.append(b1_unit)
                global_unit_counter += 1
                surrounding_units_count += 1

            # Generate individual floor units for each storey of this building
            for f in range(total_floors):
                z_f_min = round(f * FLOOR_HEIGHT, 2)
                z_f_max = round((f + 1) * FLOOR_HEIGHT, 2)
                floor_tag = "Ground Floor" if f == 0 else f"Floor {f}"
                flat_tag = "GF-01" if f == 0 else f"F{f}-01"

                # Assign realistic tenant/owner name
                if b_type == UnitType.COMMERCIAL:
                    tenant_name = COMMERCIAL_TENANTS[surrounding_units_count % len(COMMERCIAL_TENANTS)]
                    rera_id = f"KA/RERA/COMM/{3000 + surrounding_units_count}"
                else:
                    tenant_name = RESIDENTIAL_OWNERS[surrounding_units_count % len(RESIDENTIAL_OWNERS)]
                    rera_id = f"KA/RERA/RES/{4000 + surrounding_units_count}"

                unit_label = f"{b_name} - {floor_tag}"
                surr_unit = create_unit(
                    db=db,
                    base_ulpin=b_ulpin,
                    unit_number=unit_label,
                    footprint=b_footprint,
                    floor_level=f,
                    z_min=z_f_min,
                    z_max=z_f_max,
                    unit_type=b_type,
                    layer_type=LayerType.ABOVE_GROUND,
                    owner_name=tenant_name,
                    rera_reg_no=rera_id,
                    building_name=b_name,
                    plot_number=b_plot,
                    flat_number=flat_tag,
                    total_floors=total_floors,
                    scene_id=1,
                    building_id=b_idx,
                    building_type=b_class,
                    building_height_m=round(total_floors * FLOOR_HEIGHT, 2),
                    estimated_floors=total_floors,
                )
                units_created.append(surr_unit)
                global_unit_counter += 1
                surrounding_units_count += 1

        print(f"  [+] Added {len(CITY_BUILDINGS_SPEC)} surrounding complexes ({surrounding_units_count} individual floor & basement units).")

        # =====================================================================
        # 3. SUBTERRANEAN INFRASTRUCTURE NETWORKS (Metro, Concourse, Utilities)
        # =====================================================================
        print("\n[SUBTERRANEAN INFRASTRUCTURE] Generating 3D volumetric tunnels, concourses & utility conduits...")

        sub_infra_count = 0
        INFRA_BASE_2D_ULPIN = "KA010010420000"

        # 3.1 Namma Metro Purple Line Underground Tunnels (Depth: -18.0m to -14.0m)
        metro_segments = [
            (
                "Namma Metro Purple Line - Tunnel Segment 1 (Vidhana Soudha - GPO)",
                "TUN-01",
                (BASE_LON - 0.0035, BASE_LAT - 0.0010),
                (BASE_LON - 0.0010, BASE_LAT - 0.0008),
                7.5,
                -18.0,
                -14.0,
                16.0,
            ),
            (
                "Namma Metro Purple Line - Tunnel Segment 2 (GPO - Cubbon Park)",
                "TUN-02",
                (BASE_LON - 0.0010, BASE_LAT - 0.0008),
                (BASE_LON + 0.0015, BASE_LAT - 0.0005),
                7.5,
                -18.0,
                -14.0,
                16.0,
            ),
            (
                "Namma Metro Purple Line - Tunnel Segment 3 (Cubbon Park - Kasturba)",
                "TUN-03",
                (BASE_LON + 0.0015, BASE_LAT - 0.0005),
                (BASE_LON + 0.0038, BASE_LAT - 0.0002),
                7.5,
                -18.0,
                -14.0,
                16.0,
            ),
            (
                "Namma Metro Purple Line - Tunnel Segment 4 (Kasturba - MG Road)",
                "TUN-04",
                (BASE_LON + 0.0038, BASE_LAT - 0.0002),
                (BASE_LON + 0.0060, BASE_LAT + 0.0001),
                7.5,
                -18.0,
                -14.0,
                16.0,
            ),
        ]

        for seg_name, flat_tag, p1, p2, width, zmin, zmax, depth in metro_segments:
            corridor_poly = create_linear_corridor_polygon(p1, p2, width_m=width)
            metro_unit = create_unit(
                db=db,
                base_ulpin=INFRA_BASE_2D_ULPIN,
                unit_number=seg_name,
                footprint=corridor_poly,
                floor_level=-1,
                z_min=zmin,
                z_max=zmax,
                unit_type=UnitType.UTILITY_CORRIDOR,
                layer_type=LayerType.UNDERGROUND,
                owner_name="Bangalore Metro Rail Corporation Ltd (BMRCL)",
                rera_reg_no="KA/TRANSIT/BMRCL/2026/PL",
                building_name="Namma Metro Underground Transit Network",
                plot_number="INFRA-METRO-PL",
                flat_number=flat_tag,
                total_floors=1,
                depth_below_ground_m=depth,
                easement_type="BMRCL Metro Transit Right-of-Way (Stratum T1)",
                scene_id=1,
                building_id=901,
                building_type="Subway Tunnel",
                building_height_m=abs(zmax - zmin),
                data_status="3D_cadastre_verified",
            )
            units_created.append(metro_unit)
            global_unit_counter += 1
            sub_infra_count += 1

        # 3.2 Subway Pedestrian Concourse & Station Corridors (Depth: -7.5m to -4.5m)
        concourse_segments = [
            (
                "Cubbon Park Metro Station - Central Concourse Stratum C1",
                "CON-01",
                (BASE_LON + 0.0005, BASE_LAT - 0.0015),
                (BASE_LON + 0.0015, BASE_LAT - 0.0005),
                10.0,
                -7.5,
                -4.5,
                6.0,
            ),
            (
                "Cubbon Park Subway - Gate 2 Street Portal Link Stratum C1",
                "CON-02",
                (BASE_LON + 0.0015, BASE_LAT - 0.0005),
                (BASE_LON + 0.0022, BASE_LAT + 0.0010),
                6.0,
                -7.0,
                -4.5,
                5.5,
            ),
        ]

        for seg_name, flat_tag, p1, p2, width, zmin, zmax, depth in concourse_segments:
            corridor_poly = create_linear_corridor_polygon(p1, p2, width_m=width)
            concourse_unit = create_unit(
                db=db,
                base_ulpin=INFRA_BASE_2D_ULPIN,
                unit_number=seg_name,
                footprint=corridor_poly,
                floor_level=-1,
                z_min=zmin,
                z_max=zmax,
                unit_type=UnitType.UTILITY_CORRIDOR,
                layer_type=LayerType.UNDERGROUND,
                owner_name="Bruhat Bengaluru Mahanagara Palike (BBMP)",
                rera_reg_no="KA/BBMP/TRANSIT/2026/CON",
                building_name="Cubbon Park Subway Concourse & Portals",
                plot_number="INFRA-SUBWAY-CON",
                flat_number=flat_tag,
                total_floors=1,
                depth_below_ground_m=depth,
                easement_type="BBMP Pedestrian Concourse Easement (Stratum C1)",
                scene_id=1,
                building_id=902,
                building_type="Pedestrian Concourse",
                building_height_m=abs(zmax - zmin),
                data_status="3D_cadastre_verified",
            )
            units_created.append(concourse_unit)
            global_unit_counter += 1
            sub_infra_count += 1

        # 3.3 Above-Ground Metro Station Street Entrance Kiosk (Surface: 0.0m to 3.5m)
        kiosk_poly = create_linear_corridor_polygon(
            (BASE_LON + 0.0022, BASE_LAT + 0.0010),
            (BASE_LON + 0.0024, BASE_LAT + 0.0010),
            width_m=8.0,
        )
        kiosk_unit = create_unit(
            db=db,
            base_ulpin=INFRA_BASE_2D_ULPIN,
            unit_number="Cubbon Park Metro - Gate 2 Street Entrance Kiosk",
            footprint=kiosk_poly,
            floor_level=0,
            z_min=0.0,
            z_max=3.5,
            unit_type=UnitType.COMMON_AREA,
            layer_type=LayerType.SURFACE,
            owner_name="Bangalore Metro Rail Corporation Ltd (BMRCL)",
            rera_reg_no="KA/BMRCL/PORTAL/2026/G2",
            building_name="Cubbon Park Metro Station Surface Entrance",
            plot_number="INFRA-METRO-PORTAL",
            flat_number="KSK-01",
            total_floors=1,
            depth_below_ground_m=0.0,
            easement_type="BMRCL Public Transit Portal Access & Egress",
            scene_id=1,
            building_id=904,
            building_type="Transit Kiosk",
            building_height_m=3.5,
            data_status="3D_cadastre_verified",
        )
        units_created.append(kiosk_unit)
        global_unit_counter += 1

        # 3.4 Municipal Stormwater, High-Voltage & Telecom Conduits (Depth: -5.0m to -2.0m)
        # Note: UTIL-CBD-04 intentionally intersects across PLOT-104-B2 to generate a spatial clash!
        utility_conduits = [
            (
                "UTIL-CBD-01: Bescom 66kV High-Voltage Duct (Ambedkar Veedhi)",
                "UTL-01",
                (BASE_LON - 0.0020, BASE_LAT - 0.0030),
                (BASE_LON - 0.0020, BASE_LAT + 0.0030),
                4.0,
                -5.0,
                -2.0,
                3.5,
                "Bangalore Electricity Supply Company (BESCOM)",
                "Bescom 66kV High-Voltage Transmission Easement (Stratum U1)",
                "3D_cadastre_verified",
            ),
            (
                "UTIL-CBD-02: BWSSB Potable Water Trunk Main (Kasturba Road)",
                "UTL-02",
                (BASE_LON - 0.0030, BASE_LAT + 0.0015),
                (BASE_LON + 0.0035, BASE_LAT + 0.0015),
                4.5,
                -4.5,
                -2.0,
                3.0,
                "Bangalore Water Supply and Sewerage Board (BWSSB)",
                "BWSSB Potable Water Trunk Main Easement (Stratum U1)",
                "3D_cadastre_verified",
            ),
            (
                "UTIL-CBD-03: CBD Telecom & Optical Fiber Duct Trench",
                "UTL-03",
                (BASE_LON - 0.0015, BASE_LAT - 0.0025),
                (BASE_LON + 0.0025, BASE_LAT + 0.0020),
                3.0,
                -3.5,
                -1.5,
                2.5,
                "Department of Telecommunications (DoT)",
                "DoT Telecom & Fiber-Optic Municipal Conduit (Stratum U1)",
                "3D_cadastre_verified",
            ),
            (
                "UTIL-CBD-04: Municipal Stormwater Trunk Conduit & High-Voltage Corridor",
                "UTL-04",
                (BASE_LON - 0.0012, BASE_LAT + LAT_OFFSET * 0.45),
                (BASE_LON + 0.0018, BASE_LAT + LAT_OFFSET * 0.45),
                8.0,
                -6.0,
                -3.0,
                4.5,
                "Bruhat Bengaluru Mahanagara Palike (BBMP) & BESCOM",
                "BBMP Stormwater Drain & Bescom Utility Corridor (UTIL-CBD-04)",
                "3D_cadastre_disputed",
            ),
        ]

        for seg_name, flat_tag, p1, p2, width, zmin, zmax, depth, owner, easement, status in utility_conduits:
            corridor_poly = create_linear_corridor_polygon(p1, p2, width_m=width)
            util_unit = create_unit(
                db=db,
                base_ulpin=INFRA_BASE_2D_ULPIN,
                unit_number=seg_name,
                footprint=corridor_poly,
                floor_level=-1,
                z_min=zmin,
                z_max=zmax,
                unit_type=UnitType.UTILITY_CORRIDOR,
                layer_type=LayerType.UNDERGROUND,
                owner_name=owner,
                rera_reg_no="KA/BBMP/UTIL/2026/CBD",
                building_name="Municipal Utility Corridor Network",
                plot_number="INFRA-UTIL-CBD",
                flat_number=flat_tag,
                total_floors=1,
                depth_below_ground_m=depth,
                easement_type=easement,
                scene_id=1,
                building_id=903,
                building_type="Utility Conduit",
                building_height_m=abs(zmax - zmin),
                data_status=status,
            )
            units_created.append(util_unit)
            global_unit_counter += 1
            sub_infra_count += 1

        print(f"  [+] Added {sub_infra_count} subterranean infrastructure units (Metro, Subway, Utility Conduits).")

        # Commit all records
        db.commit()
        print(f"\n[COMMIT] Total {len(units_created)} 3D volumetric units committed to PostGIS database.")

        # Run 3D spatial clash detection
        print("\n[CLASH DETECTION] Auditing 3D volumetric topologies...")
        clashes = check_spatial_clashes(db=db)
        print(f"[RESULT] Detected {len(clashes)} spatial conflict(s).")

        print("=" * 80)
        print(f"TARGET PARCEL ({BASE_2D_ULPIN} / PLOT-104): 27 Units (B2, B1, 6 Floors x 4 Units, 1 Rooftop Penthouse Dispute)")
        print(f"SURROUNDING CITY BUILDINGS: {len(CITY_BUILDINGS_SPEC)} Buildings ({surrounding_units_count} Floor Storeys)")
        print(f"TOTAL 3D PROPERTY UNITS: {len(units_created)}")
        print("=" * 80)

    except Exception as e:
        print(f"\n[ERROR] Seed script failed: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    main()
