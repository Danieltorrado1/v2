import {sha256HexEqual} from './phase48-sha256';
// Local certification contract. This envelope is NOT a production grant.
import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

export const DYNAMIC_GATE_TTL_MS = 120_000;
export const DYNAMIC_DIGESTS = ['schema_digest', 'source_digest', 'phase48_candidates_digest',
 'albeny_before_digest', 'dary_before_digest', 'protected_tables_digest', 'periods_4_6_digest',
 'write_set_before_digest'] as const;
export type DynamicDigests = Record<typeof DYNAMIC_DIGESTS[number], string>;
export type DynamicSet = DynamicDigests & {candidate_count:number; candidate_ids:string[];
 candidate_ids_digest:string; lock_tables:string[]};
export type DynamicSeal = {version:'PHASE48_DYNAMIC_LOCAL_V1'; scope:'IDENTITIES_ONLY_15_24';
 issued_at:number; expires_at:number; nonce:string; set:DynamicSet; mac:string};

export function digest(value:unknown):string {
 const canonical = (v:any):any => Array.isArray(v) ? v.map(canonical) : v && typeof v==='object'
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
 return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function orderedIds(ids:string[]):string[] {
 if(ids.some(id=>!/^[1-9]\d*$/.test(id)) || new Set(ids).size!==ids.length)throw Error('INVALID_CANDIDATE_IDS');
 return [...ids].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
}
function validSet(set:DynamicSet) {
 if(!Number.isSafeInteger(set.candidate_count)||set.candidate_count<1 ||
  set.candidate_count!==set.candidate_ids.length || !sha256HexEqual(digest(orderedIds(set.candidate_ids)),set.candidate_ids_digest) ||
  JSON.stringify(orderedIds(set.candidate_ids))!==JSON.stringify(set.candidate_ids) ||
  DYNAMIC_DIGESTS.some(k=>!/^([a-f0-9]{64})$/.test(set[k])) ||
  !set.lock_tables.length || new Set(set.lock_tables).size!==set.lock_tables.length ||
  set.lock_tables.some(t=>!/^[_a-z][_a-z0-9]*$/.test(t)) ||
  JSON.stringify([...set.lock_tables].sort())!==JSON.stringify(set.lock_tables))throw Error('INVALID_DYNAMIC_SET');
}
// Each authority owns its key and nonce registry. Neither is exported or persisted.
// Nonces are burned on the first attempt, including expiry, lock failure and drift.
export function createLocalGateAuthority(clock:()=>number=Date.now) {
 const key=randomBytes(32), used=new Set<string>();
 const mac=(body:Omit<DynamicSeal,'mac'>)=>createHmac('sha256',key).update(JSON.stringify(body)).digest('hex');
 function authenticate(seal:DynamicSeal) {
  const {mac:given,...body}=seal;
  if(!/^[a-f0-9]{64}$/.test(given)||!timingSafeEqual(Buffer.from(given,'hex'),Buffer.from(mac(body),'hex')))
   throw Error('GATE_SEAL_INVALID');
  if(seal.version!=='PHASE48_DYNAMIC_LOCAL_V1'||seal.scope!=='IDENTITIES_ONLY_15_24')throw Error('GATE_SCOPE_INVALID');
  validSet(seal.set);
 }
 function live(seal:DynamicSeal) {
  authenticate(seal);
  const now=clock();
  if(seal.expires_at-seal.issued_at!==DYNAMIC_GATE_TTL_MS || now<seal.issued_at || now>=seal.expires_at)
   throw Error('GATE_EXPIRED');
 }
 return {
  issue(set:DynamicSet):DynamicSeal {
   validSet(set);const issued_at=clock();
   const body:Omit<DynamicSeal,'mac'>={version:'PHASE48_DYNAMIC_LOCAL_V1',scope:'IDENTITIES_ONLY_15_24',
    issued_at,expires_at:issued_at+DYNAMIC_GATE_TTL_MS,nonce:randomBytes(32).toString('hex'),set:structuredClone(set)};
   return {...body,mac:mac(body)};
  },
  consume(seal:DynamicSeal) {
   authenticate(seal);
   if(used.has(seal.nonce))throw Error('GATE_NONCE_REVOKED');
   used.add(seal.nonce);live(seal);
  },
  revalidate(seal:DynamicSeal,current:DynamicSet) {
   live(seal);validSet(current);
   if(!sha256HexEqual(digest(current),digest(seal.set)))throw Error('STOPPED_DRIFT');
  },
  assertLive:live,
 };
}
export type LocalGateAuthority=ReturnType<typeof createLocalGateAuthority>;
