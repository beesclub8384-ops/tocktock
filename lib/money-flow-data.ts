// ---------------------------------------------------------------------------
// 돈의 흐름 지표 — 타입 정의, 주체 메타 정보, 폴백 목업, 머지 로직
// ---------------------------------------------------------------------------

import {
  Landmark,
  Building2,
  Target,
  Cpu,
  Scale,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export interface Indicator {
  name: string;
  value: string;
  change: number; // 양수 = 상승, 음수 = 하락, 0 = 보합
  description: string;
}

export interface Player {
  id: string;
  name: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  roleSummary: string;
  intention: string;
  beginnerExplanation: string;
  indicators: [Indicator, Indicator, Indicator];
}

export interface FlowNode {
  playerId: string;
  status: "active" | "waiting" | "dim";
  statusText: string;
}

export interface FlowArrow {
  from: string;
  to: string;
  label: string;
}

export interface AiAnalysis {
  summary: string;
  flowNodes: FlowNode[];
  flowArrows: FlowArrow[];
  detail: string;
  tags: string[];
  updatedAt: string;
}

/** API 라우트에서 반환하는 전체 응답 타입 */
export interface MoneyFlowApiResponse {
  players: PlayerData[];
  summary: SummaryIndicator[];
  fetchedAt: string;
}

/** API에서 반환하는 주체별 데이터 (아이콘 제외 직렬화 가능) */
export interface PlayerData {
  id: string;
  indicators: [Indicator, Indicator, Indicator];
}

/** 상단 종합 지표 */
export interface SummaryIndicator {
  id: string;
  label: string;
  value: string;
  change: number;
}

// ---------------------------------------------------------------------------
// 7개 주체 메타 정보 (UI 전용 — 아이콘, 색상, 텍스트)
// ---------------------------------------------------------------------------

export interface PlayerMeta {
  id: string;
  name: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  roleSummary: string;
  intention: string;
  beginnerExplanation: string;
  /** 지표 이름과 설명 (값은 API에서 채워짐) */
  indicatorMeta: [IndicatorMeta, IndicatorMeta, IndicatorMeta];
}

interface IndicatorMeta {
  name: string;
  description: string;
}

export const PLAYER_META: PlayerMeta[] = [
  {
    id: "fed",
    name: "중앙은행 (Fed)",
    subtitle: "Federal Reserve · FOMC",
    icon: Landmark,
    color: "blue",
    roleSummary: "금리를 정하고 돈의 양을 조절하는 최상위 기관",
    intention:
      "물가 안정과 고용 극대화. 현실적으로는 정부 요구와 금융 시스템 안정 사이에서 줄타기",
    beginnerExplanation:
      "중앙은행은 돈의 가격(금리)을 정하는 곳입니다. 금리가 낮으면 돈을 빌리기 쉬워져 시장에 돈이 풀리고, 금리가 높으면 돈이 줄어듭니다. 모든 투자의 출발점이라고 보면 됩니다.",
    indicatorMeta: [
      { name: "기준금리 (Fed Funds Rate)", description: "돈의 가격. 낮을수록 시장에 돈이 풀린다" },
      { name: "Fed 대차대조표", description: "중앙은행이 실제로 시중에 푼 돈의 총량" },
      { name: "FOMC 점도표", description: "앞으로 금리를 어떻게 할지 보여주는 힌트" },
    ],
  },
  {
    id: "institutions",
    name: "대형 금융기관",
    subtitle: "BlackRock · Vanguard · JPMorgan",
    icon: Building2,
    color: "purple",
    roleSummary: "실제로 수백조 달러를 움직이는 자금의 실행자",
    intention: "수익 극대화. 돈이 가장 많이 불어나는 곳으로 자금을 이동",
    beginnerExplanation:
      "블랙록, 뱅가드 같은 대형 금융사는 수백조 원의 자금을 운용합니다. 이들이 어디에 돈을 넣느냐에 따라 시장이 움직입니다. 개인의 연금, 보험금도 결국 이들이 굴립니다.",
    indicatorMeta: [
      { name: "13F 보고서", description: "대형 기관들이 분기마다 '뭘 샀는지' SEC에 공개하는 서류" },
      { name: "SOFR 금리", description: "금융기관끼리 돈을 빌려주는 금리. 급등하면 기관끼리도 불안하다는 뜻" },
      { name: "신용 스프레드", description: "국채와 회사채의 금리 차이. 벌어지면 불안, 좁으면 안심" },
    ],
  },
  {
    id: "hedgefunds",
    name: "투기 자본 · 헤지펀드",
    subtitle: "Citadel · Bridgewater · DE Shaw",
    icon: Target,
    color: "red",
    roleSummary: "시장의 약점이나 불균형을 찾아 고수익 베팅을 하는 세력",
    intention: "비대칭 수익. 남들이 무서워할 때 뛰어들고, 시장의 약점을 찾아 공격",
    beginnerExplanation:
      "헤지펀드는 '양쪽 다 베팅'하는 투자자입니다. 주가가 올라도, 떨어져도 수익을 낼 수 있는 전략을 씁니다. 이들의 움직임은 시장의 방향을 미리 알려주는 신호가 될 수 있습니다.",
    indicatorMeta: [
      { name: "공매도 비율 (Short Interest)", description: "특정 자산에 '떨어질 거다'라고 베팅한 비율" },
      { name: "COT 보고서 (CFTC)", description: "선물 시장에서 투기 세력이 어느 방향에 베팅하는지 보여줌" },
      { name: "VIX 지수 (공포 지수)", description: "시장의 공포 수준. 30 이상이면 극도의 공포, 20 이하면 안정" },
    ],
  },
  {
    id: "bigtech",
    name: "대형 기업 (빅테크)",
    subtitle: "Apple · NVIDIA · Microsoft",
    icon: Cpu,
    color: "cyan",
    roleSummary: "수조 달러의 시가총액으로 시장 전체의 방향을 좌우하는 기업들",
    intention: "주주 가치 극대화와 시장 지배력 확대",
    beginnerExplanation:
      "애플, 엔비디아 같은 빅테크 기업은 너무 커서 이들의 실적 하나가 시장 전체를 움직입니다. S&P 500의 약 30%가 빅테크 7개 종목이에요. 이들의 투자 방향이 곧 미래 산업의 방향입니다.",
    indicatorMeta: [
      { name: "실적 발표 (Earnings)", description: "분기마다 나오는 매출, 이익, 전망. 주가를 직접 움직이는 핵심" },
      { name: "설비투자 CAPEX", description: "기업이 공장, 연구소, 장비에 얼마를 쓰는지. 미래 투자 방향" },
      { name: "자사주 매입", description: "기업이 자기 주식을 사들여 주가를 떠받치는 것" },
    ],
  },
  {
    id: "government",
    name: "정부 (재정정책)",
    subtitle: "백악관 · 재무부 · 의회",
    icon: Scale,
    color: "amber",
    roleSummary: "세금, 재정지출, 규제로 돈의 흐름 방향을 결정하는 정치적 주체",
    intention: "정치적 목표 달성과 경기 부양. 영향력은 넓지만 실행은 느림",
    beginnerExplanation:
      "정부는 세금을 걷고, 예산을 쓰고, 법을 만듭니다. 예를 들어 반도체 보조금법 하나로 수백조 원이 특정 산업에 쏟아집니다. 정책 방향을 아는 것이 투자의 큰 그림을 보는 핵심입니다.",
    indicatorMeta: [
      { name: "재정적자 / 국가부채", description: "정부가 번 것보다 얼마나 더 쓰는지. 적자가 크면 국채 발행 증가" },
      { name: "고용 지표 (Non-Farm Payroll)", description: "매월 첫째 금요일 발표. 정부 정책의 결과가 가장 직접 나타남" },
      { name: "규제·법안 동향", description: "관세, 세금, 산업 규제 변화. 수천억 달러의 흐름을 바꿀 수 있음" },
    ],
  },
  {
    id: "regulators",
    name: "규제기관",
    subtitle: "SEC · FTC · CFTC",
    icon: Shield,
    color: "emerald",
    roleSummary: "금융 시장의 규칙을 정하고, 문을 열거나 닫는 심판",
    intention: "금융 시스템 안정과 공정성 유지",
    beginnerExplanation:
      "SEC(증권거래위원회)는 주식시장의 심판입니다. 내부자거래를 잡고, 새로운 금융상품을 허가하거나 막습니다. 비트코인 ETF가 승인된 것도, 대형 합병이 막힌 것도 규제기관 결정입니다.",
    indicatorMeta: [
      { name: "금융 규제 변화", description: "자본 요건, 공매도 규제 등 게임의 규칙을 바꾸는 결정" },
      { name: "반독점 / 기업 조사", description: "대형 기업을 직접 견제하는 수단. 조사 소식만으로 주가 변동" },
      { name: "외환 개입", description: "환율을 직접 건드리는 것. 수출입 기업 전체에 영향" },
    ],
  },
  {
    id: "retail",
    name: "개인 투자자",
    subtitle: "Robinhood · r/wallstreetbets · 401(k)",
    icon: Users,
    color: "orange",
    roleSummary: "한 명의 힘은 작지만, 수가 가장 많아 뭉치면 시장을 흔드는 우리",
    intention: "자산 보전과 부의 축적. 뭉치면 강하다",
    beginnerExplanation:
      "바로 여러분입니다! 한 사람의 100만 원은 적지만, 개인 투자자 전체가 움직이면 시장을 뒤흔들 수 있어요. 2021년 게임스탑 사태가 대표적이죠. 개인의 심리와 행동 패턴도 중요한 지표입니다.",
    indicatorMeta: [
      { name: "소비자 신뢰지수", description: "개인들이 '경제가 좋다/나쁘다'고 느끼는 정도" },
      { name: "가계부채 비율", description: "개인들이 얼마나 빚을 지고 있는지. 추가 투자 여력의 척도" },
      { name: "개인 매매 동향 (Retail Flow)", description: "개인들이 뭘 사고 파는지 보여주는 데이터" },
    ],
  },
];

// ---------------------------------------------------------------------------
// 주체 색상 매핑 (Tailwind 클래스용)
// ---------------------------------------------------------------------------

export const PLAYER_COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  blue:    { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/30",    accent: "bg-blue-500" },
  purple:  { bg: "bg-purple-500/10",  text: "text-purple-400",  border: "border-purple-500/30",  accent: "bg-purple-500" },
  red:     { bg: "bg-red-500/10",     text: "text-red-400",     border: "border-red-500/30",     accent: "bg-red-500" },
  cyan:    { bg: "bg-cyan-500/10",    text: "text-cyan-400",    border: "border-cyan-500/30",    accent: "bg-cyan-500" },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/30",   accent: "bg-amber-500" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", accent: "bg-emerald-500" },
  orange:  { bg: "bg-orange-500/10",  text: "text-orange-400",  border: "border-orange-500/30",  accent: "bg-orange-500" },
};

// ---------------------------------------------------------------------------
// 폴백 목업 데이터 (API 실패 시 사용)
// ---------------------------------------------------------------------------

export const FALLBACK_PLAYERS: PlayerData[] = [
  {
    id: "fed",
    indicators: [
      { name: "기준금리 (Fed Funds Rate)", value: "4.50%", change: 0, description: "돈의 가격. 낮을수록 시장에 돈이 풀린다" },
      { name: "Fed 대차대조표", value: "$6.81T", change: -0.3, description: "중앙은행이 실제로 시중에 푼 돈의 총량" },
      { name: "FOMC 점도표", value: "연내 2회 인하 전망", change: 1, description: "앞으로 금리를 어떻게 할지 보여주는 힌트" },
    ],
  },
  {
    id: "institutions",
    indicators: [
      { name: "13F 보고서", value: "빅테크 비중 확대", change: 1, description: "대형 기관들이 분기마다 '뭘 샀는지' SEC에 공개하는 서류" },
      { name: "SOFR 금리", value: "4.55%", change: -0.02, description: "금융기관끼리 돈을 빌려주는 금리. 급등하면 기관끼리도 불안하다는 뜻" },
      { name: "신용 스프레드", value: "1.12%p", change: -0.05, description: "국채와 회사채의 금리 차이. 벌어지면 불안, 좁으면 안심" },
    ],
  },
  {
    id: "hedgefunds",
    indicators: [
      { name: "공매도 비율 (Short Interest)", value: "S&P 500: 2.3%", change: 0.2, description: "특정 자산에 '떨어질 거다'라고 베팅한 비율" },
      { name: "COT 보고서 (CFTC)", value: "투기적 롱 우위", change: 1, description: "선물 시장에서 투기 세력이 어느 방향에 베팅하는지 보여줌" },
      { name: "VIX 지수 (공포 지수)", value: "18.2", change: -2.1, description: "시장의 공포 수준. 30 이상이면 극도의 공포, 20 이하면 안정" },
    ],
  },
  {
    id: "bigtech",
    indicators: [
      { name: "실적 발표 (Earnings)", value: "AI 관련 매출 급증", change: 1, description: "분기마다 나오는 매출, 이익, 전망. 주가를 직접 움직이는 핵심" },
      { name: "설비투자 CAPEX", value: "$78B (전분기 대비 +15%)", change: 1, description: "기업이 공장, 연구소, 장비에 얼마를 쓰는지. 미래 투자 방향" },
      { name: "자사주 매입", value: "$42B (분기)", change: 0.5, description: "기업이 자기 주식을 사들여 주가를 떠받치는 것" },
    ],
  },
  {
    id: "government",
    indicators: [
      { name: "재정적자 / 국가부채", value: "$35.9T (GDP 대비 123%)", change: 0.8, description: "정부가 번 것보다 얼마나 더 쓰는지. 적자가 크면 국채 발행 증가" },
      { name: "고용 지표 (Non-Farm Payroll)", value: "+175K (전월 대비)", change: -0.3, description: "매월 첫째 금요일 발표. 정부 정책의 결과가 가장 직접 나타남" },
      { name: "규제·법안 동향", value: "관세 확대 기조", change: -1, description: "관세, 세금, 산업 규제 변화. 수천억 달러의 흐름을 바꿀 수 있음" },
    ],
  },
  {
    id: "regulators",
    indicators: [
      { name: "금융 규제 변화", value: "자본 요건 완화 논의", change: 1, description: "자본 요건, 공매도 규제 등 게임의 규칙을 바꾸는 결정" },
      { name: "반독점 / 기업 조사", value: "빅테크 AI 반독점 조사 진행 중", change: -0.5, description: "대형 기업을 직접 견제하는 수단. 조사 소식만으로 주가 변동" },
      { name: "외환 개입", value: "일본 BOJ 구두개입 주시", change: 0, description: "환율을 직접 건드리는 것. 수출입 기업 전체에 영향" },
    ],
  },
  {
    id: "retail",
    indicators: [
      { name: "소비자 신뢰지수", value: "98.3", change: -2.5, description: "개인들이 '경제가 좋다/나쁘다'고 느끼는 정도" },
      { name: "가계부채 비율", value: "GDP 대비 75.2%", change: 0.3, description: "개인들이 얼마나 빚을 지고 있는지. 추가 투자 여력의 척도" },
      { name: "개인 매매 동향 (Retail Flow)", value: "AI·반도체 순매수 집중", change: 1, description: "개인들이 뭘 사고 파는지 보여주는 데이터" },
    ],
  },
];

// ---------------------------------------------------------------------------
// 머지: PlayerMeta + PlayerData → Player (UI 렌더링용)
// ---------------------------------------------------------------------------

export function mergePlayers(apiData: PlayerData[]): Player[] {
  return PLAYER_META.map((meta) => {
    const data = apiData.find((d) => d.id === meta.id);
    const fallback = FALLBACK_PLAYERS.find((d) => d.id === meta.id)!;
    const indicators = data?.indicators ?? fallback.indicators;

    return {
      id: meta.id,
      name: meta.name,
      subtitle: meta.subtitle,
      icon: meta.icon,
      color: meta.color,
      roleSummary: meta.roleSummary,
      intention: meta.intention,
      beginnerExplanation: meta.beginnerExplanation,
      indicators,
    };
  });
}

// ---------------------------------------------------------------------------
// 목업 AI 분석 데이터 (API 폴백용)
// ---------------------------------------------------------------------------

export const MOCK_ANALYSIS: AiAnalysis = {
  summary:
    "중앙은행의 금리 인하 기대가 대형 금융기관과 빅테크로 자금을 끌어들이고 있으며, 개인 투자자는 AI 테마에 집중하고 있습니다.",
  flowNodes: [
    { playerId: "fed", status: "active", statusText: "인하 시그널 강화" },
    { playerId: "institutions", status: "active", statusText: "위험자산 비중 확대 중" },
    { playerId: "hedgefunds", status: "waiting", statusText: "방향성 관망" },
    { playerId: "bigtech", status: "active", statusText: "AI CAPEX 폭증" },
    { playerId: "government", status: "waiting", statusText: "관세 정책 불확실" },
    { playerId: "regulators", status: "dim", statusText: "주요 변화 없음" },
    { playerId: "retail", status: "active", statusText: "AI 테마 순매수" },
  ],
  flowArrows: [
    { from: "fed", to: "institutions", label: "유동성 공급" },
    { from: "institutions", to: "bigtech", label: "자금 유입" },
    { from: "bigtech", to: "retail", label: "테마 확산" },
    { from: "government", to: "fed", label: "정책 압력" },
  ],
  detail: `## 현재 돈의 흐름 종합 분석

**중앙은행(Fed)이 올해 안에 금리를 2회 인하할 것이라는 기대가 커지고 있습니다.** 이 기대감이 대형 금융기관들의 행동을 바꾸고 있는데요. 블랙록, 뱅가드 등이 최근 13F 보고서에서 빅테크 비중을 눈에 띄게 늘렸습니다.

특히 주목할 점은 **AI 관련 설비투자(CAPEX)가 전분기 대비 15% 급증**했다는 것입니다. 엔비디아, 마이크로소프트, 구글 등이 AI 인프라에 막대한 자금을 쏟아붓고 있어요. 이 돈은 결국 반도체, 데이터센터, 전력 인프라로 흘러갑니다.

### 주체별 움직임

- **중앙은행**: 물가가 잡히면서 인하 여건이 무르익고 있습니다. 대차대조표는 여전히 축소 중이지만 속도가 느려졌습니다.
- **대형 금융기관**: SOFR 금리 안정 + 신용 스프레드 축소로 기관 간 자금 흐름이 원활합니다. 위험자산 선호도가 높아지는 신호입니다.
- **헤지펀드**: VIX가 18대로 안정적이지만, COT 보고서상 투기적 롱 포지션이 쌓이고 있어 방향 전환 시 변동성이 클 수 있습니다.
- **빅테크**: 실적 호조 + AI 투자 확대. 자사주 매입도 분기 $42B 규모로 주가 하방을 받치고 있습니다.
- **정부**: 관세 확대 기조가 불확실성을 키우고 있습니다. 고용은 둔화 추세지만 아직 견조합니다.
- **규제기관**: 자본 요건 완화 논의는 긍정적이나, AI 반독점 조사가 빅테크 리스크 요인입니다.
- **개인 투자자**: AI·반도체 테마에 자금이 집중되고 있습니다. 소비자 신뢰지수 하락은 실물경제 둔화 우려 신호입니다.

### 개인 투자자가 주목할 포인트

1. **금리 인하 수혜주에 주목하세요.** 금리가 내리면 성장주(빅테크)와 부동산, 채권 가격이 오를 수 있습니다.
2. **AI 테마가 과열인지 점검하세요.** 실제 매출로 이어지는 기업과 '이름만 AI'인 기업을 구분해야 합니다.
3. **관세 리스크를 무시하지 마세요.** 수출 비중이 높은 한국 기업에 직접 영향을 줍니다.

### ⚠️ 주의 신호

- 소비자 신뢰지수 하락: 개인 소비 둔화 → 기업 실적 악화 가능성
- 헤지펀드 롱 포지션 과다 집중: 포지션 청산 시 급락 가능
- 관세 정책 불확실성: 글로벌 공급망 교란 리스크

*본 분석은 참고용이며 투자 권유가 아닙니다.*`,
  tags: [
    "금리 인하 기대",
    "AI CAPEX 급증",
    "빅테크 자금 집중",
    "관세 불확실성",
    "VIX 안정",
    "소비자 신뢰 하락",
  ],
  updatedAt: new Date().toISOString(),
};
