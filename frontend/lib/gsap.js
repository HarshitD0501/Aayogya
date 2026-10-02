"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";

// useLayoutEffect on the client (no flash), useEffect on the server (no warning).
export const useIsoLayout =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

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
