import { CreditBalanceChart } from "@/components/credit-balance-chart";
import { CreditOverheatChart } from "@/components/credit-overheat-chart";
import { CreditVsIndexChart } from "@/components/credit-vs-index-chart";

export const metadata = {
  title: "빚투 지표 | TockTock",
  description: "신용융자잔고, 빚투 과열지수, 신용융자 vs 지수 비교",
};

export default function CreditPage() {
  return (
    <div className="max-w-3xl px-8 py-20">
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">빚투 지표</h1>
        <p className="mt-2 text-muted-foreground">
          신용융자잔고와 과열지수를 확인하세요.
        </p>
      </header>

      <div className="space-y-8">
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
        <section>
          <h2 className="mb-4 text-lg font-semibold">
            신용융자잔고 vs 지수 비교
          </h2>
          <CreditVsIndexChart />
        </section>
      </div>
    </div>
  );
}
