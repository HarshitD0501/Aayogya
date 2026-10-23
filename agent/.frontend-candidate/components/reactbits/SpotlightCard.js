"use client";

// Card wrapper. The cursor-tracking spotlight glow was removed on request; the
// spotlightColor/borderColor props are still accepted (and ignored) so existing
// callers don't spread them onto the DOM.
export default function SpotlightCard({
  children,
  className = "",
  spotlightColor,
  borderColor,
  reveal = true,
  ...props
}) {
  return (
    <div
      className={`spotlight-card ${className}`}
      {...(reveal ? { "data-reveal": "" } : {})}
      {...props}
    >
      <div className="spotlight-content">{children}</div>
    </div>
  );
}
