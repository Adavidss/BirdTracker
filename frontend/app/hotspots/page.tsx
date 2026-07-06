"use client";

// Hotspots merged into Explore (/) as a map layer + panel — redirect old links.

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HotspotsMovedPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/?layer=hotspots");
  }, [router]);
  return <p className="text-sm text-muted">Hotspots now live on Explore — taking you there…</p>;
}
