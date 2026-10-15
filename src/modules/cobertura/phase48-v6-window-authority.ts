import {sha256HexEqual} from './phase48-sha256';
import {createHmac,randomBytes} from 'node:crypto';
import {createScopedLocalAuthority,requireScoped,scopedDigest,validateScopedSet,SCOPED_VERSION,type ScopedSeal,type ScopedSet} from './phase48-scoped-contract';
import policy from './phase48-v6-window-policy.json';
export const V6_WINDOW_POLICY_SHA256=scopedDigest(policy);
export interface V6WindowBinding {authorization_digest:string;phrase_sha256:string;preflight_sha256:string;digests:Record<string,string>;pid:number;transaction_id:string;virtual_transaction:string;locks_digest:string;required_locks:{oid:string;name:string;kind:string}[];write_set_digest:string;sequence_locks:any[];}
export function createV6WindowAuthority(clock:()=>number,key:Buffer){
 const raw=createScopedLocalAuthority(clock,{key,claimNonce:()=>{}});
 const authenticate=(seal:ScopedSeal)=>{raw.authenticate(seal);const s=seal as any;requireScoped(sha256HexEqual(s.window_policy_sha256,V6_WINDOW_POLICY_SHA256)&&s.binding?.transaction_id&&s.binding.pid>0&&Object.keys(s.binding.digests).length===17,'V6_WINDOW_SEAL_BINDING_REQUIRED');};
 const live=(seal:ScopedSeal)=>{authenticate(seal);requireScoped(seal.expires_at-seal.issued_at===policy.internal_ttl_ms&&clock()>=seal.issued_at&&clock()<seal.expires_at,'V6_INTERNAL_SEAL_EXPIRED');};
 return {...raw,authenticate,assertLive:live,revalidate:(seal:ScopedSeal,set:ScopedSet)=>{live(seal);requireScoped(sha256HexEqual(scopedDigest(seal.set),scopedDigest(set)),'SCOPED_DRIFT');},consume:(seal:ScopedSeal)=>{live(seal);},
  issueBound(set:ScopedSet,run:string,release:{readonly_runner_commit:string;mutator_commit:string},binding:V6WindowBinding):ScopedSeal{
   validateScopedSet(set);requireScoped(policy.internal_ttl_ms>0&&policy.internal_ttl_ms<=policy.maximum_ttl_ms,'V6_WINDOW_UNBOUNDED');
   const t=clock(),body={version:SCOPED_VERSION,scope:'15_24_IDENTITIES_AND_HISTORICAL_ONLY' as const,economic_authorization:false as const,issued_at:t,expires_at:t+policy.internal_ttl_ms,nonce:randomBytes(32).toString('hex'),run_id:run,...release,set:structuredClone(set),window_policy_sha256:V6_WINDOW_POLICY_SHA256,binding};
   const seal={...body,mac:createHmac('sha256',key).update(JSON.stringify(body)).digest('hex')};authenticate(seal);return seal;
  }};
}
export {policy as V6_WINDOW_POLICY};
