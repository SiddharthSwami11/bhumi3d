"""Quick import and functionality test for all backend modules."""
import sys

print('Testing backend imports...\n')

# Test 1: Config
try:
    from app.core.config import settings
    print('[OK] app.core.config')
except Exception as e:
    print(f'[FAIL] app.core.config: {e}')
    sys.exit(1)

# Test 2: ULPIN Encoder
try:
    from app.core.ulpin_encoder import generate_3d_ulpin, parse_3d_ulpin
    result = generate_3d_ulpin('14DG8829103841', 'A', 125.0, 140.0, 'F402')
    parsed = parse_3d_ulpin(result)
    assert result == '14DG8829103841-A-001250001400-F402'
    assert parsed['z_min_m'] == 125.0
    print(f'[OK] app.core.ulpin_encoder (generated: {result})')
except Exception as e:
    print(f'[FAIL] app.core.ulpin_encoder: {e}')
    sys.exit(1)

# Test 3: Database
try:
    from app.core.database import Base, engine, SessionLocal, get_db, init_db
    print('[OK] app.core.database')
except Exception as e:
    print(f'[FAIL] app.core.database: {e}')
    sys.exit(1)

# Test 4: Models
try:
    from app.models.property_unit import VerticalPropertyUnit, UnitType, LayerType
    unit_types = [e.value for e in UnitType]
    layer_types = [e.value for e in LayerType]
    print(f'[OK] app.models.property_unit ({len(unit_types)} unit types, {len(layer_types)} layer types)')
except Exception as e:
    print(f'[FAIL] app.models.property_unit: {e}')
    sys.exit(1)

# Test 5: Main FastAPI app
try:
    from app.main import app
    routes = [r.path for r in app.routes]
    print(f'[OK] app.main (FastAPI app with {len(routes)} routes)')
except Exception as e:
    print(f'[FAIL] app.main: {e}')
    sys.exit(1)

print('\n✓ All imports successful!')
print('✓ No syntax errors or import issues detected')
