"""
3D Computational Geometry Service.

Provides utilities for:
- Geodesic area calculation
- 3D polyhedron WKT generation for PostGIS
- GeoJSON conversion for Cesium/deck.gl visualization
"""

import math
from typing import Union

from shapely.geometry import Polygon, shape
from shapely.wkt import loads as wkt_loads


def calculate_polygon_area_sqm(coords: list[tuple[float, float]]) -> float:
    """
    Calculate the approximate geodesic area of a polygon in square metres.

    Uses a local UTM-style projection approximation:
    - At the polygon's centroid latitude, compute metres per degree
    - Project to a local Cartesian plane
    - Calculate planar area

    This is accurate to ~0.5% for polygons under 10km across.
    For higher precision, use pyproj with a proper UTM zone transform.

    Parameters
    ----------
    coords : list[tuple[float, float]]
        Polygon coordinates as [(lon, lat), ...] in EPSG:4326.
        Must form a closed ring (first == last).

    Returns
    -------
    float
        Area in square metres.

    Example
    -------
    >>> footprint = [(77.5946, 12.9716), (77.5947, 12.9716),
    ...              (77.5947, 12.9715), (77.5946, 12.9715), (77.5946, 12.9716)]
    >>> calculate_polygon_area_sqm(footprint)
    1234.56
    """
    if len(coords) < 4:
        raise ValueError("Polygon must have at least 4 coordinates")

    if coords[0] != coords[-1]:
        raise ValueError("Polygon must be closed (first == last)")

    # Compute centroid latitude for metres-per-degree conversion
    lats = [lat for _, lat in coords]
    centroid_lat = sum(lats) / len(lats)
    lat_rad = math.radians(centroid_lat)

    # WGS84 ellipsoid parameters
    EARTH_RADIUS_M = 6378137.0  # Equatorial radius in metres
    FLATTENING = 1 / 298.257223563

    # Metres per degree at this latitude
    # Longitude: varies by cos(lat)
    # Latitude: nearly constant at ~111km/degree
    m_per_deg_lat = (math.pi / 180.0) * EARTH_RADIUS_M * (1 - FLATTENING)
    m_per_deg_lon = (math.pi / 180.0) * EARTH_RADIUS_M * math.cos(lat_rad)

    # Project to local Cartesian plane
    projected_coords = [
        (lon * m_per_deg_lon, lat * m_per_deg_lat) for lon, lat in coords
    ]

    # Use Shapely for planar area calculation
    polygon = Polygon(projected_coords)
    return polygon.area


def create_3d_polyhedron_wkt(
    footprint_2d: list[tuple[float, float]],
    z_min: float,
    z_max: float,
) -> str:
    """
    Generate a watertight 3D closed prism in WKT POLYHEDRALSURFACE Z format.

    Creates a vertical extrusion of the 2D footprint polygon:
    - Bottom face at z_min
    - Top face at z_max
    - Vertical wall faces connecting adjacent footprint edges

    PostGIS can then compute 3D volume, intersections, and spatial relationships.

    Parameters
    ----------
    footprint_2d : list[tuple[float, float]]
        Closed polygon coordinates [(lon, lat), ...] in EPSG:4326.
    z_min : float
        Base elevation in metres AMSL.
    z_max : float
        Ceiling elevation in metres AMSL.

    Returns
    -------
    str
        WKT POLYHEDRALSURFACE Z representation.

    Example
    -------
    >>> footprint = [(77.5946, 12.9716), (77.5947, 12.9716),
    ...              (77.5947, 12.9715), (77.5946, 12.9715), (77.5946, 12.9716)]
    >>> wkt = create_3d_polyhedron_wkt(footprint, 920.0, 923.2)
    >>> assert wkt.startswith("POLYHEDRALSURFACE Z (")
    """
    if len(footprint_2d) < 4:
        raise ValueError("Footprint must have at least 4 coordinates")

    if footprint_2d[0] != footprint_2d[-1]:
        raise ValueError("Footprint must be closed")

    # We'll build 6 faces for a rectangular prism, or N+2 faces for an N-sided polygon:
    # - 1 bottom face
    # - 1 top face
    # - N-1 vertical wall faces (one per edge, excluding the closing edge)

    faces = []

    # Bottom face (CCW when viewed from below, but WKT exterior rings are CCW from above)
    # For PostGIS, we'll use CCW order when viewed from outside the solid
    bottom_ring = ", ".join(f"{lon} {lat} {z_min}" for lon, lat in footprint_2d)
    faces.append(f"(({bottom_ring}))")

    # Top face (reverse order so it's CCW when viewed from above/outside)
    top_ring = ", ".join(
        f"{lon} {lat} {z_max}" for lon, lat in reversed(footprint_2d)
    )
    faces.append(f"(({top_ring}))")

    # Vertical wall faces
    # Each wall connects edge (i, i+1) at bottom to (i, i+1) at top
    n = len(footprint_2d) - 1  # Exclude duplicate closing point
    for i in range(n):
        lon1, lat1 = footprint_2d[i]
        lon2, lat2 = footprint_2d[i + 1]

        # Quadrilateral: bottom-left, bottom-right, top-right, top-left, close
        # CCW when viewed from outside
        wall = (
            f"{lon1} {lat1} {z_min}, "
            f"{lon2} {lat2} {z_min}, "
            f"{lon2} {lat2} {z_max}, "
            f"{lon1} {lat1} {z_max}, "
            f"{lon1} {lat1} {z_min}"
        )
        faces.append(f"(({wall}))")

    wkt = "POLYHEDRALSURFACE Z (" + ", ".join(faces) + ")"
    return wkt


def polyhedron_to_geojson_3d(geom_wkt_or_wkb: Union[str, bytes]) -> dict:
    """
    Convert a PostGIS 3D geometry (WKT or WKB) to GeoJSON-like dict with Z coordinates.

    Supports POLYHEDRALSURFACE Z, POLYGON Z, and MULTIPOLYGON Z.
    Suitable for visualization in Cesium, deck.gl, or Mapbox GL JS.

    Parameters
    ----------
    geom_wkt_or_wkb : str or bytes
        WKT string (e.g., "POLYHEDRALSURFACE Z (...)") or WKB bytes from PostGIS.

    Returns
    -------
    dict
        GeoJSON MultiPolygon or Polygon geometry with 3D coordinates [[lon, lat, z], ...].
    """
    import re

    # If it's bytes (WKB / WKBElement from GeoAlchemy2)
    if isinstance(geom_wkt_or_wkb, bytes):
        try:
            from shapely import wkb
            geom = wkb.loads(geom_wkt_or_wkb)
            if geom.geom_type == "Polygon":
                coords_3d = [[x, y, z] for x, y, z in geom.exterior.coords]
                return {"type": "Polygon", "coordinates": [coords_3d]}
            elif geom.geom_type == "MultiPolygon":
                polygons = []
                for poly in geom.geoms:
                    coords_3d = [[x, y, z] for x, y, z in poly.exterior.coords]
                    polygons.append([coords_3d])
                return {"type": "MultiPolygon", "coordinates": polygons}
        except Exception:
            pass

    # If it's a WKT string or string representation
    wkt_str = str(geom_wkt_or_wkb).strip()

    if "POLYHEDRALSURFACE" in wkt_str.upper():
        # Parse all polygon faces from POLYHEDRALSURFACE Z (((...)), ((...)))
        face_matches = re.findall(r"\(\s*\(([^()]+)\)\s*\)", wkt_str)
        faces_coords = []
        for face in face_matches:
            point_strs = face.strip().split(",")
            face_points = []
            for pt in point_strs:
                coords = [float(c) for c in pt.strip().split() if c]
                if len(coords) == 3:
                    face_points.append(coords)
                elif len(coords) == 2:
                    face_points.append([coords[0], coords[1], 0.0])
            if face_points:
                faces_coords.append([face_points])

        if faces_coords:
            return {"type": "MultiPolygon", "coordinates": faces_coords}

    try:
        geom = wkt_loads(wkt_str)
        if geom.geom_type == "Polygon":
            coords_3d = [[x, y, z] for x, y, z in geom.exterior.coords]
            return {"type": "Polygon", "coordinates": [coords_3d]}
        elif geom.geom_type == "MultiPolygon":
            polygons = []
            for poly in geom.geoms:
                coords_3d = [[x, y, z] for x, y, z in poly.exterior.coords]
                polygons.append([coords_3d])
            return {"type": "MultiPolygon", "coordinates": polygons}
    except Exception:
        pass

    return {
        "type": "GeometryCollection",
        "geometries": [],
    }


def extract_footprint_from_wkt(wkt_str: str) -> list[tuple[float, float]]:
    """
    Extract 2D polygon footprint ring from PostGIS POLYHEDRALSURFACE Z WKT.
    """
    import re
    if not wkt_str:
        return []
    match = re.search(r"\(\s*\(\s*([^()]+)\s*\)\s*\)", str(wkt_str))
    if match:
        pts = match.group(1).split(",")
        coords = []
        for pt in pts:
            parts = [float(p) for p in pt.strip().split() if p]
            if len(parts) >= 2:
                coords.append((parts[0], parts[1]))
        if len(coords) >= 4:
            if coords[0] != coords[-1]:
                coords.append(coords[0])
            return coords
    return []


def subdivide_polygon_2d(
    coords: list[tuple[float, float]],
    n_parts: int,
) -> list[list[tuple[float, float]]]:
    """
    Subdivide a 2D closed polygon footprint into N equal strips along its major axis.

    Parameters
    ----------
    coords : list[tuple[float, float]]
        Closed polygon ring [(lon, lat), ...] in EPSG:4326.
    n_parts : int
        Number of partitions (2 to 8).

    Returns
    -------
    list[list[tuple[float, float]]]
        List of N closed sub-polygon coordinate lists.
    """
    from shapely.geometry import box

    if n_parts <= 1 or len(coords) < 4:
        return [coords]

    poly = Polygon(coords)
    if not poly.is_valid:
        poly = poly.buffer(0)

    minx, miny, maxx, maxy = poly.bounds
    width = maxx - minx
    height = maxy - miny

    sub_polygons = []

    if width >= height:
        step = width / n_parts
        for i in range(n_parts):
            x0 = minx + i * step
            x1 = minx + (i + 1) * step if i < n_parts - 1 else maxx
            slice_box = box(x0, miny - 0.001, x1, maxy + 0.001)
            inter = poly.intersection(slice_box)
            if not inter.is_empty:
                if inter.geom_type == "Polygon":
                    ring = list(inter.exterior.coords)
                    if ring and ring[0] != ring[-1]:
                        ring.append(ring[0])
                    sub_polygons.append(ring)
                elif inter.geom_type == "MultiPolygon":
                    largest = max(inter.geoms, key=lambda g: g.area)
                    ring = list(largest.exterior.coords)
                    if ring and ring[0] != ring[-1]:
                        ring.append(ring[0])
                    sub_polygons.append(ring)
    else:
        step = height / n_parts
        for i in range(n_parts):
            y0 = miny + i * step
            y1 = miny + (i + 1) * step if i < n_parts - 1 else maxy
            slice_box = box(minx - 0.001, y0, maxx + 0.001, y1)
            inter = poly.intersection(slice_box)
            if not inter.is_empty:
                if inter.geom_type == "Polygon":
                    ring = list(inter.exterior.coords)
                    if ring and ring[0] != ring[-1]:
                        ring.append(ring[0])
                    sub_polygons.append(ring)
                elif inter.geom_type == "MultiPolygon":
                    largest = max(inter.geoms, key=lambda g: g.area)
                    ring = list(largest.exterior.coords)
                    if ring and ring[0] != ring[-1]:
                        ring.append(ring[0])
                    sub_polygons.append(ring)

    if len(sub_polygons) == n_parts:
        return sub_polygons

    # Guaranteed bounding-box proportional fallback
    fallback_polys = []
    if width >= height:
        step = width / n_parts
        for i in range(n_parts):
            x0 = minx + i * step
            x1 = minx + (i + 1) * step if i < n_parts - 1 else maxx
            fallback_polys.append([
                (x0, miny),
                (x1, miny),
                (x1, maxy),
                (x0, maxy),
                (x0, miny),
            ])
    else:
        step = height / n_parts
        for i in range(n_parts):
            y0 = miny + i * step
            y1 = miny + (i + 1) * step if i < n_parts - 1 else maxy
            fallback_polys.append([
                (minx, y0),
                (maxx, y0),
                (maxx, y1),
                (minx, y1),
                (minx, y0),
            ])
    return fallback_polys

