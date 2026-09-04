import { uiText, uiTemplate, uiLocale, uiError } from '../utils/uiI18n';
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icons } from "../components/icons";
import { API_BASE } from "../utils/api";

const emptySkillsData = [
  { label: "記憶 (Remember)", value: 0, desc: "提取事實與概念", answered: 0, correct: 0 },
  { label: "理解 (Understand)", value: 0, desc: "解釋想法與邏輯", answered: 0, correct: 0 },
  { label: "應用 (Apply)", value: 0, desc: "運用於新情境", answered: 0, correct: 0 },
  { label: "分析 (Analyze)", value: 0, desc: "拆解資訊的關聯", answered: 0, correct: 0 },
  { label: "評價 (Evaluate)", value: 0, desc: "批判與辯護", answered: 0, correct: 0 },
  { label: "創造 (Create)", value: 0, desc: "產出原創作品", answered: 0, correct: 0 },
];

// ---- 六軸雷達圖（自繪 SVG，移植自 3001 成就博物館；色彩走主題 token）----
type SkillDimension = { label: string; value: number; desc: string; answered?: number; correct?: number };

const RadarChart: React.FC<{ data: SkillDimension[] }> = ({ data }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const size = 400;
  const center = size / 2;
  const maxRadius = 130;
  const levels = 5;
  const hasData = data.some((item) => item.value > 0);

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
        {hasData ? (
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
        ) : null}

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
              {item.value > 0 ? (
                <circle
                  cx={nodePoint.x}
                  cy={nodePoint.y}
                  r={hoveredIndex === index ? 7 : 5}
                  fill={hoveredIndex === index ? "#818CF8" : "#6366F1"}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  style={{ transition: "r 0.2s" }}
                />
              ) : null}
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
                {uiText(item.label)}
              </motion.text>
              {/* 常駐小字說明：位於維度名稱正下方 */}
              <motion.text
                x={labelPoint.x}
                y={labelPoint.y + 18}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.95 + index * 0.1 }}
                textAnchor={textAnchor}
                dominantBaseline="middle"
                style={{ fill: "var(--text-faint)", fontSize: "10px", fontWeight: 400 }}
              >
                {uiText(item.desc)}
              </motion.text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ---- 勳章牆 ----
// 12 個勳章（判定規則見對接文件）：前 6 個預設顯示，其餘經「展開全部」展示。

type StudentBadge = {
  id: string;
  name: string;
  emoji: string;
  description: string;      // 解鎖後背面：勳章意義
  unlockCondition: string;  // 未解鎖背面：解鎖條件
  gradient?: string;        // 解鎖正面漸變（色盤沿用 3001 勳章牆）
  unlocked: boolean;
  unlockedAt?: string;
};

const badgeDefinitions: StudentBadge[] = [
  { id: "first-voyage", name: "初次啟航", emoji: "🚀", description: "與 AI 夥伴完成第一次對話，學習之旅正式啟程", unlockCondition: "首次與 AI 夥伴對話", gradient: "linear-gradient(135deg, #3B82F6, #4F46E5)", unlocked: false },
  { id: "streak-rookie", name: "連勝新手", emoji: "🔥", description: "連續 5 天與夥伴對話，好習慣正在養成", unlockCondition: "連續 5 天與夥伴對話", gradient: "linear-gradient(135deg, #F59E0B, #F43F5E)", unlocked: false },
  { id: "early-bird", name: "早起之鳥", emoji: "🌅", description: "早上 6–10 點就開始學習，比太陽還勤奮", unlockCondition: "早上 6:00–10:00 學習", gradient: "linear-gradient(135deg, #F59E0B, #FBBF24)", unlocked: false },
  { id: "streak-master", name: "連勝高手", emoji: "🏆", description: "連續 10 天不間斷，堅持就是你的超能力", unlockCondition: "連續 10 天與夥伴對話", gradient: "linear-gradient(135deg, #F43F5E, #DB2777)", unlocked: false },
  { id: "stem-master", name: "STEM 大師", emoji: "🔢", description: "STEM 測驗拿下 85 分以上，數理科技小天才", unlockCondition: "STEM 測驗得分 ≥85", gradient: "linear-gradient(135deg, #8B5CF6, #7C3AED)", unlocked: false },
  { id: "word-wizard", name: "文字魔法師", emoji: "✍️", description: "與寫作夥伴對話 10 次以上，筆下生花", unlockCondition: "與寫作/語文夥伴對話 ≥10 次", gradient: "linear-gradient(135deg, #06B6D4, #0891B2)", unlocked: false },
  { id: "curious-baby", name: "好奇寶寶", emoji: "🤔", description: "累計發出 100 則訊息，十萬個為什麼", unlockCondition: "累計對話訊息 ≥100 則", gradient: "linear-gradient(135deg, #14B8A6, #0D9488)", unlocked: false },
  { id: "grammar-master", name: "語法大師", emoji: "📝", description: "英文文法測驗連續 5 次滿分", unlockCondition: "英文文法測驗連續 5 次滿分", gradient: "linear-gradient(135deg, #6366F1, #4F46E5)", unlocked: false },
  { id: "explorer", name: "知識探險家", emoji: "🔍", description: "跨越學科邊界，探索知識大陸", unlockCondition: "與 ≥4 個不同學科的夥伴對話", gradient: "linear-gradient(135deg, #10B981, #059669)", unlocked: false },
  { id: "flash", name: "閃電俠", emoji: "⚡", description: "10 分鐘內連續完成 5 次對話，快如閃電", unlockCondition: "10 分鐘內完成 5 次對話", gradient: "linear-gradient(135deg, #FBBF24, #F59E0B)", unlocked: false },
  { id: "perfectionist", name: "完美主義者", emoji: "💎", description: "連續 3 次測驗全對，分毫不差", unlockCondition: "連續 3 次測驗全對", gradient: "linear-gradient(135deg, #A78BFA, #8B5CF6)", unlocked: false },
  { id: "all-rounder", name: "全能學者", emoji: "🎓", description: "各學科知識點覆蓋率達 80% 以上", unlockCondition: "各學科知識點覆蓋 ≥80%", gradient: "linear-gradient(135deg, #F59E0B, #D97706)", unlocked: false },
];

const formatUnlockDate = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(uiLocale(), { month: 'short', day: 'numeric' });
};

// 翻牌卡：hover（桌面）＋點按（觸屏）雙觸發；未解鎖為神秘剪影
const BadgeCard: React.FC<{ badge: StudentBadge; index: number }> = ({ badge, index }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const rotateClass = isFlipped
    ? "[transform:rotateY(180deg)]"
    : "group-hover:[transform:rotateY(180deg)]";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03, duration: 0.4 }}
      whileTap={{ scale: 0.95 }}
      className="group relative aspect-square cursor-pointer [perspective:1000px]"
      onClick={() => setIsFlipped((v) => !v)}
    >
      <div className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${rotateClass}`}>
        {/* 正面：解鎖＝專屬漸變＋emoji；未解鎖＝神秘剪影 */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center rounded-[24px] p-4 [backface-visibility:hidden] ${
            badge.unlocked
              ? "shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
              : "border-2 border-dashed border-[var(--border)] bg-[var(--bg-subtle-2)]"
          }`}
          style={badge.unlocked ? { background: badge.gradient ?? "linear-gradient(135deg, #6366F1, #8B5CF6)" } : undefined}
        >
          {badge.unlocked ? (
            <>
              <span className="text-5xl" aria-hidden="true">{badge.emoji}</span>
              <p className="mt-2 text-center text-xs font-bold leading-4 text-white">{uiText(badge.name)}</p>
              {formatUnlockDate(badge.unlockedAt) && (
                <span className="mt-1.5 text-[10px] text-white/80">{uiText(formatUnlockDate(badge.unlockedAt))}</span>
              )}
            </>
          ) : (
            <>
              <span className="text-5xl font-black text-[var(--text-faint)]" aria-hidden="true">?</span>
              <p className="mt-2 text-[11px] font-bold text-[var(--text-faint)]">{uiText("神祕徽章")}</p>
            </>
          )}
        </div>

        {/* 背面：解鎖＝意義；未解鎖＝解鎖條件 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[24px] border-2 border-[var(--border)] bg-[var(--bg-card)] p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <span className={`text-4xl ${badge.unlocked ? "" : "opacity-60 grayscale"}`} aria-hidden="true">{badge.emoji}</span>
          <p className="mt-2 text-center text-xs font-bold text-[var(--text-main)]">{uiText(badge.name)}</p>
          {badge.unlocked ? (
            <p className="mt-2 text-center text-[11px] font-semibold leading-5 text-[var(--text-muted)]">{uiText(badge.description)}</p>
          ) : (
            <p className="mt-2 text-center text-[11px] font-semibold leading-5 text-[var(--text-muted)]">🔒 {uiText(badge.unlockCondition)}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ---- 統計卡 ----
// 4 個可直接由後端聚合的指標（見對接文件）：mock 先行
type StudentStats = {
  botsTalked: number;       // conversations DISTINCT bot_id
  topicsTalked: number;     // conversations DISTINCT topic_id
  todayInteractions: number; // bot_interaction_events
  totalMessages: number;    // conversation_messages role='user' 數
  currentStreak: number;    // 當前連勝天數（HKT 日界）
};

const emptyStats: StudentStats = { botsTalked: 0, topicsTalked: 0, todayInteractions: 0, totalMessages: 0, currentStreak: 0 };

const statCards: { key: keyof StudentStats; icon: string; label: string; color: string }[] = [
  { key: "botsTalked", icon: "🤖", label: "已對話機器人", color: "#6366F1" },
  { key: "topicsTalked", icon: "💡", label: "已聊知識點", color: "#8B5CF6" },
  { key: "todayInteractions", icon: "⚡", label: "今日互動", color: "#F59E0B" },
  { key: "totalMessages", icon: "💬", label: "累計訊息", color: "#3B82F6" },
];

// 白玻璃卡 + 主題色描邊；hover 上浮 + 彩影（沿用 3001 StatsCards）
const StatCard: React.FC<{ icon: string; value: number; label: string; color: string; index: number }> = ({
  icon,
  value,
  label,
  color,
  index,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.1, duration: 0.5 }}
  >
    <div
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = `0 20px 40px ${color}30`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "";
      }}
      className="rounded-[24px] bg-[var(--bg-card)] p-6 text-center shadow-[var(--shadow-card)] transition-all duration-300"
      style={{ border: `2px solid ${color}20` }}
    >
      <div className="text-[40px] leading-none" aria-hidden="true">{icon}</div>
      <p className="mt-3 text-3xl font-black text-[var(--text-main)]">{value}</p>
      <p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">{uiText(label)}</p>
    </div>
  </motion.div>
);

// ---- 連勝之路 ----
// 里程碑節點為前端配置（可調）；10 天終點對應「連勝高手」勳章
const streakMilestones = [3, 5, 7, 10];

const StreakRoad: React.FC<{ userStreak: number }> = ({ userStreak }) => {
  const nextMilestone = streakMilestones.find((m) => m > userStreak);

  return (
    <section
      className="mt-8 rounded-[24px] p-8 shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
      style={{ background: "linear-gradient(135deg, #F59E0B, #F43F5E, #8B5CF6)" }}
    >
      <h2 className="text-center text-2xl font-black text-white">{uiText("🔥 連勝之路")}</h2>

      <div className="mx-auto mt-8 flex max-w-[800px] flex-wrap items-center justify-between gap-5">
        {streakMilestones.map((milestone, index) => {
          const reached = userStreak >= milestone;
          const passed = userStreak > milestone;
          return (
            <React.Fragment key={milestone}>
              <div className="flex flex-col items-center gap-2">
                <motion.div
                  animate={reached ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={reached ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : undefined}
                  className="flex h-14 w-14 items-center justify-center rounded-full text-[32px]"
                  style={{
                    background: reached ? "white" : "rgba(255, 255, 255, 0.2)",
                    boxShadow: reached ? "0 8px 24px rgba(255, 255, 255, 0.5)" : "none",
                  }}
                >
                  {reached ? "🏆" : "🔒"}
                </motion.div>
                <p className="text-xs font-bold text-white">{milestone}{uiText("天")}</p>
              </div>

              {index < streakMilestones.length - 1 && (
                <div
                  className="h-1 min-w-[40px] flex-1 rounded-full transition-all duration-500"
                  style={{ background: passed ? "white" : "rgba(255, 255, 255, 0.2)" }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <p className="mt-6 text-center text-sm font-semibold text-white/90">
        {nextMilestone
          ? uiTemplate("已連續學習 {0} 天，再堅持 {1} 天解鎖下一個里程碑！", userStreak, nextMilestone - userStreak)
          : uiText("🎉 恭喜！你已達成 10 天最高里程碑！")}
      </p>
    </section>
  );
};

export const StudentAchievementsPage: React.FC = () => {
  const [badges, setBadges] = useState<StudentBadge[]>(badgeDefinitions);
  const [stats, setStats] = useState<StudentStats>(emptyStats);
  const [skills, setSkills] = useState<SkillDimension[]>(emptySkillsData);
  const [skillsError, setSkillsError] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setSkillsError("");
    fetch(`${API_BASE}/api/student/achievements`)
      .then(async (res) => {
        const responseText = await res.text();
        let data: any = {};
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch {
          throw new Error(`API 回傳格式錯誤（${res.status} ${res.url}）`);
        }
        if (!res.ok) throw new Error(data?.error || "載入失敗");
        if (Array.isArray(data?.badges)) {
          const statusById = new Map(data.badges.map((item: any) => [String(item?.id || ""), item]));
          setBadges(badgeDefinitions.map((definition) => {
            const status: any = statusById.get(definition.id);
            return {
              ...definition,
              unlocked: Boolean(status?.unlocked),
              unlockedAt: status?.unlockedAt ? String(status.unlockedAt) : undefined,
            };
          }));
        }
        if (data?.stats && typeof data.stats.botsTalked === "number") {
          setStats(data.stats);
        }
        if (Array.isArray(data?.skills) && data.skills.length === 6) {
          setSkills(data.skills.map((item: any, index: number) => ({
            label: String(item?.label || emptySkillsData[index].label),
            value: Math.max(0, Math.min(100, Number(item?.value || 0))),
            desc: String(item?.desc || emptySkillsData[index].desc),
            answered: Number(item?.answered || 0),
            correct: Number(item?.correct || 0),
          })));
        }
      })
      .catch((error) => {
        setSkills(emptySkillsData);
        setStats(emptyStats);
        setBadges(badgeDefinitions);
        setSkillsError(error instanceof Error ? error.message : "載入學習維度失敗");
      });
  }, []);

  const visibleBadges = badges.slice(0, 6);
  const hiddenBadges = badges.slice(6);
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  return (
    <div className="min-h-screen w-full bg-[var(--bg-app)] text-[var(--text-body)]">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-8 lg:px-8">
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-body)] transition hover:bg-[var(--bg-subtle)]"
        >
          <Icons.back className="h-4 w-4" />{uiText("返回工作台")}</a>

        <div className="mt-6 text-center">
          <h1 className="text-3xl font-black tracking-tight text-[var(--text-main)]">{uiText("🏆 我的成就")}</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{uiText("記錄你的成長軌跡，見證每一個進步")}</p>
        </div>

        {/* ---- 我的學習維度 ---- */}
        <section className="mt-8 rounded-[24px] border border-[var(--border-soft)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-card)]">
          <h2 className="text-center text-xl font-black text-[var(--text-main)]">{uiText("我的學習維度")}</h2>
          <div className="relative mx-auto mt-6 aspect-square max-w-[400px]">
            <RadarChart data={skills} />
          </div>
          {skillsError ? (
            <p className="mt-2 text-center text-xs font-semibold text-rose-600">{uiText("學習維度暫時無法載入：")}{uiError(skillsError)}
            </p>
          ) : null}
        </section>

        {/* ---- 統計卡 ---- */}
        <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map((card, index) => (
            <StatCard key={card.key} icon={card.icon} value={stats[card.key]} label={uiText(card.label)} color={card.color} index={index} />
          ))}
        </section>

        {/* ---- 連勝之路 ---- */}
        <StreakRoad userStreak={stats.currentStreak ?? 0} />

        {/* ---- 勳章牆 ---- */}
        <section className="mt-8 rounded-[24px] border border-[var(--border-soft)] bg-[var(--bg-card)] p-8 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black text-[var(--text-main)]">{uiText("🏅 勳章收藏")}</h2>
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent-text)]">{uiText("已解鎖 ")}{unlockedCount} / {badges.length}
            </span>
          </div>

          {/* 前 6 個：預設顯示 */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {visibleBadges.map((badge, index) => (
              <BadgeCard key={badge.id} badge={badge} index={index} />
            ))}
          </div>

          {/* 後 6 個：展開全部 ▾ / 收起 ▴ */}
          {hiddenBadges.length > 0 && (
            <>
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2 text-xs font-bold text-[var(--text-muted)] transition hover:text-[var(--accent-text)]"
                >
                  {expanded ? uiText("收起") : uiText("展開全部")}
                  <Icons.down className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
                </button>
              </div>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                      {hiddenBadges.map((badge, index) => (
                        <BadgeCard key={badge.id} badge={badge} index={index} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
