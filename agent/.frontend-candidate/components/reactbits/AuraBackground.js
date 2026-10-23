"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export default function AuraBackground() {
  const containerRef = useRef(null);
  const orb1Ref = useRef(null);
  const orb2Ref = useRef(null);
  const orb3Ref = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      // Gentle floating breathing animation for background ambient orbs
      if (orb1Ref.current) {
        gsap.to(orb1Ref.current, {
          x: "random(-40, 40)",
          y: "random(-30, 30)",
          scale: "random(0.9, 1.15)",
          duration: 8,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      }
      if (orb2Ref.current) {
        gsap.to(orb2Ref.current, {
          x: "random(-50, 50)",
          y: "random(-40, 40)",
          scale: "random(0.85, 1.2)",
          duration: 10,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: 1,
        });
      }
      if (orb3Ref.current) {
        gsap.to(orb3Ref.current, {
          x: "random(-30, 30)",
          y: "random(-30, 30)",
          duration: 9,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: 2,
        });
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="aura-bg-container" aria-hidden="true">
      {/* Top Left Blue Aura Orb */}
      <div ref={orb1Ref} className="aura-orb aura-orb-blue" />
      {/* Top Right Purple Aura Orb */}
      <div ref={orb2Ref} className="aura-orb aura-orb-purple" />
      {/* Center Subtle Violet Glow */}
      <div ref={orb3Ref} className="aura-orb aura-orb-indigo" />
      {/* Subtle fine ambient grid pattern */}
      <div className="aura-grid-pattern" />
    </div>
  );
}
