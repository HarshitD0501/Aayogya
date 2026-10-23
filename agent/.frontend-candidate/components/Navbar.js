"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { Compass, Search, Camera, MapPin, History, LayoutGrid, Globe, Menu, X, ArrowLeft } from "lucide-react";

export default function Navbar({ onTabChange, activeTab, inAppShell = false }) {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isShell = inAppShell || pathname === "/app";

  const navLinks = [
    { href: "/search", tab: "search", label: t.navSearch, icon: Search },
    { href: "/scan", tab: "scan", label: t.navScan, icon: Camera },
    { href: "/stores", tab: "stores", label: t.navStores, icon: MapPin },
    { href: "/history", tab: "history", label: t.navHistory, icon: History },
  ];

  const isCurrentActive = (item) => {
    if (activeTab) return activeTab === item.tab;
    return pathname === item.href;
  };

  return (
    <header className="sticky top-0 z-40 bg-brand-cream/95 backdrop-blur-md border-b-2 border-brand-navy shadow-sm transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
        
        {/* Brand Lockup */}
        <Link href="/" className="flex items-center gap-3 group focus:outline-none">
          <div className="w-10 h-10 bg-brand-orange text-brand-navy border-2 border-brand-navy sketchy-box flex items-center justify-center shadow-sketch-hover group-hover:rotate-6 transition-transform">
            <Compass className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div className="flex flex-col">
            <span className="font-serif font-black text-2xl text-brand-navy tracking-tight group-hover:text-brand-orange transition-colors">
              Aushadh-AI
            </span>
            <span className="text-[10px] font-sans font-black tracking-widest text-brand-gray uppercase">
              {t.appTagline}
            </span>
          </div>
        </Link>

        {/* Primary Tab Navigation */}
        <nav className="hidden md:flex items-center gap-2">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const active = isCurrentActive(item);
            return isShell ? (
              <button
                key={item.tab}
                onClick={() => onTabChange && onTabChange(item.tab)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all ${
                  active
                    ? "bg-brand-navy text-brand-cream border-2 border-brand-navy sketchy-btn shadow-sketch"
                    : "text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5 border-2 border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-brand-orange" : ""}`} />
                <span>{item.label}</span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all ${
                  active
                    ? "bg-brand-navy text-brand-cream border-2 border-brand-navy sketchy-btn shadow-sketch"
                    : "text-brand-navy/80 hover:text-brand-navy hover:bg-brand-navy/5 border-2 border-transparent"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-brand-orange" : ""}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Tools: Language Toggle & Launch/Back Button */}
        <div className="flex items-center gap-3">
          
          {/* Language Switch */}
          <button
            onClick={() => setLanguage(language === "en" ? "hi" : "en")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-white border-2 border-brand-navy text-brand-navy text-xs font-black sketchy-btn shadow-sketch-hover hover:bg-brand-peach/30 transition-all"
            title="Toggle Hindi / English"
            aria-label="Toggle language"
          >
            <Globe className="w-3.5 h-3.5 text-brand-orange" />
            <span>{language === "en" ? "हिन्दी" : "English"}</span>
          </button>

          {/* Action Button */}
          {isShell ? (
            <Link
              href="/"
              className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-brand-white hover:bg-brand-peach/30 text-brand-navy border-2 border-brand-navy font-sans font-black text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-brand-orange" />
              <span>{t.navBackLanding || "Presentation"}</span>
            </Link>
          ) : (
            <Link
              href="/app"
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-brand-orange text-brand-navy border-2 border-brand-navy font-serif font-black text-xs uppercase tracking-wider sketchy-btn shadow-sketch hover:shadow-sketch-hover hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>{t.navLaunchApp}</span>
            </Link>
          )}

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-brand-navy border-2 border-brand-navy bg-brand-white sketchy-box shadow-sketch-hover"
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
            return isShell ? (
              <button
                key={item.tab}
                onClick={() => {
                  onTabChange && onTabChange(item.tab);
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm font-black uppercase tracking-wider border-2 border-brand-navy transition-all ${
                  active
                    ? "bg-brand-navy text-brand-cream sketchy-box shadow-sketch"
                    : "bg-brand-white text-brand-navy shadow-sketch-hover"
                }`}
              >
                <Icon className="w-4 h-4 text-brand-orange" />
                <span>{item.label}</span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-black uppercase tracking-wider border-2 border-brand-navy transition-all ${
                  active
                    ? "bg-brand-navy text-brand-cream sketchy-box shadow-sketch"
                    : "bg-brand-white text-brand-navy shadow-sketch-hover"
                }`}
              >
                <Icon className="w-4 h-4 text-brand-orange" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          
          {isShell ? (
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-brand-white text-brand-navy border-2 border-brand-navy font-sans font-black text-xs uppercase tracking-wider sketchy-btn shadow-sketch"
            >
              <ArrowLeft className="w-4 h-4 text-brand-orange" />
              <span>{t.navBackLanding || "Back to Presentation"}</span>
            </Link>
          ) : (
            <Link
              href="/app"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-brand-orange text-brand-navy border-2 border-brand-navy font-serif font-black text-sm uppercase tracking-wider sketchy-btn shadow-sketch"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>{t.navLaunchApp}</span>
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
