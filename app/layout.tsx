import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { PasswordGate } from "@/components/password-gate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StoryScout — ÖAW",
  description: "StoryScout findet die besten Stories in Publikationen der Österreichischen Akademie der Wissenschaften",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-neutral-50`}
      >
        <PasswordGate>
          <Nav />
          <main className="mx-auto max-w-7xl px-4 py-6">
            {children}
          </main>
          <Toaster />
        </PasswordGate>
      </body>
    </html>
  );
}
