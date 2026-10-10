const fs=require('node:fs'),crypto=require('node:crypto');
const backup=JSON.parse(fs.readFileSync('reports/phase48-schema-backup-catalogs.json')).schema;
const prod=JSON.parse(fs.readFileSync('reports/phase48-schema-production-catalogs.json')).schema;
const proof=JSON.parse(fs.readFileSync('reports/phase48-schema-original-dump-comparison.json'));
if(!proof.all_productive_differences_match_original_dump)throw Error('UNRECONCILED_SCHEMA');
const direct=['cobertura_asignaciones','auditoria','auditoria_eventos','nomina_asistencia_diaria','nomina_periodos','nomina_categorias_salariales','focalizacion_final','calculadora_personal_config','sede_modalidades'];
const context=['usuarios','roles','usuario_roles','usuario_empresas','usuario_contratos','rol_permisos','permisos','nomina_empleados','nomina_empleado_detalle','nomina_contextos_operativos_base','vinculacion_condiciones_economicas'];
const relations=new Set([...direct,...context]),functions=new Set();let changed=true;
while(changed){changed=false;const add=(set,v)=>{if(v&&!set.has(v)){set.add(v);changed=true;}};
 for(const r of prod.inventory.constraints)if(relations.has(r.relation)&&r.reference_relation){if(r.reference_schema!=='public')throw Error('FOREIGN_SCHEMA_DEPENDENCY_UNRESOLVED');add(relations,r.reference_relation);}
 for(const t of prod.inventory.triggers)if(relations.has(t.relation)){if(t.function_schema!=='public')throw Error('FOREIGN_TRIGGER_DEPENDENCY_UNRESOLVED');add(functions,t.function_identity);}
 for(const d of prod.inventory.view_dependencies)if(relations.has(d.relation)){if(d.reference_schema!=='public')throw Error('FOREIGN_VIEW_DEPENDENCY_UNRESOLVED');add(relations,d.reference_relation);}
 for(const f of functions){const dep=proof.function_dependencies.find(d=>d.function_identity===f);if(!dep?.available||dep.unresolved_dynamic_sql)throw Error('FUNCTION_DEPENDENCY_UNRESOLVED');const original=backup.inventory.functions.find(r=>r.name===f),current=prod.inventory.functions.find(r=>r.name===f);if(!original||!current||original.definition!==current.definition||current.definition!==dep.definition_hash)throw Error('FUNCTION_CHANGED');for(const r of dep.relations)add(relations,r);for(const r of dep.functions)add(functions,r);}
}
const equivalents=Object.fromEntries(proof.differences.map(d=>[d.kind+':public.'+d.object+':'+(d.kind==='constraints'?'definition':'definition'),[d.restored_property,d.productive_property]]));
const manifest={direct_relations:direct.sort(),context_roots:context.sort(),critical_relations:[...relations].sort(),critical_functions:[...functions].sort(),cast_equivalences:equivalents};
fs.writeFileSync('src/modules/cobertura/phase48-readonly-schema-scope.ts','// Derived from verified dump/production catalog equality; no row data or SQL bodies.\nexport const SCHEMA_SCOPE = '+JSON.stringify(manifest,null,2)+' as const;\n');
fs.writeFileSync('reports/phase48-schema-scope.json',JSON.stringify({...manifest,excluded_relations:prod.inventory.relations.filter(r=>r.kind!=='S'&&!relations.has(r.name)).map(r=>({name:r.name,reason:'No source query, FK, trigger/function body or view dependency reachable from the fixed Phase 48 scope'})),function_dependencies:proof.function_dependencies.filter(d=>functions.has(d.function_identity))},null,2)+'\n');
console.log(JSON.stringify({critical_relations:relations.size,critical_functions:functions.size,functions:[...functions].sort()}));
