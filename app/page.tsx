import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { TrendingUp, BarChart3, Users } from "lucide-react";

const features = [
  {
    icon: TrendingUp,
    title: "실시간 종목 토론",
    description:
      "관심 종목에 대해 다른 투자자들과 실시간으로 의견을 나누고, 다양한 시각에서 분석을 공유하세요.",
  },
  {
    icon: BarChart3,
    title: "투자 인사이트 공유",
    description:
      "경험 많은 투자자들의 분석과 인사이트를 확인하고, 나만의 투자 전략을 발전시켜 보세요.",
  },
  {
    icon: Users,
    title: "커뮤니티 네트워크",
    description:
      "같은 관심사를 가진 투자자들과 연결되어 정보를 교환하고 함께 성장하는 커뮤니티에 참여하세요.",
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero Section */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center sm:py-32">
        <div className="inline-flex items-center rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground">
          곧 오픈 예정
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          주식 투자,{" "}
          <span className="text-primary">함께</span> 나누면
          <br className="hidden sm:block" />
          더 똑똑해집니다
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          TockTock은 실시간 주식 정보를 공유하고 투자 인사이트를 나누는
          커뮤니티 플랫폼입니다. 혼자 고민하지 말고, 함께 성장하세요.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/blog">블로그 읽기</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="#features">자세히 보기</Link>
          </Button>
        </div>
      </section>

      {/* Feature Cards Section */}
      <section
        id="features"
        className="border-t border-border bg-muted/50 py-24"
      >
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              왜 TockTock인가요?
            </h2>
            <p className="mt-4 text-muted-foreground">
              투자자를 위한 핵심 기능을 제공합니다
            </p>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA Section */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            투자 여정을 함께 시작하세요
          </h2>
          <p className="mt-4 text-muted-foreground">
            TockTock이 곧 오픈합니다. 블로그에서 최신 소식을 확인하세요.
          </p>
          <div className="mt-8">
            <Button size="lg" asChild>
              <Link href="/blog">블로그 방문하기</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
