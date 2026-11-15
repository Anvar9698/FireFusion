import { lazy, Suspense, useEffect, useState } from "react";
import {
  CalendarDays, Layers3, MapPinned, Zap,
} from "lucide-react";
import Sidebar, { type Page } from "./components/Sidebar";
import Topbar from "./components/Topbar";
import CalendarGrid from "./components/CalendarGrid";
import AnalystReview from "./components/AnalystReview";
import { ActivityChart, ConfidenceChart, DailyTotalChart, FaiDistributionChart, PlatformChart } from "./components/Charts";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { api } from "./lib/api";
import type { AgreementSummary, Analytics, CalendarDay, Summary } from "./lib/types";
import { formatFrp, formatNumber } from "./lib/utils";

const FireMap = lazy(() => import("./components/FireMap"));

const pageText: Record<Page, { title: string; subtitle: string }> = {
  overview: { title: "Global fire activity", subtitle: "Sensor-aware overview of NASA FIRMS near-real-time active fire detections." },
  review: { title: "Analyst review queue", subtitle: "Triage multi-system candidates, inspect source detections, and record review status." },
  map: { title: "Fire activity map", subtitle: "Explore pixel-center detections from MODIS and VIIRS platforms." },
  calendar: { title: "Fire activity calendar", subtitle: "Daily fire detection counts in the supplied NRT dataset snapshot." },
  agreement: { title: "Fire Agreement Index (FAI)", subtitle: "A coarse space-time overlap proxy across MODIS and VIIRS detections." },
  risk: { title: "Fire activity priority", subtitle: "A transparent ranking of observed thermal activity, not a fire-spread forecast." },
};

function PageHeading({ page }: { page: Page }) {
  const item = pageText[page];
  return (
    <div className="mb-6 flex items-end justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-mint">
          <span className="size-1.5 rounded-full bg-mint" /> NASA FIRMS · Near real-time
        </div>
        <h1 className="text-[25px] font-semibold tracking-tight text-white">{item.title}</h1>
        <p className="mt-1.5 text-xs text-muted">{item.subtitle}</p>
      </div>
      <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[10px] text-[#aeb9af]">NASA FIRMS snapshot</span>
    </div>
  );
}

function formatRange(start: string | null, end: string | null) {
  if (!start || !end) return "No acquisition dates";
  const format = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "2-digit", timeZone: "UTC",
  });
  return `${format(start)} — ${format(end)}, ${end.slice(0, 4)}`;
}

function formatMonth(start: string | null) {
  if (!start) return "Fire activity calendar";
  return new Date(`${start}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function LoadingState({ message = "Loading real FIRMS records…" }: { message?: string }) {
  return <div className="grid min-h-[300px] place-items-center text-xs text-muted">{message}</div>;
}

function AgreementSection({ totalDetections }: { totalDetections: number }) {
  const [stats, setStats] = useState<AgreementSummary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.agreement()
      .then(setStats)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to calculate FAI"));
  }, []);
  const metrics = [
    { label: "Total Detections", value: formatNumber(totalDetections), detail: "Real source records" },
    { label: "Harmonized Events", value: stats ? formatNumber(stats.harmonized_events) : "—", detail: "FAI 100 · both sensor families", tone: "text-mint" },
    { label: "MODIS Only", value: stats ? formatNumber(stats.modis_only_events) : "—", detail: "FAI 50 · MODIS-associated groups", tone: "text-ember" },
    { label: "VIIRS Only", value: stats ? formatNumber(stats.viirs_only_events) : "—", detail: "FAI 50 · VIIRS-associated groups", tone: "text-[#69d5a0]" },
    { label: "Average FAI", value: stats ? stats.average_fai.toFixed(1) : "—", detail: "Across all proxy event groups", tone: "text-[#a8c9ff]" },
  ];
  return (
    <section aria-labelledby="fai-heading" className="mb-5 rounded-2xl border border-mint/20 bg-gradient-to-br from-mint/[0.07] via-[#151c18] to-[#151916] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-mint shadow-[0_0_10px_#61d69a]" />
            <h2 id="fai-heading" className="text-lg font-semibold tracking-tight text-white">Fire Agreement Index (FAI)</h2>
          </div>
          <p className="mt-1 text-[10px] text-muted">The harmonization signal is calculated from real MODIS and VIIRS detections.</p>
        </div>
        <span className="rounded-full border border-mint/20 bg-mint/[0.08] px-2.5 py-1 text-[9px] font-medium uppercase tracking-wide text-mint">Space-time association proxy</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 rounded-lg border border-white/[0.07] bg-black/20 p-3">
            <p className="text-[9px] font-medium uppercase tracking-wide text-muted">{metric.label}</p>
            <p className={`mt-1.5 truncate text-xl font-semibold ${metric.tone ?? "text-white"}`}>{metric.value}</p>
            <p className="mt-1 text-[9px] leading-snug text-[#839087]">{metric.detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <Card className="border-white/[0.07] bg-black/20">
          <CardHeader className="pb-0">
            <div>
              <CardTitle>FAI distribution</CardTitle>
              <p className="mt-1 text-[9px] text-muted">{stats ? `${formatNumber(stats.total_groups)} coarse event groups` : "Calculating from source detections…"}</p>
            </div>
          </CardHeader>
          <CardContent className="h-[150px]">
            {stats ? <FaiDistributionChart groupsByFai={stats.groups_by_fai} /> : <div className="grid h-full place-items-center text-[10px] text-muted">{error || "Loading agreement data…"}</div>}
          </CardContent>
        </Card>
        <Card className="border-white/[0.07] bg-black/20">
          <CardHeader className="pb-2"><div><CardTitle>Detection confidence</CardTitle><p className="mt-1 text-[9px] text-muted">Source-native tiers grouped for display</p></div></CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-2">
              {(["high", "medium", "low"] as const).map((level) => (
                <div key={level} className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-2.5">
                  <p className="text-[9px] capitalize text-muted">{level} confidence</p>
                  <p className="mt-1 text-[15px] font-semibold text-white">{stats ? formatNumber(stats.confidence_counts[level]) : "—"}</p>
                  <p className="text-[8px] text-[#839087]">detections</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-[#839087]">{(stats?.confidence_method ?? error) || "Confidence counts are being calculated."}</p>
          </CardContent>
        </Card>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] font-medium text-[#d9e3da]">
        <span><b className="text-mint">100</b> = Multiple satellite agreement</span>
        <span><b className="text-ember">50</b> = Single sensor agreement</span>
      </div>
      <p className="mt-1.5 text-[9px] leading-relaxed text-[#839087]">
        {stats?.method ?? "FAI groups detections by UTC date, 2-hour window, and 0.05° grid cell. This is a coarse association, not a confirmed incident match."}
      </p>
    </section>
  );
}

function MapView({ compact = false }: { compact?: boolean }) {
  return (
    <Suspense fallback={<div className={compact ? "h-[390px]" : "h-[520px]"} />}>
      <FireMap compact={compact} />
    </Suspense>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [calendarLoaded, setCalendarLoaded] = useState(false);
  const [error, setError] = useState("");
  const [apiStatus, setApiStatus] = useState<"checking" | "connected" | "offline">("checking");

  useEffect(() => {
    let active = true;
    Promise.all([api.summary(), api.analytics()])
      .then(([summaryData, analyticsData]) => {
        if (!active) return;
        setApiStatus("connected");
        setSummary(summaryData);
        setAnalytics(analyticsData);
      })
      .catch((reason: unknown) => {
        if (active) {
          setApiStatus("offline");
          setError(reason instanceof Error ? reason.message : "Unable to connect to the FireFusion API");
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (page !== "calendar" || calendarLoaded) return;
    let active = true;
    api.calendar()
      .then((result) => {
        if (active) {
          setCalendar(result.days);
          setCalendarLoaded(true);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setApiStatus("offline");
          setError(reason instanceof Error ? reason.message : "Unable to load the fire activity calendar");
        }
      });
    return () => { active = false; };
  }, [calendarLoaded, page]);

  const renderPage = () => {
    if (!summary || !analytics) return <LoadingState message={error || "Loading dataset analysis…"} />;
    if (page === "review") return <><PageHeading page={page} /><AnalystReview /></>;
    if (page === "map") {
      return <><PageHeading page={page} /><MapView /></>;
    }
    if (page === "calendar") {
      return (
        <>
          <PageHeading page={page} />
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader><div><CardTitle>{formatMonth(summary.date_range.start)}</CardTitle><p className="mt-1 text-[10px] text-muted">Acquisition dates represented in this dataset.</p></div><CalendarDays className="text-ember" size={17} /></CardHeader>
              <CardContent>{calendarLoaded ? <CalendarGrid days={calendar} /> : <LoadingState message={error || "Preparing daily activity…"} />}</CardContent>
            </Card>
            <Card>
              <CardHeader><div><CardTitle>Daily detections</CardTitle><p className="mt-1 text-[10px] text-muted">All sensors · source records</p></div></CardHeader>
              <CardContent className="h-[270px]"><DailyTotalChart data={analytics.daily} /></CardContent>
              <div className="mx-5 mb-5 rounded-lg border border-amber-400/10 bg-amber-300/[0.04] p-3 text-[10px] leading-relaxed text-[#b8a98c]">
                The final date contains fewer records and may be incomplete because this is an NRT snapshot.
              </div>
            </Card>
          </div>
        </>
      );
    }
    if (page === "agreement") {
      const modisCount = summary.by_sensor.MODIS ?? 0;
      const viirsCount = summary.by_sensor.VIIRS ?? 0;
      return (
        <>
          <PageHeading page={page} />
          <AgreementSection totalDetections={summary.total_detections} />
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader><div><CardTitle>Harmonized event map</CardTitle><p className="mt-1 text-[10px] text-muted">Green markers show FAI 100 coarse associations; source detections remain available.</p></div><Layers3 size={17} className="text-mint" /></CardHeader>
              <CardContent><MapView compact /></CardContent>
            </Card>
            <div className="space-y-4">
              <Card className="p-5">
                <p className="text-[11px] font-medium text-muted">MODIS detections</p>
                <p className="mt-2 text-3xl font-semibold text-white">{formatNumber(modisCount)}</p>
                <p className="mt-1 text-[10px] text-[#839087]">Terra + Aqua · 1 km nominal pixel</p>
                <div className="mt-4 h-1.5 rounded bg-white/[0.05]"><div className="h-full rounded bg-ember" style={{ width: `${modisCount / summary.total_detections * 100}%` }} /></div>
              </Card>
              <Card className="p-5">
                <p className="text-[11px] font-medium text-muted">VIIRS detections</p>
                <p className="mt-2 text-3xl font-semibold text-white">{formatNumber(viirsCount)}</p>
                <p className="mt-1 text-[10px] text-[#839087]">NOAA-20 + NOAA-21 · 375 m nominal pixel</p>
                <div className="mt-4 h-1.5 rounded bg-white/[0.05]"><div className="h-full rounded bg-mint" style={{ width: `${viirsCount / summary.total_detections * 100}%` }} /></div>
              </Card>
              <div className="rounded-xl border border-mint/10 bg-mint/[0.04] p-4 text-[11px] leading-relaxed text-[#aab8ad]">
                <b className="text-mint">Source detections:</b> MODIS and VIIRS records are kept separate from the green harmonized association layer. The layer shows coarse grid-and-time matches, not validated fire incidents.
              </div>
            </div>
          </div>
        </>
      );
    }
    if (page === "risk") {
      return (
        <>
          <PageHeading page={page} />
          <RiskTable />
        </>
      );
    }
    return (
      <>
        <PageHeading page={page} />
        <AgreementSection totalDetections={summary.total_detections} />
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <Card>
            <CardHeader><div><CardTitle>Detection activity & median FRP</CardTitle><p className="mt-1 text-[10px] text-muted">Daily counts by sensor; median FRP remains product-dependent.</p></div><span className="rounded-md bg-white/[0.04] px-2 py-1 text-[9px] text-muted">{analytics.daily.length} days</span></CardHeader>
            <CardContent className="h-[275px]"><ActivityChart data={analytics.daily} /></CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Activity map</CardTitle><p className="mt-1 text-[10px] text-muted">FIRMS pixel-center observations</p></div><MapPinned size={16} className="text-ember" /></CardHeader>
            <CardContent><MapView compact /></CardContent>
          </Card>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><div><CardTitle>Detections by platform</CardTitle><p className="mt-1 text-[10px] text-muted">Source detections; resolution differs by instrument.</p></div></CardHeader>
            <CardContent className="h-[240px]"><PlatformChart data={analytics.platforms} /></CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Detection confidence</CardTitle><p className="mt-1 text-[10px] text-muted">Native scales shown separately; values are not cross-calibrated.</p></div></CardHeader>
            <CardContent className="h-[240px]"><ConfidenceChart data={analytics.confidence} /></CardContent>
          </Card>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader><div><CardTitle>Fire radiative power by platform</CardTitle><p className="mt-1 text-[10px] text-muted">Per-detection FRP · MW</p></div><Zap size={16} className="text-ember" /></CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {Object.entries(analytics.frp).map(([platform, value]) => (
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3" key={platform}>
                    <p className="text-[10px] text-muted">{platform}</p>
                    <p className="mt-2 text-[16px] font-semibold text-white">{formatFrp(value.median_mw)}</p>
                    <p className="mt-1 text-[9px] text-[#78847b]">median · n={formatNumber(value.count)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[9px] leading-relaxed text-[#77837a]">FRP values share units but differ by sensor, footprint and retrieval. Do not rank sensor fire intensity from raw medians.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Dataset quality</CardTitle><p className="mt-1 text-[10px] text-muted">Full-file audit results</p></div><span className="rounded-full bg-mint/10 px-2 py-1 text-[9px] text-mint">Validated</span></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  ["Files ingested", `${summary.files.length} / 21`],
                  ["Missing values", formatNumber(summary.files.reduce((sum, file) => sum + file.missing_values, 0))],
                  ["Malformed rows", formatNumber(summary.files.reduce((sum, file) => sum + file.malformed_rows, 0))],
                  ["Exact duplicate rows", "0"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between border-b border-white/[0.05] pb-2 text-[11px] last:border-0">
                    <span className="text-[#8b978e]">{label}</span><span className="font-medium text-[#d5ded6]">{value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[9px] text-[#77837a]">1 repeated NOAA-21 time/coordinate key has differing values; both detections are preserved.</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-canvas text-white">
      <Sidebar page={page} onNavigate={setPage} apiStatus={apiStatus} />
      <div className="ml-[248px] min-h-screen">
        <Topbar range={summary ? formatRange(summary.date_range.start, summary.date_range.end) : "Loading dates"} />
        <main className="mx-auto max-w-[1500px] px-8 py-7">
          {renderPage()}
        </main>
        <footer className="mx-8 border-t border-white/[0.06] py-4 text-[9px] leading-relaxed text-[#647067]">
          FireFusion · NASA FIRMS NRT snapshots · Fire detections represent flagged pixels, not fire boundaries. FAI and fire activity priority are derived indicators, not calibrated predictions.
        </footer>
      </div>
    </div>
  );
}

function RiskTable() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.risk>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.risk().then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load priority list"));
  }, []);
  if (!data) return <LoadingState message={error || "Ranking observed activity…"} />;
  return (
    <Card>
      <CardHeader><div><CardTitle>Highest activity-priority groups</CardTitle><p className="mt-1 text-[10px] text-muted">Ranked proxy events · {data.total.toLocaleString()} coarse bins</p></div></CardHeader>
      <CardContent>
        <div className="mb-4 rounded-lg border border-amber-400/10 bg-amber-300/[0.04] p-3 text-[10px] leading-relaxed text-[#bdae90]">{data.interpretation}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-[11px]">
            <thead className="border-b border-white/[0.08] text-[9px] uppercase tracking-wider text-muted">
              <tr><th className="pb-3">Rank</th><th className="pb-3">Date</th><th className="pb-3">Location</th><th className="pb-3">Platforms</th><th className="pb-3">Detections</th><th className="pb-3">Max FRP</th><th className="pb-3">FAI</th><th className="pb-3">Activity priority</th></tr>
            </thead>
            <tbody>
              {data.items.slice(0, 60).map((item, index) => (
                <tr key={item.event_id} className="border-b border-white/[0.045] text-[#c5cec6] last:border-0">
                  <td className="py-3 text-muted">{String(index + 1).padStart(2, "0")}</td>
                  <td className="py-3">{item.event_date}</td>
                  <td className="py-3 font-mono text-[10px]">{item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}</td>
                  <td className="py-3">{item.platforms.join(", ")}</td>
                  <td className="py-3">{item.detection_count}</td>
                  <td className="py-3">{formatFrp(item.max_frp_mw)}</td>
                  <td className="py-3">{item.fai}%</td>
                  <td className="py-3"><span className="rounded-md bg-ember/10 px-2 py-1 font-semibold text-ember">{item.risk_index}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
