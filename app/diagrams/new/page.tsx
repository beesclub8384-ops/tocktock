"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

const C = {
  colors:  ["#4F6EF7","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899","#F97316"],
  lights:  ["#EEF1FF","#ECFDF5","#FFFBEB","#FEF2F2","#F5F3FF","#ECFEFF","#FDF2F8","#FFF7ED"],
  borders: ["#C7D0FA","#A7F3D0","#FDE68A","#FECACA","#DDD6FE","#A5F3FC","#FBCFE8","#FED7AA"],
};
const col = (i: number) => C.colors[i % C.colors.length];
const light = (i: number) => C.lights[i % C.lights.length];
const bord = (i: number) => C.borders[i % C.borders.length];

type Node = { label: string; detail: string; ai_added: boolean };
type DiagramResult = { type: "hub" | "timeline"; center: string; nodes: Node[] };

function HubDiagram({ center, nodes, selected, onSelect }: {
  center: string; nodes: Node[]; selected: number | null; onSelect: (i: number | null) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [sz, setSz] = useState({ w: 500, h: 440 });
  useEffect(() => {
    const upd = () => { if (ref.current) setSz({ w: ref.current.clientWidth, h: ref.current.clientHeight }); };
    upd(); window.addEventListener("resize", upd); return () => window.removeEventListener("resize", upd);
  }, []);
  const cx = sz.w / 2, cy = sz.h / 2;
  const r = Math.min(sz.w, sz.h) * 0.34;
  const pos = nodes.map((_, i) => {
    const a = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  return (
    <svg ref={ref} width="100%" height="100%" style={{ minHeight: 380 }}>
      {pos.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y}
          stroke={selected === i ? col(i) : "#DDE1F0"}
          strokeWidth={selected === i ? 2.5 : 1.5}
          strokeDasharray={selected === i ? "" : "6 4"}
          style={{ transition: "all .3s" }} />
      ))}
      <circle cx={cx} cy={cy} r={48} fill="#1E1E2E" />
      <circle cx={cx} cy={cy} r={44} fill="#2A2A3E" />
      <foreignObject x={cx - 36} y={cy - 20} width={72} height={40}>
        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1.3, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>{center}</div>
      </foreignObject>
      {pos.map((p, i) => {
        const sel = selected === i;
        return (
          <g key={i} style={{ cursor: "pointer" }} onClick={() => onSelect(sel ? null : i)}>
            <circle cx={p.x} cy={p.y} r={sel ? 44 : 40}
              fill={sel ? col(i) : light(i)} stroke={sel ? col(i) : bord(i)} strokeWidth={sel ? 0 : 2}
              style={{ transition: "all .25s", filter: sel ? "drop-shadow(0 4px 14px rgba(0,0,0,.2))" : "none" }} />
            <foreignObject x={p.x - 33} y={p.y - 18} width={66} height={36}>
              <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: sel ? "#fff" : col(i), lineHeight: 1.3, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", wordBreak: "keep-all" }}>
                {nodes[i].label}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

function TimelineDiagram({ nodes, selected, onSelect }: {
  nodes: Node[]; selected: number | null; onSelect: (i: number | null) => void;
}) {
  const NW = 130, NH = 56, GAP = 52, PAD = 36;
  const cols = Math.min(nodes.length, 4);
  const svgW = cols * (NW + GAP) - GAP + PAD * 2;
  const svgH = Math.ceil(nodes.length / cols) * (NH + 72) + PAD * 2;
  const pos = nodes.map((_, i) => {
    const row = Math.floor(i / cols);
    const c = row % 2 === 0 ? i % cols : (cols - 1 - (i % cols));
    return { x: PAD + c * (NW + GAP), y: PAD + row * (NH + 72) };
  });
  return (
    <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ minHeight: 300 }}>
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#CBD5E1" /></marker>
        <marker id="arr-sel" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#4F6EF7" /></marker>
      </defs>
      {pos.map((p, i) => {
        if (i >= nodes.length - 1) return null;
        const n = pos[i + 1];
        const row = Math.floor(i / cols), nRow = Math.floor((i + 1) / cols);
        const cx1 = p.x + NW / 2, cy1 = p.y + NH / 2, cx2 = n.x + NW / 2, cy2 = n.y + NH / 2;
        const sel = selected === i || selected === i + 1;
        const stroke = sel ? "#4F6EF7" : "#CBD5E1";
        const marker = sel ? "url(#arr-sel)" : "url(#arr)";
        if (row === nRow) {
          const dir = row % 2 === 0 ? 1 : -1;
          return <line key={i} x1={cx1 + dir*NW/2} y1={cy1} x2={cx2 - dir*NW/2} y2={cy2} stroke={stroke} strokeWidth={sel?2:1.5} markerEnd={marker} style={{transition:"all .3s"}} />;
        }
        const midY = cy1 + 36;
        return <polyline key={i} fill="none" points={`${cx1},${cy1+NH/2} ${cx1},${midY} ${cx2},${midY} ${cx2},${cy2-NH/2}`} stroke={stroke} strokeWidth={sel?2:1.5} markerEnd={marker} style={{transition:"all .3s"}} />;
      })}
      {pos.map((p, i) => {
        const sel = selected === i;
        return (
          <g key={i} style={{ cursor: "pointer" }} onClick={() => onSelect(sel ? null : i)}>
            <circle cx={p.x+NW/2} cy={p.y-14} r={13} fill={sel?col(i):"#fff"} stroke={col(i)} strokeWidth={2} />
            <text x={p.x+NW/2} y={p.y-10} textAnchor="middle" fontSize={11} fontWeight={800} fill={sel?"#fff":col(i)}>{i+1}</text>
            <rect x={p.x} y={p.y} width={NW} height={NH} rx={12} fill={sel?col(i):light(i)} stroke={sel?col(i):bord(i)} strokeWidth={sel?0:1.5} style={{transition:"all .25s", filter:sel?"drop-shadow(0 4px 14px rgba(0,0,0,.18))":"none"}} />
            <foreignObject x={p.x+6} y={p.y+4} width={NW-12} height={NH-8}>
              <div style={{ textAlign:"center", fontSize:11, fontWeight:700, color:sel?"#fff":col(i), lineHeight:1.35, display:"flex", alignItems:"center", justifyContent:"center", height:"100%", wordBreak:"keep-all" }}>{nodes[i].label}</div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

export default function NewDiagramPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [result, setResult] = useState<DiagramResult | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    if (!text.trim()) return;
    setLoading(true); setError(""); setSelected(null); setResult(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `You are an expert at converting text into clear, insightful diagrams. Do the following:
1. Readability: Distill each node label to its core meaning (max 12 Korean chars).
2. Intuitiveness: If steps or causal links are missing, add intermediate nodes to complete the flow.
3. Logic: In each detail field, add 1-2 sentences of your own insight about significance or implications not in the original text.
Determine type: if the text describes a sequence, steps, or flow use "timeline". Otherwise use "hub".
Return ONLY a valid JSON object with no extra text, no markdown fences:
{"type":"timeline or hub","center":"main topic max 10 Korean chars","nodes":[{"label":"max 12 Korean chars","detail":"3-5 sentences in Korean including AI insight","ai_added":false}]}
Set ai_added to true only for nodes you invented. Include 3-5 nodes maximum. Keep each detail field under 100 Korean characters.
Text: ${text}`
          }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const raw = data.content.filter((b: {type:string}) => b.type === "text").map((b: {text:string}) => b.text).join("");
      const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("JSON을 찾을 수 없습니다.");
      setResult(JSON.parse(raw.slice(start, end + 1)));
    } catch (e: unknown) {
      setError(`오류: ${e instanceof Error ? e.message : "다시 시도해주세요."}`);
    }
    setLoading(false);
  };

  const publish = async () => {
    if (!result) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/diagrams/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || result.center, ...result }),
      });
      if (!res.ok) throw new Error("저장 실패");
      router.push("/money-flow");
    } catch (e: unknown) {
      setError(`게시 오류: ${e instanceof Error ? e.message : "다시 시도해주세요."}`);
    }
    setPublishing(false);
  };

  const typeLabel = result?.type === "timeline" ? "⏱ 순서 / 흐름형" : result?.type === "hub" ? "◎ 개념 / 카테고리형" : null;

  return (
    <div style={{ fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif", minHeight:"100vh", background:"#F8F9FC", display:"flex", flexDirection:"column" }}>
      <div style={{ padding:"20px 24px 0", display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:21, fontWeight:800, color:"#1E1E2E", letterSpacing:"-0.5px" }}>✦ 다이어그램 생성기</span>
        <span style={{ fontSize:12, background:"#EEF1FF", color:"#4F6EF7", padding:"3px 10px", borderRadius:20, fontWeight:600 }}>AI 자동 구조 감지 + 보완</span>
      </div>
      <div style={{ display:"flex", flex:1, gap:16, padding:20, flexWrap:"wrap" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:12, width:272, flexShrink:0 }}>
          <div style={{ background:"#fff", borderRadius:16, padding:16, boxShadow:"0 1px 8px rgba(0,0,0,.07)" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#444", marginBottom:8 }}>📋 텍스트 입력</div>
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder={"어떤 텍스트든 붙여넣으세요.\n\n• 순서/단계 → 타임라인\n• 개념/카테고리 → 허브"}
              style={{ width:"100%", minHeight:160, border:"1.5px solid #E5E7EB", borderRadius:10, padding:"10px 12px", fontSize:13, lineHeight:1.6, resize:"vertical", outline:"none", color:"#333", boxSizing:"border-box", background:"#FAFAFA" }}
              onFocus={e => e.target.style.borderColor="#4F6EF7"}
              onBlur={e => e.target.style.borderColor="#E5E7EB"} />
            <button onClick={generate} disabled={loading || !text.trim()}
              style={{ marginTop:10, width:"100%", padding:"11px 0", borderRadius:10, border:"none", background:loading||!text.trim()?"#C7D0FA":"linear-gradient(135deg,#4F6EF7,#7C3AED)", color:"#fff", fontWeight:700, fontSize:14, cursor:loading||!text.trim()?"not-allowed":"pointer" }}>
              {loading ? "⏳ 분석 중..." : "✦ 다이어그램 생성"}
            </button>
            {error && <div style={{ marginTop:8, fontSize:12, color:"#EF4444", lineHeight:1.5 }}>{error}</div>}
          </div>
          {result && (
            <div style={{ background:"#fff", borderRadius:16, padding:16, boxShadow:"0 1px 8px rgba(0,0,0,.07)" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#444", marginBottom:8 }}>📌 게시 제목</div>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder={result.center}
                style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box" }}
                onFocus={e => e.target.style.borderColor="#10B981"}
                onBlur={e => e.target.style.borderColor="#E5E7EB"} />
              <button onClick={publish} disabled={publishing}
                style={{ marginTop:10, width:"100%", padding:"11px 0", borderRadius:10, border:"none", background:publishing?"#A7F3D0":"linear-gradient(135deg,#10B981,#059669)", color:"#fff", fontWeight:700, fontSize:14, cursor:publishing?"not-allowed":"pointer" }}>
                {publishing ? "게시 중..." : "🚀 돈의 흐름에 게시"}
              </button>
            </div>
          )}
          {selected !== null && result?.nodes && (
            <div style={{ background:"#fff", borderRadius:16, padding:16, boxShadow:"0 1px 8px rgba(0,0,0,.07)", borderLeft:`4px solid ${col(selected)}` }}>
              <div style={{ fontSize:12, color:"#888", marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                {result.type === "timeline" ? `${selected+1}번째 단계` : "📌 세부 내용"}
                {result.nodes[selected].ai_added && <span style={{ fontSize:10, background:"#F0FDF4", color:"#10B981", border:"1px solid #A7F3D0", borderRadius:10, padding:"1px 7px", fontWeight:700 }}>✦ AI 추가</span>}
              </div>
              <div style={{ fontSize:15, fontWeight:700, color:col(selected), marginBottom:8 }}>{result.nodes[selected].label}</div>
              <div style={{ fontSize:13, color:"#333", lineHeight:1.8 }}>{result.nodes[selected].detail}</div>
              <div style={{ marginTop:10, paddingTop:8, borderTop:"1px solid #F0F0F5", fontSize:11, color:"#C0C4D0" }}>✦ AI가 맥락·의의를 보완한 설명입니다</div>
              <button onClick={() => setSelected(null)} style={{ marginTop:6, fontSize:12, color:"#aaa", background:"none", border:"none", cursor:"pointer", padding:0 }}>✕ 닫기</button>
            </div>
          )}
        </div>
        <div style={{ flex:1, background:"#fff", borderRadius:20, boxShadow:"0 1px 8px rgba(0,0,0,.07)", overflow:"hidden", minWidth:280, minHeight:420, position:"relative" }}>
          {typeLabel && <div style={{ position:"absolute", top:14, left:16, fontSize:12, fontWeight:700, color:"#4F6EF7", background:"#EEF1FF", padding:"4px 12px", borderRadius:20, zIndex:10 }}>{typeLabel}</div>}
          {!result && !loading && (
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:"#C5C8D6", gap:12, textAlign:"center", padding:24 }}>
              <div style={{ fontSize:48 }}>◎</div>
              <div style={{ fontSize:14, fontWeight:600 }}>텍스트를 입력하고 생성 버튼을 눌러주세요</div>
            </div>
          )}
          {loading && (
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14 }}>
              <div style={{ width:36, height:36, border:"3px solid #EEF1FF", borderTop:"3px solid #4F6EF7", borderRadius:"50%", animation:"spin .8s linear infinite" }} />
              <div style={{ fontSize:13, color:"#888" }}>구조 분석 + AI 보완 중...</div>
            </div>
          )}
          {result?.type === "hub" && <div style={{ width:"100%", height:"100%", minHeight:420 }}><HubDiagram center={result.center} nodes={result.nodes} selected={selected} onSelect={setSelected} /></div>}
          {result?.type === "timeline" && <div style={{ width:"100%", height:"100%", minHeight:420, overflowY:"auto", padding:"50px 28px 28px", boxSizing:"border-box" }}><TimelineDiagram nodes={result.nodes} selected={selected} onSelect={setSelected} /></div>}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
