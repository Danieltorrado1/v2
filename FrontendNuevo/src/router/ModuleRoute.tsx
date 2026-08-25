import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useCompanyContext } from '../context/CompanyContext';

export default function ModuleRoute({code,children}:{code:string;children:ReactNode}){
  const {empresaId,capabilities,capabilitiesLoading,hasModule}=useCompanyContext();
  if(!empresaId||capabilitiesLoading||!capabilities)return <div className="adm-empty">Cargando configuración empresarial...</div>;
  if(!hasModule(code))return <Navigate to="/dashboard" replace/>;
  return children;
}
