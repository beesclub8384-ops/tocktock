import type {
  IPrimitivePaneView,
  PrimitiveHoveredItem,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { TrendLineData } from "@/lib/types/drawing";
import { BaseDrawing } from "./base-drawing";
import { pointToSegmentDist, isHit } from "./hit-test";

interface Coords {
  x1: number; y1: number;
  x2: number; y2: number;
}

export class TrendLineDrawing extends BaseDrawing {
  public data: TrendLineData;
  private _coords: Coords | null = null;

  constructor(data: TrendLineData) {
    super();
    this.data = data;
    this._paneViews = [{ zOrder: () => "top" as const, renderer: () => this }];
  }

  draw(target: CanvasRenderingTarget2D): void {
    const c = this._coords;
    if (!c) return;
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.strokeStyle = this.data.color;
      ctx.lineWidth = this.data.lineWidth;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.lineTo(c.x2, c.y2);
      ctx.stroke();

      if (this.selected) {
        for (const pt of [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }]) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = this.data.color;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    });
  }

  updateAllViews(): void {
    const p1 = this.toCoord(this.data.p1.time, this.data.p1.price)
      ?? this.toCoordNearest(this.data.p1.time, this.data.p1.price);
    const p2 = this.toCoord(this.data.p2.time, this.data.p2.price)
      ?? this.toCoordNearest(this.data.p2.time, this.data.p2.price);
    this._coords = p1 && p2 ? { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y } : null;
  }

  /** timeToCoordinate()가 null일 때 가장 가까운 캔들의 x좌표 사용 */
  private toCoordNearest(time: Time, price: number): { x: number; y: number } | null {
    if (!this._chart || !this._series) return null;
    const y = this._series.priceToCoordinate(price);
    if (y === null) return null;

    const ts = this._chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return null;

    const targetMs = this.timeToMs(time);
    let bestX: number | null = null;
    let bestDist = Infinity;

    const start = Math.floor(range.from) - 10;
    const end = Math.ceil(range.to) + 10;

    for (let i = start; i <= end; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x = ts.logicalToCoordinate(i as any);
      if (x === null) continue;
      const t = ts.coordinateToTime(x);
      if (t === null) continue;

      const dist = Math.abs(this.timeToMs(t) - targetMs);
      if (dist < bestDist) {
        bestDist = dist;
        bestX = x;
      }
    }

    return bestX !== null ? { x: bestX, y } : null;
  }

  private timeToMs(time: Time): number {
    if (typeof time === "number") return time * 1000;
    if (typeof time === "string") return new Date(time).getTime();
    return new Date(time.year, time.month - 1, time.day).getTime();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  getAnchors(): { key: string; x: number; y: number }[] {
    if (!this._coords) return [];
    return [
      { key: "p1", x: this._coords.x1, y: this._coords.y1 },
      { key: "p2", x: this._coords.x2, y: this._coords.y2 },
    ];
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const c = this._coords;
    if (!c) return null;
    // 선택 상태: 앵커 우선 감지
    if (this.selected) {
      for (const pt of [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }]) {
        if (Math.hypot(x - pt.x, y - pt.y) <= 8) {
          return { cursorStyle: "grab", externalId: this.data.id, zOrder: "top" };
        }
      }
    }
    if (isHit(pointToSegmentDist(x, y, c.x1, c.y1, c.x2, c.y2))) {
      return { cursorStyle: this.selected ? "move" : "pointer", externalId: this.data.id, zOrder: "top" };
    }
    return null;
  }
}
