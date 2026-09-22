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
