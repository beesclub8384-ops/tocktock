import { StockChart } from "@/components/stock/stock-chart";

export default async function StockPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <StockChart symbol={symbol.toUpperCase()} />
    </div>
  );
}
