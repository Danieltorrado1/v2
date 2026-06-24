import { useState } from "react";
import { Eye, Lock, Mail } from "lucide-react";
import { login } from "../../services/authService";
import "./LoginPage.css";
import empiriaIcon from "../../assets/empiria-icon.svg";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const result = await login({ email, password });

      localStorage.setItem("empiria_access_token", result.accessToken);
      localStorage.setItem("empiria_user", JSON.stringify(result.user));

      window.location.href = "/dashboard";
    } catch {
      setError("Correo o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-orbit" />

        <div className="brand-center">
          <img 
            src={empiriaIcon} 
            alt="Empiria" 
            className="brand-logo" 
          />

          <h1>EMPIRIA</h1>

          <div className="brand-line" />

          <p>
            TECNOLOGÍA PARA LA GESTIÓN
            <br />
            DEL TALENTO HUMANO
          </p>
        </div>

        <div className="brand-footer">
          © 2026 Empiria. Todos los derechos reservados.
        </div>
      </section>

      <section className="login-form-section">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Bienvenido de vuelta</h2>
          <p className="login-subtitle">Inicia sesión para continuar</p>

          <label htmlFor="email">Correo electrónico</label>
          <div className="input-box">
            <Mail size={20} />
            <input
              id="email"
              type="email"
              placeholder="ejemplo@empresa.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <label htmlFor="password">Contraseña</label>
          <div className="input-box">
            <Lock size={20} />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />

            <button
              type="button"
              className="icon-button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label="Mostrar u ocultar contraseña"
            >
              <Eye size={20} />
            </button>
          </div>

          <div className="forgot-row">
            <button type="button">¿Olvidaste tu contraseña?</button>
          </div>

          <button className="submit-button" type="submit" disabled={loading}>
            {loading ? "Iniciando..." : "Iniciar sesión →"}
          </button>

          {error && <p className="login-error">{error}</p>}

          <p className="contact-text">
            ¿No tienes una cuenta? <span>Contáctanos</span>
          </p>
        </form>
      </section>
    </main>
  );
}