// Read-only, streaming scan: never pass PEM data to Git arguments or output.
const {readFileSync}=require('node:fs');
const {X509Certificate,createHash}=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
async function main(){
 const file=process.argv[2];if(!file||process.argv.length!==3)throw Error('SCAN_ARGUMENT_REQUIRED');
 const bytes=readFileSync(file),cert=new X509Certificate(bytes);
 const body=bytes.toString('utf8').replace(/-----[^\r\n]+-----/g,'').replace(/\s/g,'');
 const needles=[Buffer.from(body.slice(0,64)),cert.raw.subarray(0,96)];
 let found=false,tail=Buffer.alloc(0),scannedBytes=0;
 const scan=chunk=>{scannedBytes+=chunk.length;const combined=Buffer.concat([tail,chunk]);if(needles.some(n=>combined.includes(n)))found=true;tail=combined.subarray(Math.max(0,combined.length-256));};
 // Include indexed additions, all reachable history and loose/unreachable objects.
 const child=spawn('git',['cat-file','--batch-all-objects','--batch'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 child.stdout.on('data',scan);child.stderr.resume();
 const code=await new Promise((done,fail)=>{child.on('error',fail);child.on('close',done);});if(code!==0)throw Error('SCAN_GIT_FAILED');
 for(const name of execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))scan(readFileSync(name));
 if(found)throw Error('PRODUCTION_CA_CONTENT_IN_GIT');
 console.log(JSON.stringify({production_ca_sha256:createHash('sha256').update(bytes).digest('hex'),git_objects_and_tracked_files_scanned:true,scanned_bytes:scannedBytes,production_ca_content_matches:0}));
}
main().catch(()=>{console.error(JSON.stringify({status:'STOPPED',reason:'CA_GIT_SCAN_FAILED'}));process.exitCode=1;});
