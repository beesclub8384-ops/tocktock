export const metadata = {
  title: "톡톡 칼럼 - TockTock",
  description: "TockTock 칼럼 - 투자 인사이트와 시장 이야기",
};

export default function ColumnPage() {
  return (
    <div className="max-w-3xl px-8 py-20">
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">톡톡 칼럼</h1>
        <p className="mt-2 text-muted-foreground">
          투자 인사이트와 시장 이야기를 전합니다.
        </p>
      </header>

      <p className="text-muted-foreground">아직 작성된 글이 없습니다.</p>
    </div>
  );
}
