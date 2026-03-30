import { getSortedPostsData } from "@/lib/posts";
import EconomicsClient from "./economics-client";

export const metadata = {
  title: "경제공부 - TockTock",
  description: "TockTock 경제공부 - 내가 이해한 방식으로 풀어쓴 투자 이야기",
};

export default function EconomicsPage() {
  const posts = getSortedPostsData("economics");
  return <EconomicsClient posts={posts} />;
}
