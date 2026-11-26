import { unstable_cache } from "next/cache";
import { sql } from "./db";

export const CAMPAIGN_TAG = "campaign";

// Public data only. The short TTL keeps the query count independent of the number of visitors.
export const getCampaignCached = unstable_cache(
  async (slug: "official" | "test") => {
    const [row] = await sql`
      SELECT c.id, c.name, c.get_amount, c.opens_at, c.state, c.is_test,
        (SELECT json_agg(s ORDER BY s."position")
           FROM (SELECT id, "position", month_label, owner_name, claimed_at
                   FROM public.slots WHERE campaign_id = c.id) s) AS slots
      FROM public.campaigns c
      WHERE c.slug = ${slug}
    `;
    return row ?? null;
  },
  ["campaign"],
  { tags: [CAMPAIGN_TAG], revalidate: 3 },
);
