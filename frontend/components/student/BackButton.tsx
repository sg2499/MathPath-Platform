"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

// One Back button for every inner student page, always in the same place:
// its own row at the top of the page, on the right. Main menu pages do not
// carry one (the menu is the way out) and test screens never do, so a
// student cannot leave a running test with a single tap.
export function BackButton({ href, label = "Back", className = "" }: { href: string; label?: string; className?: string }) {
  const Router = useRouter();
  return (
    <div className={`se-back-row ${className}`}>
      <button type="button" className="se-back" onClick={() => Router.push(href)}>
        <ArrowLeft size={16} />
        {label}
      </button>
    </div>
  );
}
