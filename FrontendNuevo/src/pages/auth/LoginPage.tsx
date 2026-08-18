import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import NeuralBackground from "../../effects/NeuralBackground";
import "./LoginPage.css";

const ADMIN_ROLES = ["admin", "th", "supervisor"];

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [logoFallback, setLogoFallback] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isLightTheme = theme === "light";
  const logoSrc = isLightTheme
    ? "/branding/empiria-logo-vertical-light.png"
    : "/branding/empiria-logo-vertical-dark.png";

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Debes ingresar correo y contrase\u00f1a.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const user = await login({ email: normalizedEmail, password });
      const isColaborador = !user.roles.some((role) =>
        ADMIN_ROLES.includes(role.toLowerCase()),
      );
      navigate(isColaborador ? "/portal" : "/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Correo o contrase\u00f1a incorrectos.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`login-page ${isLightTheme ? "login-theme-light" : "login-theme-dark"}`}>
      <section className="login-brand" aria-label="Marca Empiria">
        <NeuralBackground />

        <div className="brand-center">
          {logoFallback ? (
            <div className="brand-logo-fallback" aria-label="Empiria">
              EMPIRIA
            </div>
          ) : (
            <img
              src={logoSrc}
              alt="Empiria"
              className="brand-logo"
              onError={() => setLogoFallback(true)}
            />
          )}

          <p>{"Tecnolog\u00eda para la gesti\u00f3n del talento humano"}</p>
        </div>

        <div className="brand-footer">
          <span>{"\u00a9 2026 Empiria."}</span>
          <span>Todos los derechos reservados.</span>
        </div>
      </section>

      <section className="login-form-section">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Bienvenido de vuelta</h2>

          <p className="login-subtitle">{"Inicia sesi\u00f3n para continuar"}</p>

          <div className="field">
            <label htmlFor="email">{"Correo electr\u00f3nico"}</label>

            <div className="input-box">
              <Mail size={20} aria-hidden="true" />

              <input
                id="email"
                name="email"
                type="email"
                placeholder="ejemplo@empresa.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="password">{"Contrase\u00f1a"}</label>

            <div className="input-box">
              <Lock size={20} aria-hidden="true" />

              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder={"••••••••"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={loading}
                required
              />

              <button
                type="button"
                className="icon-button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ocultar contrase\u00f1a" : "Mostrar contrase\u00f1a"}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <div className="forgot-row">
              <button type="button" disabled={loading}>
                {"\u00bfOlvidaste tu contrase\u00f1a?"}
              </button>
            </div>
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button className="submit-button" type="submit" disabled={loading}>
            {loading ? (
              "Iniciando sesi\u00f3n..."
            ) : (
              <>
                {"Iniciar sesi\u00f3n"}
                <ArrowRight size={20} />
              </>
            )}
          </button>

          <p className="contact-text">
            {"\u00bfNo tienes una cuenta? "}<span>{"Cont\u00e1ctanos"}</span>
          </p>
        </form>
      </section>
    </main>
  );
}
