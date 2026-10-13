import {createHash,timingSafeEqual} from 'node:crypto';
import {execFileSync} from 'node:child_process';

export const DIGEST_FIELDS = ['schema_digest','source_digest','phase48_candidates_digest','albeny_before_digest','dary_before_digest','protected_tables_digest','periods_4_6_digest','write_set_before_digest'] as const;
// Pinned to the replacement mutator commit after local certification.
export const MUTATOR_COMMIT = '5759337bbdb8e936af4788491e4ab41cc6f31db3';
export const CERTIFICATE_SHA256 = '700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7';
// Every runner at or before the certified base belongs to the revoked contract.
const revokedRunnerCommits=new Set(execFileSync('git',['rev-list','68d2c092c4d1fcc04708a81cd035567aff7b8663'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split(/\r?\n/));
export function exactEqual(a:unknown,b:unknown):boolean {
 if(typeof a!=='string'||typeof b!=='string')return false;
 const left=Buffer.from(a),right=Buffer.from(b);
 return left.length===right.length&&timingSafeEqual(left,right);
}
export function validateCertificateHash(hash:unknown){if(!exactEqual(hash,CERTIFICATE_SHA256))throw Error('CERTIFICATE_SHA256_INVALID');}
// Publishing the certified commit pin is the only permitted contract change
// after the mutator code commit; any other contract drift blocks connection.
export function assertCertifiedContract(currentCommit:string){
 const file='src/modules/cobertura/phase48-readonly-contract.ts';
 const normalize=(source:string)=>source.replace(/\r\n/g,'\n').replace(/^export const MUTATOR_COMMIT = '[a-f0-9]{40}';$/m,'export const MUTATOR_COMMIT = <CERTIFIED_PIN>;');
 const source=(commit:string)=>execFileSync('git',['show',commit+':'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
 if(!exactEqual(normalize(source(MUTATOR_COMMIT)),normalize(source(currentCommit))))throw Error('CERTIFIED_CONTRACT_CHANGED');
 execFileSync('git',['merge-base','--is-ancestor',MUTATOR_COMMIT,currentCommit],{stdio:'ignore'});
 execFileSync('git',['diff','--exit-code',MUTATOR_COMMIT,currentCommit,'--','src/modules/cobertura/phase48-readonly-connection.ts','src/modules/cobertura/phase48-readonly-preflight.ts','src/scripts/phase48-production-readonly.ts','src/modules/cobertura/phase48-readonly-schema-catalog.ts','src/modules/cobertura/phase48-readonly-schema-identity.ts','src/modules/cobertura/phase48-readonly-schema-scope.ts'],{stdio:'ignore'});
}
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
export const HISTORICAL_ASSERTIONS = Object.freeze({
 atomicPhase48AndCorrections:true,suppressExternalSync:true,preserveOperationalSources:true,
 strictAudit:true,rollbackOnAnyFailure:true,preserveCancelledPeriods:true,preservedPeriods:'4,6',
 albenyHistoricalCorrectionConfirmed:true,albenyCoverage:'18/08/2026-08/09/2026',
 albenyExistingCoverage1224Preserved:true,albenyAttendancesPreserved:16,
 daryHistoricalCorrectionConfirmed:true,daryCoverage11:'29/07/2026-31/07/2026',
 daryRequiresSalaryReview:true,daryCategory34Forbidden:true,daryAttendancesCreated:0
});
export const AUTHORIZATION_ORDER=['empresa','contrato','actor','expected_rows','readonly_runner_commit','mutator_commit','backup_sha256','certificate_sha256','project_ref',...DIGEST_FIELDS,'nonce','issued_at','expires_at',...Object.keys(HISTORICAL_ASSERTIONS)] as const;
export function authorizationFields(receipt:any):Record<string,string|number|boolean> {
 const fields:Record<string,string|number|boolean>={empresa:receipt.scope?.empresa,contrato:receipt.scope?.contrato,actor:receipt.scope?.actor,expected_rows:receipt.phase48_rows,readonly_runner_commit:receipt.commit,mutator_commit:MUTATOR_COMMIT,backup_sha256:receipt.backup_sha,certificate_sha256:receipt.certificate_sha256,project_ref:receipt.project_ref};
 for(const key of DIGEST_FIELDS)fields[key]=receipt.digests?.[key];
 Object.assign(fields,{nonce:receipt.nonce,issued_at:receipt.issued_at,expires_at:receipt.expires_at},HISTORICAL_ASSERTIONS);
 validateAuthorizationFields(fields);return fields;
}
export function validateAuthorizationFields(fields:Record<string,unknown>) {
 if(Object.keys(fields).length!==AUTHORIZATION_ORDER.length||Object.keys(fields).some(k=>!AUTHORIZATION_ORDER.includes(k))||AUTHORIZATION_ORDER.some(k=>fields[k]===undefined||fields[k]===null))throw Error('AUTHORIZATION_FIELD_REQUIRED');
 validateCertificateHash(fields.certificate_sha256);
 if(revokedRunnerCommits.has(String(fields.readonly_runner_commit)))throw Error('READONLY_RUNNER_COMMIT_REVOKED');
 if(typeof fields.readonly_runner_commit!=='string'||!/^[a-f0-9]{40}$/.test(fields.readonly_runner_commit)||fields.readonly_runner_commit==='dba731471164e5ff3c24ec64d868dbabddd327d8'||fields.readonly_runner_commit==='9c344ce12ae196558ca1dab1c8f52a14150cdda7'||fields.mutator_commit!==MUTATOR_COMMIT||fields.backup_sha256!==BACKUP_SHA256||fields.project_ref!==PROJECT_REF||fields.empresa!==15||fields.contrato!==24||fields.actor!==12||fields.expected_rows!==730||DIGEST_FIELDS.some(k=>typeof fields[k]!=='string'||!/^[a-f0-9]{64}$/.test(fields[k] as string))||typeof fields.nonce!=='string'||!/^[a-f0-9]{64}$/.test(fields.nonce))throw Error('AUTHORIZATION_FIELD_INVALID');
 for(const [k,v] of Object.entries(HISTORICAL_ASSERTIONS))if(fields[k]!==v)throw Error('AUTHORIZATION_FLAGS_INVALID');
 const issued=Date.parse(String(fields.issued_at)),expires=Date.parse(String(fields.expires_at));
 if(!Number.isFinite(issued)||!Number.isFinite(expires)||issued>Date.now()||expires<=issued||expires-issued>600_000||new Date(issued).toISOString()!==fields.issued_at||new Date(expires).toISOString()!==fields.expires_at||expires<=Date.now())throw Error('AUTHORIZATION_EXPIRATION_INVALID');
}
export function buildAuthorizationPhrase(fields:Record<string,unknown>) {
 validateAuthorizationFields(fields);
 // Explicit insertion order is fixed by authorizationFields; callers cannot reorder.
 const order=AUTHORIZATION_ORDER;
 return 'AUTHORIZE_PHASE48_HISTORICAL|'+order.map(k=>k+'='+fields[k]).join('|');
}
export function parseAuthorizationPhrase(phrase:unknown):Record<string,string|number|boolean> {
 if(typeof phrase!=='string'||/\s/.test(phrase))throw Error('AUTHORIZATION_PHRASE_INVALID');
 const parts=phrase.split('|');
 if(parts.shift()!=='AUTHORIZE_PHASE48_HISTORICAL'||parts.length!==AUTHORIZATION_ORDER.length)throw Error('AUTHORIZATION_PHRASE_INVALID');
 const fields:Record<string,string|number|boolean>={};
 for(let i=0;i<parts.length;i++){
  const part=parts[i]!,key=AUTHORIZATION_ORDER[i]!;
  if(!part.startsWith(key+'=')||part.slice(key.length+1).includes('='))throw Error('AUTHORIZATION_PHRASE_INVALID');
  const raw=part.slice(key.length+1);
  fields[key]=['empresa','contrato','actor','expected_rows','albenyAttendancesPreserved','daryAttendancesCreated'].includes(key)?Number(raw):typeof HISTORICAL_ASSERTIONS[key as keyof typeof HISTORICAL_ASSERTIONS]==='boolean'?raw==='true'?true:raw==='false'?false:raw:raw;
 }
 validateAuthorizationFields(fields);
 if(!exactEqual(buildAuthorizationPhrase(fields),phrase))throw Error('AUTHORIZATION_PHRASE_INVALID');
 return fields;
}
