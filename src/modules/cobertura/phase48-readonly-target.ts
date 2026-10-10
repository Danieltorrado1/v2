import {URL} from 'node:url';
import {createHash} from 'node:crypto';
import {PROJECT_REF} from './phase48-readonly-contract';
import {EXPECTED_CRITICAL_SCHEMA_DIGEST,SCHEMA_IDENTITY_VERSION} from './phase48-readonly-schema-identity';

export const LEGACY_READ_SCHEMA_FINGERPRINT='2fbba2269828d8573ed10eb5a6749d89e30d62adc75652ac713f375467df19a9';
export const READ_SCHEMA_FINGERPRINT=EXPECTED_CRITICAL_SCHEMA_DIGEST;
export const READ_SCHEMA_CANONICALIZATION_VERSION=SCHEMA_IDENTITY_VERSION;
export const READ_IDENTITY_TABLES=['empresas','contratos','usuarios','usuario_roles','usuario_empresas','usuario_contratos','roles','cobertura_asignaciones','vinculaciones','focalizacion_final','nomina_asistencia_diaria','nomina_periodos','auditoria','auditoria_eventos'];
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function need(ok:unknown,code:string):asserts ok {if(!ok)throw Error(code);}

// Extract this key only. No dotenv loading, interpolation, environment mutation
// or unsafe parser messages containing the original value.
export function readDatabaseUrl(content:string){
 const values=[...content.replace(/^\uFEFF/,'').matchAll(/^\s*(?:export[ \t]+)?DATABASE_URL[ \t]*=[ \t]*([^\r\n]*)$/gm)];
 need(values.length!==0,'READ_CREDENTIAL_REQUIRED');need(values.length===1,'READ_CREDENTIAL_DUPLICATE');
 let value=values[0]![1]!.trim();
 if(value.startsWith('"')||value.startsWith("'")){
  const quote=value[0]!,end=value.lastIndexOf(quote);
  need(end>0&&/^(?:\s*#.*)?$/.test(value.slice(end+1)),'READ_CREDENTIAL_VALUE_INVALID');value=value.slice(1,end);
 }else value=value.replace(/\s+#.*$/,'').trim();
 need(value.length>0&&!/[\r\n\u0000]/.test(value),'READ_CREDENTIAL_VALUE_INVALID');return value;
}
function parse(value:string){
 try{need(!/[\s\u0000-\u001f\u007f]/.test(value),'READ_TARGET_URL_INVALID');const u=new URL(value);decodeURIComponent(u.username);decodeURIComponent(u.password);decodeURIComponent(u.pathname);return u;}
 catch{throw Error('READ_TARGET_URL_INVALID');}
}
function hostKind(host:string){
 if(/^db\.[a-z0-9]{20}\.supabase\.co$/.test(host))return 'SUPABASE_DIRECT';
 // The domain is exact and every label is bound; no suffix/substring matching.
 if(/^(?:aws-\d+-)?[a-z]{2}(?:-[a-z]+)+-\d+\.pooler\.supabase\.com$/.test(host))return 'SUPABASE_POOLER';
 if(host==='localhost'||host.endsWith('.localhost')||/^\[|^\d+\.\d+\.\d+\.\d+$/.test(host))return 'LOCALHOST';
 return 'CUSTOM_HOST';
}
export function classifyReadTarget(value:string,expected=PROJECT_REF){
 const base={parser_success:false,protocol_class:'INVALID',host_class:'INVALID',project_ref_source:'NONE',extracted_project_ref_hash:null as string|null,expected_project_ref_hash:hash(expected),match:false,ssl_required_present:false,password_present:false};
 try{
  const u=parse(value),host=u.hostname.toLowerCase(),kind=hostKind(host),username=decodeURIComponent(u.username);
  const ref=kind==='SUPABASE_DIRECT'?host.match(/^db\.([a-z0-9]{20})\.supabase\.co$/)?.[1]:kind==='SUPABASE_POOLER'?username.match(/^postgres\.([a-z0-9]{20})$/)?.[1]:undefined;
  return {...base,parser_success:true,protocol_class:['postgres:','postgresql:'].includes(u.protocol)?'POSTGRESQL':'OTHER',host_class:kind,project_ref_source:ref?(kind==='SUPABASE_DIRECT'?'HOST':'USERNAME'):'NONE',extracted_project_ref_hash:ref?hash(ref):null,match:ref===expected,ssl_required_present:['require','verify-ca','verify-full'].includes(u.searchParams.get('sslmode')??''),password_present:!!u.password};
 }catch{return base;}
}
export function validateReadTarget(value:string,expected=PROJECT_REF){
 const u=parse(value),classification=classifyReadTarget(value,expected),username=decodeURIComponent(u.username),host=u.hostname.toLowerCase();
 need(classification.protocol_class==='POSTGRESQL','READ_TARGET_PROTOCOL_INVALID');
 need(['SUPABASE_DIRECT','SUPABASE_POOLER'].includes(classification.host_class),'READ_TARGET_HOST_INVALID');
 need(classification.match,'READ_PROJECT_TARGET_INVALID');
 need(classification.host_class==='SUPABASE_POOLER'||username==='postgres','READ_TARGET_USERNAME_INVALID');
 need(decodeURIComponent(u.pathname)==='/postgres','READ_TARGET_DATABASE_INVALID');
 need(!u.hash&&!!u.password,'READ_TARGET_CREDENTIAL_INVALID');
 const seen=new Set<string>(),allowed=new Set(['sslmode','pgbouncer','connect_timeout','connection_limit','pool_timeout','application_name']);
 for(const [key,val] of u.searchParams){
  need(allowed.has(key)&&!seen.has(key),'READ_TARGET_PARAMETER_INVALID');seen.add(key);
  if(key==='sslmode')need(['require','verify-ca','verify-full'].includes(val),'READ_TARGET_SSL_REQUIRED');
  else if(key==='pgbouncer')need(['true','false'].includes(val),'READ_TARGET_PARAMETER_INVALID');
  else if(key==='application_name')need(/^[a-zA-Z0-9_-]{1,64}$/.test(val),'READ_TARGET_PARAMETER_INVALID');
  else need(/^\d{1,5}$/.test(val)&&Number(val)>0,'READ_TARGET_PARAMETER_INVALID');
 }
 const port=u.port===''?5432:Number(u.port);
 need(port===5432||port===6543,'READ_TARGET_PORT_INVALID');
 const format=classification.host_class==='SUPABASE_DIRECT'?(port===5432?'DIRECT':'DEDICATED_TRANSACTION_POOLER'):(port===5432?'SHARED_SESSION_POOLER':'SHARED_TRANSACTION_POOLER');
 // Do not pass connectionString or query parameters to pg. TLS/CA/hostname
 // verification and transaction settings cannot be overridden by the URL.
 return {classification,format,config:{host,port,user:username,password:decodeURIComponent(u.password),database:'postgres',ssl:{rejectUnauthorized:true},options:'-c default_transaction_read_only=on -c timezone=UTC'}};
}
export function verifyReadServerIdentity(identity:{database:string;version:string;empresa_exists:boolean;contrato_exists:boolean;schema_digest:string;schema_identity_version:string;global_schema_digest?:string;tables:string[]},expectedDatabase:string){
 need(/^17\.\d+(?:\s|$)/.test(identity.version),'READ_SERVER_VERSION_INVALID');
 need(identity.database===expectedDatabase,'READ_SERVER_DATABASE_INVALID');
 need(identity.empresa_exists===true&&identity.contrato_exists===true,'READ_SERVER_SCOPE_INVALID');
 need(READ_IDENTITY_TABLES.every(t=>identity.tables.includes(t)),'READ_SERVER_TABLES_INVALID');
 need(identity.schema_identity_version===SCHEMA_IDENTITY_VERSION,'READ_SCHEMA_IDENTITY_VERSION_INVALID');
 if(identity.schema_digest!==READ_SCHEMA_FINGERPRINT)throw Object.assign(Error('READ_SCHEMA_IDENTITY_MISMATCH'),{expected_schema_digest:READ_SCHEMA_FINGERPRINT,observed_schema_digest:identity.schema_digest,canonicalization_version:READ_SCHEMA_CANONICALIZATION_VERSION,schema_divergence_phase:'server_identity.critical_schema',observed_global_schema_digest:identity.global_schema_digest});
 return {postgresql_17:true,database_expected:true,empresa:15,contrato:24,tables_expected:true,schema_digest:identity.schema_digest,schema_identity_version:SCHEMA_IDENTITY_VERSION,global_schema_digest:identity.global_schema_digest,schema_matches:true};
}
