"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type TrendPoint = { month: string; count: number };

type Props = {
  data: TrendPoint[];
};

export default function RegistrationTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-48 text-sm"
        style={{ color: "var(--admin-text-faint)" }}
      >
        No registration data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="regGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#8E2A23" stopOpacity={0.12} />
            <stop offset="95%" stopColor="#8E2A23" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "#9E9890", fontFamily: "var(--font-sans)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#9E9890", fontFamily: "var(--font-sans)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "0.5px solid #DDD9D2",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            fontSize: 12,
            fontFamily: "var(--font-sans)",
            background: "#FFFFFF",
            color: "#201D18",
          }}
          formatter={(value) => [value, "Registrations"]}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#8E2A23"
          strokeWidth={2}
          fill="url(#regGradient)"
          dot={{ r: 3, fill: "#8E2A23", stroke: "#fff", strokeWidth: 2 }}
          activeDot={{ r: 5, fill: "#8E2A23", stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
