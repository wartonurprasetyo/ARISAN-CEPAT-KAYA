# WAR ARISAN CEPAT KAYA

Next.js 15 + Neon (Postgres). Database dan akun admin dipakai bersama dengan `compro-portal-frontend`. Browser tidak terhubung langsung ke database; semua query berjalan di server.

Tampilan memakai `@wnp_code/design-system` dengan skin claymorphism (`data-skin="clay"` di `app/layout.tsx`). Komponennya hanya boleh diimpor dari file `"use client"`.

## Setup

1. Pakai Node.js 22, lalu jalankan `pnpm install`.
2. Salin `.env.example` menjadi `.env.local` dan isi `DATABASE_URL`. Hanya untuk server: jangan diberi awalan `NEXT_PUBLIC_` dan jangan di-commit. Untuk uji coba, pakai **branch Neon terpisah**, bukan database production.
3. Jalankan `neon/002_periods.sql`, **lalu** `neon/001_campaign_functions.sql` (Neon SQL Editor atau `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>`). Keduanya aman dijalankan ulang. Tabel campaign dan tabel auth sudah ada di Neon; script ini hanya menambah kolom periode, index, function, dan trigger audit. Untuk database yang sudah berjalan: backup (atau buat branch Neon), jalankan kedua script, baru deploy aplikasi.
4. `pnpm dev` untuk lokal. Di Vercel, isi `DATABASE_URL` sebelum build; build gagal tanpa variabel itu.

Folder `supabase/migrations/` adalah riwayat skema lama dan tidak dijalankan lagi.

## Operasional

- `/` adalah WAR resmi. Countdown mengikuti jadwal WIB dan status `scheduled` otomatis siap diklaim saat jadwal tercapai; database dipromosikan ke `open` saat klaim pertama.
- `/test` memakai data terpisah dengan countdown dan auto-open yang sama. Reset dari panel admin mengosongkan data dan menjadwalkan TEST untuk langsung diuji kembali.
- Countdown dan tombol slot memakai jam server (`serverNow`), bukan jam perangkat.
- Halaman peserta memuat ulang data tiap 3 detik mulai 10 menit sebelum buka sampai slot penuh atau ditutup, dan hanya saat tab terlihat. Data publik di-cache 3 detik.
- Di luar jendela itu (status `closed`/`completed`, atau jadwal masih lama), halaman **tidak** memperbarui diri. Setelah admin membuka atau menjadwalkan ulang, peserta perlu memuat ulang halaman atau berpindah tab lalu kembali.
- Klaim dibatasi 30 percobaan per menit per IP.

## Periode

- Satu baris `campaigns` = satu periode (`period_no`). Periode terbaru adalah yang aktif; data sebelum fitur ini menjadi periode 1.
- Periode baru dibuat di `/admin` setelah periode aktif `closed` atau `completed`: isi bulan GET pertama, nominal, dan jadwal buka (harus di masa depan). 10 bulan berurutan dibuat otomatis.
- Periode lama tidak bisa diubah. Periode terbaru (selain periode 1) bisa dihapus selama belum ada klaim.
- `/riwayat` menampilkan semua periode sebelum periode aktif.
- Satu nama hanya mendapat satu slot **per periode**.
- TEST tidak memakai periode.

## Admin

- `/admin` memakai akun portal. User di `admin_users` atau `superadmin_users` otomatis admin di sini.
- Buat admin dan atur password lewat portal. Ganti password atau cabut admin mengakhiri sesi di kedua aplikasi.
- Login dibatasi 5 percobaan per 15 menit per IP + email. Sesi berlaku 7 hari.
- Panel memuat ulang data tiap 5 detik selama tab terlihat. Perubahan campaign tercatat di audit log beserta ID admin.
- Setelah cutover dari Supabase, semua admin harus login ulang.
- Cookie sesi bernama `session`. Jika WAR dan portal dipasang di host yang sama, ganti nama cookie di salah satunya.

## Test

```bash
pnpm test
```

Cek SQL (branch Neon, bukan production): `neon/001_campaign_functions.test.sql` dan `neon/002_periods.test.sql`.

## Versioning aplikasi

Versi aplikasi disimpan di `package.json` dan diekspos melalui `/version.json`.
Saat merilis perubahan, naikkan kedua nilai versi agar browser lama mendeteksi versi server dan memuat ulang bundle terbaru secara otomatis.
