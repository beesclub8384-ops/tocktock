import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
  MouseEventParams,
} from "lightweight-charts";
import type {
  DrawingToolType,
  DrawingData,
  DrawingPhase,
  DrawingAnchor,
} from "@/lib/types/drawing";
import { BaseDrawing } from "./base-drawing";
import { TrendLineDrawing } from "./trend-line";
import { HorizontalLineDrawing } from "./horizontal-line";
import { RayDrawing } from "./ray";
import { ParallelChannelDrawing } from "./parallel-channel";

interface ManagerCallbacks {
  onSelectionChange: (id: string | null) => void;
  onContextMenu: (x: number, y: number, id: string) => void;
}

export class DrawingManager {
  private chart: IChartApi;
  private series: ISeriesApi<SeriesType>;
  private symbol: string;
  private drawings = new Map<string, BaseDrawing>();
  private selectedId: string | null = null;
  private activeTool: DrawingToolType = null;
  private phase: DrawingPhase = "idle";
  private pendingAnchor: DrawingAnchor | null = null;
  private pendingP1P2: { p1: DrawingAnchor; p2: DrawingAnchor } | null = null;
  private callbacks: ManagerCallbacks;
  private isDragging = false;
  private dragStartCoord: { x: number; y: number } | null = null;
  private dragStartAnchors: DrawingData | null = null;
  private lastHoveredId: string | null = null;
  private containerEl: HTMLElement | null = null;

  private clickHandler: (p: MouseEventParams<Time>) => void;
  private crosshairHandler: (p: MouseEventParams<Time>) => void;
  private mouseDownHandler: (e: MouseEvent) => void;
  private mouseMoveHandler: (e: MouseEvent) => void;
  private mouseUpHandler: (e: MouseEvent) => void;
  private contextMenuHandler: (e: MouseEvent) => void;

  constructor(params: {
    chart: IChartApi;
    series: ISeriesApi<SeriesType>;
    symbol: string;
    containerEl: HTMLElement;
    callbacks: ManagerCallbacks;
  }) {
    this.chart = params.chart;
    this.series = params.series;
    this.symbol = params.symbol;
    this.containerEl = params.containerEl;
    this.callbacks = params.callbacks;

    this.clickHandler = this.handleClick.bind(this);
    this.crosshairHandler = this.handleCrosshair.bind(this);
    this.mouseDownHandler = this.onMouseDown.bind(this);
    this.mouseMoveHandler = this.onMouseMove.bind(this);
    this.mouseUpHandler = this.onMouseUp.bind(this);
    this.contextMenuHandler = this.onContextMenu.bind(this);

    this.chart.subscribeClick(this.clickHandler);
    this.chart.subscribeCrosshairMove(this.crosshairHandler);
    this.containerEl.addEventListener("mousedown", this.mouseDownHandler);
    this.containerEl.addEventListener("contextmenu", this.contextMenuHandler);

    this.loadFromStorage();
  }

  setActiveTool(tool: DrawingToolType): void {
    this.activeTool = tool;
    this.phase = tool ? "placing_p1" : "idle";
    this.pendingAnchor = null;
    this.pendingP1P2 = null;
    if (!tool) this.selectDrawing(null);
  }

  reattachAll(newSeries: ISeriesApi<SeriesType>): void {
    this.series = newSeries;
    for (const drawing of this.drawings.values()) {
      newSeries.attachPrimitive(drawing);
    }
  }

  private handleClick(param: MouseEventParams<Time>): void {
    if (this.isDragging) return;
    if (!param.point || !param.time) return;

    const price = this.series.coordinateToPrice(param.point.y);
    if (price === null) return;
    const anchor: DrawingAnchor = { time: param.time, price };

    // 포인터 모드: 선택/해제
    if (!this.activeTool) {
      const hoveredId = param.hoveredObjectId as string | undefined;
      if (hoveredId && this.drawings.has(hoveredId)) {
        this.selectDrawing(hoveredId);
      } else {
        this.selectDrawing(null);
      }
      return;
    }

    // 수평선: 1클릭 완료
    if (this.activeTool === "horizontal_line") {
      this.createDrawing({
        id: crypto.randomUUID(),
        type: "horizontal_line",
        color: "#3b82f6",
        lineWidth: 1,
        price: anchor.price,
      });
      this.setActiveTool(null);
      return;
    }

    // 2점 도구: 첫 번째 점
    if (this.phase === "placing_p1") {
      this.pendingAnchor = anchor;
      this.phase = "placing_p2";
      return;
    }

    // 2점 도구: 두 번째 점
    if (this.phase === "placing_p2" && this.pendingAnchor) {
      if (this.activeTool === "trendline") {
        this.createDrawing({
          id: crypto.randomUUID(),
          type: "trendline",
          color: "#3b82f6",
          lineWidth: 1,
          p1: this.pendingAnchor,
          p2: anchor,
        });
        this.setActiveTool(null);
      } else if (this.activeTool === "ray") {
        this.createDrawing({
          id: crypto.randomUUID(),
          type: "ray",
          color: "#f59e0b",
          lineWidth: 1,
          p1: this.pendingAnchor,
          p2: anchor,
        });
        this.setActiveTool(null);
      } else if (this.activeTool === "parallel_channel") {
        this.pendingP1P2 = { p1: this.pendingAnchor, p2: anchor };
        this.phase = "placing_channel";
      }
      return;
    }

    // 평행 채널: 세 번째 클릭 (오프셋 확정)
    if (this.phase === "placing_channel" && this.pendingP1P2) {
      const offset = anchor.price - this.pendingP1P2.p1.price;
      this.createDrawing({
        id: crypto.randomUUID(),
        type: "parallel_channel",
        color: "#a855f7",
        lineWidth: 1,
        p1: this.pendingP1P2.p1,
        p2: this.pendingP1P2.p2,
        channelOffset: offset,
      });
      this.setActiveTool(null);
    }
  }

  private handleCrosshair(param: MouseEventParams<Time>): void {
    const hoveredId = param.hoveredObjectId as string | undefined;
    if (hoveredId && this.drawings.has(hoveredId)) {
      this.lastHoveredId = hoveredId;
    } else {
      this.lastHoveredId = null;
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    if (!this.selectedId || this.activeTool) return;

    const drawing = this.drawings.get(this.selectedId);
    if (!drawing || this.lastHoveredId !== this.selectedId) return;

    this.isDragging = true;
    this.dragStartCoord = { x: e.clientX, y: e.clientY };
    this.dragStartAnchors = JSON.parse(JSON.stringify(drawing.data));

    document.addEventListener("mousemove", this.mouseMoveHandler);
    document.addEventListener("mouseup", this.mouseUpHandler);

    this.chart.applyOptions({
      handleScroll: false,
      handleScale: false,
    });
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging || !this.dragStartCoord || !this.dragStartAnchors || !this.selectedId) return;

    const drawing = this.drawings.get(this.selectedId);
    if (!drawing) return;

    const rect = this.containerEl!.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;
    const startX = this.dragStartCoord.x - rect.left;
    const startY = this.dragStartCoord.y - rect.top;

    const curTime = this.chart.timeScale().coordinateToTime(curX);
    const curPrice = this.series.coordinateToPrice(curY);
    const startTime = this.chart.timeScale().coordinateToTime(startX);
    const startPrice = this.series.coordinateToPrice(startY);

    if (!curTime || !curPrice || !startTime || !startPrice) return;

    const priceDelta = curPrice - startPrice;
    const orig = this.dragStartAnchors;

    if (orig.type === "horizontal_line") {
      drawing.data = { ...orig, price: orig.price + priceDelta };
    } else if (orig.type === "trendline" || orig.type === "ray") {
      const d = drawing.data as typeof orig;
      d.p1 = { time: orig.p1.time, price: orig.p1.price + priceDelta };
      d.p2 = { time: orig.p2.time, price: orig.p2.price + priceDelta };
    } else if (orig.type === "parallel_channel") {
      const d = drawing.data as typeof orig;
      d.p1 = { time: orig.p1.time, price: orig.p1.price + priceDelta };
      d.p2 = { time: orig.p2.time, price: orig.p2.price + priceDelta };
    }

    drawing.requestUpdate();
  }

  private onMouseUp(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.dragStartCoord = null;
    this.dragStartAnchors = null;

    document.removeEventListener("mousemove", this.mouseMoveHandler);
    document.removeEventListener("mouseup", this.mouseUpHandler);

    this.chart.applyOptions({
      handleScroll: true,
      handleScale: true,
    });

    this.saveToStorage();
  }

  private onContextMenu(e: MouseEvent): void {
    if (!this.lastHoveredId) return;
    e.preventDefault();
    this.selectDrawing(this.lastHoveredId);
    this.callbacks.onContextMenu(e.clientX, e.clientY, this.lastHoveredId);
  }

  // Public API

  selectDrawing(id: string | null): void {
    if (this.selectedId) {
      const prev = this.drawings.get(this.selectedId);
      if (prev) { prev.selected = false; prev.requestUpdate(); }
    }
    this.selectedId = id;
    if (id) {
      const cur = this.drawings.get(id);
      if (cur) { cur.selected = true; cur.requestUpdate(); }
    }
    this.callbacks.onSelectionChange(id);
  }

  deleteDrawing(id: string): void {
    const drawing = this.drawings.get(id);
    if (!drawing) return;
    this.series.detachPrimitive(drawing);
    this.drawings.delete(id);
    if (this.selectedId === id) this.selectDrawing(null);
    this.saveToStorage();
  }

  changeColor(id: string, color: string): void {
    const drawing = this.drawings.get(id);
    if (!drawing) return;
    drawing.data.color = color;
    drawing.requestUpdate();
    this.saveToStorage();
  }

  deleteSelected(): void {
    if (this.selectedId) this.deleteDrawing(this.selectedId);
  }

  private createDrawing(data: DrawingData): void {
    const drawing = this.createPrimitive(data);
    this.series.attachPrimitive(drawing);
    this.drawings.set(data.id, drawing);
    this.saveToStorage();
  }

  private createPrimitive(data: DrawingData): BaseDrawing {
    switch (data.type) {
      case "trendline": return new TrendLineDrawing(data);
      case "horizontal_line": return new HorizontalLineDrawing(data);
      case "ray": return new RayDrawing(data);
      case "parallel_channel": return new ParallelChannelDrawing(data);
    }
  }

  private saveToStorage(): void {
    const items = Array.from(this.drawings.values()).map((d) => d.data);
    localStorage.setItem(
      `tocktock-drawings-${this.symbol}`,
      JSON.stringify({ version: 1, drawings: items })
    );
  }

  private loadFromStorage(): void {
    const raw = localStorage.getItem(`tocktock-drawings-${this.symbol}`);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1) return;
      for (const data of parsed.drawings as DrawingData[]) {
        const drawing = this.createPrimitive(data);
        this.series.attachPrimitive(drawing);
        this.drawings.set(data.id, drawing);
      }
    } catch { /* ignore corrupt data */ }
  }

  destroy(): void {
    this.chart.unsubscribeClick(this.clickHandler);
    this.chart.unsubscribeCrosshairMove(this.crosshairHandler);
    this.containerEl?.removeEventListener("mousedown", this.mouseDownHandler);
    this.containerEl?.removeEventListener("contextmenu", this.contextMenuHandler);
    document.removeEventListener("mousemove", this.mouseMoveHandler);
    document.removeEventListener("mouseup", this.mouseUpHandler);

    for (const drawing of this.drawings.values()) {
      this.series.detachPrimitive(drawing);
    }
    this.drawings.clear();
  }
}
