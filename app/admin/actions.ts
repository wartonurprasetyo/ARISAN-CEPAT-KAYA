"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getUserAccess } from "../../lib/auth/authenticate";
import { monthLabels } from "../../lib/campaign";
import { CAMPAIGN_TAG } from "../../lib/campaign-queries";
import { sql } from "../../lib/db";

export type Campaign = { id: string; period_no: number; slug: string; name: string; state: string; opens_at: string; get_amount: number; is_test: boolean };
export type Slot = { id: string; campaign_id: string; position: number; month_label: string; owner_name: string | null; claimed_at: string | null };
export type Audit = { id: number; campaign_id: string | null; claimant_name: string | null; action: string; result: string; reason: string | null; created_at: string };
export type AdminData = { email: string; campaigns: Campaign[]; slots: Slot[]; audits: Audit[] };
type ActionResult = { ok: boolean; message: string };

const REJECTED: ActionResult = { ok: false, message: "Perubahan ditolak (bukan admin atau sesi kedaluwarsa)." };

const stateSchema = z.object({ id: z.guid(), state: z.enum(["scheduled", "open", "closed"]) });
const amountSchema = z.number().int().positive().max(2147483647);
const configSchema = z.object({ id: z.guid(), getAmount: amountSchema, opensAt: z.iso.datetime() });
const periodSchema = z.object({
  startMonth: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
  getAmount: amountSchema,
  // A past schedule would open the new WAR immediately.
  opensAt: z.iso.datetime().refine(value => Date.parse(value) > Date.now()),
});
const NOT_LATEST: ActionResult = { ok: false, message: "Hanya periode terbaru yang bisa diubah." };

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
    WITH latest AS (
      SELECT DISTINCT ON (slug) id, period_no, slug, name, state, opens_at, get_amount, is_test
      FROM public.campaigns ORDER BY slug, period_no DESC
    )
    SELECT
      (SELECT COALESCE(json_agg(c ORDER BY c.is_test), '[]') FROM latest c) AS campaigns,
      (SELECT COALESCE(json_agg(s ORDER BY s."position"), '[]') FROM (
        SELECT id, campaign_id, "position", month_label, owner_name, claimed_at FROM public.slots
        WHERE campaign_id IN (SELECT id FROM latest)
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
    sql`UPDATE public.campaigns c SET state = ${parsed.data.state} WHERE c.id = ${parsed.data.id}
      AND c.period_no = (SELECT max(period_no) FROM public.campaigns WHERE slug = c.slug) RETURNING name`,
  ]);
  if (!rows.length) return NOT_LATEST;
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
    sql`UPDATE public.campaigns c SET get_amount = ${parsed.data.getAmount}, opens_at = ${parsed.data.opensAt} WHERE c.id = ${parsed.data.id}
      AND c.period_no = (SELECT max(period_no) FROM public.campaigns WHERE slug = c.slug) RETURNING id`,
  ]);
  if (!rows.length) return NOT_LATEST;
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

export async function createNextPeriod(startMonth: string, getAmount: number, opensAt: string): Promise<ActionResult> {
  const user = await adminUser();
  if (!user) return REJECTED;
  const parsed = periodSchema.safeParse({ startMonth, getAmount, opensAt });
  if (!parsed.success) return { ok: false, message: "Bulan pertama (YYYY-MM), nominal, dan jadwal di masa depan wajib valid." };

  const labels = monthLabels(parsed.data.startMonth);
  try {
    // One statement, so the period, its slots, and the audit entry succeed or fail together.
    const [row] = await sql`
      WITH previous AS (
        SELECT name, period_no FROM public.campaigns WHERE slug = 'official' ORDER BY period_no DESC LIMIT 1
      ), created AS (
        INSERT INTO public.campaigns (slug, period_no, name, get_amount, opens_at, state, is_test)
        SELECT 'official', period_no + 1, name, ${parsed.data.getAmount}::integer, ${parsed.data.opensAt}::timestamptz, 'scheduled', false
        FROM previous
        RETURNING id, period_no
      ), added AS (
        INSERT INTO public.slots (campaign_id, "position", month_label)
        SELECT created.id, m."position", m.label
        FROM created CROSS JOIN unnest(${labels}::text[]) WITH ORDINALITY AS m(label, "position")
      )
      INSERT INTO public.audit_logs (campaign_id, action, result, reason)
      SELECT id, 'period_create', 'success', 'periode ' || period_no || ' dibuat oleh admin ' || ${user.id}::text FROM created
      RETURNING (SELECT period_no FROM created) AS period_no
    `;
    if (!row) return { ok: false, message: "Campaign resmi tidak ditemukan." };
    revalidateTag(CAMPAIGN_TAG);
    return { ok: true, message: `Periode ${row.period_no} dibuat.` };
  } catch (error) {
    // The live-period index rejects a new period while the current one is scheduled or open.
    if ((error as { code?: string }).code === "23505") return { ok: false, message: "Tutup atau selesaikan periode aktif dulu." };
    throw error;
  }
}

export async function deletePeriod(id: string): Promise<ActionResult> {
  const user = await adminUser();
  if (!user) return REJECTED;
  if (!z.guid().safeParse(id).success) return { ok: false, message: "Periode tidak valid." };

  const [, rows] = await sql.transaction([
    // Lock first: the DELETE then takes a fresh snapshot and sees any claim that was in flight.
    sql`SELECT id FROM public.campaigns WHERE id = ${id} FOR UPDATE`,
    sql`
      WITH deleted AS (
        DELETE FROM public.campaigns c
        WHERE c.id = ${id} AND c.slug = 'official' AND c.period_no > 1
          AND c.period_no = (SELECT max(period_no) FROM public.campaigns WHERE slug = c.slug)
          AND NOT EXISTS (SELECT 1 FROM public.claims WHERE campaign_id = c.id)
        RETURNING c.period_no
      )
      INSERT INTO public.audit_logs (action, result, reason)
      SELECT 'period_delete', 'success', 'periode ' || period_no || ' dihapus oleh admin ' || ${user.id}::text FROM deleted
      RETURNING id
    `,
  ]);
  if (!rows.length) return { ok: false, message: "Hanya periode terbaru tanpa klaim (selain periode 1) yang bisa dihapus." };
  revalidateTag(CAMPAIGN_TAG);
  return { ok: true, message: "Periode dihapus." };
}
