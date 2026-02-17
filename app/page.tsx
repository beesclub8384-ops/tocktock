import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-col items-center gap-8 px-6 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          TockTock
        </h1>
        <p className="max-w-md text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          실시간 주식 정보를 공유하고, 투자 인사이트를 나누는 커뮤니티 플랫폼입니다.
        </p>
        <div className="mt-4 rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          곧 오픈 예정
        </div>
        <Link
          href="/blog"
          className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          블로그 보기
        </Link>
      </main>
    </div>
  );
}
