import { setDefaultAutoSelectFamilyAttemptTimeout } from "net";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

// Connecting to a distant Neon region can exceed Node's 250 ms per-address
// default, which surfaced as intermittent ETIMEDOUT errors.
setDefaultAutoSelectFamilyAttemptTimeout(3000);

export const sql = neon(process.env.DATABASE_URL);
