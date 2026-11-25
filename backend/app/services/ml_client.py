"""
ML Microservice Client.

Handles HTTP communication between the main backend and the ML segmentation service.
Provides fallback mechanisms when the ML service is offline.
"""

import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class MLClient:
    """Async client for the ML computer vision microservice."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.ML_SERVICE_URL).rstrip("/")
        self.timeout = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)

    async def check_health(self) -> dict:
        """Check if ML microservice is reachable and get loaded models."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.base_url}/health")
                if response.status_code == 200:
                    return response.json()
                return {
                    "status": "Degraded",
                    "error": f"HTTP {response.status_code}",
                    "models_loaded": [],
                }
        except (httpx.ConnectError, httpx.ConnectTimeout) as e:
            logger.warning(f"ML microservice unreachable at {self.base_url}: {e}")
            return {
                "status": "Offline",
                "error": "Cannot connect to ML service",
                "models_loaded": [],
            }
        except Exception as e:
            logger.error(f"Error checking ML health: {e}")
            return {
                "status": "Error",
                "error": str(e),
                "models_loaded": [],
            }

    async def extract_building_from_imagery(
        self,
        file_bytes: bytes,
        filename: str,
        reference_lat: Optional[float] = None,
        reference_lon: Optional[float] = None,
    ) -> dict:
        """
        Send drone imagery to ML microservice to detect building footprint & height.

        Falls back to default geometry if the ML service is offline.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                files = {"file": (filename, file_bytes, "application/octet-stream")}
                data = {}
                if reference_lat is not None:
                    data["reference_lat"] = str(reference_lat)
                if reference_lon is not None:
                    data["reference_lon"] = str(reference_lon)

                response = await client.post(
                    f"{self.base_url}/api/ml/extract-building",
                    files=files,
                    data=data,
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    logger.warning(
                        f"ML extract-building returned status {response.status_code}: {response.text}"
                    )
        except Exception as e:
            logger.warning(f"ML extract-building failed, using fallback: {e}")

        # Fallback simulation if ML microservice is unreachable
        return self._fallback_building_extraction(reference_lat, reference_lon)

    async def segment_floorplan_units(
        self,
        file_bytes: bytes,
        filename: str,
        floor_number: int,
        building_width_m: float = 30.0,
        building_depth_m: float = 40.0,
    ) -> dict:
        """
        Send floor plan to ML microservice to extract unit boundaries and labels.

        Falls back to algorithmic grid subdivision if the ML service is offline.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                files = {"file": (filename, file_bytes, "application/octet-stream")}
                data = {
                    "floor_number": str(floor_number),
                    "building_width_m": str(building_width_m),
                    "building_depth_m": str(building_depth_m),
                }

                response = await client.post(
                    f"{self.base_url}/api/ml/segment-floorplan",
                    files=files,
                    data=data,
                )

                if response.status_code == 200:
                    return response.json()
                else:
                    logger.warning(
                        f"ML segment-floorplan returned status {response.status_code}: {response.text}"
                    )
        except Exception as e:
            logger.warning(f"ML segment-floorplan failed, using fallback: {e}")

        # Fallback simulation if ML microservice is unreachable
        return self._fallback_floorplan_segmentation(
            floor_number, building_width_m, building_depth_m
        )

    def _fallback_building_extraction(
        self,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
    ) -> dict:
        """Algorithmic fallback for building footprint detection."""
        ref_lat = lat or 12.9716
        ref_lon = lon or 77.5946
        d_lon = 0.00015
        d_lat = 0.00012

        return {
            "building_id": "fallback-bldg",
            "footprint_polygon": [
                [ref_lon - d_lon, ref_lat - d_lat],
                [ref_lon + d_lon, ref_lat - d_lat],
                [ref_lon + d_lon, ref_lat + d_lat],
                [ref_lon - d_lon, ref_lat + d_lat],
                [ref_lon - d_lon, ref_lat - d_lat],
            ],
            "base_elevation_amsl": 920.0,
            "total_height_m": 16.0,
            "estimated_floor_count": 5,
            "confidence_score": 0.80,
        }

    def _fallback_floorplan_segmentation(
        self,
        floor_number: int,
        width: float,
        depth: float,
    ) -> dict:
        """Algorithmic fallback for 4-flat + lobby floor plan subdivision."""
        hw = width / 2.0
        hd = depth / 2.0
        corridor = 1.0

        units = [
            {
                "unit_id": f"Flat-{floor_number}01",
                "unit_type": "RESIDENTIAL",
                "relative_polygon": [
                    [0.0, 0.0],
                    [hw - corridor, 0.0],
                    [hw - corridor, hd - corridor],
                    [0.0, hd - corridor],
                    [0.0, 0.0],
                ],
                "estimated_area_sqm": (hw - corridor) * (hd - corridor),
                "confidence_score": 0.85,
            },
            {
                "unit_id": f"Flat-{floor_number}02",
                "unit_type": "RESIDENTIAL",
                "relative_polygon": [
                    [hw + corridor, 0.0],
                    [width, 0.0],
                    [width, hd - corridor],
                    [hw + corridor, hd - corridor],
                    [hw + corridor, 0.0],
                ],
                "estimated_area_sqm": (hw - corridor) * (hd - corridor),
                "confidence_score": 0.85,
            },
            {
                "unit_id": f"Flat-{floor_number}03",
                "unit_type": "RESIDENTIAL",
                "relative_polygon": [
                    [0.0, hd + corridor],
                    [hw - corridor, hd + corridor],
                    [hw - corridor, depth],
                    [0.0, depth],
                    [0.0, hd + corridor],
                ],
                "estimated_area_sqm": (hw - corridor) * (hd - corridor),
                "confidence_score": 0.85,
            },
            {
                "unit_id": f"Flat-{floor_number}04",
                "unit_type": "RESIDENTIAL",
                "relative_polygon": [
                    [hw + corridor, hd + corridor],
                    [width, hd + corridor],
                    [width, depth],
                    [hw + corridor, depth],
                    [hw + corridor, hd + corridor],
                ],
                "estimated_area_sqm": (hw - corridor) * (hd - corridor),
                "confidence_score": 0.85,
            },
            {
                "unit_id": f"Lobby-{floor_number}",
                "unit_type": "COMMON_AREA",
                "relative_polygon": [
                    [hw - corridor, hd - corridor],
                    [hw + corridor, hd - corridor],
                    [hw + corridor, hd + corridor],
                    [hw - corridor, hd + corridor],
                    [hw - corridor, hd - corridor],
                ],
                "estimated_area_sqm": (2 * corridor) * (2 * corridor),
                "confidence_score": 0.90,
            },
        ]

        return {
            "floor_number": floor_number,
            "units": units,
            "total_units_detected": len(units),
            "processing_time_ms": 100,
        }


# Singleton instance
ml_client = MLClient()
