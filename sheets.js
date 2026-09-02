/* ==========================================================================
   Teknisi Portal - sheets.js (Modul 2 Mode Sync & Spesifikasi Ultra-Ringkas)
   ========================================================================== */
import { parseDate } from './utils.js';

// URL Web App Google Apps Script Anda
const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx3p0WWcrOGNHotVs98stDsJ4rRtn7Li0Qpv5Ht_bvVkH2mgtV7iWQnXMUU-iewzLieXw/exec";

const NAMA_BULAN = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const NAMA_BULAN_SINGKAT = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

let activeSyncMode = 'monthly'; // 'monthly' atau 'custom_date'

/**
 * HELPER: Mempersingkat Spesifikasi (Opsi 2: Processor / RAM / Storage)
 */
function compactSpecs(spekStr, jenisUnit = 'Laptop') {
    if (!spekStr) return '-';
    
    if (jenisUnit === 'Printer') {
        return spekStr.replace(/\n+/g, ' / ').replace(/\s+/g, ' ').trim();
    }
    
    let cpu = '', ram = '', storage = '';
    const lines = spekStr.split('\n');
    
    lines.forEach(line => {
        const clean = line.trim();
        if (/^cpu:\s*/i.test(clean)) {
            cpu = clean.replace(/^cpu:\s*/i, '').trim();
        } else if (/^ram:\s*/i.test(clean)) {
            ram = clean.replace(/^ram:\s*/i, '').trim();
        } else if (/^(ssd\/hdd|storage):\s*/i.test(clean)) {
            storage = clean.replace(/^(ssd\/hdd|storage):\s*/i, '').trim();
        }
    });

    const parts = [cpu, ram, storage].filter(Boolean);
    if (parts.length > 0) {
        return parts.join(' / ');
    }

    // Fallback jika tidak menggunakan format standar CPU/RAM
    return spekStr.replace(/\n+/g, ' / ').replace(/\s+/g, ' ').trim();
}

/**
 * Filter berdasarkan Bulan
 */
function filterDataByMonth(dataArray, selectedYear, selectedMonth, dateField = 'tanggal') {
    return (dataArray || []).filter(item => {
        const rawDate = item[dateField];
        if (!rawDate) return false;
        const d = parseDate(rawDate);
        if (!d) return false;
        return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });
}

/**
 * Filter berdasarkan Rentang Tanggal
 */
function filterDataByDateRange(dataArray, startDate, endDate, dateField = 'tanggal') {
    return (dataArray || []).filter(item => {
        const rawDate = item[dateField];
        if (!rawDate) return false;
        const d = parseDate(rawDate);
        if (!d) return false;
        return d >= startDate && d <= endDate;
    });
}

/**
 * Membangun Ringkasan Eksekutif 7 Tabel Lengkap (Penyaringan Ketat Aset Aktif - Opsi A)
 */
function buildRingkasanData(servicesList, sewaList, masterLaptopAll, displayList, cctvList, officeList) {
    const branches = ["Monumen Emmy Saelan", "Perintis"];

    // 1. MONITORING SERVISAN TOKO (PER CABANG)
    const servicesBreakdown = branches.map(b => {
        const list = servicesList.filter(s => (s.cabang || '').toLowerCase().includes(b.toLowerCase()) || (b === "Monumen Emmy Saelan" && !s.cabang));
        return {
            cabang: b,
            antrean: list.filter(s => s.status === 'Antrean').length,
            proses: list.filter(s => s.status === 'Proses').length,
            vendor: list.filter(s => s.status === 'Oper Vendor').length,
            konfirmasi: list.filter(s => s.status === 'Tunggu Konfirmasi').length,
            selesai: list.filter(s => s.status === 'Selesai').length,
            cancel: list.filter(s => s.status === 'Cancel').length
        };
    });

    // 2. MONITORING KECEPATAN SERVISAN & TEKNISI (HANYA UNTUK TEKNISI AKTIF)
    const teknisiMap = {};
    (servicesList || []).forEach(s => {
        const rawTeknisi = (s.teknisi || '').trim();

        // JIKA TEKNISI MASIH KOSONG / '-' / 'BELUM DITENTUKAN', LANGSUNG LEWATI (SKIP)
        if (!rawTeknisi || rawTeknisi === '-' || rawTeknisi.toLowerCase().includes('belum')) {
            return; 
        }

        const namaTeknisi = rawTeknisi;

        if (!teknisiMap[namaTeknisi]) {
            teknisiMap[namaTeknisi] = {
                teknisi: namaTeknisi,
                cepat: 0,       // <= 1 Hari
                standar: 0,     // 2 - 3 Hari
                lama: 0,        // > 3 Hari
                masihProses: 0, // Antrean, Proses, Oper Vendor, Tunggu Konfirmasi
                totalHariSelesai: 0,
                jumlahSelesai: 0,
                totalUnit: 0
            };
        }

        const tekData = teknisiMap[namaTeknisi];
        tekData.totalUnit++;

        const status = (s.status || '').trim();

        if (status === 'Selesai') {
            const dMasuk = parseDate(s.tanggal);
            const dSelesai = parseDate(s.tgl_selesai) || dMasuk;

            let diffDays = 0;
            if (dMasuk && dSelesai) {
                const diffTime = Math.abs(dSelesai.getTime() - dMasuk.getTime());
                diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            }

            tekData.totalHariSelesai += diffDays;
            tekData.jumlahSelesai++;

            if (diffDays <= 1) {
                tekData.cepat++;
            } else if (diffDays <= 3) {
                tekData.standar++;
            } else {
                tekData.lama++;
            }
        } else if (['Antrean', 'Proses', 'Oper Vendor', 'Tunggu Konfirmasi'].includes(status)) {
            tekData.masihProses++;
        }
    });

    const teknisiBreakdown = Object.values(teknisiMap).map(t => {
        const rataRata = t.jumlahSelesai > 0 
            ? (t.totalHariSelesai / t.jumlahSelesai).toFixed(1) + " Hari" 
            : "0.0 Hari";

        return {
            teknisi: t.teknisi,
            cepat: t.cepat,
            standar: t.standar,
            lama: t.lama,
            masihProses: t.masihProses,
            rataRata: rataRata,
            totalUnit: t.totalUnit
        };
    }).sort((a, b) => b.totalUnit - a.totalUnit);

    // 3. MONITORING TRANSAKSI PENYEWAAN (PER CABANG)
    const penyewaanBreakdown = branches.map(b => {
        const list = sewaList.filter(s => (s.cabang || '').toLowerCase().includes(b.toLowerCase()) || (b === "Monumen Emmy Saelan" && !s.cabang));
        return {
            cabang: b,
            total: list.length,
            proses: list.filter(s => s.status === 'Proses').length,
            perpanjangan: list.filter(s => s.status === 'Perpanjangan').length,
            selesai: list.filter(s => s.status === 'Selesai').length,
            batal: list.filter(s => s.status === 'Dibatalkan').length
        };
    });

    // 4. MONITORING INVENTARIS UNIT DISPLAY (DIURUTKAN PER CABANG LALU MODEL A-Z)
    const displayModelMap = {};
    (displayList || []).forEach(d => {
        const st = (d.status || '').trim().toLowerCase();
        // Hanya loloskan unit display yang aktif (Ready / Terjual)
        if (st === 'gudang' || st === 'rusak' || st === 'maintenance') return;

        const cabang = (d.cabang || '').toLowerCase().includes('perintis') ? 'Perintis' : 'Monumen Emmy Saelan';
        const model = `${d.merk || ''} ${d.tipe || ''}`.trim() || 'Model Tidak Diketahui';
        const key = `${cabang}___${model}`;

        if (!displayModelMap[key]) {
            displayModelMap[key] = {
                cabang: cabang,
                model: model,
                ready: 0,
                terjual: 0,
                total: 0
            };
        }

        displayModelMap[key].total++;
        if (d.status === 'Terjual') {
            displayModelMap[key].terjual++;
        } else {
            displayModelMap[key].ready++;
        }
    });

    const displayModelsBreakdown = Object.values(displayModelMap).sort((a, b) => {
        if (a.cabang !== b.cabang) {
            return a.cabang === 'Monumen Emmy Saelan' ? -1 : 1;
        }
        return a.model.localeCompare(b.model);
    });

    // 5. MONITORING INVENTARIS UNIT PENYEWAAN (WHITELIST: HANYA TERSEDIA, DISEWA, STAF)
    // Saring di awal: Buang semua status Hilang, Maintenance, Rusak, Terjual
    const activeLaptops = (masterLaptopAll || []).filter(l => {
        const st = (l?.status || '').trim().toLowerCase();
        return st === 'tersedia' || st === 'disewa' || st === 'staf';
    });

    const sewaModelMap = {};
    activeLaptops.forEach(l => {
        const cabang = (l.cabang || '').toLowerCase().includes('perintis') ? 'Perintis' : 'Monumen Emmy Saelan';
        const model = `${l.merk || ''} ${l.tipe || ''}`.trim() || 'Model Tidak Diketahui';
        const key = `${cabang}___${model}`;

        if (!sewaModelMap[key]) {
            sewaModelMap[key] = {
                cabang: cabang,
                model: model,
                ready: 0,
                disewa: 0,
                staf: 0,
                total: 0
            };
        }

        sewaModelMap[key].total++;
        const st = (l.status || '').trim();
        if (st === 'Tersedia') sewaModelMap[key].ready++;
        else if (st === 'Disewa') sewaModelMap[key].disewa++;
        else if (st === 'Staf') sewaModelMap[key].staf++;
    });

    const sewaModelsBreakdown = Object.values(sewaModelMap).sort((a, b) => {
        if (a.cabang !== b.cabang) {
            return a.cabang === 'Monumen Emmy Saelan' ? -1 : 1;
        }
        return a.model.localeCompare(b.model);
    });

    // 6. KETERSEDIAAN ASET UNIT PENYEWAAN & DISPLAY (RINGKASAN TOTAL AKTIF PER CABANG)
    const asetBreakdown = branches.map(b => {
        const lapList = activeLaptops.filter(l => (l.cabang || '').toLowerCase().includes(b.toLowerCase()) || (b === "Monumen Emmy Saelan" && !l.cabang));
        const dispList = (displayList || []).filter(d => (d.cabang || '').toLowerCase().includes(b.toLowerCase()) || (b === "Monumen Emmy Saelan" && !d.cabang));

        return {
            cabang: b,
            gudangReady: lapList.filter(l => l.status === 'Tersedia').length,
            gudangSewa: lapList.filter(l => l.status === 'Disewa').length,
            gudangStaf: lapList.filter(l => l.status === 'Staf').length,
            displayReady: dispList.filter(d => d.status === 'Ready' || !d.status).length,
            displaySold: dispList.filter(d => d.status === 'Terjual').length
        };
    });

    // 7. REKAPITULASI MEREK LAPTOP / PERANGKAT SERVISAN (3 KOLOM BERSIH)
    function extractServiceBrand(perangkatStr) {
        if (!perangkatStr) return 'Lainnya';
        const clean = perangkatStr.trim().toLowerCase();
        if (clean.includes('lenovo') || clean.includes('thinkpad') || clean.includes('ideapad') || clean.includes('legion')) return 'Lenovo';
        if (clean.includes('asus') || clean.includes('rog') || clean.includes('tuf') || clean.includes('zenbook') || clean.includes('vivobook')) return 'Asus';
        if (clean.includes('acer') || clean.includes('predator') || clean.includes('nitro') || clean.includes('aspire') || clean.includes('swift')) return 'Acer';
        if (clean.includes('hp') || clean.includes('pavilion') || clean.includes('omen') || clean.includes('victus') || clean.includes('elitebook') || clean.includes('probook')) return 'HP';
        if (clean.includes('apple') || clean.includes('macbook') || clean.includes('mac') || clean.includes('imac')) return 'Apple / MacBook';
        if (clean.includes('dell') || clean.includes('latitude') || clean.includes('inspiron') || clean.includes('vostro') || clean.includes('alienware')) return 'Dell';
        if (clean.includes('msi')) return 'MSI';
        if (clean.includes('axioo')) return 'Axioo';
        if (clean.includes('toshiba') || clean.includes('dynabook')) return 'Toshiba';
        if (clean.includes('fujitsu')) return 'Fujitsu';
        if (clean.includes('samsung')) return 'Samsung';
        if (clean.includes('epson') || clean.includes('canon') || clean.includes('brother')) return 'Printer';
        if (clean.includes('pc') || clean.includes('rakitan') || clean.includes('aio') || clean.includes('desktop')) return 'PC Desktop';
        
        const firstWord = perangkatStr.trim().split(' ')[0];
        if (firstWord && firstWord.length >= 2) {
            return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
        }
        return 'Lainnya';
    }

    const serviceBrandMap = {};
    (servicesList || []).forEach(s => {
        const cabang = (s.cabang || '').toLowerCase().includes('perintis') ? 'Perintis' : 'Monumen Emmy Saelan';
        const brand = extractServiceBrand(s.perangkat || '');
        const key = `${cabang}___${brand}`;

        if (!serviceBrandMap[key]) {
            serviceBrandMap[key] = {
                cabang: cabang,
                brand: brand,
                total: 0
            };
        }
        serviceBrandMap[key].total++;
    });

    const servicesBrandsBreakdown = Object.values(serviceBrandMap).sort((a, b) => {
        if (a.cabang !== b.cabang) {
            return a.cabang === 'Monumen Emmy Saelan' ? -1 : 1;
        }
        return b.total - a.total; // Urutkan dari jumlah unit terbanyak
    });

    // RETURN KESELURUHAN 7 DATA RINGKASAN
    return {
        servicesBreakdown,
        teknisiBreakdown,
        penyewaanBreakdown,
        displayModelsBreakdown,
        sewaModelsBreakdown,
        asetBreakdown,
        servicesBrandsBreakdown
    };
}
/**
 * Format label periode untuk rentang tanggal
 */
function formatCustomDateLabel(startDate, endDate) {
    const sD = startDate.getDate();
    const sM = NAMA_BULAN_SINGKAT[startDate.getMonth()];
    const sY = startDate.getFullYear();

    const eD = endDate.getDate();
    const eM = NAMA_BULAN_SINGKAT[endDate.getMonth()];
    const eY = endDate.getFullYear();

    if (startDate.toDateString() === endDate.toDateString()) {
        return `${sD} ${sM} ${sY}`;
    }
    if (sM === eM && sY === eY) {
        return `${String(sD).padStart(2, '0')}-${String(eD).padStart(2, '0')} ${sM} ${sY}`;
    }
    if (sY === eY) {
        return `${sD} ${sM} - ${eD} ${eM} ${sY}`;
    }
    return `${sD} ${sM} ${sY} - ${eD} ${eM} ${eY}`;
}

/**
 * Modal Pop-Up Sinkronisasi Google Sheets (Dua Mode)
 */
function ensureSheetsModalExists() {
    if (document.getElementById('sheets-sync-modal')) return;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const todayFormatted = today.toISOString().slice(0, 10);

    let monthOptions = '';
    NAMA_BULAN.forEach((m, idx) => {
        monthOptions += `<option value="${idx}" ${idx === currentMonth ? 'selected' : ''}>${m}</option>`;
    });

    let yearOptions = '';
    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
        yearOptions += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
    }

    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = `
        <div id="sheets-sync-modal" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
                <header class="bg-slate-900 text-white p-4 flex justify-between items-center px-6">
                    <h3 class="font-bold flex items-center gap-2 text-sm md:text-base">
                        <i class="fa-solid fa-file-excel text-emerald-400"></i> Sinkronisasi Google Sheets
                    </h3>
                    <button type="button" onclick="window.closeSheetsSyncModal()" class="text-slate-400 hover:text-white transition">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </header>

                <div class="p-6 space-y-4 bg-slate-50">
                    <!-- SAKLAR TIGA MODE -->
                    <div class="grid grid-cols-3 gap-1.5 p-1 bg-slate-200/80 rounded-xl border border-slate-300/50">
                        <button type="button" id="tab-mode-monthly" onclick="window.switchSheetsSyncMode('monthly')" class="py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 bg-white text-emerald-700 shadow-xs">
                            <i class="fa-solid fa-calendar-days"></i> <span>Bulanan</span>
                        </button>
                        <button type="button" id="tab-mode-custom" onclick="window.switchSheetsSyncMode('custom_date')" class="py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 text-slate-600 hover:text-slate-900">
                            <i class="fa-solid fa-file-circle-plus"></i> <span>Kustom</span>
                        </button>
                        <button type="button" id="tab-mode-display" onclick="window.switchSheetsSyncMode('display_only')" class="py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 text-slate-600 hover:text-slate-900">
                            <i class="fa-solid fa-desktop"></i> <span>Display (4 Tab)</span>
                        </button>
                    </div>

                    <!-- KONTEN MODE 1: BULANAN -->
                    <div id="mode-monthly-content" class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                        <div class="flex items-center justify-between border-b pb-2">
                            <span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Pilih Bulan & Tahun</span>
                            <span class="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 font-bold px-2 py-0.5 rounded-full">Di Spreadsheet Utama</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-[10px] text-slate-400 font-bold mb-1">Bulan</label>
                                <select id="sheets-sync-month" class="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                                    ${monthOptions}
                                </select>
                            </div>
                            <div>
                                <label class="block text-[10px] text-slate-400 font-bold mb-1">Tahun</label>
                                <select id="sheets-sync-year" class="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                                    ${yearOptions}
                                </select>
                            </div>
                        </div>
                        <p class="text-[11px] text-slate-500 italic">Membuat / memperbarui 6 tab sheet bulan terkait pada file spreadsheet utama Anda.</p>
                    </div>

                    <!-- KONTEN MODE 2: KUSTOM TANGGAL (FILE BARU) -->
                    <div id="mode-custom-content" class="hidden bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                        <div class="flex items-center justify-between border-b pb-2">
                            <span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Pilih Rentang Tanggal</span>
                            <span class="text-[10px] text-purple-600 bg-purple-50 border border-purple-200 font-bold px-2 py-0.5 rounded-full">✨ Buat File Baru</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-[10px] text-slate-400 font-bold mb-1">Tanggal Mulai</label>
                                <input type="date" id="sheets-sync-start-date" value="${todayFormatted}" class="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            </div>
                            <div>
                                <label class="block text-[10px] text-slate-400 font-bold mb-1">Tanggal Selesai</label>
                                <input type="date" id="sheets-sync-end-date" value="${todayFormatted}" class="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                            </div>
                        </div>
                        <p class="text-[11px] text-slate-500 leading-relaxed">
                            Otomatis membuat <strong>File Google Spreadsheet Baru</strong> berjudul:<br>
                            <span class="font-mono text-purple-700 font-bold text-[10px] block mt-1" id="preview-custom-filename">Laporan Operasional (${today.getDate()} ${NAMA_BULAN_SINGKAT[today.getMonth()]} ${today.getFullYear()}) - Wana Satria</span>
                        </p>
                    </div>

                    <!-- KONTEN MODE 3: KHUSUS DISPLAY (4 TAB) -->
                    <div id="mode-display-content" class="hidden bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                        <div class="flex items-center justify-between border-b pb-2">
                            <span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Sinkronisasi Khusus Unit Display</span>
                            <span class="text-[10px] text-purple-600 bg-purple-50 border border-purple-200 font-bold px-2 py-0.5 rounded-full">Di Spreadsheet Utama</span>
                        </div>
                        <div class="p-3 bg-purple-50/50 rounded-xl border border-purple-100 text-xs text-slate-600 space-y-1.5">
                            <p class="font-bold text-purple-900">Otomatis menyinkronkan 4 Tab Khusus Display:</p>
                            <ul class="list-disc list-inside space-y-0.5 text-[11px] text-slate-700 font-medium">
                                <li><strong>Tab 1:</strong> Ringkasan Display (Rekapitulasi Cabang & Model)</li>
                                <li><strong>Tab 2:</strong> Display - Semua Cabang (Gabungan)</li>
                                <li><strong>Tab 3:</strong> Display - Emmy Saelan</li>
                                <li><strong>Tab 4:</strong> Display - Perintis</li>
                            </ul>
                        </div>
                    </div>

                    <!-- LINK FILE BARU HASIL SINKRONISASI -->
                    <div id="sheets-sync-result-link" class="hidden bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-center space-y-2">
                        <p class="text-xs font-bold text-emerald-900"><i class="fa-solid fa-circle-check text-emerald-600"></i> File Spreadsheet Baru Siap!</p>
                        <a id="btn-open-new-sheet" href="#" target="_blank" class="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> <span>Buka File Spreadsheet Baru</span>
                        </a>
                    </div>
                </div>

                <div class="p-4 border-t bg-white flex justify-end space-x-3">
                    <button type="button" onclick="window.closeSheetsSyncModal()" class="px-4 py-2 border rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition">
                        Tutup
                    </button>
                    <button type="button" id="btn-execute-sheets-sync" onclick="window.executeGoogleSheetsSync()" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-2">
                        <i class="fa-solid fa-cloud-arrow-up"></i> <span>Mulai Sinkronisasi</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modalDiv.firstElementChild);

    const startInput = document.getElementById('sheets-sync-start-date');
    const endInput = document.getElementById('sheets-sync-end-date');
    const updatePreview = () => {
        const sVal = startInput?.value;
        const eVal = endInput?.value;
        const previewEl = document.getElementById('preview-custom-filename');
        if (sVal && eVal && previewEl) {
            const sDate = new Date(sVal);
            const eDate = new Date(eVal);
            const label = formatCustomDateLabel(sDate, eDate);
            previewEl.innerText = `Laporan Operasional (${label}) - Wana Satria`;
        }
    };
    if (startInput) startInput.addEventListener('change', updatePreview);
    if (endInput) endInput.addEventListener('change', updatePreview);
}

window.switchSheetsSyncMode = function(mode) {
    activeSyncMode = mode;
    const tabMonthly = document.getElementById('tab-mode-monthly');
    const tabCustom = document.getElementById('tab-mode-custom');
    const tabDisplay = document.getElementById('tab-mode-display');

    const contentMonthly = document.getElementById('mode-monthly-content');
    const contentCustom = document.getElementById('mode-custom-content');
    const contentDisplay = document.getElementById('mode-display-content');
    const resultLink = document.getElementById('sheets-sync-result-link');

    if (resultLink) resultLink.classList.add('hidden');

    const defaultClass = "py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 text-slate-600 hover:text-slate-900";
    if (tabMonthly) tabMonthly.className = defaultClass;
    if (tabCustom) tabCustom.className = defaultClass;
    if (tabDisplay) tabDisplay.className = defaultClass;

    if (contentMonthly) contentMonthly.classList.add('hidden');
    if (contentCustom) contentCustom.classList.add('hidden');
    if (contentDisplay) contentDisplay.classList.add('hidden');

    if (mode === 'custom_date') {
        if (tabCustom) tabCustom.className = "py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 bg-white text-purple-700 shadow-xs";
        if (contentCustom) contentCustom.classList.remove('hidden');
    } else if (mode === 'display_only') {
        if (tabDisplay) tabDisplay.className = "py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 bg-white text-purple-700 shadow-xs";
        if (contentDisplay) contentDisplay.classList.remove('hidden');
    } else {
        if (tabMonthly) tabMonthly.className = "py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 bg-white text-emerald-700 shadow-xs";
        if (contentMonthly) contentMonthly.classList.remove('hidden');
    }
};

window.openGoogleSheetsSyncModal = function() {
    ensureSheetsModalExists();
    const modal = document.getElementById('sheets-sync-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeSheetsSyncModal = function() {
    const modal = document.getElementById('sheets-sync-modal');
    if (modal) modal.classList.add('hidden');
};

/**
 * Eksekusi Sinkronisasi Data
 */
window.executeGoogleSheetsSync = async function() {
    const btnExecute = document.getElementById('btn-execute-sheets-sync');
    const resultLinkCont = document.getElementById('sheets-sync-result-link');
    const openNewSheetBtn = document.getElementById('btn-open-new-sheet');

    if (!btnExecute) return;

    const originalBtnHtml = btnExecute.innerHTML;
    btnExecute.disabled = true;
    btnExecute.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> Menyinkronkan...`;

    try {
        const cloud = window.globalDataCloud || {};
        const allLaptops = cloud.list_laptop || [];
        
        // HANYA AMBIL UNIT GUDANG YANG BERSTATUS TERSEDIA / READY & SINGKAT SPESIFIKASINYA (OPSI 2)
        const readyUnitsOnly = allLaptops
            .filter(item => item && (item.status === 'Tersedia' || item.status === 'Ready'))
            .map(item => ({
                ...item,
                spek: compactSpecs(item.spek, item.jenis_unit || 'Laptop')
            }));

        let periodLabel = '';
        let servicesFiltered = [];
        let sewaFiltered = [];
        let displayFiltered = [];
        let cctvFiltered = [];
        let officeFiltered = [];

        // Ambil data mentah Office: Server Utama (semua) dan Anggota
        const rawOffice = cloud.list_office || [];
        const officeServers = rawOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'utama');

        if (activeSyncMode === 'display_only') {
            const rawDisplay = cloud.laptop_display || [];
            
            // Format spesifikasi horizontal 1 baris
            const formatDisplayItem = (d) => ({
                ...d,
                kode: d.kode || '#-',
                tgl_selesai_cek: d.tgl_selesai_cek || '-',
                spek_singkat: compactSpecs(d.spek_singkat || d.spek, 'Laptop')
            });

            const displayAll = rawDisplay.map(formatDisplayItem);
            const displayEmmy = rawDisplay
                .filter(d => (d.cabang || '').toLowerCase().includes('emmy') || !d.cabang)
                .map(formatDisplayItem);
            const displayPerintis = rawDisplay
                .filter(d => (d.cabang || '').toLowerCase().includes('perintis'))
                .map(formatDisplayItem);

            // Susun rekapitulasi ringkasan khusus display (Tab 1)
            const branches = ["Monumen Emmy Saelan", "Perintis"];
            const displayBranchSummary = branches.map(b => {
                const list = rawDisplay.filter(d => (d.cabang || '').toLowerCase().includes(b.toLowerCase()) || (b === "Monumen Emmy Saelan" && !d.cabang));
                return {
                    cabang: b,
                    total: list.length,
                    ready: list.filter(d => d.status === 'Ready' || !d.status).length,
                    terjual: list.filter(d => d.status === 'Terjual').length,
                    gudang: list.filter(d => d.status === 'Gudang').length
                };
            });

            // Rekap jumlah per model
            const modelCounts = {};
            rawDisplay.forEach(d => {
                const modelName = `${d.merk || ''} ${d.tipe || ''}`.trim() || 'Model Tidak Diketahui';
                if (!modelCounts[modelName]) {
                    modelCounts[modelName] = { model: modelName, total: 0, ready: 0, terjual: 0 };
                }
                modelCounts[modelName].total++;
                if (d.status === 'Ready' || !d.status) modelCounts[modelName].ready++;
                if (d.status === 'Terjual') modelCounts[modelName].terjual++;
            });

            const ringkasanDisplay = {
                branchSummary: displayBranchSummary,
                modelSummary: Object.values(modelCounts),
                totalAll: rawDisplay.length,
                totalReady: rawDisplay.filter(d => d.status === 'Ready' || !d.status).length,
                totalTerjual: rawDisplay.filter(d => d.status === 'Terjual').length,
                totalGudang: rawDisplay.filter(d => d.status === 'Gudang').length
            };

            const payload = {
                mode: 'display_only',
                period: 'Unit Display',
                ringkasanDisplay: ringkasanDisplay,
                displayAll: displayAll,
                displayEmmy: displayEmmy,
                displayPerintis: displayPerintis
            };

            if (window.showToast) {
                window.showToast("Menyinkronkan 4 Tab Khusus Laptop Display ke Spreadsheet Utama...", "info");
            }

            await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (window.logActivity) {
                window.logActivity('Lainnya', 'laptop_display', `Sinkronisasi 4 Tab Google Sheets Khusus Display (${rawDisplay.length} Unit).`);
            }

            if (window.showToast) {
                window.showToast("Berhasil! 4 Tab Laptop Display telah diperbarui di Spreadsheet Utama.", "success");
            }

            window.closeSheetsSyncModal();
            return;
        }
    if (activeSyncMode === 'custom_date') {
            const startVal = document.getElementById('sheets-sync-start-date')?.value;
            const endVal = document.getElementById('sheets-sync-end-date')?.value;

            if (!startVal || !endVal) {
                alert("Silakan pilih tanggal mulai dan tanggal selesai!");
                btnExecute.disabled = false;
                btnExecute.innerHTML = originalBtnHtml;
                return;
            }

            const startDate = new Date(startVal);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(endVal);
            endDate.setHours(23, 59, 59, 999);

            if (endDate < startDate) {
                alert("Tanggal selesai tidak boleh lebih awal dari tanggal mulai!");
                btnExecute.disabled = false;
                btnExecute.innerHTML = originalBtnHtml;
                return;
            }

            periodLabel = formatCustomDateLabel(startDate, endDate);
            servicesFiltered = filterDataByDateRange(cloud.services || [], startDate, endDate, 'tanggal');
            sewaFiltered = filterDataByDateRange(cloud.penyewaan || [], startDate, endDate, 'tgl_mulai');
            cctvFiltered = filterDataByDateRange(cloud.cctv || [], startDate, endDate, 'tanggal');
            displayFiltered = (cloud.laptop_display || []).map(item => ({
                ...item,
                spek_singkat: compactSpecs(item.spek_singkat || item.spek, 'Laptop')
            }));

            const officeMembersFiltered = filterDataByDateRange(
                rawOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'anggota'),
                startDate,
                endDate,
                'tanggal'
            );
            officeFiltered = [...officeServers, ...officeMembersFiltered];

        } else {
            const monthSelect = document.getElementById('sheets-sync-month');
            const yearSelect = document.getElementById('sheets-sync-year');
            const selMonth = Number(monthSelect.value);
            const selYear = Number(yearSelect.value);

            periodLabel = `${NAMA_BULAN_SINGKAT[selMonth]} ${selYear}`;
            servicesFiltered = filterDataByMonth(cloud.services || [], selYear, selMonth, 'tanggal');
            sewaFiltered = filterDataByMonth(cloud.penyewaan || [], selYear, selMonth, 'tgl_mulai');
            cctvFiltered = filterDataByMonth(cloud.cctv || [], selYear, selMonth, 'tanggal');
            displayFiltered = (cloud.laptop_display || []).map(item => ({
                ...item,
                spek_singkat: compactSpecs(item.spek_singkat || item.spek, 'Laptop')
            }));

            const officeMembersFiltered = filterDataByMonth(
                rawOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'anggota'),
                selYear,
                selMonth,
                'tanggal'
            );
            officeFiltered = [...officeServers, ...officeMembersFiltered];
        }

        // Susun Ringkasan Eksekutif Tab 1 Laporan Umum
        const ringkasanData = buildRingkasanData(servicesFiltered, sewaFiltered, allLaptops, displayFiltered, cctvFiltered, officeFiltered);

        const payload = {
            mode: activeSyncMode,
            period: periodLabel,
            ringkasan: ringkasanData,
            services: servicesFiltered,
            penyewaan: sewaFiltered,
            unitReady: readyUnitsOnly,
            display: displayFiltered,
            cctv: cctvFiltered,
            office: officeFiltered
        };

        if (window.showToast) {
            window.showToast(activeSyncMode === 'custom_date' 
                ? `Membuat file spreadsheet baru [Laporan Operasional (${periodLabel}) - Wana Satria]...`
                : `Menyinkronkan 6 sheet periode ${periodLabel}...`, "info");
        }

        await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (window.logActivity) {
            window.logActivity('Lainnya', 'sheets', `Sinkronisasi Google Sheets [Mode: ${activeSyncMode.toUpperCase()}] Periode: ${periodLabel}.`);
        }

        if (activeSyncMode === 'custom_date') {
            if (window.showToast) {
                window.showToast(`File baru Laporan Operasional (${periodLabel}) - Wana Satria berhasil dibuat di Google Drive!`, "success");
            }
            if (resultLinkCont) {
                resultLinkCont.classList.remove('hidden');
                if (openNewSheetBtn) {
                    openNewSheetBtn.href = "https://drive.google.com/drive/search?q=" + encodeURIComponent(`Laporan Operasional (${periodLabel}) - Wana Satria`);
                }
            }
        } else {
            if (window.showToast) {
                window.showToast(`Berhasil! 6 Sheet untuk periode ${periodLabel} telah diperbarui di Spreadsheet Utama.`, "success");
            }
            window.closeSheetsSyncModal();
        }

    } catch (err) {
        console.error("Gagal sinkronisasi Google Sheets:", err);
        alert("Gagal melakukan sinkronisasi: " + err.message);
    } finally {
        btnExecute.disabled = false;
        btnExecute.innerHTML = originalBtnHtml;
    }
};

window.syncAllPenyewaanToSheet = window.openGoogleSheetsSyncModal;