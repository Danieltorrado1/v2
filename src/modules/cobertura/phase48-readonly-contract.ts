import {createHash} from 'node:crypto';

export const DIGEST_FIELDS = ['schema_digest','source_digest','phase48_candidate_digest','albeny_before_digest','dary_before_digest','protected_tables_digest','periods_4_6_digest','write_set_before_digest'] as const;
export const MUTATOR_COMMIT = 'dcbd37a';
export const BACKUP_SHA256 = '4271775ee853bf03b9f70402f7ecfd7becbe048269e3b10c76f027f981303e26';
export const PROJECT_REF = 'scuvsocqibbubqnesvuf';
// Object keys are sorted; array order is supplied by ORDER BY in the repository.
// SQL NULL, numeric zero and empty strings retain their distinct JSON types.
// Both PostgreSQL UTC offsets and ISO timestamps become ISO UTC milliseconds.
export function canonical(value:unknown):unknown {
 if(value===null||typeof value==='boolean'||typeof value==='number') {
  if(typeof value==='number'&&!Number.isFinite(value))throw Error('NON_CANONICAL_VALUE');
  return value;
 }
 if(value instanceof Date)return canonical(value.toISOString());
 if(typeof value==='string') {
  if(/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(value)) {
   const normalized=value.replace(' ','T').replace(/([+-]\d\d)$/,'$1:00');
   const milliseconds=Date.parse(normalized);
   if(!Number.isFinite(milliseconds))throw Error('INVALID_TIMESTAMP');
   // Retain microseconds beyond JS precision; equivalent spellings still match.
   const fractional=value.match(/\.(\d+)(?:Z|[+-])/);const remainder=(fractional?.[1]??'').padEnd(6,'0').slice(3,6);
   return new Date(milliseconds).toISOString().replace(/(\.\d{3})Z$/,'$1'+remainder+'Z');
  }
  return value;
 }
 if(Array.isArray(value))return value.map(canonical);
 if(typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));
 throw Error('NON_CANONICAL_VALUE');
}
export const contractDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function authorizationFields(receipt:any):Record<string,string|number|boolean> {
 const fields:Record<string,string|number|boolean>={readonly_runner_commit:receipt.commit,mutator_commit:MUTATOR_COMMIT,backup_sha256:receipt.backup_sha,project_ref:receipt.project_ref,empresa:receipt.scope?.empresa,contrato:receipt.scope?.contrato,actor:receipt.scope?.actor,expected_rows:receipt.phase48_rows};
 for(const key of DIGEST_FIELDS)fields[key]=receipt.digests?.[key];
 Object.assign(fields,{nonce:receipt.nonce,issued_at:receipt.issued_at,expires_at:receipt.expires_at,OUTBOX:false,SYNC:false,RECALC:false,suppressExternalSync:true,preserveOperationalSources:true,noPayrollRecalculation:true,atomicPhase48AndCorrections:true,status:'PENDIENTE_DE_AUTORIZACION'});
 validateAuthorizationFields(fields);return fields;
}
export function validateAuthorizationFields(fields:Record<string,unknown>) {
 const required=['readonly_runner_commit','mutator_commit','backup_sha256','project_ref','empresa','contrato','actor','expected_rows',...DIGEST_FIELDS,'nonce','issued_at','expires_at','OUTBOX','SYNC','RECALC','suppressExternalSync','preserveOperationalSources','noPayrollRecalculation','atomicPhase48AndCorrections','status'];
 if(Object.keys(fields).length!==required.length||required.some(k=>fields[k]===undefined||fields[k]===null))throw Error('AUTHORIZATION_FIELD_REQUIRED');
 if(!/^[a-f0-9]{40}$/.test(String(fields.readonly_runner_commit))||fields.mutator_commit!==MUTATOR_COMMIT||fields.backup_sha256!==BACKUP_SHA256||fields.project_ref!==PROJECT_REF||fields.empresa!==15||fields.contrato!==24||fields.actor!==12||fields.expected_rows!==730||DIGEST_FIELDS.some(k=>!/^[a-f0-9]{64}$/.test(String(fields[k])))||!/^[a-f0-9]{64}$/.test(String(fields.nonce)))throw Error('AUTHORIZATION_FIELD_INVALID');
 if(['OUTBOX','SYNC','RECALC'].some(k=>fields[k]!==false)||['suppressExternalSync','preserveOperationalSources','noPayrollRecalculation','atomicPhase48AndCorrections'].some(k=>fields[k]!==true)||fields.status!=='PENDIENTE_DE_AUTORIZACION')throw Error('AUTHORIZATION_FLAGS_INVALID');
 const issued=Date.parse(String(fields.issued_at)),expires=Date.parse(String(fields.expires_at));
 if(!Number.isFinite(issued)||!Number.isFinite(expires)||expires<=issued||expires-issued>600_000||new Date(issued).toISOString()!==fields.issued_at||new Date(expires).toISOString()!==fields.expires_at||expires<=Date.now())throw Error('AUTHORIZATION_EXPIRATION_INVALID');
}
export function buildAuthorizationPhrase(fields:Record<string,unknown>) {
 validateAuthorizationFields(fields);
 // Explicit insertion order is fixed by authorizationFields; callers cannot reorder.
 const order=['readonly_runner_commit','mutator_commit','backup_sha256','project_ref','empresa','contrato','actor','expected_rows',...DIGEST_FIELDS,'nonce','issued_at','expires_at','OUTBOX','SYNC','RECALC','suppressExternalSync','preserveOperationalSources','noPayrollRecalculation','atomicPhase48AndCorrections','status'];
 return 'AUTHORIZE_PHASE48_HISTORICAL|'+order.map(k=>k+'='+fields[k]).join('|');
}
