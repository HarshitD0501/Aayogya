"use client";

import React, { useState, useEffect, useRef } from "react";
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
  LogIn,
} from "lucide-react";

export default function Navbar({
  onTabChange,
  activeTab,
  inAppShell = false,
  isLanding = false,
  onOpenAuth,
}) {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const toggleBtnRef = useRef(null);

  const isShell = inAppShell || pathname === "/app";

  // Handle Escape key to close mobile drawer and return focus
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
        toggleBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  // Landing links contract: How It Works, Product, FAQ + quick tools
  const landingNavLinks = [
    { href: "#how-it-works", label: "How It Works", isAnchor: true },
    { href: "#product", label: "Product", isAnchor: true },
    { href: "#faq", label: "FAQ", isAnchor: true },
    { href: "/search", label: t.navSearch || "Search & Compare", icon: Search },
    { href: "/scan", label: t.navScan || "Scan Prescription", icon: Camera },
    { href: "/stores", label: t.navStores || "Find Kendra", icon: MapPin },
  ];

  const appNavLinks = [
    { href: "/search", tab: "search", label: t.navSearch || "Search & Compare", icon: Search },
    { href: "/scan", tab: "scan", label: t.navScan || "Scan Prescription", icon: Camera },
    { href: "/stores", tab: "stores", label: t.navStores || "Find Kendra", icon: MapPin },
    { href: "/history", tab: "history", label: t.navHistory || "Saved History", icon: History },
  ];

  const navLinks = isLanding ? landingNavLinks : appNavLinks;

  const isCurrentActive = (item) => {
    if (activeTab) return activeTab === item.tab;
    return pathname === item.href;
  };

  const handleAnchorClick = (e, href) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      const targetId = href.replace("#", "");
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        el.focus({ preventScroll: true });
      }
      setMobileMenuOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-ui-canvas/95 backdrop-blur-md border-b border-ui-border-decorative transition-colors">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-4">
        
        {/* Brand Lockup */}
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue focus-visible:ring-offset-2 shrink-0"
          aria-label="Ayogya Home"
        >
          <img
            src="/aayogya-logo.png"
            alt="Ayogya"
            className="h-9 sm:h-10 w-auto object-contain"
          />
        </Link>

        {/* Primary Desktop Navigation Links */}
        <nav aria-label="Main Navigation" className="hidden lg:flex items-center gap-1 xl:gap-2">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const active = isCurrentActive(item);

            if (item.isAnchor) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleAnchorClick(e, item.href)}
                  className="px-3.5 py-2 text-xs font-semibold text-ui-text hover:text-ui-blue hover:bg-ui-surface rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue focus-visible:ring-offset-1"
                >
                  {item.label}
                </a>
              );
            }

            return isShell ? (
              <button
                key={item.tab || item.href}
                onClick={() => onTabChange && onTabChange(item.tab)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue ${
                  active
                    ? "bg-ui-surface text-ui-blue border border-ui-border-decorative shadow-sm"
                    : "text-ui-text hover:text-ui-blue hover:bg-ui-surface/60"
                }`}
              >
                {Icon && <Icon className={`w-4 h-4 ${active ? "text-ui-blue" : "text-ui-text-secondary"}`} aria-hidden="true" />}
                <span>{item.label}</span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue ${
                  active
                    ? "bg-ui-surface text-ui-blue border border-ui-border-decorative shadow-sm"
                    : "text-ui-text hover:text-ui-blue hover:bg-ui-surface/60"
                }`}
              >
                {Icon && <Icon className={`w-4 h-4 ${active ? "text-ui-blue" : "text-ui-text-secondary"}`} aria-hidden="true" />}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Tools: Language Toggle & Auth / App Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Language Switch */}
          <button
            onClick={() => setLanguage(language === "en" ? "hi" : "en")}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] bg-ui-surface hover:bg-ui-surface-subtle border border-ui-border-decorative text-ui-text text-xs font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue focus-visible:ring-offset-1"
            title="Toggle Hindi / English"
            aria-label={language === "en" ? "Switch language to Hindi" : "Switch language to English"}
          >
            <Globe className="w-3.5 h-3.5 text-ui-blue" aria-hidden="true" />
            <span>{language === "en" ? "हिन्दी" : "English"}</span>
          </button>

          {/* Action Button: Sign In on Landing, or Back to Home / App */}
          {isLanding ? (
            <button
              onClick={() => {
                if (onOpenAuth) onOpenAuth();
                else window.location.href = "/app";
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] bg-ui-blue hover:bg-ui-blue-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue focus-visible:ring-offset-2"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign in</span>
            </button>
          ) : isShell ? (
            <Link
              href="/"
              prefetch={true}
              className="hidden sm:flex items-center gap-2 px-3.5 py-2 min-h-[40px] bg-ui-surface hover:bg-ui-surface-subtle text-ui-text border border-ui-border-decorative font-medium text-xs rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-ui-blue" aria-hidden="true" />
              <span>{t.navBackLanding || "Home"}</span>
            </Link>
          ) : (
            <Link
              href="/app"
              prefetch={true}
              className="hidden sm:flex items-center gap-2 px-4 py-2 min-h-[40px] bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-xs rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
            >
              <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.navDashboard || "Dashboard"}</span>
            </Link>
          )}

          {/* Mobile Menu Disclosure Button */}
          <button
            ref={toggleBtnRef}
            id="mobile-nav-toggle"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden min-h-[40px] min-w-[40px] p-2 text-ui-text bg-ui-surface border border-ui-border-decorative rounded-lg flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav-drawer"
          role="region"
          aria-labelledby="mobile-nav-toggle"
          className="lg:hidden bg-ui-canvas border-b border-ui-border-decorative px-4 pt-3 pb-5 space-y-2 max-h-[calc(100vh-72px)] overflow-y-auto"
        >
          {navLinks.map((item) => {
            const Icon = item.icon;
            const active = isCurrentActive(item);

            if (item.isAnchor) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleAnchorClick(e, item.href)}
                  className="flex items-center min-h-[44px] px-4 py-2.5 text-sm font-semibold text-ui-text hover:text-ui-blue bg-ui-surface hover:bg-ui-surface-subtle border border-ui-border-decorative rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
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
                className={`flex items-center gap-3 w-full min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue ${
                  active
                    ? "bg-ui-surface text-ui-blue border-ui-blue shadow-sm"
                    : "bg-ui-surface text-ui-text border-ui-border-decorative hover:bg-ui-surface-subtle"
                }`}
              >
                {Icon && <Icon className={`w-4 h-4 ${active ? "text-ui-blue" : "text-ui-text-secondary"}`} aria-hidden="true" />}
                <span>{item.label}</span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 w-full min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue ${
                  active
                    ? "bg-ui-surface text-ui-blue border-ui-blue shadow-sm"
                    : "bg-ui-surface text-ui-text border-ui-border-decorative hover:bg-ui-surface-subtle"
                }`}
              >
                {Icon && <Icon className={`w-4 h-4 ${active ? "text-ui-blue" : "text-ui-text-secondary"}`} aria-hidden="true" />}
                <span>{item.label}</span>
              </Link>
            );
          })}
          
          {isLanding ? (
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                if (onOpenAuth) onOpenAuth();
                else window.location.href = "/app";
              }}
              className="flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-3 bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-sm rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <span>Sign in</span>
            </button>
          ) : isShell ? (
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-3 bg-ui-surface text-ui-text border border-ui-border-decorative font-medium text-sm rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
            >
              <ArrowLeft className="w-4 h-4 text-ui-blue" aria-hidden="true" />
              <span>{t.navBackLanding || "Home"}</span>
            </Link>
          ) : (
            <Link
              href="/app"
              prefetch={true}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-3 bg-ui-blue hover:bg-ui-blue-hover text-white font-semibold text-sm rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-blue"
            >
              <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
              <span>{t.navDashboard || "Dashboard"}</span>
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
