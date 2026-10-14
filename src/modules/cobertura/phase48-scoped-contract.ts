import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {contractDigest} from './phase48-readonly-contract';
export const SCOPED_VERSION='PHASE48_SCOPED_MANAGED_EVENTS_V3' as const;
export const SCOPED_TTL_MS=120_000;
const revokedCommits=new Set(execFileSync('git',['rev-list','9f478ae8d519421759845e9a1826f8414c59efac'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split(/\r?\n/));
export const SCOPED_DIGESTS=['candidate_ids_digest','phase48_candidates_digest','source_digest','write_set_before_digest','critical_schema_digest','critical_definition_digest','critical_sequences_digest'] as const;
export const scopedDigest=contractDigest;
const deepFreeze=<T>(value:T):T=>{if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))deepFreeze(v);}return value;};
export const SALARY_DECISION=deepFreeze({version:'PHASE48_HUMAN_SALARY_REVIEW_V1',economic_authorization:false,
 rows:[{id:'1277',category_id:'35',classification:'VALID_REQUIRES_SALARY_REVIEW',requires_salary_review:true},
 {id:'1278',category_id:'34',classification:'VALID_COMPATIBLE',requires_salary_review:false},
 {id:'1279',category_id:'35',classification:'VALID_REQUIRES_SALARY_REVIEW',requires_salary_review:true}],
 payroll_recalculation:false,create_attendances:false,create_novedades:false,create_movements:false,create_turns:false});
export type ScopedSet=Record<typeof SCOPED_DIGESTS[number],string>&{candidate_count:number;candidate_ids:string[];manifest_digest:string;salary_decision_digest:string;albeny_digest:string;dary_digest:string;periods_4_6_digest:string};
export type ScopedSeal={version:typeof SCOPED_VERSION;scope:'15_24_IDENTITIES_AND_HISTORICAL_ONLY';economic_authorization:false;issued_at:number;expires_at:number;nonce:string;run_id:string;readonly_runner_commit:string;mutator_commit:string;set:ScopedSet;mac:string};
export function requireScoped(ok:unknown,code:string):asserts ok{if(!ok)throw Error(code);}
export function sortScopedIds(ids:string[]){requireScoped(ids.every(id=>/^[1-9]\d*$/.test(id))&&new Set(ids).size===ids.length,'INVALID_CANDIDATE_IDS');return [...ids].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);}
export function validateScopedSet(set:ScopedSet){
 requireScoped(Number.isSafeInteger(set.candidate_count)&&set.candidate_count>0&&set.candidate_ids.length===set.candidate_count,'INVALID_CANDIDATE_COUNT');
 requireScoped(scopedDigest(sortScopedIds(set.candidate_ids))===set.candidate_ids_digest&&JSON.stringify(sortScopedIds(set.candidate_ids))===JSON.stringify(set.candidate_ids),'INVALID_CANDIDATE_IDS');
 for(const name of [...SCOPED_DIGESTS,'manifest_digest','salary_decision_digest','albeny_digest','dary_digest','periods_4_6_digest'] as const)requireScoped(/^[a-f0-9]{64}$/.test(set[name]),'INVALID_SCOPED_DIGEST');
 requireScoped(set.salary_decision_digest===scopedDigest(SALARY_DECISION),'SALARY_REVIEW_POLICY_CHANGED');
}
// This authority is deliberately in-process and LOCAL_ONLY. It cannot issue a
// production grant. A future cross-process grant needs a newly authorized entry.
export function createScopedLocalAuthority(clock:()=>number=Date.now,persistence?:{key:Buffer;claimNonce:(seal:ScopedSeal)=>unknown}){
 if(persistence)requireScoped(Buffer.isBuffer(persistence.key)&&persistence.key.length===32&&typeof persistence.claimNonce==='function','PERSISTENT_AUTHORITY_REQUIRED');
 // Key custody is injected by the host, never serialized in a receipt or Git.
 // The local CLI defaults to an ephemeral lab key; production remains revoked.
 const key=persistence?Buffer.from(persistence.key):randomBytes(32),used=new Set<string>();
 const sign=(body:Omit<ScopedSeal,'mac'>)=>createHmac('sha256',key).update(JSON.stringify(body)).digest('hex');
 const authenticate=(seal:ScopedSeal)=>{
  requireScoped(seal?.version===SCOPED_VERSION&&seal.scope==='15_24_IDENTITIES_AND_HISTORICAL_ONLY'&&seal.economic_authorization===false,'LEGACY_OR_ECONOMIC_GRANT_REVOKED');
  const {mac,...body}=seal;requireScoped(/^[a-f0-9]{64}$/.test(mac)&&timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(sign(body),'hex')),'SCOPED_SEAL_INVALID');
  requireScoped(/^phase48-[a-f0-9-]{36}$/.test(seal.run_id)&&/^[a-f0-9]{40}$/.test(seal.readonly_runner_commit)&&/^[a-f0-9]{40}$/.test(seal.mutator_commit),'SCOPED_RELEASE_INVALID');
  requireScoped(!revokedCommits.has(seal.readonly_runner_commit)&&!revokedCommits.has(seal.mutator_commit),'LEGACY_COMMIT_REVOKED');
  validateScopedSet(seal.set);
 };
 const live=(seal:ScopedSeal)=>{authenticate(seal);requireScoped(seal.expires_at-seal.issued_at===SCOPED_TTL_MS&&clock()>=seal.issued_at&&clock()<seal.expires_at,'SCOPED_SEAL_EXPIRED');};
 return {authenticate,assertLive:live,
  signWitness(seal:ScopedSeal,value:unknown){authenticate(seal);return createHmac('sha256',key).update('PHASE48_SCOPED_WITNESS_V2|'+seal.nonce+'|'+scopedDigest(value)).digest('hex');},
  verifyWitness(seal:ScopedSeal,value:unknown,mac:string){authenticate(seal);const expected=createHmac('sha256',key).update('PHASE48_SCOPED_WITNESS_V2|'+seal.nonce+'|'+scopedDigest(value)).digest('hex');requireScoped(/^[a-f0-9]{64}$/.test(mac)&&timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(expected,'hex')),'PUBLISHED_WITNESS_INVALID');},
  issue(set:ScopedSet,run_id:string,readonly_runner_commit:string,mutator_commit:string):ScopedSeal{
   validateScopedSet(set);const issued_at=clock();
   const body:Omit<ScopedSeal,'mac'>={version:SCOPED_VERSION,scope:'15_24_IDENTITIES_AND_HISTORICAL_ONLY',economic_authorization:false,issued_at,expires_at:issued_at+SCOPED_TTL_MS,nonce:randomBytes(32).toString('hex'),run_id,readonly_runner_commit,mutator_commit,set:structuredClone(set)};
   const seal={...body,mac:sign(body)};authenticate(seal);return seal;
  },
  consume(seal:ScopedSeal){authenticate(seal);requireScoped(!used.has(seal.nonce),'SCOPED_NONCE_REVOKED');used.add(seal.nonce);const claimed=persistence?.claimNonce(seal);requireScoped(!claimed||typeof (claimed as any).then!=='function','SYNCHRONOUS_NONCE_CLAIM_REQUIRED');live(seal);},
  revalidate(seal:ScopedSeal,set:ScopedSet){live(seal);validateScopedSet(set);requireScoped(scopedDigest(set)===scopedDigest(seal.set),'SCOPED_DRIFT');}
 };
}
export type ScopedAuthority=ReturnType<typeof createScopedLocalAuthority>;
