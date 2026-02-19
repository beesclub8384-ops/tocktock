import { GrowthScorePanel } from "@/components/growth-score-panel";

export const metadata = {
  title: "지수 - TockTock",
  description: "기업 성장성 종합 점수 분석",
};

export default function IndicesPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">지수</h1>
        <p className="mt-2 text-muted-foreground">
          종목을 검색하고 5가지 재무 지표 기반 성장성 점수를 확인하세요.
        </p>
      </header>

      <GrowthScorePanel />
    </div>
  );
}
