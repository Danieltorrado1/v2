// Shared empresa/contract configuration — source of truth for dynamic contract fields.
// The admin can define multiple empresa types; each drives which fields appear
// in the "Datos del contrato" section of an operario's expediente.

export interface CampoContrato {
  key: string;
  label: string;
  tipo: "text" | "select";
  opciones?: string[];
  requerido?: boolean;
}

export interface EmpresaConfig {
  id: string;
  nombre: string;          // display name
  color: string;           // tailwind bg class for badge
  textColor: string;       // tailwind text class for badge
  campos: CampoContrato[];
}

// Default seeded configs — the admin can edit/add more in ConfiguracionModule
export const DEFAULT_EMPRESA_CONFIGS: EmpresaConfig[] = [
  {
    id: "pae",
    nombre: "PAE — Programa de Alimentación Escolar",
    color: "#f0fdf4",
    textColor: "#15803d",
    campos: [
      { key: "institucion", label: "Institución Educativa", tipo: "text",   requerido: true },
      { key: "sede",        label: "Sede",                  tipo: "text",   requerido: true },
      { key: "modalidad",   label: "Modalidad",             tipo: "select", requerido: true,
        opciones: ["Almuerzo", "Refrigerio", "Almuerzo y Refrigerio", "Ración industrializada"] },
      { key: "municipio",   label: "Municipio",               tipo: "text", requerido: true },
    ],
  },
  {
    id: "administrativo",
    nombre: "Personal Administrativo",
    color: "#eff6ff",
    textColor: "#1d4ed8",
    campos: [
      { key: "cargo",     label: "Cargo",      tipo: "text", requerido: true },
      { key: "area",      label: "Área",       tipo: "text", requerido: true },
      { key: "sede",      label: "Sede",       tipo: "text" },
      { key: "jornada",   label: "Jornada",    tipo: "select",
        opciones: ["Completa", "Medio tiempo", "Por horas"] },
    ],
  },
  {
    id: "logistica",
    nombre: "Logística y Distribución",
    color: "#fefce8",
    textColor: "#a16207",
    campos: [
      { key: "ruta",      label: "Ruta",              tipo: "text",   requerido: true },
      { key: "vehiculo",  label: "Vehículo asignado",  tipo: "text" },
      { key: "zona",      label: "Zona de cobertura",  tipo: "text",   requerido: true },
    ],
  },
];
