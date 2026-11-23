import React from "react";

/** The single Shubhu mark. Reused by the sidebar and the header brand. */
export function ShubhuLogo({ className = "w-9 h-9" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/shubhu-logo.png"
      alt="Shubhu"
      width={36}
      height={36}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}

/** Logo + wordmark, used by the expanded sidebar and the desktop header. */
export function ShubhuBrand({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <ShubhuLogo className="w-9 h-9" />
      <div>
        <span className="font-display font-bold text-white text-lg tracking-tight block leading-tight">Shubhu</span>
        <span className="text-[10px] text-emerald-400 font-mono tracking-wider block">MUSIC</span>
      </div>
    </div>
  );
}
