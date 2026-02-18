import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { PasswordGate } from "@/components/password-gate";
import Link from "next/link";

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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-neutral-50 flex flex-col min-h-screen`}
      >
        <PasswordGate>
          <Nav />
          <main className="mx-auto max-w-7xl w-full px-4 py-6 flex-1">
            {children}
          </main>
          <footer className="border-t bg-white/50 mt-auto">
            <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between text-xs text-neutral-400">
              <span>StoryScout v0.1.0</span>
              <div className="flex items-center gap-4">
                <Link href="/settings" className="hover:text-neutral-600 transition-colors">
                  Einstellungen
                </Link>
                <span>ÖAW</span>
              </div>
            </div>
          </footer>
          <Toaster />
        </PasswordGate>
      </body>
    </html>
  );
}
