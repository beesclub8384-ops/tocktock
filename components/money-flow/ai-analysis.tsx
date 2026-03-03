"use client";

import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FlowDiagram } from "./flow-diagram";
import { type AiAnalysis, MOCK_ANALYSIS } from "@/lib/money-flow-data";

function renderMarkdown(text: string) {
  // 간단한 마크다운 → JSX 변환
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    key++;
    const trimmed = line.trim();

    if (!trimmed) {
      elements.push(<div key={key} className="h-3" />);
      continue;
    }

    // ### h3
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={key} className="mt-4 mb-2 text-base font-semibold">
          {trimmed.slice(4)}
        </h4>
      );
      continue;
    }

    // ## h2
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={key} className="mt-6 mb-2 text-lg font-semibold">
          {trimmed.slice(3)}
        </h3>
      );
      continue;
    }

    // 리스트
    if (trimmed.startsWith("- ") || /^\d+\.\s/.test(trimmed)) {
      const content = trimmed.replace(/^[-\d.]+\s*/, "");
      elements.push(
        <li key={key} className="ml-4 text-sm leading-relaxed text-muted-foreground list-disc">
          <span dangerouslySetInnerHTML={{ __html: boldify(content) }} />
        </li>
      );
      continue;
    }

    // 이탤릭 면책조항
    if (trimmed.startsWith("*") && trimmed.endsWith("*")) {
      elements.push(
        <p key={key} className="mt-4 text-xs italic text-muted-foreground">
          {trimmed.slice(1, -1)}
        </p>
      );
      continue;
    }

    // 일반 단락
    elements.push(
      <p
        key={key}
        className="text-sm leading-relaxed text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: boldify(trimmed) }}
      />
    );
  }

  return elements;
}

function boldify(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>');
}

export function AiAnalysisSection() {
  const [analysis, setAnalysis] = useState<AiAnalysis>(MOCK_ANALYSIS);
  const [loading, setLoading] = useState(false);

  async function handleRefresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/money-flow-analysis");
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setAnalysis(data);
    } catch {
      // API 실패 시 목업 유지
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 한줄 요약 */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-amber-400" />
            <p className="text-lg font-bold leading-snug">{analysis.summary}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="shrink-0"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            AI 분석 새로고침
          </Button>
        </div>
      </div>

      {/* 돈의 흐름 순서도 */}
      <div className="rounded-xl border bg-card p-6">
        <FlowDiagram nodes={analysis.flowNodes} arrows={analysis.flowArrows} />
      </div>

      {/* 상세 분석 */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-4 text-base font-semibold">상세 분석</h3>
        <Separator className="mb-4" />
        <div className="space-y-1">{renderMarkdown(analysis.detail)}</div>
      </div>

      {/* 태그 */}
      <div className="flex flex-wrap gap-2">
        {analysis.tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>

      {/* 업데이트 시각 */}
      <p className="text-xs text-muted-foreground">
        마지막 업데이트:{" "}
        {new Date(analysis.updatedAt).toLocaleString("ko-KR")}
      </p>
    </div>
  );
}
