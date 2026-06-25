export type EstadoSolicitud =
  | 'pendiente'
  | 'en-revision'
  | 'en-proceso'
  | 'enviado'
  | 'resuelto'
  | 'rechazado'
  | 'cerrado';

export type PrioridadSolicitud = 'baja' | 'media' | 'alta';

export type TipoSolicitud =
  | 'documento'
  | 'novedad-nomina'
  | 'actualizacion-datos'
  | 'general';

export type TimelineTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'danger';

export type Solicitud = {
  id: string;
  numero: string;
  tipo: TipoSolicitud;
  tipoLabel: string;
  subTipo?: string;
  asunto: string;
  descripcion: string;
  fecha: string;
  estado: EstadoSolicitud;
  ultimaActualizacion: string;
  responsable?: string;
  observaciones?: string;
  prioridad?: PrioridadSolicitud;
  colaborador: string;
  documento: string;
  municipio: string;
};

export type TimelineItem = {
  id: number;
  fecha: string;
  texto: string;
  tipo: string;
  tono: TimelineTone;
};

export type Sesion = {
  id: number;
  fecha: string;
  hora: string;
  estado: 'exitoso' | 'fallido';
  navegador: string;
  ip: string;
};

export const mockColaborador = {
  nombre: 'María Fernanda Torres Ospina',
  documento: 'CC 1.121.873.256',
  cargo: 'Auxiliar de Enfermería',
  contrato: 'Tiempo Completo',
  municipio: 'Acacías',
  sede: 'Hospital Municipal de Acacías',
  emailRegistrado: 'mftorres@empresa.co',
  telefono: '310 456 7890',
  direccion: 'Cra 15 #8-42, Barrio Centro, Acacías',
  fechaIngreso: '15/03/2022',
  eps: 'Sanitas EPS',
  banco: 'Bancolombia',
  cuentaBancaria: '****4521',
};

export const mockTHUser = {
  nombre: 'Laura Patricia González Ramos',
  cargo: 'Analista de Talento Humano',
  municipioAsignado: 'Acacías',
  emailRegistrado: 'lgonzalez@empresa.co',
};

export const ALL_SOLICITUDES: Solicitud[] = [
  {
    id: 'SOL-001',
    numero: 'SOL-2026-001',
    tipo: 'documento',
    tipoLabel: 'Certificación Laboral',
    asunto: 'Certificación laboral para trámite bancario',
    descripcion: 'Requiero certificación laboral para apertura de cuenta bancaria en Davivienda.',
    fecha: '10/06/2026',
    estado: 'enviado',
    ultimaActualizacion: '12/06/2026',
    responsable: 'Laura González',
    observaciones: 'Documento enviado al correo registrado el 12/06/2026 a las 09:30 AM.',
    colaborador: 'María Fernanda Torres Ospina',
    documento: 'CC 1.121.873.256',
    municipio: 'Acacías',
  },
  {
    id: 'SOL-002',
    numero: 'SOL-2026-002',
    tipo: 'novedad-nomina',
    tipoLabel: 'Novedad de Nómina',
    subTipo: 'Error en liquidación',
    asunto: 'Error en desprendible de pago - Mayo 2026',
    descripcion: 'El desprendible de pago de mayo no refleja correctamente los días trabajados del 12 al 15 de mayo.',
    fecha: '05/06/2026',
    estado: 'en-revision',
    ultimaActualizacion: '08/06/2026',
    responsable: 'Laura González',
    prioridad: 'alta',
    colaborador: 'María Fernanda Torres Ospina',
    documento: 'CC 1.121.873.256',
    municipio: 'Acacías',
  },
  {
    id: 'SOL-003',
    numero: 'SOL-2026-003',
    tipo: 'actualizacion-datos',
    tipoLabel: 'Actualización de Datos',
    asunto: 'Actualización de número de teléfono',
    descripcion: 'Solicito actualizar mi número de contacto al 321 987 6543.',
    fecha: '01/06/2026',
    estado: 'resuelto',
    ultimaActualizacion: '03/06/2026',
    responsable: 'Laura González',
    observaciones: 'Datos actualizados correctamente en el sistema.',
    colaborador: 'María Fernanda Torres Ospina',
    documento: 'CC 1.121.873.256',
    municipio: 'Acacías',
  },
  {
    id: 'SOL-004',
    numero: 'SOL-2026-004',
    tipo: 'general',
    tipoLabel: 'Solicitud de Dotación',
    asunto: 'Solicitud de dotación - Tercer período 2026',
    descripcion: 'Requiero la dotación correspondiente al tercer período del año según el contrato colectivo.',
    fecha: '20/05/2026',
    estado: 'cerrado',
    ultimaActualizacion: '28/05/2026',
    responsable: 'Laura González',
    prioridad: 'media',
    observaciones: 'Dotación entregada el 27/05/2026. Se firmó acta de entrega.',
    colaborador: 'María Fernanda Torres Ospina',
    documento: 'CC 1.121.873.256',
    municipio: 'Acacías',
  },
  {
    id: 'SOL-005',
    numero: 'SOL-2026-005',
    tipo: 'documento',
    tipoLabel: 'Desprendible de Pago',
    asunto: 'Solicitud desprendible período Mayo 2026',
    descripcion: 'Requiero desprendible de pago de mayo 2026 para trámites personales.',
    fecha: '15/05/2026',
    estado: 'enviado',
    ultimaActualizacion: '15/05/2026',
    colaborador: 'María Fernanda Torres Ospina',
    documento: 'CC 1.121.873.256',
    municipio: 'Acacías',
  },
  {
    id: 'SOL-006',
    numero: 'SOL-2026-006',
    tipo: 'novedad-nomina',
    tipoLabel: 'Novedad de Nómina',
    subTipo: 'Licencia no remunerada',
    asunto: 'Licencia médica no reflejada en nómina',
    descripcion: 'La incapacidad médica del 10 al 15 de mayo no aparece reflejada en la liquidación de nómina.',
    fecha: '18/05/2026',
    estado: 'pendiente',
    ultimaActualizacion: '18/05/2026',
    prioridad: 'alta',
    colaborador: 'Carmen Alicia Ruiz Moreno',
    documento: 'CC 1.098.765.432',
    municipio: 'Acacías',
  },
  {
    id: 'SOL-007',
    numero: 'SOL-2026-007',
    tipo: 'general',
    tipoLabel: 'Permiso',
    asunto: 'Permiso por calamidad doméstica',
    descripcion: 'Solicito permiso remunerado por calamidad doméstica de conformidad con lo establecido en el reglamento interno.',
    fecha: '16/06/2026',
    estado: 'en-proceso',
    ultimaActualizacion: '17/06/2026',
    responsable: 'Laura González',
    prioridad: 'alta',
    colaborador: 'Nohora Stella Ramírez Bernal',
    documento: 'CC 1.121.654.321',
    municipio: 'Acacías',
  },
  {
    id: 'SOL-008',
    numero: 'SOL-2026-008',
    tipo: 'actualizacion-datos',
    tipoLabel: 'Actualización de Datos',
    asunto: 'Actualización de cuenta bancaria para nómina',
    descripcion: 'Solicito actualizar la cuenta bancaria para el pago de nómina. Nueva cuenta: Bancolombia ahorros 987-654321-00.',
    fecha: '14/06/2026',
    estado: 'en-revision',
    ultimaActualizacion: '15/06/2026',
    responsable: 'Laura González',
    prioridad: 'media',
    colaborador: 'Betty Josefina Herrera Pinto',
    documento: 'CC 1.110.234.567',
    municipio: 'Acacías',
  },
];

export const colabSolicitudes = ALL_SOLICITUDES.filter(
  (s) => s.colaborador === 'María Fernanda Torres Ospina',
);

export const colabTimeline: TimelineItem[] = [
  { id: 1, fecha: '25 Jun · 08:15', texto: 'Iniciaste sesión en el sistema', tipo: 'sesion', tono: 'info' },
  { id: 2, fecha: '12 Jun · 09:30', texto: 'Tu certificación laboral fue enviada al correo registrado (SOL-2026-001)', tipo: 'documento', tono: 'success' },
  { id: 3, fecha: '10 Jun · 11:00', texto: 'Solicitaste una certificación laboral (SOL-2026-001)', tipo: 'solicitud', tono: 'primary' },
  { id: 4, fecha: '08 Jun · 14:20', texto: 'Tu solicitud de novedad de nómina está en revisión (SOL-2026-002)', tipo: 'novedad', tono: 'warning' },
  { id: 5, fecha: '05 Jun · 10:45', texto: 'Registraste una novedad de nómina — Error en liquidación (SOL-2026-002)', tipo: 'novedad', tono: 'primary' },
  { id: 6, fecha: '03 Jun · 16:30', texto: 'Talento Humano aprobó la actualización de tu número de teléfono', tipo: 'datos', tono: 'success' },
  { id: 7, fecha: '01 Jun · 09:15', texto: 'Solicitaste actualización de número de teléfono (SOL-2026-003)', tipo: 'datos', tono: 'primary' },
  { id: 8, fecha: '28 May · 11:00', texto: 'Tu solicitud de dotación fue cerrada exitosamente (SOL-2026-004)', tipo: 'general', tono: 'neutral' },
];

export const thTimeline: TimelineItem[] = [
  { id: 1, fecha: '25 Jun · 08:30', texto: 'Iniciaste sesión en el sistema', tipo: 'sesion', tono: 'info' },
  { id: 2, fecha: '17 Jun · 15:20', texto: 'Marcaste en proceso la solicitud de Nohora Ramírez (SOL-2026-007)', tipo: 'gestion', tono: 'primary' },
  { id: 3, fecha: '15 Jun · 10:30', texto: 'Recibiste nueva solicitud de actualización de datos de Betty Herrera (SOL-2026-008)', tipo: 'recepcion', tono: 'warning' },
  { id: 4, fecha: '12 Jun · 09:30', texto: 'Enviaste certificación laboral a María Torres (SOL-2026-001)', tipo: 'envio', tono: 'success' },
  { id: 5, fecha: '08 Jun · 14:20', texto: 'Pusiste en revisión la novedad de María Torres (SOL-2026-002)', tipo: 'gestion', tono: 'info' },
  { id: 6, fecha: '03 Jun · 16:30', texto: 'Aprobaste actualización de teléfono de María Torres (SOL-2026-003)', tipo: 'aprobacion', tono: 'success' },
];

export const mockSesiones: Sesion[] = [
  { id: 1, fecha: '25/06/2026', hora: '08:15 AM', estado: 'exitoso', navegador: 'Chrome 125', ip: '192.168.1.45' },
  { id: 2, fecha: '24/06/2026', hora: '07:52 AM', estado: 'exitoso', navegador: 'Chrome 125', ip: '192.168.1.45' },
  { id: 3, fecha: '23/06/2026', hora: '08:03 AM', estado: 'exitoso', navegador: 'Chrome 125', ip: '192.168.1.45' },
  { id: 4, fecha: '20/06/2026', hora: '09:11 AM', estado: 'exitoso', navegador: 'Firefox 127', ip: '192.168.1.12' },
  { id: 5, fecha: '19/06/2026', hora: '08:45 AM', estado: 'fallido', navegador: 'Chrome 125', ip: '192.168.1.45' },
  { id: 6, fecha: '19/06/2026', hora: '08:47 AM', estado: 'exitoso', navegador: 'Chrome 125', ip: '192.168.1.45' },
  { id: 7, fecha: '18/06/2026', hora: '08:22 AM', estado: 'exitoso', navegador: 'Chrome 125', ip: '192.168.1.45' },
  { id: 8, fecha: '17/06/2026', hora: '07:58 AM', estado: 'exitoso', navegador: 'Chrome 125', ip: '192.168.1.45' },
  { id: 9, fecha: '16/06/2026', hora: '08:30 AM', estado: 'exitoso', navegador: 'Safari 17', ip: '192.168.1.67' },
  { id: 10, fecha: '15/06/2026', hora: '09:00 AM', estado: 'exitoso', navegador: 'Chrome 125', ip: '192.168.1.45' },
];

export const estadoBadgeTone: Record<EstadoSolicitud, string> = {
  pendiente: 'warning',
  'en-revision': 'info',
  'en-proceso': 'primary',
  enviado: 'success',
  resuelto: 'success',
  rechazado: 'danger',
  cerrado: 'neutral',
};

export const estadoLabel: Record<EstadoSolicitud, string> = {
  pendiente: 'Pendiente',
  'en-revision': 'En revisión',
  'en-proceso': 'En proceso',
  enviado: 'Enviado',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
  cerrado: 'Cerrado',
};

export const tipoBadgeTone: Record<TipoSolicitud, string> = {
  documento: 'primary',
  'novedad-nomina': 'warning',
  'actualizacion-datos': 'info',
  general: 'neutral',
};
