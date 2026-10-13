import {Client,Pool,type PoolConfig,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {TLSSocket} from 'node:tls';
import {inspectProductionTls} from './phase48-readonly-tls';

const need=(ok:unknown,code:string)=>{if(!ok)throw Error(code);};
const now=()=>new Date().toISOString();
export interface ReadConnection {
 pool:object;client:PoolClient;stream:{destroyed:boolean};tlsSocket:object|null;
 evidence:{connection_instance_id:string;opened_at:string;handshake_events:number;handshake_at:string|null;tls_protocol:string|null;tls_cipher:string|null;rollback_at:string|null;closed_at:string|null;query_count:number};
 queryCount:()=>number;isClosed:()=>boolean;close:()=>Promise<void>;
}
// The listener is installed in the Client constructor, before pg starts its
// SSLRequest. sslconnect means the TLSSocket exists, not that TLS is ready.
export function freshReadConnectionFactory(config:PoolConfig,target:'Local'|'Production'){
 return async():Promise<ReadConnection>=>{
  let handshakeEvents=0,handshakeAt:string|null=null,observedSocket:unknown;
  class ObservedClient extends Client {
   constructor(options?:any){
    super(options);
    const connection=(this as any).connection;
    connection.once('sslconnect',()=>{
     const socket=connection.stream;
     socket.once('secureConnect',()=>{handshakeEvents++;handshakeAt=now();observedSocket=socket;});
    });
   }
  }
  const pool=new Pool({...config,Client:ObservedClient,max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:1000} as PoolConfig);
  pool.on('error',()=>{});
  let client:PoolClient|undefined,closed=false;
  try{
   client=await pool.connect();
   const stream=(client as any).connection.stream;
   const tlsSocket=stream instanceof TLSSocket?stream:null;
   if(target==='Production'||config.ssl){
    need(tlsSocket&&handshakeEvents===1&&observedSocket===tlsSocket,'READ_TLS_HANDSHAKE_NOT_OBSERVED');
   }
   let tlsEvidence:any=null;
   if(target==='Production')tlsEvidence=inspectProductionTls(client);
   let count=0;const query=client.query;
   client.query=function(this:PoolClient,...args:any[]){count++;return (query as any).apply(this,args);} as typeof client.query;
   const evidence={connection_instance_id:randomUUID(),opened_at:now(),handshake_events:handshakeEvents,handshake_at:handshakeAt,tls_protocol:tlsEvidence?.protocol??tlsSocket?.getProtocol()??null,tls_cipher:tlsEvidence?.cipher.name??tlsSocket?.getCipher()?.standardName??null,rollback_at:null as string|null,closed_at:null as string|null,query_count:0};
   let streamClosed=false;
   stream.once('close',()=>{streamClosed=true;});
   return {pool,client,stream,tlsSocket,evidence,queryCount:()=>count,isClosed:()=>closed&&streamClosed&&stream.destroyed,
    close:async()=>{
     if(closed)return;
     const closeObserved=new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('READ_SOCKET_CLOSE_UNCONFIRMED')),10000);
      const done=()=>{clearTimeout(timer);resolve();};
      if(streamClosed)done();else stream.once('close',done);
     });
     // Start waiting before release(true), which destroys the driver socket.
     client!.release(true);
     const ending=pool.end();
     const results=await Promise.allSettled([closeObserved,ending]);
     if(results.some(r=>r.status==='rejected'))throw Error('READ_POOL_OR_SOCKET_CLOSE_FAILED');
     need(streamClosed&&stream.destroyed,'READ_SOCKET_CLOSE_UNCONFIRMED');
     closed=true;evidence.closed_at=now();evidence.query_count=count;
    }};
  }catch(error){
   if(client)(client as any).release(true);
   try{await pool.end();}catch{}
   throw error;
  }
 };
}
