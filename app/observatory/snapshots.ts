/**
 * 지표 스냅샷 레지스트리 — 카드 한 장에 필요한 실측값을 읽는다
 *
 * 1층 목록은 모든 지표를, 2층 섹션 페이지는 자기 섹션 지표만 읽는다.
 *
 * ⚠ 상세 페이지처럼 자기 API 를 HTTP 로 부르지 않고 Redis 를 직접 읽는다.
 *   카드 화면은 지표 여러 개를 한꺼번에 봐야 해서, HTTP 로 가면 한 번 그리는 데
 *   서버리스 호출이 지표 수만큼 붙고 전체 시계열(SRF 만 7천 건)을 직렬화했다
 *   되파싱하게 된다. 수집·판정 로직은 그대로 두고 호출만 직접 한다.
 *
 * ⚠ 이 파일은 서버 전용이다 (Redis 접근). 클라이언트 컴포넌트에서 import 금지.
 *   네비게이션이 읽는 표시용 메타는 lib/observatory-catalog.ts 에 있다.
 *
 * 지표를 늘릴 때: 아래 LOADERS 에 한 줄 등록하면 끝이다. 카탈로그의
 * ObservatoryIndicatorKey 에 key 를 추가하고 여기에 안 넣으면 **타입 에러**가
 * 나므로, 등록을 빠뜨린 채 배포되는 일은 없다.
 */
import {
  allIndicatorKeys,
  type ObservatoryIndicatorKey,
} from "@/lib/observatory-catalog";
import {
  evaluateDiscountWindow,
  evaluateReserves,
  evaluateRrp,
  evaluateSofrIorb,
  evaluateSrf,
  evaluateUnrealizedLosses,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";
import { loadSofrIorb } from "@/lib/observatory-sofr-iorb";
import { loadSrf } from "@/lib/observatory-srf";
import { loadDiscountWindow } from "@/lib/observatory-discount-window";
import { loadRrp } from "@/lib/observatory-rrp";
import { loadReserves } from "@/lib/observatory-reserves";
// 관측소 2 — FRED 가 아니라 FDIC 분기 보고서에서 온다
import { loadUnrealizedLosses } from "@/lib/observatory-banks";
// 카드 표기는 지표들을 나란히 놓고 읽는 화면이라 단위를 십억 달러로
// 통일한다 (상세 페이지 포맷터는 지표별로 단위를 바꿔서 카드에는 안 맞는다).
// 자세한 이유는 card-format.ts 상단 주석 참고.
import {
  formatCardBillions,
  formatCardBp,
  formatCardPercent,
  type CardValue,
} from "./card-format";

/**
 * 로드 실패를 조용히 삼키지 않기 위한 껍데기.
 *
 * 한 지표가 실패해도 화면 전체는 떠야 하므로 폴백은 그대로 두되, 무엇이
 * 실패했는지는 반드시 로그에 남긴다. 로그가 없으면 카드가 "수집 대기" 로
 * 보이는 게 첫 수집 전인지 장애인지 구분되지 않는다 — 전형적인 무음 실패다.
 */
async function orLog<T>(key: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.error(`[observatory/snapshots] ${key} 로드 실패:`, e);
    return fallback;
  }
}

/** 카드 한 장에 필요한 실측 정보 */
export interface IndicatorSnapshot {
  status: ObservatoryStatus | null;
  /** 현재값 표시. 데이터 없으면 null */
  value: CardValue | null;
  /** 기준일 YYYY-MM-DD. 데이터 없으면 null */
  asOf: string | null;
  /**
   * 화면 표기가 아닌 **원시 수치**. 요약 문장이 숫자를 품어야 할 때 쓴다.
   *
   * value.main 은 "12.4%" 같은 완성된 문자열이라 문장에 다시 끼워 넣기 어렵다.
   * 필요한 지표만 채우고, 안 채우면 undefined 다.
   */
  raw?: number | null;
}

export const EMPTY_SNAPSHOT: IndicatorSnapshot = {
  status: null,
  value: null,
  asOf: null,
};

/**
 * 지표 하나의 스냅샷을 읽는 함수들.
 *
 * 수집이 실패해도 그 카드만 "수집 대기" 로 떨어지고 화면 전체는 그대로 뜬다.
 */
const LOADERS: Record<ObservatoryIndicatorKey, () => Promise<IndicatorSnapshot>> = {
  rrp: async () => {
    const v = evaluateRrp(await orLog("rrp", loadRrp(), []));
    return v.latest
      ? {
          status: v.status,
          value: formatCardBillions(v.latest.balanceBillions),
          asOf: v.latest.date,
        }
      : EMPTY_SNAPSHOT;
  },
  reserves: async () => {
    const v = evaluateReserves(await orLog("reserves", loadReserves(), []));
    return v.latest
      ? {
          status: v.status,
          value: formatCardBillions(v.latest.balanceBillions),
          asOf: v.latest.date,
        }
      : EMPTY_SNAPSHOT;
  },
  "sofr-iorb": async () => {
    const v = evaluateSofrIorb(await orLog("sofr-iorb", loadSofrIorb(), []));
    return v.latest
      ? {
          status: v.status,
          value: formatCardBp(v.latest.spreadBp),
          asOf: v.latest.date,
        }
      : EMPTY_SNAPSHOT;
  },
  srf: async () => {
    const v = evaluateSrf(await orLog("srf", loadSrf(), []));
    return v.latest
      ? {
          status: v.status,
          value: formatCardBillions(v.latest.usageBillions),
          asOf: v.latest.date,
        }
      : EMPTY_SNAPSHOT;
  },
  "discount-window": async () => {
    const v = evaluateDiscountWindow(
      await orLog("discount-window", loadDiscountWindow(), [])
    );
    return v.latest
      ? {
          status: v.status,
          value: formatCardBillions(v.latest.balanceBillions),
          asOf: v.latest.date,
        }
      : EMPTY_SNAPSHOT;
  },
  // ⚠ 분기 지표라 asOf 가 날짜가 아니라 분기 말일이다. 카드에는 "2026.06.30
  //   기준" 대신 분기를 보여주는 편이 정확해서 note 에 분기를 넣는다.
  "unrealized-losses": async () => {
    const store = await orLog("unrealized-losses", loadUnrealizedLosses(), {
      series: [],
      meta: null,
    });
    const v = evaluateUnrealizedLosses(store.series);
    return v.latest
      ? {
          status: v.status,
          value: formatCardPercent(v.latest.ratioPct, v.latest.quarter),
          asOf: v.latest.quarterEnd,
          raw: v.latest.ratioPct,
        }
      : EMPTY_SNAPSHOT;
  },
};

/**
 * 지표들의 현재 상태를 한꺼번에 읽는다. keys 를 안 주면 카탈로그 전체.
 *
 * ⚠ 1층 목록은 섹션 카드의 종합 상태를 실제 판정과 일치시키려고 모든 지표를
 *   읽는다. 관측소가 6개까지 늘면 한 번에 30개를 읽게 되는데, 지금은 전부
 *   Promise.all 로 병렬이라 지연은 가장 느린 하나에 묶인다. 그래도 부담이
 *   커지면 섹션별 종합 상태만 따로 캐싱하는 편이 낫다 (지금은 하지 않는다).
 */
export async function loadSnapshots(
  keys: ObservatoryIndicatorKey[] = allIndicatorKeys()
): Promise<Partial<Record<ObservatoryIndicatorKey, IndicatorSnapshot>>> {
  const entries = await Promise.all(
    keys.map(async (key) => [key, await LOADERS[key]()] as const)
  );
  return Object.fromEntries(entries);
}
