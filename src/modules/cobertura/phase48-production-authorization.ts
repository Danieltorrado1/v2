import {parseAuthorizationPhrase,validateCertificateHash,exactEqual} from './phase48-readonly-contract';
import {sha256HexEqual} from './phase48-sha256';

const GRANT_ORDER=['authorization','actor','empresa','contrato','expectedRows','backupSha','commit','runId','projectRef','baseline','confirmation','authorizationIssuedAt','authorizationExpiresAt','syncManualConfirmation','certificate_sha256','authorizationPhrase'] as const;
// Canonical JSON only: duplicate keys, whitespace, escaped aliases, unknown
// fields and alternate ordering are refused rather than normalized.
export function parseProductionGrant(raw:string){
 let grant:any;try{grant=JSON.parse(raw);}catch{throw Error('AUTHORIZATION_FILE_FORMAT_INVALID');}
 if(!grant||typeof grant!=='object'||Array.isArray(grant)||Object.keys(grant).length!==GRANT_ORDER.length||GRANT_ORDER.some((key,i)=>Object.keys(grant)[i]!==key)||!exactEqual(JSON.stringify(grant),raw))throw Error('AUTHORIZATION_FILE_FORMAT_INVALID');
 validateCertificateHash(grant.certificate_sha256);
 const fields=parseAuthorizationPhrase(grant.authorizationPhrase);
 if(grant.authorization!=='ACTIVE'||grant.syncManualConfirmation!==false||!exactEqual(fields.readonly_runner_commit,grant.commit)||!sha256HexEqual(fields.certificate_sha256,grant.certificate_sha256)||!sha256HexEqual(fields.backup_sha256,grant.backupSha)||!exactEqual(fields.project_ref,grant.projectRef)||grant.actor!==String(fields.actor)||grant.empresa!==fields.empresa||grant.contrato!==fields.contrato||grant.expectedRows!==fields.expected_rows||grant.authorizationIssuedAt!==fields.issued_at||grant.authorizationExpiresAt!==fields.expires_at)throw Error('AUTHORIZATION_GRANT_MISMATCH');
 return grant;
}
