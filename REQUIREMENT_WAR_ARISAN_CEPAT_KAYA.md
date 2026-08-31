# REQUIREMENT WEBSITE — WAR ARISAN CEPAT KAYA

## 1. Tujuan
Website digunakan untuk pemilihan bulan GET dengan sistem **siapa cepat dia dapat**. Peserta memasukkan nama perwakilan lalu memilih satu bulan yang masih tersedia. Setiap bulan hanya dapat dimiliki satu orang.

Website harus menggunakan database online bersama agar status slot tersinkron antar perangkat secara real-time.

## 2. Informasi Arisan
- Nama: **WAR ARISAN CEPAT KAYA**
- GET: **Rp2.000.000/bulan**
- Periode: **November 2026 – Agustus 2027**
- Jumlah slot: **10**
- Peserta: **Nama Perwakilan**
- Batas: **1 orang hanya boleh mendapat 1 slot**
- WAR resmi: **Jumat, 2 Oktober 2026 pukul 12.00 WIB**
- Timezone: **Asia/Jakarta (WIB / UTC+7)**

## 3. Slot GET
1. November 2026
2. Desember 2026
3. Januari 2027
4. Februari 2027
5. Maret 2027
6. April 2027
7. Mei 2027
8. Juni 2027
9. Juli 2027
10. Agustus 2027

## 4. Aturan Utama
- Nama wajib diisi.
- Satu nama hanya dapat mengambil satu slot.
- Satu bulan hanya dapat diambil satu orang.
- Slot yang berhasil diambil langsung terkunci.
- Server/database menjadi sumber kebenaran utama.
- Jika dua orang klik slot yang sama hampir bersamaan, hanya satu transaksi yang boleh berhasil.
- Setelah 10 slot terisi, WAR otomatis ditutup.

## 5. Mode TEST
- Admin dapat membuka WAR secara manual untuk pengujian.
- Admin dapat melakukan reset data test.
- Test harus dapat dilakukan dari beberapa HP/browser.
- Data harus tersinkron antar perangkat.
- Tujuan test: memastikan mekanisme rebutan, locking, dan real-time berjalan benar.

## 6. Tampilan Peserta
Header:
**🔥 WAR ARISAN CEPAT KAYA 🔥**

Tampilkan:
- GET Rp2.000.000/bulan
- Periode November 2026 – Agustus 2027
- Input Nama Perwakilan
- Daftar 10 bulan dengan status TERSEDIA/TERAMBIL.

Saat belum mulai:
> 🔒 WAR BELUM DIMULAI

Saat berlangsung:
> 🔥 WAR SEDANG BERLANGSUNG!

Saat penuh:
> 🛑 WAR TELAH SELESAI!

## 7. Konfirmasi Berhasil
Setelah berhasil:
> 🎉 SELAMAT!  
> Kamu berhasil mendapatkan: **[BULAN]**  
> GET: **Rp2.000.000**  
> Nama: **[NAMA]**

## 8. Race Condition
Wajib ditangani di server/database:
- Dua peserta tidak boleh mendapatkan slot yang sama.
- Gunakan transaksi/unique constraint/atomic operation.
- Peserta yang kalah menerima pesan bahwa slot baru saja diambil orang lain.

## 9. Real-Time
Perubahan status harus muncul tanpa refresh manual pada perangkat lain.

Contoh:
HP A mengambil November → HP B otomatis melihat:
**🔴 November 2026 — TERAMBIL — Nimas**

## 10. Hasil WAR
Tampilkan:

| No | Bulan GET | Nama Perwakilan | GET |
|---:|---|---|---:|
| 1 | November 2026 | — | Rp2.000.000 |
| 2 | Desember 2026 | — | Rp2.000.000 |
| 3 | Januari 2027 | — | Rp2.000.000 |
| 4 | Februari 2027 | — | Rp2.000.000 |
| 5 | Maret 2027 | — | Rp2.000.000 |
| 6 | April 2027 | — | Rp2.000.000 |
| 7 | Mei 2027 | — | Rp2.000.000 |
| 8 | Juni 2027 | — | Rp2.000.000 |
| 9 | Juli 2027 | — | Rp2.000.000 |
| 10 | Agustus 2027 | — | Rp2.000.000 |

Total GET: **Rp20.000.000**

## 11. Admin Panel
Admin dapat:
- Membuka/menutup WAR.
- Mengubah tanggal dan jam WAR.
- Mengubah nominal GET.
- Melihat slot terisi/tersedia.
- Melihat nama perwakilan.
- Melihat timestamp pengambilan.
- Reset data TEST.
- Melihat hasil akhir.

## 12. Audit Log
Simpan:
- Nama peserta
- Slot/bulan
- Timestamp
- Status berhasil/gagal
- ID transaksi/request bila diperlukan.

## 13. Keamanan
- Peserta tidak dapat mengubah data secara langsung.
- Validasi 1 orang = 1 slot dilakukan di server/database.
- Validasi slot tersedia dilakukan di server/database.
- Admin memiliki akses khusus.
- Secret/database key tidak boleh berada di frontend.
- Gunakan environment variables.
- Gunakan Row Level Security jika memakai Supabase.

## 14. Teknologi yang Disarankan
- Frontend: React/Next.js atau framework modern.
- Database/backend: **Supabase PostgreSQL + Realtime**.
- Hosting: **Vercel**.
- Timezone: **Asia/Jakarta**.

## 15. Acceptance Criteria
- [ ] Input nama berfungsi.
- [ ] Pemilihan bulan berfungsi.
- [ ] Satu orang hanya satu slot.
- [ ] Satu bulan hanya satu orang.
- [ ] Slot terkunci setelah berhasil.
- [ ] Status tersinkron antar perangkat.
- [ ] Race condition aman.
- [ ] 10 slot penuh → WAR otomatis selesai.
- [ ] Hasil WAR tampil otomatis.
- [ ] Admin dapat reset TEST.
- [ ] Jadwal dapat dikonfigurasi.
- [ ] Responsive di HP.
- [ ] Data tersimpan di database online.
- [ ] Peserta tidak dapat memanipulasi data melalui frontend.

## 16. Prinsip Utama
**SATU ORANG = SATU SLOT**  
**SATU BULAN = SATU ORANG**  
**SIAPA CEPAT DIA DAPAT**  
**10 SLOT PENUH = WAR SELESAI**
