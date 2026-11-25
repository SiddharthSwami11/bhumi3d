"""
FastAPI application entry-point.

Configures CORS, bootstraps the database on startup,
and exposes a health-check root endpoint.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_ingestion import router as ingestion_router
from app.api.routes_parcels import router as parcels_router
from app.core.config import settings
from app.core.database import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Bhumi3D API",
    version="1.0.0",
    description="High-performance backend for 3D ULPIN Generation, PostGIS Volumetric Cadastre, and Spatial Dispute Detection.",
)

# Register API routers
app.include_router(parcels_router)
app.include_router(ingestion_router)

# --- CORS -------------------------------------------------------------------
allowed_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_URL", "http://localhost:5173").split(",")
    if origin.strip()
]
allow_all_origins = "*" in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Lifecycle events --------------------------------------------------------
@app.on_event("startup")
def on_startup() -> None:
    """Ensure PostGIS extensions exist and tables are materialised."""
    logger.info("Starting %s …", settings.PROJECT_NAME)
    try:
        init_db()
        logger.info("Database initialised successfully.")
    except Exception:
        logger.exception("Database initialisation failed — check connection.")
        raise


# --- Health-check ------------------------------------------------------------
@app.get("/healthz", tags=["health"])
def healthz():
    """Render liveness probe."""
    return {"status": "ok"}


@app.get("/", tags=["health"])
def health_check():
    """Lightweight liveness probe."""
    return {
        "status": "healthy",
        "service": "3D ULPIN Engine",
        "database": "connected",
    }
