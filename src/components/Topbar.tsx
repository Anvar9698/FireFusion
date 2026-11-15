import { CalendarClock, ChevronDown, CircleHelp } from "lucide-react";
import { Button } from "./ui/button";

export default function Topbar({ range }: { range: string }) {
  return (
    <header className="topbar flex h-[68px] items-center justify-between border-b border-white/[0.07] px-8">
      <div className="flex items-center gap-2 text-xs text-[#8c9990]">
        <span>Workspace</span><span className="text-[#4d5951]">/</span>
        <span className="font-medium text-[#d1d9d2]">Global monitoring</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[11px] text-[#bdc7be]">
          <CalendarClock size={14} className="text-muted" />
          <span>{range}</span><ChevronDown size={13} className="text-muted" />
        </div>
        <Button variant="outline" size="icon" className="rounded-lg border-white/[0.08] text-muted hover:text-white" aria-label="About this data">
          <CircleHelp size={15} />
        </Button>
        <div className="ml-1 flex size-8 items-center justify-center rounded-full bg-[#1f2c24] text-[10px] font-semibold text-mint">FF</div>
      </div>
    </header>
  );
}
