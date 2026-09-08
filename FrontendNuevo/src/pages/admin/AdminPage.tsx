import { Navigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { isGlobalAdministrator } from '../../architecture/moduleAccess';
import ConfiguracionGeneral from './ConfiguracionGeneral/ConfiguracionGeneral';
import './AdminPage.css';

export default function AdminPage() {
  const { user } = useAuth();

  if (!isGlobalAdministrator(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <ConfiguracionGeneral />;
}
