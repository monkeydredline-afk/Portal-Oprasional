/* ==========================================================================
   Teknisi Portal - excel.js (Modul Impor & Ekspor Spreadsheet Excel)
   ========================================================================== */
import { db, ref, push, set } from './firebase-config.js';
import { tableHeaders, dataKeysMapping } from './templates.js';
import { parseDate } from './utils.js';

function parseFlexibleDate(dateStr) {
    if (!dateStr) return null;
    const cleanStr = dateStr.trim();
    
    const dmyMatch = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
        return new Date(dmyMatch[3], dmyMatch[2] - 1, dmyMatch[1]);
    }
    
    const ymdMatch = cleanStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (ymdMatch) {
        return new Date(ymdMatch[1], ymdMatch[2] - 1, ymdMatch[3]);
    }
    
    const timestamp = Date.parse(cleanStr);
    if (!isNaN(timestamp)) {
        return new Date(timestamp);
    }
    return null;
}

function exportToExcel() {
    const data = window.globalDataCloud[window.currentTab] || [];
    if (data.length === 0) {
        if (window.showToast) window.showToast("Tidak ada data pada list ini untuk diekspor!", "warning");
        return;
    }

    const headers = tableHeaders[window.currentTab];
    const keys = dataKeysMapping[window.currentTab];

    const rows = data.map(item => {
        let row = {};
        headers.forEach((header, idx) => {
            const key = keys[idx];
            let val = item[key];
            if (val === undefined || val === null) val = '-';
            
            if (key === 'status' && window.currentTab === 'list_office') {
                const expiredStr = item.workspace_expired || item.masa_aktif || '';
                const expiredDate = parseFlexibleDate(expiredStr);
                if (expiredDate) {
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    if (expiredDate < today) {
                        val = 'Tidak Aktif';
                    }
                }
            }

            if (key === 'password' && window.currentUser.role !== 'admin') {
                val = '••••••';
            }
            row[header] = val;
        });
        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, window.currentTab);

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Ekspor_${window.currentTab}_${dateStr}.xlsx`);
    
    if (window.logActivity) window.logActivity('Lainnya', window.currentTab, `Melakukan ekspor data ke berkas Excel.`);
    if (window.showToast) window.showToast("Data berhasil diekspor ke Excel!");
}

function importSpreadsheet(e) {
    const perms = window.currentUser.permissions || {};
    if (perms.import_excel !== true && perms.import_excel !== 'true') {
        alert("Anda tidak memiliki hak akses untuk mengimpor data spreadsheet.");
        e.target.value = '';
        return;
    }

    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = evt.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const excelRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            
            if (excelRows.length === 0) {
                if (window.showToast) window.showToast("File spreadsheet kosong atau format salah", "error");
                return;
            }

            const normalizeSpreadsheetKey = (key) =>
                String(key || '')
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '');

            const buildNormalizedRowMap = (row) =>
                Object.keys(row).reduce((map, rowKey) => {
                    map[normalizeSpreadsheetKey(rowKey)] = row[rowKey];
                    return map;
                }, {});

            const labelsMapping = {
                services: "Log Services",
                penyewaan: "Data Penyewaan",
                cctv: "Proyek CCTV",
                list_laptop: "Laptop Penyewaan (Master)",
                laptop_display: "Laptop Display (Etalase)",
                inventaris: "Inventaris Suku Cadang & Alat",
                list_office: "List Akun Office",
                user_management: "User Management"
            };

            const importFieldAliases = {
                services: {
                    pelanggan: ['pelanggan', 'nama pelanggan', 'nama'],
                    no_wa: ['no_wa', 'whatsapp', 'no whatsapp', 'nomor whatsapp', 'telp', 'telepon'],
                    perangkat: ['perangkat', 'device', 'unit'],
                    kerusakan: ['kerusakan', 'gejala', 'keluhan'],
                    biaya: ['biaya', 'estimasi_biaya', 'estimasi biaya', 'harga']
                },
                penyewaan: {
                    penyewa: ['penyewa', 'nama penyewa', 'nama'],
                    no_wa: ['no_wa', 'whatsapp', 'no whatsapp', 'nomor whatsapp', 'telp', 'telepon'],
                    tgl_mulai: ['tgl_mulai', 'tanggal mulai', 'mulai_sewa', 'tgl mulai', 'tanggal_mulai'],
                    tgl_selesai: ['tgl_selesai', 'tanggal selesai', 'selesai_sewa', 'tgl selesai', 'tanggal_selesai'],
                    total_biaya: ['total_biaya', 'total biaya', 'biaya sewa', 'harga'],
                    status: ['status', 'status_pembayaran', 'pembayaran'],
                    unit: ['unit', 'unit_laptop', 'laptop']
                },
                cctv: {
                    klien: ['klien', 'nama klien', 'nama_instansi', 'instansi'],
                    lokasi: ['lokasi', 'lokasi pemasangan', 'alamat'],
                    jumlah_cctv: ['jumlah_cctv', 'jumlah', 'kamera', 'jumlah kamera'],
                    progres: ['progres', 'progres_kerja', 'status kerja'],
                    status: ['status', 'status_proyek']
                },
                list_laptop: {
                    kode_toko: ['kode_toko', 'kode toko', 'kode', 'kode_toko_unit'],
                    merk: ['merk', 'brand'],
                    tipe: ['tipe', 'model', 'tipe model', 'type'],
                    sn: ['sn', 'serial_number', 'serial number', 'serial_number_sn', 'serial number sn'],
                    spek: ['spek', 'spesifikasi', 'spesifikasi teknik', 'spesifikasi_teknik', 'spek_teknik'],
                    status: ['status'],
                    catatan: ['catatan', 'keterangan', 'notes']
                },
                laptop_display: {
                    teknisi: ['teknisi', 'nama teknisi'],
                    merk: ['merk', 'brand'],
                    tipe: ['tipe', 'model', 'tipe model', 'type'],
                    sn: ['sn', 'serial_number', 'serial number', 'serial_number_sn', 'serial number sn'],
                    spek_singkat: ['spek_singkat', 'spesifikasi_ringkas', 'spesifikasi ringkas', 'spek', 'spesifikasi'],
                    harga_jual: ['harga_jual', 'harga jual', 'harga'],
                    status: ['status', 'status_display', 'status display'],
                    catatan: ['catatan', 'keterangan', 'notes']
                },
                inventaris: {
                    nama_barang: ['nama_barang', 'nama barang', 'nama', 'barang'],
                    kode_barang: ['kode_barang', 'kode barang', 'kode', 'sku', 'part_number'],
                    kategori: ['kategori', 'jenis', 'category'],
                    stok: ['stok', 'jumlah', 'qty', 'quantity'],
                    satuan: ['satuan', 'unit'],
                    lokasi_rak: ['lokasi_rak', 'lokasi rak', 'rak', 'posisi'],
                    kondisi: ['kondisi', 'condition'],
                    catatan: ['catatan', 'keterangan', 'notes']
                },
                list_office: {
                    nama_user: ['nama_user', 'nama user', 'user', 'nama'],
                    akun: ['akun', 'email', 'gmail'],
                    password: ['password', 'pass'],
                    pemulihan: ['pemulihan', 'recovery', 'info pemulihan'],
                    tipe_akun: ['tipe_akun', 'tipe akun', 'tipe'],
                    office: ['office', 'jenis_office', 'lisensi'],
                    workspace_expired: ['workspace_expired', 'workspace_expired', 'workspace_expired'],
                    status: ['status', 'status_lisensi']
                }
            };

            const requiredImportFields = {
                services: ['pelanggan', 'no_wa', 'perangkat', 'kerusakan'],
                penyewaan: ['penyewa', 'no_wa', 'tgl_mulai', 'tgl_selesai', 'total_biaya'],
                cctv: ['klien', 'lokasi', 'jumlah_cctv'],
                list_laptop: ['kode_toko', 'merk', 'tipe', 'sn'],
                laptop_display: ['teknisi', 'merk', 'tipe', 'sn', 'spek_singkat', 'harga_jual'],
                inventaris: ['nama_barang', 'kode_barang', 'kategori', 'stok', 'satuan'],
                list_office: ['nama_user', 'akun', 'password']
            };

            const headers = Object.keys(excelRows[0]).map(normalizeSpreadsheetKey);
            const expected = requiredImportFields[window.currentTab] || [];
            const matched = expected.filter(field => {
                const aliases = (importFieldAliases[window.currentTab] && importFieldAliases[window.currentTab][field]) || [field];
                return aliases.some(alias => headers.includes(normalizeSpreadsheetKey(alias)));
            });
            if (expected.length > 0 && matched.length < Math.min(2, expected.length)) {
                const expectedHeaders = expected.map(field => {
                    const aliases = (importFieldAliases[window.currentTab] && importFieldAliases[window.currentTab][field]) || [field];
                    return aliases[0];
                });
                if (window.showToast) {
                    window.showToast(
                        `Format spreadsheet tidak cocok untuk tab [${labelsMapping[window.currentTab] || window.currentTab}]. ` +
                        `Gunakan file yang diekspor dari tab yang sama. Contoh header yang dibutuhkan: ${expectedHeaders.join(', ')}.`,
                        'error'
                    );
                }
                return;
            }

            const tabNameStr = labelsMapping[window.currentTab] || window.currentTab;
            if (!confirm(`Ditemukan ${excelRows.length} baris data. Impor langsung ke cloud database pada list [${tabNameStr}]?`)) return;

            const targetNodeRef = ref(db, window.currentTab);
            const d = new Date();
            const tglInput = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            
            const currentDataTab = window.globalDataCloud[window.currentTab] || [];
            let currentMaxId = currentDataTab.length === 0 ? 0 : Math.max(...currentDataTab.map(l => Number(l.id) || 0));

            excelRows.forEach((row) => {
                currentMaxId++;
                
                const normalizedRow = buildNormalizedRowMap(row);
                const getVal = (possibleKeys, defaultVal = '-') => {
                    const normalizedKeys = possibleKeys.map(normalizeSpreadsheetKey);

                    for (let nk of normalizedKeys) {
                        if (normalizedRow[nk] !== undefined) return normalizedRow[nk];
                    }

                    for (let normRowKey of Object.keys(normalizedRow)) {
                        for (let nk of normalizedKeys) {
                            if (normRowKey === nk || normRowKey.includes(nk) || nk.includes(normRowKey)) {
                                return normalizedRow[normRowKey];
                            }
                        }
                    }
                    return defaultVal;
                };

                let newItemData = {
                    id: currentMaxId,
                    tanggal: getVal(['tanggal', 'tanggal_input', 'tanggal_masuk', 'tgl', 'date'], tglInput),
                    cabang: getVal(['cabang', 'cabang_toko'], window.currentUser.branch || 'Head Office')
                };

                if (window.currentTab === 'list_laptop') {
                    let textSpek = getVal(['spek', 'spesifikasi', 'spek_teknik'], '');
                    if(!textSpek && (row.processor || row.ram || row.storage)) {
                        textSpek = `CPU: ${row.processor || '-'}\nRAM: ${row.ram || '-'}\nStorage: ${row.storage || '-'}\nVGA/Layar: ${row.vga || '-'} (Non-Touch)`;
                    }
                    newItemData.cabang = getVal(['cabang', 'cabang_toko'], 'Monumen Emmy Saelan');
                    newItemData.kode_toko = getVal(['kode_toko', 'kode'], '-');
                    newItemData.merk = getVal(['merk', 'brand'], '-');
                    newItemData.tipe = getVal(['tipe', 'model'], '-');
                    newItemData.sn = String(getVal(['sn', 'serial_number', 'serial'], '-'));
                    newItemData.spek = textSpek || '-';
                    newItemData.status = getVal(['status'], 'Tersedia');
                    newItemData.catatan = getVal(['catatan', 'keterangan'], '');

                } else if (window.currentTab === 'laptop_display') {
                    let textSpek = getVal(['spek_singkat', 'spesifikasi_ringkas', 'spek', 'spesifikasi'], '-');
                    newItemData.cabang = getVal(['cabang', 'cabang_toko'], 'Monumen Emmy Saelan');
                    newItemData.teknisi = getVal(['teknisi', 'nama_teknisi'], '-');
                    newItemData.merk = getVal(['merk', 'brand'], '-');
                    newItemData.tipe = getVal(['tipe', 'model', 'tipe_model'], '-');
                    newItemData.sn = String(getVal(['sn', 'serial_number', 'serial', 'serial_number_sn'], '-'));
                    newItemData.spek_singkat = textSpek;
                    newItemData.harga_jual = getVal(['harga_jual', 'harga'], 0);
                    newItemData.status = getVal(['status', 'status_display'], 'Ready');
                    newItemData.catatan = getVal(['catatan', 'keterangan'], '');

                } else if (window.currentTab === 'inventaris') { 
                    newItemData.nama_barang = getVal(['nama_barang', 'nama', 'barang'], '-');
                    newItemData.kode_barang = getVal(['kode_barang', 'kode', 'sku', 'part_number'], '-');
                    const kategoriValue = getVal(['kategori', 'jenis', 'category'], 'Sparepart Laptop');
                    newItemData.kategori = kategoriValue;
                    newItemData.stok = Number(getVal(['stok', 'jumlah', 'qty'], 0)) || 0;
                    newItemData.satuan = getVal(['satuan', 'unit'], 'Pcs');
                    newItemData.lokasi_rak = getVal(['lokasi_rak', 'rak', 'posisi'], '');
                    newItemData.kondisi = getVal(['kondisi', 'condition'], 'Baik');
                    newItemData.catatan = getVal(['catatan', 'keterangan', 'notes'], '');

                } else if (window.currentTab === 'services') {
                    newItemData.pelanggan = getVal(['pelanggan', 'nama_pelanggan', 'nama'], '-');
                    newItemData.no_wa = getVal(['no_wa', 'whatsapp', 'telp'], '-');
                    newItemData.perangkat = getVal(['perangkat', 'device', 'unit'], '-');
                    newItemData.kerusakan = getVal(['kerusakan', 'gejala', 'keluhan'], '-');
                    newItemData.biaya = getVal(['biaya', 'estimasi_biaya', 'harga'], 0);
                    newItemData.status = getVal(['status'], 'Antrean');
                    newItemData.teknisi = getVal(['teknisi', 'nama_teknisi'], 'Belum Ditentukan');
                    newItemData.tindakan_teknisi = '';

                } else if (window.currentTab === 'penyewaan') {
                    newItemData.penyewa = getVal(['penyewa', 'nama_penyewa', 'nama'], '-');
                    newItemData.no_wa = getVal(['no_wa', 'whatsapp', 'telp'], '-');
                    newItemData.tgl_mulai = getVal(['tgl_mulai', 'mulai_sewa', 'tgl_sewa'], tglInput);
                    newItemData.tgl_selesai = getVal(['tgl_selesai', 'selesai_sewa', 'tgl_kembali'], tglInput);
                    newItemData.total_biaya = getVal(['total_biaya', 'biaya_sewa', 'harga'], 0);
                    newItemData.status = getVal(['status', 'status_pembayaran'], 'Belum Bayar');
                    newItemData.unit = getVal(['unit', 'unit_laptop', 'laptop'], '-');

                } else if (window.currentTab === 'cctv') {
                    newItemData.klien = getVal(['klien', 'nama_klien', 'instansi'], '-');
                    newItemData.lokasi = getVal(['lokasi', 'lokasi_pemasangan', 'alamat'], '-');
                    newItemData.jumlah_cctv = getVal(['jumlah_cctv', 'jumlah', 'kamera'], 0);
                    newItemData.progres = getVal(['progres', 'progres_kerja'], 'Penarikan Kabel');
                    newItemData.status = getVal(['status', 'status_proyek'], 'Survei');

                } else if (window.currentTab === 'list_office') {
                    newItemData.nama_user = getVal(['nama_user', 'user', 'nama'], '-');
                    newItemData.akun = getVal(['akun', 'email', 'gmail'], '-');
                    newItemData.password = getVal(['password', 'pass'], '-');
                    newItemData.pemulihan = getVal(['pemulihan', 'info_pemulihan'], '-');
                    newItemData.tipe_akun = getVal(['tipe_akun', 'tipe'], 'Anggota'); 
                    newItemData.office = getVal(['office', 'jenis_office', 'lisensi'], '-');
                    newItemData.name = getVal(['name', 'device', 'nama_pc'], '-');
                    newItemData.workspace_expired = getVal(['workspace_expired', 'workspace_expired', 'workspace_expired'], '-');
                    newItemData.status = getVal(['status', 'status_lisensi'], 'Aktif');
                }

                const newPostPushRef = push(targetNodeRef);
                set(newPostPushRef, newItemData);
            });

            if (window.logActivity) window.logActivity('Impor', window.currentTab, `Mengimpor sebanyak ${excelRows.length} baris data dari file spreadsheet.`);
            if (window.showToast) window.showToast("Data spreadsheet berhasil diimpor!");
            e.target.value = ''; 
        } catch (err) {
            alert("Gagal membaca dokumen spreadsheet: " + err.message);
        }
    };
    reader.readAsBinaryString(file);
}

// Kaitkan ke objek global window agar diakses oleh HTML event handler
window.exportToExcel = exportToExcel;
window.importSpreadsheet = importSpreadsheet;