import pkg from "pg";
const { Pool } = pkg;
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL ||
        "postgres://postgres:password123@localhost:5432/postgres",
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
});
