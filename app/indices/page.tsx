import { VixGaugeWidget } from "@/components/vix-gauge-widget";
import { MarketIndices } from "@/components/market-indices";

export const metadata = {
  title: "지수 - TockTock",
  description: "공포지수 및 시장 지표 분석",
};

export default function IndicesPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">지수</h1>
        <p className="mt-2 text-muted-foreground">
          시장 공포지수와 주요 지표를 확인하세요.
        </p>
      </header>

      <div className="space-y-8">
        <VixGaugeWidget />
        <section>
          <h2 className="mb-4 text-lg font-semibold">주요 시장 지수</h2>
          <MarketIndices />
        </section>
      </div>
    </div>
  );
}
