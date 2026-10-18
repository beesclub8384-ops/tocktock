import type { Metadata } from "next";
import type { AuctionMetricResponse } from "@/lib/observatory-auction-response";
import AuctionPage from "../_obs4/AuctionPage";
import { fetchOwnApi } from "../_obs4/parts";

export const metadata: Metadata = {
  title: "관측소 · 입찰 프라이머리 딜러 인수 비중 | TockTock",
  description:
    "미 재무부 국채 입찰에서 프라이머리 딜러가 떠안은 몫을 같은 만기의 평소와 비교해 봅니다. 출처는 미 재무부 Fiscal Data입니다.",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await fetchOwnApi<AuctionMetricResponse>("/api/observatory/auction-dealer-share");
  return <AuctionPage data={data} metric="pd" />;
}
