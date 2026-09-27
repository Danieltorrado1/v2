import { readFileSync, writeFileSync } from 'node:fs';
import { buildRecoverySnapshot } from '../modules/nomina/nomina.resume.snapshot.js';

const arg = (name: string): string => {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value) throw new Error(`Falta --${name}.`);
  return value;
};

const beforePath = arg('before');
const afterPath = arg('after');
const outputPath = arg('output');
const backupManifest = arg('backup-manifest');
const readRows = (path: string): Array<Record<string, unknown>> => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as Array<Record<string, unknown>>;
const snapshot = buildRecoverySnapshot(readRows(beforePath), readRows(afterPath), backupManifest);
writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf8');
console.log(JSON.stringify({ schema_version: '1.0', records: snapshot.length, output: outputPath }));
