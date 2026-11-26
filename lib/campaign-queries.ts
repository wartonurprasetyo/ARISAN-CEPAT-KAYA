import { unstable_cache } from "next/cache";
import { sql } from "./db";

export const CAMPAIGN_TAG = "campaign";

// Public data only. The short TTL keeps the query count independent of the number of visitors.
export const getCampaignCached = unstable_cache(
  async (slug: "official" | "test") => {
    const [row] = await sql`
      SELECT c.id, c.period_no, c.name, c.get_amount, c.opens_at, c.state, c.is_test,
        (SELECT json_agg(s ORDER BY s."position")
           FROM (SELECT id, "position", month_label, owner_name, claimed_at
                   FROM public.slots WHERE campaign_id = c.id) s) AS slots
      FROM public.campaigns c
      WHERE c.slug = ${slug}
      ORDER BY c.period_no DESC
      LIMIT 1
    `;
    return row ?? null;
  },
  ["campaign"],
  { tags: [CAMPAIGN_TAG], revalidate: 3 },
);

export type PastPeriod = {
  id: string;
  period_no: number;
  get_amount: number;
  slots: { id: string; position: number; month_label: string; owner_name: string | null }[];
};

// Every official period except the latest one, which is on the main page.
export const getPeriodHistoryCached = unstable_cache(
  async () => await sql`
    SELECT c.id, c.period_no, c.get_amount,
      (SELECT COALESCE(json_agg(s ORDER BY s."position"), '[]')
         FROM (SELECT id, "position", month_label, owner_name
                 FROM public.slots WHERE campaign_id = c.id) s) AS slots
    FROM public.campaigns c
    WHERE c.slug = 'official'
      AND c.period_no < (SELECT max(period_no) FROM public.campaigns WHERE slug = 'official')
    ORDER BY c.period_no DESC
  ` as PastPeriod[],
  ["campaign-history"],
  { tags: [CAMPAIGN_TAG], revalidate: 60 },
);
