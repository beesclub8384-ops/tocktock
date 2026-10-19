"use client";

import { MONO } from "../_lib/format";
import type { QuarterInfo } from "../_lib/quarter";
import { CardShell, FooterButton } from "./CardShell";

export function CautionCard({
  quarter,
  onNavigate,
}: {
  quarter: QuarterInfo;
  onNavigate: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const boxes: { big: string; text: string }[] = [
    // 분기를 모르면 경과일 박스는 숨긴다
    ...(quarter.daysSince !== null
      ? [{ big: `${quarter.daysSince}일`, text: `${quarter.endLabel} 보유 현황이에요. 지금은 이미 팔았을 수도 있어요.` }]
      : []),
    { big: "일부", text: "13F에는 공매도와 현금이 나오지 않아요. 보이는 건 장바구니의 일부예요." },
    { big: "1단계", text: "거물이 봤구나, 나도 공부해 보자. 여기서 시작하는 게 올바른 쓰임이에요." },
  ];

  return (
    <CardShell
      index={5}
      tag="보기 전에 한 가지"
      accent="neutral"
      headline="따라 사라고 만든 게 아니에요"
      footer={
        <FooterButton href="#card-0" onNavigate={onNavigate}>
          처음으로
        </FooterButton>
      }
    >
      <ul className="flex flex-col gap-2.5">
        {boxes.map((b) => (
          <li
            key={b.big}
            className="grid grid-cols-[56px_1fr] items-center gap-3 rounded-[14px] border border-border bg-card p-4"
          >
            <span className="text-[17px] font-semibold leading-tight tabular-nums" style={MONO}>
              {b.big}
            </span>
            <span className="text-[14px] leading-relaxed">{b.text}</span>
          </li>
        ))}
      </ul>

      <p className="text-xs leading-relaxed text-muted-foreground">
        SEC 13F 공시(Dataroma 제공) 기반이에요. 13F는 분기 종료 후 최대 45일 지나서 공개돼요. 투자 권유가
        아니고, 판단은 본인 책임이에요.
      </p>
    </CardShell>
  );
}
