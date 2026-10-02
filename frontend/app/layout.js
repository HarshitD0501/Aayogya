import "./globals.css";
import "leaflet/dist/leaflet.css";
import { Inter } from "next/font/google";
import AuraBackground from "@/components/reactbits/AuraBackground";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata = {
  title: "Aarogya — your medicines, made clear",
  description:
    "Understand your prescriptions, daily schedule, interactions, and nearby pharmacies. Not a substitute for your doctor.",
};

export const viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuraBackground />
        {children}
      </body>
    </html>
  );
}
