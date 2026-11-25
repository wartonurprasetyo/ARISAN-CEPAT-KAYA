-- Hardening & optimasi Supabase. Semua statement aman dijalankan ulang.

-- 1) Privilege Data API eksplisit. Sejak 2026-10-30 tabel public tidak lagi otomatis
--    terekspos ke Data API; INSERT/DELETE bawaan untuk anon/authenticated juga dicabut.
revoke all on table public.campaigns, public.slots, public.claims, public.audit_logs, public.admin_users
  from anon, authenticated;
grant select on table public.campaigns, public.slots to anon, authenticated;
grant select on table public.claims, public.audit_logs, public.admin_users to authenticated;
grant update (name, get_amount, opens_at, state) on table public.campaigns to authenticated;

-- 2) Index untuk audit log (admin membaca 50 terbaru) dan kolom FK.
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_campaign_id_idx on public.audit_logs (campaign_id);
create index if not exists audit_logs_slot_id_idx on public.audit_logs (slot_id);

-- 3) Fungsi helper: search_path kosong, auth.uid() dievaluasi sekali.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.admin_users where user_id=(select auth.uid()))
$$;

create or replace function public.server_now() returns timestamptz
language sql stable set search_path='' as $$ select now() $$;

-- 4) Policy RLS: hanya authenticated yang mengevaluasi is_admin(), dibungkus select agar
--    dihitung sekali per statement. ALTER (bukan DROP) agar tidak ada celah tanpa policy.
alter policy "admins read claims" on public.claims to authenticated using ((select public.is_admin()));
alter policy "admins read audit" on public.audit_logs to authenticated using ((select public.is_admin()));
alter policy "admins read selves" on public.admin_users to authenticated using (user_id=(select auth.uid()));
alter policy "admins update campaigns" on public.campaigns to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- 5) claim_slot: tolak cepat tanpa lock campaign; jalur lock membaca ulang dan mengecek semuanya.
create or replace function public.claim_slot(p_campaign_slug text,p_slot_id uuid,p_name text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  c public.campaigns%rowtype;
  s public.slots%rowtype;
  clean_name text:=coalesce(btrim(p_name),'');
  normalized text:=lower(regexp_replace(clean_name,'[[:space:]]+',' ','g'));
  claim_id uuid;
  filled integer;
begin
  if clean_name='' or length(clean_name)>80 then
    return jsonb_build_object('ok',false,'code','invalid_name','message','Nama perwakilan wajib diisi (maks. 80 karakter).');
  end if;
  if p_slot_id is null or p_request_id is null then
    return jsonb_build_object('ok',false,'code','invalid_slot','message','Slot tidak valid.');
  end if;

  -- Jalur cepat (tanpa lock): hasil hanya dipakai untuk menolak.
  select * into c from public.campaigns where slug=p_campaign_slug;
  if not found then
    return jsonb_build_object('ok',false,'code','not_found','message','WAR tidak ditemukan.');
  end if;
  if c.state in ('closed','completed') or (c.state='scheduled' and now()<c.opens_at) then
    insert into public.audit_logs(campaign_id,slot_id,request_id,claimant_name,action,result,reason)
    values(c.id,p_slot_id,p_request_id,clean_name,'claim','failed','war_closed');
    return jsonb_build_object('ok',false,'code','war_closed','message','WAR belum dibuka atau telah ditutup.');
  end if;

  -- Jalur lock: baca ulang otoritatif.
  select * into c from public.campaigns where id=c.id for update;
  if c.state='scheduled' and now()>=c.opens_at then
    update public.campaigns set state='open' where id=c.id;
    c.state:='open';
  end if;
  if c.state<>'open' then
    insert into public.audit_logs(campaign_id,slot_id,request_id,claimant_name,action,result,reason)
    values(c.id,p_slot_id,p_request_id,clean_name,'claim','failed','war_closed');
    return jsonb_build_object('ok',false,'code','war_closed','message','WAR belum dibuka atau telah ditutup.');
  end if;
  select * into s from public.slots where id=p_slot_id and campaign_id=c.id for update;
  if not found then
    return jsonb_build_object('ok',false,'code','invalid_slot','message','Slot tidak valid.');
  end if;
  if s.owner_name is not null then
    insert into public.audit_logs(campaign_id,slot_id,request_id,claimant_name,action,result,reason)
    values(c.id,s.id,p_request_id,clean_name,'claim','failed','slot_taken');
    return jsonb_build_object('ok',false,'code','slot_taken','message','Slot ini baru saja diambil orang lain.');
  end if;
  if exists(select 1 from public.claims where campaign_id=c.id and claimant_normalized=normalized) then
    insert into public.audit_logs(campaign_id,slot_id,request_id,claimant_name,action,result,reason)
    values(c.id,s.id,p_request_id,clean_name,'claim','failed','name_already_claimed');
    return jsonb_build_object('ok',false,'code','name_already_claimed','message','Nama ini sudah mendapatkan satu slot.');
  end if;
  insert into public.claims(campaign_id,slot_id,claimant_name,claimant_normalized,request_id)
  values(c.id,s.id,clean_name,normalized,p_request_id) returning id into claim_id;
  update public.slots set owner_name=clean_name,claimed_at=now() where id=s.id;
  select count(*) into filled from public.slots where campaign_id=c.id and owner_name is not null;
  if filled=10 then
    update public.campaigns set state='completed' where id=c.id;
  end if;
  insert into public.audit_logs(campaign_id,slot_id,request_id,claimant_name,action,result)
  values(c.id,s.id,p_request_id,clean_name,'claim','success');
  return jsonb_build_object('ok',true,'claim_id',claim_id,'month_label',s.month_label);
exception when unique_violation then
  insert into public.audit_logs(campaign_id,slot_id,request_id,claimant_name,action,result,reason)
  values(c.id,p_slot_id,p_request_id,clean_name,'claim','failed','race_conflict');
  return jsonb_build_object('ok',false,'code','race_conflict','message','Slot atau nama baru saja dipakai peserta lain.');
end$$;

-- 6) reset_test_campaign: body sama dengan migrasi sebelumnya, hanya search_path berubah.
create or replace function public.reset_test_campaign() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  c uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select id into c from public.campaigns where slug='test' for update;
  delete from public.claims where campaign_id=c;
  update public.slots set owner_name=null,claimed_at=null where campaign_id=c;
  update public.campaigns set state='scheduled',opens_at=now() where id=c;
  insert into public.audit_logs(campaign_id,action,result,reason)
  values(c,'reset','success','test reset and rescheduled');
  return jsonb_build_object('ok',true,'message','Data TEST berhasil di-reset dan dijadwalkan sekarang.');
end$$;

-- 7) Audit setiap perubahan campaign (update admin via REST, auto-open, completed, reset).
--    Harus security definer: authenticated tidak punya INSERT ke audit_logs.
create or replace function public.log_campaign_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_logs(campaign_id,action,result,reason)
  values(new.id,'campaign_update','success',concat_ws('; ',
    case when new.state is distinct from old.state then 'state '||old.state||' -> '||new.state end,
    case when new.opens_at is distinct from old.opens_at then 'opens_at '||old.opens_at::text||' -> '||new.opens_at::text end,
    case when new.get_amount is distinct from old.get_amount then 'get_amount '||old.get_amount::text||' -> '||new.get_amount::text end,
    case when new.name is distinct from old.name then 'name diubah' end,
    case when auth.uid() is null then 'oleh sistem' else 'oleh admin '||auth.uid()::text end));
  return null;
end$$;
drop trigger if exists campaigns_audit_update on public.campaigns;
create trigger campaigns_audit_update after update on public.campaigns
  for each row when (old.* is distinct from new.*) execute function public.log_campaign_update();

-- 8) Privilege fungsi. CREATE OR REPLACE mempertahankan EXECUTE ke PUBLIC, jadi cabut eksplisit.
revoke all on function public.is_admin(), public.claim_slot(text,uuid,text,uuid), public.reset_test_campaign(),
  public.server_now(), public.log_campaign_update() from public, anon, authenticated;
grant execute on function public.claim_slot(text,uuid,text,uuid), public.server_now() to anon, authenticated;
grant execute on function public.is_admin(), public.reset_test_campaign() to authenticated;

notify pgrst, 'reload schema';
