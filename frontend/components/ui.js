"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { useCountUp, useIsoLayout } from "@/lib/gsap";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import ShinyText from "@/components/reactbits/ShinyText";
import GlowPill from "@/components/reactbits/GlowPill";
import { Sparkles, Activity, AlertTriangle, Info, ExternalLink } from "lucide-react";

export function BrandMark({ className = "" }) {
  // Ayogya Golden Leaf lockup (golden leaf + pulse mark + wordmark).
  return (
    <span className={`brand-mark ${className}`.trim()}>
      <img src="/aayogya-logo.png" alt="Ayogya" className="brand-logo-img h-9 w-auto object-contain" />
    </span>
  );
}

export function Card({
  title,
  sub,
  actions,
  className = "",
  reveal = true,
  spotlightColor = "rgba(99, 102, 241, 0.10)",
  borderColor = "rgba(176, 127, 20, 0.35)",
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

export function Stat({ icon, label, value, animate = true, format }) {
  const isStringWithUnit = typeof value === "string" && /[%a-zA-Z]/.test(value);
  const numericPart = typeof value === "number" ? value : parseFloat(value);
  const isValidNumber = !isNaN(numericPart) && isFinite(numericPart);
  
  // If value has non-numeric characters (like "%"), disable countUp or use static formatting
  const shouldAnimate = animate && isValidNumber && !isStringWithUnit;
  const ref = useCountUp(shouldAnimate ? numericPart : 0);

  return (
    <SpotlightCard
      className="stat"
      spotlightColor="rgba(232, 168, 56, 0.12)"
      borderColor="rgba(26, 34, 52, 0.14)"
    >
      <div className="stat-top">
        {icon && <span className="ic">{icon}</span>}
        <span className="lbl">{label}</span>
      </div>
      <span className="val" ref={shouldAnimate ? ref : undefined}>
        {shouldAnimate ? "0" : (format ? format(value) : value)}
      </span>
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
  if (!prices.matched || !prices.offers?.length)
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
  const matched = !!prices?.matched && !!prices?.offers?.length;

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
  const savings = Number(prices.max_savings_amount) || 0;

  return (
    <div className="price-visual" ref={ref}>
      <a className="price-hero" href={cheapest.url} target="_blank" rel="noreferrer">
        <div className="ph-cap">Best price available</div>
        <div className="ph-amt">₹{Number(cheapest.price).toFixed(2)}</div>
        <div className="ph-sub">
          Listed at <strong>{cheapest.platform}</strong>
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

/* ==========================================================================
   UI Design System v2 Primitives (Phase 1 / Milestone 1)
   Accessible, responsive, high-contrast primitives conforming to section 6.3.
   ========================================================================== */

export function UIButton({
  children,
  variant = "primary", // 'primary' | 'secondary' | 'tertiary' | 'danger'
  size = "md", // 'sm' | 'md' | 'lg'
  isLoading = false,
  disabled = false,
  className = "",
  type = "button",
  onClick,
  ...props
}) {
  const base = "inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none";
  
  const variants = {
    primary: "bg-ui-blue text-white hover:bg-ui-blue-hover active:bg-[#15366A] shadow-sm",
    secondary: "bg-ui-surface text-ui-text border border-ui-border-decorative hover:bg-ui-surface-subtle hover:border-ui-control-border active:bg-[#E5DEC9]",
    tertiary: "bg-transparent text-ui-blue hover:bg-ui-surface-subtle active:bg-[#E5DEC9]",
    danger: "bg-ui-danger text-white hover:bg-[#911C13] active:bg-[#70150E] shadow-sm",
  };

  const sizes = {
    sm: "min-h-[36px] px-3 py-1.5 text-xs gap-1.5",
    md: "min-h-[44px] px-4 py-2.5 text-sm gap-2",
    lg: "min-h-[48px] px-6 py-3 text-base gap-2.5",
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading ? "true" : undefined}
      onClick={onClick}
      className={`${base} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`.trim()}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" aria-hidden="true" />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function UIInput({
  label,
  id,
  error,
  hint,
  className = "",
  type = "text",
  required = false,
  ...props
}) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  const errorId = error && inputId ? `${inputId}-error` : undefined;
  const hintId = hint && inputId ? `${inputId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-ui-text tracking-wide">
          {label} {required && <span className="text-ui-danger" aria-hidden="true">*</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        required={required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className={`w-full min-h-[44px] px-3.5 py-2.5 text-base bg-ui-surface text-ui-text border rounded-lg transition-colors placeholder:text-ui-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-ui-blue focus:ring-offset-1 disabled:bg-ui-surface-subtle disabled:cursor-not-allowed ${
          error ? "border-ui-danger focus:ring-ui-danger" : "border-ui-control-border focus:border-ui-blue"
        } ${className}`.trim()}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-ui-text-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-ui-danger flex items-center gap-1" role="alert">
          <AlertTriangle size={13} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function UISelect({
  label,
  id,
  error,
  hint,
  options = [],
  children,
  className = "",
  required = false,
  ...props
}) {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined);
  const errorId = error && selectId ? `${selectId}-error` : undefined;
  const hintId = hint && selectId ? `${selectId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-semibold text-ui-text tracking-wide">
          {label} {required && <span className="text-ui-danger" aria-hidden="true">*</span>}
        </label>
      )}
      <select
        id={selectId}
        required={required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className={`w-full min-h-[44px] px-3.5 py-2.5 text-base bg-ui-surface text-ui-text border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-ui-blue focus:ring-offset-1 disabled:bg-ui-surface-subtle disabled:cursor-not-allowed ${
          error ? "border-ui-danger focus:ring-ui-danger" : "border-ui-control-border focus:border-ui-blue"
        } ${className}`.trim()}
        {...props}
      >
        {options.length > 0
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      {hint && !error && (
        <p id={hintId} className="text-xs text-ui-text-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-ui-danger flex items-center gap-1" role="alert">
          <AlertTriangle size={13} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function UICard({
  title,
  sub,
  actions,
  children,
  className = "",
  ...props
}) {
  return (
    <div
      className={`bg-ui-surface border border-ui-border-decorative rounded-xl p-5 sm:p-6 shadow-ui-card transition-all ${className}`.trim()}
      {...props}
    >
      {(title || actions || sub) && (
        <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-ui-border-decorative/60">
          <div>
            {title && <h3 className="text-base font-semibold text-ui-text tracking-tight">{title}</h3>}
            {sub && <p className="text-xs text-ui-text-secondary mt-0.5">{sub}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function UIBadge({
  tone = "neutral", // 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  icon,
  children,
  className = "",
}) {
  const tones = {
    success: "bg-[#EAF5EC] text-ui-success border-[#BDDDC2]",
    warning: "bg-[#FFF8E6] text-ui-warning border-[#F1D699]",
    danger: "bg-[#FDF0EE] text-ui-danger border-[#F5B5AE]",
    info: "bg-[#EBF3FC] text-ui-blue border-[#B3D3F7]",
    neutral: "bg-ui-surface-subtle text-ui-text-secondary border-ui-border-decorative",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-full ${
        tones[tone] || tones.neutral
      } ${className}`.trim()}
    >
      {icon && <span className="shrink-0 text-current">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

export function UISkeleton({
  className = "",
  width,
  height,
  rounded = "rounded-md",
}) {
  return (
    <div
      aria-hidden="true"
      className={`bg-ui-surface-subtle animate-pulse ${rounded} ${className}`.trim()}
      style={{ width, height }}
    />
  );
}

export function UIError({
  title = "Something went wrong",
  message,
  onRetry,
  className = "",
}) {
  return (
    <div
      role="alert"
      className={`p-4 sm:p-5 bg-[#FDF0EE] border border-[#F5B5AE] rounded-xl text-ui-text flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`.trim()}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={18} className="text-ui-danger shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h4 className="text-sm font-semibold text-ui-danger">{title}</h4>
          {message && <p className="text-xs text-ui-text-secondary mt-0.5">{message}</p>}
        </div>
      </div>
      {onRetry && (
        <UIButton variant="secondary" size="sm" onClick={onRetry} className="shrink-0 self-start sm:self-auto">
          Retry
        </UIButton>
      )}
    </div>
  );
}

