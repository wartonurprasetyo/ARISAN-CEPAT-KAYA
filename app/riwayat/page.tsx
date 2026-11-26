import { getPeriodHistoryCached } from "../../lib/campaign-queries";
import { HistoryView } from "./history-view";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  return <HistoryView periods={await getPeriodHistoryCached()} />;
}
