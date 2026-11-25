"""
FastAPI Microservice Wrapper for 3D Segmentation, Drone Building Extraction, and Floor Plan Unit Ingestion.

Run with:
    uvicorn server:app --host 0.0.0.0 --port 8001 --reload
"""

import os
import sys
from pathlib import Path

# Add ml_engine directory to Python path so model imports work from root
ml_engine_path = Path(__file__).resolve().parent / "ml_engine"
if ml_engine_path.exists() and str(ml_engine_path) not in sys.path:
    sys.path.insert(0, str(ml_engine_path))

# Import the FastAPI application instance from ml_engine.server
from ml_engine.server import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8001, reload=True)
