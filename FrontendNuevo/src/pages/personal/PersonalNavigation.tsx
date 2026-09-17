import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { resolveCatalogLocation, visibleTenantModules } from '../../architecture/moduleAccess';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { subscribeModuleVisibility } from '../../services/moduleVisibilityStore';

// This view only presents the database and repository entries of the shared catalog.
const TAB_CODES = new Set(['PERSONAL_BASE_DATOS', 'PERSONAL_REPOSITORIO']);

export default function PersonalNavigation({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const { empresaId, capabilities, capabilitiesLoading, isLoading, error, hasModule } = useCompanyContext();
  const { pathname, search } = useLocation();
  const [, setVisibilityVersion] = useState(0);

  useEffect(() => subscribeModuleVisibility(() => setVisibilityVersion(version => version + 1)), [empresaId]);

  const personal = isLoading || capabilitiesLoading || error
    ? undefined
    : visibleTenantModules(user, capabilities, empresaId).find(module => module.code === 'PERSONAL');
  // These two legacy target routes also require their legacy module in ModuleRoute.
  const tabs = personal?.children.filter(entry => TAB_CODES.has(entry.code) && entry.legacyCodes.some(hasModule)) ?? [];
  const activeCode = resolveCatalogLocation(pathname, search)?.entry.code;

  return (
    <div className="personal-navigation">
      {tabs.length > 0 && (
        <nav aria-label={personal?.label}>
          {tabs.map(entry => (
            <Link key={entry.code} to={entry.target ?? entry.route} aria-current={activeCode === entry.code ? 'page' : undefined}>
              {entry.label}
            </Link>
          ))}
        </nav>
      )}
      {children}
    </div>
  );
}
