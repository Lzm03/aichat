import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Icons } from "../components/icons";

// FAQ 分兩套：學生版與教師版（/help 共用頁面，App.tsx 依角色傳 variant）
const studentFaqs = [
  {
    q: "不夠 Token 怎麼辦？",
    a: "Token 是你與 AI 夥伴對話的額度，用完後暫時無法繼續對話。你可以聯絡客服專員為你調整方案或補充額度",
  },
  {
    q: "為何我的機器人沒有顯示測試題？",
    a: "如果夥伴卡片上沒有「測試題」標籤，代表老師尚未為這隻機器人配置測驗，可以手動刷新網頁或聯繫客服專員查詢。",
  },
  {
    q: "怎麼查看我的 Token 用量？",
    a: "學生首頁右上角的 Tokens 數字就是你的剩餘額度（剩餘 / 每月總額）。點擊旁邊的「？」圖示可以查看詳細說明。",
  },
  {
    q: "如何更換頭像或修改個人資料？",
    a: "點擊右上角頭像 → 帳戶中心，即可編輯頭像、用戶名，並在「安全設定」中修改密碼或電郵。",
  },
  {
    q: "如何更改密碼？",
    a: "帳戶中心 → 安全設定 → 修改密碼，輸入目前密碼與新密碼（至少 8 個字元）即可完成更新。",
  },
];

const teacherFaqs = [
  {
    q: "不夠對話次數怎麼辦",
    a: "對話次數是你與 AI 夥伴互動的額度，用完後暫時無法繼續對話。你可以聯絡客服專員為你調整方案或補充額度",
  },
  {
    q: "為何我的機器人沒有顯示測試題？",
    a: "如果夥伴卡片上沒有「測試題」標籤，代表你尚未為這隻機器人配置測驗，可以手動刷新網頁或聯繫客服專員查詢。",
  },
  {
    q: "怎麼查看我的對話次數用量？",
    a: "點擊教師首頁右上角使用次數，這裡就是你的目前使用額度",
  },
  {
    q: "如何更換頭像或修改個人資料？",
    a: "點擊右上角頭像 → 帳戶中心，即可編輯頭像、用戶名，並在「安全設定」中修改密碼或電郵。",
  },
  {
    q: "如何更改密碼？",
    a: "帳戶中心 → 安全設定 → 修改密碼，輸入目前密碼與新密碼（至少 8 個字元）即可完成更新。",
  },
];

const contacts = [
  { icon: "📞", label: "聯絡電話", lines: [
    { text: "+852 6825 7219", sub: "Mandy Lee", href: "tel:+85268257219" },
    { text: "+852 9218 8223", sub: "Becky Wong", href: "tel:+85292188223" },
  ]},
  { icon: "✉️", label: "官方電郵", lines: [
    { text: "info@chopreality.com", href: "mailto:info@chopreality.com" },
    { text: "info@indexacademy.io", href: "mailto:info@indexacademy.io" },
  ]},
];

export const HelpCenterPage: React.FC<{ variant?: "student" | "teacher" }> = ({ variant = "student" }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const faqs = variant === "teacher" ? teacherFaqs : studentFaqs;

  return (
    <div className="min-h-screen w-full bg-[var(--bg-app)] text-[var(--text-body)]">
      <div className="mx-auto w-full max-w-3xl px-6 py-8 lg:px-8">
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-body)] transition hover:bg-[var(--bg-subtle)]"
        >
          <Icons.back className="h-4 w-4" />
          返回工作台
        </a>

        <h1 className="mt-6 text-3xl font-black tracking-tight text-[var(--text-main)]">幫助中心</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">常見問題與聯絡方式</p>

        {/* ---- 常見問題（摺疊） ---- */}
        <section className="mt-8 space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={faq.q} className="overflow-hidden rounded-[20px] border border-[var(--border-soft)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                >
                  <span className="text-sm font-bold text-[var(--text-main)]">{faq.q}</span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-[var(--text-muted)] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <p className="border-t border-[var(--border-soft)] px-5 py-4 text-sm leading-7 text-[var(--text-muted)]">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </section>

        {/* ---- 方案説明入口（教師版） ---- */}
        {variant === "teacher" && (
          <section className="mt-8 flex flex-col items-center justify-between gap-4 rounded-[24px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-6 sm:flex-row">
            <div>
              <p className="text-sm font-bold text-[var(--text-main)]">PRO 方案説明</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">了解方案內容與權益</p>
            </div>
            <a
              href="/pro"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:brightness-110 active:scale-95"
            >
              查看方案説明
              <Icons.right className="h-4 w-4" />
            </a>
          </section>
        )}

        {/* ---- 聯絡方式 ---- */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          {contacts.map((group) => (
            <div key={group.label} className="rounded-[24px] border border-[var(--border-soft)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden="true">{group.icon}</span>
                <span className="text-sm font-bold text-[var(--text-main)]">{group.label}</span>
              </div>
              <div className="mt-4 space-y-3">
                {group.lines.map((line) => (
                  <a
                    key={line.text}
                    href={line.href}
                    className="block rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 transition hover:border-[var(--accent-border)]"
                  >
                    <div className="text-sm font-bold text-[var(--text-body)]">{line.text}</div>
                    {line.sub && <div className="mt-0.5 text-xs text-[var(--text-faint)]">{line.sub}</div>}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};
