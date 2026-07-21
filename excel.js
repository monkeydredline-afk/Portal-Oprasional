/* ==========================================================================
   Teknisi Portal - excel.js (Robust Version - Strict Validation & Hybrid Export)
   ========================================================================== */
import { db, ref, push, set } from './firebase-config.js';
import { tableHeaders, dataKeysMapping, importTemplatesHeaders, importTemplatesKeys } from './templates.js';

// Fungsi pembantu konversi tanggal fleksibel dari Excel
function parseFlexibleDate(dateStr) {
    if (!dateStr) return null;
    const cleanStr = String(dateStr).trim();
    
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

// ==========================================================================
// 1. FUNGSI EKSPOR HYBRID (DUA OPSI)
// ==========================================================================
function exportToExcel(isCompatibleForImport = false) {
    const data = window.globalDataCloud[window.currentTab] || [];
    if (data.length === 0) {
        if (window.showToast) window.showToast("Tidak ada data pada list ini untuk diekspor!", "warning");
        return;
    }

    let headers = [];
    let keys = [];

    if (isCompatibleForImport) {
        // Menggunakan kolom sekuensial bersih (Sesuai Blueprint Impor)
        headers = importTemplatesHeaders[window.currentTab] || [];
        keys = importTemplatesKeys[window.currentTab] || [];
    } else {
        // Menggunakan kolom lengkap tabel web asli (Termasuk ID & Aksi)
        headers = tableHeaders[window.currentTab] || [];
        keys = dataKeysMapping[window.currentTab] || [];
    }

    const rows = data.map(item => {
        let row = {};
        headers.forEach((header, idx) => {
            const key = keys[idx];
            if (!key) return;
            
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
    const filePrefix = isCompatibleForImport ? "Format_Impor" : "Laporan_Ekspor";
    XLSX.writeFile(workbook, `${filePrefix}_${window.currentTab}_${dateStr}.xlsx`);
    
    if (window.logActivity) window.logActivity('Lainnya', window.currentTab, `Melakukan ekspor data ke berkas Excel (${filePrefix}).`);
    if (window.showToast) window.showToast("Data berhasil diekspor ke Excel!");
}

// ==========================================================================
// 2. FUNGSI UNDUH TEMPLATE KOSONG SEKUENSIL
// ==========================================================================
function downloadExcelTemplate() {
    const headers = importTemplatesHeaders[window.currentTab];
    if (!headers) {
        if (window.showToast) window.showToast("Tidak ada template impor tersedia untuk tab ini.", "warning");
        return;
    }

    // Membuat baris header tunggal kosong
    const sheetData = [headers];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Template_${window.currentTab}`);

    XLSX.writeFile(workbook, `Template_Impor_${window.currentTab}.xlsx`);
    if (window.showToast) window.showToast("Template berhasil diunduh!");
}

// ==========================================================================
// 3. FUNGSI IMPOR DENGAN VALIDASI MUTLAK
// ==========================================================================
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
            
            // Baca baris pertama secara mentah untuk memverifikasi struktur header sekuensial
            const headersRaw = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] || [];
            const cleanHeaders = headersRaw.map(h => String(h || '').trim());

            const expectedHeaders = importTemplatesHeaders[window.currentTab] || [];
            
            // VERIFIKASI MUTLAK LAPIS 1: Jumlah Kolom
            if (cleanHeaders.length !== expectedHeaders.length) {
                alert(`⚠️ STRUKTUR KOLOM SALAH!\n\n` +
                      `Sistem mendeteksi file Excel Anda memiliki ${cleanHeaders.length} kolom.\n` +
                      `Seharusnya file berisi tepat ${expectedHeaders.length} kolom berikut:\n` +
                      `[ ${expectedHeaders.join(' | ')} ]\n\n` +
                      `Silakan unduh template resmi terlebih dahulu.`);
                e.target.value = '';
                return;
            }

            // VERIFIKASI MUTLAK LAPIS 2 & 3: Nama Kolom & Urutan Sekuensial
            for (let i = 0; i < expectedHeaders.length; i++) {
                if (cleanHeaders[i] !== expectedHeaders[i]) {
                    alert(`⚠️ URUTAN / NAMA KOLOM SALAH!\n\n` +
                          `Ketidakcocokan terdeteksi pada Kolom ke-${i + 1}:\n` +
                          `- File Anda: '${cleanHeaders[i] || '(Kosong/Tanpa Header)'}'\n` +
                          `- Aturan Sistem: '${expectedHeaders[i]}'\n\n` +
                          `File Excel untuk tab ini harus disusun secara urut. Silakan perbaiki urutan atau unduh template resmi.`);
                    e.target.value = '';
                    return;
                }
            }

            // Konversi sisa baris menjadi objek JSON
            const excelRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            if (excelRows.length === 0) {
                if (window.showToast) window.showToast("File spreadsheet kosong (Tidak ada baris data).", "error");
                e.target.value = '';
                return;
            }

            const tabLabels = {
                services: "Log Services",
                penyewaan: "Data Penyewaan",
                cctv: "Proyek CCTV",
                list_laptop: "Laptop Penyewaan",
                laptop_display: "Laptop Display",
                inventaris: "Inventaris Suku Cadang",
                list_office: "List Akun Office",
                master_jasa: "Master Data Jasa",
                katalog_produk: "Katalog Produk"
            };

            const tabNameStr = tabLabels[window.currentTab] || window.currentTab;
            if (!confirm(`Struktur Kolom Sesuai Standard (Mutlak)!\n\nApakah Anda yakin ingin mengimpor ${excelRows.length} baris data ke dalam tab [ ${tabNameStr} ]?`)) {
                e.target.value = '';
                return;
            }

            const targetNodeRef = ref(db, window.currentTab);
            const d = new Date();
            const tglInput = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            
            const currentDataTab = window.globalDataCloud[window.currentTab] || [];
            // ID database diisikan secara berurutan otomatis berbasis nilai maksimum yang ada di Firebase
            let currentMaxId = currentDataTab.length === 0 ? 0 : Math.max(...currentDataTab.map(l => Number(l.id) || 0));

            const keys = importTemplatesKeys[window.currentTab];

            excelRows.forEach((row) => {
                currentMaxId++;
                
                let newItemData = {
                    id: currentMaxId,
                    tanggal: tglInput, // Bawaan default jika tidak terisi
                    cabang: window.currentUser.branch || 'Head Office'
                };

                // Map kolom dari file Excel sekuensial ke properti data Firebase secara otomatis
                expectedHeaders.forEach((header, idx) => {
                    const key = keys[idx];
                    let rawVal = row[header];
                    if (rawVal === undefined || rawVal === null) rawVal = '';
                    
                    if (key) {
                        newItemData[key] = String(rawVal).trim();
                    }
                });

                // Pembersihan format nilai khusus tipe data numerik
                if (newItemData.stok !== undefined) newItemData.stok = Number(newItemData.stok) || 0;
                if (newItemData.biaya !== undefined) newItemData.biaya = String(newItemData.biaya).replace(/\D/g, '') || '0';
                if (newItemData.total_biaya !== undefined) newItemData.total_biaya = String(newItemData.total_biaya).replace(/\D/g, '') || '0';
                if (newItemData.harga_modal !== undefined) newItemData.harga_modal = String(newItemData.harga_modal).replace(/\D/g, '') || '0';
                if (newItemData.harga_jual !== undefined) newItemData.harga_jual = String(newItemData.harga_jual).replace(/\D/g, '') || '0';

                // Format Tanggal Excel jika berantakan
                if (newItemData.tanggal && newItemData.tanggal.includes('-')) {
                    const parts = newItemData.tanggal.split('-');
                    if (parts[0] && parts[0].length === 4) {
                        newItemData.tanggal = `${parts[2]}/${parts[1]}/${parts[0]}`;
                    }
                }

                const newPostPushRef = push(targetNodeRef);
                set(newPostPushRef, newItemData);
            });

            if (window.logActivity) window.logActivity('Impor', window.currentTab, `Berhasil mengimpor ${excelRows.length} baris data standar sekuensial.`);
            if (window.showToast) window.showToast("Data standar berhasil diimpor!");
            e.target.value = ''; 
        } catch (err) {
            alert("Gagal memproses dokumen spreadsheet: " + err.message);
            e.target.value = '';
        }
    };
    reader.readAsBinaryString(file);
}

// Kaitkan ke objek global window agar diakses oleh HTML event handler
window.exportToExcel = exportToExcel;
window.downloadExcelTemplate = downloadExcelTemplate;
window.importSpreadsheet = importSpreadsheet;