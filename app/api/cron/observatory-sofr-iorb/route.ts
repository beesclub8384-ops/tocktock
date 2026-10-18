import { NextResponse } from "next/server";
import { collectSofrIorb } from "@/lib/observatory-sofr-iorb";
import { collectSrf } from "@/lib/observatory-srf";
import { collectDiscountWindow } from "@/lib/observatory-discount-window";
import { collectRrp } from "@/lib/observatory-rrp";
import { collectReserves } from "@/lib/observatory-reserves";
import { collectMarketIndex } from "@/lib/observatory-market-index";
import { isOriginSource, MARKET_INDEX_COLLECTION } from "@/lib/observatory-source-config";
import { originFetchLog, warmOriginReleases } from "@/lib/observatory-origin";
// 관측소 2 — FDIC 분기 보고서 (FRED 아님)
import {
  collectUnrealizedLosses,
  fetchLatestWorkbook,
} from "@/lib/observatory-banks";
import { collectFhlb } from "@/lib/observatory-fhlb";
import {
  collectDepositFlightQuarterly,
  collectDepositFlightWeekly,
} from "@/lib/observatory-deposit-flight";
import {
  collectCreConcentration,
  collectCreSizeSplit,
} from "@/lib/observatory-cre";
// 관측소 3 — CFTC TFF 보고서 (FRED 아님)
import { collectBasisTrade } from "@/lib/observatory-basis-trade";
import { collectNbfiLoans } from "@/lib/observatory-nbfi-loans";
// 관측소 4 — 재무부 Fiscal Data · FRED DGS10 · 재무부 TIC
import { collectAuctions } from "@/lib/observatory-treasury-auctions";
import { collectYields } from "@/lib/observatory-rate-vol";
import { collectTic } from "@/lib/observatory-tic";
// 관측소 5 — 연준 GZ 신용 스프레드 · FRED CORBLACBS
import { collectChargeOffs, collectGz } from "@/lib/observatory-credit";
// 관측소 6 — SEC XBRL 공시
import { collectCapex } from "@/lib/observatory-capex";
// 미션 3 — 연준 SCOOS(관측소 3) · 뉴욕 연은 딜러 통계(관측소 4)
import { collectScoos } from "@/lib/observatory-scoos";
import { collectDealers } from "@/lib/observatory-dealers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 관측소 전체 지표 수집 — 지금 6개 관측소 · 지표 20개
 *   관측소 1 배관: SOFR(뉴욕 연은)·IORB·재할인 창구·지급준비금(연준 이사회 원출처), RRP·SRF(FRED — 미전환)
 *   관측소 2 은행(연준 이사회 원출처 + FDIC 분기 워크북): 채권 미실현손실 · FHLB · 예금 유출 · CRE
 *   관측소 3 그림자금융: 국채 베이시스 트레이드 대리 지표(CFTC TFF) ·
 *                        은행의 비예금 금융기관 대출(연준 이사회 H.8)
 *   관측소 4 국채시장: 입찰 응찰 배율·딜러 비중(재무부 Fiscal Data, 한 번 받아 둘이 같이 씀) ·
 *                      10년물 금리 변동성(연준 이사회 H.15) · 해외 보유(재무부 TIC)
 *   관측소 5 신용의 벽: GZ 신용 스프레드(연준 이사회 CSV) · 기업대출 상각률(연준 이사회 CHGDEL)
 *   관측소 6 신참 결절점: 대형 기술기업 5곳 설비투자(SEC XBRL, 회사별 요청 5번)
 *   + 관측소 3 헤지펀드 조달 조건(연준 SCOOS XML zip) · 관측소 4 딜러 국채 보유(뉴욕 연은 API)
 *   (차트 오버레이용 나스닥·S&P 500 수집은 미션 5부터 꺼짐 — MARKET_INDEX_COLLECTION)
 *
 * ⚠ 경로 이름이 sofr-iorb 로 남아 있지만 관측소 지표를 모두 여기서 모은다.
 *   경로를 바꾸면 vercel.json 의 cron path 도 같이 바꿔야 하고, 한쪽만 고치면
 *   cron 이 조용히 404 로 죽는다. 그래서 이름은 그대로 두고 지표만 추가한다.
 *   새 지표가 늘어도 이 파일에 수집 함수를 하나 더 붙이면 된다.
 *
 * 실행 시간 (maxDuration 60초): 미션 6부터 연준 발표 zip 은 바뀐 날만 받는다(ETag → 304). 바뀐 묶음이 없는 날 로컬 프로덕션
 *   약 7~8초·원출처 약 0.38MB(대부분 SOFR 연도별 요청), 6개 모두 바뀐 날 약 60MB. 응답의 originFetches 에 요청별 용량·시간을 남긴다.
 *   배포 실측은 결정 로그 18-6.
 *   관측소 4·5 수집기는 관측소별로 Promise.allSettled 로 동시에 받는다. 분기 FDIC 워크북(2.6MB)을
 *   받는 날의 시간은 아직 재지 못했다 — 40초를 넘기 시작하면 라우트를 나눌 것.
 *
 * Vercel Cron 은 GET 으로 호출한다 — 반드시 GET (POST 로 만들면 405 무음 실패)
 * 평일 UTC 13:00 (KST 22:00) 실행.
 * SOFR 은 미국 기준 다음 영업일 오전 8시경 발표되므로 이 시각이면 최신치가 확보된다.
 */
export async function GET(request: Request) {
  // 기존 cron 인증 방식과 동일: CRON_SECRET 설정 시 Bearer 검증
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // 연준 발표 묶음(원출처)을 미리 동시에 받기 시작한다 — 아래 수집기들이 같은 결과를 기다린다(미션 5)
  warmOriginReleases(isOriginSource);

  // 지표마다 따로 잡는다. 한쪽이 실패해도 다른 쪽은 저장된다
  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  // 실패는 아니지만 사람이 확인해 볼 일. HTTP 상태에는 영향을 주지 않는다
  const warnings: { indicator: string; date: string; message: string }[] = [];

  // ⚠ 관측소 2 의 분기 지표 셋(채권 미실현손실 · 예금 유출 · CRE)이 **같은
  //   2.6MB 워크북**을 본다. 각자 받으면 이 cron 한 번에 세 번 받는다.
  //   여기서 한 번만 받아 셋에 나눠 준다. 셋 다 분기 판단으로 건너뛰면
  //   이 함수는 호출되지 않아 HTTP 도 발생하지 않는다 (지연 평가).
  let workbookOnce: ReturnType<typeof fetchLatestWorkbook> | null = null;
  const getWorkbook = () => (workbookOnce ??= fetchLatestWorkbook());

  try {
    results.sofrIorb = await collectSofrIorb();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] sofr-iorb 수집 실패:", error);
    errors.sofrIorb = detail;
  }

  try {
    results.srf = await collectSrf();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] srf 수집 실패:", error);
    errors.srf = detail;
  }

  // 재할인 창구는 주간(수요일 기준) 시리즈다. 매일 돌려도 새 값은 주 1회만 들어온다.
  // FRED 갱신이 목요일 미국 동부 오후라 이 cron(UTC 13:00) 기준으로는
  // 금요일 실행에서 그 주 수요일 값이 처음 잡힌다 — 정상이다.
  try {
    results.discountWindow = await collectDiscountWindow();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] discount-window 수집 실패:", error);
    errors.discountWindow = detail;
  }

  // RRP 는 일간, 지급준비금은 주간(수요일 기준)이다. 주간 쪽은 매일 돌려도
  // 새 값이 주 1회만 들어온다 — 재할인 창구와 같다.
  try {
    results.rrp = await collectRrp();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] rrp 수집 실패:", error);
    errors.rrp = detail;
  }

  try {
    results.reserves = await collectReserves();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] reserves 수집 실패:", error);
    errors.reserves = detail;
  }

  // 관측소 2 — 채권 미실현손실. 유일하게 분기 지표라 매일 받을 이유가 없다.
  // collectUnrealizedLosses 가 저장된 분기를 보고 스스로 건너뛴다 (HTTP 무발생).
  // 새 분기가 나올 때만 실제로 2.6MB 워크북을 받는다.
  try {
    results.unrealizedLosses = await collectUnrealizedLosses(false, getWorkbook);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] unrealized-losses 수집 실패:", error);
    errors.unrealizedLosses = detail;
  }

  // 관측소 2 — FHLB 차입 잔액. 분기 지표지만 FRED 라 응답이 가볍다
  // (관측치 323건). 매일 받아도 부담이 없어 따로 건너뛰기를 두지 않는다.
  try {
    results.fhlb = await collectFhlb();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] fhlb 수집 실패:", error);
    errors.fhlb = detail;
  }

  // 관측소 2 — 예금 유출. 주간 파트와 분기 파트가 출처도 주기도 달라
  // 따로 잡는다. 주간(FRED)이 실패해도 분기(FDIC)는 저장되고 그 반대도 같다.
  try {
    results.depositFlightWeekly = await collectDepositFlightWeekly();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] deposit-flight 주간 수집 실패:", error);
    errors.depositFlightWeekly = detail;
  }

  // 분기 파트는 채권 미실현손실과 같은 워크북을 보지만, 저장된 분기가
  // 최신이면 스스로 건너뛴다 (HTTP 무발생).
  try {
    results.depositFlightQuarterly = await collectDepositFlightQuarterly(
      false,
      getWorkbook
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] deposit-flight 분기 수집 실패:", error);
    errors.depositFlightQuarterly = detail;
  }

  // 관측소 2 — CRE 익스포저. FRED(규모별 연체율)와 워크북(임대용 연체율 +
  // 규모별 집중도)이 출처가 달라 따로 잡는다.
  try {
    results.creSizeSplit = await collectCreSizeSplit();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] cre 규모별 연체율 수집 실패:", error);
    errors.creSizeSplit = detail;
  }

  try {
    results.creConcentration = await collectCreConcentration(false, getWorkbook);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] cre 집중도 수집 실패:", error);
    errors.creConcentration = detail;
  }

  // 관측소 3 — 국채 베이시스(CFTC). 주간 지표라 매일 돌려도 새 값은 주 1회다.
  // CFTC 발표(금 15:30 ET)가 이 cron(UTC 13:00)보다 늦어 월요일 실행에서
  // 그 주 화요일 값이 처음 잡힌다 — 정상이다.
  try {
    results.basisTrade = await collectBasisTrade();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] basis-trade 수집 실패:", error);
    errors.basisTrade = detail;
  }

  // 관측소 3 — 은행의 NDFI 대출(FRED H.8). 과거 값이 사후 개정되는 시리즈라
  // 매번 전체(약 600건)를 받아 덮어쓴다. H.8 발표(금 16:15 ET)가 이 cron 보다
  // 늦어 월요일 실행에서 그 전주 수요일 값이 처음 잡힌다 — 정상이다.
  try {
    const nbfi = await collectNbfiLoans();
    results.nbfiLoans = nbfi;
    for (const s of nbfi.recentSurges) {
      warnings.push({
        indicator: "nbfi-loans",
        date: s.date,
        message: `주간 변화 ${s.changeBillions.toFixed(1)}십억 달러 — 재분류 표 날짜와 겹치지 않는 큰 변화. 재분류 여부 확인 필요`,
      });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] nbfi-loans 수집 실패:", error);
    errors.nbfiLoans = detail;
  }

  // 관측소 4 — 세 출처가 서로 독립이라 **동시에** 받는다. 순서대로 받으면 cron 전체가
  // 그만큼 길어진다 (입찰 원자료만 약 1MB, 실측 4~5초). 하나가 실패해도 나머지는 저장된다.
  const [auctions, yields, tic] = await Promise.allSettled([
    collectAuctions(),
    collectYields(),
    collectTic(),
  ]);
  for (const [name, r] of [
    ["treasuryAuctions", auctions],
    ["rateVolatility", yields],
    ["foreignHoldings", tic],
  ] as const) {
    if (r.status === "fulfilled") {
      results[name] = r.value;
    } else {
      const detail = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[observatory] ${name} 수집 실패:`, r.reason);
      errors[name] = detail;
    }
  }

  // 관측소 5 — 두 출처가 서로 독립이라 동시에 받는다. 둘 다 과거 값이 고쳐질 수 있어 전체를 덮어쓴다
  // 관측소 6 — SEC 설비투자도 독립 출처라 같은 묶음에서 동시에 받는다 (회사 5곳도 안에서 동시에 받는다)
  // 미션 3 두 출처도 독립이라 같은 묶음에서 동시에 받는다
  const [gz, chargeOffs, capex, scoos, dealers] = await Promise.allSettled([
    collectGz(),
    collectChargeOffs(),
    collectCapex(),
    collectScoos(),
    collectDealers(),
  ]);
  for (const [name, r] of [
    ["gzSpread", gz],
    ["businessChargeOffs", chargeOffs],
    ["bigtechCapex", capex],
    ["scoosHedgeFund", scoos],
    ["dealerTreasuryPositions", dealers],
  ] as const) {
    if (r.status === "fulfilled") {
      results[name] = r.value;
    } else {
      const detail = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[observatory] ${name} 수집 실패:`, r.reason);
      errors[name] = detail;
    }
  }

  // 주가지수(SP500·NASDAQCOM)는 미션 5부터 수집하지 않는다 — FRED 등급 "사전 승인 필요" 시리즈이고 화면에서도
  // 쓰지 않는다(미션 4). 코드는 남겨 두고 lib/observatory-source-config.ts 의 MARKET_INDEX_COLLECTION 으로 끈다.
  if (MARKET_INDEX_COLLECTION) {
    try {
      results.marketIndex = await collectMarketIndex();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[observatory] market-index 수집 실패:", error);
      errors.marketIndex = detail;
    }
  }

  const failed = Object.keys(errors);
  // 지표를 하나 더 붙였을 때 숫자를 같이 안 고쳐 조용히 200 을 내보내는 일이
  // 없도록, 상수 대신 실제 시도 횟수(성공 + 실패)로 센다
  const attempted = failed.length + Object.keys(results).length;
  // 전부 실패했을 때만 500. 일부만 실패하면 성공분은 살리고 실패를 함께 알린다
  const status = attempted > 0 && failed.length === attempted ? 500 : 200;

  return NextResponse.json(
    {
      success: failed.length === 0,
      ...results,
      ...(failed.length > 0 ? { errors } : {}),
      warnings,
      // 원출처 요청별 기록 — 용량·시간 측정용 (304 는 바뀌지 않아 받지 않은 것)
      originFetches: originFetchLog.splice(0),
      refreshedAt: new Date().toISOString(),
    },
    { status }
  );
}
