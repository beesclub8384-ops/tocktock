// 켄 피셔 페이지 해설용 주요 시장 사건 (가격·PER 변동이 두드러진 시점)
export interface MarketEvent {
  date: string; // YYYY-MM
  label: string;
  detail: string;
}

export const KEN_FISHER_EVENTS: MarketEvent[] = [
  {
    date: "1987-10",
    label: "블랙먼데이",
    detail:
      "1987년 10월 19일 S&P 500이 하루에 -20.5% 폭락. 당시 지수 PER은 ~17로 높지 않았지만 포트폴리오 보험(프로그램 매매) 연쇄가 폭락을 증폭.",
  },
  {
    date: "2000-03",
    label: "닷컴버블 정점",
    detail:
      "나스닥 100이 2000년 3월 기준 PER 80~100배 영역까지 확장. S&P 500도 PER 29 근처. 이후 2년간 나스닥 -78%, S&P -49% 조정.",
  },
  {
    date: "2008-09",
    label: "글로벌 금융위기",
    detail:
      "리먼 파산(2008.9.15) 이후 가격은 급락했으나, EPS도 동반 하락해 PER은 한때 오히려 상승 후 2009년 초 15 이하로 정상화.",
  },
  {
    date: "2020-03",
    label: "코로나 폭락",
    detail:
      "2020년 2~3월 S&P -34%, 나스닥 100 -30%. 유동성 공급(연준 무제한 QE)으로 빠르게 반등, 2020년 말 PER은 역사적 고점(S&P ~30, NDX ~38)으로 확장.",
  },
];
