import type { CalendarDay } from "../lib/types";

const color = {
  quiet: "bg-[#28342c] text-[#7d8c80]",
  moderate: "bg-[#765533] text-[#f3c583]",
  elevated: "bg-[#b96b38] text-[#fff0d6]",
  high: "bg-[#a94336] text-[#ffe0d7]",
};

export default function CalendarGrid({ days }: { days: CalendarDay[] }) {
  const offset = days.length ? (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  return (
    <div>
      <div className="grid grid-cols-7 gap-2">
        {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
          <div className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted" key={day}>{day}</div>
        ))}
        {Array.from({ length: offset }, (_, i) => <div key={`empty-${i}`} />)}
        {days.map((day) => (
          <div key={day.date} className={`min-h-[105px] rounded-lg border border-white/[0.04] p-3 ${color[day.activity_level]}`}>
            <div className="flex items-start justify-between">
              <span className="text-xs font-semibold">{Number(day.date.slice(-2))}</span>
              <span className="size-1.5 rounded-full bg-current opacity-80" />
            </div>
            <p className="mt-4 text-[14px] font-semibold text-white/90">{day.total_detections.toLocaleString()}</p>
            <p className="mt-1 text-[9px] uppercase tracking-wider text-white/60">{day.activity_level}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-muted">
        {Object.entries(color).map(([name, classes]) => (
          <div key={name} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${classes.split(" ")[0]}`} />{name}
          </div>
        ))}
        <span className="ml-auto">Intensity reflects detection count, not fire severity.</span>
      </div>
    </div>
  );
}
