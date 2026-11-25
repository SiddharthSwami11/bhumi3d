"""Test script to debug routes_parcels.py"""
from app.core.database import SessionLocal
from app.api.routes_parcels import get_all_units_3d_geojson

db = SessionLocal()
try:
    result = get_all_units_3d_geojson(base_2d_ulpin=None, floor_level=None, clash_only=False, db=db)
    print("SUCCESS! Feature count:", result["total_features"])
except Exception as e:
    import traceback
    print("FAILED WITH ERROR:")
    traceback.print_exc()
finally:
    db.close()
