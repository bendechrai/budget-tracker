import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/lib/env";
import "./globals.css";
import Providers from "./Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const url = "https://budget-tracker-production-d3dc.up.railway.app";
const title = "Sinking Fund — Never Be Caught Off Guard by a Bill Again";
const description =
  "Sinking Fund calculates exactly what to set aside each pay cycle so every bill is covered. Import bank statements, detect recurring expenses automatically, and see your financial future at a glance.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL(url),
  openGraph: {
    title,
    description,
    url,
    siteName: "Sinking Fund",
    images: [
      {
        url: "/dashboard-light.png",
        width: 1145,
        height: 833,
        alt: "Sinking Fund dashboard showing fund health, projected balances, and upcoming obligations",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/dashboard-light.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
