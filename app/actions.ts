"use server";

import { revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { clientIp, createRateLimiter } from "../lib/auth/login-guard";
import { CAMPAIGN_TAG } from "../lib/campaign-queries";
import { sql } from "../lib/db";

type ClaimResult = { ok: boolean; code?: string; message?: string };

const claimSchema = z.object({
  slug: z.enum(["official", "test"]),
  slotId: z.guid(),
  name: z.string().trim().min(1).max(80),
});

// Per IP, and participants may share one office or home network.
const claimAttempts = createRateLimiter(30, 60 * 1000);

/** Public: anyone may call this. The database function decides who gets the slot. */
export async function claimSlot(slug: string, slotId: string, name: string): Promise<ClaimResult> {
  const parsed = claimSchema.safeParse({ slug, slotId, name });
  if (!parsed.success) return { ok: false, message: "Data klaim tidak valid." };

  if (claimAttempts.take(clientIp((await headers()).get("x-forwarded-for")))) {
    return { ok: false, message: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." };
  }

  const claim = parsed.data;
  const [row] = await sql`
    SELECT public.claim_slot(${claim.slug}, ${claim.slotId}, ${claim.name}, ${crypto.randomUUID()}) AS result
  `;
  revalidateTag(CAMPAIGN_TAG);
  return row.result;
}
