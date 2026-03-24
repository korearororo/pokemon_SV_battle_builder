import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SV 배틀 빌더",
  description: "포켓몬스터 스칼렛/바이올렛 실전개체 어시스턴트",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html
        lang="ko"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
