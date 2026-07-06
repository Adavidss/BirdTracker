"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AreaPicker } from "@/components/AreaPicker";

const LINKS = [
  { href: "/", label: "Explore" },
  { href: "/timing", label: "Timing" },
];

function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("bt_theme", next ? "dark" : "light");
    } catch {
      // localStorage unavailable (private mode) — theme just won't persist
    }
    setDark(next);
  }, []);

  return (
    <button
      onClick={toggle}
      aria-label="Toggle light/dark theme"
      className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm hover:bg-surface-2"
    >
      {mounted ? (dark ? "☀️" : "🌙") : "•"}
    </button>
  );
}

export function Nav() {
  const pathname = usePathname() ?? "/";
  // trailingSlash builds give "/timing/"; normalize for comparison.
  const current = pathname !== "/" ? pathname.replace(/\/$/, "") : "/";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-canvas/85 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-4xl items-center gap-1 px-4 sm:gap-2">
        <Link href="/" className="mr-2 flex items-center gap-1.5 font-semibold text-strong">
          <span aria-hidden>🪶</span>
          <span className="hidden sm:inline">BirdTracker</span>
        </Link>
        {LINKS.map(({ href, label }) => {
          const active = current === href;
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-lg px-2.5 py-1.5 text-sm sm:px-3 ${
                active
                  ? "bg-surface-2 font-medium text-strong"
                  : "text-muted hover:bg-surface hover:text-fg"
              }`}
            >
              {label}
            </Link>
          );
        })}
        <AreaPicker />
        <ThemeToggle />
      </nav>
    </header>
  );
}
