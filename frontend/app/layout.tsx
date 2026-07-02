import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { LastUpdated } from "@/components/LastUpdated";
import { Nav } from "@/components/Nav";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "BirdTracker",
  description:
    "What birds are around College Park / DC right now — and when to expect them. eBird data, updated daily.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Set the theme class before first paint to avoid a flash. Defaults to dark
// unless the user explicitly chose light.
const themeScript = `(function(){try{var t=localStorage.getItem('bt_theme');if(t!=='light'){document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <Nav />
        <main className="mx-auto max-w-4xl px-4 pb-16 pt-5 md:py-8">{children}</main>
        <footer className="mx-auto max-w-4xl border-t border-border px-4 py-6 text-xs text-muted">
          <LastUpdated />
          <p className="mt-1">
            Sightings data from{" "}
            <a
              href="https://ebird.org"
              className="underline hover:text-fg"
              target="_blank"
              rel="noreferrer"
            >
              eBird
            </a>{" "}
            (Cornell Lab of Ornithology).
          </p>
        </footer>
      </body>
    </html>
  );
}
