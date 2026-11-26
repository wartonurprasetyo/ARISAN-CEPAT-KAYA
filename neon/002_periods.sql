-- Periode: satu baris campaigns = satu periode; periode aktif = period_no tertinggi per slug.
-- Data yang sudah ada otomatis menjadi periode 1. Aman dijalankan ulang.
-- Jalankan file ini lebih dulu, lalu 001_campaign_functions.sql (claim_slot membaca period_no).
begin;

alter table public.campaigns add column if not exists period_no integer not null default 1 check (period_no > 0);
alter table public.campaigns drop constraint if exists campaigns_slug_key;
create unique index if not exists campaigns_slug_period_key on public.campaigns (slug, period_no);
-- Mustahil ada dua periode yang hidup bersamaan.
create unique index if not exists campaigns_one_live_per_slug on public.campaigns (slug) where state in ('scheduled','open');
-- reset_test_campaign mengandaikan TEST hanya satu baris.
alter table public.campaigns drop constraint if exists campaigns_test_single_period;
alter table public.campaigns add constraint campaigns_test_single_period check (slug <> 'test' or period_no = 1);

commit;
