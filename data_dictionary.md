# FireFusion Dataset Dictionary

## Scope and audit method

This dictionary describes the 21 FIRMS text files in `Modis/`, `viirs-20/`, and
`viirs-21/`. Every file was read as comma-separated data, including every data
row. The audit covered acquisition day-of-year 2026-312 through 2026-318
(2026-11-08 through 2026-11-14).

| Dataset group | Product represented | Files | Records |
|---|---|---:|---:|
| `Modis/` | MODIS C6.1 MCD14DL NRT (Terra and Aqua) | 7 | 64,409 |
| `viirs-20/` | VIIRS C2 VJ114IMGTDL NRT (NOAA-20) | 7 | 340,831 |
| `viirs-21/` | VIIRS C2 VJ214IMGTDL NRT (NOAA-21) | 7 | 328,230 |
| **Total** |  | **21** | **733,470** |

These are near-real-time (NRT) active-fire detection locations, not fire
perimeters or a census of all fires. NASA FIRMS describes each point as the
center of a flagged pixel; nominal pixel resolution is about 1 km for MODIS and
375 m for VIIRS, and actual footprint varies with scan and track. See the
[NASA FIRMS FAQ](https://www.earthdata.nasa.gov/data/tools/firms/faq).

## Record counts by acquisition day

The day suffix in each filename is the year and day-of-year (`YYYYDDD`).

| Day of year | Date | MODIS | NOAA-20 VIIRS | NOAA-21 VIIRS | Total |
|---:|---|---:|---:|---:|---:|
| 312 | 2026-11-08 | 11,964 | 58,739 | 60,759 | 131,462 |
| 313 | 2026-11-09 | 9,620 | 63,638 | 56,887 | 130,145 |
| 314 | 2026-11-10 | 11,022 | 66,193 | 55,375 | 132,590 |
| 315 | 2026-11-11 | 11,147 | 50,326 | 47,798 | 109,271 |
| 316 | 2026-11-12 | 9,252 | 49,061 | 49,026 | 107,339 |
| 317 | 2026-11-13 | 9,089 | 42,827 | 46,379 | 98,295 |
| 318 | 2026-11-14 | 2,315 | 10,047 | 12,006 | 24,368 |
| **Total** |  | **64,409** | **340,831** | **328,230** | **733,470** |

The last date has fewer records in all three groups. This is an observed count,
not evidence by itself of a data-quality problem; the NRT snapshot may be
incomplete relative to earlier dates.

## File-level counts and quality checks

Each row below corresponds to one file. `Exact duplicates` means repeated
identical data rows within that file. `Repeated time/coordinate keys` means
repeated `(acq_date, acq_time, latitude, longitude)` tuples; because time is
minute-resolution and coordinates are rounded, this is a review flag, not a
deduplication instruction.

| Day (`YYYYDDD`) | MODIS rows | NOAA-20 rows | NOAA-21 rows | Exact duplicate rows in each file | Repeated time/coordinate keys |
|---:|---:|---:|---:|---:|---|
| 2026312 | 11,964 | 58,739 | 60,759 | 0 / 0 / 0 | 0 / 0 / 0 |
| 2026313 | 9,620 | 63,638 | 56,887 | 0 / 0 / 0 | 0 / 0 / 0 |
| 2026314 | 11,022 | 66,193 | 55,375 | 0 / 0 / 0 | 0 / 0 / 0 |
| 2026315 | 11,147 | 50,326 | 47,798 | 0 / 0 / 0 | 0 / 0 / 0 |
| 2026316 | 9,252 | 49,061 | 49,026 | 0 / 0 / 0 | 0 / 0 / 0 |
| 2026317 | 9,089 | 42,827 | 46,379 | 0 / 0 / 0 | 0 / 0 / 0 |
| 2026318 | 2,315 | 10,047 | 12,006 | 0 / 0 / 0 | 0 / 0 / 1 |

Across the individual input files:

- No blank or recognized null-token values were found in any field.
- No malformed-width data rows were found.
- No identical duplicate rows were found within any file.
- One NOAA-21 VIIRS record pair repeats the time/coordinate key
  `2026-11-14, 05:35, -14.93994, 128.60587`. Its values differ
  (`bright_ti4`: 347.75 vs. 347.04 K; `bright_ti5`: 295.75 vs. 295.93 K;
  `frp`: 39.31 vs. 38.49 MW), so it is not an exact duplicate. Retain both
  unless a later, documented event-matching rule establishes otherwise.
- FRP includes zero-valued records; zero is an observed value, not a missing
  value in these files.

## Schema comparison

All seven files within each group have the same header and field order. The
MODIS and both VIIRS groups each have 13 columns. Eleven names are shared;
the four sensor-specific brightness names differ.

| MODIS field | VIIRS field | Harmonization note |
|---|---|---|
| `latitude`, `longitude` | `latitude`, `longitude` | Same coordinate convention; coordinates locate the detected pixel center, not necessarily the fire itself. |
| `scan`, `track` | `scan`, `track` | Preserve as footprint dimensions in km; do not treat as fire dimensions. |
| `acq_date`, `acq_time` | `acq_date`, `acq_time` | Same date and minute-resolution UTC time fields; combine for a timestamp while retaining both originals. |
| `satellite` | `satellite` | Encodings differ: MODIS uses `T` (Terra) and `A` (Aqua); the VIIRS files contain `N20` and `N21`. |
| `confidence` | `confidence` | Different representations and algorithm semantics; keep source-native value and type. |
| `version` | `version` | Product versions differ: `6.1NRT` vs. `2.0NRT`; preserve as provenance. |
| `frp` | `frp` | Both are FRP estimates in MW, but not sensor-interchangeable measurements. |
| `daynight` | `daynight` | Shared codes: `D` daytime and `N` nighttime. |
| `brightness`, `bright_t31` | `bright_ti4`, `bright_ti5` | Related thermal channels, not identical channel measurements; retain source names and sensor identity. |

## Column definitions

All fields are populated in the audited files. Numeric ranges below are the
observed ranges in this snapshot, not validation limits for future data.

| Column(s) | Type / units | Meaning and observed values |
|---|---|---|
| `latitude` | Decimal degrees | Center latitude of the detected pixel. MODIS: -51.642 to 65.5609; NOAA-20: -53.1039 to 72.4814; NOAA-21: -53.2024 to 72.4821. |
| `longitude` | Decimal degrees | Center longitude of the detected pixel. MODIS: -176.441 to 179.751; NOAA-20: -180 to 179.756; NOAA-21: -180 to 179.996. |
| `brightness` (MODIS) | Kelvin | MODIS mid-infrared fire-pixel brightness temperature. Observed: 300 to 499.97 K. |
| `bright_ti4` (VIIRS) | Kelvin | VIIRS I-band 4 brightness temperature, the VIIRS mid-infrared channel field. NOAA-20: 207.93 to 367 K; NOAA-21: 207.38 to 367 K. |
| `bright_t31` (MODIS) | Kelvin | MODIS thermal-infrared band 31 brightness temperature. Observed: 265.14 to 400.07 K. |
| `bright_ti5` (VIIRS) | Kelvin | VIIRS I-band 5 brightness temperature, the longer-wavelength thermal channel field. NOAA-20: 240.76 to 379.05 K; NOAA-21: 235.64 to 374.86 K. |
| `scan` | Kilometres | Along-scan footprint dimension reported by the product. MODIS: 1 to 4.82 km; each VIIRS group: 0.32 to 0.8 km. |
| `track` | Kilometres | Along-track footprint dimension reported by the product. MODIS: 1 to 2 km; each VIIRS group: 0.36 to 0.78 km. |
| `acq_date` | ISO date (`YYYY-MM-DD`) | Acquisition date. Values span 2026-11-08 through 2026-11-14. |
| `acq_time` | Text (`HH:MM`) | Acquisition time in UTC, represented to the minute. Do not infer seconds or exact sub-minute ordering. |
| `satellite` | Text code | Platform code. MODIS: `T` (Terra) or `A` (Aqua); NOAA-20 group: `N20`; NOAA-21 group: `N21`. |
| `confidence` | MODIS integer; VIIRS category | MODIS observed range 0–100 with 101 distinct integer values. VIIRS has `low`, `nominal`, and `high` categories. See the interpretation below. |
| `version` | Text | Source product/version tag. MODIS: `6.1NRT`; both VIIRS groups: `2.0NRT`. |
| `frp` | Megawatts (MW) | Per-detection fire radiative power estimate. MODIS observed: 0–3,165.85 MW; NOAA-20: 0–1,113.71 MW; NOAA-21: 0–1,337.55 MW. |
| `daynight` | Category (`D`/`N`) | Day/night flag: `D` daytime, `N` nighttime. |

Thermal brightness values are temperatures in kelvin, not radiance and not
flame temperature. Similar names indicate related spectral measurements, not
identical sensor bands or directly interchangeable measurements.

## Confidence values in this snapshot

MODIS uses a numeric confidence score from 0 to 100. In the audited files,
3,031 records are below 30, 43,502 are from 30 through 79, and 17,876 are 80
through 100. VIIRS uses three text categories:

| Group | `low` | `nominal` | `high` |
|---|---:|---:|---:|
| NOAA-20 VIIRS | 41,301 | 284,038 | 15,492 |
| NOAA-21 VIIRS | 41,584 | 267,442 | 19,204 |

These are different product encodings produced by different detection
algorithms. A MODIS value of (for example) `80` must not be interpreted as the
same probability, confidence level, or threshold as VIIRS `high`. The MODIS
score is not a calibrated probability of fire. Preserve the native value,
label its scheme, and make any cross-sensor categorical mapping an explicit
analysis convention rather than an implied equivalence.

The dashboard's optional combined confidence display maps MODIS `<30` to low,
`30–79` to medium, and `80–100` to high; VIIRS `low`, `nominal`, and `high`
map to those same display labels, respectively. These are source-native
display buckets, not cross-sensor calibration. In the audited snapshot the
combined display counts are 85,916 low, 594,982 medium, and 52,572 high
detections.

## FRP summaries

FRP is reported in MW. Snapshot summaries are descriptive only:

| Group | Records | Median (MW) | Mean (MW) | Maximum (MW) |
|---|---:|---:|---:|---:|
| MODIS | 64,409 | 15.39 | 33.50 | 3,165.85 |
| NOAA-20 VIIRS | 340,831 | 5.12 | 9.12 | 1,113.71 |
| NOAA-21 VIIRS | 328,230 | 6.08 | 10.73 | 1,337.55 |

The distributions differ, but these summaries alone do not show that one
sensor detects stronger fires or that another is biased. Pixel footprints,
spectral response, retrieval algorithms, observation time, and the number of
detections all affect the observed values. See
[harmonization_strategy.md](./harmonization_strategy.md) before comparing or
aggregating FRP.

## Source references

- [NASA FIRMS FAQ](https://www.earthdata.nasa.gov/data/tools/firms/faq): nominal
  MODIS/VIIRS resolutions, pixel-center interpretation, and guidance about
  NRT detections versus science-quality products.
- [MODIS Collection 6 Fire User Guide](https://modis-fire.umd.edu/files/MODIS_C6_Fire_User_Guide_C.pdf):
  background on the MODIS fire product and its fields.
