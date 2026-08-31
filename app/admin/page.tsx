"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatWib } from "../../lib/format";
import { supabase } from "../../lib/supabase";

type Campaign = { id: string; slug: string; name: string; state: string; opens_at: string; get_amount: number };
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

  const load = async () => {
    if (!supabase) return;
    const [{ data: campaignData }, { data: slotData }, { data: auditData }] = await Promise.all([
      supabase.from("campaigns").select("id,slug,name,state,opens_at,get_amount").order("is_test"),
      supabase.from("slots").select("id,campaign_id,position,month_label,owner_name,claimed_at").order("position"),
      supabase.from("audit_logs").select("id,campaign_id,claimant_name,action,result,reason,created_at").order("created_at", { ascending: false }).limit(50)
    ]);
    setCampaigns(campaignData || []);
    setSlots(slotData || []);
    setAudits(auditData || []);
  };

  useEffect(() => { if (supabase) supabase.auth.getUser().then(({ data }) => setUser(data.user)); }, []);
  useEffect(() => { if (user) load(); }, [user]);

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

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  }

  if (!supabase) return <main className="wrap"><section className="card">Supabase belum dikonfigurasi.</section></main>;
  if (!user) return <main className="wrap"><section className="hero"><h1>Admin WAR</h1></section><form className="card" onSubmit={login}><label>Email</label><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /><label>Password</label><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required /><button className="primary">Masuk</button>{notice && <p className="error">{notice}</p>}</form></main>;

  return <main className="wrap"><section className="hero"><h1>Admin WAR</h1><p>{user.email}</p></section>{notice && <div className="msg warn">{notice}</div>}{campaigns.map(c => { const ownSlots = slots.filter(s => s.campaign_id === c.id); const taken = ownSlots.filter(s => s.owner_name).length; return <section className="card" key={c.id}><h2>{c.name}</h2><p><b>{taken}/10 slot terisi</b> · Status: <b>{c.state}</b></p><form onSubmit={e => saveCampaign(e, c)}><label>Nominal GET</label><input className="input" name="amount" type="number" min="1" defaultValue={c.get_amount} /><label>Jadwal buka (WIB)</label><input className="input" name="opens_at" type="datetime-local" defaultValue={wibInput(c.opens_at)} /><button className="primary">Simpan jadwal & nominal</button></form><div className="row"><button className="secondary" onClick={() => setState(c, "open")}>Buka</button><button className="secondary" onClick={() => setState(c, "closed")}>Tutup</button><button className="secondary" onClick={() => setState(c, "scheduled")}>Jadwalkan</button></div><div className="table-wrap"><table className="result"><thead><tr><th>Bulan</th><th>Perwakilan</th><th>Diambil</th></tr></thead><tbody>{ownSlots.map(s => <tr key={s.id}><td>{s.month_label}</td><td>{s.owner_name || "—"}</td><td>{formatWib(s.claimed_at)}</td></tr>)}</tbody></table></div>{c.slug === "test" && <button className="primary danger" onClick={resetTest}>🔄 Reset data TEST</button>}</section> })}<section className="card"><h2>Audit log terbaru</h2><div className="table-wrap"><table className="result"><thead><tr><th>Waktu</th><th>Nama</th><th>Aksi</th><th>Hasil</th></tr></thead><tbody>{audits.map(a => <tr key={a.id}><td>{formatWib(a.created_at)}</td><td>{a.claimant_name || "—"}</td><td>{a.action}</td><td>{a.result}{a.reason ? ` (${a.reason})` : ""}</td></tr>)}</tbody></table></div></section><button className="primary" onClick={logout}>Keluar</button></main>;
}
