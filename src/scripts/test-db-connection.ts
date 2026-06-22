const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const maskDatabaseUrl = (databaseUrl: string): string => {
  try {
    const url = new URL(databaseUrl);

    if (url.password) {
      url.password = '***';
    }

    return url.toString();
  } catch {
    return databaseUrl.replace(/:\/\/([^:@/]+):([^@/]+)@/, '://$1:***@');
  }
};

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL is not defined');
    process.exitCode = 1;
    return;
  }

  console.log('DATABASE_URL:', maskDatabaseUrl(databaseUrl));

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const result = await pool.query(
      `
        SELECT
          NOW() AS now,
          current_database() AS database,
          current_user AS user
      `
    );

    const row = result.rows[0] ?? {};

    console.log('Connection successful');
    console.log('now:', row.now);
    console.log('database:', row.database);
    console.log('user:', row.user);
  } catch (error) {
    const err = error as {
      code?: unknown;
      detail?: unknown;
      hint?: unknown;
      message?: unknown;
      stack?: unknown;
    };

    console.error('Connection failed');
    console.error('error.message:', err.message);
    console.error('error.code:', err.code);
    console.error('error.detail:', err.detail);
    console.error('error.hint:', err.hint);
    console.error('error.stack:', err.stack);
    process.exitCode = 1;
  } finally {
    await pool.end().catch((error: unknown) => {
      console.error('Failed to close pool:', error);
    });
  }
};

void main();
