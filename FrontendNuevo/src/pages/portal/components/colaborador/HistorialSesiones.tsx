import { CheckCircle, XCircle } from "lucide-react";
import { mockSesiones } from "../../mockData";

export default function HistorialSesiones() {
  return (
    <div className="pp-section">
      <div className="pp-section-header">
        <div>
          <h2 className="pp-section-title">Historial de Sesiones</h2>
          <p className="pp-section-subtitle">Últimos 10 inicios de sesión registrados</p>
        </div>
      </div>

      <div className="pp-table-card">
        <table className="pp-session-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Estado</th>
              <th>Navegador</th>
              <th>Dirección IP</th>
            </tr>
          </thead>
          <tbody>
            {mockSesiones.map((s, i) => (
              <tr key={s.id}>
                <td style={{ color: "var(--text-muted)", fontWeight: 700 }}>{i + 1}</td>
                <td>{s.fecha}</td>
                <td>{s.hora}</td>
                <td>
                  <span className={`pp-badge ${s.estado === 'exitoso' ? 'success' : 'danger'}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {s.estado === 'exitoso'
                      ? <CheckCircle size={10} />
                      : <XCircle size={10} />}
                    {s.estado === 'exitoso' ? 'Exitoso' : 'Fallido'}
                  </span>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{s.navegador}</td>
                <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)" }}>
                  {s.ip}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
        Si detectas inicios de sesión no reconocidos, contacta inmediatamente a Talento Humano.
      </p>
    </div>
  );
}
