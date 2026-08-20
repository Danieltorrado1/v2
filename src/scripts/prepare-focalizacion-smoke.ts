import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { QueryResultRow } from 'pg';
import * as XLSX from 'xlsx';

import { dbPool } from '../config/db';
import { calculateCoverageFromRule, normalizeFocalizacionText } from '../modules/cobertura/cobertura.focalizacion.domain';
import { parseWorkbookRows } from '../modules/cobertura/cobertura.focalizacion.service';
import { loadCoverageRuleForContext } from '../modules/cobertura/cobertura.rules.service';

interface ModalidadRow extends QueryResultRow { id: string; codigo_original: string }
interface SedeRow extends QueryResultRow { id: string; consecutivo_sede: string | null; nombre_sede: string; institucion_id: string; nombre_institucion: string; nombre_municipio: string }

const main = async () => {
  const sourcePath = path.resolve('data/focalizacion-agosto-2026.xlsx');
  const buffer = await readFile(sourcePath);
  const parsed = parseWorkbookRows(buffer);
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const modalidades = (await client.query<ModalidadRow>(`SELECT id::text,codigo_original FROM modalidades WHERE COALESCE(activo,TRUE)=TRUE`)).rows;
    const sedes = (await client.query<SedeRow>(`SELECT s.id::text,s.consecutivo_sede,s.nombre_sede,s.institucion_id::text,i.nombre_institucion,m.nombre_municipio FROM sedes s JOIN instituciones i ON i.id=s.institucion_id JOIN municipios m ON m.id=s.municipio_id WHERE i.contrato_id=24`)).rows;
    const actor = (await client.query<{ id: string; correo: string | null }>(`SELECT id::text,correo FROM usuarios WHERE COALESCE(activo,TRUE)=TRUE ORDER BY id LIMIT 1`)).rows[0] ?? null;
    const enriched = [] as Array<Record<string, unknown> & { fila: number; focalizacion: number; modalidad: string; sede_id: string; evaluated: number; coverage: number | null; range: string | null }>;
    for (const row of parsed.rows) {
      if (row.focalizacion_total === null || !row.modalidad) continue;
      const modalidad = modalidades.find((m) => normalizeFocalizacionText(m.codigo_original) === normalizeFocalizacionText(row.modalidad));
      const sede = sedes.find((s) => normalizeFocalizacionText(s.consecutivo_sede) === normalizeFocalizacionText(row.consecutivo) && normalizeFocalizacionText(s.nombre_sede) === normalizeFocalizacionText(row.sede));
      if (!modalidad || !sede) throw new Error(`SMOKE_MATCH_FAILED_FILA_${row.fila_numero}`);
      const rule = await loadCoverageRuleForContext(client, { contratoId: 24, modalidadId: Number(modalidad.id), fechaVigencia: '2026-08-01' });
      if (!rule) throw new Error(`SMOKE_RULE_MISSING_${row.modalidad}`);
      const result = calculateCoverageFromRule(rule, row.focalizacion_total);
      const selectedRange = rule.rangos.find((range) => result.cupos_calculo >= range.desde && (range.hasta === null || result.cupos_calculo <= range.hasta));
      enriched.push({ fila: row.fila_numero, municipio: row.municipio, institucion: row.institucion, sede: row.sede, sede_id: sede.id, modalidad: row.modalidad, modalidad_id: modalidad.id, focalizacion: row.focalizacion_total, regla_config_id: rule.id, factor_previo: rule.factor_previo, evaluated: result.cupos_calculo, range: selectedRange ? `${selectedRange.desde}-${selectedRange.hasta ?? '∞'}` : null, coverage: result.manipuladores_requeridos, cobertura_estado: result.status });
    }
    const selected = new Map<number, typeof enriched[number]>();
    for (const code of [...new Set(enriched.map((row) => row.modalidad))]) {
      const candidates = enriched.filter((row) => row.modalidad === code).sort((a,b) => a.focalizacion-b.focalizacion);
      const candidate = candidates[Math.floor(candidates.length / 2)]; if (candidate) selected.set(candidate.fila,candidate);
    }
    const sorted = [...enriched].sort((a,b)=>a.focalizacion-b.focalizacion);
    for (const candidate of [sorted[0], sorted[Math.floor(sorted.length/2)], sorted.at(-1)]) if (candidate) selected.set(candidate.fila,candidate);
    const bySede = new Map<string, typeof enriched>();
    for (const row of enriched) bySede.set(row.sede_id,[...(bySede.get(row.sede_id)??[]),row]);
    const multi = [...bySede.values()].find((rows)=>new Set(rows.map((row)=>row.modalidad)).size>1);
    for (const candidate of multi ?? []) selected.set(candidate.fila,candidate);
    const zero = enriched.find((row)=>row.coverage===0); if (zero) selected.set(zero.fila,zero);
    const boundary = enriched.find((row)=>row.range?.split('-').includes(String(row.evaluated))); if (boundary) selected.set(boundary.fila,boundary);
    for (const candidate of sorted.filter((_,index)=>index % Math.max(1,Math.floor(sorted.length/10))===0)) { if(selected.size>=10) break; selected.set(candidate.fila,candidate); }
    const sample = [...selected.values()].slice(0,10).sort((a,b)=>a.fila-b.fila);
    if (sample.length < 8) throw new Error('SMOKE_SAMPLE_TOO_SMALL');
    const workbook = XLSX.read(buffer,{type:'buffer'}); const sheetName=workbook.SheetNames.find((name)=>normalizeFocalizacionText(name)==='DETALLADO')!;
    const raw=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!,{header:1,defval:null,raw:true}) as unknown[][];
    const sampleRows=[raw[0]!,raw[1]!,...sample.map((row)=>raw[row.fila-1]!)];
    const outputBook=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(outputBook,XLSX.utils.aoa_to_sheet(sampleRows),'DETALLADO');
    await mkdir(path.resolve('reports'),{recursive:true}); XLSX.writeFile(outputBook,path.resolve('reports/focalizacion-smoke-agosto-2026.xlsx'));
    const report={mode:'READ_ONLY_PREVIEW',source:sourcePath,vigencia:parsed.fechaDetectada,actor,rows:sample,coverage_zero_exists:enriched.some((row)=>row.coverage===0),multi_modal_sede:multi?.map((row)=>({fila:row.fila,sede:row.sede,modalidad:row.modalidad}))??[]};
    await writeFile(path.resolve('reports/focalizacion-smoke-preview.json'),JSON.stringify(report,null,2),'utf8'); console.log(JSON.stringify(report,null,2));
    await client.query('ROLLBACK');
  } catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error} finally{client.release();await dbPool.end()}
};
main().catch((error:unknown)=>{console.error(error instanceof Error?error.stack:error);process.exitCode=1});
