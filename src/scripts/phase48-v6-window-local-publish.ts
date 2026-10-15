import {publishV6Receipt} from '../modules/cobertura/phase48-v6-receipts';
if(process.env.PHASE48_WINDOW_LOCAL_CERT!=='true')throw Error('LOCAL_CERT_REQUIRED');
const [directory,run]=process.argv.slice(2);
try{publishV6Receipt(directory!,run!,'pending',{status:'REVOKED_SYNTHETIC'});process.exitCode=0;}catch{process.exitCode=5;}
