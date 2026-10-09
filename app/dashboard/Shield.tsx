"use client";

import { useEffect } from "react";

/**
 * PRD: ranges are hidden until held, and blurred when the tab loses focus. Anything marked
 * .d-held stays blurred until pressed and held; the whole record blurs while the tab is in the
 * background or the window is not in front.
 */
export function Shield() {
  useEffect(() => {
    const root = document.documentElement;
    const away = () => root.classList.add("d-away");
    const back = () => root.classList.remove("d-away");
    const vis = () => (document.hidden ? away() : back());
    window.addEventListener("blur", away);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", vis);

    const show = (e: Event) => (e.target as Element).closest?.(".d-held")?.classList.add("shown");
    const hide = () => document.querySelectorAll(".d-held.shown").forEach((el) => el.classList.remove("shown"));
    document.addEventListener("pointerdown", show);
    document.addEventListener("pointerup", hide);
    document.addEventListener("pointercancel", hide);
    const key = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && (e.target as Element).classList?.contains("d-held")) {
        e.preventDefault();
        if (e.type === "keydown") (e.target as Element).classList.add("shown");
        else hide();
      }
    };
    document.addEventListener("keydown", key);
    document.addEventListener("keyup", key);
    return () => {
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", vis);
      document.removeEventListener("pointerdown", show);
      document.removeEventListener("pointerup", hide);
      document.removeEventListener("pointercancel", hide);
      document.removeEventListener("keydown", key);
      document.removeEventListener("keyup", key);
    };
  }, []);
  return null;
}
