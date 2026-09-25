"use client";

import { useCallback, useEffect, useState } from "react";
import type { Callout } from "./content";

type Box = { x: number; y: number; w: number; h: number };
export type ShotData = { w: number; h: number; boxes: Record<string, Box> };

type Placed = Callout & { n: number; box: Box; badge: { x: number; y: number }; arrow: null | { x1: number; y1: number; x2: number; y2: number } };

const GAP = 7; // badge distance from the element, in % of the image width

/** Works out where each numbered badge sits and the arrow from it to its element. */
export function place(callouts: Callout[], shot: ShotData): Placed[] {
  const ar = shot.w / shot.h; // % units differ on x vs y; scale y gaps so they look even
  const out: Placed[] = [];
  let n = 0;
  for (const c of callouts) {
    const box = shot.boxes[c.spot];
    if (!box) continue;
    n++;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const room = { left: box.x, right: 100 - (box.x + box.w), top: box.y, bottom: 100 - (box.y + box.h) };
    const big = box.w > 45 || box.h > 45;
    let side = c.side ?? (big ? "inside" : (Object.entries(room).sort((a, b) => b[1] - a[1])[0][0] as Callout["side"]));
    if (side !== "inside" && room[side as keyof typeof room] < 4) side = "inside";

    let badge: { x: number; y: number };
    let target: { x: number; y: number } | null;
    const gy = GAP * ar;
    switch (side) {
      case "left":
        badge = { x: box.x - GAP, y: cy };
        target = { x: box.x, y: cy };
        break;
      case "right":
        badge = { x: box.x + box.w + GAP, y: cy };
        target = { x: box.x + box.w, y: cy };
        break;
      case "top":
        badge = { x: Math.min(cx, box.x + 12), y: box.y - gy };
        target = { x: Math.min(cx, box.x + 12), y: box.y };
        break;
      case "bottom":
        badge = { x: cx, y: box.y + box.h + gy };
        target = { x: cx, y: box.y + box.h };
        break;
      default:
        // Sit on the element's top-left corner so it covers as little as possible.
        badge = { x: box.x + 0.6, y: box.y + 0.6 * ar };
        target = null;
    }
    badge.x = Math.max(2.2, Math.min(97.8, badge.x));
    badge.y = Math.max(2.2 * ar, Math.min(100 - 2.2 * ar, badge.y));
    out.push({ ...c, n, box, badge, arrow: target ? { x1: badge.x, y1: badge.y, x2: target.x, y2: target.y } : null });
  }
  return out;
}

/**
 * Zoom + pan that centres a callout (element box and its badge) in the frame,
 * never showing past the image edges. Values are a scale and a translate in %
 * of the image, for `transform: scale(s) translate(tx%, ty%)` from the top-left.
 */
export function focusOn(p: Placed | undefined): { s: number; tx: number; ty: number } {
  if (!p) return { s: 1, tx: 0, ty: 0 };
  const x1 = Math.min(p.box.x, p.badge.x - 3);
  const x2 = Math.max(p.box.x + p.box.w, p.badge.x + 3);
  const y1 = Math.min(p.box.y, p.badge.y - 5);
  const y2 = Math.max(p.box.y + p.box.h, p.badge.y + 5);
  const s = Math.max(1, Math.min(2.2, 70 / Math.max(x2 - x1, 1), 70 / Math.max(y2 - y1, 1)));
  const clamp = (t: number) => Math.min(0, Math.max(100 / s - 100, t));
  return { s, tx: clamp(50 / s - (x1 + x2) / 2), ty: clamp(50 / s - (y1 + y2) / 2) };
}

function Figure({
  src,
  alt,
  shot,
  placed,
  active,
  onHover,
  onPick,
  zoomTo,
}: {
  src: string;
  alt: string;
  shot: ShotData;
  placed: Placed[];
  active: number | null;
  /** Hovering/focusing a badge (null when leaving). */
  onHover: (n: number | null) => void;
  /** Clicking a badge. */
  onPick: (n: number) => void;
  /** In step-by-step mode: the callout to zoom in on. */
  zoomTo?: Placed;
}) {
  // viewBox in "% of width" units horizontally and matching units vertically,
  // so arrows keep their true angle whatever size the image renders at.
  const vbH = (100 * shot.h) / shot.w;
  const ky = vbH / 100;
  const { s, tx, ty } = focusOn(zoomTo);
  return (
    <div className="relative overflow-hidden" style={{ aspectRatio: `${shot.w} / ${shot.h}` }}>
      <div
        className="absolute inset-0 origin-top-left transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `scale(${s}) translate(${tx}%, ${ty}%)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="block h-full w-full" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 100 ${vbH}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <marker id="guide-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-rose-500" />
            </marker>
          </defs>
          {placed.map((p) => {
            const on = active === null || active === p.n;
            return (
              <g key={p.n} style={{ opacity: on ? 1 : 0.15, transition: "opacity .2s" }}>
                <rect
                  x={p.box.x - 0.4}
                  y={p.box.y * ky - 0.4}
                  width={p.box.w + 0.8}
                  height={p.box.h * ky + 0.8}
                  rx={0.8}
                  className={active === p.n ? "fill-rose-500/10 stroke-rose-500" : "fill-transparent stroke-rose-500"}
                  strokeWidth={active === p.n ? 3 : 2}
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={active === p.n ? undefined : "6 4"}
                />
                {p.arrow && (
                  <line
                    x1={p.arrow.x1}
                    y1={p.arrow.y1 * ky}
                    x2={p.arrow.x2}
                    y2={p.arrow.y2 * ky}
                    className="stroke-rose-500"
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                    markerEnd="url(#guide-arrow)"
                  />
                )}
              </g>
            );
          })}
        </svg>
        {placed.map((p) => (
          <button
            key={p.n}
            type="button"
            onMouseEnter={() => onHover(p.n)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(p.n)}
            onBlur={() => onHover(null)}
            onClick={() => onPick(p.n)}
            aria-label={`Step ${p.n}: ${p.title}`}
            className={`absolute flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-lg ring-1 ring-white transition-[transform,opacity] sm:h-7 sm:w-7 sm:text-sm sm:ring-2 ${
              active === p.n ? "bg-rose-600" : "bg-rose-500"
            } ${active !== null && active !== p.n ? "opacity-40" : ""}`}
            // Counter-scale so badges stay the same size while zoomed in.
            style={{
              left: `${p.badge.x}%`,
              top: `${p.badge.y}%`,
              transform: `translate(-50%, -50%) scale(${(active === p.n ? 1.25 : 1) / s})`,
            }}
          >
            {p.n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AnnotatedShot({
  id,
  src,
  alt,
  shot,
  callouts,
  phone,
}: {
  id: string;
  src: string;
  alt: string;
  shot: ShotData;
  callouts: Callout[];
  phone?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  const [tour, setTour] = useState(false);
  const placed = place(callouts, shot);
  const total = placed.length;
  const step = tour && active ? placed[active - 1] : undefined;

  const go = useCallback(
    (n: number) => {
      if (n < 1 || n > total) return;
      setActive(n);
    },
    [total]
  );
  const startTour = () => {
    setTour(true);
    setActive(1);
  };
  const endTour = () => {
    setTour(false);
    setActive(null);
  };

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoom]);

  // Arrow keys step through while a tour is running.
  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA"].includes(t.tagName)) return;
      if (e.key === "ArrowRight") go((active ?? 0) + 1);
      else if (e.key === "ArrowLeft") go((active ?? 2) - 1);
      else if (e.key === "Escape") endTour();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, active, go]);

  const figure = (zoomTo?: Placed) => (
    <Figure
      src={src}
      alt={alt}
      shot={shot}
      placed={placed}
      active={active}
      // In a tour only clicks move between steps — the zoom slides badges under
      // a resting mouse, and hover-to-jump would skip steps.
      onHover={(n) => !tour && setActive(n)}
      onPick={(n) =>
        tour ? go(n) : document.getElementById(`${id}-step-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      zoomTo={zoomTo}
    />
  );

  return (
    <div className={phone ? "grid items-start gap-6 md:grid-cols-[300px_1fr]" : ""}>
      <div className={phone ? "mx-auto w-full max-w-[300px]" : ""}>
        <div
          className={`group relative overflow-hidden border border-slate-200 bg-white shadow-xl shadow-slate-300/30 ring-1 ring-slate-900/5 break-inside-avoid dark:border-slate-700 dark:shadow-none ${
            phone ? "rounded-[2rem] border-8 border-slate-800 dark:border-slate-600" : "rounded-xl"
          }`}
        >
          {figure(step)}
          <div className="absolute bottom-1.5 right-1.5 flex gap-1.5 print:hidden sm:bottom-2 sm:right-2">
            {!tour && total > 1 && (
              <button
                type="button"
                onClick={startTour}
                aria-label="Step by step"
                title="Walk me through it, one step at a time"
                className="rounded-md bg-sky-600/90 px-1.5 py-0.5 text-xs font-semibold text-white shadow backdrop-blur transition hover:bg-sky-700 sm:px-2 sm:py-1"
              >
                ▶<span className="hidden sm:inline"> Step by step</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setZoom(true)}
              aria-label="Enlarge screenshot"
              className="rounded-md bg-slate-900/75 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur transition hover:bg-slate-900 sm:px-2 sm:py-1 sm:opacity-0 sm:group-hover:opacity-100"
            >
              ⤢<span className="hidden sm:inline"> Enlarge</span>
            </button>
          </div>
        </div>

        {tour && step && (
          <div
            className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40 sm:p-4"
            role="region"
            aria-live="polite"
            aria-label="Step by step"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white">
                {step.n}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-sky-700 dark:text-sky-300">
                  Step {step.n} of {total}
                </div>
                <div className="font-semibold">{step.title}</div>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{step.body}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex gap-1" aria-hidden>
                {placed.map((p) => (
                  <span key={p.n} className={`h-1.5 w-5 rounded-full ${p.n <= step.n ? "bg-sky-500" : "bg-sky-200 dark:bg-sky-900"}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={endTour} className="btn-secondary !px-3 !py-1 text-xs">
                  Exit
                </button>
                <button
                  type="button"
                  onClick={() => go(step.n - 1)}
                  disabled={step.n === 1}
                  className="btn-secondary !px-3 !py-1 text-xs disabled:opacity-40"
                >
                  ← Back
                </button>
                {step.n < total ? (
                  <button type="button" onClick={() => go(step.n + 1)} className="btn-primary !px-3 !py-1 text-xs">
                    Next →
                  </button>
                ) : (
                  <button type="button" onClick={endTour} className="btn-primary !px-3 !py-1 text-xs">
                    ✓ Done
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 hidden text-[11px] text-slate-400 sm:block">Tip: use the ← → arrow keys.</p>
          </div>
        )}
      </div>

      <ol className={`grid gap-2 ${phone ? "" : "mt-5 sm:grid-cols-2"} ${tour ? "hidden sm:grid" : ""}`}>
        {placed.map((p) => (
          <li
            key={p.n}
            id={`${id}-step-${p.n}`}
            onMouseEnter={() => !tour && setActive(p.n)}
            onMouseLeave={() => !tour && setActive(null)}
            onClick={() => tour && go(p.n)}
            className={`flex gap-3 rounded-lg border p-3 ${tour ? "cursor-pointer" : "cursor-default"} transition-colors break-inside-avoid ${
              active === p.n
                ? "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40"
                : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
            }`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
              {p.n}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{p.title}</div>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{p.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-8"
          onClick={() => setZoom(false)}
        >
          <div
            className={`relative w-full overflow-hidden rounded-xl bg-white shadow-2xl ${phone ? "max-w-sm" : "max-w-7xl"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {figure()}
          </div>
          <button
            type="button"
            onClick={() => setZoom(false)}
            className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-slate-800 hover:bg-white"
          >
            ✕ Close
          </button>
        </div>
      )}
    </div>
  );
}
