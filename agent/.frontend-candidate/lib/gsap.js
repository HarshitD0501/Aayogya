"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// useLayoutEffect on the client (no flash), useEffect on the server (no warning).
export const useIsoLayout =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

let _stRegistered = false;
function ensureScrollTrigger() {
  if (!_stRegistered && typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
    _stRegistered = true;
  }
}

// Per-element scroll-reveal. Each [data-reveal] animates once as it enters the
// viewport; an optional data-anim="left|right|zoom|rotate|rise" picks a distinct
// entrance so consecutive sections each feel different.
const VARIANTS = {
  "fade-up": { y: 32, opacity: 0 },
  left: { x: -70, opacity: 0 },
  right: { x: 70, opacity: 0 },
  zoom: { scale: 0.85, opacity: 0 },
  rotate: { rotate: -4, y: 48, opacity: 0 },
  rise: { y: 80, opacity: 0 },
};

export function useScrollReveal(deps = []) {
  const scope = useRef(null);
  useIsoLayout(() => {
    if (!scope.current) return;
    ensureScrollTrigger();
    const ctx = gsap.context(() => {
      gsap.utils.toArray("[data-reveal]").forEach((el) => {
        const v = VARIANTS[el.dataset.anim] || VARIANTS["fade-up"];
        gsap.from(el, {
          ...v,
          duration: 0.85,
          ease: "power3.out",
          clearProps: "transform,opacity,filter",
          scrollTrigger: { trigger: el, start: "top 86%", once: true },
        });
      });
      ScrollTrigger.refresh();
    }, scope);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return scope;
}

// Count a number up to `value` the first time it scrolls into view. `format`
// maps the running number to a string (e.g. Indian-grouped). Returns the ref.
export function useScrollCountUp(value, format) {
  const ref = useRef(null);
  useIsoLayout(() => {
    const el = ref.current;
    if (!el) return;
    ensureScrollTrigger();
    const target = Number(value) || 0;
    const fmt = format || ((n) => String(Math.round(n)));
    const obj = { n: 0 };
    el.textContent = fmt(0);
    const ctx = gsap.context(() => {
      const tween = gsap.to(obj, {
        n: target,
        duration: 1.8,
        ease: "power2.out",
        paused: true,
        onUpdate: () => { el.textContent = fmt(obj.n); },
      });
      ScrollTrigger.create({
        trigger: el, start: "top 88%", once: true,
        onEnter: () => tween.play(),
      });
    });
    return () => ctx.revert();
  }, [value]);
  return ref;
}

// Fade-up + stagger every [data-reveal] descendant of the returned scope ref.
// Re-runs when `deps` change (e.g. after data loads). Returns the ref to spread
// onto the scope element.
export function useReveal(deps = []) {
  const scope = useRef(null);
  useIsoLayout(() => {
    if (!scope.current) return;
    const ctx = gsap.context(() => {
      const targets = gsap.utils.toArray("[data-reveal]");
      if (!targets.length) return;
      gsap.from(targets, {
        y: 18,
        opacity: 0,
        duration: 0.5,
        ease: "power2.out",
        stagger: 0.06,
        clearProps: "transform,opacity",
      });
    }, scope);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return scope;
}

// Count a number up from 0 — used on the summary KPI tiles.
export function useCountUp(value) {
  const ref = useRef(null);
  useIsoLayout(() => {
    const el = ref.current;
    if (!el) return;
    const target = Number(value) || 0;
    const obj = { n: 0 };
    const decimals = Number.isInteger(target) ? 0 : 1;
    const ctx = gsap.context(() => {
      gsap.to(obj, {
        n: target,
        duration: 0.9,
        ease: "power2.out",
        onUpdate: () => {
          el.textContent = obj.n.toFixed(decimals);
        },
      });
    });
    return () => ctx.revert();
  }, [value]);
  return ref;
}
