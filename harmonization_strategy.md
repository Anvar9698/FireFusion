# FireFusion Data Harmonization Strategy

## Objective and guiding principle

Create a common, analysis-ready representation of the MODIS and VIIRS NRT
detections without pretending that sensor-specific measurements are
identical. The source files are point summaries of detected pixels, not
fire-perimeter observations. Preserve raw provenance and sensor-native fields
through every transformation.

The strategy below is implemented by the FireFusion API and UI. Application
code retains native source fields and treats both event association and risk
as derived, explicitly qualified indicators.

## Recommended canonical record

Use one row per source detection and retain every source row. A canonical
record should contain the following groups of fields:

| Canonical field | Source and handling |
|---|---|
| `latitude`, `longitude` | Carry through as decimal degrees; document that the point is the flagged pixel center and has pixel-scale positional uncertainty. |
| `acq_date`, `acq_time`, `acq_timestamp_utc` | Preserve original date and time text. Derive a UTC timestamp at minute precision; do not add assumed seconds. |
| `sensor` | Normalize to `MODIS` or `VIIRS`. |
| `platform` | Normalize platform to `Terra`, `Aqua`, `NOAA-20`, or `NOAA-21`, from source `satellite` values `T`, `A`, `N20`, `N21`. |
| `source_satellite` | Retain original source code exactly. |
| `product`, `product_version`, `source_file` | Retain the product identity, original `version` (`6.1NRT` or `2.0NRT`), and input filename for traceability. |
| `scan_km`, `track_km` | Preserve the source footprint dimensions, not as estimates of fire size. |
| `brightness_mid_ir_k`, `brightness_thermal_ir_k` | Optional standardized aliases for plotting/query convenience, populated from the relevant source fields while preserving their original values and channel names. Always include sensor and channel metadata; these aliases do not make channel measurements equivalent. |
| `confidence_raw`, `confidence_scheme` | Preserve exact source value and type. Scheme should explicitly identify MODIS numeric confidence versus VIIRS categorical confidence. |
| `frp_mw`, `frp_product` | Carry source FRP value with MW units and product/sensor identity; do not combine sensor values as if they were a common calibrated instrument. |
| `daynight` | Preserve `D`/`N` and optionally expose a readable label. |

Never discard or overwrite original source fields when adding canonical aliases.
Keeping the raw fields allows audits when product versions or interpretation
change.

## Confidence: retain native semantics

The MODIS `confidence` column is numeric (0–100 in this snapshot); VIIRS
`confidence` is categorical (`low`, `nominal`, `high`). They are not values on
a shared probability scale. Their differences arise from product-specific
detection algorithms and encodings. For that reason:

1. Keep the unmodified value and a `confidence_scheme` field.
2. Do not cast VIIRS categories to numbers or claim, for example, that `high`
   equals MODIS 80–100.
3. Use native filtering for sensor-specific analysis.
4. If a combined categorical summary is required, define a clearly named
   derived classification, record the chosen mapping in metadata, and run a
   sensitivity analysis. One possible MODIS grouping is `<30`, `30–79`, and
   `80–100`, but those bins are only an analysis convention and are not a
   cross-sensor calibration.
5. Report counts by sensor and original confidence value/category alongside
   any harmonized result.

## FRP: comparable units do not mean identical measurements

Both products express FRP in MW, but FRP remains a sensor- and
product-dependent estimate. MODIS and VIIRS differ in pixel footprint and
thermal spectral response, while their fire-detection and FRP retrieval
algorithms are not identical. A VIIRS detection is nominally finer spatially
(about 375 m versus about 1 km for MODIS), so one fire may produce a different
number and pattern of detections. The satellites also observe at different
times. These effects explain why raw per-detection distributions can differ;
the observed MODIS median is 15.39 MW, compared with 5.12 MW for NOAA-20 VIIRS
and 6.08 MW for NOAA-21 VIIRS, but those medians do not establish an
instrument bias or a fire-intensity ranking.

Recommended handling:

- Retain FRP as `frp_mw` with sensor, platform, product, acquisition time, and
  footprint metadata.
- Do not sum MODIS and VIIRS rows into a purported combined fire power or
  deduplicate solely because detections are geographically close.
- Compare FRP distributions by sensor/platform first. For cross-sensor
  comparisons, define matched overpasses or spatial-temporal groups, account
  for footprint and timing, report source-specific results, and describe
  aggregation/uncertainty explicitly.
- When a single series is required, choose one sensor/product as the primary
  measure or use a validated calibration method; do not average raw values by
  default.
- Distinguish an instantaneous per-detection estimate from accumulated
  energy, fire size, or a daily total. Those require separate definitions and
  processing.

The FIRMS FAQ notes that each detection marks the center of a pixel flagged as
containing one or more fires or other thermal anomalies; the actual fire
location and size are not resolved from the point alone. It also notes the
different nominal MODIS and VIIRS pixel resolutions. See the
[NASA FIRMS FAQ](https://www.earthdata.nasa.gov/data/tools/firms/faq).

## Matching and duplicate policy

Do not treat latitude, longitude, and minute acquisition time as a unique
detection identifier. The source values are rounded and the acquisition time
has minute precision. The within-file audit found no identical duplicate records. The API retains
both source records. One NOAA-21 VIIRS file contains two different records with the same
date/time/coordinate tuple but different brightness and FRP values.

For future cross-sensor association, keep source detections as separate rows
and create a separate relation or event-cluster identifier only after
documenting:

- a time tolerance that reflects overpass times and minute precision;
- a distance rule that accounts for source scan/track footprint and the
  approximate location uncertainty;
- how multiple pixels and repeated overpasses are treated; and
- whether cluster-level values are counts, representative detections,
  distributions, or a carefully defined FRP summary.

Do not remove the repeated NOAA-21 tuple as a duplicate automatically.
Possible event association is not the same as duplicate-record removal.

## Ingestion and validation rules

1. Treat source files as immutable inputs and record filename, product,
   platform, and ingestion date in provenance metadata.
2. Parse using the header, preserve text fields, and validate the expected
   13-column schema for each product family.
3. Parse numeric columns explicitly; validate coordinates, date/time syntax,
   allowed day/night codes, product versions, and sensor-specific confidence
   values. Keep a validation report rather than silently dropping a row.
4. Treat blank/null tokens as missing; do not infer missingness from zero.
   The current snapshot has no missing values and includes valid observed
   zero-valued FRP entries.
5. Check full-row duplicates separately from repeated time/coordinate keys.
   Log both. Deduplicate only exact duplicate source rows when provenance
   confirms they are accidental repetitions; retain distinct observations.
6. Preserve sensor/product-specific fields and report row counts per source
   and day before and after each transformation.
7. Label the input as NRT. For many quantitative studies, consider
   science-quality Level 2 products instead: the FIRMS FAQ notes their
   additional quality information and handling of overlapping orbits.

## Analysis and visualization guidance

- Map all points with sensor/platform filters and optionally different
  symbols; do not render a detection as a fire boundary.
- Use `scan` and `track` to communicate variable footprint, not to estimate
  event size without an explicit method.
- Keep confidence legends separate by sensor unless a clearly documented
  transformation is shown.
- Use sensor-specific FRP legends or panels by default. If a joint display is
  needed, label source and units, avoid implying equivalence, and disclose
  the grouping/matching method.
- Make day/night and UTC acquisition-time semantics visible in time-based
  analysis.
- Treat the smaller count on 2026-11-14 as a snapshot characteristic; verify
  completeness and NRT update status before interpreting it as a decline in
  fire activity.
