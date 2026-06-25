import type { ComponentType, ReactNode } from "react";

export function SstPageHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  subtitle: ReactNode;
}) {
  return (
    <header className="sst-header">
      <div className="sst-header-icon">
        <Icon size={22} />
      </div>

      <div>
        <span>SST</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}
