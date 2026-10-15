import {timingSafeEqual} from 'node:crypto';

const SHA256_ASCII_HEX=/^[0-9A-Fa-f]{64}$/;

export function normalizeSha256Hex(value:unknown):string {
 if(typeof value!=='string'||!SHA256_ASCII_HEX.test(value))throw Error('SHA256_FORMAT_INVALID');
 return value.toLowerCase();
}

export function sha256HexEqual(left:unknown,right:unknown):boolean {
 const leftBytes=Buffer.from(normalizeSha256Hex(left),'hex');
 const rightBytes=Buffer.from(normalizeSha256Hex(right),'hex');
 return leftBytes.length===32&&rightBytes.length===32&&timingSafeEqual(leftBytes,rightBytes);
}
