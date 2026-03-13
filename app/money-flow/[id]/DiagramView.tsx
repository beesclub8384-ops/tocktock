"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";

const C = {
  colors:  ["#4F6EF7","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899","#F97316"],
  lights:  ["#EEF1FF","#ECFDF5","#FFFBEB","#FEF2F2","#F5F3FF","#ECFEFF","#FDF2F8","#FFF7ED"],
  borders: ["#C7D0FA","#A7F3D0","#FDE68A","#FECACA","#DDD6FE","#A5F3FC","#FBCFE8","#FED7AA"],
};
const col = (i: number) => C.colors[i % C.colors.length];
const light = (i: number) => C.lights[i % C.lights.length];
const bord = (i: number) => C.borders[i % C.borders.length];

type Node = { label: string; detail: string; ai_added: boolean };
type DiagramData = { type: "hub" | "timeline"; center: string; nodes: Node[]; title: string; createdAt: string };

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
  const rows = Math.ceil(nodes.length / cols);
  const svgW = cols * (NW + GAP) - GAP + PAD * 2;
  const svgH = rows * (NH + 72) + PAD * 2;
  const pos = nodes.map((_, i) => {
    const row = Math.floor(i / cols);
    const c = row % 2 === 0 ? i % cols : (cols - 1 - (i % cols));
    return { x: PAD + c * (NW + GAP), y: PAD + row * (NH + 72) };
  });
  return (
    <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ minHeight: 300 }}>
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#CBD5E1" />
        </marker>
        <marker id="arr-sel" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#4F6EF7" />
        </marker>
      </defs>
      {pos.map((p, i) => {
        if (i >= nodes.length - 1) return null;
        const n = pos[i + 1];
        const row = Math.floor(i / cols), nRow = Math.floor((i + 1) / cols);
        const cx1 = p.x + NW / 2, cy1 = p.y + NH / 2;
        const cx2 = n.x + NW / 2, cy2 = n.y + NH / 2;
        const sel = selected === i || selected === i + 1;
        const stroke = sel ? "#4F6EF7" : "#CBD5E1";
        const marker = sel ? "url(#arr-sel)" : "url(#arr)";
        if (row === nRow) {
          const dir = row % 2 === 0 ? 1 : -1;
          return <line key={i} x1={cx1 + dir * NW / 2} y1={cy1} x2={cx2 - dir * NW / 2} y2={cy2}
            stroke={stroke} strokeWidth={sel ? 2 : 1.5} markerEnd={marker} style={{ transition: "all .3s" }} />;
        }
        const midY = cy1 + 36;
        return <polyline key={i} fill="none"
          points={`${cx1},${cy1 + NH / 2} ${cx1},${midY} ${cx2},${midY} ${cx2},${cy2 - NH / 2}`}
          stroke={stroke} strokeWidth={sel ? 2 : 1.5} markerEnd={marker} style={{ transition: "all .3s" }} />;
      })}
      {pos.map((p, i) => {
        const sel = selected === i;
        return (
          <g key={i} style={{ cursor: "pointer" }} onClick={() => onSelect(sel ? null : i)}>
            <circle cx={p.x + NW / 2} cy={p.y - 14} r={13}
              fill={sel ? col(i) : "#fff"} stroke={col(i)} strokeWidth={2} />
            <text x={p.x + NW / 2} y={p.y - 10} textAnchor="middle" fontSize={11} fontWeight={800} fill={sel ? "#fff" : col(i)}>{i + 1}</text>
            <rect x={p.x} y={p.y} width={NW} height={NH} rx={12}
              fill={sel ? col(i) : light(i)} stroke={sel ? col(i) : bord(i)} strokeWidth={sel ? 0 : 1.5}
              style={{ transition: "all .25s", filter: sel ? "drop-shadow(0 4px 14px rgba(0,0,0,.18))" : "none" }} />
            <foreignObject x={p.x + 6} y={p.y + 4} width={NW - 12} height={NH - 8}>
              <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: sel ? "#fff" : col(i), lineHeight: 1.35, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", wordBreak: "keep-all" }}>
                {nodes[i].label}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

export default function DiagramView({ data }: { data: DiagramData }) {
  const [selected, setSelected] = useState<number | null>(null);
  const sel = selected;
  return (
    <div style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", minHeight: "100vh", background: "#F8F9FC" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <Link href="/money-flow" style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>← 돈의 흐름</Link>
          <span style={{ color: "#DDE1F0" }}>|</span>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E1E2E", margin: 0 }}>{data.title || data.center}</h1>
          <span style={{ fontSize: 12, background: "#EEF1FF", color: "#4F6EF7", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>
            {data.type === "timeline" ? "⏱ 순서/흐름형" : "◎ 개념/카테고리형"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, background: "#fff", borderRadius: 20, boxShadow: "0 1px 8px rgba(0,0,0,.07)", minHeight: 440, minWidth: 280, position: "relative", overflow: "hidden" }}>
            {data.type === "hub" && (
              <div style={{ width: "100%", height: "100%", minHeight: 440 }}>
                <HubDiagram center={data.center} nodes={data.nodes} selected={sel} onSelect={setSelected} />
              </div>
            )}
            {data.type === "timeline" && (
              <div style={{ width: "100%", height: "100%", minHeight: 440, overflowY: "auto", padding: "50px 28px 28px", boxSizing: "border-box" }}>
                <TimelineDiagram nodes={data.nodes} selected={sel} onSelect={setSelected} />
              </div>
            )}
          </div>
          {sel !== null && (
            <div style={{ width: 260, background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,.07)", borderLeft: `4px solid ${col(sel)}`, alignSelf: "flex-start" }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 6, display: "flex", gap: 6, alignItems: "center" }}>
                {data.type === "timeline" ? `${sel + 1}번째 단계` : "📌 세부 내용"}
                {data.nodes[sel].ai_added && <span style={{ fontSize: 10, background: "#F0FDF4", color: "#10B981", border: "1px solid #A7F3D0", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>✦ AI 추가</span>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: col(sel), marginBottom: 10 }}>{data.nodes[sel].label}</div>
              <div style={{ fontSize: 13, color: "#333", lineHeight: 1.8 }}>{data.nodes[sel].detail}</div>
              <button onClick={() => setSelected(null)} style={{ marginTop: 12, fontSize: 12, color: "#aaa", background: "none", border: "none", cursor: "pointer", padding: 0 }}>✕ 닫기</button>
            </div>
          )}
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#C0C4D0" }}>
          {new Date(data.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} 게시
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
