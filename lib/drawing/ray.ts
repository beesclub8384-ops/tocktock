import type {
  IPrimitivePaneView,
  PrimitiveHoveredItem,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { RayData } from "@/lib/types/drawing";
import { BaseDrawing } from "./base-drawing";
import { pointToRayDist, isHit } from "./hit-test";

interface Coords {
  x1: number; y1: number;
  x2: number; y2: number;
}

export class RayDrawing extends BaseDrawing {
  public data: RayData;
  private _coords: Coords | null = null;

  constructor(data: RayData) {
    super();
    this.data = data;
    this._paneViews = [{ zOrder: () => "top" as const, renderer: () => this }];
  }

  draw(target: CanvasRenderingTarget2D): void {
    const c = this._coords;
    if (!c) return;
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const w = scope.mediaSize.width;
      const h = scope.mediaSize.height;

      // p1 → p2 방향으로 캔버스 끝까지 연장
      const dx = c.x2 - c.x1;
      const dy = c.y2 - c.y1;
      let endX = c.x2;
      let endY = c.y2;

      if (dx !== 0 || dy !== 0) {
        const tValues: number[] = [];
        if (dx > 0) tValues.push((w - c.x1) / dx);
        if (dx < 0) tValues.push(-c.x1 / dx);
        if (dy > 0) tValues.push((h - c.y1) / dy);
        if (dy < 0) tValues.push(-c.y1 / dy);
        const tMax = Math.max(...tValues.filter((t) => t > 0), 1);
        endX = c.x1 + dx * tMax;
        endY = c.y1 + dy * tMax;
      }

      ctx.strokeStyle = this.data.color;
      ctx.lineWidth = this.data.lineWidth;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.lineTo(endX, endY);
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
    const p1 = this.toCoord(this.data.p1.time, this.data.p1.price);
    const p2 = this.toCoord(this.data.p2.time, this.data.p2.price);
    this._coords = p1 && p2 ? { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y } : null;
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
    if (this.selected) {
      for (const pt of [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }]) {
        if (Math.hypot(x - pt.x, y - pt.y) <= 8) {
          return { cursorStyle: "grab", externalId: this.data.id, zOrder: "top" };
        }
      }
    }
    if (isHit(pointToRayDist(x, y, c.x1, c.y1, c.x2, c.y2))) {
      return { cursorStyle: this.selected ? "move" : "pointer", externalId: this.data.id, zOrder: "top" };
    }
    return null;
  }
}
