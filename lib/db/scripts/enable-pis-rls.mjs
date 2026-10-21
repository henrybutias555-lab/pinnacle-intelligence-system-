import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  throw new Error("SUPABASE_DB_URL is required to enable PIS table security.");
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await pool.query(`
    ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.intelligence_records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.intake_documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.evidence_packages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
  `);
  process.stdout.write("Enabled row-level security on PIS tables.\n");
} finally {
  await pool.end();
}
