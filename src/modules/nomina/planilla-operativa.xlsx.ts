import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { AppError } from '../../utils/AppError';
import type { NominaNovedad, NominaTipoNovedadCatalogItem } from './nomina.service';
import type { PlanillaImportGuard } from './planilla-importacion.guard';

export const PLANILLA_TEMPLATE_VERSION = 'EMPIRIA-V1-OPERATIVA-2A.6-IMPORT';
export interface PlanillaWorker {
  id: string; vinculacion_id: string; persona_id: string; documento: string;
  nombre: string; institucion: string; sede: string; modalidad: string; municipio: string; municipio_id?: string;
  estado: string; fecha_inicio: string; fecha_fin: string | null;
  institucion_id?: string; sede_id?: string; modalidad_id?: string;
  tipo_contexto?: 'CONTRACTUAL'; solo_lectura?: string;
}
export interface PlanillaSnapshot {
  periodo: { id: string; contrato_id: string; empresa_id: string; numero_contrato: string;
    nombre: string; estado: string; fecha_inicio: string; fecha_fin: string };
  trabajadores: PlanillaWorker[];
  asistencias: { id: string; vinculacion_id: string; fecha: string; estado_dia: string | null }[];
  novedades: NominaNovedad[];
  catalogo: NominaTipoNovedadCatalogItem[];
  /** Contract-authorized suggestions for the non-importable modality review column. */
  modalidades_catalogo?: { id: string; nombre: string }[];
  cambios_operativos?: { id: string; nomina_empleado_id: string; vinculacion_id: string; desde: string;
    hasta: string | null; tipo: string; motivo: string | null; institucion_anterior: string | null;
    sede_anterior: string | null; modalidad_anterior: string | null; institucion_nueva: string | null;
    sede_nueva: string | null; modalidad_nueva: string | null }[];
  generado_at: string;
  alcance: string;
  import_guard?: PlanillaImportGuard[];
}

export function planillaDates(inicio: string, fin: string): string[] {
  const end = new Date(`${fin}T00:00:00Z`);
  const start = new Date(`${inicio}T00:00:00Z`);
  const expected = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 26));
  if (!Number.isFinite(end.valueOf()) || end.toISOString().slice(0, 10) !== fin ||
      end.getUTCDate() !== 25 || !Number.isFinite(start.valueOf()) || start.valueOf() !== expected.valueOf()) {
    throw new AppError('La plantilla requiere un período mensual exacto del 26 al 25', 409, 'PLANILLA_CORTE_INVALIDO');
  }
  const days: string[] = [];
  for (let day = start.valueOf(); day <= end.valueOf(); day += 86400000) days.push(new Date(day).toISOString().slice(0, 10));
  return days;
}

type NoveltyType = Pick<NominaTipoNovedadCatalogItem, 'codigo_operativo' | 'nombre' | 'afecta_cobertura' | 'modelo_registro' | 'requiere_soporte' |
  'requiere_solicitud_permiso' | 'requiere_autorizacion_descuento' | 'requiere_dias' | 'requiere_fechas' |
  'requiere_horas' | 'requiere_valor' | 'efecto_cobertura'>;
export function planillaTypeRequirements(type: NoveltyType): string {
  const fields = [type.requiere_fechas && 'Fechas', type.requiere_dias && 'Cantidad de días (no días pagados)',
    type.requiere_horas && 'Horas', type.requiere_valor && 'Valor: capturar solo en la aplicación',
    type.requiere_soporte && 'Soporte documental', type.requiere_solicitud_permiso && 'Solicitud de permiso',
    type.requiere_autorizacion_descuento && 'Autorización de descuento'];
  const code = (type.codigo_operativo || type.nombre || '').trim().toUpperCase().replaceAll(' ', '_');
  if (code === 'TA' || code === 'TURNO_ADICIONAL') fields.push('Procedimiento adicional: turno, reemplazante y contexto en la aplicación; TA es informativa y el apoyo se registra aparte');
  if (['CAMBIO_DE_MODALIDAD', 'CAMBIO_DE_SEDE', 'CAMBIO_COMBINADO'].includes(code)) fields.push('Procedimiento adicional: cambio de contexto operativo en la aplicación');
  if (type.modelo_registro === 'EVENTO_CANONICO_RANGO') fields.push('Evento canónico: revisar rango y proyección entre períodos en la aplicación');
  if (type.afecta_cobertura || type.efecto_cobertura !== 'SIN_EFECTO') fields.push('Cobertura: revisar requisitos y reemplazante en la aplicación');
  return fields.filter(Boolean).join(' · ') || 'Consultar reglas del tipo antes de importar';
}

const col = XLSX.utils.encode_col;
const codeOf = (n: NominaNovedad) => n.tipo_novedad.codigo_operativo_registrado ?? n.tipo_novedad.codigo_operativo ?? '';

/** Explicit operational projection: no salary snapshots or payable values in the book or baseline. */
export function planillaBaseline(snapshot: PlanillaSnapshot) {
  const people = new Set(snapshot.trabajadores.map(w=>w.persona_id));
  const links = new Set(snapshot.trabajadores.map(w=>w.vinculacion_id));
  const restricted = (n: NominaNovedad) => (n as NominaNovedad & { detalle_restringido?: boolean }).detalle_restringido ||
    !!(n.cobertura && (n.cobertura.nombre_externo || n.cobertura.documento_externo ||
      n.cobertura.persona_cubre_id && !people.has(n.cobertura.persona_cubre_id) ||
      n.cobertura.vinculacion_cubre_id && !links.has(n.cobertura.vinculacion_cubre_id)));
  return {
    version: PLANILLA_TEMPLATE_VERSION, periodo: snapshot.periodo, trabajadores: snapshot.trabajadores,
    ...(snapshot.import_guard ? { import_guard: snapshot.import_guard } : {}),
    asistencias: snapshot.asistencias,
    novedades: snapshot.novedades.map(n => ({ id: n.id, nomina_empleado_id: n.nomina_empleado_id,
      vinculacion_id: n.vinculacion_id, tipo_id: n.tipo_novedad.id, codigo: codeOf(n),
      fecha_inicio: n.fecha_inicio, fecha_fin: n.fecha_fin, dias: n.dias, horas: n.horas,
      observacion: restricted(n) ? 'Detalle de reemplazo reservado; original conservado en EMPIRIA. Resolver cambios en V1.' : n.observacion,
      ...(restricted(n) ? { detalle_restringido: true } : {}), registro_tipo: n.registro_tipo, evento_canonico_id: n.evento_canonico_id,
      fecha_inicio_evento_canonico: n.fecha_inicio_evento_canonico, fecha_fin_evento_canonico: n.fecha_fin_evento_canonico,
      cobertura_id: n.cobertura?.id ?? null, tipo_cobertura: n.cobertura?.tipo_cobertura ?? null,
      persona_cubre_id: restricted(n) ? null : n.cobertura?.persona_cubre_id ?? null, vinculacion_cubre_id: restricted(n) ? null : n.cobertura?.vinculacion_cubre_id ?? null,
      nombre_externo: restricted(n) ? null : n.cobertura?.nombre_externo ?? null, documento_externo: restricted(n) ? null : n.cobertura?.documento_externo ?? null,
      requiere_cobertura: n.requiere_cobertura, documento_persona_id: n.documento_persona_id,
      categoria_anterior_id: n.categoria_anterior_id, categoria_nueva_id: n.categoria_nueva_id })),
    cambios_operativos: snapshot.cambios_operativos ?? [],
    catalogo: snapshot.catalogo.map(t => ({ id: t.id, codigo: t.codigo_operativo, activo: t.activo,
      modelo: t.modelo_registro, requisitos: planillaTypeRequirements(t) })),
    ...(snapshot.modalidades_catalogo?.length ? { modalidades_catalogo: snapshot.modalidades_catalogo } : {})
  };
}

export function buildPlanillaOperativaXlsx(snapshot: PlanillaSnapshot, signature: string): Buffer {
  const days = planillaDates(snapshot.periodo.fecha_inicio, snapshot.periodo.fecha_fin);
  const baseline = planillaBaseline(snapshot);
  const book = XLSX.utils.book_new();
  const municipalities = new Map<string, PlanillaWorker[]>();
  const ids = new Set<string>();
  const people = new Set<string>();
  const workerLinks = new Set<string>();
  for (const worker of snapshot.trabajadores) {
    const contractual = worker.tipo_contexto==='CONTRACTUAL' && !!worker.solo_lectura && !worker.municipio_id && !worker.municipio;
    if ((!contractual && (!worker.municipio_id || !worker.municipio)) || !worker.persona_id || !worker.vinculacion_id ||
        ids.has(worker.id) || people.has(worker.persona_id) || workerLinks.has(worker.vinculacion_id)) {
      throw new AppError('Identidad territorial incompleta o duplicada', 409, 'PLANILLA_AMBIGUOUS_SCOPE');
    }
    ids.add(worker.id);
    people.add(worker.persona_id); workerLinks.add(worker.vinculacion_id);
    const group = contractual ? `CONTRATO:${snapshot.periodo.contrato_id}` : worker.municipio_id!;
    municipalities.set(group, [...(municipalities.get(group) ?? []), worker]);
  }
  if (!municipalities.size) throw new AppError('Sin personal autorizado', 403, 'PLANILLA_ACCESS_DENIED');
  const links = new Set(snapshot.trabajadores.map(w => w.vinculacion_id));
  if (snapshot.novedades.some(n => !ids.has(n.nomina_empleado_id) || !links.has(n.vinculacion_id)) ||
      snapshot.asistencias.some(a => !links.has(a.vinculacion_id)) ||
      snapshot.cambios_operativos?.some(c => !ids.has(c.nomina_empleado_id))) {
    throw new AppError('Detalle fuera del alcance de la planilla', 403, 'PLANILLA_ACCESS_DENIED');
  }
  const activeCodes = [...new Set(snapshot.catalogo.filter(t => t.activo && t.codigo_operativo?.trim()).map(t => t.codigo_operativo!))];
  const options = [...new Set(['PRESENTE', 'PENDIENTE', ...activeCodes])];
  const modalityOptions = [...new Map((snapshot.modalidades_catalogo ?? []).filter(m => m.id && m.nombre)
    .map(m => [m.id, `${m.id} · ${m.nombre}`])).values()];
  const hasModalitySuggestions = modalityOptions.length > 0;
  const editable = new Map<string, Set<string>>();
  const original: (string | number | null)[][] = [['Hoja', 'Fila', 'Municipio ID', 'Empleado ID', 'Vinculacion ID', 'Fecha', 'Valor original', 'Eventos', 'Asistencias', 'Editable']];
  const add = (name: string, data: (string | number | boolean | null | undefined)[][], widths: number[], header = 1) => {
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!cols'] = widths.map(wch => ({ wch }));
    sheet['!rows'] = data.map((_, i) => ({ hpt: i === header - 1 ? 38 : i < header ? 25 : 24 }));
    sheet['!autofilter'] = { ref: `A${header}:${col(widths.length - 1)}${Math.max(header, data.length)}` };
    XLSX.utils.book_append_sheet(book, sheet, name);
    return sheet;
  };
  const reserved = new Set(['Detalle_novedades', 'Catalogo', '_Original', '_Control', '_Listas', '_Base', '_Cambios']);
  for (const [municipalityId, workers] of municipalities) {
    if (new Set(workers.map(w => w.municipio)).size !== 1) throw new AppError('Municipio ambiguo', 409, 'PLANILLA_AMBIGUOUS_SCOPE');
    const root = workers[0]!.tipo_contexto==='CONTRACTUAL' ? 'Personal contrato' : workers[0]!.municipio.replace(/[\\/?*\[\]:]/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Municipio';
    let name = root.slice(0, 31);
    let suffix = 1;
    while ([...reserved].some(n => n.toLowerCase() === name.toLowerCase())) name = `${root.slice(0, 23)} ${++suffix}`;
    reserved.add(name);
    const data: (string | number | null)[][] = [
      [`EMPIRIA · PLANILLA OPERATIVA · ${workers[0]!.tipo_contexto==='CONTRACTUAL' ? 'Personal del contrato · sin municipio registrado' : workers[0]!.municipio}`],
      [`${snapshot.periodo.numero_contrato} · ${snapshot.periodo.nombre} · ${days[0]} al ${days.at(-1)}`],
      [workers[0]!.tipo_contexto==='CONTRACTUAL' ? 'Solo consulta: identidad contractual verificada; falta contexto municipal para importar cambios. No se infieren asistencias.' : 'Edite los días verdes: PRESENTE, PENDIENTE o código del catálogo. Vacío no significa falta; revise siempre la vista previa.'],
      ['[DET] = múltiples eventos o procedimiento especial. La celda es editable, pero algunos cambios requieren el flujo V1. Consulte Detalle_novedades mediante Mostrar hoja.'],
      ['Solo diligenciamiento: no confirma trabajo, no importa datos ni calcula pagos. Filtros disponibles en los encabezados.'],
      ['Municipio', 'Institución', 'Sede', 'Modalidad', 'Cédula', 'Nombre completo', 'Detalle', ...days,
        ...(hasModalitySuggestions ? ['Modalidad propuesta · no importable'] : []), 'Empleado ID', 'Vinculación ID', 'Persona ID']
    ];
    const inputs = new Set<string>();
    for (const worker of workers) {
      const row = data.length + 1;
      const workerEvents = snapshot.novedades.filter(n => n.nomina_empleado_id === worker.id);
      const attendance = snapshot.asistencias.filter(a => a.vinculacion_id === worker.vinculacion_id);
      const undated = workerEvents.some(n => !n.fecha_inicio || !n.fecha_fin);
      const values = days.map((day, index) => {
        const events = workerEvents.filter(n => n.fecha_inicio && n.fecha_fin && n.fecha_inicio <= day && n.fecha_fin >= day);
        const records = attendance.filter(a => a.fecha === day);
        const special = events.some(n => n.cobertura || n.requiere_cobertura || n.tipo_novedad.afecta_cobertura ||
          n.tipo_novedad.modelo_registro === 'EVENTO_CANONICO_RANGO' || ['TA', 'CAMBIO_DE_MODALIDAD', 'CAMBIO_DE_SEDE', 'CAMBIO_COMBINADO'].includes(codeOf(n)));
        const multiple = events.length + records.length > 1;
        const change = snapshot.cambios_operativos?.some(c => c.nomina_empleado_id === worker.id && c.desde <= day && (!c.hasta || c.hasta >= day));
        const text = [...records.map(a => a.estado_dia ?? ''), ...events.map(codeOf)].filter(Boolean).join(' + ');
        const detail = multiple || special || change;
        const value = text + (detail ? ' [DET]' : '');
        // All daily cells are editable in Excel. Import V1 still independently
        // enforces date, status, identity, permission and dependency rules.
        const unlocked = true;
        if (unlocked) inputs.add(`${col(index + 7)}${row}`);
        original.push([name, row, municipalityId, worker.id, worker.vinculacion_id, day, value, events.length, records.length, unlocked ? 'SI' : 'NO']);
        return value;
      });
      data.push([worker.municipio, worker.institucion, worker.sede, worker.modalidad, worker.documento, worker.nombre,
        worker.solo_lectura || (workerEvents.length ? `${workerEvents.length} evento(s)${undated ? ' · sin fecha: revisar' : ''}` : ''),
        ...values, ...(hasModalitySuggestions ? [''] : []), worker.id, worker.vinculacion_id, worker.persona_id]);
      if (hasModalitySuggestions) inputs.add(`${col(7 + days.length)}${row}`);
    }
    const sheet = add(name, data, [21, 32, 30, 22, 18, 36, 23, ...days.map(() => 14),
      ...(hasModalitySuggestions ? [30] : []), 23, 23, 23], 6);
    sheet['!merges'] = [0, 1, 2, 3, 4].map(r => ({ s: { r, c: 0 }, e: { r, c: 7 + days.length - 1 } }));
    const identifiersStart = 7 + days.length + (hasModalitySuggestions ? 1 : 0);
    for (let c = identifiersStart; c < identifiersStart + 3; c++) sheet['!cols']![c]!.hidden = true;
    editable.set(name, inputs);
  }
  add('Detalle_novedades', [['Novedad ID', 'Empleado ID', 'Vinculación ID', 'Código original', 'Desde', 'Hasta', 'Días evento', 'Horas', 'Observación', 'Origen', 'Evento canónico ID', 'Requisitos'],
    ...baseline.novedades.map((n, i) => [n.id, n.nomina_empleado_id, n.vinculacion_id, n.codigo, n.fecha_inicio, n.fecha_fin, n.dias, n.horas, n.observacion, n.registro_tipo, n.evento_canonico_id, planillaTypeRequirements(snapshot.novedades[i]!.tipo_novedad)])],
    [24, 24, 24, 24, 18, 18, 16, 12, 65, 26, 24, 100]);
  add('Catalogo', [['Tipo ID', 'Código real', 'Nombre', 'Vigente', 'Procedimiento / requisitos'],
    ...snapshot.catalogo.map(t => [t.id, t.codigo_operativo, t.nombre, t.activo ? 'SI' : 'NO', planillaTypeRequirements(t)])], [20, 28, 40, 12, 110]);
  add('_Original', original, [30, 12, 20, 24, 24, 18, 40, 12, 14, 14]);
  const hash = createHash('sha256').update(JSON.stringify(baseline)).digest('hex');
  add('_Control', [['Campo', 'Valor'], ['Versión', PLANILLA_TEMPLATE_VERSION], ['Empresa ID', snapshot.periodo.empresa_id],
    ['Contrato ID', snapshot.periodo.contrato_id], ['Periodo ID', snapshot.periodo.id], ['Generado UTC', snapshot.generado_at],
    ['Alcance', snapshot.alcance], ['SHA256 base', hash], ['Firma HMAC-SHA256', signature],
    ['Edición', 'Valores diarios = ajustes manuales; originales firmados separados. Sin propuestas calculadas.'],
    ['Importación', 'Disponible en EMPIRIA V1 mediante validación, vista previa y confirmación; permisos actuales, identidades, catálogo y conflictos se validan en backend.'],
    ['Protección', 'Evita ediciones accidentales; no es una autorización ni cifrado.']], [28, 120]);
  const lists = [['MarcasDiarias', ...(hasModalitySuggestions ? ['ModalidadesContrato'] : [])],
    ...Array.from({ length: Math.max(options.length, modalityOptions.length) }, (_, i) => [options[i] ?? '', ...(hasModalitySuggestions ? [modalityOptions[i] ?? ''] : [])])];
  add('_Listas', lists, [36, 48]);
  const payload = Array.from(JSON.stringify({ purpose: 'planilla-operativa-export-2A', generado_at: snapshot.generado_at, alcance: snapshot.alcance, baseline }));
  const chunks: (string | number)[][] = [['Parte', 'Original firmado sin valores económicos']];
  for (let i = 0; i < payload.length; i += 15000) chunks.push([chunks.length, payload.slice(i, i + 15000).join('')]);
  add('_Base', chunks, [12, 110]);
  book.Workbook = { Sheets: book.SheetNames.map(name => ({ name, Hidden: editable.has(name) ? 0 : ['Detalle_novedades', 'Catalogo'].includes(name) ? 1 : 2 })),
    Names: [{ Name: 'MarcasDiarias', Ref: `'_Listas'!$A$2:$A$${options.length + 1}` },
      ...(hasModalitySuggestions ? [{ Name: 'ModalidadesContrato', Ref: `'_Listas'!$B$2:$B$${modalityOptions.length + 1}` }] : [])] };
  const zip = XLSX.CFB.read(XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }), { type: 'buffer' });
  const read = (path: string) => Buffer.from(XLSX.CFB.find(zip, '/' + path).content).toString('utf8');
  const write = (path: string, value: string) => XLSX.CFB.utils.cfb_add(zip, '/' + path, Buffer.from(value));
  const style = (unlocked: boolean, title: boolean) => `<xf numFmtId="49" fontId="${title ? 1 : 0}" fillId="${title ? 2 : unlocked ? 3 : 0}" borderId="0" xfId="0" applyAlignment="1" applyProtection="1"><alignment vertical="center" wrapText="1"/><protection locked="${unlocked ? 0 : 1}"/></xf>`;
  write('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><color rgb="FF203040"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173D50"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4F4E9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3">${style(false, false)}${style(false, true)}${style(true, false)}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  book.SheetNames.forEach((name, index) => {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const main = editable.has(name);
    let source = read(path).replace(/<c\b([^>]*?)>/g, (_, attrs: string) => {
      const address = /\br="([A-Z]+)(\d+)"/.exec(attrs)!;
      const styleId = Number(address[2]) === (main ? 6 : 1) ? 1 : editable.get(name)?.has(address[1]! + address[2]) ? 2 : 0;
      return `<c${attrs.replace(/\s+s="\d+"/, '')} s="${styleId}">`;
    });
    source = source.replace(/<sheetViews>.*?<\/sheetViews>/s, `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${main ? 6 : 0}" ySplit="${main ? 6 : 1}" topLeftCell="${main ? 'G7' : 'A2'}" activePane="${main ? 'bottomRight' : 'bottomLeft'}" state="frozen"/></sheetView></sheetViews>`);
    // OOXML flags prohibit selection when true; allow both locked and unlocked cells.
    source = source.replace('</sheetData>', '</sheetData><sheetProtection sheet="1" objects="1" scenarios="1" autoFilter="0" selectLockedCells="0" selectUnlockedCells="0"/>');
    if (main) {
      const endRow = XLSX.utils.decode_range(book.Sheets[name]!['!ref']!).e.r + 1;
      const modalityColumn = col(7 + days.length);
      const modalityValidation = `<dataValidation type="list" errorStyle="stop" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Modalidad no válida" error="Seleccione una modalidad del contrato. Esta sugerencia no se importa." promptTitle="Modalidad propuesta" prompt="Solo revisión; corrija la modalidad mediante el formulario V1." sqref="${modalityColumn}7:${modalityColumn}${endRow}"><formula1>ModalidadesContrato</formula1></dataValidation>`;
      const correct = `<dataValidations count="${hasModalitySuggestions ? 2 : 1}"><dataValidation type="list" errorStyle="stop" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Marca no válida" error="Seleccione asistencia o un código vigente; revise detalles especiales en la aplicación." promptTitle="Diligenciamiento" prompt="Vacío es pendiente. No elimina eventos originales." sqref="H7:${col(6 + days.length)}${endRow}"><formula1>MarcasDiarias</formula1></dataValidation>${hasModalitySuggestions ? modalityValidation : ''}</dataValidations>`;
      const offset = source.search(/<(?:hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|ignoredErrors|drawing|extLst)\b/);
      source = offset < 0 ? source.replace('</worksheet>', correct + '</worksheet>') : source.slice(0, offset) + correct + source.slice(offset);
    }
    write(path, source);
  });
  return Buffer.from(XLSX.CFB.write(zip, { fileType: 'zip', type: 'buffer', compression: true }));
}
