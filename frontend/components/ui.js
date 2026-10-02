"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { useCountUp, useIsoLayout } from "@/lib/gsap";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import ShinyText from "@/components/reactbits/ShinyText";
import GlowPill from "@/components/reactbits/GlowPill";
import { Sparkles, Activity, AlertTriangle, Info, ExternalLink } from "lucide-react";

export function BrandMark() {
  return (
    <div className="brand-mark">
      <span className="brand-logo">
        <Sparkles size={20} strokeWidth={2.5} />
      </span>
      <ShinyText
        text="Aayogya"
        className="brand-title"
        gradient="linear-gradient(135deg, #111827 0%, #2563eb 60%, #1e3a8a 100%)"
      />
    </div>
  );
}

export function Card({
  title,
  sub,
  actions,
  className = "",
  reveal = true,
  spotlightColor = "rgba(99, 102, 241, 0.10)",
  borderColor = "rgba(37, 99, 235, 0.35)",
  children,
  ...props
}) {
  return (
    <SpotlightCard
      className={className}
      reveal={reveal}
      spotlightColor={spotlightColor}
      borderColor={borderColor}
      {...props}
    >
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </SpotlightCard>
  );
}

export function Stat({ icon, label, value, animate = true }) {
  const ref = useCountUp(animate ? value : 0);
  return (
    <SpotlightCard
      className="stat"
      spotlightColor="rgba(59, 130, 246, 0.12)"
      borderColor="rgba(99, 102, 241, 0.3)"
    >
      {icon && <span className="ic">{icon}</span>}
      <span className="val" ref={animate ? ref : undefined}>
        {animate ? "0" : value}
      </span>
      <span className="lbl">{label}</span>
    </SpotlightCard>
  );
}

export function Pill({ tone, dot = true, children }) {
  // Map legacy tones to Aura GlowPill tones
  const toneMap = {
    brand: "purple",
    accent: "blue",
    warn: "amber",
    danger: "rose",
  };
  const auraTone = toneMap[tone] || "purple";

  return (
    <GlowPill tone={auraTone} dot={dot}>
      {children}
    </GlowPill>
  );
}

export function Loader({ label }) {
  return (
    <div className="empty">
      <div className="spinner" style={{ margin: "0 auto 14px" }} />
      {label && <div className="small muted" style={{ fontWeight: 500 }}>{label}</div>}
    </div>
  );
}

export function Note({ tone = "info", children }) {
  return (
    <div className={`note ${tone}`}>
      {tone === "err" ? (
        <AlertTriangle size={18} style={{ flexShrink: 0 }} />
      ) : (
        <Info size={18} style={{ flexShrink: 0 }} />
      )}
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon = "🌿", children }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div style={{ fontWeight: 500 }}>{children}</div>
    </div>
  );
}

export function Disclaimer({ children }) {
  return <p className="disclaimer">⚕ {children}</p>;
}

// Price offers for a medicine — cheapest highlighted with blue-purple aura gradient
export function Offers({ prices }) {
  if (!prices) return null;
  if (!prices.matched)
    return (
      <div className="small muted" style={{ marginTop: 10 }}>
        {prices.reason || "Price unavailable."}
      </div>
    );
  return (
    <>
      <div className="offers">
        {prices.offers.map((o, i) => (
          <a
            key={o.platform}
            className={`offer ${i === 0 ? "best" : ""}`.trim()}
            href={o.url}
            target="_blank"
            rel="noreferrer"
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {o.platform}
              {o.badge ? (
                <Pill tone={i === 0 ? "brand" : "neutral"}>{o.badge}</Pill>
              ) : i === 0 ? (
                <Pill tone="brand">cheapest</Pill>
              ) : null}
            </span>
            <span className="price" style={{ fontVariantNumeric: "tabular-nums" }}>
              ₹{Number(o.price).toFixed(2)}
            </span>
            <ExternalLink size={13} style={{ opacity: 0.6 }} />
          </a>
        ))}
      </div>
      {prices.disclaimer && <p className="disclaimer">{prices.disclaimer}</p>}
    </>
  );
}

// Eye-catching price comparison for one medicine: Aura hero card + progress bars
export function PriceVisual({ prices }) {
  const ref = useRef(null);
  const matched = !!prices?.matched;

  useIsoLayout(() => {
    if (!matched || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".price-hero", { y: 14, opacity: 0, duration: 0.5, ease: "power2.out" });
      gsap.from(".pbar-fill", {
        scaleX: 0,
        transformOrigin: "left center",
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.08,
      });
      gsap.utils.toArray(".pbar-val").forEach((el) => {
        const to = Number(el.dataset.v) || 0;
        const o = { n: 0 };
        gsap.to(o, {
          n: to,
          duration: 0.8,
          ease: "power2.out",
          onUpdate: () => {
            el.textContent = "₹" + o.n.toFixed(2);
          },
        });
      });
    }, ref);
    return () => ctx.revert();
  }, [matched, prices]);

  if (!matched)
    return (
      <div className="note info" style={{ marginTop: 6 }}>
        {prices?.reason || "Confirm the medicine to see prices."}
      </div>
    );

  const offers = prices.offers;
  const max = Math.max(...offers.map((o) => o.price));
  const cheapest = offers[0];
  const savings = offers[offers.length - 1].price - cheapest.price;

  return (
    <div className="price-visual" ref={ref}>
      <a className="price-hero" href={cheapest.url} target="_blank" rel="noreferrer">
        <div className="ph-cap">Best price available</div>
        <div className="ph-amt">₹{Number(cheapest.price).toFixed(2)}</div>
        <div className="ph-sub">
          Verified on <strong>{cheapest.platform}</strong>
          {savings > 0 && <span className="ph-save">Save ₹{savings.toFixed(2)}</span>}
        </div>
      </a>
      {offers.map((o, i) => (
        <div className="pbar" key={o.platform}>
          <div className="pbar-top">
            <span className="pbar-plat">
              {o.platform}
              {i === 0 && <span className="pbar-tag">cheapest</span>}
            </span>
            <span className="pbar-val" data-v={o.price}>
              ₹{Number(o.price).toFixed(2)}
            </span>
          </div>
          <div className="pbar-track">
            <div
              className={`pbar-fill ${i === 0 ? "best" : ""}`.trim()}
              style={{ width: `${Math.max(12, (o.price / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
