/**
 * 관측소 카탈로그 — 인덱스 페이지가 읽는 섹션·지표 목록
 *
 * 관측소를 늘릴 때는 OBSERVATORY_SECTIONS 에 섹션을 하나 더 넣으면 된다.
 * 인덱스 페이지는 이 배열을 순회할 뿐이라 페이지 코드를 고칠 일이 없다.
 *
 * ⚠ 여기에는 **표시용 메타데이터만** 둔다. 수집·판정 로직은
 *   lib/observatory-constants.ts 와 lib/observatory-*.ts 에 그대로 있고,
 *   이 파일은 그것들을 알지 못한다. (한 줄 설명이 상세 페이지 헤더와
 *   어긋나지 않도록, 문구는 각 상세 페이지 헤더에서 그대로 가져왔다)
 */
import type { ObservatoryStatus } from "@/lib/observatory-constants";

/** 지표 식별자 — 인덱스 페이지가 값 조회 함수를 고르는 데 쓴다 */
export type ObservatoryIndicatorKey =
  | "rrp"
  | "reserves"
  | "sofr-iorb"
  | "srf"
  | "discount-window";

export interface ObservatoryIndicatorMeta {
  key: ObservatoryIndicatorKey;
  /** 경보 사슬에서의 순서 (1부터) */
  order: number;
  href: string;
  name: string;
  /** 카드에 한 줄로 들어가는 의미 설명 */
  oneLiner: string;
  /** 값이 낮을수록 위험한 지표인지 (카드에 방향 표시를 붙인다) */
  lowerIsWorse?: boolean;
}

export interface ObservatorySectionMeta {
  id: string;
  /** 섹션 제목 */
  title: string;
  /** 섹션 한 줄 설명 */
  subtitle: string;
  /** 섹션 하단 사슬 설명 */
  chainNote: string;
  /** 사슬 순서대로 정렬된 지표들 */
  indicators: ObservatoryIndicatorMeta[];
}

export const OBSERVATORY_SECTIONS: ObservatorySectionMeta[] = [
  {
    id: "plumbing",
    title: "관측소 1 — 배관: 자금시장의 수압계",
    subtitle:
      "시스템 전체의 현금 사정을 재는 곳. 여기가 흔들리면 어디가 아픈지와 무관하게 모두가 아파진다.",
    chainNote: "①→⑤는 시스템의 현금이 마를 때 경보가 켜지는 순서다",
    indicators: [
      {
        key: "rrp",
        order: 1,
        href: "/observatory/rrp",
        name: "역레포(RRP) 잔액",
        oneLiner:
          "시스템의 여유 현금 쿠션. 이 잔액이 마르면 다음은 은행 지급준비금 본체가 마른다.",
        lowerIsWorse: true,
      },
      {
        key: "reserves",
        order: 2,
        href: "/observatory/reserves",
        name: "지급준비금 총량",
        oneLiner:
          "미국 은행 전체가 연준 계좌에 가진 돈의 총합. 시스템이 굴러가는 연료의 총량이다.",
        lowerIsWorse: true,
      },
      {
        key: "sofr-iorb",
        order: 3,
        href: "/observatory/sofr-iorb",
        name: "SOFR − IORB 스프레드",
        oneLiner:
          "연료가 빠듯해지면 먼저 튀는 값. 0 위로 올라오면 달러 자금이 빡빡해졌다는 뜻이다.",
      },
      {
        key: "srf",
        order: 4,
        href: "/observatory/srf",
        name: "SRF 사용량",
        oneLiner:
          "연준의 응급 창구. 평소엔 0이라, 0에서 벗어나면 시장에서 돈을 못 구한 기관이 생겼다는 신호다.",
      },
      {
        key: "discount-window",
        order: 5,
        href: "/observatory/discount-window",
        name: "재할인 창구 대출 잔액",
        oneLiner:
          "은행들의 최후 비상구. 낙인 때문에 평시엔 아무도 안 쓰는 창구라, 잔액 급증은 가짜 양성이 없는 경보다.",
      },
    ],
  },
];

/* ────────────────────────────────────────────────────────────
 * 관측소 1 요약 문장
 *
 * 카드를 다 읽지 않아도 첫 줄에서 시스템 상태가 잡히게 한다.
 * 관측소 1의 다섯 지표를 성격별로 세 덩어리로 묶어 읽는다.
 *   쿠션 = RRP (①)
 *   본체 = 지급준비금 (②)
 *   배관 = SOFR−IORB · SRF · 재할인 창구 (③④⑤) — 셋 중 가장 나쁜 상태로 대표
 *
 * ⚠ 이 함수는 관측소 1 전용이다. 관측소 2·4가 붙으면 그 섹션은 그 섹션대로
 *   요약 함수를 따로 만든다 (덩어리 구분이 섹션마다 다르므로 일반화하지 않는다).
 * ──────────────────────────────────────────────────────────── */

/** 지표별 판정 상태. 아직 데이터가 없으면 null */
export type ObservatoryStatusMap = Partial<
  Record<ObservatoryIndicatorKey, ObservatoryStatus | null>
>;

/** 상태 심각도 — 큰 쪽이 나쁘다 */
const SEVERITY: Record<ObservatoryStatus, number> = {
  normal: 0,
  caution: 1,
  warning: 2,
};

const CUSHION_TEXT: Record<ObservatoryStatus, string> = {
  normal: "여유 있음",
  caution: "얇아지는 중",
  warning: "소진",
};

const CORE_TEXT: Record<ObservatoryStatus, string> = {
  normal: "정상",
  caution: "빠듯",
  warning: "위험 구간",
};

const PLUMBING_TEXT: Record<ObservatoryStatus, string> = {
  normal: "정상",
  caution: "삐걱이는 중",
  warning: "경보",
};

/** 여러 상태 중 가장 나쁜 것. 전부 null 이면 null */
export function worstStatus(
  statuses: (ObservatoryStatus | null | undefined)[]
): ObservatoryStatus | null {
  let worst: ObservatoryStatus | null = null;
  for (const s of statuses) {
    if (!s) continue;
    if (worst === null || SEVERITY[s] > SEVERITY[worst]) worst = s;
  }
  return worst;
}

export interface ObservatorySummary {
  /** 화면에 그대로 넣는 한 줄 */
  text: string;
  /** 문장 전체의 심각도 (색을 고르는 데 쓴다). 데이터가 없으면 null */
  status: ObservatoryStatus | null;
}

/**
 * 관측소 1의 다섯 신호등을 한 문장으로 요약한다.
 *
 * 예) "현재: 쿠션(RRP)은 소진, 본체와 배관은 정상"
 *
 * 본체와 배관의 표현이 같으면 "본체와 배관은 X" 로 묶어 문장을 짧게 만든다.
 * 셋 다 정상이면 아예 한 덩어리로 묶는다.
 */
export function summarizeSection1(statuses: ObservatoryStatusMap): ObservatorySummary {
  const cushion = statuses.rrp ?? null;
  const core = statuses.reserves ?? null;
  const plumbing = worstStatus([
    statuses["sofr-iorb"],
    statuses.srf,
    statuses["discount-window"],
  ]);

  const overall = worstStatus([cushion, core, plumbing]);

  // 아직 아무 데이터도 없으면 상태를 지어내지 않는다
  if (cushion === null && core === null && plumbing === null) {
    return { text: "현재 상태를 확인할 수 없습니다 (수집 대기)", status: null };
  }

  // 셋 다 정상이면 나열할 이유가 없다
  if (cushion === "normal" && core === "normal" && plumbing === "normal") {
    return { text: "현재: 쿠션·본체·배관 모두 정상", status: "normal" };
  }

  const cushionText = cushion ? CUSHION_TEXT[cushion] : "확인 불가";
  const coreText = core ? CORE_TEXT[core] : "확인 불가";
  const plumbingText = plumbing ? PLUMBING_TEXT[plumbing] : "확인 불가";

  const parts = [`쿠션(RRP)은 ${cushionText}`];
  if (coreText === plumbingText) {
    // 예: "본체와 배관은 정상"
    parts.push(`본체와 배관은 ${coreText}`);
  } else {
    parts.push(`본체(지급준비금)는 ${coreText}`);
    parts.push(`배관은 ${plumbingText}`);
  }

  return { text: `현재: ${parts.join(", ")}`, status: overall };
}
