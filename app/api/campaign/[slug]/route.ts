import { NextResponse } from "next/server";
import { getCampaignCached } from "../../../../lib/campaign-queries";

function notFound() {
  return NextResponse.json({ message: "WAR tidak ditemukan." }, { status: 404 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Checked before the cache so arbitrary slugs cannot create entries or queries.
  if (slug !== "official" && slug !== "test") return notFound();

  const row = await getCampaignCached(slug);
  if (!row) return notFound();

  const { slots, ...campaign } = row;
  // serverNow stays outside the cache: clients use it to correct their clock.
  return NextResponse.json(
    { campaign, slots: slots ?? [], serverNow: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
