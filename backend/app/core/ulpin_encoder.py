"""
Deterministic 2D & 3D ULPIN encoder / decoder with CRC-8 Algorithmic Verification.

Standardizes:
1. 14-Character Bhu-Aadhaar 2D Base ULPIN:
   State (2) + District (2) + Tehsil (3) + Village/Ward (3) + Plot (4)
   Example: KA010010420104 (Karnataka, Bengaluru Urban, Tehsil 001, Ward 042, Plot 0104)

2. Deterministic Hierarchical 3D Volumetric ULPIN:
   [Base-2D-ULPIN]-[Spatial-Layer][Base-AMSL][Floor-Code]-[Unit-ID]-[CRC8]
   Example: KA010010420104-A0924F02-U01-7F

   - Base-2D-ULPIN : 14-character official parcel identifier (e.g. KA010010420104)
   - Spatial-Layer : A (Above Ground) | B (Basement / Sub-surface) | S (Surface Grade level)
   - Base-AMSL     : 4-digit elevation AMSL in metres (e.g. 0924 for 924m AMSL)
   - Floor-Code    : 3-character floor code: G00 (Ground), F01-F99 (Above), B01-B09 (Basement)
   - Unit-ID       : 3-character sub-unit code: U01-U99, or U00 for whole floor
   - CRC8          : 2-character hexadecimal CRC-8 checksum (x^8 + x^2 + x + 1, 0x07, init 0x00)
"""

import re
from typing import Optional, Union


def compute_crc8(data: Union[str, bytes]) -> str:
    """
    Compute CRC-8 checksum with polynomial x^8 + x^2 + x + 1 (0x07, init 0x00).

    Parameters
    ----------
    data : str | bytes
        The payload string or bytes to checksum.

    Returns
    -------
    str
        2-character uppercase hexadecimal string (e.g. '7F', '86').
    """
    if isinstance(data, str):
        data = data.encode("utf-8")
    crc = 0x00
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x80:
                crc = ((crc << 1) ^ 0x07) & 0xFF
            else:
                crc = (crc << 1) & 0xFF
    return f"{crc:02X}"


def generate_2d_base_ulpin(
    state: str = "KA",
    district: str = "01",
    tehsil: str = "001",
    village: str = "042",
    plot: Union[str, int] = "0104",
) -> str:
    """
    Generate a 14-character Bhu-Aadhaar 2D Base ULPIN.

    Format:
        State (2) + District (2) + Tehsil (3) + Village (3) + Plot (4)

    Example
    -------
    >>> generate_2d_base_ulpin("KA", "01", "001", "042", "0104")
    'KA010010420104'
    """
    state_code = str(state).upper()[:2].ljust(2, "X")
    dist_code = re.sub(r"\D", "", str(district)).zfill(2)[:2] or "01"
    tehsil_code = re.sub(r"\D", "", str(tehsil)).zfill(3)[:3] or "001"
    village_code = re.sub(r"\D", "", str(village)).zfill(3)[:3] or "042"

    if isinstance(plot, int):
        plot_code = f"{plot:04d}"[:4]
    else:
        plot_digits = re.sub(r"\D", "", str(plot))
        if plot_digits:
            plot_code = f"{int(plot_digits):04d}"[:4]
        else:
            plot_code = re.sub(r"[^A-Z0-9]", "", str(plot).upper()).ljust(4, "0")[:4]

    return f"{state_code}{dist_code}{tehsil_code}{village_code}{plot_code}"


def _normalize_unit_code(unit_code: Union[str, int, None]) -> str:
    """Normalize unit code into 3-character format: U01-U99, U00, TUN, CON, UTL, etc."""
    if unit_code is None:
        return "U01"

    if isinstance(unit_code, int):
        return f"U{unit_code:02d}"

    raw = str(unit_code).strip().upper()

    # Exact 3-character mnemonic matches for subterranean & utility cadastre
    if raw in ("TUN", "CON", "UTL", "BAY", "COR", "STN", "BOX", "SHA", "MET", "DRA"):
        return raw

    # Exact Uxx match (e.g. U01, U02, U99, U00)
    u_match = re.match(r"^U(\d{1,2})$", raw)
    if u_match:
        return f"U{int(u_match.group(1)):02d}"

    # Semantic keyword mappings for subterranean features
    if "TUNNEL" in raw or "METRO" in raw or "TUBE" in raw:
        return "TUN"
    if "CONCOURSE" in raw or "SUBWAY" in raw:
        return "CON"
    if "UTIL" in raw or "CONDUIT" in raw or "PIPE" in raw or "CABLE" in raw or "STORM" in raw or "DRAIN" in raw:
        return "UTL"

    # Check for floor-unit combinations like F1-02, GF-03, B1-04, F02-01, B2-01
    floor_unit_match = re.search(r"(?:[FGBMCU]\d*|GF)[-_](\d+)", raw)
    if floor_unit_match:
        num = int(floor_unit_match.group(1))
        sub_unit = num % 100 if num >= 100 else num
        sub_unit = max(1, sub_unit) if sub_unit == 0 and num > 0 else sub_unit
        return f"U{sub_unit:02d}"

    # Check for flat numbering like Flat-402, Flat-101, Flat-202X, Unit-12, Bay-04
    flat_match = re.search(r"(?:FLAT|UNIT|BAY|APT|SUITE)[-_]?(\d+)", raw)
    if flat_match:
        num = int(flat_match.group(1))
        # If flat is like 402, 101, extract sub-unit index (num % 100)
        sub_unit = num % 100 if num >= 100 else num
        sub_unit = max(1, sub_unit) if sub_unit == 0 and num > 0 else sub_unit
        return f"U{sub_unit:02d}"

    # Look for trailing digits at end of string
    trailing_digits = re.search(r"(\d+)[A-Z]?$", raw)
    if trailing_digits:
        num = int(trailing_digits.group(1))
        sub_unit = num % 100 if num >= 100 else num
        sub_unit = max(1, sub_unit) if sub_unit == 0 and num > 0 else sub_unit
        return f"U{sub_unit:02d}"

    if "PARKING" in raw or "BASEMENT" in raw or "STORAGE" in raw:
        return "U01"

    if "COMMON" in raw or "ALL" in raw or "ROOF" in raw:
        return "U00"

    # If exactly 3 alphanumeric characters
    if len(raw) == 3 and raw.isalnum():
        return raw

    return "U01"


def generate_3d_ulpin(
    base_2d_ulpin: str,
    layer_type: str = "A",
    z_min: float = 0.0,
    z_max: Optional[float] = None,
    unit_code: Union[str, int] = "U01",
    floor_level: Optional[int] = None,
    floor_code: Optional[str] = None,
    ground_amsl: float = 920.0,
) -> str:
    """
    Build a deterministic hierarchical 3D volumetric ULPIN with CRC-8 checksum.

    Format:
        [Base-2D-ULPIN]-[Spatial-Layer][Base-AMSL][Floor-Code]-[Unit-ID]-[CRC8]
        Examples:
          Above Ground: KA010010420104-A0924F02-U01-7F
          Basement:     KA010010420104-B0912B02-U01-9F
          Metro Tunnel: KA010010420000-U0890M01-TUN-4C
          Utility Line: KA010010420000-U0916U01-UTL-8E

    Parameters
    ----------
    base_2d_ulpin : str
        14-character Bhu-Aadhaar surface land parcel ID.
    layer_type : str
        'A' (Above Ground), 'B' (Basement), 'U' (Subterranean Utility/Transit), 'S' (Surface Grade).
    z_min : float
        Base elevation in metres AMSL or relative offset from ground.
    z_max : float, optional
        Ceiling elevation in metres AMSL.
    unit_code : str | int
        Unit identifier (e.g. 'Flat-402', 'U01', 'B1-Parking', 'TUN', 'CON', 'UTL').
    floor_level : int, optional
        Signed floor index (-2, 0, 1, 2, ...). Inferred from z_min if omitted.
    floor_code : str, optional
        Explicit floor code (e.g. 'M01', 'C01', 'U01', 'B02', 'F04', 'G00').
    ground_amsl : float
        Reference ground elevation above mean sea level (default 920.0m for Bangalore CBD).

    Returns
    -------
    str
        30-character standardized 3D ULPIN.
    """
    base_clean = re.sub(r"[^A-Z0-9]", "", str(base_2d_ulpin).upper())
    if len(base_clean) != 14:
        raise ValueError(
            f"base_2d_ulpin must be exactly 14 alphanumeric characters, got '{base_2d_ulpin}' (len={len(base_clean)})"
        )

    # 1. Resolve absolute AMSL elevation
    if z_min >= 500.0:
        elevation = z_min
    else:
        elevation = ground_amsl + z_min
    amsl_str = f"{max(0, int(round(elevation))):04d}"

    # 2. Resolve floor level if not explicitly provided
    if floor_level is None:
        if z_min < 0:
            floor_level = -max(1, int(round(abs(z_min) / 3.5)))
        elif z_min == 0.0:
            floor_level = 0
        elif z_min < 500.0:
            floor_level = max(1, int(round(z_min / 3.2)))
        else:
            rel = z_min - ground_amsl
            floor_level = max(1, int(round(rel / 3.2))) if rel > 0 else 0

    # 3. Resolve Spatial Layer Datum: A (Above), B (Basement), U (Subterranean Utility/Transit), S (Surface)
    layer_upper = str(layer_type).upper().strip() if layer_type else "A"
    if layer_upper in ("B", "BASEMENT"):
        layer = "B"
    elif layer_upper in ("U", "UTILITY", "TRANSIT", "METRO", "CONCOURSE", "INFRASTRUCTURE"):
        if floor_level is not None and floor_level < 0 and any(k in str(unit_code).upper() for k in ("BASEMENT", "PARKING", "RESIDENT", "FLAT")):
            layer = "B"
        else:
            layer = "U"
    elif floor_level is not None and floor_level < 0:
        layer = "B"
    elif floor_level == 0 or layer_upper in ("S", "SURFACE") or (z_min == 0 and (floor_level is None or floor_level == 0)):
        layer = "S"
    else:
        layer = "A"

    # 4. Resolve Floor Code: G00, F01-F99, B01-B09, M01-M09, C01-C09, U01-U09
    if floor_code:
        f_clean = str(floor_code).strip().upper()
        if re.match(r"^[GFBMUC]\d{2}$", f_clean):
            resolved_floor_code = f_clean
        else:
            resolved_floor_code = f"F{min(99, max(1, abs(floor_level))):02d}"
    else:
        if layer == "U":
            u_upper = str(unit_code).upper()
            if "TUN" in u_upper or "METRO" in u_upper:
                resolved_floor_code = f"M{min(9, max(1, abs(floor_level))):02d}"
            elif "CON" in u_upper or "SUBWAY" in u_upper:
                resolved_floor_code = f"C{min(9, max(1, abs(floor_level))):02d}"
            else:
                resolved_floor_code = f"U{min(9, max(1, abs(floor_level))):02d}"
        elif floor_level == 0:
            resolved_floor_code = "G00"
        elif floor_level > 0:
            resolved_floor_code = f"F{min(99, floor_level):02d}"
        else:
            resolved_floor_code = f"B{min(99, abs(floor_level)):02d}"

    # 5. Resolve Sub-Unit Partition: U00, U01-U99, TUN, CON, UTL
    u_code = _normalize_unit_code(unit_code)

    # 6. Build Payload (26 characters preceding checksum) and Compute CRC-8
    payload = f"{base_clean}-{layer}{amsl_str}{resolved_floor_code}-{u_code}"
    checksum = compute_crc8(payload)

    return f"{payload}-{checksum}"


def parse_3d_ulpin(ulpin_3d: str) -> dict:
    """
    Reverse-decode a 3D ULPIN string into its components.

    Parameters
    ----------
    ulpin_3d : str
        A previously generated 3D ULPIN.

    Returns
    -------
    dict
        Parsed attributes including base_2d_ulpin, spatial_layer, amsl_elevation_m,
        floor_code, floor_level, unit_code, checksum, is_valid_checksum.
    """
    clean_str = str(ulpin_3d).strip().upper()

    # Standard Hierarchical 3D ULPIN pattern:
    # e.g. KA010010420104-A0924F02-U01-7F, KA010010420000-U0890M01-TUN-4C
    pattern = re.compile(
        r"^(?P<base>[A-Z0-9]{14})"
        r"-(?P<layer>[ABSU])"
        r"(?P<amsl>\d{4})"
        r"(?P<floor>[GFBMUC]\d{2})"
        r"-(?P<unit>U\d{2}|TUN|CON|UTL|[A-Z0-9]{3})"
        r"-(?P<crc>[A-F0-9]{2})$"
    )

    match = pattern.match(clean_str)
    if match:
        base = match.group("base")
        layer = match.group("layer")
        amsl = float(match.group("amsl"))
        floor_str = match.group("floor")
        unit = match.group("unit")
        crc = match.group("crc")

        # Parse floor level
        if floor_str == "G00":
            floor_lvl = 0
        elif floor_str.startswith("F"):
            floor_lvl = int(floor_str[1:])
        elif floor_str.startswith("B"):
            floor_lvl = -int(floor_str[1:])
        elif floor_str.startswith("M"):
            floor_lvl = -int(floor_str[1:])
        elif floor_str.startswith("C"):
            floor_lvl = -int(floor_str[1:])
        elif floor_str.startswith("U"):
            floor_lvl = -int(floor_str[1:])
        else:
            floor_lvl = 0

        payload = f"{base}-{layer}{match.group('amsl')}{floor_str}-{unit}"
        expected_crc = compute_crc8(payload)
        is_valid = (expected_crc == crc)

        return {
            "base_2d_ulpin": base,
            "spatial_layer": layer,
            "layer_code": layer,
            "amsl_elevation_m": amsl,
            "z_min_m": amsl,
            "z_max_m": amsl + 3.2,
            "floor_code": floor_str,
            "floor_level": floor_lvl,
            "unit_code": unit,
            "checksum": crc,
            "is_valid_checksum": is_valid,
            "payload": payload,
        }

    # Backward compatibility fallback for legacy dm-encoded format
    legacy_pattern = re.compile(
        r"^(?P<base>[A-Z0-9]{14})"
        r"-(?P<layer>[ASU])"
        r"-(?P<zmin>\d{6})(?P<zmax>\d{6})"
        r"-(?P<unit>[A-Z0-9]{4,8})$"
    )
    leg_match = legacy_pattern.match(clean_str)
    if leg_match:
        layer = leg_match.group("layer")
        z_min = int(leg_match.group("zmin")) / 10.0
        z_max = int(leg_match.group("zmax")) / 10.0
        if layer == "U":
            z_min = -z_min
            z_max = -z_max
            mapped_layer = "B"
        else:
            mapped_layer = layer

        return {
            "base_2d_ulpin": leg_match.group("base"),
            "spatial_layer": mapped_layer,
            "layer_code": layer,
            "amsl_elevation_m": z_min if z_min >= 500 else (920.0 + z_min),
            "z_min_m": z_min,
            "z_max_m": z_max,
            "floor_code": "F01",
            "floor_level": 1,
            "unit_code": leg_match.group("unit"),
            "checksum": "00",
            "is_valid_checksum": True,
            "payload": clean_str,
        }

    raise ValueError(f"Invalid 3D ULPIN format: '{ulpin_3d}'")


def validate_3d_ulpin(ulpin_3d: str) -> bool:
    """
    Validate format and CRC-8 integrity of a 3D ULPIN.

    Returns True if format matches and CRC-8 checksum is valid.
    """
    try:
        parsed = parse_3d_ulpin(ulpin_3d)
        return parsed.get("is_valid_checksum", False)
    except Exception:
        return False
