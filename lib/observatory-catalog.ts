/**
 * 관측소 카탈로그 — 3층 구조가 읽는 섹션·지표 목록
 *
 *   1층 /observatory            목록: 섹션 카드들
 *   2층 /observatory/{id}       섹션: 그 섹션의 지표 카드들
 *   3층 /observatory/{지표}     지표 상세
 *
 * 관측소를 늘릴 때는 OBSERVATORY_SECTIONS 에 섹션을 하나 더 넣으면
 * 1층·2층·네비게이션이 전부 자동으로 늘어난다 (페이지 코드는 손대지 않는다).
 * 새 지표의 값을 읽는 방법은 app/observatory/snapshots.ts 에,
 * 새 섹션의 요약 문장은 app/observatory/summaries.ts 에 등록한다.
 *
 * ⚠ 여기에는 **표시용 메타데이터만** 둔다. 수집·판정 로직은
 *   lib/observatory-constants.ts 와 lib/observatory-*.ts 에 그대로 있고,
 *   이 파일은 그것들을 알지 못한다. 한 줄 설명(oneLiner)은 카드용 요약이라
 *   상세 페이지 헤더와 글자까지 같지는 않다(2026-10 존댓말 통일 때 따로 다듬었다).
 *   뜻이 어긋나지 않게, 상세 페이지 설명을 바꾸면 여기도 같이 본다.
 *
 * ⚠ 이 파일은 navbar("use client")도 import 한다. Redis 접근이나 서버 전용
 *   모듈을 여기에 섞으면 클라이언트 번들이 깨진다. 순수 데이터만 둘 것.
 */
import type { ObservatoryStatus } from "@/lib/observatory-constants";

/** 지표 식별자 — 값 조회 함수를 고르는 데 쓴다 */
export type ObservatoryIndicatorKey =
  | "rrp"
  | "reserves"
  | "sofr-iorb"
  | "srf"
  | "discount-window"
  | "unrealized-losses"
  | "fhlb"
  | "deposit-flight"
  | "cre"
  | "basis-trade"
  | "nbfi-loans"
  | "scoos-hedge-fund"
  | "auction-bid-to-cover"
  | "auction-dealer-share"
  | "rate-volatility"
  | "foreign-holdings"
  | "dealer-treasury-positions"
  | "gz-spread"
  | "business-chargeoffs"
  | "ai-capex";

export interface ObservatoryIndicatorMeta {
  key: ObservatoryIndicatorKey;
  /** 경보 사슬에서의 순서 (1부터) */
  order: number;
  /**
   * 지표 상세 URL.
   *
   * 섹션 아래(/observatory/plumbing/rrp)가 아니라 평면(/observatory/rrp)이다.
   * 관측소 번호는 나중에 순서가 바뀔 수 있는 표시용 값이라 URL 에 넣지 않고,
   * 이미 밖에 나가 있는 주소를 깨뜨리지 않기 위해서다.
   */
  href: string;
  name: string;
  /** 카드에 한 줄로 들어가는 의미 설명 */
  oneLiner: string;
  /** 값이 낮을수록 위험한 지표인지 (카드에 방향 표시를 붙인다) */
  lowerIsWorse?: boolean;
}

export interface ObservatorySectionMeta {
  /**
   * 슬러그 겸 식별자 → /observatory/{id}
   *
   * ⚠ 관측소 번호(1, 2 …)를 쓰지 않는다. 번호는 표시 순서라 나중에 바뀔 수
   *   있는데, URL 이 그때마다 따라 바뀌면 안 된다.
   */
  id: string;
  /** 화면 표시용 번호. URL 에는 절대 쓰지 않는다 */
  number: number;
  /** 번호 뒤에 붙는 이름 — "관측소 1 — {name}" */
  name: string;
  /** 브레드크럼처럼 좁은 자리에 쓰는 짧은 이름 */
  shortName: string;
  /** 섹션 한 줄 설명 */
  subtitle: string;
  /** 섹션 하단 사슬 설명 */
  chainNote: string;
  /**
   * 섹션 페이지 헤더의 출처 표기.
   * 관측소마다 출처가 달라(FRED · FDIC · CFTC) 섹션 페이지에 문자열을 박아두면
   * 새 섹션이 남의 출처를 달고 나온다.
   */
  source: string;
  /** 사슬 순서대로 정렬된 지표들 */
  indicators: ObservatoryIndicatorMeta[];
}

export const OBSERVATORY_SECTIONS: ObservatorySectionMeta[] = [
  {
    id: "plumbing",
    number: 1,
    name: "배관: 자금시장의 수압계",
    shortName: "배관",
    subtitle:
      "시스템 전체의 현금 사정을 재는 곳입니다. 여기가 흔들리면 어디가 아픈지와 무관하게 모두가 아파집니다.",
    chainNote: "①→⑤는 시스템의 현금이 마를 때 경보가 켜지는 순서입니다",
    // FRED 이용 약관: 원출처와 "FRED 경유"를 함께 적는다 (뉴욕 연은 시리즈는 "Copyrighted: Citation required")
    source: "뉴욕 연방준비은행(RRP·SOFR·SRF)·연준 이사회(IORB·지급준비금·재할인 창구), 모두 FRED 경유",
    indicators: [
      {
        key: "rrp",
        order: 1,
        href: "/observatory/rrp",
        name: "역레포(RRP) 잔액",
        oneLiner:
          "시스템의 여유 현금 쿠션입니다. 이 잔액이 마르면 다음은 은행 지급준비금 본체가 마릅니다.",
        lowerIsWorse: true,
      },
      {
        key: "reserves",
        order: 2,
        href: "/observatory/reserves",
        name: "지급준비금 총량",
        oneLiner:
          "미국 은행 전체가 연준 계좌에 가진 돈의 총합입니다. 시스템이 굴러가는 연료의 총량입니다.",
        lowerIsWorse: true,
      },
      {
        key: "sofr-iorb",
        order: 3,
        href: "/observatory/sofr-iorb",
        name: "SOFR − IORB 스프레드",
        oneLiner:
          "연료가 빠듯해지면 먼저 튀는 값입니다. 0 위로 올라오면 달러 자금이 빡빡해졌다는 뜻입니다.",
      },
      {
        key: "srf",
        order: 4,
        href: "/observatory/srf",
        name: "SRF 사용량",
        oneLiner:
          "연준의 응급 창구입니다. 평소엔 거의 0이고, 시험 삼아 쓰는 소액을 넘어 1십억 달러 이상 쓰이기 시작하면 시장에서 돈을 구하기 어려워진 기관이 있다는 신호일 수 있습니다.",
      },
      {
        key: "discount-window",
        order: 5,
        href: "/observatory/discount-window",
        name: "재할인 창구 대출 잔액",
        oneLiner:
          "은행들의 최후 비상구입니다. 낙인 때문에 평시엔 거의 안 쓰는 창구라, 잔액이 급증하는 일 자체가 드뭅니다.",
      },
    ],
  },
  {
    id: "banks",
    number: 2,
    name: "가맹점들: 은행의 금고 엑스레이",
    shortName: "가맹점들",
    subtitle:
      "개별 은행이 아니라 은행업 전체의 체질을 봅니다. 2023년 SVB 사태 때 문제가 된 약점들이 업계 전체에 얼마나 쌓여 있는지 봅니다.",
    chainNote:
      "관측소 1이 시스템 전체의 현금을 잰다면, 여기는 그 돈을 굴리는 은행들의 몸 상태를 봅니다",
    source: "연준 이사회(Z.1·H.8·대출 연체율, FRED 경유) · FDIC 분기 은행실적보고서(QBP)",
    indicators: [
      {
        key: "unrealized-losses",
        order: 1,
        href: "/observatory/unrealized-losses",
        name: "채권 미실현손실 비율",
        oneLiner:
          "은행이 아직 팔지 않은 채권에 숨어 있는 손실을 자기자본으로 나눈 값입니다. 뱅크런이 오면 이 유령이 실물이 되어 자본을 갉아먹습니다.",
      },
      {
        key: "fhlb",
        order: 2,
        href: "/observatory/fhlb",
        name: "FHLB 차입 잔액",
        oneLiner:
          "은행이 연준 창구보다 먼저, 낙인 없이 조용히 쓰는 자금줄입니다. 차입이 갑자기 늘면 목이 마르기 시작했다는 뜻입니다.",
      },
      {
        key: "deposit-flight",
        order: 3,
        href: "/observatory/deposit-flight",
        name: "예금 유출",
        oneLiner:
          "예금이 소형 은행에서 대형으로 옮겨가는 흐름과, 그 예금 중 보험 밖에 있는 돈의 비중을 함께 봅니다.",
      },
      {
        key: "cre",
        order: 4,
        href: "/observatory/cre",
        name: "상업용 부동산 익스포저",
        oneLiner:
          "연체율은 대형은행이 높고 집중도는 지역은행이 훨씬 높습니다. 아픈 곳과 물린 곳이 다릅니다.",
      },
    ],
  },
  {
    // ⚠ id 는 지표 슬러그(basis-trade 등)와 겹치면 안 된다 — 아래 검사가 막는다
    id: "shadow-banking",
    number: 3,
    name: "그림자금융: 은행 밖의 레버리지",
    shortName: "그림자금융",
    subtitle:
      "은행이 아닌 곳에서 빌린 돈으로 크게 굴리는 거래를 봅니다. 규제 밖이라 잘 보이지 않고, 흔들리면 한꺼번에 몰려 나옵니다.",
    chainNote:
      "관측소 2가 은행의 몸 상태를 본다면, 여기는 은행 밖에서 레버리지를 쓰는 곳을 봅니다. 지금은 국채 베이시스 트레이드, 은행의 비예금 금융기관 대출, 헤지펀드 자금조달 조건 세 가지를 봅니다. 사모신용의 현물 이자(PIK)는 일관된 공시 자료를 만들 수 없어 넣지 않았습니다",
    source:
      "CFTC Traders in Financial Futures (Futures Only) · 연방준비제도 H.8 (FRED) · 연준 SCOOS",
    indicators: [
      {
        key: "basis-trade",
        order: 1,
        href: "/observatory/basis-trade",
        name: "국채 베이시스 트레이드 (대리 지표)",
        oneLiner:
          "헤지펀드가 국채 선물을 판 규모입니다. 현물과 선물의 가격 차이를 노리는 레버리지 거래가 얼마나 쌓였는지 짐작해 봅니다.",
      },
      {
        key: "nbfi-loans",
        order: 2,
        href: "/observatory/nbfi-loans",
        name: "은행의 비예금 금융기관 대출",
        oneLiner:
          "은행이 사모펀드·보험사·헤지펀드 같은 은행 아닌 금융회사에 빌려준 돈입니다. 그림자금융에 대한 은행의 노출이 얼마나 빠르게 커지는지 봅니다.",
      },
      {
        key: "scoos-hedge-fund",
        order: 3,
        href: "/observatory/scoos-hedge-fund",
        name: "헤지펀드 자금조달 조건 (레포 헤어컷 대리)",
        oneLiner:
          "딜러들이 헤지펀드에 돈을 빌려줄 때 헤어컷 같은 담보 조건을 조였는지 묻는 연준 설문의 응답 비율입니다. 헤어컷 숫자가 아니라 대리 지표입니다.",
      },
    ],
  },
  {
    // ⚠ id 는 지표 슬러그와 겹치면 안 된다 — 아래 검사가 막는다
    id: "treasury-market",
    number: 4,
    name: "국채시장: 세계 담보의 체력",
    shortName: "국채시장",
    subtitle:
      "미국 국채는 세계 금융이 담보로 쓰는 자산입니다. 사려는 사람이 줄거나 값이 크게 흔들리면, 다른 시장이 기대는 바닥이 흔들립니다.",
    chainNote:
      "새 국채를 누가 사 가는지(입찰), 값이 얼마나 흔들리는지(변동성), 해외에서 계속 사 주는지(해외 보유) 순서로 봅니다. 딜러가 얼마나 떠안는지(딜러 보유)도 함께 봅니다. 입찰 테일·시장 심도·MOVE 원지수는 무료 공개 출처가 없어 넣지 않았습니다",
    source: "미 재무부 Fiscal Data(입찰 결과) · FRED DGS10(연준 H.15) · 미 재무부 TIC · 뉴욕 연은 딜러 통계",
    indicators: [
      {
        key: "auction-bid-to-cover",
        order: 1,
        href: "/observatory/auction-bid-to-cover",
        name: "국채 입찰 응찰 배율",
        oneLiner:
          "새로 파는 국채에 사겠다는 돈이 얼마나 몰렸는지입니다. 같은 만기의 평소보다 크게 낮으면 수요가 약해졌다는 뜻입니다.",
      },
      {
        key: "auction-dealer-share",
        order: 2,
        href: "/observatory/auction-dealer-share",
        name: "입찰 프라이머리 딜러 인수 비중",
        oneLiner:
          "입찰에 꼭 참여해야 하는 프라이머리 딜러가 가져간 몫입니다. 같은 만기의 평소보다 크게 높으면 최종 투자자가 덜 사 갔을 수 있다는 뜻입니다.",
      },
      {
        key: "rate-volatility",
        order: 3,
        href: "/observatory/rate-volatility",
        name: "10년물 금리 변동성 (MOVE 대리)",
        oneLiner:
          "10년 국채 금리가 최근 20영업일 동안 하루에 얼마나 흔들렸는지입니다. 옵션 가격에 담긴 MOVE 지수가 아니라 실제로 움직인 폭입니다.",
      },
      {
        key: "foreign-holdings",
        order: 4,
        href: "/observatory/foreign-holdings",
        name: "해외 보유 국채",
        oneLiner:
          "외국이 가진 미국 국채의 합계입니다. 1년 전보다 크게 줄면 해외 수요가 빠진다는 뜻이지만, 가격이 떨어지기만 해도 줄어듭니다.",
      },
      {
        key: "dealer-treasury-positions",
        order: 5,
        href: "/observatory/dealer-treasury-positions",
        name: "프라이머리 딜러 국채 보유",
        oneLiner:
          "국채를 받아 주는 프라이머리 딜러들이 4주 동안 국채를 얼마나 더 떠안았는지입니다. 짧은 기간에 크게 늘면 최종 투자자가 덜 사고 있다는 뜻일 수 있습니다.",
      },
    ],
  },
  {
    // id 는 지표 슬러그(gz-spread 등)와 겹치지 않게 짓는다 (assertCatalogIsSane)
    id: "credit-wall",
    number: 5,
    name: "신용의 벽: 빌린 돈을 갚을 수 있는가",
    shortName: "신용의 벽",
    subtitle:
      "회사들이 빚을 얼마나 비싸게 빌리는지, 실제로 못 갚는 일이 늘고 있는지 봅니다. 돈줄이 막히면 가장 약한 회사부터 무너집니다.",
    chainNote:
      "시장이 먼저 웃돈 이자를 올리고(신용 스프레드), 시간이 지나 실제 손실이 장부에 잡히는(상각률) 순서로 봅니다. 하이일드·CCC 원지수는 데이터 제공사의 사전 서면 승인 없이는 공개할 수 없게 돼 있어, 만기 벽(앞으로 갚아야 할 회사채 규모)은 무료 공개 출처가 없어 넣지 않았습니다",
    source: "연준 이사회 GZ 신용 스프레드 · FRED CORBLACBS(연준)",
    indicators: [
      {
        key: "gz-spread",
        order: 1,
        href: "/observatory/gz-spread",
        name: "회사채 신용 스프레드 (하이일드 대리)",
        oneLiner:
          "미국 기업 회사채가 같은 만기의 국채보다 이자를 얼마나 더 주는지입니다. 투자자가 부도를 걱정할수록 넓어집니다. 하이일드 지수 대신 쓰는 연준 공개 자료입니다.",
      },
      {
        key: "business-chargeoffs",
        order: 2,
        href: "/observatory/business-chargeoffs",
        name: "기업대출 상각률 (부도율 대리)",
        oneLiner:
          "미국 은행이 기업대출을 못 받을 돈으로 보고 털어 낸 비율입니다. 회사채 부도율 대신 쓰는 대리 지표라 실제 부도보다 늦게 움직입니다.",
      },
    ],
  },
  {
    // id 는 지표 슬러그(ai-capex)와 겹치지 않게 짓는다 (assertCatalogIsSane)
    id: "new-nodes",
    number: 6,
    name: "신참 결절점: 새로 커진 돈의 매듭",
    shortName: "신참 결절점",
    subtitle:
      "지난 위기 때는 없었거나 작았던 곳에 돈이 빠르게 몰리고 있습니다. 처음 겪는 곳이라 무엇이 약한지 아직 아무도 모릅니다.",
    chainNote:
      "지금은 AI 데이터센터에 몰리는 대형 기술기업 설비투자 하나를 봅니다. 관련 회사채 스프레드와 전력·설비 계약 취소는 무료 정형 자료를 찾지 못해서, 스테이블코인 발행 잔액·디페그·준비금 구성은 다시 실어도 되는 무료 출처를 확인하지 못해서 넣지 않았습니다",
    source: "미국 증권거래위원회(SEC) XBRL 공시",
    indicators: [
      {
        key: "ai-capex",
        order: 1,
        href: "/observatory/ai-capex",
        name: "AI 설비투자 (대형 기술기업 5곳)",
        oneLiner:
          "마이크로소프트·알파벳·아마존·메타·오라클의 분기 설비투자 합계가 1년 전보다 얼마나 빨리 늘었는지입니다. AI에만 쓴 돈이 아니라 설비투자 전체라 대리 지표입니다.",
      },
    ],
  },
];

/* ────────────────────────────────────────────────────────────
 * 슬러그 충돌 검사
 *
 * 섹션 URL(/observatory/plumbing)과 지표 URL(/observatory/rrp)이 같은
 * 네임스페이스를 쓴다. Next.js 는 정적 세그먼트를 동적([section])보다 먼저
 * 매칭하므로, 섹션 id 를 지표 슬러그와 같게 지으면 **그 섹션 페이지가 영원히
 * 안 뜨는데 에러도 안 난다** — 전형적인 무음 실패다.
 * 그래서 모듈이 로드되는 순간 터뜨린다 (빌드/dev 첫 요청에서 바로 잡힌다).
 * ──────────────────────────────────────────────────────────── */
function assertCatalogIsSane(sections: ObservatorySectionMeta[]): void {
  const indicatorSlugs = new Map<string, string>(); // 슬러그 → 지표 key
  const indicatorKeys = new Set<string>();
  const sectionIds = new Set<string>();

  for (const section of sections) {
    if (sectionIds.has(section.id)) {
      throw new Error(`[observatory-catalog] 섹션 id 중복: "${section.id}"`);
    }
    sectionIds.add(section.id);

    for (const ind of section.indicators) {
      if (indicatorKeys.has(ind.key)) {
        throw new Error(`[observatory-catalog] 지표 key 중복: "${ind.key}"`);
      }
      indicatorKeys.add(ind.key);

      const slug = ind.href.replace(/^\/observatory\//, "");
      const dup = indicatorSlugs.get(slug);
      if (dup) {
        throw new Error(
          `[observatory-catalog] 지표 URL 중복: "${ind.href}" (${dup} / ${ind.key})`
        );
      }
      indicatorSlugs.set(slug, ind.key);
    }
  }

  for (const id of sectionIds) {
    const clash = indicatorSlugs.get(id);
    if (clash) {
      throw new Error(
        `[observatory-catalog] 섹션 id "${id}" 가 지표 "${clash}" 의 URL 과 겹칩니다. ` +
          `Next.js 가 정적 경로를 먼저 매칭해 /observatory/${id} 섹션 페이지가 뜨지 않습니다. ` +
          `섹션 id 를 다른 이름으로 바꾸세요.`
      );
    }
  }
}

/*
 * ⚠ 이 호출을 `if (process.env.NODE_ENV !== "production")` 로 감싸지 말 것.
 *   `next build` 는 NODE_ENV=production 으로 돌기 때문에, 그렇게 감싸면 정작
 *   빌드에서 검사가 꺼진다 — 충돌을 빌드에서 잡는다는 목적이 통째로 사라진다.
 *   지금처럼 최상위에서 부르면 레이아웃(navbar)이 이 모듈을 쓰는 덕에 빌드가
 *   실패하고, 잘못된 슬러그가 배포까지 가지 못한다.
 *
 *   대가는 클라이언트 번들에 검사 함수가 같이 실리는 것뿐이다. 섹션 6개 ·
 *   지표 20개를 훑는 루프라 실행 비용은 사실상 0이고, 조용히 안 뜨는 페이지를
 *   막는 값으로는 싸다.
 */
assertCatalogIsSane(OBSERVATORY_SECTIONS);

/* ────────────────────────────────────────────────────────────
 * 조회 헬퍼 — 번호·URL 조립을 한 곳에 모은다
 * ──────────────────────────────────────────────────────────── */

/** 섹션 URL. 번호가 아니라 슬러그를 쓴다 */
export function sectionHref(section: ObservatorySectionMeta): string {
  return `/observatory/${section.id}`;
}

/** 전체 제목 — "관측소 1 — 배관: 자금시장의 수압계" */
export function sectionTitle(section: ObservatorySectionMeta): string {
  return `관측소 ${section.number} — ${section.name}`;
}

/** 짧은 제목 — "관측소 1 — 배관" (브레드크럼 등 좁은 자리) */
export function sectionShortTitle(section: ObservatorySectionMeta): string {
  return `관측소 ${section.number} — ${section.shortName}`;
}

export function findSection(id: string): ObservatorySectionMeta | undefined {
  return OBSERVATORY_SECTIONS.find((s) => s.id === id);
}

/** 지표가 어느 섹션 소속인지 되찾는다 (브레드크럼이 쓴다) */
export function findIndicator(
  key: ObservatoryIndicatorKey
): { section: ObservatorySectionMeta; indicator: ObservatoryIndicatorMeta } | undefined {
  for (const section of OBSERVATORY_SECTIONS) {
    const indicator = section.indicators.find((i) => i.key === key);
    if (indicator) return { section, indicator };
  }
  return undefined;
}

/** 카탈로그에 등록된 모든 지표 key */
export function allIndicatorKeys(): ObservatoryIndicatorKey[] {
  return OBSERVATORY_SECTIONS.flatMap((s) => s.indicators.map((i) => i.key));
}

/* ────────────────────────────────────────────────────────────
 * 상태 요약 공용 타입
 *
 * 섹션별 요약 **문장**은 성격이 달라 일반화하지 않는다
 * (app/observatory/summaries.ts 의 레지스트리 참고).
 * 여기에는 어느 섹션에서나 같은 뜻인 "가장 나쁜 상태" 만 둔다.
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
