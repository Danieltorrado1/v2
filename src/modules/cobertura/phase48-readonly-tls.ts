import {createHash, X509Certificate} from 'node:crypto';
import {openSync, closeSync, readFileSync, fstatSync, lstatSync, realpathSync} from 'node:fs';
import {isAbsolute, resolve, relative, dirname, sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {checkServerIdentity, type ConnectionOptions} from 'node:tls';

const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
function need(ok:unknown,code:string):asserts ok {if(!ok)throw Error(code);}
const inside=(file:string,dir:string)=>{const r=relative(dir,file);return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));};

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
  need(bytes.length===1367,'READ_CA_SIZE_INVALID');need(sha(bytes)===expected.toLowerCase(),'READ_CA_SHA_MISMATCH');
  const receipt=inspectReadCa(bytes);
  need(/^[a-zA-Z0-9.-]+$/.test(hostname),'READ_TLS_HOSTNAME_INVALID');
  return {ssl:{ca:bytes,rejectUnauthorized:true,servername:hostname,checkServerIdentity},receipt};
 }catch(e){if(e instanceof Error&&/^READ_[A-Z_]+$/.test(e.message))throw e;throw Error('READ_CA_PATH_OR_CONFIGURATION_INVALID');}
}
export function clearReadTlsEnvironment(){for(const key of ['DATABASE_URL','PGPASSWORD','PRODUCTION_MIGRATION_DATABASE_URL','PHASE48_SSL_ROOT_CERT_PATH','PHASE48_SSL_ROOT_CERT_SHA256','PHASE48_SSL_ROOT_CERT_ALLOWLIST'])delete process.env[key];}
