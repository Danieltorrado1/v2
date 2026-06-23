import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { login, type AuthUser } from "../../services/authApi";

interface LoginScreenProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await login(email, password);
      onLoginSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex items-center justify-center h-screen bg-background"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-center gap-3 pb-2">
          <svg width="36" height="31" viewBox="0 0 30 26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="10" height="26" rx="5" fill="#1a2d6b" />
            <rect x="0" y="0" width="30" height="10" rx="5" fill="#1a2d6b" />
            <rect x="0" y="16" width="23" height="10" rx="5" fill="#1a2d6b" />
          </svg>
          <div className="text-center">
            <p
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800,
                fontSize: "1.05rem",
                color: "#1a2d6b",
                letterSpacing: "0.06em",
              }}
            >
              EMPIRIA
            </p>
            <p
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 400,
                fontSize: "0.65rem",
                color: "#6b7280",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                marginTop: "2px",
              }}
            >
              Gestión Integral de Talento Humano
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">Correo electrónico</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-password">Contraseña</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="mt-1">
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Ingresando…
                </>
              ) : (
                "Ingresar"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
