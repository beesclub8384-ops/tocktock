/**
 * 섹션 요약 문장 레지스트리
 *
 * 1층 목록의 섹션 카드와 2층 섹션 페이지가 **같은 함수**를 부른다.
 * 두 화면의 문장이 어긋날 수 없게 하려는 것이다.
 *
 * ⚠ 요약 문장은 섹션마다 성격이 달라 일반화하지 않는다.
 *   관측소 1은 다섯 지표를 쿠션/본체/배관 세 덩어리로 묶어 읽지만,
 *   관측소 2(은행 엑스레이)는 그 묶음이 통하지 않는다.
 *   섹션이 늘면 그 섹션의 요약 함수를 새로 쓰고 아래 레지스트리에 등록한다.
 *   (등록을 안 해도 화면은 깨지지 않는다 — 요약 줄만 안 나온다)
 */
import type {
  ObservatoryStatusMap,
  ObservatorySummary,
} from "@/lib/observatory-catalog";
import { worstStatus } from "@/lib/observatory-catalog";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

/* ────────────────────────────────────────────────────────────
 * 관측소 1 — 배관
 *
 * 카드를 다 읽지 않아도 첫 줄에서 시스템 상태가 잡히게 한다.
 * 다섯 지표를 성격별로 세 덩어리로 묶어 읽는다.
 *   쿠션 = RRP (①)
 *   본체 = 지급준비금 (②)
 *   배관 = SOFR−IORB · SRF · 재할인 창구 (③④⑤) — 셋 중 가장 나쁜 상태로 대표
 * ──────────────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────────────
 * 레지스트리
 * ──────────────────────────────────────────────────────────── */

/** 섹션 id → 그 섹션의 요약 함수 */
const SECTION_SUMMARIZERS: Record<
  string,
  (statuses: ObservatoryStatusMap) => ObservatorySummary
> = {
  plumbing: summarizeSection1,
};

/**
 * 섹션 요약 한 줄. 요약 함수가 등록되지 않은 섹션이면 null.
 *
 * null 을 받은 화면은 요약 줄을 그리지 않는다 (문장을 지어내지 않는다).
 */
export function summarizeSection(
  sectionId: string,
  statuses: ObservatoryStatusMap
): ObservatorySummary | null {
  const fn = SECTION_SUMMARIZERS[sectionId];
  return fn ? fn(statuses) : null;
}
