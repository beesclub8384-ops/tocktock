import Link from "next/link";
import { Redis } from "@upstash/redis";

type DiagramMeta = { id: string; title: string; type: string; center: string; createdAt: string };

const articles = [
  {
    href: "/money-flow/us-bond-market",
    title: "미국 채권시장의 구조",
    description:
      "재무부 채권 45%, 회사채 26%... 돈이 어디에 얼마나 쌓여 있는가",
  },
];

export const revalidate = 0;

export default async function MoneyFlowPage() {
  const redis = Redis.fromEnv();
  const ids: string[] = (await redis.lrange("diagram:list", 0, -1)) ?? [];
  const diagrams: DiagramMeta[] = (
    await Promise.all(ids.map(id => redis.get<string>(`diagram:${id}`)))
  )
    .filter(Boolean)
    .map(raw => raw as unknown as DiagramMeta);

  return (
    <main className="max-w-3xl px-6 py-16 sm:px-8">
      <header className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          돈의 흐름
        </h1>
        <p className="mt-2 text-muted-foreground">
          전 세계 거시경제의 돈 흐름을 구조적으로 살펴봅니다.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {articles.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group block rounded-xl border bg-card p-6 transition-colors hover:bg-accent/50"
          >
            <h2 className="text-xl font-semibold group-hover:text-muted-foreground transition-colors">
              {a.title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {a.description}
            </p>
          </Link>
        ))}
      </div>

      {/* AI 다이어그램 섹션 */}
      <section className="mt-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold tracking-tight">AI 다이어그램</h2>
          <Link
            href="/diagrams/new"
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            ✦ 새 다이어그램
          </Link>
        </div>

        {diagrams.length === 0 ? (
          <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground">
            <p className="text-4xl">◎</p>
            <p className="mt-3 text-sm">아직 게시된 다이어그램이 없습니다</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {diagrams.map((item) => (
              <Link
                key={item.id}
                href={`/money-flow/${item.id}`}
                className="group flex items-center justify-between rounded-xl border bg-card p-5 transition-colors hover:bg-accent/50"
              >
                <div>
                  <p className="text-base font-semibold group-hover:text-muted-foreground transition-colors">
                    {item.title || item.center}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.type === "timeline" ? "⏱ 순서/흐름형" : "◎ 개념/카테고리형"} ·{" "}
                    {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <span className="text-lg text-muted-foreground/40">→</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
