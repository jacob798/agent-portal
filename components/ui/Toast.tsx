"use client";

import { useCallback, useRef, useState } from "react";

/** Bottom-center transient toast. Use the `useToast` hook to drive it. */
export function Toast({ message }: { message: string | null }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-lg bg-brand-navy px-5 py-3 text-sm font-medium text-white shadow-xl transition-all ${
        message ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
      role="status"
    >
      {message}
    </div>
  );
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((msg: string) => {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3400);
  }, []);
  return { message, toast };
}
