import { useEffect } from "react";

type ScrollLockState = {
  count: number;
  scrollY: number;
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
};

declare global {
  interface Window {
    __bodyScrollLockState__?: ScrollLockState;
  }
}

export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const state =
      window.__bodyScrollLockState__ ||
      (window.__bodyScrollLockState__ = {
        count: 0,
        scrollY: 0,
        htmlOverflow: "",
        bodyOverflow: "",
        bodyPosition: "",
        bodyTop: "",
        bodyWidth: "",
      });

    if (state.count === 0) {
      state.scrollY = window.scrollY;
      state.htmlOverflow = document.documentElement.style.overflow;
      state.bodyOverflow = document.body.style.overflow;
      state.bodyPosition = document.body.style.position;
      state.bodyTop = document.body.style.top;
      state.bodyWidth = document.body.style.width;

      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${state.scrollY}px`;
      document.body.style.width = "100%";
    }

    state.count += 1;

    return () => {
      const current = window.__bodyScrollLockState__;
      if (!current) return;

      current.count = Math.max(0, current.count - 1);
      if (current.count > 0) return;

      document.documentElement.style.overflow = current.htmlOverflow;
      document.body.style.overflow = current.bodyOverflow;
      document.body.style.position = current.bodyPosition;
      document.body.style.top = current.bodyTop;
      document.body.style.width = current.bodyWidth;
      window.scrollTo(0, current.scrollY);
    };
  }, [active]);
}
