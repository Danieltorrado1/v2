import type { ReactNode } from "react";

export type SstBadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

export function SstBadge({ tone, children }: { tone: SstBadgeTone; children: ReactNode }) {
  return <span className={`sst-badge ${tone}`}>{children}</span>;
}
