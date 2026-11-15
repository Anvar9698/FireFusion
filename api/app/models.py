from typing import Any, Literal

from pydantic import BaseModel


Sensor = Literal["MODIS", "VIIRS"]
Platform = Literal["Terra", "Aqua", "NOAA-20", "NOAA-21"]


class DatasetFile(BaseModel):
    file: str
    platform: str
    sensor: Sensor
    acquisition_dates: list[str]
    file_modified_at_utc: str
    product_version: str
    rows: int
    missing_values: int
    malformed_rows: int
    exact_duplicate_rows: int
    repeated_time_coordinate_keys: int


class SummaryResponse(BaseModel):
    total_detections: int
    date_range: dict[str, str | None]
    by_sensor: dict[str, int]
    by_platform: dict[str, int]
    files: list[DatasetFile]
    data_notes: list[str]


class EventRecord(BaseModel):
    event_id: str
    event_date: str
    time_window_utc: str
    latitude: float
    longitude: float
    detection_count: int
    modis_detections: int
    viirs_detections: int
    modis_native_high: int
    viirs_native_high: int
    sensors: list[str]
    platforms: list[str]
    fai: float
    max_frp_mw: float
    mean_frp_mw: float
    risk_index: float
    confidence_summary: dict[str, Any]


class EventCollection(BaseModel):
    total: int
    items: list[EventRecord]
    method: str


class CalendarDay(BaseModel):
    date: str
    total_detections: int
    by_sensor: dict[str, int]
    max_frp_mw: float
    mean_frp_mw: float
    high_fai_events: int
    activity_level: Literal["quiet", "moderate", "elevated", "high"]


class CalendarResponse(BaseModel):
    days: list[CalendarDay]
    date_range: dict[str, str | None]


class AnalyticsResponse(BaseModel):
    daily: list[dict[str, Any]]
    platforms: list[dict[str, Any]]
    confidence: list[dict[str, Any]]
    frp: dict[str, dict[str, float | int]]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    dataset_loaded: bool
    detections: int
    files: int
    message: str
