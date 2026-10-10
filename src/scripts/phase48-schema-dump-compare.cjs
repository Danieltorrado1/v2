// Decode schema-only dump into memory; never persist or print SQL definitions.
const fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const backup='C:/Users/CORE ULTRA/Documents/EmpiriaBackups/phase48-modalidad-pre-migracion-20261007T132031Z/full.dump';
const local=JSON.parse(fs.readFileSync('reports/phase48-schema-backup-catalogs.json')).schema;
const prod=JSON.parse(fs.readFileSync('reports/phase48-schema-production-catalogs.json')).schema;
const decoded=spawnSync('C:/Program Files/PostgreSQL/17/bin/pg_restore.exe',['--schema-only','--no-owner','--no-privileges','--file=-',backup],{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
if(decoded.status!==0)throw Error('SCHEMA_DECODE_FAILED');
const sql=decoded.stdout.replaceAll('\r\n','\n'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function balanced(start){let depth=0,quoted=false;for(let i=start;i<sql.length;i++){const c=sql[i];if(c==="'"){if(quoted&&sql[i+1]==="'"){i++;continue;}quoted=!quoted;}if(!quoted){if(c==='(')depth++;if(c===')'&&--depth===0)return sql.slice(start,i+1);}}throw Error('UNBALANCED_CONSTRAINT');}
const differences=[];
for(const kind of Object.keys(local.legacy_objects)){
 const a=new Map(local.legacy_objects[kind].map(r=>[r.key,r.properties])),b=new Map(prod.legacy_objects[kind].map(r=>[r.key,r.properties]));
 for(const key of new Set([...a.keys(),...b.keys()])){
  if(JSON.stringify(a.get(key))===JSON.stringify(b.get(key)))continue;
  let definition;
  if(kind==='constraints'){const name=key.split('.')[1];const marker='CONSTRAINT '+name+' CHECK ';const at=sql.indexOf(marker);if(at>=0)definition='CHECK '+balanced(at+marker.length);}
  if(kind==='indexes'){const name=key.split('.')[1],pattern=new RegExp('CREATE (?:UNIQUE )?INDEX '+name+' [^;]+;');definition=sql.match(pattern)?.[0].slice(0,-1);}
  const property=kind==='constraints'?'definition':'indexdef';
  differences.push({kind,object:key,restored_property:a.get(key)?.[property],productive_property:b.get(key)?.[property],original_dump_property:definition?sha(definition):null,productive_matches_original_dump:!!definition&&sha(definition)===b.get(key)?.[property],first_evidence:'certified backup 2026-10-07',raw_definition_persisted:false});
 }
}
const dependencies=[];
for(const entry of prod.inventory.functions){
 const name=entry.name.replace(/^public\./,'').split('(')[0];
 const blocks=sql.split(/\n--\n-- Name:/).filter(block=>new RegExp('CREATE FUNCTION public\\.'+name+'\\(').test(block));
 const body=blocks.join('\n');
 const executeCount=[...body.matchAll(/\bEXECUTE\b/gi)].length,literalCount=[...body.matchAll(/\bEXECUTE\s+'(?:[^']|'')*'/gi)].length;
 dependencies.push({function_identity:entry.name,definition_hash:entry.definition,available:blocks.length>0,dynamic_sql:executeCount>0,unresolved_dynamic_sql:executeCount!==literalCount,dynamic_sql_policy:executeCount===literalCount?'FIXED_STRING_LITERALS_ONLY':'UNRESOLVED',relations:prod.inventory.relations.filter(r=>r.kind!=='S'&&new RegExp('\\b'+r.name+'\\b').test(body)).map(r=>r.name),functions:prod.inventory.functions.filter(f=>{const n=f.name.replace(/^public\./,'').split('(')[0];return n!==name&&new RegExp('\\b'+n+'\\s*\\(').test(body);}).map(f=>f.name)});
}
const result={scope:'SCHEMA_ONLY_DUMP_IN_MEMORY',differences,all_productive_differences_match_original_dump:differences.every(d=>d.productive_matches_original_dump),function_dependencies:dependencies};
fs.writeFileSync('reports/phase48-schema-original-dump-comparison.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({all_productive_differences_match_original_dump:result.all_productive_differences_match_original_dump,differences:result.differences.length,critical_functions:dependencies.filter(d=>['nomina_invalidar_revision_operativa()','validar_contrato_aplica_cobertura()','validate_nomina_periodo_anulacion()','personas_prevent_identificador_interno_update()'].includes(d.function_identity))}));
