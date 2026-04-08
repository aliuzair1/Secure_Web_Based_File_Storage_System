const { Pool } = require("pg");
require("dotenv").config();

// When DATABASE_URL is set (e.g. Supabase), SSL is required.
// rejectUnauthorized: false is needed because Supabase uses a self-signed
// intermediate CA that Node's default trust store does not include.
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    }
  : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
      password: process.env.DB_PASSWORD
    };

const client = new Pool(poolConfig);

// Verify connectivity at startup (optional; Pool connects on first query)
client.query("SELECT 1")
  .then(() => { console.log("connected to pg"); })
  .catch((err) => { console.error("cant connect to pg", err); });

module.exports = { client };