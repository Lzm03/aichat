import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icons } from "../components/icons";

// ---- mock 資料（接後端後由接口取代）----
const skillsData = [
  { label: "記憶 (Remember)", value: 70, desc: "提取事實與基本概念的能力。" },
  { label: "理解 (Understand)", value: 80, desc: "解釋想法與說明概念的邏輯。" },
  { label: "應用 (Apply)", value: 85, desc: "將所學知識運用於新情境中。" },
  { label: "分析 (Analyze)", value: 95, desc: "拆解資訊並找出各部分關聯。" },
  { label: "評價 (Evaluate)", value: 85, desc: "針對觀點與決策提出批判與辯護。" },
  { label: "創造 (Create)", value: 95, desc: "整合資訊以產出全新的原創作品。" },
];

// ---- 六軸雷達圖（自繪 SVG，移植自 3001 成就博物館；色彩走主題 token）----
type SkillDimension = { label: string; value: number; desc: string };

const RadarChart: React.FC<{ data: SkillDimension[] }> = ({ data }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const size = 400;
  const center = size / 2;
  const maxRadius = 130;
  const levels = 5;

  const getPoint = (index: number, value: number, radius: number = maxRadius) => {
    const angle = (Math.PI / 3) * index - Math.PI / 2;
    const r = (value / 100) * radius;
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r, angle };
  };

  const getPolygonPoints = (radius: number) =>
    data.map((_, index) => {
      const point = getPoint(index, 100, radius);
      return `${point.x},${point.y}`;
    }).join(" ");

  const centerPoints = data.map(() => `${center},${center}`).join(" ");
  const animatedPoints = data
    .map((item, index) => {
      const p = getPoint(index, item.value);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="bloomGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818CF8" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#A855F7" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* 網格環 */}
        {Array.from({ length: levels }).map((_, i) => {
          const radius = maxRadius * ((i + 1) / levels);
          return (
            <polygon
              key={i}
              points={getPolygonPoints(radius)}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1"
            />
          );
        })}

        {/* 軸線 */}
        {data.map((_, index) => {
          const point = getPoint(index, 100);
          return (
            <line
              key={index}
              x1={center}
              y1={center}
              x2={point.x}
              y2={point.y}
              stroke="var(--border)"
              strokeWidth="1"
            />
          );
        })}

        {/* 數據多邊形動畫 */}
        <motion.polygon
          initial={{ points: centerPoints }}
          animate={{ points: animatedPoints }}
          transition={{ duration: 1, ease: "easeOut" }}
          fill="url(#bloomGradient)"
          stroke="#6366F1"
          strokeWidth="3"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />

        {/* 節點 + 標籤 */}
        {data.map((item, index) => {
          const labelOffset = 35;
          const labelPoint = getPoint(index, 100, maxRadius + labelOffset);
          const nodePoint = getPoint(index, item.value);
          const { angle } = labelPoint;
          const cosAngle = Math.cos(angle);

          let textAnchor: "start" | "middle" | "end" = "middle";
          if (cosAngle > 0.1) textAnchor = "start";
          else if (cosAngle < -0.1) textAnchor = "end";

          return (
            <g
              key={index}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{ cursor: "pointer" }}
            >
              <circle cx={labelPoint.x} cy={labelPoint.y} r="30" fill="transparent" />
              <circle
                cx={nodePoint.x}
                cy={nodePoint.y}
                r={hoveredIndex === index ? 7 : 5}
                fill={hoveredIndex === index ? "#818CF8" : "#6366F1"}
                stroke="#FFFFFF"
                strokeWidth="2"
                style={{ transition: "r 0.2s" }}
              />
              <motion.text
                x={labelPoint.x}
                y={labelPoint.y}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.8 + index * 0.1 }}
                textAnchor={textAnchor}
                dominantBaseline="middle"
                style={{
                  fill: hoveredIndex === index ? "var(--accent-text)" : "var(--text-muted)",
                  fontSize: "14px",
                  fontWeight: 700,
                  transition: "fill 0.2s",
                }}
              >
                {item.label}
              </motion.text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {hoveredIndex !== null && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute right-4 top-4 z-20 max-w-[200px] rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] px-4 py-3 text-sm shadow-[var(--shadow-card)] backdrop-blur-sm"
          >
            <div className="mb-1 font-bold" style={{ color: "var(--accent-text)" }}>{data[hoveredIndex].label}</div>
            <div className="leading-snug" style={{ color: "var(--text-muted)" }}>{data[hoveredIndex].desc}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const StudentAchievementsPage: React.FC = () => {
  return (
    <div className="min-h-screen w-full bg-[var(--bg-app)] text-[var(--text-body)]">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-8 lg:px-8">
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-body)] transition hover:bg-[var(--bg-subtle)]"
        >
          <Icons.back className="h-4 w-4" />
          返回工作台
        </a>

        <div className="mt-6 text-center">
          <h1 className="text-3xl font-black tracking-tight text-[var(--text-main)]">🏆 我的成就</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">記錄你的成長軌跡，見證每一個進步</p>
        </div>

        {/* ---- 我的學習維度 ---- */}
        <section className="mt-8 rounded-[24px] border border-[var(--border-soft)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-card)]">
          <h2 className="text-center text-xl font-black text-[var(--text-main)]">我的學習維度</h2>
          <div className="relative mx-auto mt-6 aspect-square max-w-[400px]">
            <RadarChart data={skillsData} />
          </div>
        </section>

        {/* ---- 統計卡：commit 3 實作（已對話機器人/已聊知識點/今日互動/累計訊息）---- */}

        {/* ---- 勳章牆：commit 2 實作（12 個 + 神秘剪影 + 展開全部）---- */}
      </div>
    </div>
  );
};
