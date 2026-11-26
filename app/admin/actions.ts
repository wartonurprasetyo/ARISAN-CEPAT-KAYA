"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getUserAccess } from "../../lib/auth/authenticate";
import { CAMPAIGN_TAG } from "../../lib/campaign-queries";
import { sql } from "../../lib/db";

export type Campaign = { id: string; slug: string; name: string; state: string; opens_at: string; get_amount: number; is_test: boolean };
export type Slot = { id: string; campaign_id: string; position: number; month_label: string; owner_name: string | null; claimed_at: string | null };
export type Audit = { id: number; campaign_id: string | null; claimant_name: string | null; action: string; result: string; reason: string | null; created_at: string };
export type AdminData = { email: string; campaigns: Campaign[]; slots: Slot[]; audits: Audit[] };
type ActionResult = { ok: boolean; message: string };

const REJECTED: ActionResult = { ok: false, message: "Perubahan ditolak (bukan admin atau sesi kedaluwarsa)." };

const stateSchema = z.object({ id: z.guid(), state: z.enum(["scheduled", "open", "closed"]) });
const configSchema = z.object({ id: z.guid(), getAmount: z.number().int().positive().max(2147483647), opensAt: z.iso.datetime() });

// Server actions are callable directly, so each one checks access itself.
async function adminUser() {
  const { user, isAdmin } = await getUserAccess();
  return isAdmin ? user : null;
}

/** null when the caller has no admin session. */
export async function getAdminData(): Promise<AdminData | null> {
  const user = await adminUser();
  if (!user) return null;

  // Aggregated as JSON: one round trip, and timestamps arrive as ISO strings.
  const [row] = await sql`
    SELECT
      (SELECT COALESCE(json_agg(c ORDER BY c.is_test), '[]') FROM (
        SELECT id, slug, name, state, opens_at, get_amount, is_test FROM public.campaigns
      ) c) AS campaigns,
      (SELECT COALESCE(json_agg(s ORDER BY s."position"), '[]') FROM (
        SELECT id, campaign_id, "position", month_label, owner_name, claimed_at FROM public.slots
      ) s) AS slots,
      (SELECT COALESCE(json_agg(a ORDER BY a.created_at DESC), '[]') FROM (
        SELECT id, campaign_id, claimant_name, action, result, reason, created_at
        FROM public.audit_logs ORDER BY created_at DESC LIMIT 50
      ) a) AS audits
  `;
  return { email: user.email, campaigns: row.campaigns, slots: row.slots, audits: row.audits };
}

export async function setCampaignState(id: string, state: string): Promise<ActionResult> {
  const user = await adminUser();
  if (!user) return REJECTED;
  const parsed = stateSchema.safeParse({ id, state });
  if (!parsed.success) return { ok: false, message: "Status tidak valid." };

  // app.user_id is read by the audit trigger, so it must share the transaction.
  const [, rows] = await sql.transaction([
    sql`SELECT set_config('app.user_id', ${user.id}, true)`,
    sql`UPDATE public.campaigns SET state = ${parsed.data.state} WHERE id = ${parsed.data.id} RETURNING name`,
  ]);
  if (!rows.length) return { ok: false, message: "Campaign tidak ditemukan." };
  revalidateTag(CAMPAIGN_TAG);
  return { ok: true, message: `${rows[0].name}: ${parsed.data.state}` };
}

export async function saveCampaign(id: string, getAmount: number, opensAt: string): Promise<ActionResult> {
  const user = await adminUser();
  if (!user) return REJECTED;
  const parsed = configSchema.safeParse({ id, getAmount, opensAt });
  if (!parsed.success) return { ok: false, message: "Nominal dan jadwal wajib valid." };

  const [, rows] = await sql.transaction([
    sql`SELECT set_config('app.user_id', ${user.id}, true)`,
    sql`UPDATE public.campaigns SET get_amount = ${parsed.data.getAmount}, opens_at = ${parsed.data.opensAt} WHERE id = ${parsed.data.id} RETURNING id`,
  ]);
  if (!rows.length) return { ok: false, message: "Campaign tidak ditemukan." };
  revalidateTag(CAMPAIGN_TAG);
  return { ok: true, message: "Konfigurasi tersimpan." };
}

export async function resetTestCampaign(): Promise<ActionResult> {
  const user = await adminUser();
  if (!user) return REJECTED;

  const [, rows] = await sql.transaction([
    sql`SELECT set_config('app.user_id', ${user.id}, true)`,
    sql`SELECT public.reset_test_campaign() AS result`,
  ]);
  revalidateTag(CAMPAIGN_TAG);
  return { ok: true, message: rows[0].result.message };
}
