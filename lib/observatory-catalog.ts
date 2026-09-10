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
 *   이 파일은 그것들을 알지 못한다. (한 줄 설명이 상세 페이지 헤더와
 *   어긋나지 않도록, 문구는 각 상세 페이지 헤더에서 그대로 가져왔다)
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
  | "discount-window";

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
 *   대가는 클라이언트 번들에 검사 함수가 같이 실리는 것뿐이다. 섹션 1개 ·
 *   지표 5개를 훑는 루프라 실행 비용은 사실상 0이고, 조용히 안 뜨는 페이지를
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
