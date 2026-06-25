import type { DocumentoRepositorio, PersonaRepositorio, PaqueteDocumental } from './repositorio.types';

// ─── Document factory helpers ────────────────────────────────────────────────

let _id = 1;
const nextId = () => _id++;

type DocOpts = Partial<Omit<DocumentoRepositorio, 'id' | 'persona_id' | 'tipo_documento'>>;

function mkDoc(
  persona_id: number,
  tipo: string,
  categoria: DocumentoRepositorio['categoria'],
  estado: DocumentoRepositorio['estado'],
  origen: DocumentoRepositorio['origen'],
  opts: DocOpts = {}
): DocumentoRepositorio {
  const interv = ['Cédula de Ciudadanía','Hoja de Vida','Afiliación ARL','Certificado Antecedentes','Curso Manipulación Alimentos','Examen Médico de Ingreso','Título Profesional','Tarjeta Profesional'].includes(tipo);
  const licit   = interv;
  const audit   = ['Cédula de Ciudadanía','Hoja de Vida','Contrato de Trabajo','Certificado Antecedentes','Evaluación de Desempeño'].includes(tipo);
  const sst     = ['Afiliación ARL','Afiliación EPS','Examen Médico de Ingreso','Curso Manipulación Alimentos','Inducción Empresarial','Dotación y EPP'].includes(tipo);
  const nomina  = ['Afiliación EPS','Certificación Bancaria','Contrato de Trabajo'].includes(tipo);

  return {
    id: nextId(),
    persona_id,
    tipo_documento: tipo,
    categoria,
    nombre_archivo: `${tipo.toLowerCase().replace(/\s+/g, '_')}_p${persona_id}.pdf`,
    estado,
    fecha_expedicion: '2024-12-01',
    fecha_carga: '2025-01-15',
    ultima_actualizacion: '2025-01-20',
    origen,
    version: 1,
    aplica_interventoria: interv,
    aplica_licitacion: licit,
    aplica_auditoria: audit,
    aplica_sst: sst,
    aplica_nomina: nomina,
    ...opts,
  };
}

// ─── Personas with documents ─────────────────────────────────────────────────

const p1Docs: DocumentoRepositorio[] = [
  mkDoc(1,'Cédula de Ciudadanía','identificacion','vigente','personal',  { fecha_expedicion:'2015-03-12' }),
  mkDoc(1,'Hoja de Vida',        'laboral',       'vigente','expediente',{ fecha_carga:'2024-11-01' }),
  mkDoc(1,'Certificación Bancaria','nomina',      'por_vencer','nomina', { fecha_vencimiento:'2026-07-10', dias_para_vencer: 15 }),
  mkDoc(1,'Afiliación ARL',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(1,'Afiliación EPS',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(1,'Certificado Antecedentes','laboral',   'vigente','personal',  { fecha_vencimiento:'2026-09-15' }),
  mkDoc(1,'Curso Manipulación Alimentos','formacion','vigente','sst',    { fecha_vencimiento:'2026-11-20' }),
  mkDoc(1,'Examen Médico de Ingreso','sst',       'vigente','sst',       { fecha_vencimiento:'2026-08-01' }),
  mkDoc(1,'Contrato de Trabajo', 'laboral',       'vigente','contrato',  { fecha_vencimiento:'2026-12-31' }),
  mkDoc(1,'Inducción Empresarial','formacion',    'vigente','expediente' ),
];

const p2Docs: DocumentoRepositorio[] = [
  mkDoc(2,'Cédula de Ciudadanía','identificacion','vigente','personal'),
  mkDoc(2,'Hoja de Vida',        'laboral',       'vigente','expediente'),
  mkDoc(2,'Certificación Bancaria','nomina',       'vigente','nomina',    { fecha_vencimiento:'2027-01-15' }),
  mkDoc(2,'Afiliación ARL',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(2,'Afiliación EPS',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(2,'Certificado Antecedentes','laboral',   'vigente','personal',  { fecha_vencimiento:'2027-03-10' }),
  mkDoc(2,'Curso Manipulación Alimentos','formacion','vigente','sst',    { fecha_vencimiento:'2027-06-15' }),
  mkDoc(2,'Examen Médico de Ingreso','sst',       'vigente','sst',       { fecha_vencimiento:'2027-01-10' }),
  mkDoc(2,'Contrato de Trabajo', 'laboral',       'vigente','contrato',  { fecha_vencimiento:'2026-12-31' }),
  mkDoc(2,'Inducción Empresarial','formacion',    'vigente','expediente' ),
];

const p3Docs: DocumentoRepositorio[] = [
  mkDoc(3,'Cédula de Ciudadanía','identificacion','vigente','personal'),
  mkDoc(3,'Hoja de Vida',        'laboral',       'vigente','expediente'),
  mkDoc(3,'Certificación Bancaria','nomina',      'pendiente','nomina'),
  mkDoc(3,'Afiliación ARL',      'sst',           'vencido','vinculacion',{ fecha_vencimiento:'2026-05-01' }),
  mkDoc(3,'Afiliación EPS',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(3,'Certificado Antecedentes','laboral',   'vencido','personal',  { fecha_vencimiento:'2026-04-15' }),
  mkDoc(3,'Curso Manipulación Alimentos','formacion','pendiente','sst'),
  mkDoc(3,'Examen Médico de Ingreso','sst',       'vigente','sst',       { fecha_vencimiento:'2026-10-20' }),
  mkDoc(3,'Contrato de Trabajo', 'laboral',       'vigente','contrato',  { fecha_vencimiento:'2026-12-31' }),
  mkDoc(3,'Inducción Empresarial','formacion',    'vigente','expediente' ),
];

const p4Docs: DocumentoRepositorio[] = [
  mkDoc(4,'Cédula de Ciudadanía','identificacion','vigente','personal'),
  mkDoc(4,'Hoja de Vida',        'laboral',       'vigente','expediente'),
  mkDoc(4,'Certificación Bancaria','nomina',      'por_vencer','nomina', { fecha_vencimiento:'2026-07-05', dias_para_vencer: 10 }),
  mkDoc(4,'Afiliación ARL',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(4,'Afiliación EPS',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(4,'Certificado Antecedentes','laboral',   'vigente','personal',  { fecha_vencimiento:'2026-11-30' }),
  mkDoc(4,'Curso Manipulación Alimentos','formacion','vigente','sst',    { fecha_vencimiento:'2026-09-15' }),
  mkDoc(4,'Examen Médico de Ingreso','sst',       'vigente','sst',       { fecha_vencimiento:'2026-12-01' }),
  mkDoc(4,'Contrato de Trabajo', 'laboral',       'vigente','contrato',  { fecha_vencimiento:'2026-12-31' }),
  mkDoc(4,'Inducción Empresarial','formacion',    'pendiente','expediente'),
];

const p5Docs: DocumentoRepositorio[] = [
  mkDoc(5,'Cédula de Ciudadanía','identificacion','vigente','personal'),
  mkDoc(5,'Hoja de Vida',        'laboral',       'vigente','expediente'),
  mkDoc(5,'Certificación Bancaria','nomina',      'vigente','nomina',    { fecha_vencimiento:'2026-10-20' }),
  mkDoc(5,'Afiliación ARL',      'sst',           'vencido','vinculacion',{ fecha_vencimiento:'2026-06-01' }),
  mkDoc(5,'Afiliación EPS',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(5,'Certificado Antecedentes','laboral',   'pendiente','personal'),
  mkDoc(5,'Curso Manipulación Alimentos','formacion','vigente','sst',    { fecha_vencimiento:'2026-08-30' }),
  mkDoc(5,'Examen Médico de Ingreso','sst',       'vigente','sst',       { fecha_vencimiento:'2026-11-15' }),
  mkDoc(5,'Contrato de Trabajo', 'laboral',       'vigente','contrato',  { fecha_vencimiento:'2026-12-31' }),
  mkDoc(5,'Inducción Empresarial','formacion',    'pendiente','expediente'),
];

const p6Docs: DocumentoRepositorio[] = [
  mkDoc(6,'Cédula de Ciudadanía','identificacion','vigente','personal'),
  mkDoc(6,'Hoja de Vida',        'laboral',       'vigente','expediente'),
  mkDoc(6,'Certificación Bancaria','nomina',      'vigente','nomina',    { fecha_vencimiento:'2027-02-28' }),
  mkDoc(6,'Afiliación ARL',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(6,'Afiliación EPS',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(6,'Certificado Antecedentes','laboral',   'vigente','personal',  { fecha_vencimiento:'2027-01-20' }),
  mkDoc(6,'Examen Médico de Ingreso','sst',       'vigente','sst',       { fecha_vencimiento:'2027-05-01' }),
  mkDoc(6,'Contrato de Trabajo', 'laboral',       'vigente','contrato',  { fecha_vencimiento:'2026-12-31' }),
  mkDoc(6,'Inducción Empresarial','formacion',    'vigente','expediente' ),
  mkDoc(6,'Título Profesional',  'formacion',     'vigente','personal'   ),
  mkDoc(6,'Tarjeta Profesional', 'formacion',     'vigente','personal',  { fecha_vencimiento:'2028-03-15' }),
];

const p7Docs: DocumentoRepositorio[] = [
  mkDoc(7,'Cédula de Ciudadanía','identificacion','vigente','personal'),
  mkDoc(7,'Hoja de Vida',        'laboral',       'vigente','expediente'),
  mkDoc(7,'Certificación Bancaria','nomina',      'vencido','nomina',    { fecha_vencimiento:'2026-05-15' }),
  mkDoc(7,'Afiliación ARL',      'sst',           'pendiente','vinculacion'),
  mkDoc(7,'Afiliación EPS',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(7,'Certificado Antecedentes','laboral',   'pendiente','personal'),
  mkDoc(7,'Examen Médico de Ingreso','sst',       'pendiente','sst'),
  mkDoc(7,'Contrato de Trabajo', 'laboral',       'vigente','contrato',  { fecha_vencimiento:'2026-12-31' }),
  mkDoc(7,'Inducción Empresarial','formacion',    'pendiente','expediente'),
  mkDoc(7,'Dotación y EPP',      'sst',           'pendiente','sst'),
];

const p8Docs: DocumentoRepositorio[] = [
  mkDoc(8,'Cédula de Ciudadanía','identificacion','vigente','personal'),
  mkDoc(8,'Hoja de Vida',        'laboral',       'vencido','expediente',{ fecha_vencimiento:'2026-04-01' }),
  mkDoc(8,'Certificación Bancaria','nomina',      'pendiente','nomina'),
  mkDoc(8,'Afiliación ARL',      'sst',           'vencido','vinculacion',{ fecha_vencimiento:'2026-03-15' }),
  mkDoc(8,'Afiliación EPS',      'sst',           'vencido','vinculacion',{ fecha_vencimiento:'2026-03-15' }),
  mkDoc(8,'Certificado Antecedentes','laboral',   'pendiente','personal'),
  mkDoc(8,'Curso Manipulación Alimentos','formacion','vencido','sst',    { fecha_vencimiento:'2025-12-01' }),
  mkDoc(8,'Examen Médico de Ingreso','sst',       'pendiente','sst'),
  mkDoc(8,'Contrato de Trabajo', 'laboral',       'vigente','contrato',  { fecha_vencimiento:'2026-12-31' }),
  mkDoc(8,'Inducción Empresarial','formacion',    'pendiente','expediente'),
];

const p9Docs: DocumentoRepositorio[] = [
  mkDoc(9,'Cédula de Ciudadanía','identificacion','vigente','personal'),
  mkDoc(9,'Hoja de Vida',        'laboral',       'vigente','expediente'),
  mkDoc(9,'Certificación Bancaria','nomina',      'vigente','nomina',    { fecha_vencimiento:'2026-12-01' }),
  mkDoc(9,'Afiliación ARL',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(9,'Afiliación EPS',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(9,'Certificado Antecedentes','laboral',   'vigente','personal',  { fecha_vencimiento:'2027-02-10' }),
  mkDoc(9,'Examen Médico de Ingreso','sst',       'por_vencer','sst',    { fecha_vencimiento:'2026-07-20', dias_para_vencer: 25 }),
  mkDoc(9,'Contrato de Trabajo', 'laboral',       'vigente','contrato',  { fecha_vencimiento:'2026-12-31' }),
  mkDoc(9,'Inducción Empresarial','formacion',    'vigente','expediente' ),
  mkDoc(9,'Dotación y EPP',      'sst',           'vigente','sst'        ),
  mkDoc(9,'Evaluación de Desempeño','otro',       'pendiente','expediente'),
];

const p10Docs: DocumentoRepositorio[] = [
  mkDoc(10,'Cédula de Ciudadanía','identificacion','vigente','personal'),
  mkDoc(10,'Hoja de Vida',        'laboral',       'vigente','expediente'),
  mkDoc(10,'Certificación Bancaria','nomina',      'vigente','nomina',   { fecha_vencimiento:'2026-11-15' }),
  mkDoc(10,'Afiliación ARL',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(10,'Afiliación EPS',      'sst',           'vigente','vinculacion',{ fecha_vencimiento:'2026-12-31' }),
  mkDoc(10,'Certificado Antecedentes','laboral',  'por_vencer','personal',{ fecha_vencimiento:'2026-07-18', dias_para_vencer: 23 }),
  mkDoc(10,'Curso Manipulación Alimentos','formacion','vigente','sst',   { fecha_vencimiento:'2026-10-05' }),
  mkDoc(10,'Examen Médico de Ingreso','sst',      'vigente','sst',       { fecha_vencimiento:'2026-09-30' }),
  mkDoc(10,'Contrato de Trabajo', 'laboral',      'vigente','contrato',  { fecha_vencimiento:'2026-12-31' }),
  mkDoc(10,'Inducción Empresarial','formacion',   'pendiente','expediente'),
];

// ─── Exported personas ───────────────────────────────────────────────────────

export const MOCK_PERSONAS: PersonaRepositorio[] = [
  {
    id: 1, nombre_completo: 'María Fernanda Torres Ospina', iniciales: 'MT',
    numero_documento: '38.492.651', tipo_doc_identidad: 'CC',
    cargo: 'Manipulador de Alimentos', empresa: 'Alimentar S.A.S', empresa_id: 1,
    contrato: 'ALI-2024-001', contrato_id: 1, municipio: 'Acacías',
    tipo_vinculacion: 'CTF', estado_vinculacion: 'Activo',
    total_requeridos: 10, documentos: p1Docs,
  },
  {
    id: 2, nombre_completo: 'Juan Camilo García Rodríguez', iniciales: 'JG',
    numero_documento: '1.025.434.221', tipo_doc_identidad: 'CC',
    cargo: 'Nutricionista', empresa: 'Alimentar S.A.S', empresa_id: 1,
    contrato: 'ALI-2024-001', contrato_id: 1, municipio: 'Acacías',
    tipo_vinculacion: 'CTF', estado_vinculacion: 'Activo',
    total_requeridos: 10, documentos: p2Docs,
  },
  {
    id: 3, nombre_completo: 'Andrea Patricia Salinas López', iniciales: 'AS',
    numero_documento: '52.897.345', tipo_doc_identidad: 'CC',
    cargo: 'Supervisor de Campo', empresa: 'Alimentar S.A.S', empresa_id: 1,
    contrato: 'ALI-2024-001', contrato_id: 1, municipio: 'Villavicencio',
    tipo_vinculacion: 'CTF', estado_vinculacion: 'Activo',
    total_requeridos: 10, documentos: p3Docs,
  },
  {
    id: 4, nombre_completo: 'Carlos Mauricio Peña Vargas', iniciales: 'CP',
    numero_documento: '80.234.567', tipo_doc_identidad: 'CC',
    cargo: 'Manipulador de Alimentos', empresa: 'Alimentar S.A.S', empresa_id: 1,
    contrato: 'ALI-2024-002', contrato_id: 2, municipio: 'Restrepo',
    tipo_vinculacion: 'CTF', estado_vinculacion: 'Activo',
    total_requeridos: 10, documentos: p4Docs,
  },
  {
    id: 5, nombre_completo: 'Diana Lucía Romero Castro', iniciales: 'DR',
    numero_documento: '23.456.789', tipo_doc_identidad: 'CC',
    cargo: 'Auxiliar de Cocina', empresa: 'Alimentar S.A.S', empresa_id: 1,
    contrato: 'ALI-2024-002', contrato_id: 2, municipio: 'Cumaral',
    tipo_vinculacion: 'CTF', estado_vinculacion: 'Activo',
    total_requeridos: 10, documentos: p5Docs,
  },
  {
    id: 6, nombre_completo: 'Pedro Enrique Morales Ruiz', iniciales: 'PM',
    numero_documento: '91.234.567', tipo_doc_identidad: 'CC',
    cargo: 'Profesional SST', empresa: 'Alimentar S.A.S', empresa_id: 1,
    contrato: 'ALI-2024-001', contrato_id: 1, municipio: 'Acacías',
    tipo_vinculacion: 'CTI', estado_vinculacion: 'Activo',
    total_requeridos: 11, documentos: p6Docs,
  },
  {
    id: 7, nombre_completo: 'Valentina Cruz Herrera', iniciales: 'VC',
    numero_documento: '1.019.234.567', tipo_doc_identidad: 'CC',
    cargo: 'Agente de Atención', empresa: 'Servicios Integrales S.A.S', empresa_id: 2,
    contrato: 'SI-2024-005', contrato_id: 3, municipio: 'Bogotá D.C.',
    tipo_vinculacion: 'OPS', estado_vinculacion: 'Activo',
    total_requeridos: 10, documentos: p7Docs,
  },
  {
    id: 8, nombre_completo: 'Sebastián Ortiz Mendoza', iniciales: 'SO',
    numero_documento: '1.001.234.890', tipo_doc_identidad: 'CC',
    cargo: 'Manipulador de Alimentos', empresa: 'Alimentar S.A.S', empresa_id: 1,
    contrato: 'ALI-2024-001', contrato_id: 1, municipio: 'Granada',
    tipo_vinculacion: 'CTF', estado_vinculacion: 'Activo',
    total_requeridos: 10, documentos: p8Docs,
  },
  {
    id: 9, nombre_completo: 'Paola Andrea Jiménez Torres', iniciales: 'PJ',
    numero_documento: '53.456.789', tipo_doc_identidad: 'CC',
    cargo: 'Coordinador Regional', empresa: 'Servicios Integrales S.A.S', empresa_id: 2,
    contrato: 'SI-2024-005', contrato_id: 3, municipio: 'Soacha',
    tipo_vinculacion: 'CTI', estado_vinculacion: 'Activo',
    total_requeridos: 11, documentos: p9Docs,
  },
  {
    id: 10, nombre_completo: 'Luis Fernando Acosta Díaz', iniciales: 'LA',
    numero_documento: '17.234.567', tipo_doc_identidad: 'CC',
    cargo: 'Manipulador de Alimentos', empresa: 'Alimentar S.A.S', empresa_id: 1,
    contrato: 'ALI-2024-002', contrato_id: 2, municipio: 'San Martín',
    tipo_vinculacion: 'CTF', estado_vinculacion: 'Activo',
    total_requeridos: 10, documentos: p10Docs,
  },
];

// ─── Packages ────────────────────────────────────────────────────────────────

export const MOCK_PAQUETES: PaqueteDocumental[] = [
  {
    id: 1, codigo: 'PKG-2026-001',
    nombre: 'Paquete Interventoría ALI-2024-001',
    descripcion: 'Documentación requerida para visita de interventoría contrato ALI-2024-001, municipios Acacías y Villavicencio.',
    tipo: 'interventoria',
    empresa: 'Alimentar S.A.S', contrato: 'ALI-2024-001', municipio: 'Acacías',
    requisitos: ['Cédula de Ciudadanía','Hoja de Vida','Afiliación ARL','Certificado Antecedentes','Curso Manipulación Alimentos','Examen Médico de Ingreso'],
    personas_ids: [1,2,3,6,8],
    cantidad_documentos: 28,
    fecha_creacion: '2026-06-10',
    usuario_creador: 'Andrea TH',
    estado: 'activo',
  },
  {
    id: 2, codigo: 'PKG-2026-002',
    nombre: 'Licitación Q3-2026 – Alimentar',
    descripcion: 'Paquete completo para proceso licitatorio Q3-2026. Incluye personal de todos los contratos activos.',
    tipo: 'licitacion',
    empresa: 'Alimentar S.A.S',
    requisitos: ['Cédula de Ciudadanía','Hoja de Vida','Afiliación ARL','Certificado Antecedentes','Curso Manipulación Alimentos','Examen Médico de Ingreso','Título Profesional'],
    personas_ids: [1,2,4,5,6,10],
    cantidad_documentos: 41,
    fecha_creacion: '2026-05-28',
    usuario_creador: 'Diego Admin',
    estado: 'activo',
  },
  {
    id: 3, codigo: 'PKG-2026-003',
    nombre: 'Auditoría SST – Junio 2026',
    descripcion: 'Documentos SST para auditoría interna de sistema de gestión de seguridad y salud en el trabajo.',
    tipo: 'auditoria',
    requisitos: ['Afiliación ARL','Afiliación EPS','Examen Médico de Ingreso','Inducción Empresarial','Dotación y EPP'],
    personas_ids: [1,2,3,4,5,6,7,8,9,10],
    cantidad_documentos: 50,
    fecha_creacion: '2026-06-20',
    usuario_creador: 'Pedro Morales',
    estado: 'exportado',
  },
];

// ─── Catalog options for filters ─────────────────────────────────────────────

export const MOCK_EMPRESAS_REPO = ['Alimentar S.A.S', 'Servicios Integrales S.A.S'];
export const MOCK_CONTRATOS_REPO = ['ALI-2024-001', 'ALI-2024-002', 'SI-2024-005'];
export const MOCK_MUNICIPIOS_REPO = ['Acacías', 'Villavicencio', 'Restrepo', 'Cumaral', 'Granada', 'San Martín', 'Bogotá D.C.', 'Soacha'];
export const MOCK_CARGOS_REPO = ['Manipulador de Alimentos', 'Nutricionista', 'Supervisor de Campo', 'Auxiliar de Cocina', 'Profesional SST', 'Agente de Atención', 'Coordinador Regional'];
