"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const VIX_MAX = 50;
const REFRESH_MS = 60_000;

// SVG gauge geometry
const CX = 100;
const CY = 100;
const R = 80;
const SW = 14;
const NEEDLE_R = R - SW / 2 - 4;

const SEGMENTS = [
  { min: 0, max: 15, color: "#22c55e", label: "안정" },
  { min: 15, max: 25, color: "#eab308", label: "경계" },
  { min: 25, max: 35, color: "#f97316", label: "공포" },
  { min: 35, max: VIX_MAX, color: "#ef4444", label: "극도의 공포" },
];

function vixToAngle(v: number) {
  return 180 - (Math.max(0, Math.min(VIX_MAX, v)) / VIX_MAX) * 180;
}

function polar(deg: number, r: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

function arcD(fromAngle: number, toAngle: number) {
  const s = polar(fromAngle, R);
  const e = polar(toAngle, R);
  const large = fromAngle - toAngle > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
}

function statusOf(vix: number) {
  if (vix < 15) return { text: "안정", cls: "text-green-500" };
  if (vix < 25) return { text: "경계", cls: "text-yellow-500" };
  if (vix < 35) return { text: "공포", cls: "text-orange-500" };
  return { text: "극도의 공포", cls: "text-red-500" };
}

export function VixGaugeWidget() {
  const [vix, setVix] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchVix() {
      try {
        const res = await fetch("/api/stock/%5EVIX/quote");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.price != null) setVix(data.price);
      } catch {
        /* keep existing data */
      }
    }

    fetchVix();
    const id = setInterval(fetchVix, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const angle = vix != null ? vixToAngle(vix) : 90;
  const status = vix != null ? statusOf(vix) : null;

  return (
    <Link
      href="/stock/%5EVIX"
      className="block rounded-xl border border-border bg-card p-6 transition-colors hover:bg-accent/30"
    >
      <h2 className="mb-2 text-center text-lg font-semibold">
        공포지수 (VIX)
      </h2>

      <svg viewBox="0 0 200 110" className="mx-auto w-full max-w-[280px]">
        {/* Colored arc segments */}
        {SEGMENTS.map((seg) => (
          <path
            key={seg.min}
            d={arcD(vixToAngle(seg.min), vixToAngle(seg.max))}
            stroke={seg.color}
            strokeWidth={SW}
            fill="none"
          />
        ))}

        {/* Needle — drawn pointing right then rotated */}
        <g transform={`rotate(${-angle} ${CX} ${CY})`}>
          <polygon
            points={`${CX + 6},${CY - 3} ${CX + NEEDLE_R},${CY} ${CX + 6},${CY + 3}`}
            className="fill-foreground"
          />
        </g>
        <circle cx={CX} cy={CY} r={5} className="fill-foreground" />

        {/* Scale labels at endpoints */}
        <text
          x={CX - R - SW / 2 - 2}
          y={CY + 4}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize={9}
        >
          0
        </text>
        <text
          x={CX + R + SW / 2 + 2}
          y={CY + 4}
          textAnchor="start"
          className="fill-muted-foreground"
          fontSize={9}
        >
          50
        </text>
      </svg>

      {/* Value + status */}
      <div className="-mt-1 text-center">
        {vix != null ? (
          <>
            <p className="text-3xl font-extrabold tabular-nums">
              {vix.toFixed(2)}
            </p>
            <p className={`text-sm font-medium ${status!.cls}`}>
              {status!.text}
            </p>
          </>
        ) : (
          <p className="text-lg text-muted-foreground">—</p>
        )}
      </div>

      {/* Zone legend */}
      <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {SEGMENTS.map((seg) => (
          <span key={seg.min} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            {seg.label}
          </span>
        ))}
      </div>
    </Link>
  );
}
