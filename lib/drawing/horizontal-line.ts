import type {
  IPrimitivePaneView,
  PrimitiveHoveredItem,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type { HorizontalLineData } from "@/lib/types/drawing";
import { BaseDrawing } from "./base-drawing";
import { isHit } from "./hit-test";

export class HorizontalLineDrawing extends BaseDrawing {
  public data: HorizontalLineData;
  private _y: number | null = null;

  constructor(data: HorizontalLineData) {
    super();
    this.data = data;
    this._paneViews = [{ zOrder: () => "top" as const, renderer: () => this }];
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._y === null) return;
    const y = this._y;
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const w = scope.mediaSize.width;
      ctx.strokeStyle = this.data.color;
      ctx.lineWidth = this.data.lineWidth;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 가격 라벨
      const label = this.data.price.toFixed(2);
      ctx.font = "11px monospace";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = this.data.color;
      ctx.fillRect(w - tw - 10, y - 9, tw + 8, 18);
      ctx.fillStyle = "#0a0a0a";
      ctx.fillText(label, w - tw - 6, y + 4);

      if (this.selected) {
        ctx.beginPath();
        ctx.arc(40, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = this.data.color;
        ctx.fill();
      }
    });
  }

  updateAllViews(): void {
    this._y = this._series?.priceToCoordinate(this.data.price) ?? null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (this._y !== null && isHit(Math.abs(y - this._y))) {
      return { cursorStyle: "pointer", externalId: this.data.id, zOrder: "top" };
    }
    return null;
  }
}
