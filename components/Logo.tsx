/**
 * Foundry Capital logo mark — the geometric "F" built from a light-blue top
 * bar, a navy top-left triangle, a medium-blue stem, and a navy lower-right
 * triangle. Colors are fixed brand colors (not theme-driven) for fidelity.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 950 950"
      className={className}
      role="img"
      aria-label="Foundry Capital"
    >
      {/* top bar — light blue */}
      <rect x="260" y="0" width="690" height="260" fill="#5ba3d2" />
      {/* top-left wedge — navy */}
      <polygon points="260,0 260,260 0,260" fill="#0a2c4e" />
      {/* stem — medium blue */}
      <rect x="0" y="260" width="260" height="690" fill="#1768a3" />
      {/* lower-right wedge — navy */}
      <polygon points="510,510 950,510 510,950" fill="#0a2c4e" />
    </svg>
  );
}
