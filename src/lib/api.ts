import type {
  Analytics,
  AgreementSummary,
  CalendarDay,
  Coverage,
  CoverageResponse,
  DetectionCollection,
  EventDetections,
  EventCollection,
  HarmonizedEventCollection,
  Summary,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

async function get<T>(path: string): Promise<T> {
  const requestUrl = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(requestUrl);
  } catch (reason) {
    const detail = reason instanceof Error ? ` ${reason.message}` : "";
    throw new Error(
      `Could not connect to FireFusion API at ${requestUrl}.${detail} Verify the API is running and the frontend/API origin settings are correct.`,
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  summary: () => get<Summary>("/api/summary"),
  analytics: () => get<Analytics>("/api/analytics"),
  calendar: () => get<{ days: CalendarDay[] }>("/api/calendar"),
  events: (min_fai = 0, limit = 500, nativeHighBoth = false) => {
    const search = new URLSearchParams({
      min_fai: String(min_fai),
      limit: String(limit),
      native_high_both: String(nativeHighBoth),
    });
    return get<EventCollection>(`/api/events?${search.toString()}`);
  },
  eventDetections: (eventId: string) =>
    get<EventDetections>(`/api/events/${encodeURIComponent(eventId)}/detections`),
  coverage: async (): Promise<Coverage> => {
    const response = await get<CoverageResponse>("/api/coverage");
    return {
      ...response,
      days: response.days.map((day) => {
        const sourceGroups = day.source_groups_present ?? day.source_files_present;
        const sourceGroupCount = day.source_group_count ?? day.source_file_count;
        if (!sourceGroups || sourceGroupCount === undefined) {
          throw new Error(`Coverage response for ${day.date} is missing source group fields.`);
        }
        return {
          date: day.date,
          source_groups_present: sourceGroups,
          source_group_count: sourceGroupCount,
          missing_sources: day.missing_sources,
        };
      }),
    };
  },
  agreement: () => get<AgreementSummary>("/api/agreement"),
  harmonizedEvents: (bbox?: string) => {
    const search = new URLSearchParams({ limit: "5000" });
    if (bbox) search.set("bbox", bbox);
    return get<HarmonizedEventCollection>(`/api/harmonized-events?${search.toString()}`);
  },
  detections: (params: {
    bbox?: string;
    sensor?: string[];
    platform?: string[];
    min_frp?: number;
    limit?: number;
  } = {}) => {
    const search = new URLSearchParams();
    if (params.bbox) search.set("bbox", params.bbox);
    params.sensor?.forEach((value) => search.append("sensor", value));
    params.platform?.forEach((value) => search.append("platform", value));
    if (params.min_frp !== undefined) search.set("min_frp", String(params.min_frp));
    search.set("limit", String(params.limit ?? 3000));
    return get<DetectionCollection>(`/api/detections?${search.toString()}`);
  },
  risk: () => get<{ total: number; items: Array<{
    event_id: string;
    event_date: string;
    latitude: number;
    longitude: number;
    detection_count: number;
    fai: number;
    risk_index: number;
    max_frp_mw: number;
    platforms: string[];
  }>; interpretation: string }>("/api/risk?limit=100"),
};
