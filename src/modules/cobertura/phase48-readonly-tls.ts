import {createHash, X509Certificate} from 'node:crypto';
import {openSync, closeSync, readFileSync, fstatSync, lstatSync, realpathSync} from 'node:fs';
import {isAbsolute, resolve, relative, dirname, sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {checkServerIdentity, TLSSocket, type ConnectionOptions} from 'node:tls';
import {CERTIFICATE_SHA256,exactEqual} from './phase48-readonly-contract';
import {validateReadTarget} from './phase48-readonly-target';
import {normalizeSha256Hex,sha256HexEqual} from './phase48-sha256';

const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
function need(ok:unknown,code:string):asserts ok {if(!ok)throw Error(code);}
const inside=(file:string,dir:string)=>{const r=relative(dir,file);return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));};
export function assertCertifiedCaSha256(value:unknown){let matches=false;try{matches=sha256HexEqual(value,CERTIFICATE_SHA256);}catch{}if(!matches)throw Error('CERTIFICATE_SHA256_INVALID');}

// Decode DER extension containers rather than relying on localized X.509 text.
function nodes(bytes:Buffer):{tag:number;body:Buffer}[]{
 const result=[];let offset=0;
 while(offset<bytes.length){const tag=bytes[offset++]!,first=bytes[offset++]!;let length=first;
  if(first&128){const count=first&127;need(count>0&&count<=4,'READ_CA_MALFORMED');length=0;for(let i=0;i<count;i++)length=length*256+bytes[offset++]!;}
  need(Number.isFinite(length)&&offset+length<=bytes.length,'READ_CA_MALFORMED');result.push({tag,body:bytes.subarray(offset,offset+length)});offset+=length;
 }return result;
}
export function inspectReadCa(bytes:Buffer){
 try{
  need(bytes.length>0&&/^\s*-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/.test(bytes.toString('utf8'))&&bytes.toString('utf8').split('-----BEGIN CERTIFICATE-----').length===2,'READ_CA_FORMAT_INVALID');
  const cert=new X509Certificate(bytes),outer=nodes(cert.raw)[0]!,tbs=nodes(outer.body)[0]!;
  const extensionContainer=nodes(tbs.body).find(n=>n.tag===0xa3);need(extensionContainer,'READ_CA_EXTENSIONS_REQUIRED');
  const extensions=nodes(nodes(extensionContainer.body)[0]!.body).map(n=>nodes(n.body));
  const extension=(oid:string)=>extensions.find(n=>n[0]?.tag===6&&n[0].body.toString('hex')===oid)?.find(n=>n.tag===4)?.body;
  const basic=extension('551d13'),usage=extension('551d0f');need(basic&&usage,'READ_CA_EXTENSIONS_REQUIRED');
  const constraints=nodes(nodes(basic)[0]!.body),bits=nodes(usage)[0]!;
  need(cert.ca&&constraints[0]?.tag===1&&constraints[0].body[0]===255,'READ_CA_NOT_CA');
  need(bits.tag===3&&bits.body.length>=2&&!!(bits.body[1]!&4),'READ_CA_KEY_USAGE_INVALID');
  const now=Date.now();need(now>=Date.parse(cert.validFrom)&&now<=Date.parse(cert.validTo),'READ_CA_NOT_CURRENT');
  const sanitize=(s:string)=>s.replace(/[^a-zA-Z0-9 .,:=\n@_/-]/g,'?').slice(0,512);
  return {sha256:sha(bytes),format:'X509/PEM',subject:sanitize(cert.subject),issuer:sanitize(cert.issuer),serial_hash:sha(cert.serialNumber),notBefore:new Date(cert.validFrom).toISOString(),notAfter:new Date(cert.validTo).toISOString(),fingerprint:cert.fingerprint256,self_signed:cert.subject===cert.issuer&&cert.verify(cert.publicKey),status:'CURRENT'};
 }catch(e){if(e instanceof Error&&/^READ_CA_[A-Z_]+$/.test(e.message))throw e;throw Error('READ_CA_MALFORMED');}
}
function checkAcl(path:string){
 if(process.platform!=='win32') {need((lstatSync(path).mode&0o022)===0,'READ_CA_ACL_UNSAFE');return;}
 const script="$ErrorActionPreference='Stop'; $acl=Get-Acl -LiteralPath $env:PHASE48_ACL_FILE; $me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; foreach($ace in $acl.Access){$sid=$ace.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; if($ace.AccessControlType -eq 'Allow' -and ([int]$ace.FileSystemRights -band 0xD0116) -ne 0 -and $sid -notin @($me,'S-1-5-18','S-1-5-32-544')){throw 'ACL_UNSAFE'}}; Write-Output 'ACL_OK'";
 try{need(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,PHASE48_ACL_FILE:path},encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}).trim()==='ACL_OK','READ_CA_ACL_UNSAFE');}catch{throw Error('READ_CA_ACL_UNSAFE');}
}
export function loadReadTls(hostname:string,env:NodeJS.ProcessEnv=process.env,repoRoot=resolve(__dirname,'../../..')):{ssl:ConnectionOptions;receipt:ReturnType<typeof inspectReadCa>} {
 try{
  const path=env.PHASE48_SSL_ROOT_CERT_PATH,expected=env.PHASE48_SSL_ROOT_CERT_SHA256;
  need(path,'READ_CA_PATH_REQUIRED');need(expected&&/^[a-fA-F0-9]{64}$/.test(expected),'READ_CA_SHA_REQUIRED');need(isAbsolute(path),'READ_CA_PATH_ABSOLUTE_REQUIRED');
  need(env.NODE_TLS_REJECT_UNAUTHORIZED!=='0'&&!env.PGSSLMODE&&!env.PGSSLROOTCERT,'READ_TLS_ENV_CONFLICT');
  let cursor=resolve(path);while(true){need(!lstatSync(cursor).isSymbolicLink(),'READ_CA_SYMLINK_FORBIDDEN');const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}
  const canonical=realpathSync(path);need(!inside(canonical,realpathSync(repoRoot)),'READ_CA_REPOSITORY_FORBIDDEN');
  const dirs:unknown=JSON.parse(env.PHASE48_SSL_ROOT_CERT_ALLOWLIST??JSON.stringify(['C:/Users/CORE ULTRA/Documents/EmpiriaCertificates']));
  need(Array.isArray(dirs)&&dirs.length>0&&dirs.every(d=>typeof d==='string'&&isAbsolute(d)),'READ_CA_ALLOWLIST_INVALID');
  need(dirs.some(d=>inside(canonical,realpathSync(d))),'READ_CA_OUTSIDE_ALLOWLIST');
  need(lstatSync(canonical).isFile(),'READ_CA_FILE_REQUIRED');checkAcl(canonical);
  const fd=openSync(canonical,'r');let bytes:Buffer;
  try{need(fstatSync(fd).isFile()&&fstatSync(fd).size===1367,'READ_CA_SIZE_INVALID');bytes=readFileSync(fd);}finally{closeSync(fd);}
  need(bytes.length===1367,'READ_CA_SIZE_INVALID');let hashMatches=false;try{hashMatches=sha256HexEqual(sha(bytes),expected);}catch{}need(hashMatches,'READ_CA_SHA_MISMATCH');
  const receipt=inspectReadCa(bytes);
  need(/^[a-zA-Z0-9.-]+$/.test(hostname),'READ_TLS_HOSTNAME_INVALID');
  return {ssl:{ca:bytes,minVersion:'TLSv1.3',rejectUnauthorized:true,servername:hostname,checkServerIdentity},receipt};
 }catch(e){if(e instanceof Error&&/^READ_[A-Z_]+$/.test(e.message))throw e;throw Error('READ_CA_PATH_OR_CONFIGURATION_INVALID');}
}
export function clearReadTlsEnvironment(){for(const key of ['DATABASE_URL','PGPASSWORD','PRODUCTION_MIGRATION_DATABASE_URL','PHASE48_SSL_ROOT_CERT_PATH','PHASE48_SSL_ROOT_CERT_SHA256','PHASE48_SSL_ROOT_CERT_ALLOWLIST'])delete process.env[key];}

// The credential callback cannot run until the real external CA has passed all
// file, ACL, validity and pinned SHA checks. Both production entries use this.
export function verifiedProductionConfig(readCredential:()=>string,env:NodeJS.ProcessEnv=process.env){
 let normalizedPin:string;try{normalizedPin=normalizeSha256Hex(env.PHASE48_SSL_ROOT_CERT_SHA256);}catch{throw Error('CERTIFICATE_SHA256_INVALID');}
 assertCertifiedCaSha256(normalizedPin);
 const verified=loadReadTls('certificate-validation.invalid',env);
 assertCertifiedCaSha256(verified.receipt.sha256);
 const target=validateReadTarget(readCredential());
 const ssl={...verified.ssl,servername:target.config.host};
 assertVerifiedTls(ssl,target.config.host);
 const {options,...config}=target.config;
 return {config:{...config,ssl,connectionTimeoutMillis:10000},certificate_sha256:CERTIFICATE_SHA256,tls:{certificate_sha256:CERTIFICATE_SHA256,rejectUnauthorized:true,hostname_verified:true,external_ca_verified:true}};
}
export function assertVerifiedTls(ssl:ConnectionOptions,hostname:string){
 if(ssl.rejectUnauthorized!==true||ssl.minVersion!=='TLSv1.3'||ssl.servername!==hostname||ssl.checkServerIdentity!==checkServerIdentity||!Buffer.isBuffer(ssl.ca))throw Error('READ_TLS_CONFIGURATION_INVALID');
 try{assertCertifiedCaSha256(sha(ssl.ca as Buffer));}catch{throw Error('CERTIFICATE_SHA256_INVALID');}
}

// pg replaces connection.stream with tls.connect(options). PoolClient is the
// acquired Client, not the backend represented by pg_stat_ssl behind a pooler.
// Resolve only this driver-owned path; never search arbitrary nested sockets.
export function inspectProductionTls(client:unknown){
 const pg=client as {connection?:{stream?:unknown;ssl?:ConnectionOptions};connectionParameters?:{host?:string;ssl?:ConnectionOptions}};
 const hostname=pg?.connectionParameters?.host,ssl=pg?.connection?.ssl;
 need(typeof hostname==='string'&&ssl&&ssl===pg.connectionParameters?.ssl,'READ_TLS_CLIENT_INVALID');
 assertVerifiedTls(ssl,hostname);
 const socket=pg.connection?.stream;
 need(socket instanceof TLSSocket,'READ_TLS_SOCKET_INVALID');
 const state=socket as TLSSocket & {_secureEstablished?:boolean;secureConnecting?:boolean};
 need(state._secureEstablished===true&&state.secureConnecting===false&&!socket.destroyed,'READ_TLS_HANDSHAKE_INCOMPLETE');
 need(socket.encrypted===true&&socket.authorized===true&&!socket.authorizationError,'READ_TLS_AUTHORIZATION_INVALID');
 need(socket.servername===hostname,'READ_TLS_SERVERNAME_INVALID');
 const peer=socket.getPeerCertificate(true);
 need(peer.raw&&peer.raw.length>0&&!checkServerIdentity(hostname,peer),'READ_TLS_PEER_IDENTITY_INVALID');
 const protocol=socket.getProtocol(),cipher=socket.getCipher();
 need(protocol==='TLSv1.3','READ_TLS_PROTOCOL_INVALID');
 need(cipher&&typeof cipher.standardName==='string'&&cipher.version==='TLSv1.3','READ_TLS_CIPHER_INVALID');
 return {protocol,stream_constructor:'TLSSocket',stream_type:'node:tls.TLSSocket',socket_path:'client.connection.stream',encrypted:true,authorized:true,authorizationError:null,secure_connect_complete:true,rejectUnauthorized:true,servername_matches:true,checkServerIdentity_active:true,hostname_verified:true,chain_verified:true,external_ca_verified:true,certificate_sha256:CERTIFICATE_SHA256,cipher:{name:cipher.standardName,version:cipher.version},peer_certificate_present:true,peer_certificate_sha256:sha(peer.raw)};
}
