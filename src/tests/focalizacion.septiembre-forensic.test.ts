import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recommendMunicipality,classifyAncillary} from '../modules/cobertura/septiembre-forensic-domain';

const municipalities=[{id:'728',nombre_municipio:'PUERTO LLERAS'},{id:'734',nombre_municipio:'PUERTO RICO'},{id:'other',nombre_municipio:'PUERTO RICO'}];
test('homónimo global se documenta usando institución/sede concordantes del tenant; no se deriva geografía del consecutivo',()=>{
 assert.deepEqual(recommendMunicipality('PUERTO RICO','734','734',municipalities),{classification:'NOMBRE_AMBIGUO',proposed:'734'});
 assert.equal(recommendMunicipality('PUERTO LLERAS','734','734',municipalities).proposed,null);
 assert.equal(recommendMunicipality('PUERTO RICO','734','728',municipalities).proposed,null);
});
test('resumen, leyenda y residuos no son altas de catálogo',()=>{
 assert.equal(classifyAncillary({institucion:'TOTAL COBERTURA DEPARTAMENTO',sede:'TOTAL COBERTURA DEPARTAMENTO',techo_total:80030}),'FILA_RESUMEN_NO_APLICABLE');
 assert.equal(classifyAncillary({institucion:'CAARES',sede:'SEDES QUE SE MODIFICARON LOS CUPOS POR LA DIOCESIS'}),'FILA_RESUMEN_NO_APLICABLE');
 assert.equal(classifyAncillary({institucion:'|'}),'FILA_INVÁLIDA');
 assert.equal(classifyAncillary({institucion:'Unknown',sede:'Unknown'}),'NO_DETERMINABLE');
});
test('auditoría no escribe originales, no importa ni contiene SQL mutador',()=>{
 const script=readFileSync('src/scripts/audit-septiembre-forense.ts','utf8');
 assert.doesNotMatch(script,/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|COMMIT)\b/i);
 assert.match(script,/readOnlyTransaction/);
 const targets=[...script.matchAll(/writeFileSync\('([^']+)'/g)].map(m=>m[1]);
 assert.deepEqual(targets,['reports/septiembre-forensic-readonly.json','reports/septiembre-forensic-readonly.md']);
});
