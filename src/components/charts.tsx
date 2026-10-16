"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
} from "recharts";
import { PLATFORMS, PLATFORM_LABELS, PLATFORM_COLORS, type Platform } from "@/lib/constants";
import { PlatformIcon } from "@/components/platform-icon";
import { formatRM } from "@/lib/format";

// ── Palet Porsche: platinum + Guards Red ──
const PLATINUM = "#cbd5e1";
const GUARDS = "#e2525d";
const GRID = "rgba(148, 163, 184, 0.12)";
const AXIS = "#94a3b8";

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid rgba(226, 82, 93, 0.35)",
  background: "rgba(13, 17, 32, 0.96)",
  boxShadow: "0 16px 40px -14px rgba(0,0,0,0.7), 0 0 20px -8px rgba(226,82,93,0.4)",
  fontSize: 12,
  padding: "8px 12px",
  color: "#e8edf6",
};
const tooltipLabel = { color: "#94a3b8", fontWeight: 600 };

function ChartLegend({ payload }: { payload?: { dataKey?: string | number }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
      {payload?.map((e) => {
        const p = String(e.dataKey) as Platform;
        return (
          <span key={p} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
            <PlatformIcon platform={p} size={16} />
            {PLATFORM_LABELS[p] ?? p}
          </span>
        );
      })}
    </div>
  );
}

export function RevenueTrendChart({
  data,
}: {
  data: { date: string; tiktok: number; shopee: number; woocommerce: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          {PLATFORMS.map((p) => (
            <linearGradient key={p} id={`area-${p}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.5} />
              <stop offset="100%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.03} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: AXIS }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} width={70} tickFormatter={(v) => `RM${v}`} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabel}
          formatter={(value: number, name: string) => [formatRM(value), PLATFORM_LABELS[name as Platform] ?? name]}
        />
        <Legend content={(props) => <ChartLegend payload={props.payload as { dataKey?: string | number }[]} />} />
        {(["tiktok", "shopee", "woocommerce"] as Platform[]).map((p) => (
          <Area key={p} type="monotone" dataKey={p} stackId="1" stroke={PLATFORM_COLORS[p]} strokeWidth={2.4} fill={`url(#area-${p})`} fillOpacity={1} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RevenueProfitChart({
  data,
}: {
  data: { date: string; revenue: number; profit: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PLATINUM} stopOpacity={0.28} />
            <stop offset="100%" stopColor={PLATINUM} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="prof-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GUARDS} stopOpacity={0.42} />
            <stop offset="100%" stopColor={GUARDS} stopOpacity={0.02} />
          </linearGradient>
          <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={GUARDS} floodOpacity="0.55" />
          </filter>
          <filter id="glow-plat" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={PLATINUM} floodOpacity="0.4" />
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: AXIS }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} width={70} tickFormatter={(v) => `RM${v}`} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabel}
          formatter={(value: number, name: string) => [formatRM(value), name === "revenue" ? "Revenue" : "Untung"]}
        />
        <Legend formatter={(v) => (v === "revenue" ? "Revenue" : "Untung bersih")} iconType="circle" wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
        <Area type="monotone" dataKey="revenue" stroke={PLATINUM} strokeWidth={2.6} fill="url(#rev-grad)" fillOpacity={1} style={{ filter: "url(#glow-plat)" }} activeDot={{ r: 4, fill: PLATINUM, stroke: "#0b0f1e", strokeWidth: 2 }} />
        <Area type="monotone" dataKey="profit" stroke={GUARDS} strokeWidth={2.8} fill="url(#prof-grad)" fillOpacity={1} style={{ filter: "url(#glow-red)" }} activeDot={{ r: 5, fill: GUARDS, stroke: "#0b0f1e", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PlatformRevenueChart({
  data,
}: {
  data: { platform: Platform; revenue: number; orders: number }[];
}) {
  const chartData = data.map((d) => ({
    name: PLATFORM_LABELS[d.platform],
    revenue: d.revenue,
    platform: d.platform,
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          {PLATFORMS.map((p) => (
            <linearGradient key={p} id={`bar-${p}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PLATFORM_COLORS[p]} stopOpacity={1} />
              <stop offset="100%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.5} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: AXIS }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} width={70} tickFormatter={(v) => `RM${v}`} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} cursor={{ fill: "rgba(226,82,93,0.06)" }} formatter={(value: number) => [formatRM(value), "Revenue"]} />
        <Bar dataKey="revenue" radius={[8, 8, 0, 0]} maxBarSize={90}>
          {chartData.map((d) => (
            <Cell key={d.platform} fill={`url(#bar-${d.platform})`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
