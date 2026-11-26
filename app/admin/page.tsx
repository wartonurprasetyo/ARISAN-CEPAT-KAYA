"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { campaignOpenDelay, getCampaignDisplayState } from "../../lib/campaign";
import { formatWib, formatWibParts } from "../../lib/format";
import { getAdminData, resetTestCampaign, saveCampaign as saveCampaignAction, setCampaignState, type AdminData, type Campaign } from "./actions";

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

  async function resetTest() {
    if (!confirm("Reset semua data TEST?")) return;
    await run(resetTestCampaign());
  }

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!response?.ok) return setNotice("Gagal keluar. Coba lagi.");
    requestSeq.current++; setData(null); setNotice("");
  }

  if (!data) return <main className="wrap admin-page"><header className="admin-header"><div><p className="eyebrow">Akses terbatas</p><h1>Admin WAR</h1></div><a href="/">Kembali ke WAR</a></header><form className="panel" onSubmit={login}><div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div><div className="field"><label htmlFor="password">Password</label><input id="password" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div><button className="primary wide" type="submit">Masuk</button>{notice && <p className="error">{notice}</p>}</form></main>;

  const { campaigns, slots, audits } = data;

  return <main className="wrap admin-page"><header className="admin-header"><div><p className="eyebrow">Panel operasional</p><h1>Admin WAR</h1><p className="admin-user">{data.email}</p></div><div className="button-row"><a className="secondary" href="/">Lihat WAR</a><button className="secondary" onClick={logout}>Keluar</button></div></header>{notice && <div className="status warn" role="status"><span className="status-mark" aria-hidden="true" />{notice}</div>}<section className="section campaign-grid">{campaigns.map(c => { const ownSlots = slots.filter(s => s.campaign_id === c.id); const taken = ownSlots.filter(s => s.owner_name).length; const displayState = getCampaignDisplayState(c, now); return <article className="panel campaign-card" key={c.id}><div><p className="eyebrow">{c.slug === "test" ? "Mode test" : "WAR resmi"}</p><h2>{c.name}</h2><p className="stats-line"><span><strong>{taken}/10</strong> slot terisi</span><span>Status: <strong>{displayState}</strong></span></p></div><form onSubmit={e => saveCampaign(e, c)}><div className="field"><label htmlFor={`amount-${c.id}`}>Nominal GET</label><input id={`amount-${c.id}`} className="input" name="amount" type="number" min="1" defaultValue={c.get_amount} /></div><div className="field"><label htmlFor={`opens-${c.id}`}>Jadwal buka WIB</label><input id={`opens-${c.id}`} className="input" name="opens_at" type="datetime-local" defaultValue={wibInput(c.opens_at)} /></div><button className="primary" type="submit">Simpan konfigurasi</button></form><div className="button-row"><button className="secondary" onClick={() => setState(c, "open")}>Buka</button><button className="secondary" onClick={() => setState(c, "closed")}>Tutup</button><button className="secondary" onClick={() => setState(c, "scheduled")}>Jadwalkan</button></div><div className="table-wrap"><table className="result"><thead><tr><th>Bulan</th><th>Perwakilan</th><th>Diambil</th></tr></thead><tbody>{ownSlots.map(s => <tr key={s.id}><td>{s.month_label}</td><td>{s.owner_name || "Belum diambil"}</td><td>{formatWib(s.claimed_at)}</td></tr>)}</tbody></table></div>{c.slug === "test" && <button className="danger" onClick={resetTest}>Reset data TEST</button>}</article>; })}</section><section className="section panel"><div className="section-heading"><div><p className="eyebrow">Jejak aktivitas</p><h2>Audit log terbaru</h2></div><p>50 aktivitas terakhir dari sistem klaim.</p></div><div className="table-wrap"><table className="result"><thead><tr><th>Waktu</th><th>Nama</th><th>Aksi</th><th>Hasil</th></tr></thead><tbody>{audits.map(a => { const time = formatWibParts(a.created_at); return <tr key={a.id}><td className="audit-time"><span className="audit-date">{time.date}</span>{time.time && <span className="audit-clock">{time.time}</span>}</td><td>{a.claimant_name || "Tidak ada nama"}</td><td>{a.action}</td><td>{a.result}{a.reason ? ` (${a.reason})` : ""}</td></tr>; })}</tbody></table></div></section></main>;
}
