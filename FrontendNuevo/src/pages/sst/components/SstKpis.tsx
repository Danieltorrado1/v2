import type { ComponentType } from "react";

export type SstKpiTone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

export type SstKpiItem = {
  tone: SstKpiTone;
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: string;
  caption?: string;
};

export function SstKpis({ items }: { items: SstKpiItem[] }) {
  return (
    <div className="sst-kpis">
      {items.map((kpi) => {
        const Icon = kpi.icon;

        return (
          <div className={`sst-kpi ${kpi.tone}`} key={kpi.label}>
            <div className="sst-kpi-icon">
              <Icon size={20} />
            </div>

            <div className="sst-kpi-body">
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
              {kpi.caption && <small>{kpi.caption}</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
