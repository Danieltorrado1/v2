// Live PostgreSQL 17.11 proof, invoked only by the isolated local wrapper.
// A synthetic TLS transaction pooler retains one backend across two frontends.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from 'pg';
import {createServer} from 'node:net';
import {TLSSocket,createSecureContext,checkServerIdentity} from 'node:tls';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const fixture='src/tests/fixtures/phase48-tls/';
const ca=readFileSync(fixture+'ca.crt');
const ssl={ca,minVersion:'TLSv1.3',rejectUnauthorized:true,servername:'localhost',checkServerIdentity};
const tlsExports:any={},connectionExports:any={};
const transpile=(file:string)=>ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const fixtureHash=createHash('sha256').update(ca).digest('hex').toUpperCase();
runInNewContext(transpile('src/modules/cobertura/phase48-readonly-tls.ts'),{exports:tlsExports,Date,Buffer,__dirname:process.cwd(),require:(n:string)=>n==='./phase48-readonly-contract'?{CERTIFICATE_SHA256:fixtureHash,validateCertificateHash:(hash:string)=>assert.equal(hash,fixtureHash)}:n==='./phase48-readonly-target'?{}:require(n)});
runInNewContext(transpile('src/modules/cobertura/phase48-readonly-connection.ts'),{exports:connectionExports,Date,Buffer,setTimeout,clearTimeout,require:(n:string)=>n==='./phase48-readonly-tls'?tlsExports:require(n)});
const identitySql="SELECT version() AS version, current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation, txid_current_if_assigned()::text AS assigned_xid, pg_backend_pid() AS pid, pg_current_snapshot()::text AS snapshot, (SELECT virtualtransaction FROM pg_catalog.pg_locks WHERE pid=pg_backend_pid() AND locktype='virtualxid') AS virtual_transaction";
const begin='BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
const allowed=new Set([begin,identitySql,'ROLLBACK']);
function i32(n:number){const b=Buffer.alloc(4);b.writeInt32BE(n);return b;}
function i16(n:number){const b=Buffer.alloc(2);b.writeInt16BE(n);return b;}
function message(type:string,body:Buffer){return Buffer.concat([Buffer.from(type),i32(body.length+4),body]);}
function reply(result:any){
 const pieces:Buffer[]=[];
 if(result.fields.length){
  pieces.push(message('T',Buffer.concat([i16(result.fields.length),...result.fields.map((f:any)=>Buffer.concat([Buffer.from(f.name+'\0'),i32(0),i16(0),i32(25),i16(-1),i32(-1),i16(0)]))])));
  for(const row of result.rows)pieces.push(message('D',Buffer.concat([i16(result.fields.length),...result.fields.map((f:any)=>{if(row[f.name]===null)return i32(-1);const v=Buffer.from(String(row[f.name]));return Buffer.concat([i32(v.length),v]);})])));
 }
 pieces.push(message('C',Buffer.from(result.command+(result.command==='SELECT'?' '+result.rowCount:'')+'\0')));
 pieces.push(message('Z',Buffer.from(result.command==='ROLLBACK'?'I':'T')));
 return Buffer.concat(pieces);
}

test('PostgreSQL 17.11: two TLS Pools share one transaction-pooler backend with distinct virtual transactions',async()=>{
 assert.equal(process.env.PHASE48_POOLER_LOCAL_CERT,'true');
 const backend=new Client({host:'127.0.0.1',port:55469,user:'pooler_local_verifier',database:'postgres',password:'',options:'-c default_transaction_read_only=on'});
 await backend.connect();
 const context=createSecureContext({key:readFileSync(fixture+'server-test-only.key'),cert:readFileSync(fixture+'server.crt'),minVersion:'TLSv1.3'});
 const sockets=new Set<TLSSocket>();let sqlCount=0,frontends=0;
 const server=createServer(raw=>raw.once('data',packet=>{
  assert.equal(packet.toString('hex'),'0000000804d2162f');raw.write('S');
  const socket=new TLSSocket(raw,{isServer:true,secureContext:context});sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));
  let startup=true,buffer=Buffer.alloc(0),serial=Promise.resolve();
  socket.on('data',packet=>{
   buffer=Buffer.concat([buffer,packet]);
   if(startup){if(buffer.length<4||buffer.length<buffer.readInt32BE(0))return;buffer=buffer.subarray(buffer.readInt32BE(0));startup=false;frontends++;socket.write(Buffer.from('5200000008000000004b0000000c00000064000000015a0000000549','hex'));}
   while(buffer.length>=5&&buffer.length>=buffer.readInt32BE(1)+1){
    const size=buffer.readInt32BE(1)+1,type=String.fromCharCode(buffer[0]!),body=buffer.subarray(5,size);buffer=buffer.subarray(size);
    if(type==='X'){socket.end();continue;}
    assert.equal(type,'Q');const sql=body.toString().slice(0,-1);assert.ok(allowed.has(sql),'SQL outside minimal local allowlist');
    serial=serial.then(async()=>{sqlCount++;const result=await backend.query(sql);socket.write(reply(result));});
    serial.catch(()=>socket.destroy());
   }
  });
 }));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const open=connectionExports.freshReadConnectionFactory({host:'localhost',port:(server.address() as {port:number}).port,user:'synthetic',database:'synthetic',ssl},'Production');
 const reads:any[]=[],connections:any[]=[];
 try{
  for(let i=0;i<2;i++){
   if(i)assert.equal(connections[0].isClosed(),true);
   const c=await open();connections.push(c);
   try{
    await c.client.query(begin);
    const row=(await c.client.query(identitySql)).rows[0];reads.push(row);
    Object.assign(c.evidence,{backend_pid:Number(row.pid),virtual_transaction:row.virtual_transaction,snapshot:row.snapshot});
    assert.match(row.version,/PostgreSQL 17\.11/);assert.equal(row.read_only,'on');assert.equal(row.isolation,'repeatable read');assert.equal(row.assigned_xid,null);
    await c.client.query('ROLLBACK');c.evidence.rollback_at=new Date().toISOString();
   }finally{await c.close();assert.equal(c.isClosed(),true);}
  }
  const [a,b]=connections;
  for(const key of ['pool','client','stream','tlsSocket'])assert.notEqual(a[key],b[key]);
  assert.equal(reads[0].pid,reads[1].pid);assert.notEqual(reads[0].virtual_transaction,reads[1].virtual_transaction);
  assert.equal(reads[0].snapshot,reads[1].snapshot);assert.equal(sqlCount,6);assert.equal(frontends,2);
  assert.ok(connections.every(c=>c.evidence.handshake_events===1&&c.evidence.tls_protocol==='TLSv1.3'&&c.queryCount()===3));
  console.log(JSON.stringify({scope:'ISOLATED_POSTGRESQL_17_11_TLS_TRANSACTION_POOLER',server_version:'17.11',same_backend_pid:true,same_snapshot:true,distinct_virtual_transactions:true,connections:connections.map(c=>c.evidence),query_count:sqlCount,business_table_queries:0,ddl:0,dml:0,production_connections:0,production_writes:0}));
 }finally{for(const c of connections)await c.close();for(const socket of sockets)socket.destroy();await new Promise<void>(done=>server.close(()=>done()));await backend.end();}
});
