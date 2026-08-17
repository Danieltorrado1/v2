import { Navigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import ConfiguracionGeneral from './ConfiguracionGeneral/ConfiguracionGeneral';
import './AdminPage.css';

export default function AdminPage() {
  const { user } = useAuth();

  if (user?.roles.includes('ADMINISTRADOR') !== true) {
    return <Navigate to="/dashboard" replace />;
  }

  return <ConfiguracionGeneral />;
}
