import { PROJECT_COLORS } from "@/lib/projectHealth";

/** Radio swatches submitting `color`. */
export default function ColorPicker({ defaultValue = "sky" }: { defaultValue?: string | null }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {Object.entries(PROJECT_COLORS).map(([k, c]) => (
        <label key={k} className="cursor-pointer" title={c.label}>
          <input type="radio" name="color" value={k} defaultChecked={(defaultValue ?? "sky") === k} className="peer sr-only" />
          <span className={`block h-7 w-7 rounded-full ${c.dot} ring-offset-2 peer-checked:ring-2 peer-checked:ring-slate-700 peer-focus-visible:ring-2 dark:ring-offset-slate-900 dark:peer-checked:ring-slate-200`} />
        </label>
      ))}
    </div>
  );
}
