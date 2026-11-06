import "./globals.css";
import Script from "next/script";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/components/auth/AuthProvider";

export const metadata = {
  title: "Ayogya — Prescription Intelligence & Healthcare Adherence",
  description:
    "Ayogya: Unified prescription intelligence, verified Jan Aushadhi generic alternatives, multi-doctor drug conflict flags, and smart adherence companion.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/aayogya-logo.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ayogya",
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
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <body className="font-sans antialiased selection:bg-brand-peach selection:text-brand-navy" suppressHydrationWarning>
        <LanguageProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
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
