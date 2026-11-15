import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MapPin, Search } from "lucide-react";
import { api } from "../lib/api";
import type {
  AgreementSummary,
  Coverage,
  EventCollection,
  EventRecord,
} from "../lib/types";
import { formatNumber } from "../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const REVIEWED_STORAGE_KEY = "firefusion.reviewed-candidates.v1";

function formatUtc(value: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return `${date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
}

function candidateSearchText(candidate: EventRecord) {
  return [
    candidate.event_date,
    candidate.latitude.toFixed(3),
    candidate.longitude.toFixed(3),
    ...candidate.platforms,
  ].join(" ").toLowerCase();
}

export default function AnalystReview() {
  const [queue, setQueue] = useState<EventCollection | null>(null);
  const [agreement, setAgreement] = useState<AgreementSummary | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detections, setDetections] = useState<Awaited<ReturnType<typeof api.eventDetections>> | null>(null);
  const [error, setError] = useState("");
  const [detectionError, setDetectionError] = useState("");
  const [search, setSearch] = useState("");
  const [bothNativeHigh, setBothNativeHigh] = useState(true);
  const [showReviewed, setShowReviewed] = useState(false);
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.agreement(), api.coverage()])
      .then(([agreementData, coverageData]) => {
        if (!active) return;
        setAgreement(agreementData);
        setCoverage(coverageData);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load analyst review data");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setQueue(null);
    setSelectedId("");
    api.events(100, 500, bothNativeHigh)
      .then((queueData) => {
        if (!active) return;
        setQueue(queueData);
        setSelectedId(queueData.items[0]?.event_id ?? "");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load analyst review queue");
      });
    return () => { active = false; };
  }, [bothNativeHigh]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REVIEWED_STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
          throw new Error("Saved review status has an unexpected format.");
        }
        setReviewedIds(parsed);
      }
    } catch (reason) {
      setStorageError(reason instanceof Error ? reason.message : "Unable to read saved review status");
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetections(null);
      return;
    }
    let active = true;
    setDetections(null);
    setDetectionError("");
    api.eventDetections(selectedId)
      .then((result) => {
        if (active) setDetections(result);
      })
      .catch((reason: unknown) => {
        if (active) setDetectionError(reason instanceof Error ? reason.message : "Unable to load source detections");
      });
    return () => { active = false; };
  }, [selectedId]);

  const candidates = useMemo(() => {
    if (!queue) return [];
    const query = search.trim().toLowerCase();
    return queue.items.filter((candidate) => {
      const isReviewed = reviewedIds.includes(candidate.event_id);
      return isReviewed === showReviewed
        && (!query || candidateSearchText(candidate).includes(query));
    });
  }, [queue, reviewedIds, search, showReviewed]);

  const selected = queue?.items.find((candidate) => candidate.event_id === selectedId) ?? null;
  const selectedIsReviewed = selected ? reviewedIds.includes(selected.event_id) : false;

  function toggleReviewed(candidate: EventRecord) {
    const next = reviewedIds.includes(candidate.event_id)
      ? reviewedIds.filter((eventId) => eventId !== candidate.event_id)
      : [...reviewedIds, candidate.event_id];
    try {
      window.localStorage.setItem(REVIEWED_STORAGE_KEY, JSON.stringify(next));
      setReviewedIds(next);
      setStorageError("");
    } catch (reason) {
      setStorageError(reason instanceof Error ? reason.message : "Unable to save review status");
    }
  }

  if (error) {
    return <div role="alert" className="rounded-xl border border-red-400/20 bg-red-950/30 p-4 text-sm text-red-100">{error}</div>;
  }
  if (!queue || !agreement || !coverage) {
    return <div className="grid min-h-[220px] place-items-center text-sm text-muted">Loading review candidates and source coverage…</div>;
  }

  const start = coverage.date_range.start ?? "Unavailable";
  const end = coverage.date_range.end ?? "Unavailable";
  const openCount = queue.items.filter((candidate) => !reviewedIds.includes(candidate.event_id)).length;
  const reviewedCount = queue.items.length - openCount;

  return (
    <div className="space-y-4">
      <section aria-label="Fusion benefit summary" className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Multi-system candidates</p>
          <p className="mt-2 text-2xl font-semibold text-mint">{formatNumber(agreement.groups_by_fai["100"] ?? 0)}</p>
          <p className="mt-1 text-[10px] text-[#839087]">FAI 100 groups with both sensor families in the same coarse time-space bin.</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Single-family groups</p>
          <p className="mt-2 text-2xl font-semibold text-ember">{formatNumber(agreement.groups_by_fai["50"] ?? 0)}</p>
          <p className="mt-1 text-[10px] text-[#839087]">Baseline groups represented by MODIS or VIIRS detections only.</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Source detections preserved</p>
          <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(agreement.total_detections)}</p>
          <p className="mt-1 text-[10px] text-[#839087]">Fusion groups remain separate from the underlying sensor observations.</p>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Coverage and freshness</CardTitle>
            <p className="mt-1 text-[10px] text-muted">Snapshot coverage: {start} through {end}</p>
          </div>
          <div className="text-right text-[10px] text-[#aeb9af]">
            <p className="font-medium">Latest source file modification</p>
            <p className="mt-1">{formatUtc(coverage.last_data_update_time)}</p>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="mb-3 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[#cbd4cc]">{coverage.acquisition_days} acquisition days</span>
            <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[#cbd4cc]">{coverage.source_file_count} source files</span>
            <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[#cbd4cc]">{coverage.expected_sources.length} source groups expected per covered day</span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {coverage.days.map((day) => (
              <div key={day.date} className="rounded-md border border-white/[0.06] bg-black/10 px-2.5 py-2 text-[10px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#d5ded6]">{day.date}</span>
                  <span className={day.missing_sources.length ? "text-amber-300" : "text-mint"}>
                    {day.source_group_count}/{coverage.expected_sources.length} source groups
                  </span>
                </div>
                <p className="mt-1 text-[#839087]">{day.source_groups_present.join(" · ") || "No source groups"}</p>
                {day.missing_sources.length > 0 && <p className="mt-1 text-amber-200">Missing: {day.missing_sources.join(", ")}</p>}
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-[9px] leading-relaxed text-[#839087]">
            <p>{coverage.freshness_note}</p>
            <p>{coverage.coverage_note}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Analyst review queue</CardTitle>
              <p className="mt-1 text-[10px] text-muted">
                FAI 100 candidates · showing {queue.items.length} of {formatNumber(queue.total)} matching groups, ordered by the existing activity-priority proxy.
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={!showReviewed}
                onClick={() => setShowReviewed(false)}
                className={`rounded-md px-2.5 py-1.5 text-[10px] ${!showReviewed ? "bg-mint/10 text-mint" : "text-muted hover:bg-white/[0.04]"}`}
              >
                Needs review ({openCount})
              </button>
              <button
                type="button"
                aria-pressed={showReviewed}
                onClick={() => setShowReviewed(true)}
                className={`rounded-md px-2.5 py-1.5 text-[10px] ${showReviewed ? "bg-mint/10 text-mint" : "text-muted hover:bg-white/[0.04]"}`}
              >
                Reviewed ({reviewedCount})
              </button>
              <label className="ml-auto flex items-center gap-2 text-[10px] text-[#bac5bc]">
                <input type="checkbox" checked={bothNativeHigh} onChange={(event) => setBothNativeHigh(event.target.checked)} />
                Only native high tier in both
              </label>
            </div>
            <label className="mb-3 flex items-center gap-2 rounded-md border border-white/[0.07] bg-black/10 px-2.5 py-2">
              <Search size={13} className="text-muted" />
              <input
                aria-label="Search candidates"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search date, coordinate, or platform"
                className="min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-[#657169]"
              />
            </label>
            <div className="max-h-[570px] overflow-auto">
              <table className="w-full min-w-[560px] text-left text-[10px]">
                <thead className="sticky top-0 bg-[#171d19] text-[9px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-2 py-2">Candidate</th>
                    <th className="px-2 py-2">Native high tiers</th>
                    <th className="px-2 py-2">Activity priority</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => {
                    const isReviewed = reviewedIds.includes(candidate.event_id);
                    return (
                      <tr
                        key={candidate.event_id}
                        className={`border-t border-white/[0.05] ${selectedId === candidate.event_id ? "bg-mint/[0.07]" : "hover:bg-white/[0.025]"}`}
                      >
                        <td className="px-2 py-2.5">
                          <button
                            type="button"
                            aria-pressed={selectedId === candidate.event_id}
                            onClick={() => setSelectedId(candidate.event_id)}
                            className="w-full text-left"
                          >
                            <p className="text-[#e1e8e2]">{candidate.event_date} · {candidate.time_window_utc} UTC</p>
                            <p className="mt-1 text-[#839087]">{candidate.latitude.toFixed(3)}, {candidate.longitude.toFixed(3)} · {candidate.detection_count} detections</p>
                          </button>
                        </td>
                        <td className="px-2 py-2.5 text-[#cbd4cc]">
                          <p>MODIS {candidate.modis_native_high}/{candidate.modis_detections}</p>
                          <p className="mt-1">VIIRS {candidate.viirs_native_high}/{candidate.viirs_detections}</p>
                        </td>
                        <td className="px-2 py-2.5 text-ember">{candidate.risk_index.toFixed(1)}</td>
                        <td className="px-2 py-2.5 text-[#839087]">{isReviewed ? "Reviewed" : "Open"}</td>
                      </tr>
                    );
                  })}
                  {candidates.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-muted">No candidates match these queue filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[9px] leading-relaxed text-[#839087]">
              MODIS native high means 80–100; VIIRS native high means the product category “high”. These source-specific tiers are not calibrated or probability-equivalent.
            </p>
            {storageError && <p role="alert" className="mt-2 text-[10px] text-amber-200">Review status could not be saved: {storageError}</p>}
            <p className="mt-1 text-[9px] text-[#657169]">Review status is stored in this browser only.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Candidate verification panel</CardTitle>
              <p className="mt-1 text-[10px] text-muted">Inspect the grouped evidence before treating it as an incident.</p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!selected ? (
              <p className="py-8 text-center text-xs text-muted">Select a candidate from the review queue.</p>
            ) : (
              <>
                <div className="rounded-lg border border-amber-300/10 bg-amber-200/[0.035] p-3 text-[10px] leading-relaxed text-[#c3b796]">
                  Association proxy only—not a verified fire incident. FAI 100 means both sensor families occur in the same date, two-hour UTC window, and 0.05° grid cell.
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                  <div className="rounded-md bg-black/10 p-2.5"><p className="text-muted">Date / UTC window</p><p className="mt-1 text-[#e1e8e2]">{selected.event_date}<br />{selected.time_window_utc} UTC</p></div>
                  <div className="rounded-md bg-black/10 p-2.5"><p className="text-muted">Candidate location</p><p className="mt-1 font-mono text-[#e1e8e2]">{selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}</p></div>
                  <div className="rounded-md bg-black/10 p-2.5"><p className="text-muted">MODIS native tier</p><p className="mt-1 text-[#e1e8e2]">{selected.modis_native_high} of {selected.modis_detections} detections ≥80</p></div>
                  <div className="rounded-md bg-black/10 p-2.5"><p className="text-muted">VIIRS native tier</p><p className="mt-1 text-[#e1e8e2]">{selected.viirs_native_high} of {selected.viirs_detections} detections categorized “high”</p></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}#map=10/${selected.latitude}/${selected.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] px-2.5 py-2 text-[10px] text-[#cbd4cc] hover:bg-white/[0.04]"
                  >
                    <MapPin size={12} /> Open location <ExternalLink size={10} />
                  </a>
                  <button
                    type="button"
                    onClick={() => toggleReviewed(selected)}
                    className="rounded-md bg-mint/10 px-2.5 py-2 text-[10px] font-medium text-mint hover:bg-mint/20"
                  >
                    {selectedIsReviewed ? "Return to needs review" : "Mark reviewed"}
                  </button>
                </div>

                <div className="mt-4 border-t border-white/[0.07] pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-[#d5ded6]">Contributing source detections</p>
                    {detections && <span className="text-[9px] text-muted">{detections.items.length} of {detections.total}</span>}
                  </div>
                  {detectionError && <p role="alert" className="mt-2 text-[10px] text-red-200">{detectionError}</p>}
                  {!detections && !detectionError && <p className="mt-3 text-[10px] text-muted">Loading source records…</p>}
                  {detections && (
                    <div className="mt-2 max-h-[250px] overflow-auto">
                      <table className="w-full min-w-[440px] text-left text-[9px]">
                        <thead className="sticky top-0 bg-[#171d19] text-muted">
                          <tr><th className="px-1.5 py-1.5">Source</th><th className="px-1.5 py-1.5">Time UTC</th><th className="px-1.5 py-1.5">Native confidence</th><th className="px-1.5 py-1.5">FRP / MW</th></tr>
                        </thead>
                        <tbody>
                          {detections.items.map((detection) => (
                            <tr key={detection.detection_id} className="border-t border-white/[0.05] text-[#bac5bc]">
                              <td className="px-1.5 py-2">
                                <span>{detection.platform}</span>
                                <span className="block text-[#657169]">{detection.source_file}:{detection.source_row}</span>
                              </td>
                              <td className="px-1.5 py-2">{detection.acq_date} {detection.acq_time}</td>
                              <td className="px-1.5 py-2">{detection.confidence_raw}<span className="block text-[#657169]">{detection.confidence_scheme}</span></td>
                              <td className="px-1.5 py-2">{detection.frp.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {detections && detections.total > detections.items.length && (
                    <p className="mt-2 text-[9px] text-muted">A deterministic sample is shown; the total source-record count is preserved.</p>
                  )}
                </div>
                <p className="mt-3 text-[9px] leading-relaxed text-[#839087]">
                  Verify the source records and location against authoritative incident information. Activity priority is an unvalidated ranking proxy, not fire severity, spread, or life-safety risk.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
