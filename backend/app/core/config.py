"""
Application settings loaded from environment variables.
Uses pydantic-settings for validation and defaults.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Bhumi3D API"
    DATABASE_URL: str = "postgresql://postgres:postgrespassword@localhost:5432/ulpin_db"
    ML_SERVICE_URL: str = "http://localhost:8001"
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
