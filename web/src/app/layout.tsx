import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { getLocale } from "@/lib/server/locale";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Hindi-first product: Devanagari glyphs come from a proper self-hosted font
// (falls back to system Devanagari where unavailable).
const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "techBuilder",
  description: "Daily field records for construction SMBs",
  applicationName: "techBuilder",
  appleWebApp: {
    capable: true,
    title: "techBuilder",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A5276",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${notoDevanagari.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
