/* ==========================================================================
   Teknisi Portal - sheets.js (Modul Sinkronisasi Google Sheets)
   Mendukung 4 Mode Penuh (100% Kompatibel & Aman):
   1. Bulanan (Spreadsheet Umum Lama)
   2. Kustom Tanggal (Buat File Baru di Drive)
   3. Display Only (4 Tab Khusus Display)
   4. [BARU] Buku Besar 5 Master Data & Dashboard Interaktif Permanen
   ========================================================================== */
import { parseDate } from './utils.js';

// URL Web App Google Apps Script Anda
const GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbx3p0WWcrOGNHotVs98stDsJ4rRtn7Li0Qpv5Ht_bvVkH2mgtV7iWQnXMUU-iewzLieXw/exec";

// URL Spreadsheet Master Baru Anda
const URL_SPREADSHEET_MASTER = "https://docs.google.com/spreadsheets/d/1ylj4Gb6PV7iBRoaf6SVIukqllFV9UM1YFLDoUlKJmbk/edit";

const NAMA_BULAN = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const NAMA_BULAN_SINGKAT = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

let activeSyncMode = 'monthly'; // 'monthly', 'custom_date', 'display_only', atau 'master_ledger'

/**
 * HELPER: Mempersingkat Spesifikasi (Processor / RAM / Storage)
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
 * Filter Cerdas Display
 */
function filterDisplayByDateRange(displayArray, startDate, endDate) {
    const result = [];
    (displayArray || []).forEach(item => {
        if (!item) return;
        const tglCekStr = item.tgl_selesai_cek;
        if (!tglCekStr || tglCekStr === '-' || tglCekStr.trim() === '') return;

        const d = parseDate(tglCekStr);
        if (!d) return;

        const status = (item.status || 'Ready').trim();
        const isReady = (status === 'Ready');
        const isTerjual = (status === 'Terjual');
        const isGudang = (status === 'Gudang' || status === 'Rusak' || status === 'Maintenance');

        if (d < startDate && isReady) {
            result.push({
                ...item,
                _displayCategory: 'ready_lama',
                spek_singkat: compactSpecs(item.spek_singkat || item.spek, 'Laptop')
            });
        } else if (d >= startDate && d <= endDate) {
            let cat = 'ready_baru';
            if (isTerjual) cat = 'terjual';
            else if (isGudang) cat = 'gudang';

            result.push({
                ...item,
                _displayCategory: cat,
                spek_singkat: compactSpecs(item.spek_singkat || item.spek, 'Laptop')
            });
        }
    });
    return result;
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
 * MEMBANGUN RINGKASAN EKSEKUTIF LENGKAP UNTUK MODE BULANAN & KUSTOM LAMA
 */
function buildRingkasanData(servicesList, sewaList, masterLaptopAll, displayList, cctvList, officeList) {
    const branches = ["Monumen Emmy Saelan", "Perintis"];

    // 1. MONITORING SERVISAN TOKO
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

    // 2. MONITORING KECEPATAN SERVISAN & TEKNISI (MINGGU LIBUR & SAMEDAY = 1 HARI)
    const teknisiMap = {};
    (servicesList || []).forEach(s => {
        const rawTeknisi = (s.teknisi || '').trim();
        if (!rawTeknisi || rawTeknisi === '-' || rawTeknisi.toLowerCase().includes('belum') || rawTeknisi.toLowerCase() === 'none' || (s.status || '').toLowerCase() === 'antrean') {
            return;
        }

        const namaTeknisi = rawTeknisi;
        const status = (s.status || '').trim().toLowerCase();

        if (!teknisiMap[namaTeknisi]) {
            teknisiMap[namaTeknisi] = {
                teknisi: namaTeknisi,
                cepat: 0,
                standar: 0,
                lama: 0,
                proses: 0,
                vendor: 0,
                konfirmasi: 0,
                cancel: 0,
                totalHariSelesai: 0,
                jumlahSelesai: 0,
                totalUnit: 0
            };
        }

        const tekData = teknisiMap[namaTeknisi];
        tekData.totalUnit++;

        if (status === 'selesai') {
            const dMasuk = parseDate(s.tanggal);
            const dSelesai = parseDate(s.tgl_selesai) || dMasuk;

            let diffDays = 1;
            if (dMasuk && dSelesai) {
                if (dMasuk.toDateString() === dSelesai.toDateString()) {
                    diffDays = 1; // Sameday = 1 hari kerja
                } else {
                    let workDays = 0;
                    let cur = new Date(dMasuk);
                    while (cur <= dSelesai) {
                        if (cur.getDay() !== 0) workDays++; // Lewati hari Minggu
                        cur.setDate(cur.getDate() + 1);
                    }
                    diffDays = Math.max(1, workDays - 1);
                }
            }

            tekData.totalHariSelesai += diffDays;
            tekData.jumlahSelesai++;

            if (diffDays <= 1) tekData.cepat++;
            else if (diffDays <= 3) tekData.standar++;
            else tekData.lama++;
        } else if (status === 'proses') {
            tekData.proses++;
        } else if (status === 'oper vendor') {
            tekData.vendor++;
        } else if (status === 'tunggu konfirmasi') {
            tekData.konfirmasi++;
        } else if (status === 'cancel') {
            tekData.cancel++;
        }
    });

    const teknisiBreakdown = Object.values(teknisiMap).map(t => ({
        teknisi: t.teknisi,
        cepat: t.cepat,
        standar: t.standar,
        lama: t.lama,
        proses: t.proses,
        masihProses: t.proses,
        vendor: t.vendor,
        konfirmasi: t.konfirmasi,
        cancel: t.cancel,
        rataRata: t.jumlahSelesai > 0 ? (t.totalHariSelesai / t.jumlahSelesai).toFixed(1) + " Hari" : "1.0 Hari",
        totalUnit: t.totalUnit
    })).sort((a, b) => b.totalUnit - a.totalUnit);

    // 3. MONITORING TRANSAKSI PENYEWAAN
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

    // 4. MONITORING INVENTARIS UNIT DISPLAY
    const displayModelMap = {};
    (displayList || []).forEach(d => {
        const cabang = (d.cabang || '').toLowerCase().includes('perintis') ? 'Perintis' : 'Monumen Emmy Saelan';
        const model = `${d.merk || ''} ${d.tipe || ''}`.trim() || 'Model Tidak Diketahui';
        const key = `${cabang}___${model}`;

        if (!displayModelMap[key]) {
            displayModelMap[key] = { cabang: cabang, model: model, readyLama: 0, readyBaru: 0, terjual: 0, gudang: 0, total: 0 };
        }
        displayModelMap[key].total++;
        const cat = d._displayCategory;
        if (cat === 'ready_lama') displayModelMap[key].readyLama++;
        else if (cat === 'ready_baru') displayModelMap[key].readyBaru++;
        else if (cat === 'terjual') displayModelMap[key].terjual++;
        else if (cat === 'gudang') displayModelMap[key].gudang++;
        else displayModelMap[key].readyBaru++;
    });

    const displayModelsBreakdown = Object.values(displayModelMap).sort((a, b) => {
        if (a.cabang !== b.cabang) return a.cabang === 'Monumen Emmy Saelan' ? -1 : 1;
        return a.model.localeCompare(b.model);
    });

    // 5. MONITORING INVENTARIS UNIT PENYEWAAN
    const activeLaptops = (masterLaptopAll || []).filter(l => {
        const st = (l?.status || '').trim().toLowerCase();
        return st === 'tersedia' || st === 'disewa' || st === 'staf' || st === 'maintenance' || st === 'rusak';
    });

    const sewaModelMap = {};
    activeLaptops.forEach(l => {
        const cabang = (l.cabang || '').toLowerCase().includes('perintis') ? 'Perintis' : 'Monumen Emmy Saelan';
        const model = `${l.merk || ''} ${l.tipe || ''}`.trim() || 'Model Tidak Diketahui';
        const key = `${cabang}___${model}`;

        if (!sewaModelMap[key]) {
            sewaModelMap[key] = { cabang: cabang, model: model, ready: 0, disewa: 0, staf: 0, bermasalah: 0, total: 0 };
        }
        sewaModelMap[key].total++;
        const st = (l.status || '').trim().toLowerCase();
        if (st === 'tersedia' || st === 'ready') sewaModelMap[key].ready++;
        else if (st === 'disewa') sewaModelMap[key].disewa++;
        else if (st === 'staf') sewaModelMap[key].staf++;
        else sewaModelMap[key].bermasalah++;
    });

    const sewaModelsBreakdown = Object.values(sewaModelMap).sort((a, b) => {
        if (a.cabang !== b.cabang) return a.cabang === 'Monumen Emmy Saelan' ? -1 : 1;
        return a.model.localeCompare(b.model);
    });

    // 6. KETERSEDIAAN ASET UNIT PENYEWAAN & DISPLAY
    const asetBreakdown = branches.map(b => {
        const lapList = activeLaptops.filter(l => (l.cabang || '').toLowerCase().includes(b.toLowerCase()) || (b === "Monumen Emmy Saelan" && !l.cabang));
        const dispList = (displayList || []).filter(d => (d.cabang || '').toLowerCase().includes(b.toLowerCase()) || (b === "Monumen Emmy Saelan" && !d.cabang));

        return {
            cabang: b,
            gudangReady: lapList.filter(l => l.status === 'Tersedia' || l.status === 'Ready').length,
            gudangSewa: lapList.filter(l => l.status === 'Disewa').length,
            gudangStaf: lapList.filter(l => l.status === 'Staf').length,
            displayReady: dispList.filter(d => d.status === 'Ready' || !d.status).length,
            displaySold: dispList.filter(d => d.status === 'Terjual').length
        };
    });

    // 7. REKAPITULASI MEREK LAPTOP SERVISAN
    const serviceBrandMap = {};
    (servicesList || []).forEach(s => {
        const cabang = (s.cabang || '').toLowerCase().includes('perintis') ? 'Perintis' : 'Monumen Emmy Saelan';
        const dev = (s.perangkat || '').toLowerCase();
        let b = 'Lainnya';
        if (dev.includes('lenovo') || dev.includes('thinkpad')) b = 'Lenovo';
        else if (dev.includes('asus') || dev.includes('rog')) b = 'Asus';
        else if (dev.includes('acer') || dev.includes('nitro')) b = 'Acer';
        else if (dev.includes('hp') || dev.includes('pavilion')) b = 'HP';
        else if (dev.includes('dell')) b = 'Dell';
        else if (dev.includes('apple') || dev.includes('macbook')) b = 'Apple / MacBook';
        else if (dev.includes('msi')) b = 'MSI';

        const key = `${cabang}___${b}`;
        if (!serviceBrandMap[key]) serviceBrandMap[key] = { cabang: cabang, brand: b, total: 0 };
        serviceBrandMap[key].total++;
    });

    const servicesBrandsBreakdown = Object.values(serviceBrandMap).sort((a, b) => b.total - a.total);

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
 * Modal Pop-Up Sinkronisasi Google Sheets (Lengkap 4 Mode)
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
            <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
                <header class="bg-slate-900 text-white p-4 flex justify-between items-center px-6">
                    <h3 class="font-bold flex items-center gap-2 text-sm md:text-base">
                        <i class="fa-solid fa-file-excel text-emerald-400"></i> Sinkronisasi Google Sheets
                    </h3>
                    <button type="button" onclick="window.closeSheetsSyncModal()" class="text-slate-400 hover:text-white transition">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </header>

                <div class="p-6 space-y-4 bg-slate-50">
                    <!-- SAKLAR 4 MODE SINKRONISASI -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-200/80 rounded-xl border border-slate-300/50">
                        <button type="button" id="tab-mode-monthly" onclick="window.switchSheetsSyncMode('monthly')" class="py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 bg-white text-emerald-700 shadow-xs">
                            <i class="fa-solid fa-calendar-days"></i> <span>Bulanan</span>
                        </button>
                        <button type="button" id="tab-mode-custom" onclick="window.switchSheetsSyncMode('custom_date')" class="py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 text-slate-600 hover:text-slate-900">
                            <i class="fa-solid fa-file-circle-plus"></i> <span>Kustom</span>
                        </button>
                        <button type="button" id="tab-mode-display" onclick="window.switchSheetsSyncMode('display_only')" class="py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 text-slate-600 hover:text-slate-900">
                            <i class="fa-solid fa-desktop"></i> <span>Display</span>
                        </button>
                        <button type="button" id="tab-mode-master" onclick="window.switchSheetsSyncMode('master_ledger')" class="py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 text-slate-600 hover:text-slate-900">
                            <i class="fa-solid fa-book-bookmark"></i> <span>Buku Besar</span>
                        </button>
                    </div>

                    <!-- KONTEN MODE 1: BULANAN -->
                    <div id="mode-monthly-content" class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                        <div class="flex items-center justify-between border-b pb-2">
                            <span class="text-xs font-bold text-slate-700 uppercase tracking-wide">Pilih Bulan & Tahun</span>
                            <span class="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 font-bold px-2 py-0.5 rounded-full">Di Spreadsheet Umum</span>
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
                        <p class="text-[11px] text-slate-500 italic">Membuat / memperbarui sheet periode terkait pada spreadsheet umum Anda.</p>
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
                            <span class="text-[10px] text-purple-600 bg-purple-50 border border-purple-200 font-bold px-2 py-0.5 rounded-full">Di Spreadsheet Display</span>
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

                    <!-- KONTEN MODE 4: BUKU BESAR 5 MASTER & DASHBOARD INTERAKTIF -->
                    <div id="mode-master-content" class="hidden bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                        <div class="flex items-center justify-between border-b pb-2">
                            <span class="text-xs font-bold text-slate-700 uppercase tracking-wide">📚 Buku Besar & Dashboard Interaktif</span>
                            <span class="text-[10px] text-cyan-700 bg-cyan-50 border border-cyan-200 font-bold px-2 py-0.5 rounded-full">Spreadsheet Master Permanen</span>
                        </div>
                        <div class="p-3 bg-cyan-50/50 rounded-xl border border-cyan-100 text-xs text-slate-700 space-y-2">
                            <p class="font-bold text-cyan-950">Menyinkronkan 100% Seluruh Database Lengkap Tanpa Potongan Tanggal:</p>
                            <div class="grid grid-cols-2 gap-1.5 text-[11px]">
                                <div class="bg-white p-2 rounded-lg border border-cyan-200/60 font-semibold text-slate-700">
                                    <i class="fa-solid fa-laptop-medical text-cyan-600 mr-1"></i> Master Log Servis
                                </div>
                                <div class="bg-white p-2 rounded-lg border border-cyan-200/60 font-semibold text-slate-700">
                                    <i class="fa-solid fa-desktop text-purple-600 mr-1"></i> Master Display
                                </div>
                                <div class="bg-white p-2 rounded-lg border border-cyan-200/60 font-semibold text-slate-700">
                                    <i class="fa-solid fa-boxes-packing text-amber-600 mr-1"></i> Master Penyewaan
                                </div>
                                <div class="bg-white p-2 rounded-lg border border-cyan-200/60 font-semibold text-slate-700">
                                    <i class="fa-solid fa-warehouse text-emerald-600 mr-1"></i> Master Unit Gudang
                                </div>
                                <div class="bg-white p-2 rounded-lg border border-cyan-200/60 font-semibold text-slate-700 col-span-2">
                                    <i class="fa-solid fa-video text-blue-600 mr-1"></i> Master Proyek CCTV (Termasuk Tim Teknisi)
                                </div>
                            </div>
                            <p class="text-[11px] text-slate-500 italic mt-1">
                                ✨ Tab <strong>Dashboard Interaktif</strong> dilengkapi kotak kontrol filter tanggal dan dropdown pergantian tampilan dinamis di baris paling atas.
                            </p>
                        </div>
                    </div>

                    <!-- LINK HASIL SINKRONISASI -->
                    <div id="sheets-sync-result-link" class="hidden bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-center space-y-2">
                        <p class="text-xs font-bold text-emerald-900" id="sheets-sync-result-msg"><i class="fa-solid fa-circle-check text-emerald-600"></i> Sinkronisasi Selesai!</p>
                        <a id="btn-open-new-sheet" href="#" target="_blank" class="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> <span id="btn-open-sheet-text">Buka File Spreadsheet</span>
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
    const tabMaster = document.getElementById('tab-mode-master');

    const contentMonthly = document.getElementById('mode-monthly-content');
    const contentCustom = document.getElementById('mode-custom-content');
    const contentDisplay = document.getElementById('mode-display-content');
    const contentMaster = document.getElementById('mode-master-content');
    const resultLink = document.getElementById('sheets-sync-result-link');

    if (resultLink) resultLink.classList.add('hidden');

    const defaultClass = "py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 text-slate-600 hover:text-slate-900";
    if (tabMonthly) tabMonthly.className = defaultClass;
    if (tabCustom) tabCustom.className = defaultClass;
    if (tabDisplay) tabDisplay.className = defaultClass;
    if (tabMaster) tabMaster.className = defaultClass;

    if (contentMonthly) contentMonthly.classList.add('hidden');
    if (contentCustom) contentCustom.classList.add('hidden');
    if (contentDisplay) contentDisplay.classList.add('hidden');
    if (contentMaster) contentMaster.classList.add('hidden');

    if (mode === 'custom_date') {
        if (tabCustom) tabCustom.className = "py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 bg-white text-purple-700 shadow-xs";
        if (contentCustom) contentCustom.classList.remove('hidden');
    } else if (mode === 'display_only') {
        if (tabDisplay) tabDisplay.className = "py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 bg-white text-purple-700 shadow-xs";
        if (contentDisplay) contentDisplay.classList.remove('hidden');
    } else if (mode === 'master_ledger') {
        if (tabMaster) tabMaster.className = "py-2 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 bg-white text-cyan-700 shadow-xs";
        if (contentMaster) contentMaster.classList.remove('hidden');
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
    const resultMsg = document.getElementById('sheets-sync-result-msg');
    const btnText = document.getElementById('btn-open-sheet-text');

    if (!btnExecute) return;

    const originalBtnHtml = btnExecute.innerHTML;
    btnExecute.disabled = true;
    btnExecute.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> Menyinkronkan...`;

    try {
        const cloud = window.globalDataCloud || {};

        // ------------------------------------------------------------------
        // EKSEKUSI MODE 4 (BARU): BUKU BESAR 5 MASTER DATA & DASHBOARD INTERAKTIF
        // ------------------------------------------------------------------
        if (activeSyncMode === 'master_ledger') {
            const rawServices = cloud.services || [];
            const rawDisplay = cloud.laptop_display || [];
            const rawPenyewaan = cloud.penyewaan || [];
            const rawUnits = cloud.list_laptop || [];
            const rawCctv = cloud.cctv || [];

            const payload = {
                mode: 'master_ledger',
                period: 'Buku Besar & Dashboard',
                allServices: rawServices,
                allDisplay: rawDisplay,
                allPenyewaan: rawPenyewaan,
                allUnitPenyewaan: rawUnits,
                allCctv: rawCctv
            };

            if (window.showToast) {
                window.showToast("Menyinkronkan 5 Tab Buku Besar & Dashboard Interaktif...", "info");
            }

            await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (window.logActivity) {
                window.logActivity('Lainnya', 'database', `Sinkronisasi Buku Besar 5 Master Data & Dashboard Interaktif.`);
            }

            if (window.showToast) {
                window.showToast("Berhasil! 5 Tab Buku Besar & Dashboard Interaktif telah diperbarui.", "success");
            }

            if (resultLinkCont) {
                resultLinkCont.classList.remove('hidden');
                if (resultMsg) resultMsg.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600"></i> Buku Besar Berhasil Disinkronkan!`;
                if (openNewSheetBtn) openNewSheetBtn.href = URL_SPREADSHEET_MASTER;
                if (btnText) btnText.innerText = "Buka Spreadsheet Buku Besar & Dashboard";
            }
            return;
        }

        // ------------------------------------------------------------------
        // EKSEKUSI MODE 3: KHUSUS DISPLAY (4 TAB)
        // ------------------------------------------------------------------
        if (activeSyncMode === 'display_only') {
            const rawDisplay = cloud.laptop_display || [];
            
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
                window.showToast("Menyinkronkan 4 Tab Khusus Laptop Display...", "info");
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
                window.showToast("Berhasil! 4 Tab Laptop Display telah diperbarui.", "success");
            }

            window.closeSheetsSyncModal();
            return;
        }

        // ------------------------------------------------------------------
        // EKSEKUSI MODE 1 (BULANAN) DAN MODE 2 (KUSTOM TANGGAL) LAMA
        // ------------------------------------------------------------------
        const allLaptops = cloud.list_laptop || [];
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

        const rawOffice = cloud.list_office || [];
        const officeServers = rawOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'utama');

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
            displayFiltered = filterDisplayByDateRange(cloud.laptop_display || [], startDate, endDate);

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

            const startOfMonth = new Date(selYear, selMonth, 1, 0, 0, 0, 0);
            const endOfMonth = new Date(selYear, selMonth + 1, 0, 23, 59, 59, 999);

            periodLabel = `${NAMA_BULAN_SINGKAT[selMonth]} ${selYear}`;
            servicesFiltered = filterDataByMonth(cloud.services || [], selYear, selMonth, 'tanggal');
            sewaFiltered = filterDataByMonth(cloud.penyewaan || [], selYear, selMonth, 'tgl_mulai');
            cctvFiltered = filterDataByMonth(cloud.cctv || [], selYear, selMonth, 'tanggal');
            displayFiltered = filterDisplayByDateRange(cloud.laptop_display || [], startOfMonth, endOfMonth);

            const officeMembersFiltered = filterDataByMonth(
                rawOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'anggota'),
                selYear,
                selMonth,
                'tanggal'
            );
            officeFiltered = [...officeServers, ...officeMembersFiltered];
        }

        // Kalkulasi Ringkasan Lengkap untuk Mode Bulanan & Kustom Lama
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
                : `Menyinkronkan sheet periode ${periodLabel}...`, "info");
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
                if (btnText) btnText.innerText = "Buka File Spreadsheet Baru di Drive";
            }
        } else {
            if (window.showToast) {
                window.showToast(`Berhasil! Sheet untuk periode ${periodLabel} telah diperbarui di Spreadsheet Umum.`, "success");
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