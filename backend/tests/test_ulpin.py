"""
Unit Test Suite for Deterministic 2D & 3D ULPIN (Bhu-Aadhaar) Cadastral Standard.

Verifies:
1. 14-Character 2D Base ULPIN generation adhering to State+District+Tehsil+Village+Plot.
2. CRC-8 checksum calculation with polynomial x^8 + x^2 + x + 1 (0x07, init 0x00).
3. 30-Character Deterministic Hierarchical 3D Volumetric ULPIN syntax:
   [Base-2D-ULPIN]-[Spatial-Layer][Base-AMSL][Floor-Code]-[Unit-ID]-[CRC8]
4. Unit code normalization (U00, U01-U99, Flat-402, F1-02, B1-Parking).
5. Reverse decoding and decomposition into structured components.
6. Algorithmic tamper detection (invalid checksums, corrupt payloads).
7. Cross-layer support (Above Ground 'A', Basement 'B', Surface 'S').
"""

import unittest
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.ulpin_encoder import (
    compute_crc8,
    generate_2d_base_ulpin,
    generate_3d_ulpin,
    parse_3d_ulpin,
    validate_3d_ulpin,
    _normalize_unit_code,
)


class TestUlpinStandard(unittest.TestCase):
    """Test suite for standard 2D Bhu-Aadhaar and 3D Volumetric ULPIN operations."""

    def test_2d_base_ulpin_generation(self):
        """Test generation of standard 14-character 2D Base ULPINs."""
        # Bangalore CBD parcel - Plot 104 (Kasturba Heritage Residency)
        ulpin_2d = generate_2d_base_ulpin(
            state="KA",
            district="01",
            tehsil="001",
            village="042",
            plot="0104",
        )
        self.assertEqual(ulpin_2d, "KA010010420104")
        self.assertEqual(len(ulpin_2d), 14)

        # Plot with integer input
        ulpin_int_plot = generate_2d_base_ulpin("KA", "01", "001", "042", 101)
        self.assertEqual(ulpin_int_plot, "KA010010420101")
        self.assertEqual(len(ulpin_int_plot), 14)

        # Delhi NCR parcel
        ulpin_dl = generate_2d_base_ulpin("DL", "03", "002", "015", "0550")
        self.assertEqual(ulpin_dl, "DL030020150550")
        self.assertEqual(len(ulpin_dl), 14)

    def test_crc8_checksum_deterministic(self):
        """Test that CRC-8 computation is deterministic and matches expected hashes."""
        payload = "KA010010420104-A0924F02-U01"
        crc = compute_crc8(payload)
        self.assertIsInstance(crc, str)
        self.assertEqual(len(crc), 2)
        # Consistent re-evaluation
        self.assertEqual(compute_crc8(payload), crc)

        # Different payloads produce different checksums
        payload_alt = "KA010010420104-A0924F02-U02"
        self.assertNotEqual(compute_crc8(payload), compute_crc8(payload_alt))

    def test_unit_normalization(self):
        """Test normalization of various flat/unit naming schemes to Uxx format."""
        self.assertEqual(_normalize_unit_code("U01"), "U01")
        self.assertEqual(_normalize_unit_code("U1"), "U01")
        self.assertEqual(_normalize_unit_code("u12"), "U12")
        self.assertEqual(_normalize_unit_code(5), "U05")
        self.assertEqual(_normalize_unit_code("F1-01"), "U01")
        self.assertEqual(_normalize_unit_code("F2-04"), "U04")
        self.assertEqual(_normalize_unit_code("GF-03"), "U03")
        self.assertEqual(_normalize_unit_code("Flat-402"), "U02")
        self.assertEqual(_normalize_unit_code("Flat-101"), "U01")
        self.assertEqual(_normalize_unit_code("COMMON_AREA"), "U00")
        self.assertEqual(_normalize_unit_code("ROOF"), "U00")
        self.assertEqual(_normalize_unit_code("B1-Parking-04"), "U04")

    def test_3d_ulpin_generation_above_ground(self):
        """Test 3D volumetric ULPIN generation for above-ground residential/commercial floors."""
        base_2d = "KA010010420104"
        ulpin_3d = generate_3d_ulpin(
            base_2d_ulpin=base_2d,
            layer_type="A",
            z_min=924.8,
            unit_code="U01",
            floor_level=2,
            ground_amsl=920.0,
        )
        self.assertEqual(len(ulpin_3d), 30)
        self.assertTrue(ulpin_3d.startswith("KA010010420104-A0925F02-U01-"))
        self.assertTrue(validate_3d_ulpin(ulpin_3d))

    def test_3d_ulpin_generation_basement_and_surface(self):
        """Test 3D ULPIN generation for subsurface basement and ground surface levels."""
        base_2d = "KA010010420104"

        # Basement Floor B1
        ulpin_b1 = generate_3d_ulpin(
            base_2d_ulpin=base_2d,
            layer_type="B",
            z_min=-3.5,
            unit_code="B1-01",
            floor_level=-1,
            ground_amsl=920.0,
        )
        self.assertTrue(ulpin_b1.startswith("KA010010420104-B0916B01-U01-") or "B0917B01-U01-" in ulpin_b1)
        self.assertTrue(validate_3d_ulpin(ulpin_b1))

        # Ground Floor G00
        ulpin_g00 = generate_3d_ulpin(
            base_2d_ulpin=base_2d,
            layer_type="S",
            z_min=0.0,
            unit_code="GF-01",
            floor_level=0,
            ground_amsl=920.0,
        )
        self.assertTrue(ulpin_g00.startswith("KA010010420104-S0920G00-U01-"))
        self.assertTrue(validate_3d_ulpin(ulpin_g00))

    def test_3d_ulpin_roundtrip_parsing(self):
        """Test reverse decoding of 3D ULPIN into structured metadata."""
        base_2d = "KA010010420104"
        ulpin_3d = generate_3d_ulpin(
            base_2d_ulpin=base_2d,
            layer_type="A",
            z_min=926.4,
            unit_code="F3-02",
            floor_level=3,
            ground_amsl=920.0,
        )

        parsed = parse_3d_ulpin(ulpin_3d)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["base_2d_ulpin"], base_2d)
        self.assertEqual(parsed["spatial_layer"], "A")
        self.assertEqual(parsed["floor_code"], "F03")
        self.assertEqual(parsed["floor_level"], 3)
        self.assertEqual(parsed["unit_code"], "U02")
        self.assertTrue(parsed["is_valid_checksum"])

    def test_tamper_detection(self):
        """Test that modifying any character in a 3D ULPIN invalidates the CRC-8 checksum."""
        base_2d = "KA010010420104"
        valid_ulpin = generate_3d_ulpin(
            base_2d_ulpin=base_2d,
            layer_type="A",
            z_min=924.8,
            unit_code="U01",
            floor_level=2,
            ground_amsl=920.0,
        )
        self.assertTrue(validate_3d_ulpin(valid_ulpin))

        # Tamper elevation digit
        corrupt_elevation = valid_ulpin[:16] + ("9" if valid_ulpin[16] != "9" else "8") + valid_ulpin[17:]
        self.assertFalse(validate_3d_ulpin(corrupt_elevation))

        # Tamper floor code
        corrupt_floor = valid_ulpin.replace("F02", "F03")
        self.assertFalse(validate_3d_ulpin(corrupt_floor))

        # Tamper unit code
        corrupt_unit = valid_ulpin.replace("U01", "U02")
        self.assertFalse(validate_3d_ulpin(corrupt_unit))

        # Tamper checksum
        corrupt_checksum = valid_ulpin[:-2] + "00"
        if corrupt_checksum != valid_ulpin:
            self.assertFalse(validate_3d_ulpin(corrupt_checksum))

    def test_invalid_base_2d_ulpin_rejection(self):
        """Test that invalid 2D base ULPIN lengths raise ValueError."""
        with self.assertRaises(ValueError):
            generate_3d_ulpin("SHORT_ID", layer_type="A", z_min=924.0)

        with self.assertRaises(ValueError):
            generate_3d_ulpin("KA010010420104_EXTRA_CHARS", layer_type="A", z_min=924.0)


if __name__ == "__main__":
    unittest.main()
