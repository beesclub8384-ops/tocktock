"use client";

import { useState } from "react";
import { ChevronDown, Globe, Snowflake, ArrowRightLeft } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface LearnTopic {
  id: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  content: React.ReactNode;
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-4 border-l-4 border-amber-500/50 pl-4 text-sm font-medium italic text-foreground">
      {children}
    </blockquote>
  );
}

const TOPICS: LearnTopic[] = [
  {
    id: "100kyung",
    title: "100경 원의 세계",
    icon: <Globe className="size-5" />,
    color: "text-blue-400",
    content: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          전 세계 모든 자산을 합하면 얼마나 될까요?{" "}
          <strong className="text-foreground">약 750조 달러</strong>, 한화로 약{" "}
          <strong className="text-foreground">100경 원</strong>입니다.
          한국 GDP의 약 375배에 해당하는 금액이에요.
        </p>

        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-2 text-xs font-semibold text-foreground">
            전 세계 자산 구성 (약 750조 달러)
          </p>
          <ul className="space-y-1.5 text-xs">
            <li className="flex justify-between">
              <span>부동산</span>
              <span className="font-mono text-foreground">~$380T (51%)</span>
            </li>
            <li className="flex justify-between">
              <span>금융자산 (주식·채권 등)</span>
              <span className="font-mono text-foreground">~$310T (41%)</span>
            </li>
            <li className="flex justify-between">
              <span>실물자산 (금·원자재 등)</span>
              <span className="font-mono text-foreground">~$40T (5%)</span>
            </li>
            <li className="flex justify-between">
              <span>파생상품 (실제 가치)</span>
              <span className="font-mono text-foreground">~$12T (2%)</span>
            </li>
            <li className="flex justify-between">
              <span>암호화폐</span>
              <span className="font-mono text-foreground">~$2T (&lt;1%)</span>
            </li>
          </ul>
        </div>

        <p>
          이 중 <strong className="text-foreground">미국 달러로 표기되는 자산이 약 200~250조 달러</strong>로
          전체의 30~35%를 차지합니다. 달러가 왜 &quot;기축통화&quot;인지 숫자로 보이죠.
        </p>

        <Quote>
          전 세계의 돈이 한 곳에서 다른 곳으로 끊임없이 흐르고 있습니다.
          이 100경 원의 흐름을 이해하는 것이 투자의 첫걸음입니다.
        </Quote>
      </div>
    ),
  },
  {
    id: "melting-ice",
    title: "천천히 녹는 얼음 — 현금의 숙명",
    icon: <Snowflake className="size-5" />,
    color: "text-cyan-400",
    content: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          각국의 중앙은행은 돈을 계속 찍어낼 수밖에 없는 구조입니다.
          경기부양, 부채 상환, 선거를 앞둔 정치적 압력 등 다양한 이유로
          <strong className="text-foreground"> 필요한 양보다 더 많은 돈</strong>이 풀리게 됩니다.
        </p>

        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-2 text-xs font-semibold text-foreground">
            미국 달러의 구매력 변화
          </p>
          <div className="flex items-center justify-between">
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-foreground">$1</p>
              <p className="text-[10px]">1913년</p>
            </div>
            <div className="flex-1 mx-4 h-px bg-gradient-to-r from-green-500 to-red-500" />
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-foreground">$30</p>
              <p className="text-[10px]">2024년 (같은 물건 가격)</p>
            </div>
          </div>
          <p className="mt-2 text-center text-xs">
            110년간 달러의 구매력이{" "}
            <strong className="text-red-400">97% 하락</strong>
          </p>
        </div>

        <p>
          1913년에 1달러로 살 수 있던 물건을, 오늘날에는 약 30달러를 내야 합니다.
          돈을 그냥 들고 있으면 가치가 계속 줄어드는 겁니다.
        </p>

        <Quote>
          현금은 천천히 녹는 얼음입니다.
          아무것도 하지 않는 것도 선택이지만, 가만히 있으면 가치는 줄어듭니다.
        </Quote>
      </div>
    ),
  },
  {
    id: "value-transfer",
    title: "피할 수 없는 가치의 이동",
    icon: <ArrowRightLeft className="size-5" />,
    color: "text-amber-400",
    content: (
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          인간은 본능적으로 남보다 더 갖고 싶어 합니다.
          이 경쟁은 경제 시스템 안에서 끊임없는 <strong className="text-foreground">가치의 이동</strong>을
          만들어냅니다.
        </p>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-foreground mb-1">
              직접 이동 — 제로섬
            </p>
            <p className="text-xs">
              주식시장에서 누군가 수익을 내면, 반대편에서는 누군가 손실을 봅니다.
              선물·옵션 시장이 대표적입니다.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-1">
              새로운 가치 창출 — 파이 키우기
            </p>
            <p className="text-xs">
              혁신적인 기업이 새 시장을 만들면 전체 파이가 커집니다.
              하지만 이때도 기존 산업에서 자금이 이동합니다.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground mb-1">
              신용창출 — 보이지 않는 희석
            </p>
            <p className="text-xs">
              은행이 대출로 새 돈을 만들면 전체 돈의 양이 늘어납니다.
              새 돈이지만, 인플레이션으로 기존 돈의 가치가 희석됩니다.
            </p>
          </div>
        </div>

        <Quote>
          직접 이동이든 간접 이동이든, 가치의 이전은 피할 수 없습니다.
          중요한 것은 이 흐름을 이해하고, 흐름의 방향에 서는 것입니다.
        </Quote>
      </div>
    ),
  },
];

export function LearnSection() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        돈의 흐름을 이해하기 위한 기본 개념 3가지를 정리했습니다. 카드를 클릭해
        펼쳐보세요.
      </p>

      {TOPICS.map((topic) => {
        const isOpen = openId === topic.id;
        return (
          <Collapsible
            key={topic.id}
            open={isOpen}
            onOpenChange={(val) => setOpenId(val ? topic.id : null)}
          >
            <Card>
              <CollapsibleTrigger className="w-full text-left">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className={topic.color}>{topic.icon}</span>
                    <CardTitle className="flex-1 text-base">
                      {topic.title}
                    </CardTitle>
                    <ChevronDown
                      className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>{topic.content}</CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
