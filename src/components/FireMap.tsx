import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents,
} from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import { api } from "../lib/api";
import type { DetectionFeature, DetectionCollection, HarmonizedEventCollection } from "../lib/types";
import { formatFrp } from "../lib/utils";

const INITIAL_BOUNDS = "-180,-60,180,75";
const colors: Record<string, string> = {
  MODIS: "#f6a14a",
  VIIRS: "#69d5a0",
};
const harmonizedColor = "#52f07b";

function boundsString(map: LeafletMap) {
  const bounds = map.getBounds();
  return [
    bounds.getWest().toFixed(4),
    bounds.getSouth().toFixed(4),
    bounds.getEast().toFixed(4),
    bounds.getNorth().toFixed(4),
  ].join(",");
}

function BoundsReporter({ onChange }: { onChange: (bounds: string) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(boundsString(map)),
    zoomend: () => onChange(boundsString(map)),
  });
  return null;
}

function MapController({ bounds }: { bounds: string }) {
  const map = useMap();
  useEffect(() => {
    const [west, south, east, north] = bounds.split(",").map(Number);
    if ([west, south, east, north].every(Number.isFinite)) {
      map.fitBounds([[south, west], [north, east]], { animate: false });
    }
  }, [bounds, map]);
  return null;
}

function PopupCard({ item }: { item: DetectionFeature }) {
  const p = item.properties;
  return (
    <div className="min-w-[190px] text-[#253029]">
      <div className="flex items-center justify-between">
        <strong className="text-[12px]">{p.platform} · {p.sensor}</strong>
        <span className="text-[10px] text-slate-500">{p.daynight}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <span>Acquired</span><b>{p.acq_date} {p.acq_time} UTC</b>
        <span>Fire radiative power</span><b>{formatFrp(p.frp)}</b>
        <span>Detection confidence</span><b>{p.confidence_raw}</b>
        <span>Pixel footprint</span><b>{p.scan.toFixed(2)} × {p.track.toFixed(2)} km</b>
      </div>
      <p className="mt-2 border-t pt-2 text-[9px] text-slate-500">{p.source_file}</p>
    </div>
  );
}

export default function FireMap({
  compact = false,
  showSensors = true,
}: {
  compact?: boolean;
  showSensors?: boolean;
}) {
  const [bounds, setBounds] = useState(INITIAL_BOUNDS);
  const [collection, setCollection] = useState<DetectionCollection | null>(null);
  const [harmonizedCollection, setHarmonizedCollection] = useState<HarmonizedEventCollection | null>(null);
  const [error, setError] = useState("");
  const [harmonizedError, setHarmonizedError] = useState("");
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState({ MODIS: true, VIIRS: true });
  const [harmonizedEnabled, setHarmonizedEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const selectedSensors = Object.entries(enabled)
      .filter(([, value]) => value)
      .map(([key]) => key);
    if (showSensors && selectedSensors.length === 0) {
      setCollection({ type: "FeatureCollection", features: [], total: 0 });
      setLoading(false);
      return;
    }
    try {
      const result = await api.detections({
        bbox: bounds,
        sensor: showSensors ? selectedSensors : undefined,
        limit: compact ? 2200 : 5000,
      });
      setCollection(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load detections");
    } finally {
      setLoading(false);
    }
  }, [bounds, compact, enabled, showSensors]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setHarmonizedError("");
      api.harmonizedEvents(bounds)
        .then((result) => {
          if (active) setHarmonizedCollection(result);
        })
        .catch((reason: unknown) => {
          if (active) setHarmonizedError(reason instanceof Error ? reason.message : "Unable to load harmonized events");
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [bounds]);

  const detections = useMemo(() => collection?.features ?? [], [collection]);
  const harmonizedEvents = useMemo(() => harmonizedCollection?.features ?? [], [harmonizedCollection]);
  return (
    <div className={`fire-map relative overflow-hidden rounded-xl ${compact ? "h-[390px]" : "h-[calc(100vh-180px)] min-h-[520px]"}`}>
      <MapContainer center={[12, 0]} zoom={2} minZoom={2} maxZoom={12} scrollWheelZoom className="h-full w-full">
        <MapController bounds={INITIAL_BOUNDS} />
        <BoundsReporter onChange={setBounds} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {detections.map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates;
          const p = feature.properties;
          return (
            <CircleMarker
              key={feature.id}
              center={[latitude, longitude]}
              radius={Math.min(7, 2.2 + Math.sqrt(Math.max(0, p.frp)) / 9)}
              pathOptions={{
                color: colors[p.sensor],
                fillColor: colors[p.sensor],
                fillOpacity: 0.72,
                weight: 0.5,
              }}
            ><Popup><PopupCard item={feature} /></Popup></CircleMarker>
          );
        })}
        {harmonizedEnabled && harmonizedEvents.map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates;
          const p = feature.properties;
          return (
            <CircleMarker
              key={`harmonized-${p.event_id}`}
              center={[latitude, longitude]}
              radius={6}
              pathOptions={{
                color: "#e8ffe9",
                fillColor: harmonizedColor,
                fillOpacity: 0.94,
                weight: 1.2,
              }}
            >
              <Popup>
                <div className="min-w-[190px] text-[#253029]">
                  <strong className="text-[12px]">FAI 100 · Multiple satellite agreement</strong>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                    <span>Acquired</span><b>{p.event_date} · {p.time_window_utc} UTC</b>
                    <span>Source sensors</span><b>{p.sensors.join(", ")}</b>
                    <span>Platforms</span><b>{p.platforms.join(", ")}</b>
                    <span>Grouped detections</span><b>{p.detection_count.toLocaleString()}</b>
                  </div>
                  <p className="mt-2 border-t pt-2 text-[9px] text-slate-500">Coarse grid-and-time association; not a validated incident match.</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {!compact && (
        <>
          <div className="absolute left-[58px] top-4 z-[500] rounded-lg border border-white/10 bg-[#151b18]/95 px-3 py-2 text-[10px] text-[#cbd4cc] shadow-lg">
            {loading ? "Updating map…" : `${detections.length.toLocaleString()} of ${(collection?.total ?? 0).toLocaleString()} detections`}
            {harmonizedCollection && ` · ${harmonizedEvents.length.toLocaleString()} of ${harmonizedCollection.total.toLocaleString()} harmonized events`}
          </div>
          <div className="absolute right-4 top-4 z-[500] flex flex-wrap justify-end gap-1 rounded-lg border border-white/10 bg-[#151b18]/95 p-1 shadow-lg">
            <button
              onClick={() => setHarmonizedEnabled((current) => !current)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] ${harmonizedEnabled ? "text-white" : "text-[#667169]"}`}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: harmonizedColor }} />Harmonized events
            </button>
            {showSensors && (
              <>
              {Object.entries(colors).map(([sensor, color]) => (
                <button
                  key={sensor}
                  onClick={() => setEnabled((current) => ({ ...current, [sensor]: !current[sensor as keyof typeof current] }))}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] ${enabled[sensor as keyof typeof enabled] ? "text-white" : "text-[#667169]"}`}
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />{sensor} detections
                </button>
              ))}
              </>
            )}
          </div>
        </>
      )}
      {error && <div className="absolute bottom-4 left-4 z-[500] rounded-lg bg-red-950/90 px-3 py-2 text-xs text-red-100">{error}</div>}
      {harmonizedError && <div className="absolute bottom-4 right-4 z-[500] rounded-lg bg-red-950/90 px-3 py-2 text-xs text-red-100">{harmonizedError}</div>}
      {compact && <div className="absolute bottom-3 left-3 z-[500] rounded-md bg-[#131916]/90 px-2 py-1 text-[9px] text-[#c3cec5]">MODIS <span className="text-[#f6a14a]">●</span> &nbsp; VIIRS <span className="text-[#69d5a0]">●</span> &nbsp; Harmonized FAI 100 <span className="text-[#52f07b]">●</span></div>}
      {!compact && <div className="absolute bottom-4 left-[58px] z-[400] rounded-md bg-[#151b18]/90 px-2 py-1 text-[9px] text-[#c3cec5]">OpenStreetMap place names are shown in English where available.</div>}
    </div>
  );
}
