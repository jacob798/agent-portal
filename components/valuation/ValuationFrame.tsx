"use client";

import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

/**
 * Embedded valuation surface with a Present (lender-facing) toggle.
 *
 * Normal: the app sits inside the portal chrome. Present: the iframe goes
 * full-screen over the sidebar + topbar so only the lender-branded valuation
 * shows — for screen-sharing with BCX / Builders Capital. The iframe element is
 * never remounted (only its wrapper restyles), so the SSO session it set on
 * /portal-enter survives the toggle.
 */
export default function ValuationFrame({ src }: { src: string }) {
  const [present, setPresent] = useState(false);

  return (
    <div
      className={
        present
          ? "fixed inset-0 z-50 bg-white"
          : "relative h-[calc(100vh-4rem)]"
      }
    >
      <iframe
        src={src}
        title="Valuation"
        className="block h-full w-full border-0"
      />
      <button
        type="button"
        onClick={() => setPresent((p) => !p)}
        title={present ? "Exit present mode" : "Present (hide portal — lender-facing)"}
        className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-full bg-brand-navy/90 px-3.5 py-2 text-xs font-medium text-white shadow-lg backdrop-blur transition hover:bg-brand-navy"
      >
        {present ? (
          <>
            <Minimize2 className="h-3.5 w-3.5" strokeWidth={2} />
            Exit present
          </>
        ) : (
          <>
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={2} />
            Present
          </>
        )}
      </button>
    </div>
  );
}
