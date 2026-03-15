export default function GlobalLiquidityPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 sm:px-8 sm:py-24">
      <header className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          글로벌 유동성 지표
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          전 세계 주요국 유동성 흐름을 종합적으로 분석합니다.
        </p>
      </header>

      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-4xl mb-4">🔧</p>
        <p className="text-lg font-semibold mb-2">현재 준비 중입니다</p>
        <p className="text-sm text-muted-foreground">
          주요국 중앙은행 대차대조표, 글로벌 M2, 크레딧 사이클 등을 종합한
          글로벌 유동성 지표를 준비하고 있습니다.
        </p>
      </div>

      <p className="mt-12 text-xs text-muted-foreground text-center">
        본 페이지의 모든 지표와 분석은 참고용이며, 투자 권유가 아닙니다.
      </p>
    </main>
  );
}
