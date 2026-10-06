import SearchSelect from "@/components/SearchSelect";
import { MAX_RESPONSIBILITIES } from "@/lib/responsibilities";

/** Admin form fields: "Reports to" and the responsibilities list (one per line). */
export default function ResponsibilityFields({
  people,
  selfId,
  reportsToId,
  responsibilities,
  className = "",
}: {
  people: { id: number; name: string; jobTitle?: string | null }[];
  selfId?: number;
  reportsToId?: number | null;
  responsibilities?: string | null;
  className?: string;
}) {
  return (
    <>
      <div className={className}>
        <label className="label">Reports to</label>
        <SearchSelect
          name="reportsToId"
          defaultValue={reportsToId ? String(reportsToId) : ""}
          placeholder="— Nobody —"
          searchPlaceholder="Search people…"
          options={[
            { value: "", label: "— Nobody —" },
            ...people.filter((p) => p.id !== selfId).map((p) => ({ value: String(p.id), label: p.name, hint: p.jobTitle ?? undefined })),
          ]}
        />
      </div>
      <div className="col-span-full">
        <label className="label">Responsibilities</label>
        <textarea
          name="responsibilities"
          defaultValue={responsibilities ?? ""}
          rows={4}
          className="input"
          placeholder={"One per line, e.g.\nAmazon & FBA listings\nDaily stock sync with Unicommerce\nWeekly sales report"}
        />
        <p className="mt-1 text-xs text-slate-500">
          One per line, up to {MAX_RESPONSIBILITIES}. Shown on their Settings page and profile — they get a notification when it changes.
        </p>
      </div>
    </>
  );
}
