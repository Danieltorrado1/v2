import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { buildPlanillaOperativaXlsx, planillaBaseline, planillaDates, PLANILLA_TEMPLATE_VERSION, type PlanillaSnapshot } from './planilla-operativa.xlsx';
import type { NominaNovedad } from './nomina.service';

export const PLANILLA_MAX_BYTES = 12 * 1024 * 1024;
export type ImportBaseline = ReturnType<typeof planillaBaseline>;
export interface UploadedPlanilla {
  book: XLSX.WorkBook; baseline: ImportBaseline; signature: string; generado_at: string;
  alcance: string; fileHash: string; templateKey: string;
}
export interface ImportCell { empleado_id: string; municipio: string; hoja: string; fila: number; fecha: string;
  original: string; valor: string; editable: boolean; texto: boolean }
const fail = (message: string, code = 'PLANILLA_ARCHIVO_INVALIDO'): never => { throw new AppError(message, 422, code); };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const xmlValue=(value:string)=>value.replace(/&#(x[0-9a-f]+|\d+);|&(quot|apos|amp|lt|gt);/gi,(_m,n:string,k:string)=>n ? String.fromCodePoint(n[0]!.toLowerCase()==='x' ? parseInt(n.slice(1),16) : Number(n)) : ({quot:'"',apos:"'",amp:'&',lt:'<',gt:'>'}[k.toLowerCase()] ?? ''));

/** Bound actual decompression before SheetJS allocates a workbook. No XLS/XLSM,
 * ZIP64, encrypted parts, duplicates, formulas, embedded objects or external links.
 */
export function validatePlanillaZip(buffer: Buffer): void {
  if (buffer.length > PLANILLA_MAX_BYTES || buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) fail('Se requiere un XLSX de hasta 12 MiB');
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0 || buffer.readUInt16LE(end+4) || buffer.readUInt16LE(end+6)) fail('Contenedor ZIP no admitido');
  const entries = buffer.readUInt16LE(end+10);
  if (!entries || entries > 512 || entries !== buffer.readUInt16LE(end+8)) fail('Demasiadas partes XLSX');
  let offset = buffer.readUInt32LE(end+16); let total = 0; let cellCount=0;
  const names = new Set<string>();
  for (let i = 0; i < entries; i++) {
    if (offset+46>buffer.length || buffer.readUInt32LE(offset)!==0x02014b50) fail('Directorio XLSX invalido');
    const flags=buffer.readUInt16LE(offset+8), method=buffer.readUInt16LE(offset+10);
    const compressed=buffer.readUInt32LE(offset+20), expanded=buffer.readUInt32LE(offset+24);
    const length=buffer.readUInt16LE(offset+28), extra=buffer.readUInt16LE(offset+30), comment=buffer.readUInt16LE(offset+32);
    const local=buffer.readUInt32LE(offset+42);
    const name=buffer.subarray(offset+46,offset+46+length).toString('utf8');
    if ((flags&1) || ![0,8].includes(method) || [...names].some(n=>n.toLowerCase()===name.toLowerCase()) || name.includes('..') || name.startsWith('/') || name.includes('\\') ||
      expanded===0xffffffff || compressed===0xffffffff || /vbaProject|externalLinks|embeddings|connections|customUI|macrosheets|\.bin$/i.test(name)) fail('Parte XLSX no permitida');
    names.add(name); total+=expanded;
    if (total>96*1024*1024 || expanded>64*1024*1024 || local+30>buffer.length || buffer.readUInt32LE(local)!==0x04034b50) fail('XLSX excede los limites de expansion');
    const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
    const localName=buffer.subarray(local+30,local+30+buffer.readUInt16LE(local+26)).toString('utf8');
    if (localName!==name || buffer.readUInt16LE(local+8)!==method || buffer.readUInt16LE(local+6)!==flags) fail('Cabeceras ZIP inconsistentes');
    if (start+compressed>buffer.length) fail('Parte XLSX truncada');
    const raw=buffer.subarray(start,start+compressed);
    const data=method===8 ? inflateRawSync(raw,{ maxOutputLength: Math.max(1,expanded) }) : raw;
    if (data.length!==expanded) fail('Longitud XLSX inconsistente');
    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      const xml=data.toString('utf8');
      if (xml.includes('\u0000')) fail('Solo XML UTF-8 sin caracteres nulos');
      for (const a of xml.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)) {
        const value=xmlValue(a[3]!);
        if (['__proto__','constructor','prototype'].includes(value) || /(?:^|:)TargetMode$/i.test(a[1]!) && value!=='Internal') fail('Atributo XLSX no permitido');
        if (/^r$/.test(a[1]!) && name.startsWith('xl/worksheets/')) {
          if (/^[1-9]\d*$/.test(value)) {if(Number(value)>100000) fail('Fila fuera de limite');}
          else if (/^[A-Z]{1,3}[1-9]\d*$/.test(value)) {const c=XLSX.utils.decode_cell(value);if(c.r>=100000 || c.c>=64) fail('Celda fuera de limite');}
          else fail('Referencia de celda invalida');
        }
      }
      for (const dimension of xml.matchAll(/<(?:\w+:)?dimension\b[^>]*\bref=["']([^"']+)/g)) {
        const range=XLSX.utils.decode_range(dimension[1]!);
        if (range.e.r>=100000 || range.e.c>=64 || range.s.r<0 || range.s.c<0) fail('Dimensiones XLSX fuera de limite');
      }
      if (name.startsWith('xl/worksheets/')) {cellCount += [...xml.matchAll(/<(?:\w+:)?c(?:\s|>)/g)].length;if(cellCount>1000000) fail('Demasiadas celdas XLSX');}
      if (/<(?:\w+:)?f(?:\s|>|\/)/.test(xml) || /TargetMode\s*=\s*["']External["']/i.test(xml) || /<!DOCTYPE|<!ENTITY|<Override\b[^>]*ContentType=["'][^"']*macroEnabled/i.test(xml)) fail('No se admiten formulas, macros ni relaciones externas');
    }
    offset+=46+length+extra+comment;
  }
  if (!names.has('xl/workbook.xml') || !names.has('[Content_Types].xml')) fail('No es un libro XLSX');
}

export function readUploadedPlanilla(buffer: Buffer): UploadedPlanilla {
  try {
    validatePlanillaZip(buffer);
    const book=XLSX.read(buffer,{ type:'buffer', cellFormula:true, cellText:false });
    if (book.SheetNames.length>110 || !book.Sheets._Base || !book.Sheets._Control) fail('Faltan metadatos firmados');
    const parts=XLSX.utils.sheet_to_json<(string|number)[]>(book.Sheets._Base!,{ header:1, defval:'' });
    if (parts.length>1200 || parts.slice(1).some((r,i)=>r[0]!==i+1 || typeof r[1]!=='string')) fail('Base original alterada');
    const payload=JSON.parse(parts.slice(1).map(r=>r[1]).join('')) as { purpose:string; generado_at:string; alcance:string; baseline:ImportBaseline };
    const control=new Map(XLSX.utils.sheet_to_json<string[]>(book.Sheets._Control!,{header:1}).slice(1).map(r=>[r[0],r[1]]));
    const signature=control.get('Firma HMAC-SHA256') ?? '';
    const expected=createHmac('sha256',env.JWT_SECRET).update(JSON.stringify(payload)).digest('hex');
    if (!/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex'))) fail('Firma o datos originales alterados','PLANILLA_FIRMA_INVALIDA');
    const b=payload.baseline;
    if (payload.purpose!=='planilla-operativa-export-2A' || b.version!==PLANILLA_TEMPLATE_VERSION) fail('Descargue una plantilla nueva compatible con importacion','PLANILLA_VERSION_INCOMPATIBLE');
    if (!Array.isArray(b.trabajadores) || !b.trabajadores.length || b.trabajadores.length>2500 ||
      !b.import_guard || b.import_guard.length!==b.trabajadores.length || !Array.isArray(b.catalogo) || !Array.isArray(b.novedades)) fail('Plantilla sin identidades y revisiones completas');
    planillaDates(b.periodo.fecha_inicio,b.periodo.fecha_fin);
    if (b.trabajadores.some(w=>w.tipo_contexto==='CONTRACTUAL'
      ? !w.solo_lectura || !!(w.municipio_id || w.institucion_id || w.sede_id || w.modalidad_id)
      : !w.institucion_id || !w.sede_id || !w.modalidad_id || !w.municipio_id) || b.import_guard!.some(g=>!/^[a-f0-9]{64}$/.test(g.revision))) fail('Falta contexto laboral firmado');
    return { book, baseline:b, signature, generado_at:payload.generado_at, alcance:payload.alcance, fileHash:hash(buffer), templateKey:hash(signature) };
  } catch(error) { if (error instanceof AppError) throw error; return fail('El archivo esta danado o no es un XLSX operativo valido'); }
}

/** Regenerate protected VALUES from the HMAC-authenticated original, never from
 * user-provided protection flags, hidden states or editable-cell declarations.
 */
export function validatePlanillaValues(upload: UploadedPlanilla, current: PlanillaSnapshot): ImportCell[] {
  const b=upload.baseline;
  const catalog=b.catalogo.map(t=> {
    const live=current.catalogo.find(c=>c.id===t.id);
    if (!live) fail('El catalogo cambio: descargue una plantilla nueva','PLANILLA_CATALOGO_CAMBIO');
    return live!;
  });
  const snapshot:PlanillaSnapshot={ periodo:b.periodo, trabajadores:b.trabajadores, asistencias:b.asistencias,
    catalogo:catalog, generado_at:upload.generado_at, alcance:upload.alcance, cambios_operativos:b.cambios_operativos,
    import_guard:b.import_guard,
    novedades:b.novedades.map(n=> ({ ...n, tipo_novedad:{ ...catalog.find(t=>t.id===n.tipo_id)!, codigo_operativo_registrado:n.codigo },
      cobertura:n.cobertura_id ? { id:n.cobertura_id, tipo_cobertura:n.tipo_cobertura, persona_cubre_id:n.persona_cubre_id,
        vinculacion_cubre_id:n.vinculacion_cubre_id, nombre_externo:n.nombre_externo, documento_externo:n.documento_externo } : null
    } as unknown as NominaNovedad)) };
  if (JSON.stringify(planillaBaseline(snapshot))!==JSON.stringify(b)) fail('La configuracion del catalogo cambio; descargue una plantilla nueva','PLANILLA_CATALOGO_CAMBIO');
  const bytes=buildPlanillaOperativaXlsx(snapshot,upload.signature);
  const original=XLSX.read(bytes,{type:'buffer',cellText:false});
  const zip=XLSX.CFB.read(bytes,{type:'buffer'});
  if ([...original.SheetNames].sort().join('|')!==[...upload.book.SheetNames].sort().join('|')) fail('Hojas agregadas, eliminadas o renombradas');
  const cells:ImportCell[]=[];
  original.SheetNames.forEach((name,index)=> {
    const expected=original.Sheets[name]!, actual=upload.book.Sheets[name]!;
    const xml=Buffer.from(XLSX.CFB.find(zip,`/xl/worksheets/sheet${index+1}.xml`).content).toString();
    const unlocked=new Set([...xml.matchAll(/<c\b[^>]*r="([A-Z]+\d+)"[^>]*s="2"/g)].map(m=>m[1]));
    const main=!name.startsWith('_') && !['Detalle_novedades','Catalogo'].includes(name);
    const days=planillaDates(b.periodo.fecha_inicio,b.periodo.fecha_fin);
    const max=XLSX.utils.decode_range(expected['!ref']!).e;
    const addresses=new Set([...Object.keys(expected),...Object.keys(actual)].filter(k=>!k.startsWith('!')));
    for (const address of addresses) {
      const location=XLSX.utils.decode_cell(address);
      const daily=main && location.r>=6 && location.r<=max.r && location.c>=7 && location.c<7+days.length;
      const a=actual[address], e=expected[address];
      if (a?.f) fail('Formula no permitida');
      if (!daily && (JSON.stringify(a?.v ?? '')!==JSON.stringify(e?.v ?? '') || ((e?.v ?? '')!=='' && a?.t!==e?.t))) fail(`Dato protegido alterado en ${name}!${address}`,'PLANILLA_DATO_PROTEGIDO');
      if (daily) cells.push({ empleado_id:String(expected[XLSX.utils.encode_cell({r:location.r,c:7+days.length})]!.v), municipio:String(expected[`A${location.r+1}`]!.v),
        hoja:name, fila:location.r+1, fecha:days[location.c-7]!, original:String(e?.v ?? ''), valor:String(a?.v ?? '').trim(), editable:unlocked.has(address), texto:!a || a.t==='s' || a.t==='z' });
    }
  });
  if (cells.length!==b.trabajadores.length*planillaDates(b.periodo.fecha_inicio,b.periodo.fecha_fin).length) fail('Cuadricula incompleta');
  return cells.sort((a,b)=>a.empleado_id.localeCompare(b.empleado_id)||a.fecha.localeCompare(b.fecha));
}
