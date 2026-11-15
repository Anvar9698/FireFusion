from __future__ import annotations

import os
from functools import lru_cache
from typing import Annotated, Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import geopandas as gpd
import pandas as pd

from .data import (
    DatasetError, get_event_detections, get_event_frame, get_event_key_frame,
    get_geo_frame, load_dataset,
)
from .config import DATA_FOLDERS, PROJECT_ROOT
from .models import (
    AnalyticsResponse, CalendarDay, CalendarResponse, EventCollection,
    EventRecord, HealthResponse, SummaryResponse,
)

app = FastAPI(
    title="FireFusion API",
    description=(
        "Sensor-aware access to NASA FIRMS MODIS and VIIRS NRT active-fire "
        "detections. Events, agreement, and risk are derived indicators, not "
        "validated fire perimeters or forecasts."
    ),
    version="1.0.0",
)
cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.environ.get(
        "FIREFUSION_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _dataset() -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    try:
        return load_dataset()
    except DatasetError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _events() -> pd.DataFrame:
    try:
        return get_event_frame()
    except DatasetError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _safe_float(value: Any) -> float:
    if pd.isna(value):
        return 0.0
    return float(value)


@lru_cache(maxsize=1)
def _agreement_summary() -> dict[str, Any]:
    detections, _ = _dataset()
    keys = get_event_key_frame(detections)
    event_keys = ["event_date", "time_window_utc", "cell_lat", "cell_lon"]
    sensor_groups = keys.assign(sensor=detections["sensor"].to_numpy()).drop_duplicates()
    sensor_counts = sensor_groups.groupby(
        event_keys, sort=False, observed=True,
    ).size()
    group_counts = sensor_counts.value_counts()
    single_sensor_groups = sensor_groups.set_index(event_keys)["sensor"]
    single_sensor_groups = single_sensor_groups.loc[
        single_sensor_groups.index.isin(sensor_counts.index[sensor_counts.eq(1)])
    ]
    modis_only_events = int(single_sensor_groups.eq("MODIS").sum())
    viirs_only_events = int(single_sensor_groups.eq("VIIRS").sum())
    fai_50 = int(group_counts.get(1, 0))
    fai_100 = int(group_counts.get(2, 0))
    total_groups = fai_50 + fai_100

    modis_confidence = pd.to_numeric(
        detections.loc[detections["sensor"].eq("MODIS"), "confidence_raw"],
        errors="raise",
    )
    viirs_confidence = detections.loc[
        detections["sensor"].eq("VIIRS"), "confidence_raw"
    ]
    confidence_by_sensor = {
        "MODIS": {
            "high": int(modis_confidence.ge(80).sum()),
            "medium": int((modis_confidence.ge(30) & modis_confidence.lt(80)).sum()),
            "low": int(modis_confidence.lt(30).sum()),
        },
        "VIIRS": {
            "high": int(viirs_confidence.eq("high").sum()),
            "medium": int(viirs_confidence.eq("nominal").sum()),
            "low": int(viirs_confidence.eq("low").sum()),
        },
    }
    confidence_counts = {
        level: sum(sensor_counts[level] for sensor_counts in confidence_by_sensor.values())
        for level in ("high", "medium", "low")
    }
    return {
        "total_detections": int(len(detections)),
        "total_groups": total_groups,
        "groups_by_fai": {"50": fai_50, "100": fai_100},
        "harmonized_events": fai_100,
        "modis_only_events": modis_only_events,
        "viirs_only_events": viirs_only_events,
        "average_fai": (50 * fai_50 + 100 * fai_100) / total_groups,
        "corroborated_groups": fai_100,
        "confidence_counts": confidence_counts,
        "confidence_by_sensor": confidence_by_sensor,
        "confidence_method": (
            "Display buckets use native product cutoffs: MODIS <30 / 30-79 / "
            "80-100 and VIIRS low / nominal / high. Counts are not cross-sensor "
            "calibrated or probability-equivalent."
        ),
        "method": (
            "FAI = 100 × distinct sensor groups / 2 in a UTC date, 2-hour, "
            "0.05-degree cell. 100 = multiple satellite agreement; 50 = "
            "single sensor agreement. Coarse association indicator only."
        ),
    }


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        frame, files = load_dataset()
        return HealthResponse(
            status="ok", dataset_loaded=True, detections=len(frame), files=len(files),
            message="All configured source files loaded and validated.",
        )
    except DatasetError as exc:
        return HealthResponse(
            status="degraded", dataset_loaded=False, detections=0, files=0,
            message=str(exc),
        )


@app.get("/api/summary", response_model=SummaryResponse)
def summary() -> SummaryResponse:
    frame, files = _dataset()
    return SummaryResponse(
        total_detections=int(len(frame)),
        date_range={
            "start": str(frame["acq_date"].min()) if not frame.empty else None,
            "end": str(frame["acq_date"].max()) if not frame.empty else None,
        },
        by_sensor={str(key): int(value) for key, value in frame["sensor"].value_counts().items()},
        by_platform={str(key): int(value) for key, value in frame["platform"].value_counts().items()},
        files=files,
        data_notes=[
            "Source records are NRT pixel detections, not fire perimeters.",
            "MODIS numeric confidence and VIIRS categorical confidence are not interchangeable.",
            "FRP is sensor/product-specific; cross-sensor values are not calibrated by this API.",
            "FAI and event groups use coarse space/time bins and are association proxies only.",
        ],
    )


@app.get("/api/detections")
def detections(
    start_date: str | None = None,
    end_date: str | None = None,
    sensor: list[str] | None = Query(default=None),
    platform: list[str] | None = Query(default=None),
    daynight: str | None = None,
    min_frp: float | None = Query(default=None, ge=0),
    bbox: str | None = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 2500,
) -> JSONResponse:
    frame, _ = _dataset()
    filtered = frame
    if start_date:
        filtered = filtered.loc[filtered["acq_date"].ge(start_date)]
    if end_date:
        filtered = filtered.loc[filtered["acq_date"].le(end_date)]
    if sensor:
        filtered = filtered.loc[filtered["sensor"].isin(sensor)]
    if platform:
        filtered = filtered.loc[filtered["platform"].isin(platform)]
    if daynight in {"Day", "Night"}:
        filtered = filtered.loc[filtered["daynight"].eq(daynight)]
    if min_frp is not None:
        filtered = filtered.loc[filtered["frp"].ge(min_frp)]
    if bbox:
        try:
            west, south, east, north = [float(value) for value in bbox.split(",")]
            if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south < north <= 90):
                raise ValueError("bounds out of range")
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="bbox must be west,south,east,north in WGS84") from exc
        lon_mask = (
            filtered["longitude"].between(west, east)
            if west <= east
            else filtered["longitude"].ge(west) | filtered["longitude"].le(east)
        )
        filtered = filtered.loc[
            lon_mask & filtered["latitude"].between(south, north)
        ]
    total = int(len(filtered))
    if total > limit:
        keep = [(index * total) // limit for index in range(limit)]
        filtered = filtered.iloc[keep]
    if filtered.empty:
        return JSONResponse({"type": "FeatureCollection", "features": [], "total": total})
    geoframe: gpd.GeoDataFrame = get_geo_frame(filtered)
    properties = [
        "detection_id", "sensor", "platform", "source_satellite", "product",
        "product_version", "frp_product", "acq_date", "acq_time",
        "daynight", "frp", "confidence_raw", "confidence_scheme", "scan", "track",
        "source_file", "latitude", "longitude", "satellite", "confidence", "version",
        "brightness", "bright_t31", "bright_ti4", "bright_ti5",
    ]
    geoframe = geoframe[properties + ["geometry"]]
    output = geoframe.to_json(drop_id=True, na="null")
    import json

    collection = json.loads(output)
    for feature in collection["features"]:
        feature["id"] = feature["properties"]["detection_id"]
    return JSONResponse({"type": "FeatureCollection", "features": collection["features"], "total": total})


def _event_items(
    frame: pd.DataFrame,
    start_date: str | None,
    end_date: str | None,
    minimum_fai: float,
    limit: int,
    native_high_both: bool = False,
) -> tuple[int, list[dict[str, Any]]]:
    result = frame
    if start_date:
        result = result.loc[result["event_date"].ge(start_date)]
    if end_date:
        result = result.loc[result["event_date"].le(end_date)]
    result = result.loc[result["fai"].ge(minimum_fai)]
    if native_high_both:
        result = result.loc[
            result["modis_native_high"].gt(0)
            & result["viirs_native_high"].gt(0)
        ]
    total = len(result)
    result = result.sort_values(["risk_index", "detection_count"], ascending=False).head(limit)
    items = []
    for row in result.to_dict(orient="records"):
        items.append({
            "event_id": row["event_id"],
            "event_date": row["event_date"],
            "time_window_utc": row["time_window_utc"],
            "latitude": _safe_float(row["latitude"]),
            "longitude": _safe_float(row["longitude"]),
            "detection_count": int(row["detection_count"]),
            "modis_detections": int(row["modis_detections"]),
            "viirs_detections": int(row["viirs_detections"]),
            "modis_native_high": int(row["modis_native_high"]),
            "viirs_native_high": int(row["viirs_native_high"]),
            "sensors": list(row["sensors"]),
            "platforms": list(row["platforms"]),
            "fai": _safe_float(row["fai"]),
            "max_frp_mw": _safe_float(row["max_frp_mw"]),
            "mean_frp_mw": _safe_float(row["mean_frp_mw"]),
            "risk_index": _safe_float(row["risk_index"]),
            "confidence_summary": {"source_categories": row["confidence_values"]},
        })
    return total, items


@app.get("/api/events", response_model=EventCollection)
def events(
    start_date: str | None = None,
    end_date: str | None = None,
    min_fai: Annotated[float, Query(ge=0, le=100)] = 0,
    native_high_both: bool = False,
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
) -> EventCollection:
    total, items = _event_items(
        _events(), start_date, end_date, min_fai, limit, native_high_both
    )
    return EventCollection(
        total=total,
        items=[EventRecord(**item) for item in items],
        method=(
            "Proxy groups by UTC date, 2-hour window, and 0.05-degree grid cell. "
            "FAI = 100 × distinct sensor families / 2 (MODIS, VIIRS); this is "
            "not a confirmed event match or probability."
        ),
    )


@app.get("/api/events/{event_id}/detections")
def event_detections(
    event_id: str,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> dict[str, Any]:
    total, items = get_event_detections(event_id, limit)
    if not total:
        raise HTTPException(status_code=404, detail="Candidate event was not found")
    return {"total": total, "items": items}


@app.get("/api/coverage")
def coverage() -> dict[str, Any]:
    frame, files = _dataset()
    expected_sources = list(DATA_FOLDERS)
    files_by_date: dict[str, set[str]] = {}
    for source_file in files:
        source = source_file["platform"]
        for date in source_file["acquisition_dates"]:
            files_by_date.setdefault(date, set()).add(source)

    days = [
        {
            "date": date,
            "source_groups_present": sorted(sources),
            "source_group_count": len(sources),
            "missing_sources": sorted(set(expected_sources) - sources),
        }
        for date, sources in sorted(files_by_date.items())
    ]
    return {
        "date_range": {
            "start": str(frame["acq_date"].min()) if not frame.empty else None,
            "end": str(frame["acq_date"].max()) if not frame.empty else None,
        },
        "acquisition_days": len(days),
        "source_file_count": len(files),
        "expected_sources": expected_sources,
        "days": days,
        "last_data_update_time": max(
            (source_file["file_modified_at_utc"] for source_file in files),
            default=None,
        ),
        "freshness_note": (
            "The displayed update time is the newest source file's local "
            "filesystem modification time, not a NASA publication or download timestamp."
        ),
        "coverage_note": (
            "Coverage describes source files included in this snapshot. It does "
            "not establish complete satellite observation coverage or mean no fire was detected."
        ),
    }


@app.get("/api/agreement")
def agreement() -> dict[str, Any]:
    return _agreement_summary()


@app.get("/api/harmonized-events")
def harmonized_events(
    bbox: str | None = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 5000,
) -> JSONResponse:
    frame = _events()
    frame = frame.loc[frame["fai"].eq(100)]
    if bbox:
        try:
            west, south, east, north = [float(value) for value in bbox.split(",")]
            if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south < north <= 90):
                raise ValueError("bounds out of range")
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail="bbox must be west,south,east,north in WGS84",
            ) from exc
        longitude_match = (
            frame["longitude"].between(west, east)
            if west <= east
            else frame["longitude"].ge(west) | frame["longitude"].le(east)
        )
        frame = frame.loc[longitude_match & frame["latitude"].between(south, north)]
    total = int(len(frame))
    if total > limit:
        frame = frame.iloc[[(index * total) // limit for index in range(limit)]]
    if frame.empty:
        return JSONResponse({"type": "FeatureCollection", "features": [], "total": total})
    geometry = gpd.GeoDataFrame(
        frame[[
            "event_id", "event_date", "time_window_utc", "detection_count",
            "sensors", "platforms", "fai", "max_frp_mw", "risk_index",
            "latitude", "longitude",
        ]].copy(),
        geometry=gpd.points_from_xy(frame["longitude"], frame["latitude"]),
        crs="EPSG:4326",
    )
    collection = geometry.to_json(drop_id=True)
    import json

    return JSONResponse({
        "type": "FeatureCollection",
        "features": json.loads(collection)["features"],
        "total": total,
    })


def _activity_level(count: int) -> str:
    if count >= 100_000:
        return "high"
    if count >= 50_000:
        return "elevated"
    if count >= 10_000:
        return "moderate"
    return "quiet"


@app.get("/api/calendar", response_model=CalendarResponse)
def calendar(
    start_date: str | None = None,
    end_date: str | None = None,
) -> CalendarResponse:
    frame, _ = _dataset()
    filtered = frame
    if start_date:
        filtered = filtered.loc[filtered["acq_date"].ge(start_date)]
    if end_date:
        filtered = filtered.loc[filtered["acq_date"].le(end_date)]
    event_frame = _events()
    if start_date:
        event_frame = event_frame.loc[event_frame["event_date"].ge(start_date)]
    if end_date:
        event_frame = event_frame.loc[event_frame["event_date"].le(end_date)]
    event_counts = event_frame.loc[event_frame["fai"].ge(100)].groupby("event_date").size()
    grouped = filtered.groupby("acq_date", sort=True)
    days: list[CalendarDay] = []
    for date, rows in grouped:
        count = len(rows)
        sensor_counts = rows["sensor"].value_counts()
        days.append(CalendarDay(
            date=str(date),
            total_detections=int(count),
            by_sensor={str(name): int(value) for name, value in sensor_counts.items()},
            max_frp_mw=float(rows["frp"].max()),
            mean_frp_mw=float(rows["frp"].mean()),
            high_fai_events=int(event_counts.get(str(date), 0)),
            activity_level=_activity_level(count),
        ))
    return CalendarResponse(
        days=days,
        date_range={
            "start": str(filtered["acq_date"].min()) if not filtered.empty else None,
            "end": str(filtered["acq_date"].max()) if not filtered.empty else None,
        },
    )


@app.get("/api/analytics", response_model=AnalyticsResponse)
def analytics() -> AnalyticsResponse:
    frame, _ = _dataset()
    daily: list[dict[str, Any]] = []
    for date, rows in frame.groupby("acq_date", sort=True):
        by_sensor = rows.groupby("sensor")["frp"].agg(["size", "median", "max"])
        daily.append({
            "date": str(date),
            "total": int(len(rows)),
            "modis": int(by_sensor.loc["MODIS", "size"]) if "MODIS" in by_sensor.index else 0,
            "viirs": int(by_sensor.loc["VIIRS", "size"]) if "VIIRS" in by_sensor.index else 0,
            "modis_median_frp": _safe_float(by_sensor.loc["MODIS", "median"]) if "MODIS" in by_sensor.index else 0,
            "viirs_median_frp": _safe_float(by_sensor.loc["VIIRS", "median"]) if "VIIRS" in by_sensor.index else 0,
        })
    platform_rows = []
    for platform, rows in frame.groupby("platform", sort=True):
        platform_rows.append({
            "platform": str(platform),
            "detections": int(len(rows)),
            "median_frp_mw": float(rows["frp"].median()),
            "day": int(rows["daynight"].eq("Day").sum()),
            "night": int(rows["daynight"].eq("Night").sum()),
        })
    confidence_rows = []
    for (sensor, confidence), count in frame.groupby(["sensor", "confidence_raw"], sort=True).size().items():
        confidence_rows.append({
            "sensor": str(sensor), "confidence": str(confidence), "detections": int(count),
        })
    frp = {
        str(sensor): {
            "count": int(len(rows)),
            "median_mw": float(rows["frp"].median()),
            "mean_mw": float(rows["frp"].mean()),
            "max_mw": float(rows["frp"].max()),
        }
        for sensor, rows in frame.groupby("platform", sort=True)
    }
    return AnalyticsResponse(daily=daily, platforms=platform_rows, confidence=confidence_rows, frp=frp)


@app.get("/api/risk")
def risk(
    start_date: str | None = None,
    end_date: str | None = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
) -> dict[str, Any]:
    total, items = _event_items(_events(), start_date, end_date, 0, limit)
    return {
        "total": total,
        "items": items,
        "interpretation": (
            "Activity-priority proxy, not a prediction of fire spread or life-safety risk. "
            "Score = 0.45 × min(100, 100 × log10(1 + max FRP MW) / 3) + "
            "0.35 × min(100, 100 × ln(1 + detection count) / ln(101)) + "
            "0.20 × FAI. It does not use weather, fuels, terrain, "
            "population, or validated incident boundaries."
        ),
    }


@app.get("/api/metadata")
def metadata() -> dict[str, Any]:
    _, files = _dataset()
    return {
        "confidence": {
            "MODIS": "Numeric native score (0-100); not a calibrated probability.",
            "VIIRS": "Native low/nominal/high category; not equivalent to MODIS numeric values.",
        },
        "frp": "Megawatts per detection; retain sensor/product identity for comparisons.",
        "pixel_resolution": {"MODIS": "approximately 1 km", "VIIRS": "approximately 375 m"},
        "files": files,
    }


FRONTEND_DIST = PROJECT_ROOT / "frontend-dist"
if FRONTEND_DIST.is_dir():
    assets = FRONTEND_DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def frontend(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        requested = (FRONTEND_DIST / full_path).resolve()
        if requested.is_relative_to(FRONTEND_DIST.resolve()) and requested.is_file():
            return FileResponse(requested)
        index = FRONTEND_DIST / "index.html"
        if not index.is_file():
            raise HTTPException(status_code=404, detail="Frontend build is unavailable")
        return FileResponse(index)
