# Complete Setup Guide - 3D ULPIN Cadastre System

**Last Updated:** 2026-08-29  
**Project:** SIH 2026 - 3D ULPIN Generation and Vertical Property Mapping System

---

## 📋 System Overview

This is a **full-stack 3D Digital Twin Cadastre System** with:
- **Backend:** FastAPI + PostgreSQL + PostGIS + SQLAlchemy + GeoAlchemy2
- **Frontend:** React 19 + TypeScript + CesiumJS + Tailwind CSS
- **Features:** 3D volumetric property units, spatial clash detection, real-time filtering, property inspector

---

## 🔧 Prerequisites

1. **Python 3.12+**
2. **Node.js 18+** and npm
3. **Docker Desktop** (for PostgreSQL + PostGIS)
4. **Git Bash** or PowerShell (Windows)

---

## 🚀 Quick Start Guide

### Step 1: Start PostgreSQL + PostGIS Database

```bash
cd C:/Users/Siddharth/OneDrive/Desktop/SIH-2026/3d-ulpin-system
docker-compose up -d
```

Verify the database is running:
```bash
docker-compose ps
```

### Step 2: Setup Backend

#### Option A: Using `backend/venv` (Recommended)

```bash
cd backend

# Activate virtual environment
./venv/Scripts/activate  # Windows Git Bash
# OR
.\venv\Scripts\activate.bat  # Windows CMD
# OR
.\venv\Scripts\Activate.ps1  # Windows PowerShell

# Verify installation
python -c "import geoalchemy2, shapely, fastapi; print('All imports OK')"

# Populate seed data (5-storey building with 26 units)
python seed_data.py

# Start FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Option B: Using root `.venv`

```bash
cd C:/Users/Siddharth/OneDrive/Desktop/SIH-2026/3d-ulpin-system

# Activate virtual environment
./.venv/Scripts/activate

cd backend

# Populate seed data
python seed_data.py

# Start FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Backend should now be running at:** `http://localhost:8000`

Test the API:
```bash
curl http://localhost:8000/
curl http://localhost:8000/api/parcels/3d-geojson
```

### Step 3: Setup Frontend

Open a **new terminal** (keep the backend running):

```bash
cd frontend

# Install vite-plugin-cesium (required for CesiumJS)
npm install vite-plugin-cesium --save-dev

# Install all dependencies (if not already installed)
npm install

# Start development server
npm run dev
```

**Frontend should now be running at:** `http://localhost:5173`

---

## 🎯 Expected Results

### Backend Seed Data Output:

```
================================================================================
3D ULPIN System - Seed Data Generator
================================================================================
Base Parcel: 14KA8829103841
Location: 12.9716°N, 77.5946°E
Base MSL: 920.0m
================================================================================

[LEVEL -1] Creating underground basement parking...
  [+] B1-Parking | ULPIN: 14KA8829103841-U-000035000000-B1PARK

[LEVEL 0] Creating residential units...
  [+] Flat-001 | Owner: Rajesh Kumar
  [+] Flat-002 | Owner: Priya Sharma
  ...

[CLASH] Creating intentional unauthorized mezzanine (Flat-202X)...
  [!] Flat-202X | UNAUTHORIZED

[CLASH DETECTION] Running 3D spatial topology verification...
[RESULT] Detected 2-3 spatial conflict(s).

================================================================================
TOTAL UNITS: 26
CLASHING UNITS: 3
================================================================================
```

### Frontend 3D Viewer:

1. **Initial view:** Camera flies to Bangalore at 77.5946°E, 12.9716°N
2. **3D Building:** 5-storey residential building + 1 basement level rendered
3. **Color Coding:**
   - 🟢 Emerald Green: Residential units
   - 🔵 Sky Blue: Commercial units
   - 🟡 Amber/Gold: Common areas (lifts, stairs)
   - 🟣 Purple: Basement parking
   - 🔴 **Bright Red (Pulsing):** Clashing units (Flat-202X)

---

## 🎮 Interactive Features

### 1. Click on 3D Units
- Click any volumetric unit to see property details in the right sidebar
- Shows: Unit Number, 3D-ULPIN, Owner, Floor, Area, Volume, Elevation, RERA registration
- Red warning banner for clashing units

### 2. Floor Isolation
- Use floor buttons: `All | B1 | G | 1 | 2 | 3 | 4`
- Isolates a single floor for inspection

### 3. Layer Filters
- Toggle visibility for:
  - Underground (U) - Basements
  - Surface (S) - Ground level
  - Above Ground (A) - Floors 1+

### 4. Dispute Audit Mode
- Click "Dispute Mode" button
- Immediately isolates only clashing units
- Highlights Flat-202X and its conflicts

### 5. Search
- Search by 3D-ULPIN or Unit Number
- Auto-zooms to the selected unit

### 6. Copy ULPIN
- Click copy icon next to 3D-ULPIN in sidebar
- Copies full Bhu-Aadhaar 3D identifier to clipboard

---

## 🧪 Testing

### Backend Tests (19 tests):
```bash
cd backend
./venv/Scripts/python.exe test_suite.py
# Expected: Ran 19 tests in 0.018s - OK
```

### API Endpoints to Test:

**Health Check:**
```bash
curl http://localhost:8000/
```

**Get All Units (3D GeoJSON):**
```bash
curl http://localhost:8000/api/parcels/3d-geojson
```

**Get Clashing Units Only:**
```bash
curl "http://localhost:8000/api/parcels/3d-geojson?clash_only=true"
```

**Get Unit Details:**
```bash
curl http://localhost:8000/api/parcels/details/14KA8829103841-A-009232009264-FLAT20
```

**Clash Report:**
```bash
curl http://localhost:8000/api/parcels/clashes
```

**Create New Unit:**
```bash
curl -X POST http://localhost:8000/api/parcels/create-unit \
  -H "Content-Type: application/json" \
  -d '{
    "base_2d_ulpin": "14KA8829103841",
    "footprint_coords": [[77.5946, 12.9716], [77.5948, 12.9716], [77.5948, 12.9717], [77.5946, 12.9717], [77.5946, 12.9716]],
    "unit_number": "Flat-501",
    "floor_level": 5,
    "unit_type": "RESIDENTIAL",
    "layer_type": "A",
    "z_min": 936.0,
    "z_max": 939.2,
    "owner_name": "New Owner"
  }'
```

---

## 🛠️ Troubleshooting

### Issue: `ModuleNotFoundError: No module named 'geoalchemy2'`

**Solution:** Ensure you're using the correct virtual environment:

```bash
# Windows - Use the full path
C:/Users/Siddharth/OneDrive/Desktop/SIH-2026/3d-ulpin-system/backend/venv/Scripts/python.exe seed_data.py

# OR activate the venv first
cd backend
./venv/Scripts/activate
python seed_data.py
```

Both `backend/venv` and root `.venv` now have all dependencies installed.

### Issue: Frontend shows "Connection Error"

1. Verify backend is running on port 8000
2. Check `docker-compose ps` - PostgreSQL should be running
3. Check backend logs for errors

### Issue: CesiumJS not loading / blank screen

1. Ensure `vite-plugin-cesium` is installed:
   ```bash
   cd frontend
   npm install vite-plugin-cesium --save-dev
   ```
2. Clear browser cache and reload
3. Check browser console for errors

### Issue: Docker container won't start

```bash
# Stop and remove existing containers
docker-compose down

# Remove volumes and restart
docker-compose down -v
docker-compose up -d
```

---

## 📂 Project Structure

```
3d-ulpin-system/
├── backend/
│   ├── app/
│   │   ├── api/                    # REST API routes
│   │   ├── core/                   # Config, database, ULPIN encoder
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   ├── schemas/                # Pydantic request/response models
│   │   └── services/               # Business logic (geometry, clash detection)
│   ├── venv/                       # Python virtual environment
│   ├── seed_data.py                # Populates test data
│   ├── test_suite.py               # 19 unit tests
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/             # React components (CesiumViewer, Sidebar, Toolbar)
│   │   ├── types/                  # TypeScript type definitions
│   │   ├── App.tsx                 # Main dashboard
│   │   └── index.css               # Tailwind + custom styles
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
├── docker-compose.yml              # PostgreSQL + PostGIS
├── BACKEND_STATUS.md               # Backend documentation
├── IMPLEMENTATION_COMPLETE.md      # Full technical docs
├── FRONTEND_COMPLETE.md            # Frontend documentation
└── SETUP_GUIDE.md                  # This file
```

---

## 🌟 Key Features Implemented

### Backend:
✅ 3D ULPIN encoding/decoding with underground elevation support  
✅ PostGIS 3D spatial geometry (POLYHEDRALSURFACE Z)  
✅ Geodesic area calculation and volumetric extrusion  
✅ ST_3DIntersects clash detection  
✅ RESTful API with 3D GeoJSON export  
✅ Seed script with intentional clash (Flat-202X)  
✅ 19/19 tests passing  

### Frontend:
✅ CesiumJS 3D globe with volumetric property units  
✅ Interactive click-to-inspect with property cards  
✅ Floor isolation and layer toggles  
✅ Dispute audit mode (clash highlighting)  
✅ Real-time search with auto-zoom  
✅ Glassmorphic UI with Tailwind CSS  
✅ Full TypeScript type safety  

---

## 📝 Next Steps

1. **Run the seed script** to populate test data
2. **Open the frontend** at `http://localhost:5173`
3. **Click "Dispute Mode"** to see Flat-202X clash detection
4. **Test floor isolation** and layer toggles
5. **Search for units** by ULPIN or name

---

## 🎓 Learning Resources

- **PostGIS 3D Functions:** https://postgis.net/docs/reference.html#reference_sfcgal
- **CesiumJS Documentation:** https://cesium.com/learn/cesiumjs-learn/
- **FastAPI Guide:** https://fastapi.tiangolo.com/
- **GeoJSON Specification:** https://geojson.org/

---

**System is ready for demonstration and further development!** 🚀
