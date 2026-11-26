"use client";

import { Alert, Button, Card, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wnp_code/design-system";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { campaignOpenDelay, getCampaignDisplayState } from "../../lib/campaign";
import { formatWib, formatWibParts } from "../../lib/format";
import { createNextPeriod, deletePeriod, getAdminData, resetTestCampaign, saveCampaign as saveCampaignAction, setCampaignState, type AdminData, type Campaign } from "./actions";

const wibInput = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(" ", "T");
const POLL_MS = 5000;

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const requestSeq = useRef(0);
  const signedIn = data !== null;

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const next = await getAdminData();
      if (seq === requestSeq.current) setData(next);
    } catch {
      if (seq === requestSeq.current) setNotice("Gagal memuat data admin.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!signedIn) return;
    let stopped = false;
    let timer: number;
    const tick = async () => {
      if (document.visibilityState === "visible") await load();
      if (!stopped) timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [signedIn, load]);

  useEffect(() => {
    const delays = (data?.campaigns ?? [])
      .map(campaign => campaignOpenDelay(campaign, now))
      .filter((delay): delay is number => delay !== null && delay > 0);
    if (delays.length === 0) return;

    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.min(...delays) + 50, 2147483647));
    return () => window.clearTimeout(timer);
  }, [data, now]);

  async function login(e: FormEvent) {
    e.preventDefault();
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }).catch(() => null);
    if (!response?.ok) return setNotice((await response?.json().catch(() => null))?.message || "Koneksi gagal. Silakan coba lagi.");
    setPassword(""); setNotice(""); await load();
  }

  async function run(action: Promise<{ message: string }>) {
    try { setNotice((await action).message); }
    catch { setNotice("Gagal menyimpan perubahan. Coba lagi."); }
    await load();
  }

  async function setState(c: Campaign, state: string) { await run(setCampaignState(c.id, state)); }

  async function saveCampaign(e: FormEvent<HTMLFormElement>, c: Campaign) {
    e.preventDefault();
    const form = new FormData(e.currentTarget); const get_amount = Number(form.get("amount")); const raw = String(form.get("opens_at"));
    if (!Number.isInteger(get_amount) || get_amount <= 0 || !raw) return setNotice("Nominal dan jadwal wajib valid.");
    await run(saveCampaignAction(c.id, get_amount, new Date(`${raw}:00+07:00`).toISOString()));
  }

  async function createPeriod(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget); const raw = String(form.get("opens_at"));
    if (!raw) return setNotice("Jadwal buka wajib diisi.");
    await run(createNextPeriod(String(form.get("start_month")), Number(form.get("amount")), new Date(`${raw}:00+07:00`).toISOString()));
  }

  async function removePeriod(c: Campaign) {
    if (!confirm(`Hapus periode ${c.period_no} beserta slot dan jadwalnya?`)) return;
    await run(deletePeriod(c.id));
  }

  async function resetTest() {
    if (!confirm("Reset semua data TEST?")) return;
    await run(resetTestCampaign());
  }

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!response?.ok) return setNotice("Gagal keluar. Coba lagi.");
    requestSeq.current++; setData(null); setNotice("");
  }

  if (!data) return <main className="wrap admin-page">
    <header className="admin-header"><div><p className="eyebrow">Akses terbatas</p><h1>Admin WAR</h1></div><a className="link-button" href="/">Kembali ke WAR</a></header>
    <Card className="panel">
      <form className="login-form" onSubmit={login}>
        <div className="field"><Label htmlFor="email">Email</Label><Input id="email" size="lg" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="field"><Label htmlFor="password">Password</Label><Input id="password" size="lg" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
        <Button type="submit" size="lg" className="w-full">Masuk</Button>
        {notice && <Alert variant="danger" live>{notice}</Alert>}
      </form>
    </Card>
  </main>;

  const { campaigns, slots, audits } = data;

  return <main className="wrap admin-page">
    <header className="admin-header"><div><p className="eyebrow">Panel operasional</p><h1>Admin WAR</h1><p className="admin-user">{data.email}</p></div><div className="button-row"><a className="link-button" href="/">Lihat WAR</a><a className="link-button" href="/riwayat">Riwayat</a><Button variant="outline" size="lg" onClick={logout}>Keluar</Button></div></header>
    {notice && <Alert variant="warning" className="status">{notice}</Alert>}
    <section className="section campaign-grid">{campaigns.map(c => {
      const ownSlots = slots.filter(s => s.campaign_id === c.id);
      const taken = ownSlots.filter(s => s.owner_name).length;
      const displayState = getCampaignDisplayState(c, now);
      return <article key={c.id}>
        <Card className="panel campaign-card h-full">
          <div><p className="eyebrow">{c.slug === "test" ? "Mode test" : `WAR resmi · Periode ${c.period_no}`}</p><h2>{c.name}</h2><p className="stats-line"><span><strong>{taken}/10</strong> slot terisi</span><span>Status: <strong>{displayState}</strong></span></p></div>
          <form onSubmit={e => saveCampaign(e, c)}>
            <div className="field"><Label htmlFor={`amount-${c.id}`}>Nominal GET</Label><Input id={`amount-${c.id}`} size="lg" name="amount" type="number" min="1" defaultValue={c.get_amount} /></div>
            <div className="field"><Label htmlFor={`opens-${c.id}`}>Jadwal buka WIB</Label><Input id={`opens-${c.id}`} size="lg" name="opens_at" type="datetime-local" defaultValue={wibInput(c.opens_at)} /></div>
            <Button type="submit" size="lg">Simpan konfigurasi</Button>
          </form>
          <div className="button-row"><Button variant="outline" size="lg" onClick={() => setState(c, "open")}>Buka</Button><Button variant="outline" size="lg" onClick={() => setState(c, "closed")}>Tutup</Button><Button variant="outline" size="lg" onClick={() => setState(c, "scheduled")}>Jadwalkan</Button></div>
          <Table className="result"><TableHeader><TableRow><TableHead>Bulan</TableHead><TableHead>Perwakilan</TableHead><TableHead>Diambil</TableHead></TableRow></TableHeader><TableBody>{ownSlots.map(s => <TableRow key={s.id}><TableCell>{s.month_label}</TableCell><TableCell>{s.owner_name || "Belum diambil"}</TableCell><TableCell>{formatWib(s.claimed_at)}</TableCell></TableRow>)}</TableBody></Table>
          {c.slug === "test" && <Button variant="danger" size="lg" onClick={resetTest}>Reset data TEST</Button>}
          {c.slug === "official" && c.period_no > 1 && taken === 0 && <Button variant="danger" size="lg" onClick={() => removePeriod(c)}>Hapus periode {c.period_no}</Button>}
          {c.slug === "official" && (c.state === "closed" || c.state === "completed") && <form className="next-period" onSubmit={createPeriod}>
            <h3>Buat periode {c.period_no + 1}</h3>
            <p className="muted">10 bulan berurutan dibuat otomatis. Periode {c.period_no} pindah ke riwayat dan tidak bisa diubah lagi.</p>
            <div className="field"><Label htmlFor={`next-month-${c.id}`}>Bulan GET pertama</Label><Input id={`next-month-${c.id}`} size="lg" name="start_month" type="month" placeholder="YYYY-MM" required /></div>
            <div className="field"><Label htmlFor={`next-amount-${c.id}`}>Nominal GET</Label><Input id={`next-amount-${c.id}`} size="lg" name="amount" type="number" min="1" defaultValue={c.get_amount} required /></div>
            <div className="field"><Label htmlFor={`next-opens-${c.id}`}>Jadwal buka WIB</Label><Input id={`next-opens-${c.id}`} size="lg" name="opens_at" type="datetime-local" required /></div>
            <Button type="submit" size="lg">Buat periode {c.period_no + 1}</Button>
          </form>}
        </Card>
      </article>;
    })}</section>
    <section className="section">
      <Card className="panel">
        <div className="section-heading"><div><p className="eyebrow">Jejak aktivitas</p><h2>Audit log terbaru</h2></div><p>50 aktivitas terakhir dari sistem klaim.</p></div>
        <Table className="result"><TableHeader><TableRow><TableHead>Waktu</TableHead><TableHead>Nama</TableHead><TableHead>Aksi</TableHead><TableHead>Hasil</TableHead></TableRow></TableHeader><TableBody>{audits.map(a => { const time = formatWibParts(a.created_at); return <TableRow key={a.id}><TableCell className="audit-time"><span className="audit-date">{time.date}</span>{time.time && <span className="audit-clock">{time.time}</span>}</TableCell><TableCell>{a.claimant_name || "Tidak ada nama"}</TableCell><TableCell>{a.action}</TableCell><TableCell>{a.result}{a.reason ? ` (${a.reason})` : ""}</TableCell></TableRow>; })}</TableBody></Table>
      </Card>
    </section>
  </main>;
}
