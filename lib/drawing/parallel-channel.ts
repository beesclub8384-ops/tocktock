import type {
  IPrimitivePaneView,
  PrimitiveHoveredItem,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { ParallelChannelData } from "@/lib/types/drawing";
import { BaseDrawing } from "./base-drawing";
import { pointToSegmentDist, isHit } from "./hit-test";

interface Coords {
  x1: number; y1: number;
  x2: number; y2: number;
  x3: number; y3: number; // p1 + offset
  x4: number; y4: number; // p2 + offset
}

export class ParallelChannelDrawing extends BaseDrawing {
  public data: ParallelChannelData;
  private _coords: Coords | null = null;

  constructor(data: ParallelChannelData) {
    super();
    this.data = data;
    this._paneViews = [{ zOrder: () => "top" as const, renderer: () => this }];
  }

  draw(target: CanvasRenderingTarget2D): void {
    const c = this._coords;
    if (!c) return;
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;

      // 채우기
      ctx.fillStyle = this.data.color.replace(")", ", 0.1)").replace("rgb", "rgba");
      if (this.data.color.startsWith("#")) {
        const r = parseInt(this.data.color.slice(1, 3), 16);
        const g = parseInt(this.data.color.slice(3, 5), 16);
        const b = parseInt(this.data.color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r},${g},${b},0.1)`;
      }
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.lineTo(c.x2, c.y2);
      ctx.lineTo(c.x4, c.y4);
      ctx.lineTo(c.x3, c.y3);
      ctx.closePath();
      ctx.fill();

      // 메인 라인 (실선)
      ctx.strokeStyle = this.data.color;
      ctx.lineWidth = this.data.lineWidth;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.lineTo(c.x2, c.y2);
      ctx.stroke();

      // 평행선 (점선)
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(c.x3, c.y3);
      ctx.lineTo(c.x4, c.y4);
      ctx.stroke();
      ctx.setLineDash([]);

      if (this.selected) {
        for (const pt of [
          { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 },
          { x: c.x3, y: c.y3 }, { x: c.x4, y: c.y4 },
        ]) {
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
    const p3 = this.toCoord(this.data.p1.time, this.data.p1.price + this.data.channelOffset);
    const p4 = this.toCoord(this.data.p2.time, this.data.p2.price + this.data.channelOffset);
    this._coords = p1 && p2 && p3 && p4
      ? { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x3: p3.x, y3: p3.y, x4: p4.x, y4: p4.y }
      : null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const c = this._coords;
    if (!c) return null;
    const d1 = pointToSegmentDist(x, y, c.x1, c.y1, c.x2, c.y2);
    const d2 = pointToSegmentDist(x, y, c.x3, c.y3, c.x4, c.y4);
    if (isHit(Math.min(d1, d2))) {
      return { cursorStyle: "pointer", externalId: this.data.id, zOrder: "top" };
    }
    return null;
  }
}
