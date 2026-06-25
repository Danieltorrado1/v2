import type {
  Empresa, Contrato, Rol, Usuario, CatalogoItem, TipoCatalogo,
  Cargo, RequisitoDocumental, SalarioPersonal, MunicipioAsignado, PermisoModulo,
} from './cg.types';
import { MODULOS_SISTEMA } from './cg.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function p(modulo: string, flags: Partial<PermisoModulo>): PermisoModulo {
  return { modulo, ver: false, crear: false, editar: false, eliminar: false, exportar: false, aprobar: false, gestionar: false, ...flags };
}
function pAll(modulo: string): PermisoModulo {
  return { modulo, ver: true, crear: true, editar: true, eliminar: true, exportar: true, aprobar: true, gestionar: true };
}

// ─── Empresas ────────────────────────────────────────────────────────────────

export const MOCK_EMPRESAS: Empresa[] = [
  { id: 1, nombre: 'Alimentar S.A.S', nit: '900.123.456-7', representante_legal: 'Carlos Andrés Gómez Ríos', direccion: 'Cra 10 #25-40, Bogotá D.C.', telefono: '3001234567', correo: 'admin@alimentar.com.co', estado: 'activo', observaciones: 'Empresa principal operadora de contratos ICBF', creado_en: '2024-01-15' },
  { id: 2, nombre: 'Servicios Integrales S.A.S', nit: '800.987.654-3', representante_legal: 'María Elena Vargas Ospina', direccion: 'Av 68 #12-30, Bogotá D.C.', telefono: '3119876543', correo: 'gerencia@serviciosintegrales.co', estado: 'activo', creado_en: '2024-03-01' },
  { id: 3, nombre: 'Nutrición Activa Ltda.', nit: '901.234.567-8', representante_legal: 'Julián Ospina Torres', direccion: 'Cll 72 #5-21, Medellín', telefono: '3204567890', correo: 'operaciones@nutricionactiva.com', estado: 'inactivo', observaciones: 'Empresa en proceso de liquidación', creado_en: '2023-06-20' },
];

// ─── Contratos ────────────────────────────────────────────────────────────────

export const MOCK_CONTRATOS: Contrato[] = [
  { id: 1, empresa_id: 1, numero_contrato: 'ALI-2024-001', cliente: 'Alcaldía de Acacías', objeto_contractual: 'Suministro de alimentación escolar para instituciones educativas del municipio de Acacías, Meta', fecha_inicio: '2024-01-01', fecha_fin: '2024-12-31', estado: 'activo', municipios: ['Acacías', 'Villavicencio', 'Granada'] },
  { id: 2, empresa_id: 1, numero_contrato: 'ALI-2024-002', cliente: 'ICBF Regional Meta', objeto_contractual: 'Operación de Centros de Atención al Adulto Mayor – CAA – en municipios del Meta', fecha_inicio: '2024-03-01', fecha_fin: '2024-12-15', estado: 'por_vencer', municipios: ['Restrepo', 'Cumaral', 'San Martín'], observaciones: 'Vence en 20 días. Pendiente renovación.' },
  { id: 3, empresa_id: 2, numero_contrato: 'SI-2024-005', cliente: 'ICBF Nacional', objeto_contractual: 'Prestación de servicios de atención integral a primera infancia – modalidad CAARES', fecha_inicio: '2024-06-01', fecha_fin: '2025-05-31', estado: 'activo', municipios: ['Bogotá D.C.', 'Soacha', 'Chía'] },
  { id: 4, empresa_id: 1, numero_contrato: 'ALI-2023-008', cliente: 'Alcaldía de Granada', objeto_contractual: 'Servicio de alimentación para hogares comunitarios ICBF modalidad familiar', fecha_inicio: '2023-06-01', fecha_fin: '2023-12-31', estado: 'inactivo', municipios: ['Granada'] },
];

// ─── Roles ────────────────────────────────────────────────────────────────────

function buildPermisos(nivel: 'admin' | 'th' | 'op' | 'cal' | 'aud' | 'int' | 'colab'): PermisoModulo[] {
  const M = MODULOS_SISTEMA;
  if (nivel === 'admin') return M.map(pAll);

  const maps: Record<string, (m: string) => PermisoModulo> = {
    th:    m => { if (m === 'Administración') return p(m, {}); if (m === 'Portal') return p(m, { ver: true, crear: true, editar: true, aprobar: true, gestionar: true }); return p(m, { ver: true, crear: true, editar: true, exportar: true, gestionar: true }); },
    op:    m => { if (['Administración','Nómina'].includes(m)) return p(m, {}); return p(m, { ver: true, crear: true, editar: true }); },
    cal:   m => { if (['Administración','Nómina'].includes(m)) return p(m, {}); return p(m, { ver: true, exportar: true }); },
    aud:   m => p(m, { ver: true, exportar: true }),
    int:   m => p(m, { ver: true, exportar: true, aprobar: ['Personal','SST','Nómina'].includes(m) }),
    colab: m => p(m, { ver: m === 'Portal', gestionar: m === 'Portal' }),
  };
  return M.map(maps[nivel] ?? (m => p(m, {})));
}

export const MOCK_ROLES: Rol[] = [
  { id: 1, nombre: 'Administrador',        descripcion: 'Acceso total al sistema. Sin restricciones.',                     estado: 'activo', es_sistema: true,  permisos: buildPermisos('admin') },
  { id: 2, nombre: 'Talento Humano',       descripcion: 'Gestión de personal, nómina, documentos y portal colaborador.',   estado: 'activo', es_sistema: true,  permisos: buildPermisos('th')    },
  { id: 3, nombre: 'Operación',            descripcion: 'Gestión operativa de campo y cobertura.',                          estado: 'activo', es_sistema: true,  permisos: buildPermisos('op')    },
  { id: 4, nombre: 'Calidad',              descripcion: 'Supervisión de calidad, SST y cumplimiento documental.',           estado: 'activo', es_sistema: true,  permisos: buildPermisos('cal')   },
  { id: 5, nombre: 'Auditor Interno',      descripcion: 'Acceso de solo lectura y exportación para auditoría interna.',     estado: 'activo', es_sistema: true,  permisos: buildPermisos('aud')   },
  { id: 6, nombre: 'Interventoría',        descripcion: 'Acceso de supervisión y aprobación externa.',                      estado: 'activo', es_sistema: false, permisos: buildPermisos('int')   },
  { id: 7, nombre: 'Colaborador Operativo',descripcion: 'Acceso restringido al portal del colaborador.',                    estado: 'activo', es_sistema: true,  permisos: buildPermisos('colab') },
];

// ─── Usuarios ─────────────────────────────────────────────────────────────────

export const MOCK_USUARIOS: Usuario[] = [
  { id: 1, nombre_completo: 'Carlos Rojas Medina',    correo: 'crojas@empiria.co',    rol_id: 1, empresa_id: 1, municipios_asignados: [],                    estado: 'activo',   ultimo_acceso: '2026-06-25 09:15', creado_en: '2024-01-15' },
  { id: 2, nombre_completo: 'Laura González Peña',    correo: 'lgonzalez@empiria.co', rol_id: 2, empresa_id: 1, municipios_asignados: ['Acacías','Villavicencio'], estado: 'activo',   ultimo_acceso: '2026-06-25 08:30', creado_en: '2024-02-01' },
  { id: 3, nombre_completo: 'Diana Morales Suárez',   correo: 'dmorales@empiria.co',  rol_id: 3, empresa_id: 2, municipios_asignados: ['Bogotá D.C.'],        estado: 'activo',   ultimo_acceso: '2026-06-24 16:45', creado_en: '2024-04-10' },
  { id: 4, nombre_completo: 'Andrés Castillo Ruiz',   correo: 'acastillo@empiria.co', rol_id: 5, empresa_id: 1, municipios_asignados: [],                    estado: 'activo',   ultimo_acceso: '2026-06-23 14:20', creado_en: '2024-05-15' },
  { id: 5, nombre_completo: 'Paola Jiménez López',    correo: 'pjimenez@empiria.co',  rol_id: 2, empresa_id: 2, municipios_asignados: ['Soacha','Chía'],      estado: 'inactivo', ultimo_acceso: '2026-05-30 11:00', creado_en: '2024-03-20' },
  { id: 6, nombre_completo: 'Sebastián Mora Pérez',   correo: 'smora@empiria.co',     rol_id: 4, empresa_id: 1, municipios_asignados: [],                    estado: 'activo',   ultimo_acceso: '2026-06-22 10:00', creado_en: '2025-01-10' },
];

// ─── Catálogos ────────────────────────────────────────────────────────────────

export const MOCK_CATALOGOS: Record<TipoCatalogo, CatalogoItem[]> = {
  tipos_vinculacion: [
    { id: 1, nombre: 'Contrato a Término Fijo',       codigo: 'CTF',  estado: 'activo' },
    { id: 2, nombre: 'Contrato a Término Indefinido', codigo: 'CTI',  estado: 'activo' },
    { id: 3, nombre: 'Prestación de Servicios',       codigo: 'OPS',  estado: 'activo' },
    { id: 4, nombre: 'Aprendizaje SENA',              codigo: 'SENA', estado: 'activo' },
    { id: 5, nombre: 'Obra o Labor',                  codigo: 'OL',   estado: 'activo' },
  ],
  estados_vinculacion: [
    { id: 1, nombre: 'Activo',           estado: 'activo' },
    { id: 2, nombre: 'En Vacaciones',    estado: 'activo' },
    { id: 3, nombre: 'En Incapacidad',   estado: 'activo' },
    { id: 4, nombre: 'Suspendido',       estado: 'activo' },
    { id: 5, nombre: 'Retirado',         estado: 'activo' },
  ],
  tipos_documento: [
    { id: 1, nombre: 'Cédula de Ciudadanía', codigo: 'CC',  estado: 'activo' },
    { id: 2, nombre: 'Cédula de Extranjería',codigo: 'CE',  estado: 'activo' },
    { id: 3, nombre: 'Tarjeta de Identidad', codigo: 'TI',  estado: 'activo' },
    { id: 4, nombre: 'Pasaporte',            codigo: 'PA',  estado: 'activo' },
    { id: 5, nombre: 'NIT',                  codigo: 'NIT', estado: 'activo' },
  ],
  niveles_estudio: [
    { id: 1, nombre: 'Primaria',        estado: 'activo' },
    { id: 2, nombre: 'Bachillerato',    estado: 'activo' },
    { id: 3, nombre: 'Técnico',         estado: 'activo' },
    { id: 4, nombre: 'Tecnólogo',       estado: 'activo' },
    { id: 5, nombre: 'Universitario',   estado: 'activo' },
    { id: 6, nombre: 'Especialización', estado: 'activo' },
    { id: 7, nombre: 'Maestría',        estado: 'activo' },
    { id: 8, nombre: 'Doctorado',       estado: 'activo' },
  ],
  eps: [
    { id: 1, nombre: 'Sura',        estado: 'activo' },
    { id: 2, nombre: 'Compensar',   estado: 'activo' },
    { id: 3, nombre: 'Nueva EPS',   estado: 'activo' },
    { id: 4, nombre: 'Sanitas',     estado: 'activo' },
    { id: 5, nombre: 'Famisanar',   estado: 'activo' },
    { id: 6, nombre: 'Salud Total', estado: 'activo' },
    { id: 7, nombre: 'Coosalud',    estado: 'activo' },
  ],
  arl: [
    { id: 1, nombre: 'Sura ARL',        estado: 'activo' },
    { id: 2, nombre: 'Colmena Seguros', estado: 'activo' },
    { id: 3, nombre: 'Positiva',        estado: 'activo' },
    { id: 4, nombre: 'Bolívar',         estado: 'activo' },
    { id: 5, nombre: 'Liberty Seguros', estado: 'activo' },
  ],
  fondos_pension: [
    { id: 1, nombre: 'Protección',   estado: 'activo' },
    { id: 2, nombre: 'Porvenir',     estado: 'activo' },
    { id: 3, nombre: 'Colfondos',    estado: 'activo' },
    { id: 4, nombre: 'Old Mutual',   estado: 'activo' },
    { id: 5, nombre: 'Colpensiones', estado: 'activo' },
  ],
  cajas_compensacion: [
    { id: 1, nombre: 'Compensar',    estado: 'activo' },
    { id: 2, nombre: 'Colsubsidio',  estado: 'activo' },
    { id: 3, nombre: 'Cafam',        estado: 'activo' },
    { id: 4, nombre: 'Comfenalco',   estado: 'activo' },
    { id: 5, nombre: 'Comfama',      estado: 'activo' },
    { id: 6, nombre: 'Comfamiliar',  estado: 'activo' },
  ],
  zonas: [
    { id: 1, nombre: 'Zona Centro',    estado: 'activo' },
    { id: 2, nombre: 'Zona Norte',     estado: 'activo' },
    { id: 3, nombre: 'Zona Sur',       estado: 'activo' },
    { id: 4, nombre: 'Zona Oriente',   estado: 'activo' },
    { id: 5, nombre: 'Zona Occidente', estado: 'activo' },
  ],
  municipios: [
    { id: 1, nombre: 'Acacías',      descripcion: 'Meta',          estado: 'activo' },
    { id: 2, nombre: 'Villavicencio',descripcion: 'Meta',          estado: 'activo' },
    { id: 3, nombre: 'Granada',      descripcion: 'Meta',          estado: 'activo' },
    { id: 4, nombre: 'Restrepo',     descripcion: 'Meta',          estado: 'activo' },
    { id: 5, nombre: 'Cumaral',      descripcion: 'Meta',          estado: 'activo' },
    { id: 6, nombre: 'San Martín',   descripcion: 'Meta',          estado: 'activo' },
    { id: 7, nombre: 'Bogotá D.C.',  descripcion: 'Cundinamarca',  estado: 'activo' },
    { id: 8, nombre: 'Soacha',       descripcion: 'Cundinamarca',  estado: 'activo' },
    { id: 9, nombre: 'Chía',         descripcion: 'Cundinamarca',  estado: 'activo' },
  ],
  departamentos: [
    { id: 1, nombre: 'Meta',           codigo: 'META',  estado: 'activo' },
    { id: 2, nombre: 'Cundinamarca',   codigo: 'CUND',  estado: 'activo' },
    { id: 3, nombre: 'Antioquia',      codigo: 'ANT',   estado: 'activo' },
    { id: 4, nombre: 'Valle del Cauca',codigo: 'VALLE', estado: 'activo' },
    { id: 5, nombre: 'Santander',      codigo: 'SANT',  estado: 'activo' },
  ],
};

// ─── Cargos ───────────────────────────────────────────────────────────────────

export const MOCK_CARGOS: Cargo[] = [
  { id: 1, empresa_id: 1, contrato_id: 1, nombre: 'Manipulador de Alimentos', tipo_cargo: 'Operativo',      cantidad_requerida: 8, aplica_cobertura: true,  aplica_nomina: true,  aplica_portal: true,  salario_base: 1423500, estado: 'activo'   },
  { id: 2, empresa_id: 1, contrato_id: 1, nombre: 'Nutricionista',            tipo_cargo: 'Profesional',    cantidad_requerida: 1, aplica_cobertura: true,  aplica_nomina: true,  aplica_portal: true,  salario_base: 2800000, estado: 'activo'   },
  { id: 3, empresa_id: 1, contrato_id: 1, nombre: 'Supervisor de Campo',      tipo_cargo: 'Supervisión',    cantidad_requerida: 2, aplica_cobertura: true,  aplica_nomina: true,  aplica_portal: false, salario_base: 2100000, estado: 'activo'   },
  { id: 4, empresa_id: 1, contrato_id: 2, nombre: 'Auxiliar de Cocina',       tipo_cargo: 'Operativo',      cantidad_requerida: 4, aplica_cobertura: true,  aplica_nomina: true,  aplica_portal: true,  salario_base: 1423500, estado: 'activo'   },
  { id: 5, empresa_id: 1, contrato_id: 2, nombre: 'Profesional SST',          tipo_cargo: 'Profesional',    cantidad_requerida: 1, aplica_cobertura: false, aplica_nomina: true,  aplica_portal: false, salario_base: 3200000, estado: 'activo'   },
  { id: 6, empresa_id: 2, contrato_id: 3, nombre: 'Agente de Atención',       tipo_cargo: 'Operativo',      cantidad_requerida: 6, aplica_cobertura: true,  aplica_nomina: true,  aplica_portal: true,  salario_base: 1500000, estado: 'activo'   },
  { id: 7, empresa_id: 2, contrato_id: 3, nombre: 'Coordinador Regional',     tipo_cargo: 'Coordinación',   cantidad_requerida: 1, aplica_cobertura: false, aplica_nomina: true,  aplica_portal: false, salario_base: 4500000, estado: 'activo'   },
  { id: 8, empresa_id: 1, contrato_id: 1, nombre: 'Auxiliar Administrativo',  tipo_cargo: 'Administrativo', cantidad_requerida: 1, aplica_cobertura: false, aplica_nomina: true,  aplica_portal: true,  salario_base: 1600000, estado: 'inactivo' },
];

// ─── Requisitos Documentales ──────────────────────────────────────────────────

export const MOCK_REQUISITOS: RequisitoDocumental[] = [
  { id: 1,  nombre_documento: 'Cédula de Ciudadanía',          aplica_empresa: true,  aplica_contrato: true,  aplica_cargo: true,  aplica_tipo_vinculacion: true,  obligatorio: true,  vigencia_dias: undefined, renovacion_automatica: false, alerta_dias_antes: undefined, estado: 'activo' },
  { id: 2,  nombre_documento: 'Hoja de Vida',                  aplica_empresa: true,  aplica_contrato: true,  aplica_cargo: true,  aplica_tipo_vinculacion: true,  obligatorio: true,  vigencia_dias: undefined, renovacion_automatica: false, alerta_dias_antes: undefined, estado: 'activo' },
  { id: 3,  nombre_documento: 'Certificación Bancaria',        aplica_empresa: true,  aplica_contrato: false, aplica_cargo: false, aplica_tipo_vinculacion: false, obligatorio: true,  vigencia_dias: 90,        renovacion_automatica: false, alerta_dias_antes: 15,        estado: 'activo' },
  { id: 4,  nombre_documento: 'Afiliación ARL',                aplica_empresa: true,  aplica_contrato: true,  aplica_cargo: false, aplica_tipo_vinculacion: true,  obligatorio: true,  vigencia_dias: 365,       renovacion_automatica: true,  alerta_dias_antes: 30,        estado: 'activo' },
  { id: 5,  nombre_documento: 'Afiliación EPS',                aplica_empresa: true,  aplica_contrato: true,  aplica_cargo: false, aplica_tipo_vinculacion: true,  obligatorio: true,  vigencia_dias: 365,       renovacion_automatica: true,  alerta_dias_antes: 30,        estado: 'activo' },
  { id: 6,  nombre_documento: 'Certificado Antecedentes',      aplica_empresa: true,  aplica_contrato: true,  aplica_cargo: false, aplica_tipo_vinculacion: false, obligatorio: true,  vigencia_dias: 180,       renovacion_automatica: false, alerta_dias_antes: 20,        estado: 'activo' },
  { id: 7,  nombre_documento: 'Curso Manipulación Alimentos',  aplica_empresa: true,  aplica_contrato: true,  aplica_cargo: true,  aplica_tipo_vinculacion: false, obligatorio: true,  vigencia_dias: 365,       renovacion_automatica: true,  alerta_dias_antes: 45,        estado: 'activo' },
  { id: 8,  nombre_documento: 'Examen Médico de Ingreso',      aplica_empresa: true,  aplica_contrato: false, aplica_cargo: true,  aplica_tipo_vinculacion: true,  obligatorio: true,  vigencia_dias: 365,       renovacion_automatica: false, alerta_dias_antes: 30,        estado: 'activo' },
  { id: 9,  nombre_documento: 'Dotación y EPP',                aplica_empresa: false, aplica_contrato: true,  aplica_cargo: true,  aplica_tipo_vinculacion: false, obligatorio: true,  vigencia_dias: undefined, renovacion_automatica: false, alerta_dias_antes: undefined, estado: 'activo' },
  { id: 10, nombre_documento: 'Inducción Empresarial',         aplica_empresa: true,  aplica_contrato: false, aplica_cargo: false, aplica_tipo_vinculacion: true,  obligatorio: true,  vigencia_dias: undefined, renovacion_automatica: false, alerta_dias_antes: undefined, estado: 'activo' },
  { id: 11, nombre_documento: 'Contrato de Trabajo',           aplica_empresa: true,  aplica_contrato: true,  aplica_cargo: false, aplica_tipo_vinculacion: true,  obligatorio: true,  vigencia_dias: undefined, renovacion_automatica: false, alerta_dias_antes: undefined, estado: 'activo' },
  { id: 12, nombre_documento: 'Libreta Militar',               aplica_empresa: false, aplica_contrato: false, aplica_cargo: false, aplica_tipo_vinculacion: false, obligatorio: false, vigencia_dias: undefined, renovacion_automatica: false, alerta_dias_antes: undefined, estado: 'activo' },
];

// ─── Salarios ─────────────────────────────────────────────────────────────────

export const MOCK_SALARIOS: SalarioPersonal[] = [
  { id: 1, version: 1, empresa_id: 1, contrato_id: 1, cargo_id: 1, tipo_vinculacion: 'CTF', salario_base: 1300000, auxilio_transporte: 162000, auxilios_adicionales: 0, valor_dia: 43333, valor_turno: 21667, recargos: 0, deducciones: 104000, vigencia_desde: '2024-01-01', vigencia_hasta: '2024-12-31', estado: 'inactivo' },
  { id: 2, version: 2, empresa_id: 1, contrato_id: 1, cargo_id: 1, tipo_vinculacion: 'CTF', salario_base: 1300000, auxilio_transporte: 162000, auxilios_adicionales: 50000, valor_dia: 43333, valor_turno: 21667, recargos: 0, deducciones: 104000, vigencia_desde: '2025-01-01', vigencia_hasta: '2025-12-31', estado: 'inactivo' },
  { id: 3, version: 3, empresa_id: 1, contrato_id: 1, cargo_id: 1, tipo_vinculacion: 'CTF', salario_base: 1423500, auxilio_transporte: 200000, auxilios_adicionales: 0, valor_dia: 47450, valor_turno: 23725, recargos: 0, deducciones: 113880, vigencia_desde: '2026-01-01', estado: 'activo' },
  { id: 4, version: 1, empresa_id: 1, contrato_id: 1, cargo_id: 2, tipo_vinculacion: 'CTI', salario_base: 2800000, auxilio_transporte: 0,       auxilios_adicionales: 0, valor_dia: 93333, valor_turno: 46667, recargos: 0, deducciones: 224000, vigencia_desde: '2026-01-01', estado: 'activo' },
  { id: 5, version: 1, empresa_id: 2, contrato_id: 3, cargo_id: 6, tipo_vinculacion: 'CTF', salario_base: 1500000, auxilio_transporte: 200000, auxilios_adicionales: 0, valor_dia: 50000, valor_turno: 25000, recargos: 0, deducciones: 120000, vigencia_desde: '2024-06-01', estado: 'activo' },
];

// ─── Municipios Asignados ─────────────────────────────────────────────────────

export const MOCK_MUNICIPIOS_ASIGNADOS: MunicipioAsignado[] = [
  { id: 1, usuario_id: 2, municipio: 'Acacías',      empresa_id: 1, contrato_id: 1, estado: 'activo',   fecha_asignacion: '2024-02-01' },
  { id: 2, usuario_id: 2, municipio: 'Villavicencio',empresa_id: 1, contrato_id: 1, estado: 'activo',   fecha_asignacion: '2024-02-01' },
  { id: 3, usuario_id: 5, municipio: 'Soacha',       empresa_id: 2, contrato_id: 3, estado: 'inactivo', fecha_asignacion: '2024-03-20' },
  { id: 4, usuario_id: 5, municipio: 'Chía',         empresa_id: 2, contrato_id: 3, estado: 'inactivo', fecha_asignacion: '2024-03-20' },
];
