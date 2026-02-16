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

export const metadata: Metadata = {
  title: "Sinking Fund — Never Be Caught Off Guard by a Bill Again",
  description:
    "Sinking Fund calculates exactly what to set aside each pay cycle so every bill is covered. Import bank statements, detect recurring expenses automatically, and see your financial future at a glance.",
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
