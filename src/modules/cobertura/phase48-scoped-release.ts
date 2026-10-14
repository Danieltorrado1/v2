import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {requireScoped} from './phase48-scoped-contract';
export const SCOPED_MUTATOR_COMMIT='8e805730b5c00a2326ca748f82213bf69e38a701';
export const SCOPED_REVOKED_BASE='3a45f141b90fb779814b12ad4e8b62db6d7991fa';
export const SCOPED_CODE_FILES=['src/modules/cobertura/phase48-scoped-contract.ts','src/modules/cobertura/phase48-scoped-repository.ts','src/modules/cobertura/phase48-scoped-local.ts','src/modules/cobertura/phase48-scoped-release.ts','src/scripts/phase48-scoped-certification.ts',
 'src/modules/cobertura/phase48-readonly-contract.ts','src/modules/cobertura/phase48-readonly-schema-scope.ts','src/modules/cobertura/phase48-readonly-schema-catalog.ts','src/modules/cobertura/phase48-historical-domain.ts','src/modules/cobertura/phase48-readonly-receipts.ts','src/modules/cobertura/phase48-dynamic-local.ts',
 'src/modules/cobertura/phase48-readonly-tls.ts','src/modules/cobertura/phase48-readonly-target.ts','src/modules/cobertura/phase48-readonly-connection.ts','src/modules/cobertura/phase48-readonly-schema-identity.ts','src/scripts/phase48-production-readonly.ts','src/scripts/phase48-historical-production.ts','src/modules/cobertura/phase48-production-executor.ts','src/modules/cobertura/phase48-dynamic-gate.ts','package-lock.json','package.json','tsconfig.json'];
const normalize=(file:string,source:string)=>source.replaceAll('\r\n','\n').replace(file.endsWith('phase48-scoped-release.ts')?/export const SCOPED_MUTATOR_COMMIT='[^']+';/:/$^/g,"export const SCOPED_MUTATOR_COMMIT='<PIN>';" );
export function scopedCodeHashes(){return Object.fromEntries(SCOPED_CODE_FILES.map(file=>[file,createHash('sha256').update(normalize(file,readFileSync(file,'utf8'))).digest('hex')]));}
export function scopedRelease(){
 const current=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 requireScoped(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()==='fix/phase48-scoped-dynamic-contract','SCOPED_BRANCH_REQUIRED');
 requireScoped(/^[a-f0-9]{40}$/.test(SCOPED_MUTATOR_COMMIT),'SCOPED_RELEASE_UNPUBLISHED');
 const revoked=new Set(execFileSync('git',['rev-list',SCOPED_REVOKED_BASE],{encoding:'utf8'}).trim().split(/\r?\n/));
 requireScoped(!revoked.has(current)&&!revoked.has(SCOPED_MUTATOR_COMMIT),'LEGACY_COMMIT_REVOKED');
 execFileSync('git',['merge-base','--is-ancestor',SCOPED_MUTATOR_COMMIT,current],{stdio:'ignore'});
 for(const file of SCOPED_CODE_FILES){const pinned=execFileSync('git',['show',SCOPED_MUTATOR_COMMIT+':'+file],{encoding:'utf8'});requireScoped(normalize(file,pinned)===normalize(file,readFileSync(file,'utf8')),'SCOPED_CERTIFIED_CODE_CHANGED');}
 return {readonly_runner_commit:current,mutator_commit:SCOPED_MUTATOR_COMMIT,code_sha256:scopedCodeHashes(),productive_authorization:'REVOKED',revoked_ancestors_of:SCOPED_REVOKED_BASE};
}
