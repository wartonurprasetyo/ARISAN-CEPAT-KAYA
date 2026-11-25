# WAR ARISAN CEPAT KAYA

## Setup gratis

1. Buat project Supabase Free, lalu buka **SQL Editor** dan jalankan file migration di `supabase/migrations/` secara berurutan. Migration terakhir (`202610270001_supabase_hardening.sql`) berisi `GRANT` eksplisit untuk tabel dan fungsi karena Supabase tidak lagi mengekspos tabel `public` ke Data API secara otomatis; project yang sudah ada wajib menjalankannya juga.
2. Di **Authentication > Users**, buat akun email/password admin. Salin UUID pengguna tersebut ke SQL Editor: `insert into public.admin_users(user_id) values ('UUID_ADMIN');`.
3. Salin `.env.example` menjadi `.env.local`, isi URL project serta **Publishable key** dari Supabase. Jangan gunakan service-role key.
4. Jalankan `npm install` dan `npm run dev`.
5. Push repository ke GitHub, impor ke Vercel, lalu masukkan dua environment variable yang sama. Vercel akan menjalankan build Next.js otomatis.

## Operasional

- `/` adalah WAR resmi. Countdown mengikuti jadwal WIB dan status `scheduled` otomatis siap diklaim saat jadwal tercapai; database dipromosikan ke `open` saat klaim pertama.
- `/test` memakai data terpisah dengan countdown dan auto-open yang sama. Reset dari panel admin mengosongkan data dan menjadwalkan TEST untuk langsung diuji kembali.
- `/admin` hanya menerima pengguna yang UUID-nya berada di `admin_users`. Status admin dicek ulang setiap halaman dimuat, dan setiap perubahan campaign dari panel admin tercatat di audit log.
- Countdown dan tombol slot memakai jam server (`server_now`), bukan jam perangkat, sehingga HP dengan jam tidak akurat tetap sinkron.
- Perubahan slot dikirim lewat Supabase Realtime per campaign. Jika koneksi realtime gagal, halaman otomatis memuat ulang data tiap 5 detik.

## Ganti password admin

Jalankan dari terminal menggunakan service role key. Jangan masukkan key atau password ke source code.

```bash
SUPABASE_URL="https://PROJECT_REF.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="ISI_DI_TERMINAL_SAJA" \
node scripts/change-admin-password.mjs admin@example.com
```

Jika email tidak diberikan, script akan memintanya secara interaktif. Password baru diminta dua kali dan tidak disimpan ke file.

## Versioning aplikasi

Versi aplikasi disimpan di `package.json` dan diekspos melalui `/version.json`.
Saat merilis perubahan, naikkan kedua nilai versi agar browser lama mendeteksi versi server dan memuat ulang bundle terbaru secara otomatis.

Supabase Free cukup untuk WAR ini, tetapi project yang tidak aktif dapat dipause. Buka halaman dan cek `/admin` sebelum acara dimulai.

Runtime yang didukung adalah Node.js 22 (dipakai Vercel). `@supabase/supabase-js` versi terbaru tidak lagi mendukung Node.js 20, meskipun build lokal di Node 20 masih berjalan dengan peringatan.
