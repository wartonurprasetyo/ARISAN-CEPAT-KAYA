# WAR ARISAN CEPAT KAYA

## Setup gratis

1. Buat project Supabase Free, lalu buka **SQL Editor** dan jalankan `supabase/migrations/202608310001_initial.sql`.
2. Di **Authentication > Users**, buat akun email/password admin. Salin UUID pengguna tersebut ke SQL Editor: `insert into public.admin_users(user_id) values ('UUID_ADMIN');`.
3. Salin `.env.example` menjadi `.env.local`, isi URL project serta **Publishable key** dari Supabase. Jangan gunakan service-role key.
4. Jalankan `npm install` dan `npm run dev`.
5. Push repository ke GitHub, impor ke Vercel, lalu masukkan dua environment variable yang sama. Vercel akan menjalankan build Next.js otomatis.

## Operasional

- `/` adalah WAR resmi. Status `scheduled` otomatis menjadi `open` saat klaim pertama setelah jadwal WIB; admin juga dapat membuka atau menutupnya manual.
- `/test` memakai data terpisah. Buka dari `/admin`, lakukan pengujian multi-browser, lalu reset dari panel admin.
- `/admin` hanya menerima pengguna yang UUID-nya berada di `admin_users`.

Supabase Free cukup untuk WAR ini, tetapi project yang tidak aktif dapat dipause. Buka halaman dan cek `/admin` sebelum acara dimulai.
# ARISAN-CEPAT-KAYA
# ARISAN-CEPAT-KAYA
