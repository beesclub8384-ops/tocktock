import { VixGaugeWidget } from "@/components/vix-gauge-widget";
import { MarketIndices } from "@/components/market-indices";
import { CreditBalanceChart } from "@/components/credit-balance-chart";
import { CreditOverheatChart } from "@/components/credit-overheat-chart";

export const metadata = {
  title: "지수 - TockTock",
  description: "공포지수 및 시장 지표 분석",
};

export default function IndicesPage() {
  return (
    <div className="max-w-3xl px-8 py-20">
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
        <section>
          <h2 className="mb-4 text-lg font-semibold">
            빚투 지표 (신용융자잔고)
          </h2>
          <CreditBalanceChart />
        </section>
        <section>
          <h2 className="mb-4 text-lg font-semibold">
            TockTock 빚투 과열지수
          </h2>
          <CreditOverheatChart />
        </section>
      </div>
    </div>
  );
}
