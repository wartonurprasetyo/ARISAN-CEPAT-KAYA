"use client";

import { FormEvent, useEffect, useState } from "react";
import { campaignOpenDelay, getCampaignDisplayState } from "../../lib/campaign";
import { formatWib, formatWibParts } from "../../lib/format";
import { supabase } from "../../lib/supabase";

type Campaign = { id: string; slug: string; name: string; state: string; opens_at: string; get_amount: number; is_test: boolean };
type Slot = { id: string; campaign_id: string; position: number; month_label: string; owner_name: string | null; claimed_at: string | null };
type Audit = { id: number; campaign_id: string | null; claimant_name: string | null; action: string; result: string; reason: string | null; created_at: string };

const wibInput = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(" ", "T");

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    const [{ data: campaignData }, { data: slotData }, { data: auditData }] = await Promise.all([
      supabase.from("campaigns").select("id,slug,name,state,opens_at,get_amount,is_test").order("is_test"),
      supabase.from("slots").select("id,campaign_id,position,month_label,owner_name,claimed_at").order("position"),
      supabase.from("audit_logs").select("id,campaign_id,claimant_name,action,result,reason,created_at").order("created_at", { ascending: false }).limit(50)
    ]);
    setCampaigns(campaignData || []); setSlots(slotData || []); setAudits(auditData || []);
    setLoading(false);
  };

  useEffect(() => { if (supabase) supabase.auth.getUser().then(({ data }) => setUser(data.user)); }, []);
  useEffect(() => { if (user) load(); }, [user]);

  useEffect(() => {
    const delays = campaigns
      .map(campaign => campaignOpenDelay(campaign, now))
      .filter((delay): delay is number => delay !== null && delay > 0);
    if (delays.length === 0) return;

    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.min(...delays) + 50, 2147483647));
    return () => window.clearTimeout(timer);
  }, [campaigns, now]);

  async function login(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setNotice(error.message);
    const { data } = await supabase.auth.getUser();
    const { data: admin } = await supabase.from("admin_users").select("user_id").eq("user_id", data.user?.id || "").maybeSingle();
    if (!admin) { await supabase.auth.signOut(); return setNotice("Akun ini bukan admin."); }
    setUser(data.user); setNotice("");
  }

  async function setState(c: Campaign, state: string) {
    if (!supabase) return;
    const { error } = await supabase.from("campaigns").update({ state }).eq("id", c.id);
    setNotice(error ? error.message : `${c.name}: ${state}`); load();
  }

  async function saveCampaign(e: FormEvent<HTMLFormElement>, c: Campaign) {
    e.preventDefault(); if (!supabase) return;
    const form = new FormData(e.currentTarget); const get_amount = Number(form.get("amount")); const raw = String(form.get("opens_at"));
    if (!Number.isInteger(get_amount) || get_amount <= 0 || !raw) return setNotice("Nominal dan jadwal wajib valid.");
    const { error } = await supabase.from("campaigns").update({ get_amount, opens_at: new Date(`${raw}:00+07:00`).toISOString() }).eq("id", c.id);
    setNotice(error ? error.message : "Konfigurasi tersimpan."); load();
  }

  async function resetTest() {
    if (!supabase || !confirm("Reset semua data TEST?")) return;
    const { data, error } = await supabase.rpc("reset_test_campaign");
    setNotice(error ? error.message : data?.message || "TEST di-reset."); load();
  }

  async function logout() { if (!supabase) return; await supabase.auth.signOut(); setUser(null); }

  if (!supabase) return <main className="wrap admin-page"><section className="panel"><p className="eyebrow">Konfigurasi</p><h1>Supabase belum dikonfigurasi.</h1></section></main>;
  if (!user) return <main className="wrap admin-page"><header className="admin-header"><div><p className="eyebrow">Akses terbatas</p><h1>Admin WAR</h1></div><a href="/">Kembali ke WAR</a></header><form className="panel" onSubmit={login}><div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div><div className="field"><label htmlFor="password">Password</label><input id="password" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div><button className="primary wide" type="submit">Masuk</button>{notice && <p className="error">{notice}</p>}</form></main>;

  return <main className="wrap admin-page"><header className="admin-header"><div><p className="eyebrow">Panel operasional</p><h1>Admin WAR</h1><p className="admin-user">{user.email}</p></div><div className="button-row"><a className="secondary" href="/">Lihat WAR</a><button className="secondary" onClick={logout}>Keluar</button></div></header>{notice && <div className="status warn" role="status"><span className="status-mark" aria-hidden="true" />{notice}</div>}{loading ? <div className="section skeleton" aria-label="Memuat data admin" /> : <><section className="section campaign-grid">{campaigns.map(c => { const ownSlots = slots.filter(s => s.campaign_id === c.id); const taken = ownSlots.filter(s => s.owner_name).length; const displayState = getCampaignDisplayState(c, now); return <article className="panel campaign-card" key={c.id}><div><p className="eyebrow">{c.slug === "test" ? "Mode test" : "WAR resmi"}</p><h2>{c.name}</h2><p className="stats-line"><span><strong>{taken}/10</strong> slot terisi</span><span>Status: <strong>{displayState}</strong></span></p></div><form onSubmit={e => saveCampaign(e, c)}><div className="field"><label htmlFor={`amount-${c.id}`}>Nominal GET</label><input id={`amount-${c.id}`} className="input" name="amount" type="number" min="1" defaultValue={c.get_amount} /></div><div className="field"><label htmlFor={`opens-${c.id}`}>Jadwal buka WIB</label><input id={`opens-${c.id}`} className="input" name="opens_at" type="datetime-local" defaultValue={wibInput(c.opens_at)} /></div><button className="primary" type="submit">Simpan konfigurasi</button></form><div className="button-row"><button className="secondary" onClick={() => setState(c, "open")}>Buka</button><button className="secondary" onClick={() => setState(c, "closed")}>Tutup</button><button className="secondary" onClick={() => setState(c, "scheduled")}>Jadwalkan</button></div><div className="table-wrap"><table className="result"><thead><tr><th>Bulan</th><th>Perwakilan</th><th>Diambil</th></tr></thead><tbody>{ownSlots.map(s => <tr key={s.id}><td>{s.month_label}</td><td>{s.owner_name || "Belum diambil"}</td><td>{formatWib(s.claimed_at)}</td></tr>)}</tbody></table></div>{c.slug === "test" && <button className="danger" onClick={resetTest}>Reset data TEST</button>}</article>; })}</section><section className="section panel"><div className="section-heading"><div><p className="eyebrow">Jejak aktivitas</p><h2>Audit log terbaru</h2></div><p>50 aktivitas terakhir dari sistem klaim.</p></div><div className="table-wrap"><table className="result"><thead><tr><th>Waktu</th><th>Nama</th><th>Aksi</th><th>Hasil</th></tr></thead><tbody>{audits.map(a => { const time = formatWibParts(a.created_at); return <tr key={a.id}><td className="audit-time"><span className="audit-date">{time.date}</span>{time.time && <span className="audit-clock">{time.time}</span>}</td><td>{a.claimant_name || "Tidak ada nama"}</td><td>{a.action}</td><td>{a.result}{a.reason ? ` (${a.reason})` : ""}</td></tr>; })}</tbody></table></div></section></>}</main>;
}
