import {
  Activity, CalendarDays, ClipboardCheck, Flame, Layers3, LayoutDashboard,
  MapPinned, RadioTower,
} from "lucide-react";

export type Page = "overview" | "review" | "map" | "calendar" | "agreement" | "risk";

const items: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "review", label: "Analyst review", icon: ClipboardCheck },
  { id: "map", label: "Fire activity map", icon: MapPinned },
  { id: "calendar", label: "Fire activity calendar", icon: CalendarDays },
  { id: "agreement", label: "Fire Agreement Index", icon: Layers3 },
  { id: "risk", label: "Fire activity priority", icon: Activity },
];

export default function Sidebar({
  page,
  onNavigate,
  apiStatus,
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  apiStatus: "checking" | "connected" | "offline";
}) {
  const statusLabel = {
    checking: "Checking API connection",
    connected: "API connected",
    offline: "API offline",
  }[apiStatus];
  return (
    <aside className="sidebar fixed inset-y-0 left-0 z-[1000] flex w-[248px] flex-col border-r border-white/[0.07] bg-[#111613] px-4 py-5">
      <div className="flex items-center gap-3 px-2">
        <div className="flex size-10 items-center justify-center rounded-xl bg-ember/15 text-ember">
          <Flame size={21} fill="currentColor" />
        </div>
        <div>
          <p className="text-[15px] font-bold tracking-[0.12em] text-white">FIREFUSION</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted">Active fire intelligence</p>
        </div>
      </div>
      <div className="mt-10 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#657169]">Workspace</div>
      <nav className="mt-3 space-y-1">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`nav-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition ${
              page === id ? "active bg-white/[0.07] text-white" : "text-[#89948c] hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <Icon size={16} strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[#d9e1da]">
          <RadioTower size={14} className="text-mint" /> Data sources
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          NASA FIRMS · MODIS C6.1 + VIIRS C2
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className={`size-1.5 rounded-full ${apiStatus === "connected" ? "bg-mint shadow-[0_0_8px_#61d69a]" : apiStatus === "offline" ? "bg-red-400" : "bg-amber-300"}`} />
          <span className="text-[10px] text-[#8e9b91]">{statusLabel}</span>
        </div>
      </div>
    </aside>
  );
}
