import Link from "next/link";

const articles = [
  {
    href: "/money-flow/us-bond-market",
    title: "미국 채권시장의 구조",
    description:
      "재무부 채권 45%, 회사채 26%... 돈이 어디에 얼마나 쌓여 있는가",
  },
];

export default function MoneyFlowPage() {
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
    </main>
  );
}
