"use client";

import { useEffect, useState } from "react";

/**
 * False during SSR and the first client render, true after mount. Used to defer
 * client-only DOM (e.g. dnd-kit's generated aria attributes) so the server and
 * first client render match and hydration doesn't warn.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
