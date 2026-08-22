import type { ComponentType } from "react";
import { BriefcaseBusiness, Building2, CalendarDays, FileText, MapPin, TrendingUp, UserMinus, Users, type LucideProps } from "lucide-react";
import "./EmpiriaIcon.css";

type EmpiriaIconName = "personal" | "income" | "retirement" | "vacancy" | "municipio" | "institucion" | "sede" | "modalidad" | "cargo" | "estado" | "documento";
type EmpiriaIconVariant = "outline" | "duotone" | "muted";

const icons: Record<EmpiriaIconName, ComponentType<LucideProps>> = {
  personal: Users,
  income: TrendingUp,
  retirement: UserMinus,
  vacancy: BriefcaseBusiness,
  municipio: MapPin,
  institucion: Building2,
  sede: Building2,
  modalidad: BriefcaseBusiness,
  cargo: BriefcaseBusiness,
  estado: CalendarDays,
  documento: FileText,
};

export function EmpiriaIcon({ name, size = 18, variant = "outline", className = "", "aria-label": ariaLabel }: { name: EmpiriaIconName; size?: number; variant?: EmpiriaIconVariant; className?: string; "aria-label"?: string }) {
  const Icon = icons[name];
  return <Icon size={size} aria-hidden={!ariaLabel} aria-label={ariaLabel} className={`empiria-icon empiria-icon--${variant} ${className}`} strokeWidth={variant === "duotone" ? 1.8 : 1.9} />;
}