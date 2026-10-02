"use client";

export default function ShinyText({
  text,
  disabled = false,
  speed = 4,
  className = "",
  gradient = "linear-gradient(135deg, #111827 0%, #2563eb 50%, #1e3a8a 100%)",
}) {
  const animationDuration = `${speed}s`;

  return (
    <span
      className={`shiny-text ${disabled ? "disabled" : ""} ${className}`}
      style={{
        "--shiny-gradient": gradient,
        animationDuration: animationDuration,
      }}
    >
      {text}
    </span>
  );
}
