import { getAllNews, type NewsCategory } from "@/lib/news-rss";

export const revalidate = 3600; // 1시간 ISR

export const metadata = {
  title: "뉴스 - TockTock",
  description: "실시간 투자 뉴스 - 주식, 증시, 경제, 미국시장, 미국정치, 한국정치",
};

const CATEGORY_COLORS: Record<NewsCategory, string> = {
  주식: "bg-blue-500/15 text-blue-400",
  증시: "bg-violet-500/15 text-violet-400",
  경제: "bg-emerald-500/15 text-emerald-400",
  미국시장: "bg-orange-500/15 text-orange-400",
  미국정치: "bg-rose-500/15 text-rose-400",
  한국정치: "bg-amber-500/15 text-amber-400",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export default async function NewsPage() {
  const news = await getAllNews();

  return (
    <div className="max-w-3xl px-8 py-20">
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">뉴스</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          연합뉴스 · AP News | 1시간마다 자동 업데이트
        </p>
      </header>

      {news.length === 0 ? (
        <p className="text-muted-foreground">뉴스를 불러오는 중 문제가 발생했습니다.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {news.map((item, i) => (
            <article key={`${item.link}-${i}`} className="group">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[item.category]}`}
                >
                  {item.category}
                </span>
              </div>

              <h2 className="text-lg font-semibold leading-snug">
                {item.title}
              </h2>

              {item.description && (
                <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                  {item.description}
                </p>
              )}

              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {item.source} · {item.pubDate ? timeAgo(item.pubDate) : ""}
                </span>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  원문 보기 &rarr;
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
