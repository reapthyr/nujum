"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import type { AuditView } from "../lib/data";

/** Last 14 days of recorded changes, bucketed by UTC day. */
export function AuditActivityChart({ entries }: { entries: AuditView[] }) {
  const data = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(today.getTime() - (13 - index) * 86_400_000);
      return { day: date.toISOString().slice(5, 10), count: 0 };
    });
    const index = new Map(days.map((entry) => [entry.day, entry]));
    for (const entry of entries) {
      const bucket = index.get(entry.createdAt.slice(0, 10));
      if (bucket) bucket.count += 1;
    }
    return days;
  }, [entries]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change activity</CardTitle>
        <CardDescription>Audit entries recorded over the last 14 days.</CardDescription>
      </CardHeader>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid stroke="#26304a" vertical={false} />
            <XAxis dataKey="day" stroke="#9aa6c4" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#9aa6c4"
              fontSize={10}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#0f1424",
                border: "1px solid #26304a",
                borderRadius: 12,
                color: "#f4f6ff",
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
