"""
Unit and integration tests for 3D ULPIN system backend components.
"""
import unittest
import uuid

# Test 1: Encoder Tests
from app.core.ulpin_encoder import generate_3d_ulpin, parse_3d_ulpin

class TestUlpinEncoder(unittest.TestCase):
    def test_generate_and_parse_standard(self):
        base = "KA010010420104"
        layer = "A"
        z_min = 923.2
        z_max = 926.4
        unit = "U01"

        ulpin_3d = generate_3d_ulpin(base, layer, z_min, z_max, unit, floor_level=1)
        self.assertTrue(len(ulpin_3d) >= 28)
        self.assertIn("KA010010420104-A0923F01-U01-", ulpin_3d)

        parsed = parse_3d_ulpin(ulpin_3d)
        self.assertEqual(parsed["base_2d_ulpin"], base)
        self.assertEqual(parsed["spatial_layer"], "A")
        self.assertEqual(parsed["floor_level"], 1)
        self.assertEqual(parsed["unit_code"], "U01")
        self.assertTrue(parsed["is_valid_checksum"])

    def test_generate_invalid_base_length(self):
        with self.assertRaises(ValueError):
            generate_3d_ulpin("SHORT", "A", 10.0, 20.0, "U101")

        with self.assertRaises(ValueError):
            generate_3d_ulpin("TOOLONGPARCELID12345", "A", 10.0, 20.0, "U101")

    def test_layer_types(self):
        base = "KA010010420104"
        # Above ground
        self.assertIn("-A", generate_3d_ulpin(base, "ABOVE_GROUND", 10.0, 20.0, "U01", floor_level=2))
        self.assertIn("-A", generate_3d_ulpin(base, "A", 10.0, 20.0, "U01", floor_level=2))
        # Surface
        self.assertIn("-S", generate_3d_ulpin(base, "SURFACE", 0.0, 3.0, "U01", floor_level=0))
        self.assertIn("-S", generate_3d_ulpin(base, "S", 0.0, 3.0, "U01", floor_level=0))
        # Basement
        self.assertIn("-B", generate_3d_ulpin(base, "UNDERGROUND", -10.0, -5.0, "U01", floor_level=-1))
        self.assertIn("-B", generate_3d_ulpin(base, "B", -10.0, -5.0, "U01", floor_level=-1))

    def test_unit_code_cleaning_and_padding(self):
        base = "KA010010420104"
        # Unit 1 -> U01
        result = generate_3d_ulpin(base, "A", 10.0, 20.0, "1", floor_level=1)
        self.assertIn("-U01-", result)

        # Flat 402 -> U02
        result = generate_3d_ulpin(base, "A", 10.0, 20.0, "Flat-402", floor_level=4)
        self.assertIn("-U02-", result)

    def test_parse_invalid_format(self):
        with self.assertRaises(ValueError):
            parse_3d_ulpin("INVALID-ULPIN-FORMAT")

    def test_underground_negative_elevations(self):
        """Test that underground units with negative elevations parse correctly."""
        base = "KA010010420104"

        # Basement parking: B1
        ulpin_3d = generate_3d_ulpin(base, "B", -3.5, 0.0, "B1-Parking", floor_level=-1)
        self.assertIn("-B", ulpin_3d)

        parsed = parse_3d_ulpin(ulpin_3d)
        self.assertEqual(parsed["spatial_layer"], "B")
        self.assertEqual(parsed["floor_level"], -1)
        self.assertTrue(parsed["is_valid_checksum"])


# Test 2: Model Definitions
from app.models.property_unit import VerticalPropertyUnit, UnitType, LayerType

class TestModels(unittest.TestCase):
    def test_unit_types(self):
        self.assertEqual(UnitType.RESIDENTIAL.value, "RESIDENTIAL")
        self.assertEqual(UnitType.COMMERCIAL.value, "COMMERCIAL")
        self.assertEqual(UnitType.COMMON_AREA.value, "COMMON_AREA")
        self.assertEqual(UnitType.BASEMENT_PARKING.value, "BASEMENT_PARKING")
        self.assertEqual(UnitType.UTILITY_CORRIDOR.value, "UTILITY_CORRIDOR")

    def test_layer_types(self):
        self.assertEqual(LayerType.ABOVE_GROUND.value, "A")
        self.assertEqual(LayerType.SURFACE.value, "S")
        self.assertEqual(LayerType.UNDERGROUND.value, "U")

    def test_model_instantiation(self):
        unit = VerticalPropertyUnit(
            id=uuid.uuid4(),
            base_2d_ulpin="KA010010420104",
            ulpin_3d="KA010010420104-A0932F04-U02-8B",
            unit_number="Flat 402",
            floor_level=4,
            unit_type=UnitType.RESIDENTIAL,
            layer_type=LayerType.ABOVE_GROUND,
            z_min=932.8,
            z_max=936.0,
            volume_cum=450.0,
            carpet_area_sqm=120.0,
            owner_name="John Doe",
            is_clashing=False,
        )
        self.assertIn("KA010010420104", repr(unit))


# Test 3: FastAPI Health Check & Routes (via TestClient)
from fastapi.testclient import TestClient
from app.main import app

class TestAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app, raise_server_exceptions=False)

    def test_health_check(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["service"], "3D ULPIN Engine")


# Test 4: Geometry Service Tests
from app.services.geometry_service import (
    calculate_polygon_area_sqm,
    create_3d_polyhedron_wkt,
    polyhedron_to_geojson_3d,
    subdivide_polygon_2d,
    extract_footprint_from_wkt,
)

class TestGeometryService(unittest.TestCase):
    def setUp(self):
        self.footprint = [
            (77.5946, 12.9716),
            (77.5949, 12.9716),
            (77.5949, 12.9718),
            (77.5946, 12.9718),
            (77.5946, 12.9716),
        ]

    def test_polygon_area_calculation(self):
        area = calculate_polygon_area_sqm(self.footprint)
        self.assertGreater(area, 0.0)
        self.assertGreater(area, 500.0)
        self.assertLess(area, 1200.0)

    def test_create_3d_polyhedron_wkt(self):
        wkt = create_3d_polyhedron_wkt(self.footprint, 920.0, 923.2)
        self.assertTrue(wkt.startswith("POLYHEDRALSURFACE Z ("))
        self.assertTrue(wkt.endswith(")"))
        self.assertIn("920.0", wkt)
        self.assertIn("923.2", wkt)

    def test_polyhedron_to_geojson_3d(self):
        wkt = create_3d_polyhedron_wkt(self.footprint, 920.0, 923.2)
        geojson = polyhedron_to_geojson_3d(wkt)
        self.assertEqual(geojson["type"], "MultiPolygon")
        self.assertGreater(len(geojson["coordinates"]), 0)

    def test_subdivide_polygon_2d(self):
        sub_polys = subdivide_polygon_2d(self.footprint, 3)
        self.assertEqual(len(sub_polys), 3)
        for poly in sub_polys:
            self.assertGreaterEqual(len(poly), 4)
            self.assertEqual(poly[0], poly[-1])  # Closed ring

    def test_extract_footprint_from_wkt(self):
        wkt = create_3d_polyhedron_wkt(self.footprint, 920.0, 923.2)
        extracted = extract_footprint_from_wkt(wkt)
        self.assertGreaterEqual(len(extracted), 4)
        self.assertEqual(extracted[0], extracted[-1])


# Test 5: Pydantic Schema Validation
from app.schemas.property_unit import (
    UnitCreate,
    UnitResponse,
    ClashPair,
    ClashReportResponse,
    GrievanceCreate,
    GrievanceActionRequest,
    GrievanceResponse,
    PendingGrievanceCountResponse,
)
from app.models.property_unit import GrievanceStatus, GrievanceRecord

class TestSchemas(unittest.TestCase):
    def test_valid_unit_create(self):
        payload = {
            "base_2d_ulpin": "14KA8829103841",
            "footprint_coords": [
                [77.5946, 12.9716],
                [77.5949, 12.9716],
                [77.5949, 12.9718],
                [77.5946, 12.9718],
                [77.5946, 12.9716],
            ],
            "unit_number": "Flat-101",
            "floor_level": 1,
            "unit_type": "RESIDENTIAL",
            "layer_type": "A",
            "z_min": 923.2,
            "z_max": 926.4,
            "owner_name": "Test Owner",
        }
        unit_in = UnitCreate(**payload)
        self.assertEqual(unit_in.unit_number, "Flat-101")
        self.assertEqual(unit_in.floor_level, 1)

    def test_invalid_unclosed_polygon(self):
        payload = {
            "base_2d_ulpin": "14KA8829103841",
            "footprint_coords": [
                [77.5946, 12.9716],
                [77.5949, 12.9716],
                [77.5949, 12.9718],
                [77.5946, 12.9718],
                # Missing closing coordinate
            ],
            "unit_number": "Flat-101",
            "floor_level": 1,
            "unit_type": "RESIDENTIAL",
            "layer_type": "A",
            "z_min": 923.2,
            "z_max": 926.4,
        }
        with self.assertRaises(ValueError):
            UnitCreate(**payload)

    def test_invalid_z_order(self):
        payload = {
            "base_2d_ulpin": "14KA8829103841",
            "footprint_coords": [
                [77.5946, 12.9716],
                [77.5949, 12.9716],
                [77.5949, 12.9718],
                [77.5946, 12.9718],
                [77.5946, 12.9716],
            ],
            "unit_number": "Flat-101",
            "floor_level": 1,
            "unit_type": "RESIDENTIAL",
            "layer_type": "A",
            "z_min": 926.4,
            "z_max": 920.0,  # Invalid: z_max <= z_min
        }
        with self.assertRaises(ValueError):
            UnitCreate(**payload)

    def test_grievance_schemas(self):
        g_in = GrievanceCreate(
            ulpin_3d="14DG8829103841-A-001250001400-F402",
            plot_number="PLOT-104",
            flat_number="F2-01",
            citizen_name="Siddharth Swami",
            citizen_phone="9876543210",
            description="Unauthorized structural mezzanine extension encroaching 1.2m.",
        )
        self.assertEqual(g_in.citizen_name, "Siddharth Swami")
        self.assertEqual(g_in.plot_number, "PLOT-104")

        action_in = GrievanceActionRequest(
            action="APPROVE",
            officer_remarks="LiDAR and cadastral survey confirm 1.2m volumetric encroachment.",
            officer_id="Officer #KA-BLR-04",
        )
        self.assertEqual(action_in.action, "APPROVE")
        self.assertEqual(action_in.officer_id, "Officer #KA-BLR-04")

        count_resp = PendingGrievanceCountResponse(pending_count=3)
        self.assertEqual(count_resp.pending_count, 3)

        self.assertEqual(GrievanceStatus.PENDING.value, "PENDING")
        self.assertEqual(GrievanceStatus.APPROVED.value, "APPROVED")
        self.assertEqual(GrievanceStatus.REJECTED.value, "REJECTED")

    def test_floor_subdivide_schema(self):
        from app.schemas.property_unit import FloorSubdivideRequest, SubdividedUnitCreate

        req = FloorSubdivideRequest(
            building_name="Kasturba Heritage Residency",
            floor_level=1,
            units=[
                SubdividedUnitCreate(flat_number="101", owner_name="Owner A", carpet_area_sqft=600.0),
                SubdividedUnitCreate(flat_number="102", owner_name="Owner B", carpet_area_sqft=600.0),
            ]
        )
        self.assertEqual(req.building_name, "Kasturba Heritage Residency")
        self.assertEqual(len(req.units), 2)
        self.assertEqual(req.units[0].carpet_area_sqft, 600.0)


if __name__ == "__main__":
    unittest.main()

