import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  IChartApi,
  ISeriesApi,
  SeriesType,
  IPrimitivePaneView,
  PrimitiveHoveredItem,
} from "lightweight-charts";
import type { DrawingData } from "@/lib/types/drawing";

export abstract class BaseDrawing implements ISeriesPrimitive<Time> {
  protected _chart: IChartApi | null = null;
  protected _series: ISeriesApi<SeriesType> | null = null;
  protected _requestUpdate: (() => void) | null = null;
  protected _paneViews: IPrimitivePaneView[] = [];

  public selected = false;
  public abstract data: DrawingData;

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart as IChartApi;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  requestUpdate(): void {
    this._requestUpdate?.();
  }

  protected toCoord(time: Time, price: number): { x: number; y: number } | null {
    if (!this._chart || !this._series) return null;
    const x = this._chart.timeScale().timeToCoordinate(time);
    const y = this._series.priceToCoordinate(price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  abstract updateAllViews(): void;
  abstract paneViews(): readonly IPrimitivePaneView[];
  abstract hitTest(x: number, y: number): PrimitiveHoveredItem | null;
}
