# FireFusion — NASA Space Apps Challenge Submission Package

## 1. Executive Summary

**A satellite detection is a signal to investigate—not an incident confirmed.**
FireFusion helps a wildfire-monitoring analyst move from a broad stream of
satellite observations to a traceable set of candidate locations for review.

The project brings supplied NASA FIRMS MODIS C6.1 and VIIRS C2 near-real-time
(NRT) detections into one workflow without flattening away their differences.
It preserves the source records and provenance, shows where both sensor
families reported detections in the same coarse space-time bin, and lets the
analyst inspect the underlying evidence.

The implemented snapshot contains 733,470 detections across 21 NASA FIRMS
source files covering November 8–14, 2026. FireFusion transforms these
observations into a structured analyst workflow, reducing hundreds of thousands
of individual detections into reviewable multi-sensor candidate groups.
Analysts can explore fire activity on a map, investigate harmonized candidate
locations, inspect source-level evidence, and prioritize reviews using
transparent cross-sensor agreement indicators. The Fire Agreement Index (FAI)
is presented as a co-occurrence indicator designed to support investigation,
not as a probability, validated incident match, or measure of fire severity.

## 2. Problem Statement

An analyst reviewing active-fire observations from multiple satellite systems
must answer two different questions: **What did each system observe?** and
**Which observations are worth examining together?**

Those questions are difficult to answer from a single combined count. MODIS and
VIIRS differ in nominal pixel resolution, observation timing, and confidence
encoding. Their FRP values are product-dependent. A MODIS numeric confidence
value cannot be treated as equivalent to a VIIRS category. Combining these
measurements as if they shared one scale can obscure rather than clarify the
evidence.

There is a second distinction: a flagged pixel is not a mapped fire boundary
or a confirmed incident. NRT snapshots may be incomplete, and detections near
one another in space and time may still represent different observations or
events.

The analyst therefore needs a way to see source observations together, identify
possible cross-system co-occurrence, and verify why a candidate was surfaced
without losing sensor context or provenance.

## 3. Solution Overview

FireFusion is organized around an analyst’s review journey:

1. **Scan the activity.** Explore MODIS and VIIRS pixel-center detections on an
   interactive map, with spatial filtering and source-specific details.
2. **Narrow the review list.** Open the FAI 100 queue for groups containing
   detections from both sensor families. The default queue can further require
   at least one source-native “high” tier detection from each family.
3. **Inspect the evidence.** Select a candidate to see its date and UTC window,
   location, per-family detection counts, native confidence cues, and
   contributing source records with platform and file/row provenance. A
   deterministic sample is shown when a candidate has more records than the
   detail limit.
4. **Record and contextualize.** Mark a candidate reviewed in the current
   browser, consult the linked location, and check acquisition-date file
   coverage and source-file modification time.

The queue uses existing source-native display conventions—MODIS 80–100 and
VIIRS `high`—as review cues only. They are not calibrated or
probability-equivalent. Review status is browser-local; it is not shared or
persisted centrally.

The rest of the dashboard supplies daily counts, platform summaries, native
confidence distributions, per-detection FRP summaries, and an observed
activity-priority proxy. These views support exploration; they do not turn
detections into confirmed fires or predictions.

## 4. Fire Agreement Index explanation

FAI indicates which sensor families appear in a coarse space-time group:

```text
FAI = 100 × (number of distinct sensor families present / 2)
```

In the implementation, detections are grouped by UTC acquisition date,
a fixed two-hour UTC window, and the nearest 0.05-degree latitude/longitude
grid cell.

- A populated group containing MODIS only or VIIRS only has **FAI 50**.
- A group containing both MODIS and VIIRS has **FAI 100**.

FAI describes sensor-family co-occurrence under that rule. It is not a
probability, confidence score, confirmed event match, or proof that detections
refer to the same fire. The grid's physical width varies with latitude, and
acquisition times have minute precision. FireFusion therefore presents these
groups as candidates and keeps the contributing source observations
inspectable.

## 5. Technical Architecture

**Data.** The application reads 21 supplied FIRMS NRT text files:

- MODIS C6.1 MCD14DL: 64,409 detections;
- NOAA-20 VIIRS C2 VJ114IMGTDL: 340,831 detections; and
- NOAA-21 VIIRS C2 VJ214IMGTDL: 328,230 detections.

**Harmonization and API.** Python FastAPI reads and validates the source files
with Pandas, preserves source fields and provenance, and adds sensor-aware
canonical fields. It exposes detection, summary, agreement, candidate,
calendar, analytics, coverage, and activity-priority endpoints. GeoPandas
provides WGS84 GeoJSON point responses. Derived event associations and summary
data are cached in process memory.

**Analyst interface.** React and TypeScript, built with Vite, provide the
dashboard and review workflow. Leaflet renders the interactive map; Recharts
renders the analytics. The interface displays source-native confidence and
keeps derived association groups distinct from the original detections.

**Deployment.** The Docker build compiles the frontend and bundles it with the
API. FastAPI serves the frontend and `/api/*` from one origin, with the supplied
data folders included in the image.

This is a fixed local snapshot: the application does not fetch or continuously
refresh NASA FIRMS data. The displayed latest source-file modification time
comes from filesystem metadata; it is not a confirmed NASA publication or
download timestamp. File coverage does not establish complete satellite
observation coverage.

## 6. Impact Statement

FireFusion’s immediate contribution is a more traceable way to triage
multi-sensor observations. Instead of asking an analyst to infer how a combined
number was produced, the workflow exposes the co-occurrence rule, keeps
MODIS and VIIRS confidence semantics distinct, and links a candidate back to
its contributing detections and source provenance.

That design can help an analyst move efficiently from **overview → candidate →
evidence → review status** while retaining the context needed to question a
candidate. It also makes an important boundary visible: cross-system
co-occurrence is a reason to inspect records, not evidence by itself that one
real-world fire has been verified.

This is a plausible workflow benefit, not a measured operational outcome.
FireFusion has not established that its candidates match verified incidents,
improve detection lead time, reduce false positives, or change response
decisions. Its activity-priority score is descriptive; it does not incorporate
weather, fuels, terrain, population exposure, or verified incident boundaries.
The application is a triage and exploration prototype—not a fire-perimeter
product, spread forecast, dispatch tool, evacuation system, or standalone
life-safety assessment.

## 7. Future Roadmap

These are proposed next steps, not implemented capabilities:

1. **Test whether fusion helps.** Compare FAI candidates with an appropriate
   verified-incident reference; measure false associations and missed matches;
   and test sensitivity to alternative spatial and temporal grouping choices.
2. **Make freshness operational.** Connect to an authorized, continuously
   refreshed FIRMS source and distinguish publication time, ingestion time,
   update status, and missing source files.
3. **Support team review.** Replace browser-local review status with shared,
   server-persisted decisions and an auditable analyst handoff.
4. **Add context only with evidence.** Evaluate weather, fuels, terrain, and
   exposure layers with clear provenance and validation before using them in
   prioritization.
5. **Measure analyst value.** Conduct user feedback sessions and evaluate
   review time or consistency against a defined baseline before claiming
   operational impact.
