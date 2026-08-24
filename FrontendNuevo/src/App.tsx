import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { CompanyProvider } from "./context/CompanyContext";
import AppRouter from "./router/AppRouter";
import AppErrorBoundary from "./components/AppErrorBoundary";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CompanyProvider>
          <AppErrorBoundary><AppRouter /></AppErrorBoundary>
        </CompanyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
