import {AsyncLocalStorage} from 'node:async_hooks';
import {performance} from 'node:perf_hooks';
export interface V6Timing {phase:string;started_ms:number;duration_ms:number;}
const context=new AsyncLocalStorage<V6Timing[]>();
export function recordV6Timing(phase:string,start:number){context.getStore()?.push({phase,started_ms:start,duration_ms:performance.now()-start});}
export const withV6Timings=<T>(rows:V6Timing[],fn:()=>Promise<T>)=>context.run(rows,fn);
export async function v6Timed<T>(phase:string,fn:()=>Promise<T>):Promise<T>{const start=performance.now();try{return await fn();}finally{context.getStore()?.push({phase,started_ms:start,duration_ms:performance.now()-start});}}
export function v6TimedSync<T>(phase:string,fn:()=>T):T{const start=performance.now();try{return fn();}finally{context.getStore()?.push({phase,started_ms:start,duration_ms:performance.now()-start});}}
