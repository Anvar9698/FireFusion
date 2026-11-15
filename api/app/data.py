from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
import hashlib
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd

from .config import DATA_FOLDERS, DATA_ROOT, EVENT_CELL_DEGREES, EVENT_TIME_WINDOW_HOURS, EXPECTED_COLUMNS

NUMERIC_COLUMNS = [
    "latitude", "longitude", "brightness", "bright_t31", "bright_ti4",
    "bright_ti5", "scan", "track", "frp",
]
NULL_TOKENS = {"", "na", "n/a", "null", "none"}


class DatasetError(RuntimeError):
    """Raised when source data cannot be loaded without losing records."""


def _validate_header(path: Path, sensor: str) -> list[str]:
    try:
        header = pd.read_csv(path, nrows=0).columns.tolist()
    except Exception as exc:
        raise DatasetError(f"Unable to read CSV header in {path}: {exc}") from exc
    expected = EXPECTED_COLUMNS[sensor]
    if header != expected:
        raise DatasetError(
            f"Unexpected schema in {path.name}. Expected {expected}, found {header}"
        )
    return header


def _normalize_file(path: Path, folder_platform: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    sensor = "MODIS" if folder_platform == "MODIS" else "VIIRS"
    header = _validate_header(path, sensor)
    try:
        frame = pd.read_csv(path, dtype={"confidence": "string"}, keep_default_na=False)
    except Exception as exc:
        raise DatasetError(f"Unable to read {path}: {exc}") from exc
    if list(frame.columns) != header:
        raise DatasetError(f"Header changed while reading {path}")

    missing_mask = frame.apply(
        lambda column: column.astype("string").str.strip().str.lower().isin(NULL_TOKENS)
    )
    missing_values = int(missing_mask.to_numpy().sum())
    if missing_values:
        raise DatasetError(
            f"{path.name} contains {missing_values} missing values; refusing silent row loss"
        )

    native_columns = list(frame.columns)
    frame["source_file"] = str(path.relative_to(DATA_ROOT)).replace("\\", "/")
    frame["source_row"] = range(2, len(frame) + 2)
    frame["sensor"] = sensor
    platform = folder_platform
    if sensor == "MODIS":
        frame["platform"] = frame["satellite"].map({"T": "Terra", "A": "Aqua"})
        if frame["platform"].isna().any():
            invalid = sorted(frame.loc[frame["platform"].isna(), "satellite"].unique())
            raise DatasetError(f"Unknown MODIS satellite values in {path.name}: {invalid}")
    else:
        frame["platform"] = platform

    frame["product_version"] = frame["version"].astype(str)
    frame["frp_product"] = frame["product_version"]
    frame["confidence_raw"] = frame["confidence"].astype(str)
    frame["confidence_scheme"] = "MODIS_numeric_0_100" if sensor == "MODIS" else "VIIRS_low_nominal_high"
    frame["source_satellite"] = frame["satellite"].astype(str)
    frame["product"] = (
        "MCD14DL_NRT_C6.1" if sensor == "MODIS"
        else "VJ114IMGTDL_NRT_C2" if platform == "NOAA-20"
        else "VJ214IMGTDL_NRT_C2"
    )
    frame["acq_timestamp_utc"] = pd.to_datetime(
        frame["acq_date"].astype(str) + " " + frame["acq_time"].astype(str),
        format="%Y-%m-%d %H:%M",
        utc=True,
        errors="raise",
    )
    frame["daynight"] = frame["daynight"].map({"D": "Day", "N": "Night"})
    if frame["daynight"].isna().any():
        raise DatasetError(f"Unexpected day/night values in {path.name}")

    for column in NUMERIC_COLUMNS:
        if column in frame:
            frame[column] = pd.to_numeric(frame[column], errors="raise")

    # Generic aliases intentionally remain nullable: they do not imply that
    # bands with different sensor responses are interchangeable.
    frame["brightness_mid_ir_k"] = frame["brightness"] if sensor == "MODIS" else frame["bright_ti4"]
    frame["brightness_thermal_ir_k"] = frame["bright_t31"] if sensor == "MODIS" else frame["bright_ti5"]
    frame["detection_id"] = (
        frame["source_file"] + ":" + frame["source_row"].astype(str)
    )
    if not frame.empty:
        invalid_coordinates = (
            ~frame["latitude"].between(-90, 90)
            | ~frame["longitude"].between(-180, 180)
        )
        if invalid_coordinates.any():
            raise DatasetError(f"Invalid coordinate values in {path.name}")
        if frame["frp"].lt(0).any():
            raise DatasetError(f"Negative FRP values in {path.name}")
        if frame["daynight"].isna().any():
            raise DatasetError(f"Missing day/night values in {path.name}")

    exact_duplicates = int(frame.duplicated(subset=native_columns).sum())
    repeated_keys = int(
        frame.duplicated(subset=["acq_date", "acq_time", "latitude", "longitude"]).sum()
    )
    metadata = {
        "file": str(path.relative_to(DATA_ROOT)).replace("\\", "/"),
        "platform": folder_platform,
        "sensor": sensor,
        "acquisition_dates": sorted(frame["acq_date"].astype(str).unique().tolist()),
        "file_modified_at_utc": datetime.fromtimestamp(
            path.stat().st_mtime, timezone.utc
        ).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "product_version": str(frame["product_version"].iloc[0]) if not frame.empty else "",
        "rows": int(len(frame)),
        "missing_values": missing_values,
        "malformed_rows": 0,
        "exact_duplicate_rows": exact_duplicates,
        "repeated_time_coordinate_keys": repeated_keys,
        "schema": header,
    }
    return frame, metadata


@lru_cache(maxsize=1)
def load_dataset() -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    frames: list[pd.DataFrame] = []
    files: list[dict[str, Any]] = []
    for platform, folder in DATA_FOLDERS.items():
        directory = DATA_ROOT / folder
        if not directory.is_dir():
            raise DatasetError(f"Required dataset folder is missing: {directory}")
        paths = sorted(directory.glob("*.txt"))
        if not paths:
            raise DatasetError(f"No .txt dataset files found in {directory}")
        for path in paths:
            frame, metadata = _normalize_file(path, platform)
            frames.append(frame)
            files.append(metadata)
    combined = pd.concat(frames, ignore_index=True)
    if combined["detection_id"].duplicated().any():
        raise DatasetError("Stable source detection identifiers are not unique")
    return combined, files


def get_geo_frame(rows: pd.DataFrame) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        rows.copy(),
        geometry=gpd.points_from_xy(rows["longitude"], rows["latitude"]),
        crs="EPSG:4326",
    )


def get_event_key_frame(frame: pd.DataFrame) -> pd.DataFrame:
    window_start = (
        frame["acq_timestamp_utc"].dt.hour // EVENT_TIME_WINDOW_HOURS
    ) * EVENT_TIME_WINDOW_HOURS
    return pd.DataFrame(
        {
            "event_date": frame["acq_date"].astype(str),
            "time_window_utc": (
                window_start.astype(str).str.zfill(2)
                + ":00-"
                + (window_start + EVENT_TIME_WINDOW_HOURS).astype(str).str.zfill(2)
                + ":00"
            ),
            "cell_lat": (frame["latitude"] / EVENT_CELL_DEGREES).round().astype("int32"),
            "cell_lon": (frame["longitude"] / EVENT_CELL_DEGREES).round().astype("int32"),
        },
        index=frame.index,
    )


@lru_cache(maxsize=1)
def get_event_frame() -> pd.DataFrame:
    frame, _ = load_dataset()
    # This is a coarse association proxy, not a confirmed physical fire event.
    work = frame.copy()
    work[["event_date", "time_window_utc", "cell_lat", "cell_lon"]] = get_event_key_frame(frame)
    keys = ["event_date", "time_window_utc", "cell_lat", "cell_lon"]
    groups = work.groupby(keys, sort=False, observed=True)
    is_modis = work["sensor"].eq("MODIS")
    is_viirs = work["sensor"].eq("VIIRS")
    modis_confidence = pd.to_numeric(
        work.loc[is_modis, "confidence_raw"], errors="raise"
    )
    work["modis_native_high"] = False
    work.loc[is_modis, "modis_native_high"] = modis_confidence.ge(80).to_numpy()
    work["viirs_native_high"] = is_viirs & work["confidence_raw"].eq("high")
    rows = groups.agg(
        detection_count=("detection_id", "size"),
        latitude=("latitude", "mean"),
        longitude=("longitude", "mean"),
        max_frp_mw=("frp", "max"),
        mean_frp_mw=("frp", "mean"),
        sensor_count=("sensor", "nunique"),
    ).reset_index()
    source_counts = work.assign(
        modis_detections=is_modis.astype("int32"),
        viirs_detections=is_viirs.astype("int32"),
    ).groupby(keys, sort=False, observed=True).agg(
        modis_detections=("modis_detections", "sum"),
        viirs_detections=("viirs_detections", "sum"),
        modis_native_high=("modis_native_high", "sum"),
        viirs_native_high=("viirs_native_high", "sum"),
    )
    rows = rows.join(source_counts, on=keys)
    distinct_records = work[keys + ["sensor", "platform", "confidence_raw"]].drop_duplicates()
    for column, output_column in (
        ("sensor", "sensors"),
        ("platform", "platforms"),
        ("confidence_raw", "confidence_values"),
    ):
        values = (
            distinct_records[keys + [column]]
            .drop_duplicates()
            .groupby(keys, sort=False, observed=True)[column]
            .agg(list)
            .map(sorted)
        )
        rows = rows.join(values.rename(output_column), on=keys)
    rows["fai"] = rows["sensor_count"].div(2).mul(100).round(1)
    frp_component = (rows["max_frp_mw"].clip(lower=0).add(1).map(lambda value: __import__("math").log10(value)) / 3).clip(upper=1) * 100
    density_component = (
        rows["detection_count"].map(lambda count: __import__("math").log1p(count))
        / __import__("math").log1p(100)
    ).clip(upper=1) * 100
    rows["risk_index"] = (
        frp_component.mul(0.45)
        + density_component.mul(0.35)
        + rows["fai"].mul(0.20)
    ).clip(0, 100).round(1)
    event_keys = (
        rows["event_date"] + "|" + rows["time_window_utc"] + "|"
        + rows["cell_lat"].astype(str) + "|" + rows["cell_lon"].astype(str)
    )
    rows["event_id"] = event_keys.map(
        lambda value: hashlib.sha1(value.encode("utf-8")).hexdigest()[:16]
    )
    return rows


def get_event_detections(event_id: str, limit: int) -> tuple[int, list[dict[str, Any]]]:
    events = get_event_frame()
    event = events.loc[events["event_id"].eq(event_id)]
    if event.empty:
        return 0, []

    candidate = event.iloc[0]
    frame, _ = load_dataset()
    keys = get_event_key_frame(frame)
    mask = (
        frame["acq_date"].astype(str).eq(candidate["event_date"])
        & keys["time_window_utc"].eq(candidate["time_window_utc"])
        & keys["cell_lat"].eq(candidate["cell_lat"])
        & keys["cell_lon"].eq(candidate["cell_lon"])
    )
    matches = frame.loc[mask].sort_values(
        ["sensor", "platform", "acq_time", "source_file", "source_row"]
    )
    total = int(len(matches))
    if total > limit:
        matches = matches.iloc[[(index * total) // limit for index in range(limit)]]

    columns = [
        "detection_id", "sensor", "platform", "source_file", "source_row",
        "acq_date", "acq_time", "latitude", "longitude", "confidence_raw",
        "confidence_scheme", "frp", "scan", "track", "product_version",
    ]
    return total, matches[columns].to_dict(orient="records")
