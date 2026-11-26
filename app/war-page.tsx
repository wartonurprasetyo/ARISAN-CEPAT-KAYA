"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { campaignCountdown, campaignOpenDelay, formatCountdown, isCampaignOpen } from "../lib/campaign";
import { rupiah } from "../lib/format";
import { claimSlot } from "./actions";

type Campaign = { id: string; name: string; get_amount: number; opens_at: string; state: string; is_test: boolean };
type Slot = { id: string; position: number; month_label: string; owner_name: string | null; claimed_at: string | null };
type CampaignResponse = { campaign: Campaign; slots: Slot[]; serverNow: number };

const POLL_MS = 3000;
const POLL_BEFORE_OPEN_MS = 10 * 60 * 1000;

export function WarPage({ campaignSlug, modeLabel }: { campaignSlug: string; modeLabel: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("Memuat status WAR...");
  const [messageClass, setMessageClass] = useState("warn");
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
    if (loadError && !hasCampaign) { setMessage("Gagal memuat data WAR. Coba muat ulang halaman."); setMessageClass("closed-msg"); }
    else if (isDone) { setMessage("WAR telah selesai. Seluruh 10 slot sudah terisi."); setMessageClass("closed-msg"); }
    else if (isOpen) { setMessage(`WAR sedang berlangsung. ${filled}/10 slot terisi.`); setMessageClass("ok"); }
    else { setMessage("WAR belum dimulai."); setMessageClass("warn"); }
    // Not `campaign`: every poll replaces that object and would wipe claim messages.
  }, [filled, isDone, isOpen, loadError, hasCampaign]);

  async function take(slot: Slot) {
    if (!campaign) return;
    const claimantName = name.trim();
    if (!claimantName) { setMessage("Masukkan nama perwakilan terlebih dahulu."); setMessageClass("warn"); return; }
    let result: Awaited<ReturnType<typeof claimSlot>>;
    try { result = await claimSlot(campaignSlug, slot.id, claimantName); }
    catch { setMessage("Koneksi gagal. Silakan coba lagi."); setMessageClass("closed-msg"); return; }
    if (result.ok) { setWinner({ ...slot, claimantName }); setName(""); setMessage("Klaim berhasil tersimpan."); setMessageClass("ok"); }
    else { setMessage(result.message || "Slot baru saja diambil orang lain."); setMessageClass("warn"); }
    scheduleReload();
  }

  return (
    <main className="wrap">
      <header className="site-header">
        <a className="brand" href="/"><span className="brand-mark">W</span><span>WAR Arisan</span></a>
        <nav className="nav" aria-label="Navigasi utama"><a href="/">WAR resmi</a><a href="/test">Mode test</a><a href="/admin">Admin</a></nav>
      </header>

      {loading ? <div className="skeleton" aria-label="Memuat halaman" /> : <>
        <section className="hero">
          <div className="hero-copy"><p className="eyebrow">{modeLabel}</p><h1>Pilih bulan GET kamu.</h1><p className="lead">Satu orang, satu slot. Siapa cepat dia dapat.</p><p>Periode November 2026 - Agustus 2027. Pilih bulan yang masih tersedia setelah WAR dibuka.</p></div>
          <div className="hero-side"><div className="meta"><span>GET per bulan</span><strong>{campaign ? rupiah(campaign.get_amount) : "..."}</strong></div><div className="meta"><span>Slot terisi</span><strong>{filled}/10</strong></div>{countdownLabel && <div className="countdown" aria-live="polite"><span>WAR dimulai dalam</span><strong>{countdownLabel}</strong></div>}<p className="muted">Status diperbarui otomatis saat ada klaim baru.</p></div>
        </section>

        <section className="section panel" aria-labelledby="claim-heading">
          <div className="section-heading"><div><p className="eyebrow">Mulai dari sini</p><h2 id="claim-heading">Masukkan nama perwakilan</h2></div><p>Nama ini akan tercatat bersama bulan yang berhasil kamu ambil.</p></div>
          <div className="field"><label htmlFor="name">Nama Perwakilan</label><input id="name" className="input" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Contoh: Nimas" disabled={!isOpen} /></div>
          <div className={`status ${messageClass}`} role="status"><span className="status-mark" aria-hidden="true" />{message}</div>
        </section>

        <section className="section panel" aria-labelledby="slots-heading">
          <div className="section-heading"><div><p className="eyebrow">10 pilihan bulan</p><h2 id="slots-heading">Pilih slot yang tersedia</h2></div><p>Slot yang sudah terambil tidak dapat dipilih ulang.</p></div>
          <div className="slot-grid">{slots.map(slot => { const taken = Boolean(slot.owner_name); return <button key={slot.id} className={`slot ${taken ? "taken" : isOpen ? "" : "closed"}`} disabled={taken || !isOpen} onClick={() => take(slot)}><b>{slot.position}. {slot.month_label}</b><span>{taken ? `Terambil oleh ${slot.owner_name}` : isOpen ? "Tersedia untuk dipilih" : "Belum tersedia"}</span></button>; })}</div>
        </section>

        <section className="section panel" aria-labelledby="result-heading">
          <div className="section-heading"><div><p className="eyebrow">Hasil terkini</p><h2 id="result-heading">Daftar bulan GET</h2></div><p>Data ini mengikuti status terbaru dari server.</p></div>
          <div className="table-wrap"><table className="result"><thead><tr><th>No</th><th>Bulan GET</th><th>Perwakilan</th><th>GET</th></tr></thead><tbody>{slots.map(slot => <tr key={slot.id}><td>{slot.position}</td><td>{slot.month_label}</td><td>{slot.owner_name || "Belum diambil"}</td><td>{campaign ? rupiah(campaign.get_amount) : "..."}</td></tr>)}</tbody></table></div>
          <p className="total">Total GET: <strong>{campaign ? rupiah(campaign.get_amount * 10) : "..."}</strong></p>
        </section>
      </>}

      {winner && campaign && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="winner-heading"><div className="modal"><p className="eyebrow">Klaim berhasil</p><h2 id="winner-heading">Bulan GET sudah jadi milikmu.</h2><p><strong>{winner.month_label}</strong> tercatat untuk <strong>{winner.claimantName}</strong>.</p><p>Nilai GET: <strong>{rupiah(campaign.get_amount)}</strong></p><button className="primary wide" onClick={() => setWinner(null)}>Tutup</button></div></div>}
    </main>
  );
}
