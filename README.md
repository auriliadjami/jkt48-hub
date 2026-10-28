# JKT48HUB — Live, Jadwal, Replay & Admin CMS

Website fan-made dengan halaman publik dan panel admin mandiri. Dibuat menggunakan Node.js bawaan (tanpa dependency npm eksternal) agar mudah dijalankan di komputer sendiri atau server Node yang mendukung penyimpanan persisten.

## Fitur

- Halaman publik responsif: Live & Upcoming, Replay Library dengan pencarian, jadwal, berita, banner pengumuman, dan player.
- Admin CMS: setup akun pertama kali, login/logout, dashboard ringkasan, CRUD show, CRUD berita/pengumuman, publikasi/draft, pengaturan identitas dan banner website, pengaturan tautan sosial, ubah password.
- Mendukung URL YouTube, HLS `.m3u8`, MP4, dan WebM pada player.
- Data disimpan di `data/db.json` secara otomatis.
- Proteksi session cookie HttpOnly, SameSite Strict, password hash scrypt, batas percobaan login, validasi input, dan security headers dasar.

## Jalankan di komputer

Persyaratan: Node.js versi 20 atau lebih baru.

```bash
npm start
```

Buka `http://localhost:3000` untuk halaman publik dan `http://localhost:3000/admin` untuk panel admin.

Saat pertama kali membuka `/admin`, website akan meminta kamu membuat username dan password admin. Password minimal 12 karakter. Tidak ada password admin default.

## Deploy di server

Deploy sebagai **aplikasi Node.js yang berjalan terus-menerus** (misalnya VPS atau layanan hosting Node yang menyediakan persistent disk/volume). File `render.yaml` disertakan sebagai blueprint awal untuk Render; sesuaikan paket/disk dengan kebutuhan penyedia hosting. Start command:

```bash
npm start
```

Set environment variable `NODE_ENV=production`. Jika ingin menyimpan database di disk terpisah, set `DATA_DIR` ke direktori persisten yang dapat ditulis oleh aplikasi. Hosting harus menyediakan persistent storage karena file database JSON perlu bertahan setelah proses restart atau deploy.

> Jangan deploy sebagai static-only hosting: panel admin dan API memerlukan server Node.js. Pada layanan serverless dengan filesystem sementara, data bisa hilang setelah restart.

## Menambahkan stream

1. Login ke `/admin`.
2. Buka **Live, jadwal & replay** → **Tambah show**.
3. Isi judul, jenis konten, jadwal, member/lineup, deskripsi, lalu URL stream.
4. Centang **Publikasikan di website** dan simpan.

Player halaman web mendukung tautan video langsung `.m3u8`, `.mp4`, `.webm`, atau tautan YouTube. Stream HLS bergantung pada dukungan browser dan kebijakan CORS dari penyedia stream. Beberapa situs tidak mengizinkan embed, sehingga tautan tersebut mungkin harus dibuka pada tab baru atau memakai metode embed resmi dari providernya.

Gunakan hanya stream, arsip, gambar, dan materi yang kamu miliki atau diizinkan untuk ditampilkan. Website ini tidak mengambil atau melewati proteksi stream dari pihak lain.

## Keamanan & backup

- Pilih password admin unik yang kuat dan ubah jika diduga diketahui pihak lain.
- Database berada di `data/db.json` secara default. Backup file tersebut secara berkala; file itu berisi konfigurasi admin dan seluruh konten.
- Session disimpan dalam memori server dan pengguna perlu login ulang ketika server restart.
- Letakkan aplikasi di belakang HTTPS saat dipublikasikan di internet. Dalam mode `NODE_ENV=production`, cookie sesi ditandai `Secure`.

## Catatan kemiripan

URL referensi yang diberikan hanya menampilkan judul halaman, tautan Admin, dan teks pemuatan saat diperiksa melalui tampilan yang tersedia. Karena source code asli tidak tersedia, paket ini merupakan implementasi mandiri dengan fungsi yang sejalan dan gaya visual fan-hub gelap/merah, bukan salinan pixel-perfect dari sumber.
