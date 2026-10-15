import {TextDecoder} from 'node:util';

export const PHASE48_HEALTH_URL='https://api.empiriasuite.com/api/health';
export type HealthTransport=(url:string,init:RequestInit)=>Promise<Response>;
export interface HealthSummary {http_status:number;success:true;database_status:'ok';outbox:false;recalc_requested:false;recalc_active:false;worker_stopped:true;sync_manually_confirmed_false:true}
const need:(ok:unknown,code:string)=>asserts ok=(ok,code)=>{if(!ok)throw Error(code);};

function safeUrl(value:string){
 const u=new URL(value);
 need(u.href===PHASE48_HEALTH_URL,'HEALTH_URL_NOT_CANONICAL');
 need(u.protocol==='https:'&&u.hostname==='api.empiriasuite.com'&&u.pathname==='/api/health'&&u.port===''&&!u.username&&!u.password&&!u.search&&!u.hash,'HEALTH_URL_INVALID');
 return u;
}
function parseJsonNoDuplicateKeys(text:string):unknown{
 let i=0;const ws=()=>{while(/[\x20\t\r\n]/.test(text[i]??'')&&i<text.length)i++;};
 const string=()=>{const start=i;need(text[i]==='"','HEALTH_JSON_INVALID');i++;while(i<text.length){const c=text[i++]!;if(c==='"'){const raw=text.slice(start,i);return JSON.parse(raw) as string;}if(c==='\\'){need(i<text.length,'HEALTH_JSON_INVALID');i++;}else need(c>=' '&&c!=='\u0000','HEALTH_JSON_INVALID');}throw Error('HEALTH_JSON_INVALID');};
 const value=():void=>{ws();const c=text[i];if(c==='"'){string();return;}if(c==='{'){i++;ws();const keys=new Set<string>();if(text[i]==='}'){i++;return;}for(;;){ws();const key=string();need(!keys.has(key),'HEALTH_JSON_DUPLICATE_KEY');keys.add(key);ws();need(text[i++]===':','HEALTH_JSON_INVALID');value();ws();const sep=text[i++];if(sep==='}')return;need(sep===',','HEALTH_JSON_INVALID');}}else if(c==='['){i++;ws();if(text[i]===']'){i++;return;}for(;;){value();ws();const sep=text[i++];if(sep===']')return;need(sep===',','HEALTH_JSON_INVALID');}}else{const rest=text.slice(i);const m=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);need(m!==null,'HEALTH_JSON_INVALID');i+=m[0].length;}};
 value();ws();need(i===text.length,'HEALTH_JSON_TRAILING_DATA');return JSON.parse(text);
}
function validatePayload(payload:any,syncManuallyConfirmedFalse:boolean):HealthSummary{
 need(payload&&typeof payload==='object'&&!Array.isArray(payload),'HEALTH_JSON_ROOT_INVALID');
 need(payload.success===true,'HEALTH_SUCCESS_FALSE');
 const data=payload.data;need(data&&typeof data==='object'&&!Array.isArray(data),'HEALTH_DATA_INVALID');
 need(data.database&&typeof data.database==='object'&&!Array.isArray(data.database),'HEALTH_DATABASE_INVALID');
 need(data.database.status==='ok','HEALTH_DATABASE_NOT_OK');
 const io=data.integracion_outbox;need(io&&typeof io==='object'&&!Array.isArray(io),'HEALTH_OUTBOX_INVALID');
 need(io.configured===false&&io.enabled===false,'HEALTH_OUTBOX_ENABLED');
 need(io.recalc&&typeof io.recalc==='object'&&!Array.isArray(io.recalc),'HEALTH_RECALC_INVALID');
 need(io.recalc.requested===false&&io.recalc.active===false,'HEALTH_RECALC_ENABLED');
 need(io.started===false&&io.running===false,'HEALTH_WORKER_RUNNING');
 need(syncManuallyConfirmedFalse===true,'HEALTH_SYNC_MANUAL_CONFIRMATION_REQUIRED');
 return {http_status:200,success:true,database_status:'ok',outbox:false,recalc_requested:false,recalc_active:false,worker_stopped:true,sync_manually_confirmed_false:true};
}

export async function requestHealthAtUrl(url:string,transport:HealthTransport,options:{timeoutMs?:number;maxBytes?:number;syncManuallyConfirmedFalse:boolean}):Promise<HealthSummary>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),options.timeoutMs??8000);let response:Response|undefined;
 try{
  response=await transport(url,{method:'GET',redirect:'manual',signal:controller.signal,headers:{accept:'application/json'}});
  need(!response.url||response.url===url,'HEALTH_REDIRECT_REJECTED');
  if(response.status>=300&&response.status<400)throw Error('HEALTH_REDIRECT_REJECTED');
  need(response.status===200,'HEALTH_HTTP_STATUS_INVALID');
  const type=response.headers.get('content-type')??'';need(/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type),'HEALTH_CONTENT_TYPE_INVALID');
  const declared=Number(response.headers.get('content-length')??0),max=options.maxBytes??65536;need(!declared||declared<=max,'HEALTH_BODY_TOO_LARGE');
  const reader=response.body?.getReader();need(reader,'HEALTH_BODY_MISSING');const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;need(size<=max,'HEALTH_BODY_TOO_LARGE');chunks.push(part.value);}}finally{try{await reader.cancel();}catch{}}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  need(!(bytes.length>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf),'HEALTH_UTF8_BOM_FORBIDDEN');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);const parsed=parseJsonNoDuplicateKeys(text);return validatePayload(parsed,options.syncManuallyConfirmedFalse);
 }catch(e){const code=(e as any)?.message;if(typeof code==='string'&&/^HEALTH_[A-Z0-9_]+$/.test(code))throw e;throw Error(controller.signal.aborted?'HEALTH_TIMEOUT':'HEALTH_REQUEST_FAILED');}
 finally{clearTimeout(timer);try{await response?.body?.cancel();}catch{}}
}
export function validateProductionHealthUrl(value:string){return safeUrl(value).href;}
export async function fetchProductionHealth(options:{syncManuallyConfirmedFalse:boolean;timeoutMs?:number;maxBytes?:number;transport?:HealthTransport}):Promise<HealthSummary>{
 const transport=options.transport??((url,init)=>fetch(url,init));return requestHealthAtUrl(validateProductionHealthUrl(PHASE48_HEALTH_URL),transport,options);
}
