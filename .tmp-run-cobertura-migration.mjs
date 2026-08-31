import fs from 'node:fs';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pool.query(fs.readFileSync('sql/phase-36-cobertura-documentos.sql', 'utf8'));
console.log('QA migration applied');
await pool.end();
