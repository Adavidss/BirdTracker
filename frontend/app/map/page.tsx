"use client";

// The map merged into Explore (/) — keep old links and bookmarks working,
// preserving a ?code= species preselect.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function MapRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const code = params.get("code");
    router.replace(code ? `/?code=${encodeURIComponent(code)}` : "/");
  }, [router, params]);
  return <p className="text-sm text-muted">The map is now Explore — taking you there…</p>;
}

export default function MapMovedPage() {
  return (
    <Suspense fallback={null}>
      <MapRedirect />
    </Suspense>
  );
}
