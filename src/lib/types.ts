export type Sensor = "MODIS" | "VIIRS";
export type Platform = "Terra" | "Aqua" | "NOAA-20" | "NOAA-21";

export interface Summary {
  total_detections: number;
  date_range: { start: string | null; end: string | null };
  by_sensor: Record<string, number>;
  by_platform: Record<string, number>;
  files: Array<{
    file: string;
    platform: string;
    sensor: Sensor;
    product_version: string;
    rows: number;
    missing_values: number;
    malformed_rows: number;
  }>;
  data_notes: string[];
}

export interface EventCollection {
  total: number;
  items: EventRecord[];
  method: string;
}

export interface AgreementSummary {
  total_detections: number;
  total_groups: number;
  groups_by_fai: Record<string, number>;
  harmonized_events: number;
  modis_only_events: number;
  viirs_only_events: number;
  average_fai: number;
  corroborated_groups: number;
  confidence_counts: Record<"high" | "medium" | "low", number>;
  confidence_by_sensor: Record<Sensor, Record<"high" | "medium" | "low", number>>;
  confidence_method: string;
  method: string;
}

export interface HarmonizedEventProperties {
  event_id: string;
  event_date: string;
  time_window_utc: string;
  detection_count: number;
  sensors: string[];
  platforms: string[];
  fai: number;
  max_frp_mw: number;
  risk_index: number;
}

export interface HarmonizedEventFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: HarmonizedEventProperties;
}

export interface HarmonizedEventCollection {
  type: "FeatureCollection";
  features: HarmonizedEventFeature[];
  total: number;
}

export interface DetectionProperties {
  detection_id: string;
  sensor: Sensor;
  platform: Platform;
  source_satellite: string;
  product: string;
  product_version: string;
  frp_product: string;
  acq_date: string;
  acq_time: string;
  daynight: "Day" | "Night";
  frp: number;
  confidence_raw: string;
  confidence: string;
  confidence_scheme: string;
  version: string;
  scan: number;
  track: number;
  source_file: string;
  brightness?: number | null;
  bright_t31?: number | null;
  bright_ti4?: number | null;
  bright_ti5?: number | null;
}

export interface DetectionFeature {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: DetectionProperties;
}

export interface DetectionCollection {
  type: "FeatureCollection";
  features: DetectionFeature[];
  total: number;
}

export interface EventRecord {
  event_id: string;
  event_date: string;
  time_window_utc: string;
  latitude: number;
  longitude: number;
  detection_count: number;
  modis_detections: number;
  viirs_detections: number;
  modis_native_high: number;
  viirs_native_high: number;
  sensors: string[];
  platforms: string[];
  fai: number;
  max_frp_mw: number;
  mean_frp_mw: number;
  risk_index: number;
  confidence_summary: { source_categories: string[] };
}

export interface EventDetections {
  total: number;
  items: Array<{
    detection_id: string;
    sensor: Sensor;
    platform: Platform;
    source_file: string;
    source_row: number;
    acq_date: string;
    acq_time: string;
    latitude: number;
    longitude: number;
    confidence_raw: string;
    confidence_scheme: string;
    frp: number;
    scan: number;
    track: number;
    product_version: string;
  }>;
}

export interface Coverage {
  date_range: { start: string | null; end: string | null };
  acquisition_days: number;
  source_file_count: number;
  expected_sources: string[];
  days: Array<{
    date: string;
    source_groups_present: string[];
    source_group_count: number;
    missing_sources: string[];
  }>;
  last_data_update_time: string | null;
  freshness_note: string;
  coverage_note: string;
}

export interface CoverageResponse extends Omit<Coverage, "days"> {
  days: Array<{
    date: string;
    source_groups_present?: string[];
    source_group_count?: number;
    source_files_present?: string[];
    source_file_count?: number;
    missing_sources: string[];
  }>;
}

export interface CalendarDay {
  date: string;
  total_detections: number;
  by_sensor: Record<string, number>;
  max_frp_mw: number;
  mean_frp_mw: number;
  high_fai_events: number;
  activity_level: "quiet" | "moderate" | "elevated" | "high";
}

export interface Analytics {
  daily: Array<{
    date: string;
    total: number;
    modis: number;
    viirs: number;
    modis_median_frp: number;
    viirs_median_frp: number;
  }>;
  platforms: Array<{
    platform: Platform;
    detections: number;
    median_frp_mw: number;
    day: number;
    night: number;
  }>;
  confidence: Array<{ sensor: Sensor; confidence: string; detections: number }>;
  frp: Record<string, { count: number; median_mw: number; mean_mw: number; max_mw: number }>;
}
