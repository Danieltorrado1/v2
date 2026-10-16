import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {isV6ArgumentName,parseV6Cli} from '../scripts/phase48-v6-production';
import {buildV6Phrase,V6_ASSERTIONS,V6_ORDER} from '../modules/cobertura/phase48-v6-contract';
import {V6_BASE} from '../modules/cobertura/phase48-v6-evidence';
import {validateDiagnosticGitState,EXPECTED_DIAGNOSTIC_BRANCH,CERTIFIED_DIAGNOSTIC_BASE_HEAD} from '../modules/cobertura/phase48-v6-diagnostic-launcher';
import {v6CliGitFixture,FIXTURE_HEAD,FIXTURE_BRANCH} from './fixtures/phase48-v6-cli-git-fixture';

const validNames=['ca-sha256','backup-sha256','readonly-runner-commit','mutator-commit','preflight-receipt-sha256'];
const invalidNames=['','Ca-sha256','ca_sha256','-ca-sha256','ca-sha256-','ca--sha256','ca.sha256','ca/sha256','ca sha256','ca=sha256','ca\u2014sha256','c\u0430-sha256'];

test('V6 argument-name grammar accepts canonical lowercase names with digits',()=>{
 for(const name of validNames)assert.equal(isV6ArgumentName(name),true,name);
});

test('V6 argument-name grammar rejects malformed, ambiguous, and Unicode names',()=>{
 for(const name of invalidNames)assert.equal(isV6ArgumentName(name),false,JSON.stringify(name));
});

const completeArgs=()=>[
 '--mode=PreflightOnly',
 '--backup-directory=C:/synthetic/backup',
 '--certified-preflight=C:/synthetic/certified.json',
 '--blocked-request=C:/synthetic/blocked.json',
 '--credential-path=C:/synthetic/credential-sentinel.env',
 '--ca-path=C:/synthetic/ca-sentinel.crt',
 '--ca-sha256='+'a'.repeat(64),
 '--receipt-directory=C:/synthetic/receipts',
 '--sync-manually-confirmed=false'
];

test('V6 parser accepts the full read-only launcher invocation with synthetic values',()=>{
 const parsed=parseV6Cli(completeArgs());
 assert.equal(parsed.mode,'PreflightOnly');
 assert.equal(parsed['ca-sha256'],'a'.repeat(64));
 assert.equal(parsed['backup-directory'],'C:/synthetic/backup');
 assert.equal(parsed['credential-path'],'C:/synthetic/credential-sentinel.env');
 assert.equal(parsed['receipt-directory'],'C:/synthetic/receipts');
 assert.equal(parsed['sync-manually-confirmed'],'false');
});

test('V6 parser fails closed on malformed, unknown, duplicate, or missing arguments',()=>{
 for(const name of invalidNames.filter(Boolean))assert.throws(()=>parseV6Cli(['--'+name+'=x']),/V6_ARGUMENT_INVALID/);
 assert.throws(()=>parseV6Cli(['--unknown-argument=x']),/V6_ARGUMENT_INVALID/);
 assert.throws(()=>parseV6Cli(['--mode=PreflightOnly','--mode=PreviewOnly']),/V6_ARGUMENT_INVALID/);
 assert.throws(()=>parseV6Cli(completeArgs().filter(a=>!a.startsWith('--blocked-request='))),/V6_ARGUMENT_REQUIRED/);
 assert.throws(()=>parseV6Cli(completeArgs().filter(a=>!a.startsWith('--ca-sha256='))),/V6_ARGUMENT_REQUIRED/);
});

test('V6 authorization builder rejects both previously certified runner and mutator commits',()=>{
 const values:Record<string,string|number|boolean>={contract_version:'phase48-scoped-v6-window-1',empresa:15,contrato:24,actor:12,candidate_count:740,readonly_runner_commit:'a'.repeat(40),mutator_commit:'b'.repeat(40),run_id:'phase48-00000000-0000-4000-8000-000000000001',nonce:'0'.repeat(64),issued_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),...Object.fromEntries(['backup_sha256','manifest_sha256','supplement_sha256','final_report_sha256','preflight_receipt_sha256','certified_preflight_sha256','blocked_request_sha256','candidates_digest','phase48_candidates_digest','critical_schema_digest','source_digest','protected_tables_digest','write_set_before_digest','periods_4_6_digest','albeny_before_digest','dary_before_digest','assignment_1203_before_digest','archived_versions_digest','event_triggers_digest','critical_definitions_digest','critical_sequences_digest','manifest_digest','salary_decision_digest','salary_review_assignments_digest'].map(k=>[k,'a'.repeat(64)])),...V6_ASSERTIONS};
 const names=V6_ORDER;
 for(const commit of ['9d894290388600a34d9c377eb69ad102b453ca4b','4f806531a4708cfa054b829e5467b46eed207926']){
  for(const field of ['readonly_runner_commit','mutator_commit']){
   const candidate={...values,[field]:commit};
   assert.throws(()=>buildV6Phrase(Object.fromEntries(names.map(k=>[k,candidate[k]!]))),/V6_PRIOR_COMMIT_REVOKED/);
  }
 }
});

test('hermetic V6 launcher reaches ENOENT for only the missing full.dump after valid Git gates',()=>{
 const f=v6CliGitFixture();let passed=false;try{
  assert.equal(f.git(['status','--porcelain=v1']),'');
  const error=f.run();assert.equal(error.code,'ENOENT');assert.equal(error.path,join(f.backup,'full.dump'));passed=true;
 }finally{f.dispose(passed);}
});

test('hermetic V6 launcher rejects invalid branch before missing evidence',()=>{
 const f=v6CliGitFixture({branch:'fix/invalid-fixture'});let passed=false;try{assert.equal(f.run().message,'V6_CLEAN_RELEASE_BRANCH_REQUIRED');passed=true;}finally{f.dispose(passed);}
});

test('hermetic V6 launcher rejects dirty tree before missing evidence',()=>{
 const f=v6CliGitFixture({dirty:true});let passed=false;try{assert.equal(f.run().message,'V6_CLEAN_RELEASE_BRANCH_REQUIRED');passed=true;}finally{f.dispose(passed);}
});

test('hermetic V6 launcher rejects incorrect HEAD ancestry before missing evidence',()=>{
 const f=v6CliGitFixture({head:V6_BASE});let passed=false;try{
  const error=f.run();assert.equal(error.status,1);assert.match(error.message,/merge-base --is-ancestor/);assert.equal(error.code,undefined);passed=true;
 }finally{f.dispose(passed);}
});

test('diagnostic launcher rejects divergent remote through its exact Git state contract',()=>{
 const head='a'.repeat(40),state={branch:EXPECTED_DIAGNOSTIC_BRANCH,head,parentHead:CERTIFIED_DIAGNOSTIC_BASE_HEAD,remoteHead:head,remoteRef:`refs/heads/${EXPECTED_DIAGNOSTIC_BRANCH}`,trackedStatus:''};
 assert.doesNotThrow(()=>validateDiagnosticGitState(state));
 assert.throws(()=>validateDiagnosticGitState({...state,remoteHead:'b'.repeat(40)}),/DIAGNOSTIC_REMOTE_HEAD_MISMATCH/);
});

test('hermetic V6 fixture never selects expectations from developer active branch or HEAD',()=>{
 const source=readFileSync('src/tests/fixtures/phase48-v6-cli-git-fixture.ts','utf8');
 assert.equal(source.includes("rawGit(workspace,['branch'"),false);
 assert.equal(source.includes("rawGit(workspace,['rev-parse','HEAD']"),false);
 const f=v6CliGitFixture();let passed=false;try{
  assert.equal(f.git(['branch','--show-current']),FIXTURE_BRANCH);assert.equal(f.git(['rev-parse','HEAD']),FIXTURE_HEAD);
  assert.equal(f.run().path,join(f.backup,'full.dump'));passed=true;
 }finally{f.dispose(passed);}
});

test('V6 release gate pins the exact read-query observability branch and retains HEAD ancestry checks',()=>{
 const source=readFileSync('src/modules/cobertura/phase48-v6-evidence.ts','utf8');
 assert.match(source,/git\(\['branch','--show-current'\]\)==='fix\/phase48-v6-sha-comparison-unification'/);
 assert.match(source,/git\(\['rev-parse','HEAD'\]\)/);
 assert.match(source,/git\(\['merge-base','--is-ancestor',V6_MUTATOR_COMMIT,head\]\)/);
 assert.match(source,/replaceAll\("'fix\/phase48-v6-argument-parser'","'<BRANCH>'"\)/);
 assert.match(source,/replace\(file\.endsWith\('phase48-v6-evidence\.ts'\)\?\/const normalize=\[\^\\r\\n\]\+\/:\/\$\^\/g,'const normalize=<NORMALIZER>;'\)/);
});
