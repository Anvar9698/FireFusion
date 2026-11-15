import type { ReactNode } from "react";
import { Card } from "./ui/card";

export default function MetricCard({
  label,
  value,
  note,
  icon,
  tone = "mint",
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  tone?: "mint" | "ember" | "blue" | "violet";
}) {
  return (
    <Card className="metric-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium text-muted">{label}</p>
          <p className="mt-2 text-[25px] font-semibold tracking-tight text-white">{value}</p>
        </div>
        <div className={`metric-icon ${tone}`}>{icon}</div>
      </div>
      <p className="mt-2 text-[10px] text-[#77837a]">{note}</p>
    </Card>
  );
}
