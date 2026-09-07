import { useParams } from "react-router-dom";
import NominaPage from "./NominaPage";

export default function NominaEmpleadoDetallePage() {
  const { periodoId, nominaEmpleadoId } = useParams();
  return <NominaPage key={`${periodoId}:${nominaEmpleadoId}`} embeddedPeriodId={periodoId} detailEmployeeId={nominaEmpleadoId} />;
}
