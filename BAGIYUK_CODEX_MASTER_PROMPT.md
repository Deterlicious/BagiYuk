# Master Prompt untuk Codex Desktop — BagiYuk

Gunakan skill **`$bagiyuk-senior-fullstack-builder`** dan ikuti seluruh instruksinya.

Saya ingin kamu membangun MVP web app **BagiYuk** di repository/folder yang sedang terbuka. Bertindaklah sebagai senior full-stack engineer, product engineer, dan design engineer. Jangan hanya membuat mockup atau landing page; selesaikan alur produk utama sampai bisa digunakan dan diuji.

## Tujuan produk

BagiYuk membantu kelompok membagi tagihan makan berdasarkan item masing-masing, termasuk item bersama, pajak, biaya layanan, diskon, pembulatan, dan total per orang.

Alur utamanya:

1. Pengguna mengambil foto atau upload struk.
2. AI/OCR mencoba membaca item dan harga.
3. Pengguna wajib memeriksa serta mengedit hasil.
4. Pengguna menambahkan anggota.
5. Pengguna menentukan pemilik setiap item.
6. Aplikasi menghitung total setiap orang secara deterministik.
7. Pengguna menyalin atau membagikan hasil melalui HP.

Aplikasi harus tetap berfungsi penuh dengan **input manual** saat AI belum dikonfigurasi, gagal, atau kuotanya habis.

## Instruksi kerja

1. Periksa isi repository terlebih dahulu. Jangan menimpa pekerjaan yang sudah bagus.
2. Baca `AGENTS.md` dan semua dokumentasi proyek bila tersedia.
3. Buat atau perbarui `docs/implementation-plan.md` sebelum implementasi besar.
4. Gunakan **pnpm** dan paket stabil terbaru yang saling kompatibel. Jangan gunakan beta/canary/RC.
5. Catat versi final di `docs/stack-versions.md`.
6. Jika repository masih kosong, gunakan:
   - Next.js App Router.
   - React.
   - TypeScript strict.
   - Tailwind CSS.
   - shadcn dengan Base UI.
   - Lucide.
   - Motion secukupnya.
   - Zod.
   - Cloudflare Workers/OpenNext.
7. Prioritaskan deployment ke Cloudflare Workers dan pastikan `pnpm preview` menguji runtime `workerd`.
8. Jangan menaruh secret atau API key di browser.
9. Jangan menambahkan login, payment gateway, dashboard keuangan, atau fitur di luar MVP.
10. Jangan berhenti hanya karena credential Cloudflare/AI belum tersedia. Buat provider interface, mock provider, `.env.example`, dan manual fallback.
11. Kerjakan dalam urutan:
    - Fondasi dan design system.
    - Domain calculation + unit tests.
    - Alur manual lengkap.
    - OCR/AI.
    - PWA, share, accessibility, polish.
    - Build, preview, dan dokumentasi.
12. Jangan meminta konfirmasi untuk keputusan kecil yang sudah dijelaskan dalam skill. Tanyakan hanya bila benar-benar terblokir oleh pilihan produk yang tidak dapat diputuskan dari PRD.

## Desain

Gunakan arah visual **“Warm Ledger”** dari skill:

- Profesional, hangat, jelas, dan mobile-first.
- Latar warm ivory, primary deep green, coral sebagai aksen kecil.
- Tipografi Plus Jakarta Sans.
- Elemen harga menggunakan tabular numerals.
- Receipt motif yang halus dan relevan.
- Sticky bottom CTA di HP.
- Tombol sentuh nyaman.
- Fokus utama pada upload, verifikasi, pembagian, dan hasil.

Jangan gunakan desain default AI seperti purple neon gradient, glassmorphism berlebihan, glowing blobs, dashboard palsu, hero terlalu kosong, semua elemen berbentuk pill, ilustrasi stok, atau copy pemasaran generik.

Homepage harus memakai copy:

- Judul: **“Bagi tagihan tanpa hitung ulang.”**
- Subjudul: **“Foto struk, pilih pesanan, dan lihat total setiap orang—termasuk pajak dan biaya layanan.”**
- CTA utama: **“Mulai bagi tagihan”**
- CTA sekunder: **“Coba data contoh”**

## Kualitas perhitungan

- Semua nominal rupiah disimpan sebagai integer.
- Jangan memakai floating-point untuk uang.
- AI tidak boleh menentukan hasil akhir.
- Item bersama dibagi dengan algoritma remainder yang deterministik.
- Pajak dan biaya layanan dibagikan proporsional terhadap subtotal masing-masing.
- Jumlah total semua anggota harus sama persis dengan total yang dialokasikan.
- Tampilkan rekonsiliasi dan selisih secara jelas.
- Buat unit test yang mencakup item bersama, pembulatan, pajak, layanan, diskon, nilai ganjil, invalid input, dan mismatch.

## AI/OCR

- Buat endpoint server untuk parsing gambar struk.
- Gunakan Cloudflare Workers AI melalui provider abstraction.
- Cari model vision/OCR non-deprecated yang paling cocok dari katalog resmi saat implementasi.
- Minta structured JSON dan validasi dengan Zod.
- Tandai field dengan confidence rendah.
- Semua field harus dapat diedit.
- Jangan menyimpan gambar struk permanen.
- Sediakan retry dan input manual.

## Output proyek yang wajib

Pastikan tersedia:

- `README.md`
- `AGENTS.md`
- `.env.example`
- `docs/implementation-plan.md`
- `docs/stack-versions.md`
- `docs/ai-usage.md`
- `docs/deployment.md`
- Sample receipt data
- Mock AI provider
- Unit tests
- E2E test alur utama
- Manifest/PWA icons atau generator aset yang legal
- Cloudflare preview/deploy scripts

## Quality gates

Jalankan dan perbaiki sampai lulus:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm preview
```

Jalankan Playwright untuk alur utama bila browser tersedia. Uji viewport HP sekitar 390×844 dan desktop.

Setelah selesai, berikan laporan singkat berisi:

1. Fitur yang benar-benar sudah dibuat.
2. Keputusan arsitektur.
3. Versi paket yang digunakan.
4. Perintah yang dijalankan dan hasilnya.
5. Pengujian manual yang dilakukan.
6. Kendala atau fitur yang masih memakai mock.
7. Langkah deploy.
8. Satu tugas berikutnya yang paling penting.

Mulai sekarang dengan memeriksa repository dan membuat rencana implementasi. Setelah itu lanjutkan pembangunan tanpa berhenti pada tahap rencana.
