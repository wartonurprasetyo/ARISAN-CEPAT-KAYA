"use client";

import { Alert, Button, Card, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, type AlertProps } from "@wnp_code/design-system";
import { useCallback, useEffect, useRef, useState } from "react";
import { campaignCountdown, campaignOpenDelay, formatCountdown, isCampaignOpen } from "../lib/campaign";
import { rupiah } from "../lib/format";
import { claimSlot } from "./actions";
import { SiteHeader } from "./site-header";

type Campaign = { id: string; period_no: number; name: string; get_amount: number; opens_at: string; state: string; is_test: boolean };
type Slot = { id: string; position: number; month_label: string; owner_name: string | null; claimed_at: string | null };
type CampaignResponse = { campaign: Campaign; slots: Slot[]; serverNow: number };

const POLL_MS = 3000;
const POLL_BEFORE_OPEN_MS = 10 * 60 * 1000;

export function WarPage({ campaignSlug, modeLabel }: { campaignSlug: string; modeLabel: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("Memuat status WAR...");
  const [tone, setTone] = useState<AlertProps["variant"]>("warning");
  const [winner, setWinner] = useState<(Slot & { claimantName: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const requestSeq = useRef(0);
  const reloadTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    let data: CampaignResponse | null = null;
    try {
      // The timeout keeps one hung request from stalling the polling loop.
      const response = await fetch(`/api/campaign/${campaignSlug}`, { cache: "no-store", signal: AbortSignal.timeout?.(10000) });
      if (response.ok) data = await response.json() as CampaignResponse;
    } catch {
      // Handled below as a load error.
    }
    if (seq !== requestSeq.current) return;
    if (data) {
      setCampaign(data.campaign);
      setSlots(data.slots);
      setClockOffset(data.serverNow - Date.now());
    }
    setLoadError(!data);
    setLoading(false);
  }, [campaignSlug]);

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => { reloadTimer.current = null; void load(); }, 250);
  }, [load]);

  useEffect(() => {
    void load();
    const onVisible = () => { if (document.visibilityState === "visible") scheduleReload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (reloadTimer.current !== null) { window.clearTimeout(reloadTimer.current); reloadTimer.current = null; }
    };
  }, [load, scheduleReload]);

  const serverNow = now + clockOffset;
  const filled = slots.filter(slot => slot.owner_name).length;
  const isOpen = campaign ? isCampaignOpen(campaign, serverNow) : false;
  const countdown = campaign ? campaignCountdown(campaign, serverNow) : null;
  const countdownLabel = formatCountdown(countdown);
  const countdownActive = campaign ? campaignOpenDelay(campaign, serverNow) !== null && !isOpen : false;
  const isDone = campaign?.state === "completed" || filled === 10;
  const openDelay = campaign ? campaignOpenDelay(campaign, serverNow) : null;
  // Poll only around the war itself so the database can sleep the rest of the time.
  const shouldPoll = !isDone && (isOpen || (openDelay !== null && openDelay <= POLL_BEFORE_OPEN_MS));
  const hasCampaign = campaign !== null;

  useEffect(() => {
    if (!shouldPoll) return;
    let stopped = false;
    let timer: number;
    // Chained timeouts: a slow response is never overtaken (and discarded) by the next poll.
    const tick = async () => {
      if (document.visibilityState === "visible") await load();
      if (!stopped) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [shouldPoll, load]);

  useEffect(() => {
    if (!campaign || !countdownActive) return;

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    const delay = campaignOpenDelay(campaign, Date.now() + clockOffset) || 0;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(delay + 50, 2147483647));
    return () => { window.clearInterval(interval); window.clearTimeout(timer); };
  }, [campaign, countdownActive, clockOffset]);

  useEffect(() => {
    if (loadError && !hasCampaign) { setMessage("Gagal memuat data WAR. Coba muat ulang halaman."); setTone("danger"); }
    else if (isDone) { setMessage("WAR telah selesai. Seluruh 10 slot sudah terisi."); setTone("danger"); }
    else if (isOpen) { setMessage(`WAR sedang berlangsung. ${filled}/10 slot terisi.`); setTone("success"); }
    else { setMessage("WAR belum dimulai."); setTone("warning"); }
    // Not `campaign`: every poll replaces that object and would wipe claim messages.
  }, [filled, isDone, isOpen, loadError, hasCampaign]);

  async function take(slot: Slot) {
    if (!campaign) return;
    const claimantName = name.trim();
    if (!claimantName) { setMessage("Masukkan nama perwakilan terlebih dahulu."); setTone("warning"); return; }
    let result: Awaited<ReturnType<typeof claimSlot>>;
    try { result = await claimSlot(campaignSlug, slot.id, claimantName); }
    catch { setMessage("Koneksi gagal. Silakan coba lagi."); setTone("danger"); return; }
    if (result.ok) { setWinner({ ...slot, claimantName }); setName(""); setMessage("Klaim berhasil tersimpan."); setTone("success"); }
    else { setMessage(result.message || "Slot baru saja diambil orang lain."); setTone("warning"); }
    scheduleReload();
  }

  return (
    <main className="wrap">
      <SiteHeader />

      {loading ? <Skeleton className="h-44 w-full rounded-lg" aria-label="Memuat halaman" /> : <>
        <section className="hero">
          <div className="hero-copy"><p className="eyebrow">{modeLabel}</p><h1>Pilih bulan GET kamu.</h1><p className="lead">Satu orang, satu slot. Siapa cepat dia dapat.</p><p>{campaign && slots.length > 0 && `Periode ${campaign.period_no}: ${slots[0].month_label} - ${slots[slots.length - 1].month_label}. `}Pilih bulan yang masih tersedia setelah WAR dibuka.</p></div>
          <div className="hero-side"><div className="meta"><span>GET per bulan</span><strong>{campaign ? rupiah(campaign.get_amount) : "..."}</strong></div><div className="meta"><span>Slot terisi</span><strong>{filled}/10</strong></div>{countdownLabel && <div className="countdown" aria-live="polite"><span>WAR dimulai dalam</span><strong>{countdownLabel}</strong></div>}<p className="muted">Status diperbarui otomatis saat ada klaim baru.</p></div>
        </section>

        <section className="section" aria-labelledby="claim-heading">
          <Card className="panel">
            <div className="section-heading"><div><p className="eyebrow">Mulai dari sini</p><h2 id="claim-heading">Masukkan nama perwakilan</h2></div><p>Nama ini akan tercatat bersama bulan yang berhasil kamu ambil.</p></div>
            <div className="field"><Label htmlFor="name">Nama Perwakilan</Label><Input id="name" size="lg" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Contoh: Nimas" disabled={!isOpen} /></div>
            <Alert variant={tone} className="status">{message}</Alert>
          </Card>
        </section>

        <section className="section" aria-labelledby="slots-heading">
          <Card className="panel">
            <div className="section-heading"><div><p className="eyebrow">10 pilihan bulan</p><h2 id="slots-heading">Pilih slot yang tersedia</h2></div><p>Slot yang sudah terambil tidak dapat dipilih ulang.</p></div>
            <div className="slot-grid">{slots.map(slot => { const taken = Boolean(slot.owner_name); return <button key={slot.id} type="button" className={`slot ${taken ? "taken" : isOpen ? "" : "closed"}`} disabled={taken || !isOpen} onClick={() => take(slot)}><b>{slot.position}. {slot.month_label}</b><span>{taken ? `Terambil oleh ${slot.owner_name}` : isOpen ? "Tersedia untuk dipilih" : "Belum tersedia"}</span></button>; })}</div>
          </Card>
        </section>

        <section className="section" aria-labelledby="result-heading">
          <Card className="panel">
            <div className="section-heading"><div><p className="eyebrow">Hasil terkini</p><h2 id="result-heading">Daftar bulan GET</h2></div><p>Data ini mengikuti status terbaru dari server.</p></div>
            <Table className="result"><TableHeader><TableRow><TableHead>No</TableHead><TableHead>Bulan GET</TableHead><TableHead>Perwakilan</TableHead><TableHead>GET</TableHead></TableRow></TableHeader><TableBody>{slots.map(slot => <TableRow key={slot.id}><TableCell>{slot.position}</TableCell><TableCell>{slot.month_label}</TableCell><TableCell>{slot.owner_name || "Belum diambil"}</TableCell><TableCell>{campaign ? rupiah(campaign.get_amount) : "..."}</TableCell></TableRow>)}</TableBody></Table>
            <p className="total">Total GET: <strong>{campaign ? rupiah(campaign.get_amount * 10) : "..."}</strong></p>
          </Card>
        </section>
      </>}

      {winner && campaign && <Dialog open onOpenChange={() => setWinner(null)}>
        <DialogContent className="w-[calc(100%-2rem)] rounded-lg">
          <p className="eyebrow">Klaim berhasil</p>
          <DialogTitle>Bulan GET sudah jadi milikmu.</DialogTitle>
          <DialogDescription className="mt-3"><strong>{winner.month_label}</strong> tercatat untuk <strong>{winner.claimantName}</strong>.</DialogDescription>
          <p className="muted mt-2 mb-6">Nilai GET: <strong>{rupiah(campaign.get_amount)}</strong></p>
          <Button size="lg" className="w-full" onClick={() => setWinner(null)}>Tutup</Button>
        </DialogContent>
      </Dialog>}
    </main>
  );
}
