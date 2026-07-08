"use client";

import { useState, useEffect } from "react";
import { Layers, X } from "lucide-react";

/* ── 사업영역 데이터 (종목코드 → 부문 목록). 회사 추가는 여기에 한 줄씩 ── */
type BizDivision = { title: string; body: string };

const BIZ_AREAS: Record<string, BizDivision[]> = {
  // 삼성물산(028260)
  "028260": [
    {
      title: "건설",
      body: "건축·주거(래미안 아파트 등), 인프라(도로·철도·항만·교량), 플랜트(발전·석유·가스·석유화학·산업 플랜트), 하이테크 시설(반도체·디스플레이 공장, 데이터센터 등) EPC·개발 사업.",
    },
    {
      title: "상사(무역)",
      body: "화학·비료·에너지·철강·비철·소재 등의 글로벌 트레이딩, 자원·인프라 프로젝트 투자, 수소·암모니아·그린에너지·2차전지 원료·태양광·SMR 등 신사업 관련 물량·프로젝트 사업.",
    },
    {
      title: "패션",
      body: "빈폴·갤럭시·준지·에잇세컨즈 등 의류·패션 브랜드 기획·제조·유통, 오프라인 매장과 온라인몰·자사몰을 통한 리테일 사업.",
    },
    {
      title: "리조트",
      body: "에버랜드·캐리비안베이·골프장 등 테마파크·레저 시설 운영, 정원·전시·동물원, 콘도·리조트 및 웨딩·MICE 등 레저·엔터테인먼트 서비스.",
    },
    {
      title: "급식·식자재 유통",
      body: "삼성웰스토리 중심 사업장·학교·병원·공공기관 대상 단체급식 운영, 식자재 구매·유통 및 관련 B2B 서비스.",
    },
    {
      title: "바이오",
      body: "삼성바이오로직스·삼성바이오에피스 지분을 통한 바이오의약품 CMO(위탁생산)와 바이오시밀러 개발·판매에서 발생하는 지분법이익·배당 등 바이오 부문 수익.",
    },
    {
      title: "매출 비중",
      body: "건설과 상사, 바이오(자회사 실적 반영)가 실적의 핵심 축이고, 패션·리조트·급식은 상대적으로 비중이 작은 라이프스타일/서비스 축으로 보는 편이 이해에 편하다.",
    },
  ],
  // 포스코인터내셔널(047050)
  "047050": [
    {
      title: "에너지",
      body: "해외 가스전 개발·생산(미얀마, 호주 등), LNG 트레이딩, LNG 수입터미널(광양) 운영, LNG 발전, 태양광·풍력 등 발전사업.",
    },
    {
      title: "철강·철강원료",
      body: "포스코 그룹과 글로벌 고객 대상으로 열연·냉연·후판·전기강판 등 철강제품 및 철광석·석탄 등 철강원료 트레이딩과 프로젝트 사업.",
    },
    {
      title: "식량·농산물",
      body: "곡물(밀·옥수수·대두 등), 팜오일·식용유지, 면방·사료용 원료 등의 글로벌 소싱·트레이딩 및 팜농장·정제소를 포함한 식량 밸류체인 사업.",
    },
    {
      title: "부품·소재(모빌리티/산업)",
      body: "자동차·친환경차(전기·하이브리드)용 구동모터코어 등 부품, 산업플랜트 설비, 인프라·산업 프로젝트 관련 부품·소재 트레이딩 및 투자.",
    },
    {
      title: "이차전지·친환경 소재",
      body: "양극재·음극재 원료 등 이차전지소재 공급, PLA·PBAT 등 바이오플라스틱 유통 및 리사이클링, 바이오 원료·바이오화학 등 친환경 소재 신사업.",
    },
    {
      title: "바이오·신사업",
      body: "바이오 의약품 원료, 동물용 백신 등 바이오 관련 사업, 스마트팜·정밀농업 등 어그테크, 디지털 트레이딩 플랫폼 구축 등 신규 성장사업.",
    },
    {
      title: "매출 비중",
      body: "에너지(LNG 밸류체인)와 철강·식량 트레이딩이 실적의 핵심 축이고, 부품·소재 및 이차전지·친환경 소재·바이오 신사업은 아직은 비중이 작지만 성장 축으로 키우는 단계로 본다.",
    },
  ],
};

function BizAreaModal({
  name,
  divisions,
  onClose,
}: {
  name: string;
  divisions: BizDivision[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <h2 className="text-base font-bold">{name} 사업영역</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {divisions.map((d) => (
            <div key={d.title}>
              <h3 className="mb-1.5 text-sm font-semibold">{d.title}</h3>
              <p className="border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
                {d.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* 종목 행에서 회사명 옆 아이콘 — 사업영역 데이터가 있는 종목에만 렌더(없으면 null) */
export function BizAreaIcon({ code, name }: { code: string; name: string }) {
  const [open, setOpen] = useState(false);
  const divisions = BIZ_AREAS[code];
  if (!divisions) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${name} 사업영역 보기`}
        title="사업영역"
        className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
      >
        <Layers className="h-3.5 w-3.5" />
      </button>
      {open && <BizAreaModal name={name} divisions={divisions} onClose={() => setOpen(false)} />}
    </>
  );
}
