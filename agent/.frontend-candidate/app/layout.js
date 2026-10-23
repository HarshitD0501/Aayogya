import "./globals.css";
import Script from "next/script";
import AuraBackground from "@/components/reactbits/AuraBackground";
import { LanguageProvider } from "@/contexts/LanguageContext";

export const metadata = {
  title: "Aushadh-AI — Aapki Dawai, Sahi Daam",
  description:
    "Medicine price transparency, verified Jan Aushadhi generic alternatives, and local Kendra finder. Informational only — confirm with doctor.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Aushadh-AI",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  themeColor: "#1a2234",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="font-sans antialiased selection:bg-brand-peach selection:text-brand-navy">
        {/* Global Paper Texture Overlay */}
        <div className="fixed inset-0 pointer-events-none z-50 bg-paper-texture mix-blend-multiply" />
        <AuraBackground />
        <LanguageProvider>
          {children}
        </LanguageProvider>
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
