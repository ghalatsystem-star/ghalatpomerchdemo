/**
 * ============================================================
 * GHALAT — BACKEND PRE-ORDER (Google Apps Script)
 * ============================================================
 * Tugas file ini:
 * - Menerima order dari index.html lewat doPost.
 * - Validasi ulang data + hitung ulang harga di server.
 * - Menulis baris baru ke tab "DATA PO" tanpa mengganggu data lama.
 * - Menyimpan bukti transfer ke Google Drive (opsional).
 *
 * PENTING:
 * - Jangan bikin sheet/tab baru. Script ini hanya menulis ke "DATA PO".
 * - Header dicari dinamis (15 baris pertama), bukan hardcode baris 2.
 * - Kolom dicari berdasarkan nama header, bukan posisi.
 * - Kalau harga di index.html diubah, samakan angka di bagian HARGA di bawah.
 * ============================================================
 */

/* ==================== KONFIGURASI ==================== */

var SPREADSHEET_ID = '1ZfIoDny3vz7Yd4G-IR6sZfGxLFwgmiWUQzXWuW2x3s4';
var SHEET_NAME = 'DATA PO';

// Samakan dengan CONFIG di index.html.
var HARGA_DASAR = 160000;
var TAMBAHAN_PER_SIZE_NAIK = 5000;
var DP_MINIMAL = 100000;
var URUTAN_SIZE = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

var TOKEN_DEFAULT = 'ghalat-2026';
var HEADER_SCAN_ROWS = 15;

/* Alias header. Semua dibandingkan setelah dinormalisasi. */
var ALIAS_HEADER = {
  no: ['no', 'nomor', 'no urut', 'nomor urut'],
  nama: ['nama', 'nama lengkap'],
  wa: ['no wa', 'no whatsapp', 'nomor wa', 'nomor whatsapp', 'whatsapp', 'wa'],
  size: ['size', 'ukuran', 'ukuran kaos'],
  pembayaran: ['dp/lunas', 'pembayaran', 'metode pembayaran', 'metode'],
  jumlah: ['jumlah', 'qty', 'kuantitas', 'jumlah kaos'],
  nominal: ['nominal dibayar', 'nominal', 'dibayar'],
  alamat: ['alamat lengkap', 'alamat'],
  status: ['status', 'status order'],
  catatan: ['catatan', 'note', 'keterangan'],
  kodeOrder: ['kode order', 'kode pesanan', 'order code'],
  total: ['total', 'total harga'],
  sisa: ['sisa', 'sisa bayar'],
  waktuSubmit: ['waktu submit', 'waktu masuk', 'timestamp']
};

/* Kolom lama yang wajib ada (A–J di sheet asli). */
var KOLOM_WAJIB = ['no', 'nama', 'wa', 'size', 'pembayaran', 'jumlah', 'nominal', 'alamat', 'status', 'catatan'];

/* Kolom tambahan yang dibuat otomatis kalau belum ada. */
var KOLOM_TAMBAHAN = [
  { key: 'kodeOrder', label: 'Kode Order' },
  { key: 'total', label: 'Total (Rp)' },
  { key: 'sisa', label: 'Sisa (Rp)' },
  { key: 'waktuSubmit', label: 'Waktu Submit' }
];

var LABEL_KOLOM = {
  no: 'No.',
  nama: 'Nama',
  wa: 'No. WA',
  size: 'Size',
  pembayaran: 'DP / Lunas',
  jumlah: 'Jumlah',
  nominal: 'Nominal Dibayar (Rp)',
  alamat: 'Alamat Lengkap',
  status: 'Status',
  catatan: 'Catatan',
  kodeOrder: 'Kode Order',
  total: 'Total (Rp)',
  sisa: 'Sisa (Rp)',
  waktuSubmit: 'Waktu Submit'
};

/* ==================== ENDPOINT ==================== */

/**
 * doGet: cek cepat bahwa Web App hidup.
 * Buka URL deploy di browser -> harus keluar JSON {"ok":true,...}.
 */
function doGet(e) {
  return json_({ ok: true, pesan: 'endpoint aktif' });
}

/**
 * doPost: semua data order / upload bukti masuk lewat sini.
 * Body dikirim sebagai text/plain berisi JSON dari index.html.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Data kosong.');
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      throw new Error('Format data nggak valid.');
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Data nggak valid.');
    }

    if (String(data.token || '') !== getToken_()) {
      throw new Error('Token nggak valid.');
    }

    locked = lock.tryLock(30000);
    if (!locked) {
      throw new Error('Server lagi sibuk. Coba lagi sebentar.');
    }

    return json_(simpanOrder_(data));
  } catch (err) {
    return json_({ ok: false, pesan: pesanError_(err) });
  } finally {
    if (locked) {
      try {
        lock.releaseLock();
      } catch (releaseErr) {
        // Diamkan: lock otomatis lepas saat eksekusi selesai.
      }
    }
  }
}

/* ==================== ORDER BARU ==================== */

/**
 * Validasi, lalu tulis satu baris baru ke sheet.
 */
function simpanOrder_(data) {
  var order = validasiOrder_(data);
  var siap = siapkanSheet_();
  var kodeOrder = kodeUnik_(siap, data.kodeOrder);

  var sheet = siap.sheet;
  var cols = siap.cols;
  var headerRow = siap.headerRow;
  var now = new Date();
  var waktuSubmit = Utilities.formatDate(now, 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
  var nomor = nomorBerikut_(sheet, headerRow, cols);
  var targetRow = cariBarisTujuan_(sheet, headerRow, cols);
  var lebar = lebarKolom_(cols);
  var row = [];
  for (var i = 0; i < lebar; i++) row.push('');

  row[cols.no - 1] = nomor;
  row[cols.nama - 1] = order.nama;
  row[cols.wa - 1] = order.wa;
  row[cols.size - 1] = order.size;
  row[cols.pembayaran - 1] = order.pembayaran;
  row[cols.jumlah - 1] = order.jumlah;
  row[cols.nominal - 1] = order.nominal;
  row[cols.alamat - 1] = order.alamat;
  row[cols.status - 1] = 'Menunggu konfirmasi WA';
  row[cols.catatan - 1] = order.catatan;
  row[cols.kodeOrder - 1] = kodeOrder;
  row[cols.total - 1] = order.total;
  row[cols.sisa - 1] = order.sisa;
  row[cols.waktuSubmit - 1] = waktuSubmit;

  // Format teks dulu supaya isian user yang diawali = + - @ nggak jadi formula.
  var kolomTeks = [
    cols.nama, cols.wa, cols.size, cols.pembayaran, cols.alamat,
    cols.status, cols.catatan, cols.kodeOrder, cols.waktuSubmit
  ];
  kolomTeks.forEach(function (kolom) {
    sheet.getRange(targetRow, kolom).setNumberFormat('@');
  });

  sheet.getRange(targetRow, 1, 1, lebar).setValues([row]);

  // Angka tetap angka, lalu diformat rupiah seperti data lama.
  sheet.getRange(targetRow, cols.no).setNumberFormat('0');
  sheet.getRange(targetRow, cols.jumlah).setNumberFormat('0');
  [cols.nominal, cols.total, cols.sisa].forEach(function (kolom) {
    sheet.getRange(targetRow, kolom).setNumberFormat('"Rp"#,##0');
  });

    return {
    ok: true,
    kodeOrder: kodeOrder,
    hargaSatuan: order.hargaSatuan,
    total: order.total,
    nominalBayar: order.nominal,
    sisa: order.sisa
  };
}

/* ==================== VALIDASI & HITUNG HARGA ==================== */

/**
 * Validasi semua input. Harga TIDAK dipercaya dari client, dihitung ulang.
 */
function validasiOrder_(data) {
  var nama = teks_(data.nama).replace(/\s+/g, ' ');
  if (nama.length < 3) throw new Error('Nama minimal 3 karakter.');
  if (nama.length > 100) throw new Error('Nama maksimal 100 karakter.');

  var wa = normalisasiWa_(data.wa);
  if (!/^628\d{7,11}$/.test(wa)) {
    throw new Error('No. WA nggak valid. Contoh: 081234567890.');
  }

  var alamat = teks_(data.alamat).replace(/\r\n/g, '\n');
  if (alamat.length < 15) throw new Error('Alamat minimal 15 karakter. Sertakan patokan/kecamatan.');
  if (alamat.length > 500) throw new Error('Alamat maksimal 500 karakter.');

  var size = teks_(data.size).toUpperCase();
  if (URUTAN_SIZE.indexOf(size) === -1) {
    throw new Error('Ukuran nggak valid. Pilih S sampai XXXL.');
  }

  var jumlah = angkaBulat_(data.jumlah);
  if (!isFinite(jumlah) || jumlah < 1) {
    throw new Error('Jumlah harus angka bulat minimal 1.');
  }

  var pembayaran = teks_(data.pembayaran).toLowerCase();
  if (pembayaran === 'dp') {
    pembayaran = 'DP';
  } else if (pembayaran === 'lunas') {
    pembayaran = 'Lunas';
  } else {
    throw new Error('Metode pembayaran harus DP atau Lunas.');
  }

  var hargaSatuan = hitungHargaSatuan_(size);
  var total = hargaSatuan * jumlah;
  var nominal = pembayaran === 'Lunas' ? total : angkaBulat_(data.nominalBayar);

  if (pembayaran === 'DP') {
    if (!isFinite(nominal)) throw new Error('Nominal transfer harus angka bulat.');
    if (nominal < DP_MINIMAL) {
      throw new Error('DP minimal Rp' + formatAngka_(DP_MINIMAL) + '.');
    }
  }

  var catatan = teks_(data.catatan);
  if (catatan.length > 300) throw new Error('Catatan maksimal 300 karakter.');

  return {
    nama: nama,
    wa: wa,
    alamat: alamat,
    size: size,
    jumlah: jumlah,
    pembayaran: pembayaran,
    nominal: nominal,
    hargaSatuan: hargaSatuan,
    total: total,
    sisa: Math.max(total - nominal, 0),
    catatan: catatan
  };
}

/**
 * Harga satuan: S/M/L = harga dasar; tiap tingkat di atas L +Rp5.000.
 */
function hitungHargaSatuan_(size) {
  var idx = URUTAN_SIZE.indexOf(size);
  var idxL = URUTAN_SIZE.indexOf('L');
  if (idx === -1) return 0;
  return Math.max(HARGA_DASAR, HARGA_DASAR + (idx - idxL) * TAMBAHAN_PER_SIZE_NAIK);
}

/**
 * 0812... / +62812... / 812... / 62812... -> 62812...
 */
function normalisasiWa_(value) {
  var d = String(value == null ? '' : value).replace(/\D/g, '');
  if (d.indexOf('620') === 0) {
    d = '62' + d.slice(3);
  } else if (d.indexOf('0') === 0) {
    d = '62' + d.slice(1);
  } else if (d.indexOf('8') === 0) {
    d = '62' + d;
  }
  return d;
}

function teks_(value) {
  return value == null ? '' : String(value).trim();
}

function angkaBulat_(value) {
  if (value === '' || value == null || typeof value === 'boolean') return NaN;
  var n = Number(value);
  if (!isFinite(n) || Math.floor(n) !== n) return NaN;
  return n;
}

function formatAngka_(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/* ==================== SHEET DINAMIS ==================== */

/**
 * Buka spreadsheet + tab. Kalau tab nggak ada, lempar error (bukan bikin baru).
 */
function openSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Tab "' + SHEET_NAME + '" nggak ketemu. Jangan ganti nama tabnya.');
  }
  return sheet;
}

/**
 * Cari baris header: scan 15 baris pertama, cari baris yang punya
 * header "Nama" DAN "No. WA".
 */
function cariHeader_(sheet) {
  var maxCols = Math.max(sheet.getLastColumn(), 1);
  var totalRows = Math.min(HEADER_SCAN_ROWS, sheet.getMaxRows());
  var rows = sheet.getRange(1, 1, totalRows, maxCols).getDisplayValues();

  for (var r = 0; r < rows.length; r++) {
    var norm = rows[r].map(function (v) { return norm_(v); });
    var adaNama = norm.some(function (v) { return ALIAS_HEADER.nama.indexOf(v) !== -1; });
    var adaWa = norm.some(function (v) { return ALIAS_HEADER.wa.indexOf(v) !== -1; });
    if (adaNama && adaWa) {
      return { row: r + 1, headers: rows[r].slice() };
    }
  }

  throw new Error('Header "Nama" dan "No. WA" nggak ketemu di 15 baris pertama.');
}

/**
 * Pastikan K–O ada. Kolom baru ditaruh setelah kolom terakhir yang terisi
 * di header row. Format header meniru header terakhir yang sudah ada.
 */
function pastikanKolomTambahan_(sheet, headerRow, headers) {
  KOLOM_TAMBAHAN.forEach(function (tambahan) {
    if (cariIndexKolom_(headers, tambahan.key)) return;

    var lastFilled = 0;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i] == null ? '' : headers[i]).trim() !== '') lastFilled = i + 1;
    }

    var newCol = lastFilled + 1;
    if (newCol > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), newCol - sheet.getMaxColumns());
    }

    // Salin format dari header terakhir yang terisi biar seragam.
    var sourceCol = lastFilled || 1;
    sheet.getRange(headerRow, sourceCol).copyTo(
      sheet.getRange(headerRow, newCol),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );
    sheet.getRange(headerRow, newCol).setValue(tambahan.label);

    if (tambahan.key === 'waktuSubmit') {
      sheet.setColumnWidth(newCol, 150);
    } else {
      sheet.setColumnWidth(newCol, 120);
    }

    headers[newCol - 1] = tambahan.label;
  });

  return headers;
}

/**
 * Siapkan sheet: cari header, tambah kolom K–O kalau perlu, lalu petakan
 * semua kolom berdasarkan nama header.
 */
function siapkanSheet_() {
  var sheet = openSheet_();
  var found = cariHeader_(sheet);
  var headers = pastikanKolomTambahan_(sheet, found.row, found.headers);
  var cols = {};

  KOLOM_WAJIB.forEach(function (key) {
    var idx = cariIndexKolom_(headers, key);
    if (!idx) {
      throw new Error('Kolom wajib "' + LABEL_KOLOM[key] + '" nggak ketemu di header.');
    }
    cols[key] = idx;
  });

  KOLOM_TAMBAHAN.forEach(function (item) {
    var idx = cariIndexKolom_(headers, item.key);
    if (!idx) {
      throw new Error('Kolom tambahan "' + LABEL_KOLOM[item.key] + '" gagal disiapkan.');
    }
    cols[item.key] = idx;
  });

  return { sheet: sheet, headerRow: found.row, cols: cols };
}

/**
 * Nomor urut berikutnya: nomor pesanan terpakai terakhir + 1.
 * Baris template yang cuma berisi No. (belum ada data pesanan) tidak dihitung,
 * supaya nomor tetap nyambung dengan pesanan yang benar-benar ada.
 */
function nomorBerikut_(sheet, headerRow, cols) {
  var startRow = headerRow + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < startRow) return 1;

  var jumlahBaris = lastRow - startRow + 1;
  var lebar = lebarKolom_(cols);
  var data = sheet.getRange(startRow, 1, jumlahBaris, lebar).getDisplayValues();
  var maxNomor = 0;
  var adaNomor = false;

  for (var i = 0; i < data.length; i++) {
    if (!barisDipakai_(data[i], cols)) continue;
    var n = Number(data[i][cols.no - 1]);
    if (isFinite(n)) {
      adaNomor = true;
      if (n > maxNomor) maxNomor = n;
    }
  }

  return adaNomor ? Math.floor(maxNomor) + 1 : 1;
}

/**
 * Baris tujuan: pakai baris kosong pertama setelah header (misalnya baris
 * template yang sudah bernomor). Kalau semua baris terisi, tambah baris baru.
 * Baris dianggap kosong kalau kolom data pesanan tidak ada isinya; kolom No.
 * dan Status boleh sudah terisi.
 */
function cariBarisTujuan_(sheet, headerRow, cols) {
  var lastRow = Math.max(sheet.getLastRow(), headerRow);
  var lebar = lebarKolom_(cols);
  if (lastRow <= headerRow) return headerRow + 1;

  var data = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, lebar).getDisplayValues();
  for (var i = 0; i < data.length; i++) {
    if (!barisDipakai_(data[i], cols)) return headerRow + 1 + i;
  }

  return lastRow + 1;
}

/**
 * True kalau baris sudah berisi data pesanan. No. dan Status sengaja
 * diabaikan karena baris template bisa sudah punya keduanya.
 */
function barisDipakai_(row, cols) {
  var keys = [
    'nama', 'wa', 'size', 'pembayaran', 'jumlah', 'nominal', 'alamat',
    'catatan', 'kodeOrder', 'waktuSubmit'
  ];

  for (var i = 0; i < keys.length; i++) {
    var idx = cols[keys[i]];
    if (!idx) continue;
    var value = row[idx - 1];
    if (String(value == null ? '' : value).trim() !== '') return true;
  }

  return false;
}

/**
 * Kode order unik. Pakai kode dari client kalau formatnya benar dan belum ada.
 */
function kodeUnik_(siap, kodeKlien) {
  var kode = String(kodeKlien || '').trim().toUpperCase();
  var pola = /^GHLT-\d{6}-[A-Z0-9]{4}$/;

  if (pola.test(kode) && !cariBarisKode_(siap.sheet, siap.headerRow, siap.cols.kodeOrder, kode)) {
    return kode;
  }

  var tanggal = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyMMdd');
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  for (var attempt = 0; attempt < 60; attempt++) {
    var acak = '';
    for (var i = 0; i < 4; i++) {
      acak += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    var kandidat = 'GHLT-' + tanggal + '-' + acak;
    if (!cariBarisKode_(siap.sheet, siap.headerRow, siap.cols.kodeOrder, kandidat)) {
      return kandidat;
    }
  }

  throw new Error('Gagal bikin kode order unik. Coba lagi.');
}

/**
 * Cari baris berdasarkan kode order. 0 = nggak ketemu.
 */
function cariBarisKode_(sheet, headerRow, kolomKode, kode) {
  if (!kolomKode) return 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < headerRow + 1) return 0;

  var values = sheet.getRange(headerRow + 1, kolomKode, lastRow - headerRow, 1).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toUpperCase() === String(kode).trim().toUpperCase()) {
      return headerRow + 1 + i;
    }
  }
  return 0;
}

function cariIndexKolom_(headers, key) {
  var aliases = ALIAS_HEADER[key] || [];
  for (var i = 0; i < headers.length; i++) {
    var n = norm_(headers[i]);
    if (n && aliases.indexOf(n) !== -1) return i + 1;
  }
  return 0;
}

function lebarKolom_(cols) {
  var keys = Object.keys(cols);
  var max = 0;
  keys.forEach(function (k) {
    if (cols[k] > max) max = cols[k];
  });
  return max;
}

/**
 * Normalisasi header: huruf kecil, buang satuan dalam kurung, rapikan spasi.
 * Contoh: "Nominal Dibayar (Rp)" -> "nominal dibayar".
 */
function norm_(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/[.:*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ==================== UTIL ==================== */

function getToken_() {
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return token ? String(token) : TOKEN_DEFAULT;
}

function json_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

function pesanError_(err) {
  var pesan = err && err.message ? String(err.message) : 'Terjadi kesalahan di server.';
  // Jangan bocorin detail internal yang panjang ke user.
  if (pesan.length > 300) pesan = pesan.slice(0, 300);
  return pesan;
}

