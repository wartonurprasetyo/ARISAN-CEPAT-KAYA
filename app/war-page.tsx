"use client";

import { useCallback, useEffect, useState } from "react";
import { rupiah } from "../lib/format";
import { supabase } from "../lib/supabase";

type Campaign = { id: string; name: string; get_amount: number; opens_at: string; state: string; is_test: boolean };
type Slot = { id: string; position: number; month_label: string; owner_name: string | null; claimed_at: string | null };

export function WarPage({ campaignSlug, modeLabel }: { campaignSlug: string; modeLabel: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("Memuat status WAR...");
  const [messageClass, setMessageClass] = useState("warn");
  const [winner, setWinner] = useState<(Slot & { claimantName: string }) | null>(null);

  const load = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    const { data: currentCampaign } = await client.from("campaigns").select("id,name,get_amount,opens_at,state,is_test").eq("slug", campaignSlug).single();
    if (!currentCampaign) return;
    setCampaign(currentCampaign);
    const { data: currentSlots } = await client.from("slots").select("id,position,month_label,owner_name,claimed_at").eq("campaign_id", currentCampaign.id).order("position");
    setSlots(currentSlots || []);
  }, [campaignSlug]);

  useEffect(() => {
    load();
    const client = supabase;
    if (!client) return;
    const channel = client.channel(`war-${campaignSlug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "slots" }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "campaigns" }, load)
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [campaignSlug, load]);

  const filled = slots.filter(slot => slot.owner_name).length;
  const isOpen = campaign?.state === "open" || (!campaign?.is_test && campaign?.state === "scheduled" && Date.now() >= new Date(campaign.opens_at).getTime());
  const isDone = campaign?.state === "completed" || filled === 10;

  useEffect(() => {
    if (!supabase) { setMessage("Konfigurasi Supabase belum tersedia."); setMessageClass("closed-msg"); }
    else if (isDone) { setMessage("🛑 WAR TELAH SELESAI! Seluruh 10 slot sudah terisi."); setMessageClass("closed-msg"); }
    else if (isOpen) { setMessage(`🔥 WAR SEDANG BERLANGSUNG! ${filled}/10 slot terisi.`); setMessageClass("ok"); }
    else { setMessage("🔒 WAR BELUM DIMULAI"); setMessageClass("warn"); }
  }, [filled, isDone, isOpen]);

  async function take(slot: Slot) {
    const client = supabase;
    if (!client || !campaign) return;
    const claimantName = name.trim();
    if (!claimantName) { setMessage("Masukkan nama perwakilan terlebih dahulu."); setMessageClass("warn"); return; }
    const { data, error } = await client.rpc("claim_slot", { p_campaign_slug: campaignSlug, p_slot_id: slot.id, p_name: claimantName, p_request_id: crypto.randomUUID() });
    if (error) { setMessage("Koneksi gagal. Silakan coba lagi."); setMessageClass("closed-msg"); return; }
    if (data?.ok) { setWinner({ ...slot, claimantName }); setName(""); setMessage("🎉 Klaim berhasil tersimpan."); setMessageClass("ok"); await load(); }
    else { setMessage(data?.message || "Slot baru saja diambil orang lain."); setMessageClass("warn"); await load(); }
  }

  return <main className="wrap"><section className="hero"><h1>🔥 WAR ARISAN CEPAT KAYA 🔥</h1><p><b>GET {campaign ? rupiah(campaign.get_amount) : "…"} / bulan</b></p><p>Periode: November 2026 – Agustus 2027</p><p className="muted">{modeLabel}</p><nav className="nav"><a href="/">WAR resmi</a><a href="/test">TEST</a><a href="/admin">Admin</a></nav></section><section className="card"><label htmlFor="name">Nama Perwakilan</label><input id="name" className="input" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Masukkan nama perwakilan" disabled={!isOpen} /><div className={`msg ${messageClass}`}>{message}</div></section><section className="card"><h2 style={{ marginTop: 0 }}>⚡ PILIH BULAN GET</h2><div className="grid">{slots.map(slot => { const taken = Boolean(slot.owner_name); return <button key={slot.id} className={`slot ${taken ? "taken" : isOpen ? "" : "closed"}`} disabled={taken || !isOpen} onClick={() => take(slot)}><b>{slot.position}. {slot.month_label}</b><span>{taken ? `🔴 TERAMBIL — ${slot.owner_name}` : `🟢 ${campaign ? rupiah(campaign.get_amount) : ""} — AMBIL`}</span></button>; })}</div></section><section className="card"><h2 style={{ marginTop: 0 }}>🏆 HASIL WAR ARISAN CEPAT KAYA</h2><div className="table-wrap"><table className="result"><thead><tr><th>No</th><th>Bulan GET</th><th>Perwakilan</th><th>GET</th></tr></thead><tbody>{slots.map(slot => <tr key={slot.id}><td>{slot.position}</td><td>{slot.month_label}</td><td>{slot.owner_name || "—"}</td><td>{campaign ? rupiah(campaign.get_amount) : "…"}</td></tr>)}</tbody></table></div><div className="total">Total GET: {campaign ? rupiah(campaign.get_amount * 10) : "…"}</div></section>{winner && campaign && <div className="modal-backdrop" role="dialog"><div className="modal"><h2>🎉 SELAMAT!</h2><p>Kamu berhasil mendapatkan: <b>{winner.month_label}</b></p><p>GET: <b>{rupiah(campaign.get_amount)}</b><br />Nama: <b>{winner.claimantName}</b></p><button className="primary" onClick={() => setWinner(null)}>Tutup</button></div></div>}</main>;
}
