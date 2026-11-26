-- Cek mandiri periode. Memakai campaign resmi dan di-ROLLBACK di akhir.
-- Jalankan HANYA di branch Neon (bukan production, baris campaign resmi terkunci selama script berjalan):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f neon/002_periods.test.sql
begin;

do $$
declare
  old_id uuid;
  new_id uuid;
  old_slot uuid;
  new_slot uuid;
  n integer;
  r jsonb;
begin
  select id,period_no into old_id,n from public.campaigns where slug='official' order by period_no desc limit 1;
  select id into old_slot from public.slots where campaign_id=old_id order by "position" limit 1;

  -- Periode baru ditolak selama periode lama masih hidup.
  update public.campaigns set state='scheduled' where id=old_id;
  begin
    insert into public.campaigns(slug,period_no,name,get_amount,opens_at,state) values('official',n+1,'uji',1,now(),'scheduled');
    raise exception 'dua periode hidup lolos';
  exception when unique_violation then null;
  end;
  begin
    insert into public.campaigns(slug,period_no,name,get_amount,opens_at,state,is_test) values('test',2,'uji',1,now(),'closed',true);
    raise exception 'periode TEST kedua lolos';
  exception when check_violation then null;
  end;

  -- Nama uji sudah menang di periode lama, lalu boleh menang lagi di periode baru.
  update public.slots set owner_name=null,claimed_at=null where id=old_slot;
  delete from public.claims where slot_id=old_slot;
  update public.campaigns set state='open' where id=old_id;
  r:=public.claim_slot('official',old_slot,'Uji Periode',gen_random_uuid());
  assert (r->>'ok')::boolean, r::text;
  update public.campaigns set state='closed' where id=old_id;

  insert into public.campaigns(slug,period_no,name,get_amount,opens_at,state)
  values('official',n+1,'uji',1,now()+interval '1 day','scheduled') returning id into new_id;
  insert into public.slots(campaign_id,"position",month_label) values(new_id,1,'Uji') returning id into new_slot;

  assert public.claim_slot('official',old_slot,'Uji Lain',gen_random_uuid())->>'code'='period_changed', 'slot periode lama';
  assert public.claim_slot('official',gen_random_uuid(),'Uji Lain',gen_random_uuid())->>'code'='period_changed', 'slot terhapus';
  assert public.claim_slot('official',new_slot,'Uji Periode',gen_random_uuid())->>'code'='war_closed', 'belum buka';
  update public.campaigns set opens_at=now() where id=new_id;
  r:=public.claim_slot('official',new_slot,'Uji Periode',gen_random_uuid());
  assert (r->>'ok')::boolean, r::text;
  assert (select state from public.campaigns where id=old_id)='closed', 'periode lama tidak tersentuh';
  raise notice 'LULUS';
end$$;

rollback;
