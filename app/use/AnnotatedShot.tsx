"use client";

import { useEffect, useState } from "react";
import type { Callout } from "./content";

type Box = { x: number; y: number; w: number; h: number };
export type ShotData = { w: number; h: number; boxes: Record<string, Box> };

type Placed = Callout & { n: number; box: Box; badge: { x: number; y: number }; arrow: null | { x1: number; y1: number; x2: number; y2: number } };

const GAP = 7; // badge distance from the element, in % of the image width

/** Works out where each numbered badge sits and the arrow from it to its element. */
function place(callouts: Callout[], shot: ShotData): Placed[] {
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

function Figure({
  src,
  alt,
  shot,
  placed,
  active,
  setActive,
  phone,
}: {
  src: string;
  alt: string;
  shot: ShotData;
  placed: Placed[];
  active: number | null;
  setActive: (n: number | null) => void;
  phone?: boolean;
}) {
  // viewBox in "% of width" units horizontally and matching units vertically,
  // so arrows keep their true angle whatever size the image renders at.
  const vbH = (100 * shot.h) / shot.w;
  const ky = vbH / 100;
  return (
    <div className="relative" style={{ aspectRatio: `${shot.w} / ${shot.h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className={`block h-full w-full ${phone ? "" : ""}`} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 100 ${vbH}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <marker id="guide-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-rose-500" />
          </marker>
        </defs>
        {placed.map((p) => {
          const on = active === null || active === p.n;
          return (
            <g key={p.n} style={{ opacity: on ? 1 : 0.18, transition: "opacity .2s" }}>
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
          onMouseEnter={() => setActive(p.n)}
          onMouseLeave={() => setActive(null)}
          onFocus={() => setActive(p.n)}
          onBlur={() => setActive(null)}
          onClick={() => document.getElementById(`${alt}-step-${p.n}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          aria-label={`Step ${p.n}: ${p.title}`}
          className={`absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-lg ring-1 ring-white transition-transform sm:h-7 sm:w-7 sm:text-sm sm:ring-2 ${
            active === p.n ? "scale-125 bg-rose-600" : "bg-rose-500"
          } ${active !== null && active !== p.n ? "opacity-40" : ""}`}
          style={{ left: `${p.badge.x}%`, top: `${p.badge.y}%` }}
        >
          {p.n}
        </button>
      ))}
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
  const placed = place(callouts, shot);

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

  const figure = (
    <Figure src={src} alt={id} shot={shot} placed={placed} active={active} setActive={setActive} phone={phone} />
  );

  return (
    <div className={phone ? "grid items-start gap-6 md:grid-cols-[300px_1fr]" : ""}>
      <div
        className={`group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-300/30 ring-1 ring-slate-900/5 dark:border-slate-700 dark:shadow-none ${
          phone ? "mx-auto w-full max-w-[300px] rounded-[2rem] border-8 border-slate-800 dark:border-slate-600" : ""
        }`}
      >
        {figure}
        <span className="sr-only">{alt}</span>
        <button
          type="button"
          onClick={() => setZoom(true)}
          aria-label="Enlarge screenshot"
          className="absolute bottom-1.5 right-1.5 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur transition hover:bg-slate-900 sm:bottom-2 sm:right-2 sm:px-2 sm:py-1 sm:opacity-0 sm:group-hover:opacity-100"
        >
          ⤢<span className="hidden sm:inline"> Enlarge</span>
        </button>
      </div>

      <ol className={`grid gap-2 ${phone ? "" : "mt-5 sm:grid-cols-2"}`}>
        {placed.map((p) => (
          <li
            key={p.n}
            id={`${id}-step-${p.n}`}
            onMouseEnter={() => setActive(p.n)}
            onMouseLeave={() => setActive(null)}
            className={`flex cursor-default gap-3 rounded-lg border p-3 transition-colors ${
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
            {figure}
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
