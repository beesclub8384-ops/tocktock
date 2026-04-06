"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2 } from "lucide-react";

interface FuturesRecord {
  id: string;
  date: string;
  direction: "long" | "short";
  entryTime: string;
  entryPoint: number;
  exitTime: string;
  exitPoint: number;
  contracts: number;
  pnl: number;
  memo: string;
  createdAt: string;
}

const MULTIPLIER = 250000;

function calcPnl(
  direction: "long" | "short",
  entry: number,
  exit: number,
  contracts: number
): number {
  if (!entry || !exit || !contracts) return 0;
  const diff = direction === "long" ? exit - entry : entry - exit;
  return diff * contracts * MULTIPLIER;
}

function formatKRW(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${abs.toLocaleString("ko-KR")}원`;
}

// ── 비밀번호 화면 ──

function PasswordGate({ onAuth }: { onAuth: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === "8384") {
      onAuth(pw);
    } else {
      setError(true);
      setPw("");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-8 space-y-10">

        {/* ════════════════════════════════════════════════
            1. 타이틀
        ════════════════════════════════════════════════ */}
        <header>
          <h1 className="text-3xl font-bold tracking-tight mb-1">영웅들의 선물</h1>
          <p className="text-sm text-muted-foreground">
            코스피200 선물 실시간 모니터링 &amp; 매매 검증 시스템
          </p>
        </header>

        {/* ════════════════════════════════════════════════
            2. 프로그램 개요
        ════════════════════════════════════════════════ */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-lg font-bold">이 프로그램은 뭔가요?</h2>
          <p className="text-sm leading-relaxed text-foreground/80">
            <strong>영웅들의 선물</strong>은 코스피200 선물 시장의 실시간 가격과 투자자별 수급 데이터를
            모니터링하는 Windows 데스크탑 프로그램입니다.
          </p>
          <p className="text-sm leading-relaxed text-foreground/80">
            키움증권 Open API+를 기반으로 작동하며, Python과 PyQt5로 제작된 독립 실행 프로그램입니다.
            증권사 HTS를 켜지 않아도 필요한 데이터만 골라서 한 화면에 보여줍니다.
          </p>
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-foreground/70">
            <p className="font-medium text-foreground/90 mb-1">쉽게 말하면</p>
            <p>
              &quot;지금 선물이 몇 포인트야?&quot;, &quot;외국인이 사고 있어 팔고 있어?&quot;를
              실시간으로 보여주는 프로그램입니다. 매매 기록까지 남길 수 있어서 자기 매매를 검증할 수 있습니다.
            </p>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            3. 실행 환경
        ════════════════════════════════════════════════ */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-lg font-bold">실행 환경</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="text-foreground/80">
                {[
                  ["운영체제", "Windows"],
                  ["실행 파일", "futures_trader.py"],
                  ["Python", "32비트 Python 3.11"],
                  ["필수 라이브러리", "PyQt5, pywin32"],
                  ["증권 API", "키움증권 Open API+ (32비트 COM)"],
                  ["계좌", "키움증권 실계좌 (공동인증서 필요)"],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-border/40">
                    <td className="py-2 pr-6 text-muted-foreground font-medium whitespace-nowrap">{k}</td>
                    <td className="py-2"><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{v}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg bg-muted/50 p-4 text-sm text-foreground/70">
            <p className="font-medium text-foreground/90 mb-1">실행 명령어</p>
            <code className="block text-xs bg-background rounded p-2 mt-1 overflow-x-auto">
              &quot;C:\Users\beesc\AppData\Local\Programs\Python\Python311-32\python.exe&quot; futures_trader.py
            </code>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            4. 설계 및 작동 방식
        ════════════════════════════════════════════════ */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h2 className="text-lg font-bold">설계 및 작동 방식</h2>

          {/* 4-1. 키움 Open API+ */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">키움 Open API+란?</h3>
            <p className="text-sm leading-relaxed text-foreground/80">
              키움증권이 개인 투자자에게 제공하는 <strong>프로그래밍 인터페이스</strong>입니다.
              쉽게 말해, 증권사 HTS(영웅문)가 하는 일을 내가 만든 프로그램에서 직접 할 수 있게 해주는 도구입니다.
              주가 조회, 실시간 시세 수신, 주문 발생까지 모두 코드로 가능합니다.
            </p>
          </div>

          {/* 4-2. OCX 방식 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">OCX 방식이란?</h3>
            <p className="text-sm leading-relaxed text-foreground/80">
              OCX는 Windows에서 프로그램끼리 데이터를 주고받는 오래된 방식(COM 기술)입니다.
              키움 OpenAPI는 <code className="rounded bg-muted px-1 py-0.5 text-xs">khopenapi.ocx</code> 파일로
              제공되며, 이 파일을 통해 키움 서버와 통신합니다.
            </p>
            <div className="rounded-lg bg-muted/50 p-4 text-sm text-foreground/70">
              <p className="font-medium text-foreground/90 mb-1">왜 32비트 Python이 필요한가요?</p>
              <p>
                키움 OCX가 <strong>32비트 전용</strong>으로 만들어져 있기 때문입니다.
                64비트 Python에서는 이 OCX 파일을 아예 읽을 수가 없습니다.
                그래서 반드시 32비트 Python을 별도로 설치해서 사용해야 합니다.
              </p>
            </div>
          </div>

          {/* 4-3. 로그인 흐름 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">1단계: 로그인</h3>
            <p className="text-sm leading-relaxed text-foreground/80">
              프로그램의 <strong>[로그인]</strong> 버튼을 누르면 키움증권 로그인 창이 뜹니다.
              ID, 비밀번호, 공동인증서 비밀번호를 입력하면 실서버에 접속됩니다.
              로그인 성공 시 화면 상단에 <strong>&quot;접속됨 - 이름(ID) [실서버]&quot;</strong>가 표시됩니다.
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-background border border-border/50 px-4 py-3 text-sm">
              <span className="rounded bg-foreground/10 px-2 py-1 text-xs font-mono">[로그인]</span>
              <span className="text-muted-foreground">→</span>
              <span>키움 로그인 창</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-green-500 font-medium">접속됨 - 노태양(solmat) [실서버]</span>
            </div>
          </div>

          {/* 4-4. 종목코드 자동 인식 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">2단계: 선물 종목코드 자동 인식</h3>
            <p className="text-sm leading-relaxed text-foreground/80">
              로그인 직후 <code className="rounded bg-muted px-1 py-0.5 text-xs">GetFutureList()</code> 함수를
              호출해서 현재 거래 가능한 코스피200 선물 종목 전체를 자동으로 가져옵니다.
              종목코드가 &quot;만기 월물&quot;에 따라 바뀌기 때문에, 매번 수동으로 바꾸지 않아도 됩니다.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">일반코드 (주간+야간)</p>
                <p className="text-sm font-mono">A0166000, 101Q6000 ...</p>
                <p className="text-xs text-muted-foreground mt-1">주간장과 야간장 모두에서 사용</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">D코드 (야간 전용)</p>
                <p className="text-sm font-mono">D0166000, D016669S ...</p>
                <p className="text-xs text-muted-foreground mt-1">야간장에서만 사용되는 별도 코드</p>
              </div>
            </div>
          </div>

          {/* 4-5. SetRealReg와 FID */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">3단계: 실시간 데이터 등록 (SetRealReg &amp; FID)</h3>
            <p className="text-sm leading-relaxed text-foreground/80">
              키움 API에서 실시간 데이터를 받으려면 &quot;이 종목의 이 데이터를 보내달라&quot;고 <strong>등록</strong>해야 합니다.
              이때 사용하는 함수가 <code className="rounded bg-muted px-1 py-0.5 text-xs">SetRealReg()</code>이고,
              어떤 데이터를 받을지 지정하는 번호가 <strong>FID(Field ID)</strong>입니다.
            </p>
            <div className="rounded-lg bg-muted/50 p-4 text-sm text-foreground/70">
              <p className="font-medium text-foreground/90 mb-2">FID 예시 (쉽게 말하면 &quot;데이터 번호표&quot;)</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <span><code className="bg-background rounded px-1">FID 10</code> = 현재가</span>
                <span><code className="bg-background rounded px-1">FID 11</code> = 전일대비</span>
                <span><code className="bg-background rounded px-1">FID 12</code> = 등락율</span>
                <span><code className="bg-background rounded px-1">FID 15</code> = 거래량</span>
                <span><code className="bg-background rounded px-1">FID 27</code> = 매도호가</span>
                <span><code className="bg-background rounded px-1">FID 28</code> = 매수호가</span>
                <span><code className="bg-background rounded px-1">FID 209</code> = 개인매수</span>
                <span><code className="bg-background rounded px-1">FID 211</code> = 외국인매수</span>
              </div>
              <p className="mt-2 text-muted-foreground">
                &quot;FID 10번을 보내달라&quot; = &quot;현재가를 실시간으로 알려달라&quot;는 뜻입니다.
              </p>
            </div>
          </div>

          {/* 4-6. 주간/야간 자동 전환 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">4단계: 주간/야간 자동 전환</h3>
            <p className="text-sm leading-relaxed text-foreground/80">
              프로그램은 1초마다 현재 시각을 확인해서 세션을 자동으로 판별합니다.
              오전 9시가 되면 주간 모드로, 오후 6시가 되면 야간 모드로 알아서 전환합니다.
              세션이 바뀔 때 기존 실시간 등록을 해제하고, 새 세션에 맞는 종목과 FID로 다시 등록합니다.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">시간</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">세션</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">실시간 타입</th>
                    <th className="pb-2 font-medium text-muted-foreground">표시 색상</th>
                  </tr>
                </thead>
                <tbody className="text-foreground/80">
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 tabular-nums">09:00 ~ 15:30</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">주간장</span>
                    </td>
                    <td className="py-2 pr-4 text-xs font-mono">0K(시세) / 0z(투자자)</td>
                    <td className="py-2 text-green-500 text-xs">초록</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 tabular-nums">17:50 ~ 18:00</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500">야간 시가단일가</span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">-</td>
                    <td className="py-2 text-xs text-muted-foreground">-</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 tabular-nums">18:00 ~ 익일 06:00</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500">야간장</span>
                    </td>
                    <td className="py-2 pr-4 text-xs font-mono">NK(시세) / Nz(투자자)</td>
                    <td className="py-2 text-orange-500 text-xs">주황</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 tabular-nums">05:50 ~ 06:00</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500">야간 종가단일가</span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">-</td>
                    <td className="py-2 text-xs text-muted-foreground">-</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 tabular-nums">그 외</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">장외시간</span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">-</td>
                    <td className="py-2 text-muted-foreground text-xs">회색</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 4-7. 투자자별 수급의 어려움 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">투자자별 수급 데이터는 왜 어려운가?</h3>
            <p className="text-sm leading-relaxed text-foreground/80">
              키움 개발가이드에는 투자자별매매(0z, Nz) 실시간 타입이 <strong>&quot;시스템 내부용&quot;</strong>으로
              명시되어 있습니다. 즉, 공식적으로 외부에 제공하지 않는 데이터입니다.
            </p>
            <p className="text-sm leading-relaxed text-foreground/80">
              이 프로그램에서는 SetRealReg로 등록을 시도하되, 30초 내에 데이터가 안 오면
              자동으로 &quot;수신불가&quot;를 표시합니다. 향후 TR 조회(OPT10063 등)로 대체하는 방식을 준비하고 있습니다.
            </p>
            <div className="rounded-lg bg-muted/50 p-4 text-sm text-foreground/70">
              <p className="font-medium text-foreground/90 mb-1">쉽게 말하면</p>
              <p>
                &quot;외국인이 +4,931계약 순매수&quot;라는 데이터가 실시간으로 오면 좋겠지만,
                키움이 공식 제공하지 않아서 수신이 안 될 수 있습니다.
                안 오면 다른 방법(주기적 조회)으로 대체할 예정입니다.
              </p>
            </div>
          </div>

          {/* 4-8. 데이터 흐름 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">데이터 흐름</h3>
            <div className="flex flex-col items-center gap-1 rounded-lg bg-background border border-border/50 p-4 text-sm">
              <span className="rounded bg-muted px-3 py-1.5 font-medium">키움증권 실서버</span>
              <span className="text-muted-foreground text-xs">↓ 키움 Open API+ (COM 통신)</span>
              <span className="rounded bg-muted px-3 py-1.5 font-medium">내 PC (futures_trader.py 실행 중)</span>
              <span className="text-muted-foreground text-xs">↓ OnReceiveRealData 콜백</span>
              <span className="rounded bg-muted px-3 py-1.5 font-medium">실시간 데이터 수신 (시세 + 투자자)</span>
              <span className="text-muted-foreground text-xs">↓ PyQt5 UI 업데이트</span>
              <span className="rounded bg-foreground/10 px-3 py-1.5 font-medium">화면에 실시간 표시</span>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            5. 모니터링 화면 구성
        ════════════════════════════════════════════════ */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-lg font-bold">모니터링 화면</h2>

          {/* 상단 */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">상단 영역</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-foreground/10 px-2 py-1 text-xs font-mono">[로그인]</span>
              <span>접속 상태</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-green-500 text-xs font-medium">주간장(09:00~15:30)</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-xs font-mono tabular-nums">2026-04-06 14:23:05</span>
            </div>
          </div>

          {/* 시세 + 투자자 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">선물 시세 (좌측)</p>
              <div className="space-y-1 text-sm">
                {[
                  ["종목코드", "현재 모니터링 중인 선물 종목"],
                  ["현재가", "지금 이 순간의 체결 가격 (예: 812.15포인트)"],
                  ["전일대비", "어제 종가 대비 얼마나 올랐는지/내렸는지"],
                  ["등락율", "전일 대비 퍼센트 변동 (예: +0.65%)"],
                  ["거래량", "지금까지 체결된 총 계약 수"],
                  ["매도/매수호가", "지금 팔려는 가격 / 사려는 가격"],
                  ["체결시간", "마지막 체결이 일어난 시각"],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-foreground/90 font-medium shrink-0 w-20">{k}</span>
                    <span className="text-foreground/60 text-xs leading-relaxed">{v}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">상승은 <span className="text-red-400">빨간색</span>, 하락은 <span className="text-blue-400">파란색</span></p>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">투자자별 수급 (우측)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left pb-1 font-medium text-muted-foreground">구분</th>
                      <th className="text-center pb-1 font-medium text-muted-foreground">매도</th>
                      <th className="text-center pb-1 font-medium text-muted-foreground">매수</th>
                      <th className="text-center pb-1 font-medium text-muted-foreground">순매수</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/30"><td className="py-1">개인</td><td className="text-center">-</td><td className="text-center">-</td><td className="text-center">-</td></tr>
                    <tr className="border-b border-border/30"><td className="py-1">외국인</td><td className="text-center">-</td><td className="text-center">-</td><td className="text-center">-</td></tr>
                    <tr><td className="py-1">기관계</td><td className="text-center">-</td><td className="text-center">-</td><td className="text-center">-</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="rounded bg-background p-2 text-xs text-foreground/70">
                <p className="font-medium text-foreground/90 mb-0.5">읽는 법</p>
                <p>&quot;외국인 순매수 <span className="text-red-400">+4,931</span>&quot; = 외국인이 지금 매수 우위라는 뜻</p>
                <p>&quot;개인 순매수 <span className="text-blue-400">-3,200</span>&quot; = 개인이 지금 매도 우위라는 뜻</p>
              </div>
              <p className="text-xs text-muted-foreground">순매수 양수는 <span className="text-red-400">빨간색</span>, 음수는 <span className="text-blue-400">파란색</span></p>
            </div>
          </div>

          {/* 매매 신호 + 알림 + 로그 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">매매 신호 영역</p>
              <p className="text-sm text-foreground/70">매매 조건 로직이 구현되면 매수/매도 신호가 이 자리에 표시됩니다. 현재는 준비 중입니다.</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">알림 영역</p>
              <p className="text-sm text-foreground/70">조건 충족 시 알림 메시지가 표시됩니다. 10초 후 자동으로 사라집니다.</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">로그 영역</p>
              <p className="text-sm text-foreground/70">로그인 결과, 세션 전환, 데이터 수신 현황 등이 실시간으로 출력됩니다.</p>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            6. 현재 상태
        ════════════════════════════════════════════════ */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-lg font-bold">현재 진행 상태</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">항목</th>
                  <th className="pb-2 font-medium text-muted-foreground">상태</th>
                </tr>
              </thead>
              <tbody className="text-foreground/80">
                {[
                  ["키움 실서버 로그인", "done"],
                  ["선물 종목코드 자동 인식", "done"],
                  ["주간/야간 세션 자동 전환", "done"],
                  ["주간 실시간 시세 수신", "wip"],
                  ["야간 실시간 시세 수신", "warn"],
                  ["투자자별 수급 수신", "warn"],
                  ["매매 로직", "todo"],
                ].map(([label, status]) => (
                  <tr key={label} className="border-b border-border/40">
                    <td className="py-2 pr-4">{label}</td>
                    <td className="py-2">
                      {status === "done" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />정상
                        </span>
                      )}
                      {status === "wip" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />확인중
                        </span>
                      )}
                      {status === "warn" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />미수신 (원인 조사중)
                        </span>
                      )}
                      {status === "todo" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />미구현 (자리 확보)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ════════════════════════════════════════════════
            7. 파일 위치
        ════════════════════════════════════════════════ */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-bold mb-3">파일 위치</h2>
          <code className="block rounded bg-muted px-4 py-2 text-xs overflow-x-auto">
            C:\Users\beesc\Desktop\futures_trader.py
          </code>
          <p className="text-xs text-muted-foreground mt-2">
            키움증권 Open API+는 32비트 Windows 전용입니다. 64비트 Python에서는 실행되지 않습니다.
          </p>
        </section>

        {/* ════════════════════════════════════════════════
            8. 비밀번호 입력 (매매 기록 접근)
        ════════════════════════════════════════════════ */}
        <section className="flex justify-center pt-4">
          <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
            <h2 className="text-lg font-bold text-center">매매 기록 열기</h2>
            <p className="text-sm text-center text-muted-foreground">
              비밀번호를 입력하면 매매 기록 페이지로 이동합니다
            </p>
            <input
              type="password"
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setError(false);
              }}
              className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="비밀번호"
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-400 text-center">
                비밀번호가 틀렸습니다
              </p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              확인
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

// ── 입력 폼 ──

function RecordForm({
  password,
  onAdded,
}: {
  password: string;
  onAdded: () => void;
}) {
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entryTime, setEntryTime] = useState("");
  const [entryPoint, setEntryPoint] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [exitPoint, setExitPoint] = useState("");
  const [contracts, setContracts] = useState("1");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pnl = calcPnl(
    direction,
    Number(entryPoint),
    Number(exitPoint),
    Number(contracts)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryTime || !entryPoint || !exitTime || !exitPoint || !contracts)
      return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/futures-trading", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-password": password,
        },
        body: JSON.stringify({
          date,
          direction,
          entryTime,
          entryPoint: Number(entryPoint),
          exitTime,
          exitPoint: Number(exitPoint),
          contracts: Number(contracts),
          pnl,
          memo,
        }),
      });
      if (res.ok) {
        setEntryTime("");
        setEntryPoint("");
        setExitTime("");
        setExitPoint("");
        setContracts("1");
        setMemo("");
        onAdded();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-5 space-y-4"
    >
      <h2 className="text-lg font-bold">매매 기록 입력</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* 날짜 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            날짜
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 방향 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            방향
          </label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setDirection("long")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                direction === "long"
                  ? "bg-red-500/15 text-red-400 border border-red-500/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              롱
            </button>
            <button
              type="button"
              onClick={() => setDirection("short")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                direction === "short"
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              숏
            </button>
          </div>
        </div>

        {/* 진입 시간 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            진입 시간
          </label>
          <input
            type="text"
            placeholder="09:05"
            value={entryTime}
            onChange={(e) => setEntryTime(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 진입 포인트 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            진입 포인트
          </label>
          <input
            type="number"
            step="any"
            placeholder="370.50"
            value={entryPoint}
            onChange={(e) => setEntryPoint(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 청산 시간 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            청산 시간
          </label>
          <input
            type="text"
            placeholder="10:30"
            value={exitTime}
            onChange={(e) => setExitTime(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 청산 포인트 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            청산 포인트
          </label>
          <input
            type="number"
            step="any"
            placeholder="372.00"
            value={exitPoint}
            onChange={(e) => setExitPoint(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 계약수 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            계약수
          </label>
          <input
            type="number"
            min="1"
            value={contracts}
            onChange={(e) => setContracts(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 손익 (자동계산) */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            손익 (자동계산)
          </label>
          <div
            className={`rounded-md border border-border px-3 py-2 text-sm font-bold tabular-nums ${
              pnl > 0
                ? "text-red-400"
                : pnl < 0
                  ? "text-blue-400"
                  : "text-muted-foreground"
            }`}
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            {formatKRW(pnl)}
          </div>
        </div>
      </div>

      {/* 메모 */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          메모
        </label>
        <input
          type="text"
          placeholder="진입 근거, 느낀 점 등"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !entryTime || !entryPoint || !exitTime || !exitPoint}
        className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
      >
        {submitting ? "저장 중..." : "기록 추가"}
      </button>
    </form>
  );
}

// ── 통계 요약 ──

function Stats({ records }: { records: FuturesRecord[] }) {
  const total = records.length;
  const wins = records.filter((r) => r.pnl > 0).length;
  const losses = records.filter((r) => r.pnl < 0).length;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";
  const totalPnl = records.reduce((sum, r) => sum + r.pnl, 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">총 거래</p>
        <p className="text-2xl font-bold tabular-nums">{total}회</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">승/패</p>
        <p className="text-2xl font-bold tabular-nums">
          <span className="text-red-400">{wins}</span>
          <span className="text-muted-foreground mx-1">/</span>
          <span className="text-blue-400">{losses}</span>
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">승률</p>
        <p className="text-2xl font-bold tabular-nums">{winRate}%</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">총 손익</p>
        <p
          className={`text-2xl font-bold tabular-nums ${
            totalPnl > 0
              ? "text-red-400"
              : totalPnl < 0
                ? "text-blue-400"
                : ""
          }`}
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          {formatKRW(totalPnl)}
        </p>
      </div>
    </div>
  );
}

// ── 매매 내역 테이블 ──

function RecordTable({
  records,
  password,
  onDeleted,
}: {
  records: FuturesRecord[];
  password: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    setDeleting(id);
    try {
      await fetch("/api/futures-trading", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-password": password,
        },
        body: JSON.stringify({ id }),
      });
      onDeleted();
    } finally {
      setDeleting(null);
    }
  };

  if (records.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">
          아직 기록이 없습니다. 위에서 매매를 입력해보세요.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* PC 테이블 */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-3 py-2.5 font-medium">날짜</th>
              <th className="text-center px-3 py-2.5 font-medium">방향</th>
              <th className="text-left px-3 py-2.5 font-medium">진입</th>
              <th className="text-left px-3 py-2.5 font-medium">청산</th>
              <th className="text-right px-3 py-2.5 font-medium">계약</th>
              <th className="text-right px-3 py-2.5 font-medium">손익</th>
              <th className="text-left px-3 py-2.5 font-medium">메모</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors"
              >
                <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                  {r.date}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      r.direction === "long"
                        ? "bg-red-500/15 text-red-400"
                        : "bg-blue-500/15 text-blue-400"
                    }`}
                  >
                    {r.direction === "long" ? "롱" : "숏"}
                  </span>
                </td>
                <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                  {r.entryTime} / {r.entryPoint}
                </td>
                <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                  {r.exitTime} / {r.exitPoint}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.contracts}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                    r.pnl > 0 ? "text-red-400" : r.pnl < 0 ? "text-blue-400" : ""
                  }`}
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  {formatKRW(r.pnl)}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground max-w-[200px] truncate">
                  {r.memo}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deleting === r.id}
                    className="text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="sm:hidden flex flex-col gap-3">
        {records.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm tabular-nums">{r.date}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                    r.direction === "long"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-blue-500/15 text-blue-400"
                  }`}
                >
                  {r.direction === "long" ? "롱" : "숏"}
                </span>
              </div>
              <button
                onClick={() => handleDelete(r.id)}
                disabled={deleting === r.id}
                className="text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-1">
              <span>
                진입 {r.entryTime} / {r.entryPoint}
              </span>
              <span>→</span>
              <span>
                청산 {r.exitTime} / {r.exitPoint}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {r.contracts}계약
              </span>
              <span
                className={`text-sm font-bold tabular-nums ${
                  r.pnl > 0 ? "text-red-400" : r.pnl < 0 ? "text-blue-400" : ""
                }`}
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                {formatKRW(r.pnl)}
              </span>
            </div>
            {r.memo && (
              <p className="mt-2 text-xs text-muted-foreground">{r.memo}</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ── 메인 페이지 ──

export default function FuturesTradingPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [records, setRecords] = useState<FuturesRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRecords = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/futures-trading", {
        headers: { "x-password": password },
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  if (!password) {
    return <PasswordGate onAuth={setPassword} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-8">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-tight">
            선물매매 검증
          </h1>
          <p className="text-sm text-muted-foreground">
            매매 기록을 남기고, 패턴을 찾고, 실력을 검증합니다.
          </p>
        </header>

        <div className="space-y-6">
          <RecordForm password={password} onAdded={fetchRecords} />

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            </div>
          ) : (
            <>
              <Stats records={records} />
              <RecordTable
                records={records}
                password={password}
                onDeleted={fetchRecords}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
