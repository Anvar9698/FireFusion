# FireFusion Project Architecture

## Status and scope

This document describes the implemented architecture for integrating the
supplied NASA FIRMS active-fire files. The application preserves source
detections and exposes derived association and activity-priority layers
separately. No synthetic data is used.

The audited inputs are 21 NRT CSV-formatted text files covering
2026-11-08–2026-11-14:

- `Modis/`: MODIS C6.1 MCD14DL NRT, Terra and Aqua; 64,409 detections.
- `viirs-20/`: VIIRS C2 VJ114IMGTDL NRT, NOAA-20; 340,831 detections.
- `viirs-21/`: VIIRS C2 VJ214IMGTDL NRT, NOAA-21; 328,230 detections.

Together they contain 733,470 records. The sources are NRT pixel detections,
not perimeters or validated incident records.

## Data flow

```text
NASA FIRMS text files (immutable source layer)
                |
                v
       Ingestion and audit
 (schema, row counts, nulls, duplicates,
    parse errors, source provenance)
                |
                v
     Sensor-aware harmonization
 (common location/time/platform fields;
  native confidence, brightness, and FRP)
                |
                v
        Analysis-ready store
 (partition by acquisition date and sensor;
   preserve detection-level source rows)
                |
       +--------+---------+
       |                  |
       v                  v
 Sensor-specific       Spatial/temporal
 analysis & maps       event association
                          (derived layer;
                      separate from detections)
       +--------+---------+
                |
                v
      Application/API layer
 (filters, maps, comparisons, provenance,
         visible uncertainty)
```

The source files remain immutable. The API reads and validates them with
Pandas, builds canonical sensor-aware fields, and creates GeoPandas WGS84
point geometries for spatial API responses. The event-association layer is
derived and cached in process; it does not replace or rewrite detections.

## Layer responsibilities

### 1. Immutable source layer

- Keep the original text files unchanged and identify them by original
  relative path and filename.
- Record product family, platform, version, acquisition date/day, file size,
  and ingestion/checksum metadata alongside each file.
- Distinguish MODIS `6.1NRT` from VIIRS `2.0NRT`; retain NRT status.

### 2. Ingestion and audit

- Read the header and every source row; enforce the expected 13-column schema
  for each product family.
- Validate column count and parseability, missing values, coordinate bounds,
  date/time format, categorical values, and numeric ranges.
- Produce a per-file audit report with rows read, malformed rows, missing
  values, exact duplicates, repeated time/coordinate keys, and schema/version.
- Make validation failures explicit and traceable to file and row. Do not
  silently skip or repair unexpected records.

### 3. Sensor-aware harmonization

- Create common aliases for location, UTC acquisition time, sensor/platform,
  footprint dimensions, day/night, and source provenance.
- Preserve native brightness fields, confidence values, FRP, and product
  versions. Add aliases for convenience only when channel and sensor metadata
  remain accessible.
- Keep confidence scheme and FRP product identity explicit; neither field is
  made cross-sensor equivalent by normalization.
- Use a detection-level representation with one record per source detection.
  Keep platform/sensor as explicit dimensions so concurrent observations are
  not collapsed.

### 4. Analysis-ready in-memory model

The current deployment caches the concatenated Pandas frame and the derived
event table in process memory. This avoids creating copies or synthetic
datasets and makes the challenge snapshot directly queryable. For a growing
or frequently updated production archive, move the same canonical schema to a
columnar, geospatial-friendly store (for example Parquet with WGS84 geometry)
partitioned by acquisition date and sensor/product. Preserve raw columns,
canonical aliases, provenance, and validation status.

### 5. Analysis, event association, and application

- Support source-specific summaries and maps before cross-sensor fusion.
- `/api/events` and `/api/risk` provide derived event proxies as a separate
  layer, keyed by UTC date, 2-hour window, and 0.05-degree cell.
- FAI reports distinct sensor-family presence (MODIS, VIIRS) out of two;
  results are 50 or 100 for returned event groups. It is an association
  indicator, not a validated match.
- The activity-priority index combines normalized maximum FRP, detection
  density, and FAI. It does not predict fire spread or impacts.
- Display detections as pixel-center observations with scale/uncertainty
  caveats. Use per-sensor confidence and FRP legends unless a validated
  cross-sensor method is available.
- Do not present an event cluster as a perimeter or an FRP sum as total fire
  energy without separately defined and validated methods.

## Canonical entity boundaries

### Source detection

One row from a source product, identified by provenance (source file and
source row or stable ingest identifier). Store the raw coordinate, acquisition
date/time, platform, product/version, brightness fields, confidence, FRP, and
day/night code.

### Harmonized detection

A one-to-one representation of a source detection with common field aliases.
It retains a reference to the source detection and does not imply a
cross-sensor measurement equivalence.

### Associated event (future/optional)

A derived grouping of one or more detections under a documented space/time
rule. It is not a replacement for detections. The repeated NOAA-21
minute/coordinate tuple seen in the audited data illustrates why simple
coordinate-time equality is not a safe unique key.

## Operational safeguards

- Track source product/version and reprocess when inputs change.
- Monitor daily counts per sensor and compare file completeness with
  availability/update status before interpreting count trends.
- Keep ingestion totals, validation totals, and output totals reconcilable.
- Preserve raw values on validation warnings; expose warnings to users and
  analysts.
- Label NRT data and distinguish it from science-quality data. The
  [NASA FIRMS FAQ](https://www.earthdata.nasa.gov/data/tools/firms/faq)
  recommends considering standard Level 2 products for many quantitative
  studies because they retain additional quality information and account for
  overlapping orbits.

## Implemented project surfaces

- `api/app/data.py`: source inventory, schema validation, canonical fields,
  confidence provenance, stable source detection identifiers, and event
  proxy construction.
- `api/app/main.py`: summary, GeoJSON, event, agreement, harmonized-event,
  calendar, metadata, analytics, activity-priority, and health endpoints.
- `src/`: React/TypeScript dashboard, Leaflet map, Recharts analytics,
  calendar, prominent Fire Agreement Index summary and distribution,
  source-native confidence display buckets, harmonized map layer,
  activity-priority views, and analyst review queue with source-row drilldown.
- `api/tests/test_api.py`: tests against the real full-file dataset and API
  response shapes.
- `Dockerfile` and `README.md`: local run and deployment workflows.

The current snapshot has no missing values, malformed rows, or identical
within-file duplicate rows. The event model intentionally preserves the
observed repeated NOAA-21 minute/time-coordinate pair because its values
differ.
