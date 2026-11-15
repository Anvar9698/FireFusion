from fastapi.testclient import TestClient

from api.app.data import get_event_frame, load_dataset
from api.app.main import app


client = TestClient(app)


def test_health_loads_all_real_source_files():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["detections"] == 733470
    assert response.json()["files"] == 21


def test_source_rows_are_preserved_and_sensor_semantics_stay_native():
    frame, files = load_dataset()
    assert len(frame) == 733470
    assert len(files) == 21
    assert frame["detection_id"].is_unique
    assert set(frame.loc[frame["sensor"] == "VIIRS", "confidence_raw"].unique()) == {
        "low", "nominal", "high",
    }
    assert frame.loc[frame["sensor"] == "MODIS", "confidence_raw"].str.isnumeric().all()
    assert sum(file["missing_values"] for file in files) == 0
    assert sum(file["exact_duplicate_rows"] for file in files) == 0


def test_geojson_endpoint_and_bbox_validation():
    response = client.get("/api/detections", params={"bbox": "-157,18,-154,21", "limit": 50})
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "FeatureCollection"
    assert len(payload["features"]) <= 50
    assert payload["total"] >= len(payload["features"])
    assert all(feature["geometry"]["type"] == "Point" for feature in payload["features"])
    assert all("frp_product" in feature["properties"] for feature in payload["features"])
    assert client.get("/api/detections", params={"bbox": "bad"}).status_code == 422


def test_map_endpoint_returns_real_detections_from_both_sensor_families():
    response = client.get(
        "/api/detections",
        params=[("sensor", "MODIS"), ("sensor", "VIIRS"), ("limit", "5000")],
    )
    assert response.status_code == 200
    collection = response.json()
    assert collection["total"] == 733470
    assert len(collection["features"]) == 5000
    sensors = {feature["properties"]["sensor"] for feature in collection["features"]}
    assert sensors == {"MODIS", "VIIRS"}
    assert all(feature["geometry"]["type"] == "Point" for feature in collection["features"])
    assert all(feature["properties"]["source_file"] for feature in collection["features"])


def test_cors_allows_local_frontend_origin():
    response = client.options(
        "/api/detections",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_events_fai_and_risk_are_bounded_and_explained():
    event_frame = get_event_frame()
    assert set(event_frame["fai"].unique()).issubset({0.0, 50.0, 100.0})
    response = client.get("/api/events", params={"min_fai": 100, "limit": 20})
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] >= len(payload["items"])
    assert all(item["fai"] == 100 for item in payload["items"])
    agreement = client.get("/api/agreement")
    assert agreement.status_code == 200
    agreement_data = agreement.json()
    assert agreement_data["corroborated_groups"] == agreement_data["groups_by_fai"]["100"]
    assert agreement_data["total_detections"] == 733470
    assert agreement_data["harmonized_events"] == agreement_data["groups_by_fai"]["100"]
    assert agreement_data["modis_only_events"] + agreement_data["viirs_only_events"] == agreement_data["groups_by_fai"]["50"]
    assert agreement_data["modis_only_events"] == 37941
    assert agreement_data["viirs_only_events"] == 235043
    expected_average_fai = (
        50 * agreement_data["groups_by_fai"]["50"]
        + 100 * agreement_data["groups_by_fai"]["100"]
    ) / agreement_data["total_groups"]
    assert agreement_data["average_fai"] == expected_average_fai
    assert agreement_data["confidence_counts"] == {"high": 52572, "medium": 594982, "low": 85916}
    assert sum(agreement_data["confidence_counts"].values()) == 733470
    assert "not cross-sensor calibrated" in agreement_data["confidence_method"]
    harmonized = client.get("/api/harmonized-events", params={"limit": 25})
    assert harmonized.status_code == 200
    harmonized_data = harmonized.json()
    assert harmonized_data["total"] == agreement_data["harmonized_events"]
    assert len(harmonized_data["features"]) == 25
    assert all(feature["properties"]["fai"] == 100 for feature in harmonized_data["features"])
    risk = client.get("/api/risk", params={"limit": 10})
    assert risk.status_code == 200
    assert "not a prediction" in risk.json()["interpretation"]
    reviewed_candidate = payload["items"][0]
    candidate = next(
        row for row in event_frame.to_dict(orient="records")
        if row["event_id"] == reviewed_candidate["event_id"]
    )
    assert reviewed_candidate["modis_detections"] > 0
    assert reviewed_candidate["viirs_detections"] > 0
    assert reviewed_candidate["modis_native_high"] <= reviewed_candidate["modis_detections"]
    assert reviewed_candidate["viirs_native_high"] <= reviewed_candidate["viirs_detections"]
    high_both = client.get(
        "/api/events",
        params={"min_fai": 100, "native_high_both": "true", "limit": 20},
    ).json()
    assert high_both["total"] == int(
        (
            event_frame["fai"].eq(100)
            & event_frame["modis_native_high"].gt(0)
            & event_frame["viirs_native_high"].gt(0)
        ).sum()
    )
    assert all(
        item["modis_native_high"] > 0 and item["viirs_native_high"] > 0
        for item in high_both["items"]
    )
    source_rows = client.get(
        f"/api/events/{candidate['event_id']}/detections",
        params={"limit": 500},
    )
    assert source_rows.status_code == 200
    source_payload = source_rows.json()
    assert source_payload["total"] == candidate["detection_count"]
    assert len(source_payload["items"]) == min(500, candidate["detection_count"])
    assert {item["sensor"] for item in source_payload["items"]} == {"MODIS", "VIIRS"}
    assert all(item["source_file"] and item["source_row"] for item in source_payload["items"])


def test_calendar_and_analytics_match_known_snapshot():
    calendar = client.get("/api/calendar").json()
    assert len(calendar["days"]) == 7
    assert sum(day["total_detections"] for day in calendar["days"]) == 733470
    analytics = client.get("/api/analytics").json()
    assert len(analytics["daily"]) == 7
    assert sum(row["total"] for row in analytics["daily"]) == 733470
    assert {row["platform"] for row in analytics["platforms"]} == {
        "Terra", "Aqua", "NOAA-20", "NOAA-21",
    }


def test_coverage_reports_source_file_freshness_and_daily_stream_presence():
    response = client.get("/api/coverage")
    assert response.status_code == 200
    coverage = response.json()
    assert coverage["date_range"] == {"start": "2026-11-08", "end": "2026-11-14"}
    assert coverage["acquisition_days"] == 7
    assert coverage["source_file_count"] == 21
    assert coverage["last_data_update_time"].endswith("Z")
    assert len(coverage["days"]) == 7
    assert all(day["source_group_count"] == 3 for day in coverage["days"])
    assert all(not day["missing_sources"] for day in coverage["days"])
    assert "filesystem modification time" in coverage["freshness_note"]
    assert "not a NASA publication" in coverage["freshness_note"]
