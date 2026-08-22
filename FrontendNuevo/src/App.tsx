import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { CompanyProvider } from "./context/CompanyContext";
import AppRouter from "./router/AppRouter";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CompanyProvider>
          <AppRouter />
        </CompanyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
