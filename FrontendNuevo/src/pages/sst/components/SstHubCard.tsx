import type { ComponentType } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function SstHubCard({
  to,
  tone,
  icon: Icon,
  title,
  description,
  actionLabel,
}: {
  to: string;
  tone: "success" | "info" | "warning" | "purple" | "orange" | "cyan";
  icon: ComponentType<{ size?: number }>;
  title: string;
  description: string;
  actionLabel: string;
}) {
  return (
    <Link to={to} className={`sst-hub-card ${tone}`}>
      <div className="sst-hub-card-icon">
        <Icon size={24} />
      </div>

      <h3>{title}</h3>
      <p>{description}</p>

      <span className="sst-hub-card-action">
        {actionLabel}
        <ArrowRight size={15} />
      </span>
    </Link>
  );
}
