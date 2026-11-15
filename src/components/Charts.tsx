import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart,
  LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Analytics } from "../lib/types";
import { formatNumber } from "../lib/utils";

const axis = { fill: "#829087", fontSize: 10 };
const tooltipStyle = {
  backgroundColor: "#171e1a",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 8,
  color: "#e7eee8",
  fontSize: 11,
};

export function ActivityChart({ data }: { data: Analytics["daily"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ left: -18, right: 4, top: 8, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
        <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} tickFormatter={(value: string) => value.slice(5)} />
        <YAxis yAxisId="count" tick={axis} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
        <YAxis yAxisId="frp" orientation="right" tick={axis} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [name.includes("FRP") ? `${value.toFixed(1)} MW` : formatNumber(value), name]} />
        <Legend wrapperStyle={{ fontSize: 10, color: "#8e9990" }} />
        <Area yAxisId="count" type="monotone" dataKey="viirs" stackId="a" stroke="#62c998" fill="#62c998" fillOpacity={0.16} name="VIIRS detections" />
        <Area yAxisId="count" type="monotone" dataKey="modis" stackId="a" stroke="#f3a24d" fill="#f3a24d" fillOpacity={0.16} name="MODIS detections" />
        <Line yAxisId="frp" type="monotone" dataKey="modis_median_frp" stroke="#ffcc82" strokeWidth={2} dot={{ r: 2 }} name="MODIS median FRP" />
        <Line yAxisId="frp" type="monotone" dataKey="viirs_median_frp" stroke="#8fd7b2" strokeWidth={2} dot={{ r: 2 }} name="VIIRS median FRP" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function PlatformChart({ data }: { data: Analytics["platforms"] }) {
  const palette: Record<string, string> = { Terra: "#f3a24d", Aqua: "#e5bd72", "NOAA-20": "#60c995", "NOAA-21": "#49a9a0" };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: -18, right: 4, top: 8, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
        <XAxis dataKey="platform" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatNumber(value)} />
        <Bar dataKey="detections" name="Detections" radius={[4, 4, 0, 0]}>
          {data.map((entry) => <Cell key={entry.platform} fill={palette[entry.platform] ?? "#69d5a0"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ConfidenceChart({ data }: { data: Analytics["confidence"] }) {
  const viirs = data.filter((item) => item.sensor === "VIIRS")
    .filter((item) => ["low", "nominal", "high"].includes(item.confidence))
    .reduce<Record<string, number>>((acc, item) => {
      acc[item.confidence] = (acc[item.confidence] ?? 0) + item.detections;
      return acc;
    }, {});
  const modis = data.filter((item) => item.sensor === "MODIS");
  const groupedModis = [
    { name: "MODIS <30", count: modis.filter((item) => Number(item.confidence) < 30).reduce((sum, item) => sum + item.detections, 0), color: "#e37a57" },
    { name: "MODIS 30–79", count: modis.filter((item) => Number(item.confidence) >= 30 && Number(item.confidence) < 80).reduce((sum, item) => sum + item.detections, 0), color: "#f0b768" },
    { name: "MODIS 80–100", count: modis.filter((item) => Number(item.confidence) >= 80).reduce((sum, item) => sum + item.detections, 0), color: "#b1d591" },
    { name: "VIIRS low", count: viirs.low ?? 0, color: "#e37a57" },
    { name: "VIIRS nominal", count: viirs.nominal ?? 0, color: "#f0b768" },
    { name: "VIIRS high", count: viirs.high ?? 0, color: "#b1d591" },
  ];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={groupedModis} layout="vertical" margin={{ left: 28, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid stroke="rgba(255,255,255,.06)" horizontal={false} />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
        <YAxis type="category" dataKey="name" tick={{ ...axis, fontSize: 9 }} width={90} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatNumber(value)} />
        <Bar dataKey="count" name="Detections" radius={[0, 4, 4, 0]}>
          {groupedModis.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FaiDistributionChart({ groupsByFai }: { groupsByFai: Record<string, number> }) {
  const data = [
    { label: "50 · Single sensor", count: groupsByFai["50"] ?? 0, color: "#f3a24d" },
    { label: "100 · Multiple satellites", count: groupsByFai["100"] ?? 0, color: "#55d68b" },
  ];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 60, top: 8, bottom: 8 }}>
        <CartesianGrid stroke="rgba(255,255,255,.06)" horizontal={false} />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
        <YAxis type="category" dataKey="label" tick={{ ...axis, fontSize: 9 }} width={145} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatNumber(value)} />
        <Bar dataKey="count" name="Harmonized event groups" radius={[0, 4, 4, 0]}>
          {data.map((entry) => <Cell key={entry.label} fill={entry.color} />)}
          <LabelList dataKey="count" position="right" formatter={(value: number) => formatNumber(value)} fill="#cbd4cc" fontSize={9} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DailyTotalChart({ data }: { data: Analytics["daily"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ left: -18, right: 4, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ea8059" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#ea8059" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
        <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} tickFormatter={(value: string) => value.slice(5)} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatNumber(value)} />
        <Area type="monotone" dataKey="total" stroke="#ea8059" strokeWidth={2} fill="url(#activityFill)" name="Detections" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
