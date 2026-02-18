import type { Time } from "lightweight-charts";

export type DrawingToolType =
  | "trendline"
  | "horizontal_line"
  | "ray"
  | "parallel_channel"
  | null;

export interface DrawingAnchor {
  time: Time;
  price: number;
}

export const DRAWING_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
  "#ffffff",
] as const;

interface BaseDrawingData {
  id: string;
  color: string;
  lineWidth: number;
}

export interface TrendLineData extends BaseDrawingData {
  type: "trendline";
  p1: DrawingAnchor;
  p2: DrawingAnchor;
}

export interface HorizontalLineData extends BaseDrawingData {
  type: "horizontal_line";
  price: number;
}

export interface RayData extends BaseDrawingData {
  type: "ray";
  p1: DrawingAnchor;
  p2: DrawingAnchor;
}

export interface ParallelChannelData extends BaseDrawingData {
  type: "parallel_channel";
  p1: DrawingAnchor;
  p2: DrawingAnchor;
  channelOffset: number;
}

export type DrawingData =
  | TrendLineData
  | HorizontalLineData
  | RayData
  | ParallelChannelData;

export type DrawingPhase =
  | "idle"
  | "placing_p1"
  | "placing_p2"
  | "placing_channel";
