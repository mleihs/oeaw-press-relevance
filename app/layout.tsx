import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { CommandMenu } from "@/components/command/command-menu";
import { Toaster } from "@/components/ui/sonner";
import { PasswordGate } from "@/components/password-gate";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Story Scout | ÖAW",
  description: "Story Scout findet die besten Stories in Publikationen der Österreichischen Akademie der Wissenschaften",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} antialiased bg-background text-foreground flex flex-col min-h-screen`}
      >
        {/* Fumadocs RootProvider: theme disabled so next-themes stays in
            charge; search disabled because Story Scout owns a single global
            ⌘K palette (components/command) that surfaces Orama help results
            itself via useDocsSearch. Disabling it here removes Fumadocs's
            duplicate global ⌘K + its sidebar search trigger; DocsLayout still
            gets the framework/sidebar contexts it needs. */}
        <RootProvider theme={{ enabled: false }} search={{ enabled: false }}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            {/* App-wide reduced-motion: any Framer Motion component that doesn't
                self-gate inherits `reducedMotion="user"`, so OS "reduce motion"
                disables transform/layout animations everywhere at once. */}
            <MotionConfig reducedMotion="user">
            <NuqsAdapter>
              <QueryProvider>
                <PasswordGate>
                  <Nav />
                  <CommandMenu />
                  <main className="mx-auto max-w-7xl w-full px-4 py-6 flex-1">
                    {children}
                  </main>
                  <footer className="border-t bg-background/50 mt-auto">
                    <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Story Scout 0.2</span>
                      <div className="flex items-center gap-4">
                        <Link href="/settings" className="hover:text-foreground transition-colors">
                          Einstellungen
                        </Link>
                        <span>ÖAW</span>
                      </div>
                    </div>
                  </footer>
                  <Toaster />
                </PasswordGate>
              </QueryProvider>
            </NuqsAdapter>
            </MotionConfig>
          </ThemeProvider>
        </RootProvider>
      </body>
    </html>
  );
}
