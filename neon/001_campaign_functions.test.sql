-- Cek mandiri function campaign. Memakai campaign TEST dan di-ROLLBACK di akhir.
-- Jalankan di branch Neon (bukan production, baris TEST terkunci selama script berjalan):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f neon/001_campaign_functions.test.sql
begin;

do $$
declare
  c uuid;
  slot uuid[];
  r jsonb;
  admin_id constant text:='00000000-0000-0000-0000-000000000001';
begin
  select id into c from public.campaigns where slug='test';
  update public.campaigns set state='closed' where id=c;
  select array_agg(id order by "position") into slot from public.slots where campaign_id=c;

  perform public.reset_test_campaign();
  assert exists(select 1 from public.audit_logs where campaign_id=c and reason like '%oleh sistem'), 'trigger sistem';

  r:=public.claim_slot('test',slot[1],'Uji Satu',gen_random_uuid());
  assert (r->>'ok')::boolean, r::text;
  assert (select state from public.campaigns where id=c)='open', 'auto-open';
  assert (select owner_name from public.slots where id=slot[1])='Uji Satu', 'slot terisi';
  assert public.claim_slot('test',slot[1],'Uji Dua',gen_random_uuid())->>'code'='slot_taken';
  assert public.claim_slot('test',slot[2],'  uji   SATU ',gen_random_uuid())->>'code'='name_already_claimed';
  assert public.claim_slot('test',slot[2],'   ',gen_random_uuid())->>'code'='invalid_name';
  assert public.claim_slot('test',null,'Uji',gen_random_uuid())->>'code'='invalid_slot';
  assert public.claim_slot('lain',slot[2],'Uji',gen_random_uuid())->>'code'='not_found';

  for i in 2..10 loop
    assert (public.claim_slot('test',slot[i],'Uji '||i,gen_random_uuid())->>'ok')::boolean, 'slot '||i;
  end loop;
  assert (select state from public.campaigns where id=c)='completed', 'completed';
  assert public.claim_slot('test',slot[1],'Uji Telat',gen_random_uuid())->>'code'='war_closed';

  perform set_config('app.user_id',admin_id,true);
  update public.campaigns set state='closed' where id=c;
  assert exists(select 1 from public.audit_logs where campaign_id=c and reason='state completed -> closed; oleh admin '||admin_id), 'trigger admin';

  perform public.reset_test_campaign();
  assert not exists(select 1 from public.claims where campaign_id=c), 'claims kosong';
  assert not exists(select 1 from public.slots where campaign_id=c and owner_name is not null), 'slot kosong';
  raise notice 'LULUS';
end$$;

rollback;
