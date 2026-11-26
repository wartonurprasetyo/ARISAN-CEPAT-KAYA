"use client";

import { Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wnp_code/design-system";
import type { PastPeriod } from "../../lib/campaign-queries";
import { rupiah } from "../../lib/format";
import { SiteHeader } from "../site-header";

export function HistoryView({ periods }: { periods: PastPeriod[] }) {
  return (
    <main className="wrap">
      <SiteHeader />
      <div className="section-heading"><div><p className="eyebrow">Arsip</p><h2>Riwayat periode</h2></div><p>Hasil WAR dari periode sebelum periode yang aktif sekarang.</p></div>
      {periods.length === 0 && <p className="muted">Belum ada periode sebelumnya.</p>}
      {periods.map(period => {
        const filled = period.slots.filter(slot => slot.owner_name).length;
        return <section className="section" key={period.id} aria-labelledby={`period-${period.period_no}`}>
          <Card className="panel">
            <div className="section-heading"><div><p className="eyebrow">{period.slots[0]?.month_label} - {period.slots[period.slots.length - 1]?.month_label}</p><h2 id={`period-${period.period_no}`}>Periode {period.period_no}</h2></div><p>GET {rupiah(period.get_amount)} per bulan. {filled}/{period.slots.length} slot terisi.</p></div>
            <Table className="result"><TableHeader><TableRow><TableHead>No</TableHead><TableHead>Bulan GET</TableHead><TableHead>Perwakilan</TableHead></TableRow></TableHeader><TableBody>{period.slots.map(slot => <TableRow key={slot.id}><TableCell>{slot.position}</TableCell><TableCell>{slot.month_label}</TableCell><TableCell>{slot.owner_name || "Tidak terisi"}</TableCell></TableRow>)}</TableBody></Table>
          </Card>
        </section>;
      })}
    </main>
  );
}
