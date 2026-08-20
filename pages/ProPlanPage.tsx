import React from "react";
import { ArrowLeft, MessageCircle, Play, Users } from "lucide-react";

const videos = [
  ["如何製作數字人？", "https://youtu.be/iSYdK5tw3MU"],
  ["學生如何應用？", "https://youtu.be/Uobro5SjHz4"],
  ["如何智能批改？", "https://youtu.be/myh1xFEFbVU"],
  ["如何運用 AI 創建新測驗？", "https://youtu.be/aoZXzMyKgto"],
];

export const ProPlanPage: React.FC = () => (
  <div className="min-h-screen bg-[#f7f8fb] pb-20 text-slate-800">
    <section className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 pb-[60px] pt-8 text-center text-white">
      <div className="mx-auto flex max-w-[880px] justify-start">
        <a href="/account" className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-white/25"><ArrowLeft className="h-4 w-4" />返回帳戶中心</a>
      </div>
      <span className="mt-5 inline-block rounded-full bg-white/20 px-3.5 py-1.5 text-[11px] font-extrabold tracking-wider">PRO 方案</span>
      <h1 className="mt-4 text-[28px] font-black">您的 PRO 方案已啟用</h1>
      <p className="mx-auto mt-2.5 max-w-[520px] text-sm leading-7 text-white/85">以下是這次服務的內容、可使用的範圍，以及遇到問題時可以怎麼找我們協助。</p>
      <img src="/ui-update/pro-logo.png" alt="ChopReality" className="mx-auto mt-6 w-[220px] max-w-[80%] rounded-2xl" />
    </section>

    <main className="mx-auto max-w-[880px] px-6">
      <section className="-mt-9 rounded-[24px] border border-slate-200 bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <h2 className="text-[17px] font-extrabold text-slate-950">方案內容</h2>
        <div className="mt-4 grid gap-3.5 md:grid-cols-3">
          {[
            ["專屬數字人角色", "為學校度身設計及製作 1 個 ChopReality 數字人角色，包括基本形象與技術設定。"],
            ["12 個月使用權", "由啟用日期起計 12 個月，老師可全年按教學需要自行更新內容並重複使用同一角色。"],
            ["首次設定協助", "協助完成首次設定及示範應用流程，確保可於校內順利使用。"],
          ].map(([title, body]) => <div key={title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><h3 className="text-[13px] font-extrabold text-slate-700">{title}</h3><p className="mt-1.5 text-xs leading-5 text-slate-400">{body}</p></div>)}
        </div>
      </section>

      <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-7">
        <h2 className="text-[17px] font-extrabold text-slate-950">可使用範圍</h2>
        <p className="mt-2.5 text-[13px] leading-7 text-slate-600">數字人角色及相關設定，於授權期內可用於校內教學活動、校本課程及校內宣傳。如需用於對外公開宣傳或大型公開活動，歡迎與我們聯繫，另行討論合適的授權安排。</p>
      </section>

      <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-7">
        <h2 className="text-[17px] font-extrabold text-slate-950">教師培訓與支援</h2>
        <p className="mt-1 text-[13px] text-slate-400">一次 1 小時的教學工作坊，之後也可隨時查詢</p>
        <div className="mt-[18px] divide-y divide-slate-100 border-y border-slate-100">
          <div className="flex gap-3.5 py-3.5"><span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo-600"><Users className="h-[18px] w-[18px]" /></span><div><h3 className="text-[13px] font-bold">教學工作坊（1 小時）</h3><p className="mt-1 text-xs leading-6 text-slate-400">對象：相關科任老師／IT 及課程負責老師<br />內容：帳戶及專案基本操作示範、數字人內容更新流程</p></div></div>
          <div className="flex gap-3.5 py-3.5"><span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo-600"><MessageCircle className="h-[18px] w-[18px]" /></span><div><h3 className="text-[13px] font-bold">日常技術諮詢</h3><p className="mt-1 text-xs leading-6 text-slate-400">實際使用中如有操作或設定上的問題，可透過電郵／訊息查詢，我們會在辦公時間內回覆並提供指導。</p></div></div>
        </div>
      </section>

      <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-7">
        <h2 className="text-[17px] font-extrabold text-slate-950">教學影片</h2>
        <div className="mt-4 divide-y divide-slate-100">{videos.map(([title, url]) => <a key={title} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3.5 rounded-[14px] px-2.5 py-3.5 transition hover:bg-indigo-50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600"><Play className="h-3.5 w-3.5 fill-current" /></span><span className="flex-1 text-[13px] font-bold text-slate-700">{title}</span><span className="text-xs text-indigo-300">觀看 →</span></a>)}</div>
      </section>

      <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-7">
        <h2 className="text-[17px] font-extrabold text-slate-950">認識 ChopReality</h2>
        <p className="mt-1.5 text-xs text-slate-400">由香港理工大學碩士生團隊開發，結合 AI 與沉浸式互動學習，提升教與學體驗</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2"><div><h3 className="text-[13px] font-extrabold text-indigo-600">教師端</h3><p className="mt-2 text-[13px] leading-6 text-slate-600">快速創建 AI 學科數字人、分析學生互動與學習難點，並運用 AI 輔助設計測驗。</p></div><div><h3 className="text-[13px] font-extrabold text-indigo-600">學生端</h3><p className="mt-2 text-[13px] leading-6 text-slate-600">與 AI 數字人即時對話，透過探索式學習加深理解與應用能力。</p></div></div>
        <div className="mt-5 flex flex-wrap gap-2.5 border-t border-slate-100 pt-5">{["粵語／英語／普通話即時切換", "繁體中文介面", "數據驅動教學"].map((item) => <span key={item} className="rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-bold text-slate-700">{item}</span>)}</div>
      </section>

      <div className="mt-7 flex flex-col items-center justify-center gap-3 rounded-[20px] bg-indigo-50 p-5 text-center sm:flex-row"><span className="text-[13px] text-indigo-900">有任何問題？我們隨時協助</span><a href="mailto:Mandy@chopreality.com" className="rounded-xl bg-indigo-600 px-[18px] py-2.5 text-[13px] font-bold text-white transition hover:bg-indigo-700">聯絡客服</a></div>
    </main>
  </div>
);
