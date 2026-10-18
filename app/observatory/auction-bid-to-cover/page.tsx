import type { Metadata } from "next";
import type { AuctionMetricResponse } from "@/lib/observatory-auction-response";
import AuctionPage from "../_obs4/AuctionPage";
import { fetchOwnApi } from "../_obs4/parts";

export const metadata: Metadata = {
  title: "관측소 · 국채 입찰 응찰 배율 | TockTock",
  description:
    "미 재무부 국채 입찰에 사겠다는 돈이 얼마나 몰렸는지, 같은 만기의 평소와 비교해 봅니다. 출처는 미 재무부 Fiscal Data입니다.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await fetchOwnApi<AuctionMetricResponse>("/api/observatory/auction-bid-to-cover");
  return <AuctionPage data={data} metric="btc" />;
}
