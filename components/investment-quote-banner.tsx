"use client";

import { useMemo } from "react";

const INVESTMENT_QUOTES: { quote: string; author: string }[] = [
  // 워런 버핏 (Warren Buffett) — 20개
  { quote: "다른 사람이 탐욕스러울 때 두려워하고, 다른 사람이 두려워할 때 탐욕스러워라.", author: "워런 버핏" },
  { quote: "주식시장은 인내심 없는 사람의 돈을 인내심 있는 사람에게 옮기는 장치다.", author: "워런 버핏" },
  { quote: "10년간 보유할 주식이 아니라면 10분도 보유하지 마라.", author: "워런 버핏" },
  { quote: "가격은 당신이 지불하는 것이고, 가치는 당신이 얻는 것이다.", author: "워런 버핏" },
  { quote: "리스크는 자신이 무엇을 하고 있는지 모르는 데서 온다.", author: "워런 버핏" },
  { quote: "훌륭한 기업을 적정한 가격에 사는 것이 적정한 기업을 훌륭한 가격에 사는 것보다 낫다.", author: "워런 버핏" },
  { quote: "분산투자는 무지에 대한 보호책이다. 자신이 무엇을 하는지 아는 사람에게는 의미가 없다.", author: "워런 버핏" },
  { quote: "우리가 가장 좋아하는 보유 기간은 영원이다.", author: "워런 버핏" },
  { quote: "해자가 넓은 기업에 투자하라.", author: "워런 버핏" },
  { quote: "나는 좋은 기업이 나쁜 상황에 처했을 때 투자한다.", author: "워런 버핏" },
  { quote: "시장이 탐욕에 빠졌을 때 조심하고, 시장이 공포에 빠졌을 때 과감해져라.", author: "워런 버핏" },
  { quote: "자신의 능력 범위 안에서만 투자하라.", author: "워런 버핏" },
  { quote: "복리는 세계 8번째 불가사의다.", author: "워런 버핏" },
  { quote: "돈을 잃지 않는 것이 첫 번째 규칙이고, 두 번째 규칙은 첫 번째 규칙을 잊지 않는 것이다.", author: "워런 버핏" },
  { quote: "누군가 그늘에 앉아 쉴 수 있는 건 오래전 누군가 나무를 심었기 때문이다.", author: "워런 버핏" },
  { quote: "투자에서 가장 중요한 자질은 지능이 아니라 기질이다.", author: "워런 버핏" },
  { quote: "시간은 훌륭한 기업의 친구이고 평범한 기업의 적이다.", author: "워런 버핏" },
  { quote: "바다가 빠져야 누가 벌거벗고 수영했는지 알 수 있다.", author: "워런 버핏" },
  { quote: "자기 자신에 대한 투자가 가장 좋은 투자다.", author: "워런 버핏" },
  { quote: "내가 이해할 수 없는 사업에는 투자하지 않는다.", author: "워런 버핏" },

  // 피터 린치 (Peter Lynch) — 17개
  { quote: "자신이 아는 것에 투자하라.", author: "피터 린치" },
  { quote: "주식 뒤에는 기업이 있고, 기업이 잘되면 주식도 결국 잘된다.", author: "피터 린치" },
  { quote: "주식시장의 하락은 1월에 눈보라가 오는 것처럼 흔한 일이다.", author: "피터 린치" },
  { quote: "조정장에서 매도한 사람이 폭락장에서 매도한 사람보다 더 많은 돈을 잃었다.", author: "피터 린치" },
  { quote: "텐배거를 찾으려면 먼저 자기 주변을 살펴라.", author: "피터 린치" },
  { quote: "주가가 떨어졌다고 주식이 싸진 건 아니다.", author: "피터 린치" },
  { quote: "어떤 주식을 왜 샀는지 2분 안에 설명 못하면, 사지 말았어야 한다.", author: "피터 린치" },
  { quote: "평범한 사람도 월스트리트 전문가를 이길 수 있다.", author: "피터 린치" },
  { quote: "가장 큰 손실은 기회를 놓치는 것이다.", author: "피터 린치" },
  { quote: "장기적으로 주식 수익률이 채권을 이기는 건 당연한 일이다.", author: "피터 린치" },
  { quote: "사람들은 시장 타이밍을 맞추려다 더 많은 돈을 잃는다.", author: "피터 린치" },
  { quote: "좋은 기업의 주식은 결국 실적을 따라간다.", author: "피터 린치" },
  { quote: "매수할 때가 아니라 매도할 때를 아는 것이 더 중요하다.", author: "피터 린치" },
  { quote: "큰 수익은 3~4년을 기다린 후에 온다.", author: "피터 린치" },
  { quote: "전문가의 예측을 듣고 투자하면 전문가만 부자가 된다.", author: "피터 린치" },
  { quote: "어디서 큰 수익이 날지 모르니 항상 시장에 참여하라.", author: "피터 린치" },
  { quote: "나쁜 주식을 팔고 좋은 주식을 더 사라.", author: "피터 린치" },

  // 벤저민 그레이엄 (Benjamin Graham) — 16개
  { quote: "안전마진을 확보하라. 그것이 투자의 핵심이다.", author: "벤저민 그레이엄" },
  { quote: "주식시장은 단기적으로 투표 기계이지만, 장기적으로는 저울이다.", author: "벤저민 그레이엄" },
  { quote: "투자자의 가장 큰 적은 자기 자신이다.", author: "벤저민 그레이엄" },
  { quote: "미스터 마켓의 감정에 휘둘리지 말고 이용하라.", author: "벤저민 그레이엄" },
  { quote: "투기자의 가장 큰 적은 지루함이다.", author: "벤저민 그레이엄" },
  { quote: "현명한 투자자는 비관론자에게 사서 낙관론자에게 판다.", author: "벤저민 그레이엄" },
  { quote: "투자는 철저한 분석을 통해 원금의 안전과 적절한 수익을 약속하는 행위다.", author: "벤저민 그레이엄" },
  { quote: "좋은 투자는 좋은 사업과 같다. 기본에 충실한 것이다.", author: "벤저민 그레이엄" },
  { quote: "인내심은 투자자의 최고의 덕목이다.", author: "벤저민 그레이엄" },
  { quote: "가격이 가치보다 훨씬 낮을 때 사는 것이 안전마진이다.", author: "벤저민 그레이엄" },
  { quote: "투자에서 확실한 것은 없다. 그래서 안전마진이 필요하다.", author: "벤저민 그레이엄" },
  { quote: "대중을 따르는 것은 투자에서 가장 위험한 행동이다.", author: "벤저민 그레이엄" },
  { quote: "시장은 당신의 하인이지, 당신의 안내자가 아니다.", author: "벤저민 그레이엄" },
  { quote: "투자와 투기를 구별하지 못하는 사람은 돈을 잃게 되어 있다.", author: "벤저민 그레이엄" },
  { quote: "가치 투자의 비밀은 간단하다. 싸게 사서 비싸게 팔아라.", author: "벤저민 그레이엄" },
  { quote: "시장의 광기를 두려워하지 말고, 그것을 기회로 삼아라.", author: "벤저민 그레이엄" },

  // 찰리 멍거 (Charlie Munger) — 16개
  { quote: "뒤집어서 생각하라. 항상 뒤집어서.", author: "찰리 멍거" },
  { quote: "좋은 기업을 적정한 가격에 사는 것이 적정한 기업을 좋은 가격에 사는 것보다 훨씬 낫다.", author: "찰리 멍거" },
  { quote: "인생에서 큰 돈을 벌려면 엉덩이가 무거워야 한다.", author: "찰리 멍거" },
  { quote: "배움을 멈추는 순간 퇴보가 시작된다.", author: "찰리 멍거" },
  { quote: "남들이 똑똑하려 할 때, 나는 합리적이려 한다.", author: "찰리 멍거" },
  { quote: "세상에서 가장 좋은 투자는 자기 자신에게 하는 것이다.", author: "찰리 멍거" },
  { quote: "복잡한 것을 단순하게 만드는 것이 진정한 지혜다.", author: "찰리 멍거" },
  { quote: "좋은 투자 기회는 자주 오지 않는다. 올 때 크게 베팅하라.", author: "찰리 멍거" },
  { quote: "질투는 유일하게 재미조차 없는 대죄다.", author: "찰리 멍거" },
  { quote: "어리석음을 피하는 것이 천재가 되려는 것보다 쉽다.", author: "찰리 멍거" },
  { quote: "40세 이전에 합리적이 되지 못하면 평생 합리적이 될 수 없다.", author: "찰리 멍거" },
  { quote: "다양한 학문의 핵심 모델을 배워라.", author: "찰리 멍거" },
  { quote: "가장 좋은 투자 대상은 경쟁자가 이기기 어려운 기업이다.", author: "찰리 멍거" },
  { quote: "성공 투자의 비결은 인내, 인내, 그리고 또 인내다.", author: "찰리 멍거" },
  { quote: "매일 잠들기 전보다 조금 더 현명해져라.", author: "찰리 멍거" },
  { quote: "세 가지 규칙이면 된다. 싸게 사고, 좋은 것만 사고, 오래 가져가라.", author: "찰리 멍거" },

  // 조지 소로스 (George Soros) — 16개
  { quote: "시장은 항상 틀린다.", author: "조지 소로스" },
  { quote: "중요한 건 옳고 그름이 아니라, 옳을 때 얼마를 버느냐다.", author: "조지 소로스" },
  { quote: "기회가 오면 주저하지 말고 크게 베팅하라.", author: "조지 소로스" },
  { quote: "먼저 투자하고, 나중에 조사하라.", author: "조지 소로스" },
  { quote: "살아남는 것이 번성하기 위한 전제 조건이다.", author: "조지 소로스" },
  { quote: "시장의 추세는 자기 강화적이다.", author: "조지 소로스" },
  { quote: "틀렸다는 것을 인정하는 것이 자랑스러운 일이다.", author: "조지 소로스" },
  { quote: "나는 투자에서 틀릴 수 있다는 전제로 시작한다.", author: "조지 소로스" },
  { quote: "추세를 찾아라. 그리고 추세가 끝나기 전에 올라타라.", author: "조지 소로스" },
  { quote: "인간의 불확실한 인식이 시장을 움직인다.", author: "조지 소로스" },
  { quote: "시장 참여자의 편향이 가격에 영향을 미치고, 가격이 다시 편향에 영향을 미친다.", author: "조지 소로스" },
  { quote: "위험을 감수하되, 전 재산을 걸지는 마라.", author: "조지 소로스" },
  { quote: "고통 없이는 이익도 없다.", author: "조지 소로스" },
  { quote: "나는 부자가 된 게 아니라, 살아남았을 뿐이다.", author: "조지 소로스" },
  { quote: "시장의 비효율성은 수익의 원천이다.", author: "조지 소로스" },
  { quote: "확신이 들 때까지 기다리면 이미 늦다.", author: "조지 소로스" },

  // 제시 리버모어 (Jesse Livermore) — 15개
  { quote: "월스트리트에 새로운 것은 없다. 투기의 역사만큼 오래된 것뿐이다.", author: "제시 리버모어" },
  { quote: "큰돈은 매매가 아니라 기다림에서 나온다.", author: "제시 리버모어" },
  { quote: "시장이 옳다는 것을 증명해 줄 때까지 기다려라.", author: "제시 리버모어" },
  { quote: "손실을 빨리 끊고, 이익은 천천히 키워라.", author: "제시 리버모어" },
  { quote: "확신이 설 때까지 행동하지 마라.", author: "제시 리버모어" },
  { quote: "추세를 거스르지 마라. 추세는 당신의 친구다.", author: "제시 리버모어" },
  { quote: "평균 매수단가를 낮추기 위해 추가 매수하는 것은 어리석다.", author: "제시 리버모어" },
  { quote: "인간의 본성은 바뀌지 않기에, 시장의 패턴도 반복된다.", author: "제시 리버모어" },
  { quote: "돈을 벌고 싶다면, 대중의 반대편에 서라.", author: "제시 리버모어" },
  { quote: "희망은 투자에서 가장 위험한 감정이다.", author: "제시 리버모어" },
  { quote: "시장에서 돈을 잃는 이유는 인내심 부족이다.", author: "제시 리버모어" },
  { quote: "경험은 비싼 수업료를 내고 얻는 것이다.", author: "제시 리버모어" },
  { quote: "이기는 포지션에 추가하고, 지는 포지션은 정리하라.", author: "제시 리버모어" },
  { quote: "스스로 판단하라. 다른 사람의 의견은 무시하라.", author: "제시 리버모어" },
  { quote: "시장은 절대 틀리지 않는다. 의견이 틀릴 뿐이다.", author: "제시 리버모어" },
];

export function InvestmentQuoteBanner() {
  const { quote, author } = useMemo(() => {
    return INVESTMENT_QUOTES[Math.floor(Math.random() * INVESTMENT_QUOTES.length)];
  }, []);

  const text = `\u201c${quote}\u201d \u2014 ${author}`;

  return (
    <div className="w-full overflow-hidden bg-[#0a0a0a] py-1.5">
      <div className="marquee-wrap">
        <p className="marquee-text text-sm font-semibold tracking-wide">
          <span className="text-[#39ff14]">{text}</span>
          <span className="mx-16 text-[#39ff14]/40" aria-hidden="true">|</span>
          <span className="text-[#39ff14]" aria-hidden="true">{text}</span>
          <span className="mx-16 text-[#39ff14]/40" aria-hidden="true">|</span>
        </p>
      </div>

      <style jsx>{`
        .marquee-wrap {
          display: flex;
          width: max-content;
        }
        .marquee-text {
          display: flex;
          align-items: center;
          white-space: nowrap;
          animation: marquee 22s linear infinite;
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
