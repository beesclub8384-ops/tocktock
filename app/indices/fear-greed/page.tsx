import { VixGaugeWidget } from "@/components/vix-gauge-widget";

export const metadata = {
  title: "공포지수 (VIX) - TockTock",
  description: "시장 공포지수(VIX) 실시간 게이지 및 분석",
};

export default function FearGreedPage() {
  return (
    <div className="max-w-3xl px-8 py-20">
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">공포지수 (VIX)</h1>
        <p className="mt-2 text-muted-foreground">
          시장의 공포와 탐욕을 실시간으로 확인하세요.
        </p>
      </header>

      <div className="space-y-8">
        <VixGaugeWidget />
      </div>
    </div>
  );
}
