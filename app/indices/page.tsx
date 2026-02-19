import { GrowthScorePanel } from "@/components/growth-score-panel";
import { VixGaugeWidget } from "@/components/vix-gauge-widget";

export const metadata = {
  title: "지수 - TockTock",
  description: "공포지수, 기업 성장성 종합 점수 분석",
};

export default function IndicesPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">지수</h1>
        <p className="mt-2 text-muted-foreground">
          시장 공포지수와 종목별 성장성 점수를 확인하세요.
        </p>
      </header>

      <div className="space-y-8">
        <VixGaugeWidget />
        <GrowthScorePanel />
      </div>
    </div>
  );
}
