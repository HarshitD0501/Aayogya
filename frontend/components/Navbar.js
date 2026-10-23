"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Search,
  Camera,
  MapPin,
  History,
  Globe,
  Menu,
  X,
  ArrowLeft,
  LayoutDashboard,
} from "lucide-react";

export default function Navbar({ onTabChange, activeTab, inAppShell = false, isLanding = false }) {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isShell = inAppShell || pathname === "/app";

  const navLinks = isLanding
    ? [
        { href: "#problem", label: "The Problem", isAnchor: true },
        { href: "#features", label: "Case Files", isAnchor: true },
        { href: "/search", label: t.navSearch || "Search & Compare", icon: Search },
        { href: "/scan", label: t.navScan || "Scan Prescription", icon: Camera },
        { href: "/stores", label: t.navStores || "Find Kendra", icon: MapPin },
      ]
    : [
        { href: "/search", tab: "search", label: t.navSearch || "Search & Compare", icon: Search },
        { href: "/scan", tab: "scan", label: t.navScan || "Scan Prescription", icon: Camera },
        { href: "/stores", tab: "stores", label: t.navStores || "Find Kendra", icon: MapPin },
        { href: "/history", tab: "history", label: t.navHistory || "Saved History", icon: History },
      ];

  const isCurrentActive = (item) => {
    if (activeTab) return activeTab === item.tab;
    return pathname === item.href;
  };

  const handleAnchorClick = (e, href) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      const targetId = href.replace("#", "");
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" });
      setMobileMenuOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-brand-cream/95 backdrop-blur-md border-b-2 border-brand-navy/15 shadow-sm transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        {/* Brand Lockup: Ayogya Golden Leaf Logo */}
        <Link href="/" className="flex items-center gap-3 group focus:outline-none shrink-0 py-1">
          <img
            src="/aayogya-logo.png"
            alt="Ayogya"
            className="h-10 sm:h-11 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
          />
        </Link>

        {/* Primary Navigation Links */}
        <nav className="hidden md:flex items-center gap-1.5 lg:gap-2">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const active = isCurrentActive(item);

            if (item.isAnchor) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleAnchorClick(e, item.href)}
                  className="px-3.5 py-2 text-xs font-black uppercase tracking-wider text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5 rounded-lg transition-all"
                >
                  {item.label}
                </a>
              );
            }

            return isShell ? (
              <button
                key={item.tab || item.href}
                onClick={() => onTabChange && onTabChange(item.tab)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                  active
                    ? "bg-brand-navy text-brand-cream border-2 border-brand-navy shadow-sketch"
                    : "text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5 border-2 border-transparent"
                }`}
              >
                {Icon && <Icon className={`w-4 h-4 ${active ? "text-brand-orange" : "text-brand-navy/60"}`} />}
                <span>{item.label}</span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                  active
                    ? "bg-brand-navy text-brand-cream border-2 border-brand-navy shadow-sketch"
                    : "text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5 border-2 border-transparent"
                }`}
              >
                {Icon && <Icon className={`w-4 h-4 ${active ? "text-brand-orange" : "text-brand-navy/60"}`} />}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Tools: Language Toggle & Dashboard Button */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          
          {/* Language Switch */}
          <button
            onClick={() => setLanguage(language === "en" ? "hi" : "en")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-white hover:bg-brand-peach/25 border-2 border-brand-navy text-brand-navy text-xs font-black rounded-lg shadow-sketch-hover transition-all"
            title="Toggle Hindi / English"
            aria-label="Toggle language"
          >
            <Globe className="w-3.5 h-3.5 text-brand-orange" />
            <span>{language === "en" ? "हिन्दी" : "English"}</span>
          </button>

          {/* Action Button: Dashboard */}
          {isShell ? (
            <Link
              href="/"
              prefetch={true}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-brand-white hover:bg-brand-peach/30 text-brand-navy border-2 border-brand-navy font-sans font-black text-xs uppercase tracking-wider rounded-lg shadow-sketch hover:shadow-sketch-hover transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-brand-orange" />
              <span>{t.navBackLanding || "Home"}</span>
            </Link>
          ) : (
            <Link
              href="/app"
              prefetch={true}
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-brand-navy hover:bg-[#25314a] text-brand-cream border-2 border-brand-navy font-sans font-black text-xs uppercase tracking-wider rounded-lg shadow-sketch hover:shadow-sketch-hover transition-all"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-brand-orange" />
              <span>{t.navDashboard || "Dashboard"}</span>
            </Link>
          )}

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-brand-navy border-2 border-brand-navy bg-brand-white rounded-lg shadow-sketch-hover"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-brand-cream border-b-2 border-brand-navy px-4 pt-3 pb-5 space-y-2 animate-in slide-in-from-top duration-200">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const active = isCurrentActive(item);

            if (item.isAnchor) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleAnchorClick(e, item.href)}
                  className="block px-4 py-2.5 text-sm font-black uppercase tracking-wider rounded-lg border-2 border-brand-navy/20 bg-brand-white text-brand-navy shadow-sketch-hover"
                >
                  {item.label}
                </a>
              );
            }

            return isShell ? (
              <button
                key={item.tab || item.href}
                onClick={() => {
                  onTabChange && onTabChange(item.tab);
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm font-black uppercase tracking-wider rounded-lg border-2 border-brand-navy transition-all ${
                  active
                    ? "bg-brand-navy text-brand-cream shadow-sketch"
                    : "bg-brand-white text-brand-navy shadow-sketch-hover"
                }`}
              >
                {Icon && <Icon className="w-4 h-4 text-brand-orange" />}
                <span>{item.label}</span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-black uppercase tracking-wider rounded-lg border-2 border-brand-navy transition-all ${
                  active
                    ? "bg-brand-navy text-brand-cream shadow-sketch"
                    : "bg-brand-white text-brand-navy shadow-sketch-hover"
                }`}
              >
                {Icon && <Icon className="w-4 h-4 text-brand-orange" />}
                <span>{item.label}</span>
              </Link>
            );
          })}
          
          {isShell ? (
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-brand-white text-brand-navy border-2 border-brand-navy font-sans font-black text-xs uppercase tracking-wider rounded-lg shadow-sketch"
            >
              <ArrowLeft className="w-4 h-4 text-brand-orange" />
              <span>{t.navBackLanding || "Home"}</span>
            </Link>
          ) : (
            <Link
              href="/app"
              prefetch={true}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-brand-navy text-brand-cream border-2 border-brand-navy font-sans font-black text-sm uppercase tracking-wider rounded-lg shadow-sketch"
            >
              <LayoutDashboard className="w-4 h-4 text-brand-orange" />
              <span>{t.navDashboard || "Dashboard"}</span>
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
