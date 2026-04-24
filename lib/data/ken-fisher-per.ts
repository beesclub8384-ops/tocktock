export interface PerSeries {
  label: string;
  color: string;
  // [역사 최저, 저평균, 중앙값, 고평균, 역사 최고, 현재]
  values: [number, number, number, number, number, number];
}

export const PER_LABELS = [
  "역사 최저",
  "저평균",
  "중앙값",
  "고평균",
  "역사 최고",
  "현재 (2026.04)",
] as const;

export type PerKey = "dow" | "sp" | "nas";

export const PER_DATA: Record<PerKey, PerSeries> = {
  dow: {
    label: "DJIA",
    color: "#d4a574",
    values: [10, 19.76, 22.56, 25.35, 30, 23.37],
  },
  sp: {
    label: "S&P 500",
    color: "#6ba3d6",
    values: [7, 16, 18.0, 22, 33, 27.73],
  },
  nas: {
    label: "Nasdaq 100",
    color: "#c87da8",
    values: [12.44, 20, 24.47, 33.3, 38.57, 35.15],
  },
};

export const PER_META = {
  baseDate: "2026. 04. 24",
  sources: "WorldPERatio, GuruFocus, Multpl",
};
