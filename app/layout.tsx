import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const cabinet = localFont({
  src: [
    { path: "../public/fonts/CabinetGrotesk-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/CabinetGrotesk-Medium.woff2",  weight: "500", style: "normal" },
    { path: "../public/fonts/CabinetGrotesk-Bold.woff2",    weight: "700", style: "normal" },
  ],
  variable: "--font-cabinet",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fenoma — Multi-canal",
  description: "Soluciones con IA. Tu tiempo, de vuelta.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${fraunces.variable} ${cabinet.variable} h-full`}
    >
      <body className="h-full font-sans antialiased">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
