"use client";

// Rare merged into Explore (/) as a map layer + panel — redirect old links.

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RareMovedPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/?layer=rare");
  }, [router]);
  return <p className="text-sm text-muted">Rare reports now live on Explore — taking you there…</p>;
}
