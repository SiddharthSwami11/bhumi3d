"""
Database engine, session factory, and initialisation helpers.

Connects to PostgreSQL with PostGIS + SFCGAL and bootstraps the schema.
"""

import logging
import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

database_url = os.getenv("DATABASE_URL", settings.DATABASE_URL)
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db() -> None:
    """Create PostGIS extensions and materialise all ORM tables."""
    # Import models so Base.metadata knows about them before create_all.
    import app.models.property_unit  # noqa: F401

    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        logger.info("PostGIS extension ensured.")

        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis_sfcgal;"))
            logger.info("SFCGAL extension ensured.")
        except Exception:
            logger.warning(
                "postgis_sfcgal not available in this image — "
                "3D volume operations will fall back to GEOS. "
                "Use postgis/postgis:16-3.4-alpine or a custom image "
                "with SFCGAL for full 3D support."
            )

        # Ensure enum values are updated in PostgreSQL
        try:
            conn.execute(text("ALTER TYPE unittype ADD VALUE IF NOT EXISTS 'CONTEXT_PARCEL';"))
            conn.execute(text("ALTER TYPE grievancestatus ADD VALUE IF NOT EXISTS 'RESOLVED';"))
            logger.info("PostgreSQL enums updated.")
        except Exception as e:
            logger.debug("Enum update check: %s", e)

        # Ensure schema migrations for grievance_records table
        try:
            conn.execute(text("ALTER TABLE grievance_records ADD COLUMN IF NOT EXISTS building_name VARCHAR(100);"))
            conn.execute(text("ALTER TABLE grievance_records ADD COLUMN IF NOT EXISTS plot_number VARCHAR(50);"))
            conn.execute(text("ALTER TABLE grievance_records ADD COLUMN IF NOT EXISTS flat_number VARCHAR(50);"))
            conn.execute(text("ALTER TABLE grievance_records ADD COLUMN IF NOT EXISTS resolution_reason VARCHAR(100);"))
            conn.execute(text("ALTER TABLE grievance_records ADD COLUMN IF NOT EXISTS resolution_notes TEXT;"))
            conn.execute(text("ALTER TABLE grievance_records ADD COLUMN IF NOT EXISTS document_filename VARCHAR(255);"))
            logger.info("Grievance records schema verified and updated.")
        except Exception as e:
            logger.debug("Grievance schema migration check: %s", e)

        conn.commit()

    Base.metadata.create_all(bind=engine)
    logger.info("All tables created / verified.")


def get_db():
    """FastAPI dependency that yields a scoped database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
