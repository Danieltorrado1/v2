// Offline only. Run under phase48-atomic-local-guard.cjs; no transport or credential host.
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),Module=require('node:module'),ts=require('typescript');
const out='reports/phase48-v6-execution-window';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const need=(x,c)=>{if(!x)throw Error(c);};
const manifest=JSON.parse(fs.readFileSync(path.join(out,'preserved-evidence.json'),'utf8'));
for(const f of manifest.files){const b=fs.readFileSync(f.path);need(b.length===f.bytes&&hash(b)===f.sha256,'PRESERVATION_CHANGED');}
const previous=JSON.parse(fs.readFileSync(path.join(path.dirname(manifest.files[0].path),'phase48-d4cab040-3bdd-467b-a683-e03621fba6a3.receipt.json'),'utf8'));
const source=cp.execFileSync('git',['show','6f0e6930dfcb8752e7c9cdbea9360a57f2d4c769:src/modules/cobertura/phase48-v6-contract.ts'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const filename=path.resolve('src/modules/cobertura/archived-v6-parser-offline.cjs');
const archived=new Module(filename,module);archived.filename=filename;archived.paths=Module._nodeModulePaths(path.dirname(filename));
archived._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
let expired;try{archived.exports.parseV6Phrase(previous.pending_request.phrase);}catch(e){expired=e.message;}
need(expired==='V6_AUTHORIZATION_EXPIRED','ARCHIVED_PHRASE_NOT_EXPIRED');
const marker=JSON.parse(fs.readFileSync(manifest.files[2].path,'utf8'));need(marker.status==='CONSUMED','CONSUMED_MARKER_CHANGED');
const current=require('../modules/cobertura/phase48-v6-contract.ts');
let revoked;try{current.parseV6Phrase(previous.pending_request.phrase);}catch(e){revoked=e.message;}
need(revoked==='V6_SCOPE_REQUIRED'||revoked==='V6_PRIOR_COMMIT_REVOKED','OLD_CONTRACT_NOT_REVOKED');
const rejection={status:'REVOKED_EXPIRED_CONSUMED',archived_parser_commit:'6f0e6930dfcb8752e7c9cdbea9360a57f2d4c769',archived_parser_source_sha256:hash(source),phrase_sha256:hash(previous.pending_request.phrase),archived_parser_rejection:expired,current_parser_rejection:revoked,nonce_marker_status:marker.status,nonce_marker_sha256:manifest.files[2].sha256,production_connections:0,production_writes:0};
const fields={...previous.pending_request.fields,contract_version:current.V6_VERSION,readonly_runner_commit:'f'.repeat(40),mutator_commit:'e'.repeat(40),run_id:'phase48-00000000-0000-0000-0000-000000000000',nonce:'0'.repeat(64),issued_at:'1970-01-01T00:00:00.000Z',expires_at:'1970-01-01T00:15:00.000Z'};
const phrase=current.buildV6Phrase(fields,0);let syntheticRejection;try{current.parseV6Phrase(phrase);}catch(e){syntheticRejection=e.message;}need(syntheticRejection==='V6_AUTHORIZATION_EXPIRED','SYNTHETIC_NOT_REVOKED');
const synthetic={status:'REVOKED_SYNTHETIC_NEVER_PRODUCTION',authorization:'REVOKED',nonce_kind:'FIXED_ALL_ZERO_SYNTHETIC',phrase,phrase_sha256:hash(phrase),parser_rejection:syntheticRejection};
for(const [name,value] of [['prior-authorization-rejection.json',rejection],['synthetic-revoked-phrase.json',synthetic]]){
 const file=path.join(out,name),bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');if(fs.existsSync(file))need(fs.readFileSync(file).equals(bytes),'OFFLINE_EVIDENCE_ALREADY_EXISTS_DIFFERENT');else fs.writeFileSync(file,bytes,{flag:'wx'});
}
console.log(JSON.stringify({preservation:'BYTE_EXACT',rejection,synthetic:{status:synthetic.status,phrase_sha256:synthetic.phrase_sha256},production_connections:0,production_writes:0}));
