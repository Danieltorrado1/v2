// Certification preload only; never imported by application/productive runners.
const fs=require('node:fs'),net=require('node:net');
const evidence={guard:'PHASE48_ATOMIC_LOCAL',production_connections:0,production_writes:0,forbidden_attempts:0,loopback_connect_calls:0};
function refuse(){evidence.forbidden_attempts++;throw Error('ATOMIC_CERTIFICATION_FORBIDDEN_ACCESS');}
const read=fs.readFileSync;
fs.readFileSync=function(file,...args){
 const name=String(file).replaceAll('\\','/');
 if(/(^|\/)\.env(?:\.|$)/i.test(name)||/EmpiriaCertificates/i.test(name))refuse();
 return read.call(this,file,...args);
};
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const options=Array.isArray(args[0])?args[0][0]:args[0];
 const host=typeof options==='object'?options.host??'localhost':typeof args[1]==='string'?args[1]:'localhost';
 const port=typeof options==='object'?options.port:options;
 if(!['127.0.0.1','::1','localhost'].includes(host)||[5432,55466].includes(Number(port)))refuse();
 evidence.loopback_connect_calls++;
 return connect.apply(this,args);
};
const fetchOriginal=global.fetch;
global.fetch=function(input,...args){const url=new URL(typeof input==='string'?input:input.url??String(input));if(!['127.0.0.1','[::1]','localhost'].includes(url.hostname))refuse();return fetchOriginal.call(this,input,...args);};
// TLS tests use pg against a synthetic loopback SSLRequest server. Queries
// against even that fake transport are forbidden; executor doubles are objects.
require('pg').Client.prototype.query=function(){refuse();};
process.on('exit',()=>{process.stdout.write(JSON.stringify(evidence)+'\n');});
