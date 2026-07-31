import Link from "next/link";
import DatePicker from "@/components/DatePicker";
import { RANGE_PRESETS, isActivePreset } from "@/lib/timerange";
import { toInputDate } from "@/lib/ui";

/** Preset + custom date-range selector shared by the timesheet views. */
export default function RangePicker({
  basePath,
  rangeKey,
  from,
  to,
  fromParam,
  toParam,
}: {
  basePath: string;
  rangeKey: string;
  from: Date;
  to: Date;
  fromParam?: string;
  toParam?: string;
}) {
  return (
    <div className="card flex flex-wrap items-center gap-2 p-3">
      {RANGE_PRESETS.map((p) => {
        const active = isActivePreset(p.key, rangeKey);
        return (
          <Link
            key={p.key}
            href={`${basePath}?range=${p.key}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-sky-600 text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {p.label}
          </Link>
        );
      })}
      <form action={basePath} method="GET" className="ml-auto flex flex-wrap items-end gap-2">
        <input type="hidden" name="range" value="custom" />
        <div>
          <label className="label !mb-0.5">From</label>
          <DatePicker name="from" defaultValue={fromParam ?? toInputDate(from)} className="!py-1.5" />
        </div>
        <div>
          <label className="label !mb-0.5">To</label>
          <DatePicker name="to" defaultValue={toParam ?? toInputDate(to)} className="!py-1.5" />
        </div>
        <button type="submit" className="btn-secondary !py-1.5 text-xs">
          Apply
        </button>
      </form>
    </div>
  );
}
