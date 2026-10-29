import assert from 'node:assert/strict';
import { test } from 'node:test';
import {createHmac} from 'node:crypto';
import * as XLSX from 'xlsx';
import { importHarness } from './fixtures/planilla-importacion.synthetic';
import { syntheticAuthEnvironment } from './fixtures/planilla-operativa.authorization.synthetic';
Object.assign(process.env,syntheticAuthEnvironment);

test('importacion valida: preview no escribe; crea tras confirmar y deja recibo/auditoria',async()=>{
  const h=await importHarness();try {
    const original=await h.download(); const file=h.edit(original,[{id:'101',fecha:'2026-10-27',value:'PNR'}]);
    const preview=await h.preview(file); assert.equal(preview.estado,'VISTA_PREVIA'); assert.equal(preview.plan?.nuevas,1);assert.ok(preview.token);
    assert.equal((await h.db.query<Record<string, any>>('SELECT * FROM nomina_novedades')).rows.length,0);
    assert.equal((await h.db.query<Record<string, any>>('SELECT * FROM nomina_planilla_importaciones')).rows.length,0);
    const applied=await h.confirm(file,preview.token!); assert.equal(applied.estado,'APLICADO');
    assert.equal((await h.db.query<Record<string, any>>('SELECT * FROM nomina_novedades WHERE activo=TRUE')).rows.length,1);
    const audit=(await h.db.query<Record<string, any>>('SELECT * FROM nomina_planilla_importacion_operaciones')).rows[0]!;
    assert.equal(audit.accion,'CREAR'); assert.equal(audit.origen,'EXCEL_OPERATIVO'); assert.equal(String(audit.usuario_id),'3');
    assert.ok(audit.contexto);assert.ok(audit.fecha_evento);
  } finally {await h.close();}
});

test('prevalece Excel: sustituye incompatible con baja logica, anterior/nuevo y motivo auditados',async()=>{
  const h=await importHarness();try {
    const old=await h.seed();const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'S'}]);
    const p=await h.preview(file);assert.equal(p.plan?.sustituciones,1);assert.deepEqual(p.plan?.filas.find(r=>r.accion==='SUSTITUIR')?.sustituir_ids,[old]);
    await h.confirm(file,p.token!);
    assert.equal((await h.db.query<Record<string, any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[old])).rows[0]!.activo,false);
    const active=(await h.db.query<Record<string, any>>('SELECT tipo_novedad_id FROM nomina_novedades WHERE activo=TRUE')).rows;assert.equal(active.length,1);assert.equal(String(active[0]!.tipo_novedad_id),'12');
    const audit=(await h.db.query<Record<string, any>>('SELECT anteriores,nuevos,motivo FROM nomina_planilla_importacion_operaciones')).rows[0]!;
    assert.equal(String(audit.anteriores[0].id),old);assert.equal(audit.nuevos.tipo_novedad.codigo_operativo,'S');assert.match(String(audit.motivo),/Revision expresa/);
  } finally {await h.close();}
});

test('vacio conserva original; equivalente no duplica',async()=>{
  const h=await importHarness();try {
    const original=await h.download();
    const empty=await h.preview(h.edit(original,[{id:'101',fecha:'2026-10-27',value:''}]));
    assert.equal(empty.plan?.sustituciones,0);assert.equal(empty.plan?.nuevas,0);assert.equal(empty.token,null);
    await h.seed();const current=await h.download();const same=await h.preview(current);assert.equal(same.plan?.sin_cambios,1);assert.equal(same.token,null);
    const id=(await h.db.query<Record<string,any>>('SELECT id::text FROM nomina_novedades')).rows[0]!.id;
    assert.equal((await h.db.query<Record<string, any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[id])).rows[0]!.activo,true);
  }finally{await h.close();}
});

test('borrar una S original propone RETIRAR, confirma baja logica auditada e idempotente',async()=>{const h=await importHarness();try{
  const id=await h.seed('12');const other=await h.seed('13','2026-10-28');const original=await h.download();const file=h.edit(original,[{id:'101',fecha:'2026-10-27',value:''}]);
  const p=await h.preview(file);assert.equal(p.plan!.retiradas,1);assert.equal(p.plan!.filas.find(r=>r.accion==='RETIRAR')!.anterior,'S');assert.deepEqual(p.plan!.filas.find(r=>r.accion==='RETIRAR')!.sustituir_ids,[id]);
  assert.equal((await h.db.query<Record<string,any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[id])).rows[0]!.activo,true);
  const result=await h.confirm(file,p.token!);assert.equal(result.resultado!.retiradas,1);assert.equal((await h.db.query<Record<string,any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[id])).rows[0]!.activo,false);
  assert.equal((await h.db.query<Record<string,any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[other])).rows[0]!.activo,true);
  const audit=(await h.db.query<Record<string,any>>('SELECT accion,anteriores,nuevos,motivo FROM nomina_planilla_importacion_operaciones')).rows[0]!;assert.equal(audit.accion,'SUSTITUIR');assert.equal(String(audit.anteriores[0].id),id);assert.deepEqual(audit.nuevos,{accion:'RETIRAR',valor:null});assert.match(audit.motivo,/RETIRAR/);
  assert.equal((await h.confirm(file,p.token!)).estado,'YA_APLICADO');assert.equal((await h.db.query<Record<string,any>>('SELECT count(*)::int AS n FROM nomina_novedades')).rows[0]!.n,2);
}finally{await h.close();}});

test('borrar original sin permiso de baja logica produce conflicto y no habilita confirmacion',async()=>{const h=await importHarness();try{
  const id=await h.seed('12');await h.db.exec('UPDATE rol_permisos SET activo=FALSE WHERE rol_id=3 AND permiso_id=5');
  const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:''}]);const p=await h.preview(file);
  assert.equal(p.plan!.retiradas,0);assert.ok(p.plan!.conflictos>0);assert.equal(p.token,null);
  assert.equal((await h.db.query<Record<string,any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[id])).rows[0]!.activo,true);
}finally{await h.close();}});

test('PNR original cambiado a PRESENTE propone sustitucion y conserva baja/auditoria dentro de la transaccion',async()=>{const h=await importHarness();try{
  const id=await h.seed('11');const original=await h.download();const file=h.edit(original,[{id:'101',fecha:'2026-10-27',value:'PRESENTE'}]);
  const p=await h.preview(file);const op=p.plan!.filas.find(r=>r.accion==='SUSTITUIR_ASISTENCIA')!;assert.equal(p.plan!.sustituciones,1);assert.equal(p.plan!.asistencias,1);assert.equal(op.anterior,'PNR');assert.equal(op.nuevo,'PRESENTE');assert.deepEqual(op.sustituir_ids,[id]);
  await h.confirm(file,p.token!);assert.equal((await h.db.query<Record<string,any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[id])).rows[0]!.activo,false);
  assert.equal((await h.db.query<Record<string,any>>('SELECT estado_dia FROM nomina_asistencia_diaria WHERE fecha=\'2026-10-27\'')).rows[0]!.estado_dia,'PRESENTE');
  const audit=(await h.db.query<Record<string,any>>('SELECT accion,anteriores,nuevos,motivo FROM nomina_planilla_importacion_operaciones')).rows[0]!;assert.equal(audit.accion,'ASISTENCIA');assert.equal(String(audit.anteriores[0].id),id);assert.equal(audit.nuevos.estado_dia,'PRESENTE');assert.match(audit.motivo,/SUSTITUIR_ASISTENCIA/);
}finally{await h.close();}});

test('DCO original cambiado a S propone sustitucion ordinaria sin borrar fisicamente el anterior',async()=>{const h=await importHarness();try{
  const id=await h.seed('13');const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'S'}]);const p=await h.preview(file);
  assert.equal(p.plan!.sustituciones,1);assert.equal(p.plan!.filas.find(r=>r.accion==='SUSTITUIR')!.anterior,'DCO');await h.confirm(file,p.token!);
  assert.equal((await h.db.query<Record<string,any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[id])).rows[0]!.activo,false);
  assert.equal((await h.db.query<Record<string,any>>('SELECT count(*)::int AS n FROM nomina_novedades WHERE activo=TRUE AND tipo_novedad_id=12')).rows[0]!.n,1);
}finally{await h.close();}});

test('retiro de rango, evento multiple, soporte y procesamiento permanece bloqueado',async()=>{const h=await importHarness();try{
  const ranged=await h.seed('12');await h.db.exec(`UPDATE nomina_novedades SET fecha_inicio='2026-10-26',fecha_fin='2026-10-28' WHERE id=${ranged}`);
  let file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:''}]);let p=await h.preview(file);assert.ok(p.plan!.conflictos>0);assert.equal(p.token,null);
  await h.db.exec(`UPDATE nomina_novedades SET fecha_inicio='2026-10-27',fecha_fin='2026-10-27' WHERE id=${ranged}; INSERT INTO nomina_novedades(periodo_id,nomina_empleado_id,vinculacion_id,tipo_novedad_id,fecha_inicio,fecha_fin,dias,observacion) VALUES(71,101,81,13,'2026-10-27','2026-10-27',1,'Evento independiente')`);
  file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:''}]);p=await h.preview(file);assert.ok(p.plan!.conflictos>0);assert.equal(p.token,null);
  await h.db.exec('DELETE FROM nomina_novedades WHERE tipo_novedad_id=13');await h.db.query('INSERT INTO nomina_novedad_documentos VALUES(1,$1::bigint)',[ranged]);
  file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:''}]);p=await h.preview(file);assert.ok(p.plan!.conflictos>0);assert.equal(p.token,null);
  await h.db.exec('DELETE FROM nomina_novedad_documentos');await h.db.exec('INSERT INTO nomina_movimientos VALUES(1,71,81,101,TRUE)');
  file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:''}]);p=await h.preview(file);assert.ok(p.plan!.conflictos>0);assert.equal(p.token,null);
  assert.equal((await h.db.query<Record<string,any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[ranged])).rows[0]!.activo,true);
}finally{await h.close();}});

for(const dependency of ['nomina_novedad_turnos','nomina_novedad_coberturas'])test(`retiro bloqueado con dependencia ${dependency}`,async()=>{const h=await importHarness();try{
  const id=await h.seed('12');await h.db.query(`INSERT INTO ${dependency} VALUES(1,$1::bigint)`,[id]);
  const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:''}]);const p=await h.preview(file);
  assert.ok(p.plan!.conflictos>0);assert.equal(p.plan!.retiradas,0);assert.equal(p.token,null);
  assert.equal((await h.db.query<Record<string,any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[id])).rows[0]!.activo,true);
}finally{await h.close();}});

test('archivo dos veces y reintento confirmacion no duplican; plantilla consumida no admite otro contenido',async()=>{
  const h=await importHarness();try {
    const original=await h.download();const file=h.edit(original,[{id:'101',fecha:'2026-10-27',value:'DCO'}]);const p=await h.preview(file);
    const first=await h.confirm(file,p.token!);assert.equal((await h.confirm(file,p.token!)).estado,'YA_APLICADO');assert.equal((await h.preview(file)).estado,'YA_APLICADO');
    assert.equal((await h.db.query<Record<string, any>>('SELECT * FROM nomina_novedades')).rows.length,1);assert.ok(first.resultado);
    const different=h.edit(original,[{id:'101',fecha:'2026-10-28',value:'DCO'}]);
    await assert.rejects(h.preview(different),{code:'PLANILLA_PLANTILLA_REUTILIZADA'});
  }finally{await h.close();}
});

test('TH municipal solo importa Norte; archivo general, sin municipios y permisos revocados se deniegan',async()=>{
  const h=await importHarness();try {
    const north=h.edit(await h.download(1),[{id:'101',fecha:'2026-10-27',value:'DCO'}]);const p=await h.preview(north,1);assert.ok(p.token);
    const general=await h.download();await assert.rejects(h.preview(general,1),{code:'PLANILLA_ACCESS_DENIED'});
    await assert.rejects(h.preview(north,4),{code:'PLANILLA_ACCESS_DENIED'});
    await h.db.exec('UPDATE gestor_municipio_asignaciones SET activo=FALSE WHERE usuario_id=1');
    await assert.rejects(h.confirm(north,p.token!,1),{code:'PLANILLA_ACCESS_DENIED'});
    assert.equal((await h.db.query<Record<string, any>>('SELECT * FROM nomina_novedades')).rows.length,0);
  }finally{await h.close();}
});

for(const [sheet,address,value] of [['Municipio Norte','A7','Municipio Sur'],['Municipio Norte','E7','999999'],['Municipio Norte','AM7','102'],['_Original','G2','ALTERADO'],['_Base','B2','{}']] as const) {
  test(`metadatos/identidad manipulados: ${sheet}!${address}`,async()=>{const h=await importHarness();try{
    const file=h.edit(await h.download(),[{sheet,address,value}]);await assert.rejects(h.preview(file));assert.equal((await h.db.query<Record<string, any>>('SELECT * FROM nomina_planilla_importaciones')).rows.length,0);
  }finally{await h.close();}});
}
test('formulas y archivo no XLSX se rechazan sin ejecutar contenido',async()=>{const h=await importHarness();try{
  const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'PNR',formula:'1+1'}]);await assert.rejects(h.preview(file),{code:'PLANILLA_ARCHIVO_INVALIDO'});
  await assert.rejects(h.preview(Buffer.from('not a zip')),{code:'PLANILLA_ARCHIVO_INVALIDO'});
}finally{await h.close();}});

test('cambios posteriores a descarga y posteriores a preview bloquean, sin escrituras',async()=>{const h=await importHarness();try{
  const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'DCO'}]);const p=await h.preview(file);
  await h.seed('11','2026-10-28');
  await assert.rejects(h.confirm(file,p.token!),{code:'PLANILLA_CONCURRENCIA'});
  const next=await h.preview(file);assert.ok(next.plan!.conflictos>0);assert.equal(next.token,null);
  assert.equal((await h.db.query<Record<string, any>>('SELECT * FROM nomina_planilla_importaciones')).rows.length,0);
}finally{await h.close();}});

test('multiples: preserva eventos compatibles; cambiar una celda DET no autoriza eliminacion en bloque',async()=>{const h=await importHarness();try{
  const old=await h.seed('13');const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'DCO'},{id:'101',fecha:'2026-10-28',value:'PNR'}]);
  const p=await h.preview(file);assert.ok(p.token);await h.confirm(file,p.token!);
  assert.equal((await h.db.query<Record<string, any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[old])).rows[0]!.activo,true);
  await h.seed('14');const multi=await h.download();const bad=h.edit(multi,[{id:'101',fecha:'2026-10-27',value:'S'}]);
  const conflict=await h.preview(bad);assert.ok(conflict.plan!.conflictos>0);assert.equal(conflict.token,null);
}finally{await h.close();}});

for(const dependency of ['nomina_novedad_turnos','nomina_novedad_documentos','nomina_novedad_coberturas'])test(`sustitucion bloqueada con dependencia ${dependency}`,async()=>{const h=await importHarness();try{
  const old=await h.seed();await h.db.query<Record<string, any>>(`INSERT INTO ${dependency} VALUES(1,$1::bigint)`,[old]);
  const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'S'}]);const p=await h.preview(file);
  assert.ok(p.plan!.conflictos>0);assert.equal(p.token,null);
}finally{await h.close();}});

test('periodo cerrado y liquidacion procesada no admiten escritura',async()=>{const h=await importHarness();try{
  await h.seed();const original=await h.download();const file=h.edit(original,[{id:'101',fecha:'2026-10-27',value:'S'}]);const p=await h.preview(file);
  await h.db.exec("UPDATE nomina_periodos SET estado='CERRADO'");await assert.rejects(h.confirm(file,p.token!),{code:'PLANILLA_PERIODO_CERRADO'});
  await h.db.exec("UPDATE nomina_periodos SET estado='ABIERTO'; INSERT INTO nomina_liquidaciones VALUES(1,71,81,TRUE)");
  const processed=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'S'}]);const block=await h.preview(processed);assert.ok(block.plan!.conflictos>0);
}finally{await h.close();}});

test('fallo despues de desactivar anterior o en auditoria revierte archivo completo y recibo',async()=>{const h=await importHarness();try{
  const old=await h.seed();const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'S'}]);const p=await h.preview(file);
  h.injectFailure(1);await assert.rejects(h.confirm(file,p.token!),error=>{assert.equal((error as {code:string}).code,'PLANILLA_IMPORTACION_FALLIDA');assert.equal((error as {details:{reporte:{aplicadas:number}}}).details.reporte.aplicadas,0);return true;});
  assert.equal((await h.db.query<Record<string, any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[old])).rows[0]!.activo,true);
  assert.equal((await h.db.query<Record<string, any>>('SELECT * FROM nomina_planilla_importaciones')).rows.length,0);
  h.injectFailure(0);await h.db.exec("CREATE FUNCTION fail_import_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$; CREATE TRIGGER fail_import BEFORE INSERT ON nomina_planilla_importacion_operaciones FOR EACH ROW EXECUTE FUNCTION fail_import_audit()");
  await assert.rejects(h.confirm(file,p.token!),{code:'P0001'});
  assert.equal((await h.db.query<Record<string, any>>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[old])).rows[0]!.activo,true);
  assert.equal((await h.db.query<Record<string, any>>('SELECT * FROM nomina_planilla_importaciones')).rows.length,0);
}finally{await h.close();}});

test('asistencias separadas: PRESENTE no genera novedad ni altera valores economicos',async()=>{const h=await importHarness();try{
  const before=(await h.db.query<Record<string, any>>('SELECT id,neto_pagar,dias_pagados FROM nomina_empleados ORDER BY id')).rows;
  const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'PRESENTE'}]);const p=await h.preview(file);assert.equal(p.plan!.asistencias,1);await h.confirm(file,p.token!);
  assert.equal((await h.db.query<Record<string, any>>('SELECT * FROM nomina_novedades')).rows.length,0);assert.equal((await h.db.query<Record<string, any>>('SELECT estado_dia FROM nomina_asistencia_diaria')).rows[0]!.estado_dia,'PRESENTE');
  assert.deepEqual((await h.db.query<Record<string, any>>('SELECT id,neto_pagar,dias_pagados FROM nomina_empleados ORDER BY id')).rows,before);
}finally{await h.close();}});

test('archivo de 720 personas: 22320 celdas y confirmacion controlada',async()=>{const h=await importHarness({count:720});try{
  const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'DCO'}]);const p=await h.preview(file);assert.equal(p.plan!.registros_analizados,22320);assert.equal(p.plan!.nuevas,1);await h.confirm(file,p.token!);
  assert.equal((await h.db.query<Record<string, any>>('SELECT * FROM nomina_novedades')).rows.length,1);
}finally{await h.close();}});

test('multiples ordinarias: seleccion equivalente conserva independientes y sustituye solo incompatibles sin duplicar',async()=>{const h=await importHarness();try{
  const keep=await h.seed('13');const replace=await h.seed('11');
  const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'DCO'}]);const p=await h.preview(file);
  assert.equal(p.plan!.sustituciones,1);assert.deepEqual(p.plan!.filas.find(r=>r.accion==='SUSTITUIR')!.sustituir_ids,[replace]);
  await h.confirm(file,p.token!);
  const rows=(await h.db.query<Record<string,any>>('SELECT id::text,activo FROM nomina_novedades ORDER BY id')).rows;
  assert.equal(rows.length,2);assert.equal(rows.find(r=>r.id===keep)!.activo,true);assert.equal(rows.find(r=>r.id===replace)!.activo,false);
}finally{await h.close();}});

test('permisos de escritura retirados despues de preview impiden confirmar aunque lectura continue',async()=>{const h=await importHarness();try{
  const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'DCO'}]);const p=await h.preview(file);
  await h.db.exec('UPDATE rol_permisos SET activo=FALSE WHERE rol_id=3 AND permiso_id=4');
  await assert.rejects(h.confirm(file,p.token!),{code:'PLANILLA_CONCURRENCIA'});assert.equal((await h.db.query('SELECT * FROM nomina_novedades')).rows.length,0);
}finally{await h.close();}});

test('confirmacion explicita, token de otro usuario y archivo cambiado tras preview se rechazan',async()=>{const h=await importHarness();try{
  const original=await h.download(1);const file=h.edit(original,[{id:'101',fecha:'2026-10-27',value:'DCO'}]);const p=await h.preview(file,1);
  await assert.rejects(h.confirm(file,p.token!,3),{code:'PLANILLA_ACCESS_DENIED'});
  const altered=h.edit(original,[{id:'101',fecha:'2026-10-28',value:'DCO'}]);await assert.rejects(h.confirm(altered,p.token!,1),{code:'PLANILLA_CONCURRENCIA'});
  await assert.rejects(h.execute({archivo:file,periodoId:'71',tenant:h.tenant(1),confirmacion:{token:p.token!,confirmar:'NO' as 'CONFIRMAR',motivo:'Revision expresa del archivo'}}),{code:'PLANILLA_CONFIRMACION_REQUERIDA'});
}finally{await h.close();}});

test('soportes, horas y turnos adicionales requieren flujo adicional; no se inventan datos',async()=>{const h=await importHarness();try{
  for(const flag of ['requiere_soporte','requiere_horas','requiere_valor','requiere_solicitud_permiso']) {
    await h.db.query('UPDATE nomina_tipos_novedad SET perfil=jsonb_set(perfil,$1::text[],\'true\'::jsonb) WHERE id=13',[[flag]]);
    const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'DCO'}]);const p=await h.preview(file);assert.ok(p.plan!.conflictos);assert.equal(p.token,null);
    await h.db.query('UPDATE nomina_tipos_novedad SET perfil=jsonb_set(perfil,$1::text[],\'false\'::jsonb) WHERE id=13',[[flag]]);
  }
  const ta=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'TA'}]);assert.equal((await h.preview(ta)).token,null);
}finally{await h.close();}});

test('vinculacion y contexto exacto por fecha se validan tambien en preview',async()=>{const h=await importHarness();try{
  await h.db.exec("UPDATE cobertura_asignaciones SET fecha_inicio='2026-11-01' WHERE vinculacion_id=81");
  const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'DCO'}]);const p=await h.preview(file);
  assert.ok(p.plan!.filas.some(r=>r.motivo==='CONTEXTO_LABORAL_NO_CORRESPONDE_A_LA_FECHA'));assert.equal(p.token,null);
}finally{await h.close();}});

test('contenedor hostil: atributos de prototipo, dimensiones enormes, partes externas y macros se rechazan antes de leer el libro',async()=>{const h=await importHarness();try{
  const original=await h.download();
  for(const kind of ['prototype','dimension','external','macro','local-header']) {
    const zip=XLSX.CFB.read(original,{type:'buffer'});
    if(kind==='prototype' || kind==='dimension') {
      const part=kind==='prototype'?'/xl/workbook.xml':'/xl/worksheets/sheet1.xml';
      const xml=Buffer.from(XLSX.CFB.find(zip,part).content).toString();
      const modified=kind==='prototype'?xml.replace('name="Municipio Norte"','name="__proto__"'):xml.replace(/<dimension ref="[^"]*"/, '<dimension ref="A1:XFD1048576"');
      XLSX.CFB.utils.cfb_add(zip,part,Buffer.from(modified));
    } else if(kind==='external') XLSX.CFB.utils.cfb_add(zip,'/xl/externalLinks/link1.xml',Buffer.from('<external/>'));
    else if(kind==='macro') XLSX.CFB.utils.cfb_add(zip,'/xl/vbaProject.bin',Buffer.from('synthetic'));
    const bad=Buffer.from(XLSX.CFB.write(zip,{fileType:'zip',type:'buffer',compression:true}));
    if(kind==='local-header') bad[30]=bad[30]!^1;
    await assert.rejects(h.preview(bad),{code:'PLANILLA_ARCHIVO_INVALIDO'});
  }
}finally{await h.close();}});

test('version anterior autenticada se rechaza con instruccion de nueva descarga',async()=>{const h=await importHarness();try{
  const original=await h.download();const book=XLSX.read(original,{type:'buffer'});const payload=JSON.parse(book.Sheets._Base!.B2.v);
  payload.baseline.version='EMPIRIA-V1-OPERATIVA-2A.5-MUNICIPIOS';
  const signature=createHmac('sha256','test-only').update(JSON.stringify(payload)).digest('hex');
  const old=h.edit(original,[{sheet:'_Base',address:'B2',value:JSON.stringify(payload)},{sheet:'_Control',address:'B9',value:signature}]);
  await assert.rejects(h.preview(old),{code:'PLANILLA_VERSION_INCOMPATIBLE'});
}finally{await h.close();}});

test('DCO individual con cantidad explicita de un dia conserva asistencia simultanea cuando catalogo V1 la permite',async()=>{const h=await importHarness();try{
  await h.db.exec("INSERT INTO nomina_asistencia_diaria(periodo_id,vinculacion_id,fecha,estado_dia) VALUES(71,81,'2026-10-27','PRESENTE')");
  const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'DCO'}]);const p=await h.preview(file);assert.equal(p.plan!.nuevas,1);await h.confirm(file,p.token!);
  assert.equal((await h.db.query<{estado_dia:string}>('SELECT estado_dia FROM nomina_asistencia_diaria')).rows[0]!.estado_dia,'PRESENTE');
  assert.equal(Number((await h.db.query<{dias:string}>('SELECT dias FROM nomina_novedades')).rows[0]!.dias),1);
}finally{await h.close();}});

test('version MVCC detecta edicion y restauracion de los mismos valores sin updated_at',async()=>{const h=await importHarness();try{
  const id=await h.seed();const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-27',value:'S'}]);const p=await h.preview(file);
  await h.db.query('UPDATE nomina_novedades SET observacion=\'temporal\' WHERE id=$1::bigint',[id]);
  await h.db.query('UPDATE nomina_novedades SET observacion=\'Original sintetico\' WHERE id=$1::bigint',[id]);
  await assert.rejects(h.confirm(file,p.token!),{code:'PLANILLA_CONCURRENCIA'});
  assert.equal((await h.db.query('SELECT * FROM nomina_planilla_importaciones')).rows.length,0);
}finally{await h.close();}});
