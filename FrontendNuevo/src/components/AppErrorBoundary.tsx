import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Empiria render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--color-background, #f5f7fb)", color: "var(--color-text, #172033)" }}>
      <section role="alert" style={{ maxWidth: 560, padding: 24, borderRadius: 12, background: "var(--color-surface, #fff)", border: "1px solid var(--color-border, #dbe1ea)", boxShadow: "0 12px 30px #00000012" }}>
        <h1 style={{ marginTop: 0, fontSize: 20 }}>No fue posible cargar esta pantalla</h1>
        <p>Ocurrió un error inesperado en el módulo. Puedes reintentar o volver al inicio.</p>
        <button type="button" onClick={() => window.location.reload()}>Reintentar</button>
      </section>
    </main>;
  }
}
