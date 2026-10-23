"use client";

export default function GlowPill({
  children,
  tone = "purple", // purple | blue | green | amber | rose
  dot = true,
  className = "",
  ...props
}) {
  return (
    <span className={`glow-pill glow-pill-${tone} ${className}`} {...props}>
      {dot && <span className="glow-dot" />}
      <span className="glow-pill-text">{children}</span>
    </span>
  );
}
