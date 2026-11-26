-- Function, trigger, dan index campaign di Neon. Aman dijalankan ulang.
-- Tidak menyentuh tabel auth (app_users, app_sessions, admin_users, superadmin_users).
-- Pengecekan admin dilakukan aplikasi, bukan database: tidak ada RLS dan tidak ada SECURITY DEFINER.
begin;

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_campaign_id_idx on public.audit_logs (campaign_id);
create index if not exists audit_logs_slot_id_idx on public.audit_logs (slot_id);

-- claim_slot: tolak cepat tanpa lock campaign; jalur lock membaca ulang dan mengecek semuanya.
create or replace function public.claim_slot(p_campaign_slug text,p_slot_id uuid,p_name text,p_request_id uuid) returns jsonb
language plpgsql set search_path='' as $$
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

-- reset_test_campaign: pemanggil WAJIB sudah memastikan user adalah admin.
create or replace function public.reset_test_campaign() returns jsonb
language plpgsql set search_path='' as $$
declare
  c uuid;
begin
  select id into c from public.campaigns where slug='test' for update;
  delete from public.claims where campaign_id=c;
  update public.slots set owner_name=null,claimed_at=null where campaign_id=c;
  update public.campaigns set state='scheduled',opens_at=now() where id=c;
  insert into public.audit_logs(campaign_id,action,result,reason)
  values(c,'reset','success','test reset and rescheduled');
  return jsonb_build_object('ok',true,'message','Data TEST berhasil di-reset dan dijadwalkan sekarang.');
end$$;

-- Audit setiap perubahan campaign. Aplikasi mengisi app.user_id dalam transaksi yang sama.
create or replace function public.log_campaign_update() returns trigger
language plpgsql set search_path='' as $$
declare
  actor text:=nullif(current_setting('app.user_id',true),'');
begin
  insert into public.audit_logs(campaign_id,action,result,reason)
  values(new.id,'campaign_update','success',concat_ws('; ',
    case when new.state is distinct from old.state then 'state '||old.state||' -> '||new.state end,
    case when new.opens_at is distinct from old.opens_at then 'opens_at '||old.opens_at::text||' -> '||new.opens_at::text end,
    case when new.get_amount is distinct from old.get_amount then 'get_amount '||old.get_amount::text||' -> '||new.get_amount::text end,
    case when new.name is distinct from old.name then 'name diubah' end,
    coalesce('oleh admin '||actor,'oleh sistem')));
  return null;
end$$;
drop trigger if exists campaigns_audit_update on public.campaigns;
create trigger campaigns_audit_update after update on public.campaigns
  for each row when (old.* is distinct from new.*) execute function public.log_campaign_update();

commit;
