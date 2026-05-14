import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { PasswordGate } from "@/components/password-gate";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "next-themes";
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
        {/* Fumadocs RootProvider with theme disabled so next-themes stays in charge.
            The provider supplies the sidebar/search/framework contexts that DocsLayout requires. */}
        <RootProvider theme={{ enabled: false }}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <NuqsAdapter>
              <QueryProvider>
                <PasswordGate>
                  <Nav />
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
          </ThemeProvider>
        </RootProvider>
      </body>
    </html>
  );
}
