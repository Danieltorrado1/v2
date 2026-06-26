import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import empiriaIcon from "../../assets/empiria-icon.svg";
import NeuralBackground from "../../effects/NeuralBackground";
import "./LoginPage.css";

const ADMIN_ROLES = ['admin', 'th', 'supervisor'];

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // If the user already has a valid session, skip the login page
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Debes ingresar correo y contraseña.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const user = await login({ email: normalizedEmail, password });
      const isColaborador = !user.roles.some((r) =>
        ADMIN_ROLES.includes(r.toLowerCase()),
      );
      navigate(isColaborador ? "/portal" : "/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Correo o contraseña incorrectos.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="Marca Empiria">
        <NeuralBackground />

        <div className="brand-center">
          <img src={empiriaIcon} alt="Empiria" className="brand-logo" />

          <h1>EMPIRIA</h1>

          <p>Tecnología para la gestión del talento humano</p>
        </div>

        <div className="brand-footer">
          <span>© 2026 Empiria.</span>
          <span>Todos los derechos reservados.</span>
        </div>
      </section>

      <section className="login-form-section">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Bienvenido de vuelta</h2>

          <p className="login-subtitle">Inicia sesión para continuar</p>

          <div className="field">
            <label htmlFor="email">Correo electrónico</label>

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
            <label htmlFor="password">Contraseña</label>

            <div className="input-box">
              <Lock size={20} aria-hidden="true" />

              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
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
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            <div className="forgot-row">
              <button type="button" disabled={loading}>
                ¿Olvidaste tu contraseña?
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
              "Iniciando sesión..."
            ) : (
              <>
                Iniciar sesión
                <ArrowRight size={20} />
              </>
            )}
          </button>

          <p className="contact-text">
            ¿No tienes una cuenta? <span>Contáctanos</span>
          </p>
        </form>
      </section>
    </main>
  );
}
