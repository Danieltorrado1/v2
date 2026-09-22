import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import "./NominaActionIconButton.css";

export type NominaActionIconVariant = "default" | "success" | "danger" | "warning";

type NominaActionIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> & {
  icon: LucideIcon;
  label: string;
  variant?: NominaActionIconVariant;
  title?: string;
  "aria-label"?: string;
};

export default function NominaActionIconButton({
  icon: Icon,
  label,
  variant = "default",
  title,
  className = "",
  ...buttonProps
}: NominaActionIconButtonProps) {
  return (
    <button
      {...buttonProps}
      type={buttonProps.type ?? "button"}
      className={`nomina-action-icon nomina-action-icon--${variant} ${className}`.trim()}
      title={title ?? label}
      aria-label={buttonProps["aria-label"] ?? label}
    >
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
