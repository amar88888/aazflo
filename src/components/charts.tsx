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

function ChartLegend({ payload }: { payload?: { dataKey?: string | number }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-4">
      {payload?.map((e) => {
        const p = String(e.dataKey) as Platform;
        return (
          <span key={p} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <PlatformIcon platform={p} size={16} />
            {PLATFORM_LABELS[p] ?? p}
          </span>
        );
      })}
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  boxShadow: "0 12px 32px -12px rgba(79,70,229,0.25)",
  fontSize: 12,
  padding: "8px 12px",
};

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
        <CartesianGrid strokeDasharray="3 3" stroke="#e9e9f4" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={70} tickFormatter={(v) => `RM${v}`} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => [formatRM(value), PLATFORM_LABELS[name as Platform] ?? name]}
        />
        <Legend content={(props) => <ChartLegend payload={props.payload as { dataKey?: string | number }[]} />} />
        {(["tiktok", "shopee", "woocommerce"] as Platform[]).map((p) => (
          <Area
            key={p}
            type="monotone"
            dataKey={p}
            stackId="1"
            stroke={PLATFORM_COLORS[p]}
            strokeWidth={2.4}
            fill={`url(#area-${p})`}
            fillOpacity={1}
          />
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
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="prof-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e9e9f4" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={70} tickFormatter={(v) => `RM${v}`} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => [formatRM(value), name === "revenue" ? "Revenue" : "Untung"]}
        />
        <Legend formatter={(v) => (v === "revenue" ? "Revenue" : "Untung bersih")} iconType="circle" />
        <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2.4} fill="url(#rev-grad)" fillOpacity={1} />
        <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2.4} fill="url(#prof-grad)" fillOpacity={1} />
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
              <stop offset="100%" stopColor={PLATFORM_COLORS[p]} stopOpacity={0.55} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e9e9f4" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={70} tickFormatter={(v) => `RM${v}`} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(99,102,241,0.05)" }} formatter={(value: number) => [formatRM(value), "Revenue"]} />
        <Bar dataKey="revenue" radius={[8, 8, 0, 0]} maxBarSize={90}>
          {chartData.map((d) => (
            <Cell key={d.platform} fill={`url(#bar-${d.platform})`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
