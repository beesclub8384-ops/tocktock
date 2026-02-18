import type {
  IPrimitivePaneView,
  PrimitiveHoveredItem,
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
        }
      }
    });
  }

  updateAllViews(): void {
    const p1 = this.toCoord(this.data.p1.time, this.data.p1.price);
    const p2 = this.toCoord(this.data.p2.time, this.data.p2.price);
    this._coords = p1 && p2 ? { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y } : null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const c = this._coords;
    if (!c) return null;
    if (isHit(pointToSegmentDist(x, y, c.x1, c.y1, c.x2, c.y2))) {
      return { cursorStyle: "pointer", externalId: this.data.id, zOrder: "top" };
    }
    return null;
  }
}
