import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {requireScoped} from './phase48-scoped-contract';
export const SCOPED_MUTATOR_COMMIT='4c93e3a31a5d889c0874d4582a28ba6a79a8c11c';
export const SCOPED_REVOKED_BASE='9f478ae8d519421759845e9a1826f8414c59efac';
export const SCOPED_CODE_FILES=['src/scripts/phase48-backup-precheck-readonly.cjs','src/modules/cobertura/phase48-backup-readonly-precheck.ts','src/modules/cobertura/phase48-managed-events.ts','src/modules/cobertura/phase48-managed-events-baseline.json','src/modules/cobertura/phase48-scoped-contract.ts','src/modules/cobertura/phase48-scoped-repository.ts','src/modules/cobertura/phase48-scoped-local.ts','src/modules/cobertura/phase48-scoped-release.ts','src/scripts/phase48-scoped-certification.ts',
 'src/modules/cobertura/phase48-readonly-contract.ts','src/modules/cobertura/phase48-readonly-schema-scope.ts','src/modules/cobertura/phase48-readonly-schema-catalog.ts','src/modules/cobertura/phase48-historical-domain.ts','src/modules/cobertura/phase48-readonly-receipts.ts','src/modules/cobertura/phase48-dynamic-local.ts',
 'src/modules/cobertura/phase48-readonly-tls.ts','src/modules/cobertura/phase48-readonly-target.ts','src/modules/cobertura/phase48-readonly-connection.ts','src/modules/cobertura/phase48-readonly-schema-identity.ts','src/scripts/phase48-production-readonly.ts','src/scripts/phase48-historical-production.ts','src/modules/cobertura/phase48-production-executor.ts','src/modules/cobertura/phase48-dynamic-gate.ts','package-lock.json','package.json','tsconfig.json'];
const normalize=(file:string,source:string)=>source.replaceAll('\r\n','\n').replace(file.endsWith('phase48-scoped-release.ts')?/export const SCOPED_MUTATOR_COMMIT='[^']+';/:/$^/g,"export const SCOPED_MUTATOR_COMMIT='<PIN>';" );
export function scopedCodeHashes(){return Object.fromEntries(SCOPED_CODE_FILES.map(file=>[file,createHash('sha256').update(normalize(file,readFileSync(file,'utf8'))).digest('hex')]));}
export function scopedRelease(){
 const current=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 requireScoped(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()==='fix/phase48-event-trigger-dependencies','SCOPED_BRANCH_REQUIRED');
 requireScoped(/^[a-f0-9]{40}$/.test(SCOPED_MUTATOR_COMMIT),'SCOPED_RELEASE_UNPUBLISHED');
 const revoked=new Set(execFileSync('git',['rev-list',SCOPED_REVOKED_BASE],{encoding:'utf8'}).trim().split(/\r?\n/));
 requireScoped(!revoked.has(current)&&!revoked.has(SCOPED_MUTATOR_COMMIT),'LEGACY_COMMIT_REVOKED');
 execFileSync('git',['merge-base','--is-ancestor',SCOPED_MUTATOR_COMMIT,current],{stdio:'ignore'});
 for(const file of SCOPED_CODE_FILES){const pinned=execFileSync('git',['show',SCOPED_MUTATOR_COMMIT+':'+file],{encoding:'utf8'});requireScoped(normalize(file,pinned)===normalize(file,readFileSync(file,'utf8')),'SCOPED_CERTIFIED_CODE_CHANGED');}
 return {readonly_runner_commit:current,mutator_commit:SCOPED_MUTATOR_COMMIT,code_sha256:scopedCodeHashes(),productive_authorization:'REVOKED',revoked_ancestors_of:SCOPED_REVOKED_BASE};
}
