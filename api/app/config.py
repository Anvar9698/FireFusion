from pathlib import Path
import os


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = Path(os.environ.get("FIREFUSION_DATA_DIR", PROJECT_ROOT))
DATA_FOLDERS = {
    "MODIS": "Modis",
    "NOAA-20": "viirs-20",
    "NOAA-21": "viirs-21",
}
EXPECTED_COLUMNS = {
    "MODIS": [
        "latitude", "longitude", "brightness", "scan", "track", "acq_date",
        "acq_time", "satellite", "confidence", "version", "bright_t31", "frp",
        "daynight",
    ],
    "VIIRS": [
        "latitude", "longitude", "bright_ti4", "scan", "track", "acq_date",
        "acq_time", "satellite", "confidence", "version", "bright_ti5", "frp",
        "daynight",
    ],
}
EVENT_CELL_DEGREES = 0.05
EVENT_TIME_WINDOW_HOURS = 2
