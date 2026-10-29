# GHALAT — Pre-Order Landing Page

Halaman pre-order kaos **GHALAT / STATE OF ROT — MALFUNCTION** (Demo 2026). Semua transaksi tercatat ke tab **DATA PO** di Google Sheets yang sudah ada, dan bukti transfer disimpan ke Google Drive.

- Frontend: satu file `index.html` (HTML + CSS + JS, tanpa framework, tanpa build step).
- Backend: `apps-script/Code.gs` (Google Apps Script, terikat ke spreadsheet yang sama).
- Harga, ukuran, rekening, dan nomor WhatsApp diatur di dua tempat dan **harus disamakan** (lihat [Mengubah harga](#mengubah-harga--ukuran)).

---

## 1. Isi folder

```
ghalat-preorder/
├─ index.html              ← seluruh website (frontend)
├─ apps-script/
│  └─ Code.gs              ← kode untuk ditempel ke Google Apps Script
├─ assets/
│  └─ .gitkeep             ← opsional: taruh logo.png di sini
├─ README.md
└─ .gitignore
```

Kalau `assets/logo.png` tidak ada, hero otomatis memakai tulisan **GHALAT** sebagai fallback. Tidak wajib punya logo.

---

## 2. Jalankan di komputer dulu

Buka terminal di folder `ghalat-preorder`, lalu:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Buka `http://127.0.0.1:8000/index.html`.

> Jangan uji dengan double-click `index.html` saja. Sebagian browser memblokir request ke Apps Script dari alamat `file://`. Pakai server lokal di atas, atau langsung hosting statis.

Selama `CONFIG.APPS_SCRIPT_URL` masih berisi `ISI_URL_DEPLOY_APPS_SCRIPT`, tombol **KIRIM ORDER** akan menampilkan pesan bahwa backend belum disambung. Itu memang perilaku yang benar.

---

## 3. Siapkan Google Sheet

Spreadsheet yang dipakai:

```
https://docs.google.com/spreadsheets/d/1ZfIoDny3vz7Yd4G-IR6sZfGxLFwgmiWUQzXWuW2x3s4/edit
```

Aturan penting:

1. **Jangan membuat tab baru.** Backend hanya menulis ke tab bernama **DATA PO**.
2. **Jangan mengganti nama tab.** Nama itu di-hardcode di `Code.gs` (`SHEET_NAME`).
3. **Jangan menghapus / mengganti nama header lama.** Kolom A–J yang sudah ada dipakai kembali.
4. Baris header boleh tidak di baris 1. Script mencari header di **15 baris pertama** dengan syarat ada teks **Nama** dan **No. WA**.
5. Kolom dicari berdasarkan **nama header**, bukan posisi. Urutan kolom boleh berbeda.

### Kolom yang dipakai

Kolom lama (A–J) yang dibutuhkan:

| Header | Isi |
|---|---|
| `No.` | nomor urut, otomatis |
| `Nama` | nama pembeli |
| `No. WA` | nomor WhatsApp, otomatis dinormalisasi ke `628...` |
| `Size` | S / M / L / XL / XXL / XXXL |
| `DP / Lunas` | `DP` atau `Lunas` |
| `Jumlah` | 1–20 |
| `Nominal Dibayar (Rp)` | nominal transfer, angka |
| `Alamat Lengkap` | alamat pengiriman |
| `Status` | default `Menunggu pembayaran` |
| `Catatan` | catatan opsional |

Kolom tambahan dibuat otomatis kalau belum ada:

| Header | Isi |
|---|---|
| `Kode Order` | contoh `GHLT-261027-A7K2` |
| `Total (Rp)` | total harga, dihitung ulang di server |
| `Sisa (Rp)` | total − nominal dibayar |
| `Link Bukti Bayar` | URL file Drive, bisa diklik |
| `Waktu Submit` | `dd/MM/yyyy HH:mm:ss` zona Asia/Jakarta |

Kolom tambahan ditaruh setelah kolom terakhir yang terisi. Format uang memakai `"Rp"#,##0`, format waktu berupa teks.

### Baris yang dipakai

Script mengisi **baris kosong pertama setelah header**, termasuk baris template yang sudah diberi nomor (misalnya baris bernomor 8–24). Kalau semua baris sudah terpakai, baris baru ditambahkan di bawahnya.

Nomor urut melanjutkan nomor pesanan terakhir yang benar-benar terisi. Baris template yang hanya berisi `No.` tidak dihitung sebagai pesanan. Baris yang sudah ada tidak ditimpa.

---

## 4. Pasang Apps Script

1. Buka spreadsheet di atas dengan akun pemilik.
2. Menu **Extensions → Apps Script**.
3. Hapus isi file default (`Code.gs`), lalu tempel seluruh isi `apps-script/Code.gs`.
4. Tekan **Save** (ikon disket).
5. Buka **Project Settings** (ikon gear) → **Script Properties**:
   - Opsional: tambah properti `FOLDER_ID` berisi ID folder Google Drive untuk bukti bayar.
   - Opsional: tambah properti `TOKEN` untuk mengganti token default `ghalat-2026`.
6. Deploy: **Deploy → New deployment**.
   - Type: **Web app**
   - Description: `GHALAT pre-order`
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Klik **Deploy**, lalu **Authorize access** dan setujui izin (Sheets + Drive).
8. Salin **Web app URL**. Bentuknya:

   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

9. Buka URL itu di browser. Harus muncul JSON:

   ```json
   {"ok":true,"pesan":"endpoint aktif"}
   ```

### Kalau tidak mau membuat folder baru

1. Buat folder di Google Drive, misalnya `Bukti Bayar GHALAT`.
2. Buka folder, salin ID dari URL:

   ```
   https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
                                             └────────── ini FOLDER_ID ──────────┘
   ```

3. Tempel sebagai Script Property `FOLDER_ID`, lalu deploy ulang (atau cukup simpan; properti langsung terbaca request berikutnya).

Kalau `FOLDER_ID` kosong, script otomatis mencari folder bernama **GHALAT BUKTI BAYAR** di My Drive. Kalau tidak ada, folder itu dibuat sekali, lalu ID-nya disimpan otomatis agar tidak membuat folder ganda.

> File bukti mengikuti izin folder Drive. Secara default file bersifat privat untuk pemilik Drive. Link di sheet bisa dibuka oleh akun band yang punya akses. Jangan mengubah folder menjadi publik kecuali memang disengaja.

---

## 5. Sambungkan frontend ke backend

Buka `index.html`, cari `const CONFIG` (sekitar awal `<script>`), lalu ganti:

```js
APPS_SCRIPT_URL: "ISI_URL_DEPLOY_APPS_SCRIPT",
```

menjadi URL `/exec` hasil deploy:

```js
APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycb.../exec",
```

Simpan. Tidak ada build step; cukup upload ulang `index.html` ke hosting.

Cek juga nilai lain di `CONFIG`:

```js
BCA: { bank: "BCA", norek: "8445698501", atasNama: "AMRULLAH EMMIR" },
WA_BAND: "6281996385058",
TOKEN: "ghalat-2026",
```

- `BCA` tampil di form, halaman sukses, dan teks WhatsApp.
- `WA_BAND` memakai format internasional tanpa `+` dan tanpa spasi.
- `TOKEN` harus sama dengan token di Apps Script (default `ghalat-2026`).

---

## 6. Atur dropdown Status dan conditional formatting

Backend selalu menulis status awal **`Menunggu pembayaran`**. Supaya rapi saat admin mengubah status:

1. Blok kolom **Status** mulai baris data pertama sampai bawah, misalnya `I2:I1000`. Sesuaikan huruf kolom kalau urutannya berbeda.
2. Menu **Data → Data validation → Add rule**.
3. Pilih **Dropdown**, lalu isi nilai:

   ```
   Menunggu pembayaran
   Menunggu konfirmasi
   DP diterima
   Lunas
   Dikirim
   Selesai
   Batal
   ```

4. Simpan. (Nilai boleh disesuaikan dengan kebiasaan band; backend hanya menulis nilai awal.)

Contoh conditional formatting (Format → Conditional formatting):

| Nilai sel | Warna latar |
|---|---|
| `Menunggu pembayaran` | kuning muda `#FFF2CC` |
| `Menunggu konfirmasi` | oranye muda `#FCE5CD` |
| `DP diterima` | biru muda `#CFE2F3` |
| `Lunas` | hijau muda `#D9EAD3` |
| `Dikirim` | ungu muda `#D9D2E9` |
| `Selesai` | hijau `#B6D7A8` |
| `Batal` | merah muda `#F4CCCC` |

Bukti transfer yang diunggah **tidak otomatis** mengubah status. Admin tetap mengecek lalu mengubah status manual.

---

## 7. Hosting frontend

Semua opsi di bawah gratis dan tidak perlu build.

### Netlify Drop

1. Buka <https://app.netlify.com/drop>.
2. Tarik **isi folder `ghalat-preorder`** (bukan folder induknya) ke area drop. `index.html` harus berada di root.
3. Tunggu upload, lalu buka URL yang diberikan.
4. Ganti `APPS_SCRIPT_URL` sebelum upload kalau belum.

### Cloudflare Pages

1. Masuk ke Cloudflare Dashboard → **Workers & Pages → Create → Pages → Upload assets**.
2. Upload folder yang sama (root berisi `index.html`).
3. Deploy.

### GitHub Pages

1. Buat repository, upload `index.html` (dan folder `assets/` bila ada) ke branch `main`.
2. **Settings → Pages → Build and deployment → Deploy from a branch**.
3. Pilih `main` dan `/ (root)`, lalu Save.
4. Tunggu beberapa menit, buka URL GitHub Pages.

### Hosting lain

Hosting statis apa pun bisa dipakai (cPanel, Vercel, Firebase Hosting, dll.). Tidak ada server-side rendering atau database tambahan.

---

## 8. Deploy ulang setelah mengubah backend

Setiap kali `Code.gs` diubah:

1. **Save** di editor Apps Script.
2. **Deploy → Manage deployments**.
3. Pilih deployment yang sedang dipakai → ikon pensil (**Edit**).
4. Pada **Version**, pilih **New version**.
5. Klik **Deploy**.

Kalau memakai **Edit deployment** seperti di atas, URL `/exec` tidak berubah, jadi `index.html` tidak perlu diubah. Kalau membuat **New deployment**, URL-nya baru dan harus ditempel ulang ke `CONFIG.APPS_SCRIPT_URL`.

Setelah redeploy, uji lagi dengan membuka URL `/exec` di browser dan kirim satu order percobaan.

---

## 9. Mengubah harga & ukuran

Harga **wajib diubah di dua file** dan angkanya harus sama:

### `index.html`

```js
HARGA_DASAR: 160000,
TAMBAHAN_PER_SIZE_NAIK: 5000, // tambahan per tingkat di atas L
DP_MINIMAL: 100000,
URUTAN_SIZE: ["S", "M", "L", "XL", "XXL", "XXXL"],
```

### `apps-script/Code.gs`

```js
var HARGA_DASAR = 160000;
var TAMBAHAN_PER_SIZE_NAIK = 5000;
var DP_MINIMAL = 100000;
var URUTAN_SIZE = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
```

Rumus harga satuan:

- S, M, L = `HARGA_DASAR`
- XL = `HARGA_DASAR + 1 × TAMBAHAN`
- XXL = `HARGA_DASAR + 2 × TAMBAHAN`
- XXXL = `HARGA_DASAR + 3 × TAMBAHAN`

Contoh dengan nilai sekarang: S/M/L Rp160.000; XL Rp165.000; XXL Rp170.000; XXXL Rp175.000.

Mengubah `TABEL_UKURAN` hanya mengubah tampilan tabel ukuran di frontend. Itu tidak memengaruhi harga.

Setelah mengubah harga: redeploy Apps Script (New version), lalu upload ulang `index.html` ke hosting.

---

## 10. Alur kerja website

1. Pembeli isi nama, WA, alamat, size, jumlah, metode bayar, nominal, dan opsional bukti transfer.
2. Harga dihitung live di browser untuk tampilan saja. Saat submit, server **menghitung ulang** harga dari size dan jumlah; nominal dari client tidak dipercaya.
3. Server memvalidasi semua field, membuat/menentukan kode order unik, menyimpan bukti ke Drive (kalau ada), lalu menulis satu baris ke `DATA PO`.
4. Setelah sukses, halaman sukses muncul tanpa reload. Pembeli bisa:
   - menyalin kode order,
   - menyalin nomor rekening,
   - membuka WhatsApp dengan pesan konfirmasi yang sudah terisi,
   - mengunggah bukti susulan kalau tadi belum upload.
5. Kalau request gagal, data yang sudah diketik tetap ada di form dan bisa dikirim ulang.

### Detail upload bukti

- Format: JPG, PNG, WEBP, PDF.
- Maksimal 5MB.
- Gambar dikompres di browser ke JPEG, sisi terpanjang maksimal 1600px, kualitas 0.8.
- PDF dikirim apa adanya (selama ≤5MB).
- Bukti susulan dicari berdasarkan kode order, jadi kode order harus sudah tercatat di sheet.

### Kode order

Format: `GHLT-YYMMDD-XXXX`, contoh `GHLT-261027-A7K2`. Frontend membuat kode awal, backend memeriksa keunikan dan membuat ulang kalau bentrok.

---

## 11. Keamanan & batasan

- `TOKEN` di frontend **bukan rahasia**. Siapa pun bisa melihatnya di source. Token hanya penyaring sederhana agar request asal-asalan ditolak, bukan pengamanan penuh.
- Validasi utama tetap di server: ukuran, jumlah, nominal, format WA, panjang teks, dan perhitungan harga.
- Spreadsheet sebaiknya **privat** untuk akun band. Pembeli tidak perlu akses sheet karena Web App berjalan sebagai pemilik.
- Apps Script memakai `LockService`, jadi dua order yang masuk bersamaan tidak menulis baris di saat yang sama.
- Request dibatasi ±45 detik di frontend. Kalau timeout, coba lagi; baris mungkin belum tersimpan.
- Ukuran payload upload base64 membuat file besar lebih lambat. Batas 5MB sudah cukup untuk screenshot bukti transfer.
- Kalau folder/file Drive privat, link di sheet hanya bisa dibuka akun yang diberi akses.
- Jangan mengubah nama tab `DATA PO` atau menghapus header lama. Kalau header berubah, backend akan menolak dengan pesan error yang jelas.

---

## 12. Checklist uji sebelum dipakai

Lakukan di komputer, lalu ulangi sekali di URL hosting.

- [ ] Buka URL `/exec` → muncul `{"ok":true,...}`.
- [ ] Form kosong → muncul pesan error di field yang wajib.
- [ ] Nama 2 karakter → ditolak.
- [ ] Nomor WA `0812...` → berubah menjadi `62812...` saat blur.
- [ ] Alamat < 15 karakter → ditolak.
- [ ] Size S, L, XL, XXL, XXXL → total berubah sesuai rumus.
- [ ] Jumlah 0, 21, atau desimal → ditolak.
- [ ] DP di bawah Rp100.000 → ditolak.
- [ ] DP di atas total → ditolak.
- [ ] Lunas → nominal terkunci di total dan sisa Rp0.
- [ ] Upload JPG > 1600px → file terkompresi, preview muncul.
- [ ] Upload PDF ≤5MB → preview badge PDF.
- [ ] Upload file >5MB atau tipe lain → ditolak dengan pesan jelas.
- [ ] Kirim order tanpa bukti → sukses, baris masuk sheet, kolom bukti kosong.
- [ ] Kirim order dengan bukti → baris masuk, link Drive bisa diklik.
- [ ] Halaman sukses: kode order, total, dibayar, sisa benar.
- [ ] Tombol salin kode dan salin rekening bekerja.
- [ ] Link WhatsApp membuka chat dengan pesan yang sudah terisi.
- [ ] Upload bukti susulan dari halaman sukses → link muncul di baris yang sama, tidak membuat baris baru.
- [ ] Kirim ulang setelah error jaringan → tidak membuat baris ganda (selama request pertama benar-benar gagal).
- [ ] Buka di HP 360px → tidak ada scroll horizontal, form tetap nyaman.
- [ ] Cek sheet: `No.` lanjut dari nomor terakhir, `Status` = `Menunggu pembayaran`, `Waktu Submit` terisi, format uang `Rp`.

---

## 13. Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| `Backend belum disambung` | `CONFIG.APPS_SCRIPT_URL` masih placeholder. Tempel URL `/exec`. |
| `Web App belum bisa diakses publik` | Deploy ulang dengan **Who has access: Anyone**, bukan “Anyone with Google account”. |
| `Gagal nyambung ke server` | URL salah, deploy belum aktif, atau koneksi bermasalah. Buka URL `/exec` di browser. |
| `Balasan server bukan JSON` | Biasanya URL `/dev` atau halaman login Google. Pastikan memakai `/exec` dan akses publik. |
| `Header "Nama" dan "No. WA" nggak ketemu` | Header berubah atau tab salah. Kembalikan nama header / tab `DATA PO`. |
| `Kolom wajib ... nggak ketemu` | Salah satu header A–J diganti namanya. Kembalikan sesuai tabel di atas. |
| `Tab "DATA PO" nggak ketemu` | Nama tab diubah. Kembalikan persis `DATA PO`. |
| `FOLDER_ID ... nggak valid` | ID folder salah atau folder bukan milik akun yang menjalankan Web App. Perbaiki Script Property. |
| `Token nggak valid` | `CONFIG.TOKEN` di frontend berbeda dengan Script Property `TOKEN` (atau default `ghalat-2026`). |
| Order sukses tapi baris tidak muncul | Buka sheet yang benar. Cek **Executions** di Apps Script untuk error. Pastikan deployment memakai versi terbaru. |
| Link bukti tidak bisa dibuka pembeli | File/folder Drive privat. Ini normal; akses diberikan ke akun band, bukan publik. |
| Perubahan `Code.gs` tidak berefek | Belum membuat **New version** di Manage deployments. |
| Upload gagal padahal <5MB | Base64 membengkak ±33%. Coba kompres gambar atau kirim PDF lebih kecil. Cek juga kuota Drive. |

---

## 14. Catatan pengembangan

- Frontend sengaja tanpa build tool supaya bisa ditempel ke hosting statis apa pun.
- Tidak ada `console.log` di kode produksi.
- Animasi marquee dan transisi dimatikan otomatis saat pengguna memilih **prefers-reduced-motion**.
- Form memakai label, `aria-describedby`, `aria-live`, fokus yang terlihat, dan urutan tab yang wajar.
- File `assets/logo.png` bersifat opsional. Kalau ada, logo otomatis tampil; kalau tidak, teks GHALAT dipakai.
- Kalau mengubah nominal, format uang, atau kolom sheet, uji ulang checklist di atas.
