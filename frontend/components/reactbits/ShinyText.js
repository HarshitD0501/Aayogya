"use client";

export default function ShinyText({
  text,
  disabled = false,
  speed = 4,
  className = "",
  gradient = "linear-gradient(135deg, #111827 0%, #b07f14 50%, #8a5f0a 100%)",
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
