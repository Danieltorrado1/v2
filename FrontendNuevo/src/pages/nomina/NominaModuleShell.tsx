import type { ReactNode } from "react";
import CoberturaFlowNav from "./CoberturaFlowNav";
import "./NominaModuleShell.css";

type NominaModuleShellProps = {
  periodId?: string | null;
  periodSlot?: ReactNode;
  children: ReactNode;
  embedded?: boolean;
  className?: string;
};

/** Marco presentacional compartido. No contiene estado ni reglas de negocio. */
export default function NominaModuleShell({ periodId, periodSlot, children, embedded = false, className = "" }: NominaModuleShellProps) {
  if (embedded) return <>{children}</>;

  return (
    <div className={`nomina-module-shell${className ? ` ${className}` : ""}`}>
      <div className="nomina-module-tab-row">
        <CoberturaFlowNav periodId={periodId} />
        {periodSlot ? <div className="nomina-module-period-slot">{periodSlot}</div> : null}
      </div>
      <div className="nomina-module-canvas">{children}</div>
    </div>
  );
}
