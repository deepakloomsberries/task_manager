"use client";

import { useEffect, useState } from "react";
import { OFFICES } from "@/lib/tz";

/** Shows the current local time in each office, with an open/closed dot. */
export default function OfficeClocks({ myCode }: { myCode?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold">Office hours</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {OFFICES.map((o) => {
          const time = now
            ? new Intl.DateTimeFormat("en-GB", { timeZone: o.tz, hour: "2-digit", minute: "2-digit", hour12: true }).format(now)
            : "—";
          const hour = now
            ? Number(new Intl.DateTimeFormat("en-US", { timeZone: o.tz, hour: "2-digit", hourCycle: "h23" }).format(now))
            : -1;
          const open = hour >= 9 && hour < 18;
          return (
            <div key={o.code} className="flex items-center justify-between px-5 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <b>{o.code}</b>
                <span className="text-slate-400">{o.label}</span>
                {o.code === myCode && (
                  <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">you</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <span
                  title={open ? "Working hours" : "Outside working hours"}
                  className={`h-2 w-2 rounded-full ${open ? "bg-green-500" : "bg-slate-300"}`}
                />
                <span className="tabular-nums text-sm text-slate-600">{time}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
