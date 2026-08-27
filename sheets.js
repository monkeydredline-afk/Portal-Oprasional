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

/*** Membangun Ringkasan Eksekutif (Sheet 1) Non-Finansial (Termasuk CCTV & Lisensi Office)
 */
function buildRingkasanData(servicesList, sewaList, masterLaptopAll, displayList, cctvList, officeList) {
    const branches = ["Monumen Emmy Saelan", "Perintis"];

    // 1. Monitoring Servisan
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

    // 2. Monitoring Penyewaan
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

    // 3. Monitoring Ketersediaan Aset (Laptop Gudang & Display)
    const asetBreakdown = branches.map(b => {
        const lapList = masterLaptopAll.filter(l => (l.cabang || '').toLowerCase().includes(b.toLowerCase()) || (b === "Monumen Emmy Saelan" && !l.cabang));
        const dispList = displayList.filter(d => (d.cabang || '').toLowerCase().includes(b.toLowerCase()) || (b === "Monumen Emmy Saelan" && !d.cabang));

        return {
            cabang: b,
            gudangReady: lapList.filter(l => l.status === 'Tersedia').length,
            gudangSewa: lapList.filter(l => l.status === 'Disewa').length,
            gudangMaint: lapList.filter(l => l.status === 'Maintenance').length,
            gudangStaf: lapList.filter(l => l.status === 'Staf').length,
            displayReady: dispList.filter(d => d.status === 'Ready' || !d.status).length,
            displaySold: dispList.filter(d => d.status === 'Terjual').length
        };
    });

    // 4. Monitoring Proyek CCTV (Baru)
    const cctvBreakdown = branches.map(b => {
        const list = cctvList.filter(c => (c.cabang || '').toLowerCase().includes(b.toLowerCase()) || (b === "Monumen Emmy Saelan" && !c.cabang));
        const totalKamera = list.reduce((sum, item) => sum + (Number(item.jumlah_cctv) || 0), 0);
        return {
            cabang: b,
            total: list.length,
            survei: list.filter(c => c.status === 'Survei').length,
            pengerjaan: list.filter(c => c.status === 'Pengerjaan').length,
            selesai: list.filter(c => c.status === 'Selesai' || c.status === 'Selesai / Serah Terima').length,
            totalKamera: totalKamera
        };
    });

    // 5. Monitoring Lisensi Office (Baru)
    const servers = (officeList || []).filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'utama');
    const members = (officeList || []).filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'anggota');
    let filledSlots = 0;
    servers.forEach(srv => {
        const srvEmail = srv?.akun || '';
        filledSlots += members.filter(it => (it?.server_utama || '') === srvEmail).length;
    });
    const totalCapacity = servers.length * 5;
    const officeSummary = {
        totalServers: servers.length,
        totalMembersPeriode: members.length,
        filledSlots: `${filledSlots} / ${totalCapacity}`,
        freeSlots: Math.max(0, totalCapacity - filledSlots)
    };

    return {
        servicesBreakdown,
        penyewaanBreakdown,
        asetBreakdown,
        cctvBreakdown,
        officeSummary
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
                    <!-- SAKLAR DUA MODE -->
                    <div class="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/80 rounded-xl border border-slate-300/50">
                        <button type="button" id="tab-mode-monthly" onclick="window.switchSheetsSyncMode('monthly')" class="py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 bg-white text-emerald-700 shadow-xs">
                            <i class="fa-solid fa-calendar-days"></i> <span>Mode Bulanan</span>
                        </button>
                        <button type="button" id="tab-mode-custom" onclick="window.switchSheetsSyncMode('custom_date')" class="py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900">
                            <i class="fa-solid fa-file-circle-plus"></i> <span>Mode Kustom (File Baru)</span>
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
    const contentMonthly = document.getElementById('mode-monthly-content');
    const contentCustom = document.getElementById('mode-custom-content');
    const resultLink = document.getElementById('sheets-sync-result-link');

    if (resultLink) resultLink.classList.add('hidden');

    if (mode === 'custom_date') {
        if (tabCustom) tabCustom.className = "py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 bg-white text-purple-700 shadow-xs";
        if (tabMonthly) tabMonthly.className = "py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900";
        if (contentMonthly) contentMonthly.classList.add('hidden');
        if (contentCustom) contentCustom.classList.remove('hidden');
    } else {
        if (tabMonthly) tabMonthly.className = "py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 bg-white text-emerald-700 shadow-xs";
        if (tabCustom) tabCustom.className = "py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900";
        if (contentMonthly) contentMonthly.classList.remove('hidden');
        if (contentCustom) contentCustom.classList.add('hidden');
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
            displayFiltered = filterDataByDateRange(cloud.laptop_display || [], startDate, endDate, 'tanggal')
                .map(item => ({
                    ...item,
                    spek_singkat: compactSpecs(item.spek_singkat || item.spek, 'Laptop')
                }));

            // Filter akun Anggota/Member sesuai rentang tanggal (Sesuai Poin 4 yang disepakati)
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
            displayFiltered = filterDataByMonth(cloud.laptop_display || [], selYear, selMonth, 'tanggal')
                .map(item => ({
                    ...item,
                    spek_singkat: compactSpecs(item.spek_singkat || item.spek, 'Laptop')
                }));

            // Filter akun Anggota/Member sesuai bulan & tahun yang dipilih
            const officeMembersFiltered = filterDataByMonth(
                rawOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'anggota'),
                selYear,
                selMonth,
                'tanggal'
            );
            officeFiltered = [...officeServers, ...officeMembersFiltered];
        }

        // Susun Ringkasan Eksekutif Tab 1
        const ringkasanData = buildRingkasanData(servicesFiltered, sewaFiltered, allLaptops, displayFiltered, cctvFiltered, officeFiltered);

        // Masukkan data CCTV dan Office ke dalam payload
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
            window.logActivity('Lainnya', 'sheets', `Sinkronisasi Google Sheets [Mode: ${activeSyncMode.toUpperCase()}] Periode: ${periodLabel} (${servicesFiltered.length} Servis, ${sewaFiltered.length} Sewa, ${readyUnitsOnly.length} Unit Ready, ${displayFiltered.length} Display).`);
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