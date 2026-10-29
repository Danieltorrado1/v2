import type { NominaNovedad, NominaTipoNovedadCatalogItem } from '../../modules/nomina/nomina.service';
import type { PlanillaSnapshot } from '../../modules/nomina/planilla-operativa.xlsx';

// Synthetic IDs/people only. Codes occur in the repository's PostgreSQL catalog SQL.
export function syntheticType(id: string, codigo: string, overrides = {}): NominaTipoNovedadCatalogItem {
  return { id, codigo_operativo: codigo, nombre: codigo, activo: true, afecta_salario: false, afecta_transporte: false,
    afecta_cobertura: false, afecta_dias_laborados: false, afecta_recargos: false, bloquea_otras_novedades: false,
    categoria: null, created_at: '2026-10-28T12:00:00Z', descripcion_operativa: null,
    efecto_auxilio_transporte: 'SIN_EFECTO', efecto_cobertura: 'SIN_EFECTO', efecto_liquidacion: 'SIN_EFECTO',
    efecto_operativo: 'SIN_EFECTO', efecto_pago: null, efecto_recargos: 'SIN_EFECTO', efecto_salario: 'SIN_EFECTO',
    es_adicion: false, es_accidente_laboral: false, es_deduccion: false, es_evento_operativo: false,
    es_incapacidad: false, es_permiso: false, es_suspension: false, grupo_exclusividad: 'NINGUNA',
    permite_asistencia_simultanea: false, modelo_registro: 'POR_PERIODO', observacion_plantilla: null,
    permite_rango: true, proyecta_periodos: false, requiere_revision: false, requiere_solicitud_permiso: false,
    requiere_autorizacion_descuento: false, requiere_soporte: false, requiere_dias: false, requiere_fechas: true,
    requiere_horas: false, requiere_valor: false, soporte_documento_tipo: null, ...overrides };
}

export function syntheticSnapshot(): PlanillaSnapshot {
  const catalogo = [syntheticType('11', 'PNR', { requiere_solicitud_permiso: true }),
    syntheticType('12', 'TA', { permite_asistencia_simultanea: true }),
    syntheticType('13', 'DCO'), syntheticType('14', 'S', { activo: false })];
  const novelty = (id: string, tipo: NominaTipoNovedadCatalogItem, overrides = {}): NominaNovedad => ({
    id, periodo_id: '71', nomina_empleado_id: '9007199254740993', vinculacion_id: '81',
    activo: true, categoria_anterior_id: null, categoria_nueva_id: null, cubierta: false,
    created_at: '2026-10-28T12:00:00Z', documento_persona_id: null, dias: 1, horas: null,
    evento_canonico_id: null, fecha_inicio: '2026-10-27', fecha_fin: '2026-10-27',
    fecha_inicio_evento_canonico: null, fecha_fin_evento_canonico: null, observacion: 'Evento sintético íntegro',
    cobertura: null, documentos: {
      SOPORTE: { cargado: false, documento_persona_id: null, requerido: false, tipo: 'SOPORTE' },
      SOLICITUD_PERMISO: { cargado: false, documento_persona_id: null, requerido: false, tipo: 'SOLICITUD_PERMISO' },
      AUTORIZACION_DESCUENTO: { cargado: false, documento_persona_id: null, requerido: false, tipo: 'AUTORIZACION_DESCUENTO' }
    }, persona: { nombre_completo: 'Ana Ejemplo', numero_documento: '00001234', primer_apellido: 'Ejemplo',
      primer_nombre: 'Ana', segundo_apellido: null, segundo_nombre: null }, requiere_cobertura: false,
    registro_tipo: 'ORDINARIA', revisado: false, tipo_novedad: { ...tipo, codigo_operativo_registrado: tipo.codigo_operativo },
    valor_manual: 999999999, contexto_operativo: null, ...overrides });
  return {
    periodo: { id: '71', contrato_id: '51', empresa_id: '41', numero_contrato: 'SINTÉTICO-2026', nombre: 'NOVIEMBRE 2026',
      estado: 'ABIERTO', fecha_inicio: '2026-10-26', fecha_fin: '2026-11-25' },
    generado_at: '2026-10-28T12:00:00.000Z', alcance: 'Muestra sintética sin acceso a PostgreSQL externo',
    trabajadores: [{ id: '9007199254740993', vinculacion_id: '81', persona_id: '91', documento: '00001234',
      nombre: 'Ana Ejemplo Sintética', institucion: 'Institución de muestra', sede: 'Sede Norte', modalidad: 'Modalidad de muestra',
      municipio_id: "1", municipio: 'Municipio sintético', estado: 'PENDIENTE', fecha_inicio: '2026-01-01', fecha_fin: null },
    { id: '102', vinculacion_id: '82', persona_id: '92', documento: '00005678', nombre: '=Persona sintética con texto seguro',
      institucion: 'Institución de muestra', sede: 'Sede Sur', modalidad: 'Modalidad de muestra', municipio_id: "1", municipio: 'Municipio sintético',
      estado: 'PENDIENTE', fecha_inicio: '2026-10-28', fecha_fin: '2026-11-20' }],
    asistencias: [{ id: '201', vinculacion_id: '81', fecha: '2026-10-26', estado_dia: 'PRESENTE' },
      { id: '202', vinculacion_id: '81', fecha: '2026-10-28', estado_dia: 'PENDIENTE' }],
    catalogo,
    novedades: [novelty('301', catalogo[0]!), novelty('302', catalogo[1]!, { requiere_cobertura: true }),
      novelty('303', catalogo[3]!, { fecha_inicio: null, fecha_fin: null }),
      novelty('304', catalogo[3]!, { fecha_inicio: '2026-10-29', fecha_fin: '2026-10-29' })]
  };
}
