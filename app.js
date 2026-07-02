
import { 
    db, ref, set, push, onValue, remove, update, get, query, orderByChild, equalTo,
    firebaseLogin, firebaseLogout, registerAuthUser 
} from './firebase-config.js';

import { 
    fieldsTemplate, tableHeaders, dataKeysMapping, filterOptionsTemplate 
} from './templates.js';

import { 
    togglePassword, parseDate, formatDateForInput 
} from './utils.js';

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// =================================================================
// GLOBAL STATE & BINDINGS WINDOW
// =================================================================
let currentTab = 'services';
let selectedLaptopKeys = []; 
window.editSelectedLaptopKeys = [];
let globalDataCloud = {
    services: [],
    penyewaan: [],
    cctv: [],
    list_laptop: [],
    laptop_display: [],
    list_office: [],
    user_management: [],
    activity_logs: []
}; 

// Melacak koneksi aktif Firebase agar bisa diputuskan (unsubscribed) saat logout
let activeFirebaseListeners = [];
let userProfileListener = null; // Melacak listener profil pengguna aktif

let currentPage = 1;
const itemsPerPage = 20;

let chartWorkloadInstance = null;
let chartLaptopStockInstance = null;

// Status penanda transisi pemuatan data agar visual terasa responsif
let isTabLoadingState = false;

window.currentUser = {
    uid: null,
    email: null,
    role: null,
    branch: null,
    permissions: {}
};

// Hubungkan semua fungsi global agar bisa diakses elemen HTML inline (seperti onclick)
window.togglePassword = togglePassword;
window.firebaseLogout = firebaseLogout;
window.registerAuthUser = registerAuthUser;

// Fungsi pembantu untuk memvalidasi hak akses tipe Boolean dan String secara aman
function isPermitted(val) {
    return val === true || val === 'true';
}

// Sinkronisasi status ikon hamburger awal berdasarkan lebar layar & status visual sidebar
function syncHamburgerIcon() {
    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('hamburger-icon');
    if (!sidebar || !icon) return;

    let isCollapsed = false;
    if (window.innerWidth < 768) {
        isCollapsed = sidebar.classList.contains('-translate-x-full');
    } else {
        isCollapsed = sidebar.classList.contains('md:-ml-64');
    }

    if (isCollapsed) {
        icon.classList.remove('fa-xmark');
        icon.classList.add('fa-bars');
    } else {
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-xmark');
    }
}

// Fungsi Lokal toggleSidebar agar aman diakses di lingkup internal module
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const icon = document.getElementById('hamburger-icon');

    let isCollapsed = false;
    
    if (window.innerWidth < 768) {
        // Mode Mobile: Geser dengan translate-x-full dan tampilkan overlay hitam di belakangnya
        sidebar.classList.toggle('-translate-x-full');
        overlay.classList.toggle('hidden');
        isCollapsed = sidebar.classList.contains('-translate-x-full');
    } else {
        // Mode Desktop: Geser ke kiri menggunakan margin negatif agar layout flex-1 ikut melebar
        sidebar.classList.toggle('md:-ml-64');
        isCollapsed = sidebar.classList.contains('md:-ml-64');
        // Pastikan overlay tetap tersembunyi di desktop
        overlay.classList.add('hidden');
    }

    // Mengubah ikon hamburger secara dinamis (Morphing Icon)
    if (icon) {
        if (isCollapsed) {
            icon.classList.remove('fa-xmark');
            icon.classList.add('fa-bars');
        } else {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-xmark');
        }
    }
}

// Ikat fungsi toggle ke objek window agar bisa diakses elemen HTML
window.toggleSidebar = toggleSidebar;
window.toggleMobileMenu = toggleSidebar;

// Fungsi kontrol buka-tutup dropdown menu akun operator
window.toggleUserDropdown = function(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('user-dropdown-menu');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
};

// Event listener global untuk otomatis menutup dropdown saat klik di luar area menu
window.addEventListener('click', function(e) {
    const dropdown = document.getElementById('user-dropdown-menu');
    const button = document.getElementById('user-menu-button');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        if (!dropdown.contains(e.target) && !button.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    }
});

// Helper untuk menguraikan format tanggal Masa Aktif secara fleksibel
function parseFlexibleDate(dateStr) {
    if (!dateStr) return null;
    const cleanStr = dateStr.trim();
    
    // Cek format DD/MM/YYYY atau DD-MM-YYYY
    const dmyMatch = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
        return new Date(dmyMatch[3], dmyMatch[2] - 1, dmyMatch[1]);
    }
    
    // Cek format YYYY-MM-DD atau YYYY/MM/DD
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

// Event oninput memicu debounce anti-lag saat mencari data
let searchTimeout = null;
window.resetPaginationAndRenderWithDebounce = function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        resetPaginationAndRender();
    }, 250); 
};

// Fungsi Ekspor Excel (Disinkronkan dengan Status Kedaluwarsa)
window.exportToExcel = function() {
    const data = globalDataCloud[currentTab] || [];
    if (data.length === 0) {
        showToast("Tidak ada data pada list ini untuk diekspor!", "warning");
        return;
    }

    const headers = tableHeaders[currentTab];
    const keys = dataKeysMapping[currentTab];

    const rows = data.map(item => {
        let row = {};
        headers.forEach((header, idx) => {
            const key = keys[idx];
            let val = item[key];
            if (val === undefined || val === null) val = '-';
            
            // Samakan status kedaluwarsa otomatis ke dalam file Excel hasil unduhan
            if (key === 'status' && currentTab === 'list_office') {
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

            // Sembunyikan password di excel jika bukan admin
            if (key === 'password' && window.currentUser.role !== 'admin') {
                val = '••••••';
            }
            row[header] = val;
        });
        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, currentTab);

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Ekspor_${currentTab}_${dateStr}.xlsx`);
    logActivity('Lainnya', currentTab, `Melakukan ekspor data ke berkas Excel.`);
    showToast("Data berhasil diekspor ke Excel!");
};

window.handleLoginSubmit = function(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const btnText = document.getElementById('btn-login-text');
    
    btnText.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> Memverifikasi...`;
    btnText.disabled = true;

    firebaseLogin(email, pass)
        .catch(err => {
            alert("Gagal masuk! Periksa kembali email dan password Anda.\nDetail: " + err.message);
            btnText.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Verifikasi & Masuk`;
            btnText.disabled = false;
        });
};

window.openDashboardModal = function() {
    const perms = window.currentUser.permissions || {};
    if(!isPermitted(perms.dashboard)) {
        showToast("Anda tidak memiliki izin akses untuk melihat Dashboard Statistik.", "warning");
        return;
    }
    document.getElementById('dashboard-modal').classList.remove('hidden');
    calculateAndRenderStats();
};

window.closeDashboardModal = function() {
    document.getElementById('dashboard-modal').classList.add('hidden');
};

window.resetDisplayFilters = function() {
    document.getElementById('filter-display-cabang').value = '';
    document.getElementById('filter-display-start').value = '';
    document.getElementById('filter-display-end').value = '';
    calculateAndRenderStats();
};

window.resetPaginationAndRender = function() {
    currentPage = 1;
    renderTable();
};

window.nextPage = function() {
    currentPage++;
    renderTable();
};

window.prevPage = function() {
    if(currentPage > 1) {
        currentPage--;
        renderTable();
    }
};

// =================================================================
// LOG AKTIVITAS (HELPER FUNCTION)
// =================================================================
function logActivity(action, menu, details) {
    if (!db) return;
    const logRef = ref(db, 'activity_logs');
    const newLogRef = push(logRef);
    
    const now = new Date();
    const tanggalJam = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const nextId = (globalDataCloud['activity_logs'] || []).length === 0 ? 1 : Math.max(...globalDataCloud['activity_logs'].map(l => Number(l.id) || 0)) + 1;

    const newLog = {
        id: nextId,
        timestamp: Date.now(),
        tanggal_jam: tanggalJam,
        user: window.currentUser.email || 'System/Anonymous',
        userUid: window.currentUser.uid || '',
        action: action,
        menu_display: menu,
        details: details
    };
    set(newLogRef, newLog);
}

// =================================================================
// LOG OPERASIONAL AUTO-PURGE (LOGS > 30 HARI)
// =================================================================
window.purgeOldLogs = purgeOldLogs;
function purgeOldLogs() {
    const perms = window.currentUser.permissions || {};
    if (!isPermitted(perms.delete_data)) {
        showToast("Anda tidak memiliki hak akses untuk menghapus log aktivitas.", "warning");
        return;
    }

    const limitDate = Date.now() - (30 * 24 * 60 * 60 * 1000); 
    const logs = globalDataCloud['activity_logs'] || [];
    const oldLogs = logs.filter(log => log.timestamp && log.timestamp < limitDate);

    if (oldLogs.length === 0) {
        showToast("Tidak ada riwayat aktivitas yang berusia lebih dari 30 hari.", "info");
        return;
    }

    if (confirm(`Apakah Anda yakin ingin menghapus secara permanen ${oldLogs.length} baris log aktivitas yang berusia lebih dari 30 hari?`)) {
        const updates = {};
        oldLogs.forEach(log => {
            updates[`/activity_logs/${log._firebaseKey}`] = null;
        });

        const rootRef = ref(db);
        update(rootRef, updates)
            .then(() => {
                logActivity('Hapus', 'activity_logs', `Melakukan pembersihan berkala: Menghapus ${oldLogs.length} baris log aktivitas yang berusia > 30 hari.`);
                showToast(`Berhasil menghapus ${oldLogs.length} log aktivitas lama.`);
            })
            .catch(err => {
                showToast("Gagal melakukan pembersihan: " + err.message, "error");
            });
    }
}

// =================================================================
// UTILITY BACKUP DATABASE (JSON EXPORTER) [2]
// =================================================================
window.backupDatabase = backupDatabase;
function backupDatabase() {
    const perms = window.currentUser.permissions || {};
    if (!isPermitted(perms.backup_database)) {
        showToast("Anda tidak memiliki hak akses eksplisit untuk membackup database.", "warning");
        return;
    }

    if (confirm("Apakah Anda yakin ingin mengunduh cadangan lengkap seluruh database Cloud (Format JSON)?")) {
        try {
            const cleanBackup = {};
            Object.keys(globalDataCloud).forEach(node => {
                cleanBackup[node] = (globalDataCloud[node] || []).map(item => {
                    const cleanItem = { ...item };
                    delete cleanItem._firebaseKey; 
                    return cleanItem;
                });
            });

            const jsonString = JSON.stringify(cleanBackup, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            
            const now = new Date();
            const formattedDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            const fileName = `Backup_Teknisi_Portal_${formattedDate}.json`;

            const link = document.createElement('a');
            link.download = fileName;
            link.href = URL.createObjectURL(blob);
            link.click();

            logActivity('Lainnya', 'database', `Melakukan backup data: Mengunduh berkas cadangan database lengkap ${fileName}.`);
            showToast("Database berhasil dicadangkan!");
        } catch (err) {
            showToast("Gagal membackup database: " + err.message, "error");
        }
    }
}

// =================================================================
// HELPER HUBUNGI WHATSAPP (URL GENERATOR)
// =================================================================
window.sendWhatsAppNotify = function(no_wa, nama, unit, total, tipe_log) {
    if (!no_wa || no_wa === '-') {
        showToast("Nomor WhatsApp tidak valid atau kosong.", "warning");
        return;
    }
    
    let cleanNumber = no_wa.replace(/[^0-9]/g, '');
    if (cleanNumber.startsWith('0')) {
        cleanNumber = '62' + cleanNumber.slice(1);
    } else if (!cleanNumber.startsWith('62')) {
        cleanNumber = '62' + cleanNumber.slice(1);
    }
    
    let messageText = '';
    if (tipe_log === 'services') {
        messageText = `Halo Kak *${nama}*,\n\nKami menginformasikan bahwa perangkat *${unit}* Anda yang diservis di *Teknisi Portal* sudah selesai dikerjakan dan siap diambil.\n\nTotal Biaya: *Rp ${Number(total).toLocaleString('id-ID')}*\n\nTerima kasih atas kepercayaannya!`;
    } else if (tipe_log === 'penyewaan') {
        messageText = `Halo Kak *${nama}*,\n\nKami menginformasikan bahwa masa penyewaan unit laptop *${unit}* Anda akan/telah jatuh tempo.\n\nTotal Biaya Sewa: *Rp ${Number(total).toLocaleString('id-ID')}*\n\nMohon segera melakukan konfirmasi pengembalian atau perpanjangan unit ke toko. Terima kasih!`;
    }
    
    const waUrl = `https://api.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(messageText)}`;
    window.open(waUrl, '_blank');
};

// =================================================================
// DETEKSI ANIMASI PEMUATAN TABEL (LOADING SPINNER) [1]
// =================================================================
function showTableLoading(message = "Mengambil Data...") {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    
    const colSpanCount = tableHeaders[currentTab] ? tableHeaders[currentTab].length : 8;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="${colSpanCount}" class="px-4 py-12 text-center text-slate-500 bg-slate-50/50">
                <div class="flex flex-col items-center justify-center space-y-3">
                    <i class="fa-solid fa-circle-notch animate-spin text-3xl text-cyan-600"></i>
                    <span class="text-sm font-semibold tracking-wide animate-pulse">${message}</span>
                </div>
            </td>
        </tr>
    `;
}

// =================================================================
// LOGIKA UTAMA & FUNGSI OPERASIONAL
// =================================================================
function applyRoleBasedAccess() {
    const perms = window.currentUser.permissions || {};
    const branch = window.currentUser.branch || 'Head Office';
    
    const btnDashboard = document.getElementById('btn-dashboard');
    const btnServices = document.getElementById('btn-services');
    const btnPenyewaan = document.getElementById('btn-penyewaan');
    const btnCctv = document.getElementById('btn-cctv');
    const btnListLaptop = document.getElementById('btn-list_laptop');
    const btnLaptopDisplay = document.getElementById('btn-laptop_display');
    const btnListOffice = document.getElementById('btn-list_office');
    const btnUserManagement = document.getElementById('btn-user_management');
    const btnActivityLogs = document.getElementById('btn-activity_logs');
    const btnClear = document.getElementById('btn-clear-data');
    const btnBackup = document.getElementById('btn-backup-db');
    
    window.userBranch = ''; 
    if (branch && branch !== 'Head Office') {
        window.userBranch = branch;
    }

    if (btnDashboard) btnDashboard.style.display = isPermitted(perms.dashboard) ? '' : 'none';
    if (btnServices) btnServices.style.display = isPermitted(perms.services) ? '' : 'none';
    if (btnPenyewaan) btnPenyewaan.style.display = isPermitted(perms.penyewaan) ? '' : 'none';
    if (btnCctv) btnCctv.style.display = isPermitted(perms.cctv) ? '' : 'none';
    if (btnListLaptop) btnListLaptop.style.display = isPermitted(perms.list_laptop) ? '' : 'none';
    if (btnLaptopDisplay) btnLaptopDisplay.style.display = isPermitted(perms.laptop_display) ? '' : 'none';
    if (btnListOffice) btnListOffice.style.display = isPermitted(perms.list_office) ? '' : 'none';
    if (btnUserManagement) btnUserManagement.style.display = isPermitted(perms.user_management) ? '' : 'none';
    if (btnActivityLogs) btnActivityLogs.style.display = isPermitted(perms.activity_logs) ? '' : 'none';
    if (btnClear) btnClear.style.display = isPermitted(perms.delete_data) ? '' : 'none';
    
    if (btnBackup) {
        if (isPermitted(perms.backup_database)) {
            btnBackup.classList.remove('hidden');
        } else {
            btnBackup.classList.add('hidden');
        }
    }

    const tabsOrder = ['services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'list_office', 'user_management', 'activity_logs'];
    for (let t of tabsOrder) {
        if (isPermitted(perms[t])) {
            return t;
        }
    }
    return 'list_laptop'; 
}

function calculateAndRenderStats() {
    const dataServices = globalDataCloud['services'] || [];
    const dataPenyewaan = globalDataCloud['penyewaan'] || [];
    const dataCctv = globalDataCloud['cctv'] || [];
    const dataLaptop = globalDataCloud['list_laptop'] || [];
    const dataDisplayRaw = globalDataCloud['laptop_display'] || [];

    let pendingServices = dataServices.filter(s => s.status === 'Antrean' || s.status === 'Proses').length;
    
    let totalOmsetSewa = 0;
    dataPenyewaan.forEach(p => { totalOmsetSewa += (Number(p.total_biaya) || 0); });
    
    let activeCctv = dataCctv.filter(c => c.status === 'Survei' || c.status === 'Pengerjaan').length;
    
    let totalLaptopAset = dataLaptop.length;
    let lapReady = dataLaptop.filter(l => l.status === 'Tersedia').length;
    let lapSewa = dataLaptop.filter(l => l.status === 'Disewa').length;
    let lapRusak = dataLaptop.filter(l => l.status === 'Maintenance').length;
    let lapTerjual = dataLaptop.filter(l => l.status === 'Terjual').length;

    const filterDisplayCabang = document.getElementById('filter-display-cabang');
    const filterGudangCabang = document.getElementById('filter-gudang-cabang');

    if (window.userBranch) {
        if (filterDisplayCabang) filterDisplayCabang.style.display = 'none';
        if (filterGudangCabang) filterGudangCabang.style.display = 'none';
    } else {
        if (filterDisplayCabang) filterDisplayCabang.style.display = '';
        if (filterGudangCabang) filterGudangCabang.style.display = '';
    }

    const branchVal = window.userBranch || (filterDisplayCabang ? filterDisplayCabang.value : '');
    const startVal = document.getElementById('filter-display-start').value;
    const endVal = document.getElementById('filter-display-end').value;
    
    let filteredDisplay = dataDisplayRaw;

    if (branchVal) {
        filteredDisplay = filteredDisplay.filter(item => item.cabang === branchVal);
    }

    if (startVal && endVal) {
        const startDate = new Date(startVal);
        startDate.setHours(0,0,0,0);
        const endDate = new Date(endVal);
        endDate.setHours(23,59,59,999);

        filteredDisplay = filteredDisplay.filter(item => {
            const itemDate = parseDate(item.tanggal);
            if (!itemDate) return false;
            return itemDate >= startDate && itemDate <= endDate;
        });
    }

    let totalDisplay = filteredDisplay.length;
    let dispReady = filteredDisplay.filter(d => d.status === 'Ready').length;
    let dispSold = filteredDisplay.filter(d => d.status === 'Terjual').length;
    let dispOff = filteredDisplay.filter(d => d.status === 'Gudang').length;

    document.getElementById('stat-services-pending').innerText = pendingServices;
    document.getElementById('stat-rent-omset').innerText = totalOmsetSewa.toLocaleString('id-ID');
    document.getElementById('stat-cctv-active').innerText = activeCctv;
    
    document.getElementById('stat-laptop-total').innerText = totalLaptopAset;
    document.getElementById('stat-laptop-ready').innerText = lapReady;
    document.getElementById('stat-laptop-rented').innerText = lapSewa;
    document.getElementById('stat-laptop-broken').innerText = lapRusak;
    document.getElementById('stat-laptop-sold').innerText = lapTerjual;

    document.getElementById('stat-display-total').innerText = totalDisplay;
    document.getElementById('stat-display-ready').innerText = dispReady;
    document.getElementById('stat-display-sold').innerText = dispSold;
    document.getElementById('stat-display-off').innerText = dispOff;

    const gudangBranchVal = window.userBranch || (filterGudangCabang ? filterGudangCabang.value : '');
    let filteredLaptopWarehouse = dataLaptop;

    if (gudangBranchVal) {
        filteredLaptopWarehouse = filteredLaptopWarehouse.filter(lap => lap.cabang === gudangBranchVal);
    }

    let modelCounts = {};
    filteredLaptopWarehouse.forEach(lap => {
        let merkText = (lap.merk || '').trim();
        let tipeText = (lap.tipe || '').trim();
        let fullModelName = `${merkText} ${tipeText}`.trim();
        
        if(!fullModelName || fullModelName === "- -") fullModelName = "Model Tidak Diketahui";
        modelCounts[fullModelName] = (modelCounts[fullModelName] || 0) + 1;
    });

    let sortedModels = Object.keys(modelCounts).sort();
    const modelsTbody = document.getElementById('dashboard-laptop-models-tbody');
    if (modelsTbody) {
        modelsTbody.innerHTML = '';
        if(sortedModels.length === 0) {
            modelsTbody.innerHTML = `<tr><td colspan="2" class="px-2 py-3 text-center text-gray-400 italic">Tidak ada unit laptop pada cabang ini</td></tr>`;
        } else {
            let totalGudangRow = 0;
            sortedModels.forEach(modelName => {
                let totalUnitPerModel = modelCounts[modelName];
                totalGudangRow += totalUnitPerModel;
                modelsTbody.innerHTML += `
                    <tr class="hover:bg-slate-100 transition">
                        <td class="px-2 py-1.5 font-medium text-slate-700">${modelName}</td>
                        <td class="px-2 py-1.5 text-right font-bold text-slate-900">${totalUnitPerModel}</td>
                    </tr>
                `;
            });
            
            modelsTbody.innerHTML += `
                <tr class="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-200">
                    <td class="px-2 py-2 text-right text-xs">TOTAL KESELURUHAN</td>
                    <td class="px-2 py-2 text-right text-sm">${totalGudangRow}</td>
                </tr>
            `;
        }
    }

    let displayCountsReady = {};
    let displayCountsTerjual = {};
    let displayCountsGudang = {};
    
    let totalReady = 0, totalTerjual = 0, totalGudang = 0;

    filteredDisplay.forEach(disp => {
        let merkText = (disp.merk || '').trim();
        let tipeText = (disp.tipe || '').trim();
        let fullModelName = `${merkText} ${tipeText}`.trim();
        if(!fullModelName || fullModelName === "- -") fullModelName = "Model Tidak Diketahui";
        
        let statusDisp = disp.status || 'Ready';

        if(statusDisp === 'Ready') {
            displayCountsReady[fullModelName] = (displayCountsReady[fullModelName] || 0) + 1;
            totalReady++;
        } else if(statusDisp === 'Terjual') {
            displayCountsTerjual[fullModelName] = (displayCountsTerjual[fullModelName] || 0) + 1;
            totalTerjual++;
        } else if(statusDisp === 'Gudang') {
            displayCountsGudang[fullModelName] = (displayCountsGudang[fullModelName] || 0) + 1;
            totalGudang++;
        }
    });

    function renderDisplayGroup(title, dataObj, totalGroup, iconStr, textColor, bgColor) {
        let keys = Object.keys(dataObj).sort();
        if(keys.length === 0) return '';
        
        let html = `
            <tr class="${bgColor} border-y border-slate-200">
                <td colspan="2" class="px-2 py-1.5 font-bold ${textColor} text-[10px] uppercase tracking-wider">${iconStr} ${title} (Sub-Total: ${totalGroup})</td>
            </tr>
        `;
        keys.forEach(model => {
            html += `
                <tr class="hover:bg-slate-50 transition">
                    <td class="px-2 py-1 font-medium text-slate-700 pl-4">▸ ${model}</td>
                    <td class="px-2 py-1 text-right font-bold text-slate-900">${dataObj[model]}</td>
                </tr>
            `;
        });
        return html;
    }

    const displayModelsTbody = document.getElementById('dashboard-display-models-tbody');
    if (displayModelsTbody) {
        displayModelsTbody.innerHTML = '';
        if(filteredDisplay.length === 0) {
            displayModelsTbody.innerHTML = `<tr><td colspan="2" class="px-2 py-3 text-center text-gray-400 italic">Tidak ada unit display pada kriteria filter ini</td></tr>`;
        } else {
            let finalHtml = '';
            
            finalHtml += renderDisplayGroup('Ready di Etalase', displayCountsReady, totalReady, '<i class="fa-solid fa-store"></i>', 'text-cyan-700', 'bg-cyan-50/50');
            finalHtml += renderDisplayGroup('Sudah Terjual', displayCountsTerjual, totalTerjual, '<i class="fa-solid fa-money-bill-wave"></i>', 'text-emerald-700', 'bg-emerald-50/50');
            finalHtml += renderDisplayGroup('Ditarik ke Gudang (Off)', displayCountsGudang, totalGudang, '<i class="fa-solid fa-arrow-rotate-left"></i>', 'text-amber-700', 'bg-amber-50/50');
            
            finalHtml += `
                <tr class="bg-slate-100 font-bold text-slate-800 border-t-2 border-slate-200">
                    <td class="px-2 py-2 text-right text-xs">TOTAL KESELURUHAN</td>
                    <td class="px-2 py-2 text-right text-sm">${filteredDisplay.length}</td>
                </tr>
            `;
            
            displayModelsTbody.innerHTML = finalHtml;
        }
    }

    let sAntrean = dataServices.filter(s => s.status === 'Antrean').length;
    let sProses = dataServices.filter(s => s.status === 'Proses').length;
    let sSelesai = dataServices.filter(s => s.status === 'Selesai').length;

    let cSurvei = dataCctv.filter(c => c.status === 'Survei').length;
    let cKerja = dataCctv.filter(c => c.status === 'Pengerjaan').length;
    let cSelesai = dataCctv.filter(c => c.status === 'Selesai' || c.status === 'Selesai / Serah Terima').length;

    const ctxWorkload = document.getElementById('chartWorkload').getContext('2d');
    if (chartWorkloadInstance !== null) chartWorkloadInstance.destroy();
    
    chartWorkloadInstance = new Chart(ctxWorkload, {
        type: 'bar',
        data: {
            labels: ['Tahap Awal', 'Berjalan', 'Selesai'],
            datasets: [
                {
                    label: 'Services',
                    data: [sAntrean, sProses, sSelesai],
                    backgroundColor: 'rgba(236, 72, 153, 0.85)',
                    borderRadius: 4
                },
                {
                    label: 'CCTV',
                    data: [cSurvei, cKerja, cSelesai],
                    backgroundColor: 'rgba(59, 130, 246, 0.85)',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, color: '#64748b' } }
            }
        }
    });

    const ctxLaptop = document.getElementById('chartLaptopStock').getContext('2d');
    if (chartLaptopStockInstance !== null) chartLaptopStockInstance.destroy();

    chartLaptopStockInstance = new Chart(ctxLaptop, {
        type: 'doughnut',
        data: {
            labels: ['Tersedia ('+lapReady+')', 'Disewa ('+lapSewa+')', 'Maintenance ('+lapRusak+')', 'Terjual ('+lapTerjual+')'],
            datasets: [{
                data: [lapReady, lapSewa, lapRusak, lapTerjual],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#64748b'],
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
            }
        }
    });
}

// Daftarkan fungsi calculateAndRenderStats secara eksplisit ke window global
window.calculateAndRenderStats = calculateAndRenderStats;

function updateDashboardBranchFilters() {
    let branches = new Set();
    branches.add("Monumen Emmy Saelan");
    branches.add("Perintis");

    (globalDataCloud['list_laptop'] || []).forEach(item => { if(item.cabang) branches.add(item.cabang); });
    (globalDataCloud['laptop_display'] || []).forEach(item => { if(item.cabang) branches.add(item.cabang); });
    
    const gudangSelect = document.getElementById('filter-gudang-cabang');
    const displaySelect = document.getElementById('filter-display-cabang');
    const mainBranchSelect = document.getElementById('branch-filter');
    
    let optionsHtml = '<option value="">Semua Cabang</option>';
    [...branches].sort().forEach(b => {
        optionsHtml += `<option value="${b}">${b}</option>`;
    });

    if (gudangSelect && displaySelect) {
        let currentGudang = gudangSelect.value;
        let currentDisplay = displaySelect.value;
        gudangSelect.innerHTML = optionsHtml;
        displaySelect.innerHTML = optionsHtml;
        gudangSelect.value = currentGudang;
        displaySelect.value = currentDisplay;
    }

    if(mainBranchSelect) {
        let currentMainBranch = mainBranchSelect.value;
        mainBranchSelect.innerHTML = optionsHtml;
        mainBranchSelect.value = currentMainBranch;
    }
}

function updateDynamicDatalists() {
    const allLaptops = [...(globalDataCloud['list_laptop'] || []), ...(globalDataCloud['laptop_display'] || [])];
    const allServices = globalDataCloud['services'] || [];
    const allSewa = globalDataCloud['penyewaan'] || [];
    const allCCTV = globalDataCloud['cctv'] || [];

    function fillList(id, dataSet) {
        let container = document.getElementById('datalist-container');
        let listEl = document.getElementById(id);
        if (!listEl) {
            listEl = document.createElement('datalist');
            listEl.id = id;
            container.appendChild(listEl);
        }
        listEl.innerHTML = '';
        dataSet.forEach(val => {
            if (val && val !== '-' && val.trim() !== '') {
                const safeVal = val.replace(/"/g, '&quot;');
                listEl.innerHTML += `<option value="${safeVal}"></option>`;
            }
        });
    }

    const cabang = new Set(), teknisi = new Set(), merk = new Set(), tipe = new Set(), pelanggan = new Set(), penyewa = new Set(), klien = new Set();
    const procs = new Set(), rams = new Set(), storages = new Set(), vgas = new Set();

    allLaptops.forEach(lap => {
        if(lap.cabang) cabang.add(lap.cabang.trim());
        if(lap.teknisi) teknisi.add(lap.teknisi.trim());
        if(lap.merk) merk.add(lap.merk.trim());
        if(lap.tipe) tipe.add(lap.tipe.trim());
        
        let spekStr = lap.spek || lap.spek_singkat || '';
        let mCPU = spekStr.match(/CPU:\s*(.*?)(?=\n|RAM:|SSD\/HDD:|VGA\/Layar:|$)/i);
        let mRAM = spekStr.match(/RAM:\s*(.*?)(?=\n|SSD\/HDD:|VGA\/Layar:|$)/i);
        let mStor = spekStr.match(/SSD\/HDD:\s*(.*?)(?=\n|VGA\/Layar:|$)/i);
        let mVGA = spekStr.match(/VGA\/Layar:\s*(.*?)(?:\s*\((Non-Touch|Touchscreen)\)|\n|$)/i);
        
        if(mCPU && mCPU[1]) procs.add(mCPU[1].replace(/\s+/g, ' ').trim());
        if(mRAM && mRAM[1]) rams.add(mRAM[1].replace(/\s+/g, ' ').trim());
        if(mStor && mStor[1]) storages.add(mStor[1].replace(/\s+/g, ' ').trim());
        if(mVGA && mVGA[1]) vgas.add(mVGA[1].replace(/\s+/g, ' ').trim());
    });

    allServices.forEach(s => { if(s.pelanggan) pelanggan.add(s.pelanggan.trim()); });
    allSewa.forEach(s => { if(s.penyewa) penyewa.add(s.penyewa.trim()); });
    allCCTV.forEach(c => { if(c.klien) klien.add(c.klien.trim()); });

    cabang.add("Monumen Emmy Saelan");
    cabang.add("Perintis");

    fillList('list-cabang', cabang);
    fillList('list-teknisi', teknisi);
    fillList('list-merk', merk);
    fillList('list-tipe', tipe);
    fillList('list-proc', procs);
    fillList('list-ram', rams);
    fillList('list-storage', storages);
    fillList('list-vga', vgas);
    fillList('list-pelanggan', pelanggan);
    fillList('list-penyewa', penyewa);
    fillList('list-klien', klien);
}

window.autoFillSpecsByTipe = function(event) {
    const tipeValue = event.target.value;
    if(!tipeValue) return;

    const allLaptops = [...(globalDataCloud['list_laptop'] || []), ...(globalDataCloud['laptop_display'] || [])];
    const found = allLaptops.find(lap => lap.tipe === tipeValue);
    
    if(found) {
        const form = document.getElementById('operational-form');
        
        const merkInput = form.querySelector('[name="merk"]');
        if(merkInput && !merkInput.value) merkInput.value = found.merk || '';
        
        let spekStr = found.spek || found.spek_singkat || '';
        let mCPU = spekStr.match(/CPU:\s*(.*?)(?=\n|RAM:|SSD\/HDD:|VGA\/Layar:|$)/i);
        let mRAM = spekStr.match(/RAM:\s*(.*?)(?=\n|SSD\/HDD:|VGA\/Layar:|$)/i);
        let mStor = spekStr.match(/SSD\/HDD:\s*(.*?)(?=\n|VGA\/Layar:|$)/i);
        let mVGA = spekStr.match(/VGA\/Layar:\s*(.*?)(?:\s*\((Non-Touch|Touchscreen)\)|\n|$)/i);
        
        if(mCPU && form.querySelector('[name="spec_proc"]')) form.querySelector('[name="spec_proc"]').value = mCPU[1].trim();
        if(mRAM && form.querySelector('[name="spec_ram"]')) form.querySelector('[name="spec_ram"]').value = mRAM[1].trim();
        if(mStor && form.querySelector('[name="spec_storage"]')) form.querySelector('[name="spec_storage"]').value = mStor[1].trim();
        if(mVGA) {
            if(form.querySelector('[name="spec_vga"]')) form.querySelector('[name="spec_vga"]').value = mVGA[1].trim();
            if(form.querySelector('[name="spec_screen"]') && mVGA[2]) form.querySelector('[name="spec_screen"]').value = mVGA[2].trim();
        }
    }
};

window.switchTab = switchTab;
function switchTab(tabName) {
    const perms = window.currentUser.permissions || {};
    if (tabName !== 'login' && !isPermitted(perms[tabName])) {
        const tabsOrder = ['dashboard','services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'list_office', 'user_management', 'activity_logs'];
        const firstAllowed = tabsOrder.find(t => isPermitted(perms[t]));

    if (!firstAllowed) {
        return;
    }

tabName = firstAllowed;
        if (!foundTab) return; 
    }

    if (window.innerWidth < 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
            toggleSidebar(); 
        }
    }

    currentTab = tabName;
    if (!isPermitted(perms[currentTab])) {
    return;
}
    sessionStorage.setItem('activeTab', tabName);
    
    selectedLaptopKeys = []; 
    
    const titles = { 
        dashboard: "Dashboard Operasional",
        services: "Input Log Services", 
        penyewaan: "Input Data Penyewaan", 
        cctv: "Input Proyek CCTV Pemasangan",
        list_laptop: "Manajemen Unit Laptop yang Disewakan (Master Data)",
        laptop_display: "Manajemen List Laptop Display (Etalase Toko)",
        list_office: "Manajemen Akun dan Lisensi Office",
        user_management: "User Management (Kontrol Akun & Hak Akses)",
        activity_logs: "Riwayat Aktivitas & Audit Log Operasional"
    };

    const btnClearLabels = {
        dashboard: "Dashboard Operasional",
        services: "Kosongkan Data Services",
        penyewaan: "Kosongkan Data Penyewaan",
        cctv: "Kosongkan Data CCTV",
        list_laptop: "Kosongkan Master Laptop",
        laptop_display: "Kosongkan List Laptop Display",
        list_office: "Kosongkan Data Office",
        user_management: "Kosongkan Data Users",
        activity_logs: "Kosongkan Log Aktivitas"
    };
    
    document.getElementById('page-title').innerText = titles[tabName];
    document.getElementById('form-fields').innerHTML = fieldsTemplate[tabName];
    document.getElementById('search-bar').value = ''; 

    const formCard = document.getElementById('form-container-card');
    if (formCard) {
        if (tabName === 'activity_logs') {
            formCard.style.display = 'none';
        } else {
            formCard.style.display = 'block';
        }
    }

    const dateInput = document.querySelector('#form-fields input[name="tanggal"]');
    if (dateInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    if (window.userBranch) {
        const cabangInput = document.querySelector('#form-fields input[name="cabang"]');
        if (cabangInput) {
            cabangInput.value = window.userBranch;
            cabangInput.readOnly = true;
            cabangInput.className = "w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-gray-100 text-gray-500 cursor-not-allowed focus:outline-none";
        }
    }

    const filterDropdown = document.getElementById('status-filter');
    if (filterDropdown) {
        filterDropdown.innerHTML = '<option value="">Semua Status</option>';
        if (tabName === 'activity_logs') {
            filterDropdown.innerHTML = '<option value="">Semua Aksi</option>';
        }
        const options = filterOptionsTemplate[tabName] || [];
        options.forEach(opt => {
            filterDropdown.innerHTML += `<option value="${opt}">${opt}</option>`;
        });
    }

    const branchContainer = document.getElementById('branch-filter-container');
    if (branchContainer) {
        if((tabName === 'list_laptop' || tabName === 'laptop_display') && !window.userBranch) {
            branchContainer.style.display = 'block';
        } else {
            branchContainer.style.display = 'none';
        }
    }

    const txtClearBtn = document.getElementById('clear-btn-text');
    if (txtClearBtn) {
        txtClearBtn.innerText = btnClearLabels[tabName];
    }
    
    const btnExport = document.getElementById('btn-export-excel');
    const btnImport = document.getElementById('btn-import-excel');
    if (btnExport) btnExport.style.display = perms.export_excel ? '' : 'none';
    if (btnImport) btnImport.style.display = perms.import_excel ? '' : 'none';

    const btnPurge = document.getElementById('btn-purge-logs');
    if (btnPurge) {
        if (tabName === 'activity_logs' && perms.delete_data) {
            btnPurge.classList.remove('hidden');
        } else {
            btnPurge.classList.add('hidden');
        }
    }
    
    ['services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'list_office','user_management', 'activity_logs'].forEach(tab => {
        const btn = document.getElementById(`btn-${tab}`);
        if(btn) {
            if(tab === tabName) {
                btn.className = "w-full flex items-center space-x-3 px-4 py-3 rounded-lg bg-slate-800 text-cyan-400 font-medium transition";
            } else {
                btn.className = "w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition";
            }
        }
    });

    // PERBAIKAN SINTAKS KRITIS: Menghubungkan fungsi ke window global dengan aman
    window.renderTableHeader = renderTableHeader;
    renderTableHeader();
    
    isTabLoadingState = true;
    showTableLoading("Mengambil & Menyinkronkan Data Cloud...");
    
    setTimeout(() => {

    isTabLoadingState = false;

    if (isPermitted(perms[currentTab])) {
        renderTable();
    }
},350);
}

window.renderTableHeader = renderTableHeader;
function renderTableHeader() {
    const head = document.getElementById('table-head');
    if(!head) return;
    let html = '<tr>';
    tableHeaders[currentTab].forEach(header => {
        if(header === 'Kode Toko' || header === 'Harga Jual' || header === 'Cabang') {
            html += `<th class="px-4 py-3 font-semibold whitespace-nowrap">${header}</th>`;
        } else {
            html += `<th class="px-4 py-3 font-semibold">${header}</th>`;
        }
    });
    html += '</tr>';
    head.innerHTML = html;
}

window.populateLaptopCheckboxes = populateLaptopCheckboxes;
function populateLaptopCheckboxes() {
    const container = document.getElementById('checkbox-laptop-container');
    if(!container) return;

    const masterLaptop = globalDataCloud['list_laptop'] || [];
    if(masterLaptop.length === 0) {
        container.innerHTML = `<span class="text-xs text-gray-400 italic">Tidak ada laptop di gudang (Isi di menu Laptop Penyewaan)</span>`;
        return;
    }

    const searchInput = document.getElementById('search-form-laptop');
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';

    const filteredLaptop = masterLaptop.filter(lap => {
        const brand = (lap.merk || '').toLowerCase();
        const type = (lap.tipe || '').toLowerCase();
        const sn = (lap.sn || '').toLowerCase();
        const spec = (lap.spek || '').toLowerCase();
        const kdtoko = (lap.kode_toko || '').toLowerCase();
        return brand.includes(searchQuery) || type.includes(searchQuery) || sn.includes(searchQuery) || spec.includes(searchQuery) || kdtoko.includes(searchQuery);
    });

    if(filteredLaptop.length === 0) {
        container.innerHTML = `<span class="text-xs text-gray-400 italic block py-2 text-center">Unit laptop tidak ditemukan.</span>`;
        return;
    }

    let html = '';
    filteredLaptop.forEach((lap) => {
        const snText = lap.sn ? lap.sn : 'Tanpa SN'; 
        const kdTokoText = lap.kode_toko ? lap.kode_toko : '-';
        const infoText = `${lap.merk} ${lap.tipe} [SN: ${snText}] [Kode: ${kdTokoText}]`;
        const isDisabled = lap.status !== 'Tersedia';
        const isChecked = selectedLaptopKeys.includes(lap._firebaseKey) ? 'checked' : '';
        
        html += `
            <label class="flex items-start space-x-3 p-1.5 hover:bg-slate-50 rounded-lg transition text-sm ${isDisabled ? 'text-gray-400 bg-gray-50' : 'cursor-pointer'}">
                <input type="checkbox" 
                       name="selected_laptops" 
                       value="${infoText}" 
                       data-key="${lap._firebaseKey}" 
                       ${isDisabled ? 'disabled' : ''} 
                       ${isChecked}
                       onchange="syncCheckboxState(this)"
                       class="mt-1 rounded text-cyan-600 focus:ring-cyan-500 focus:outline-none border-gray-300 disabled:bg-gray-200">
                <div>
                    <span class="font-semibold text-slate-800">${lap.merk} ${lap.tipe}</span> 
                    <span class="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-bold ml-1">${kdTokoText}</span>
                    <span class="block text-xs text-gray-500">SN: <span class="font-mono text-cyan-600 font-medium">${snText}</span> | ${lap.spek ? lap.spek.replace(/\n/g, ' / ') : ''}</span>
                    ${lap.catatan ? `<span class="block text-[11px] text-amber-600 font-medium italic">Catatan: ${lap.catatan}</span>` : ''}
                    ${isDisabled ? `<span class="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-semibold mt-0.5 inline-block">${lap.status === 'Staf' ? 'Digunakan Staf' : lap.status}</span>` : ''}
                </div>
            </label>
        `;
    });
    container.innerHTML = html;
}

window.syncCheckboxState = function(cb) {
    const laptopKey = cb.getAttribute('data-key');
    if (cb.checked) {
        if (!selectedLaptopKeys.includes(laptopKey)) {
            selectedLaptopKeys.push(laptopKey);
        }
    } else {
        selectedLaptopKeys = selectedLaptopKeys.filter(key => key !== laptopKey);
    }
};

window.importSpreadsheet = function(e) {
    const perms = window.currentUser.permissions || {};
    if(!isPermitted(perms.import_excel)) {
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
            const excelRows = XLSX.utils.sheet_to_json(worksheet);
            
            if (excelRows.length === 0) {
                showToast("File spreadsheet kosong atau format salah","error");
                return;
            }

            const labelsMapping = {
                services: "Log Services",
                penyewaan: "Data Penyewaan",
                cctv: "Proyek CCTV",
                list_laptop: "Laptop Penyewaan (Master)",
                laptop_display: "Laptop Display (Etalase)",
                list_office: "List Akun Office",
                user_management: "User Management"
            };

            const tabNameStr = labelsMapping[currentTab] || currentTab;
            if (!confirm(`Ditemukan ${excelRows.length} baris data. Impor langsung ke cloud database pada list [${tabNameStr}]?`)) return;

            const targetNodeRef = ref(db, currentTab);
            const d = new Date();
            const tglInput = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            
            const currentDataTab = globalDataCloud[currentTab] || [];
            let currentMaxId = currentDataTab.length === 0 ? 0 : Math.max(...currentDataTab.map(l => Number(l.id) || 0));

            excelRows.forEach((row) => {
                currentMaxId++;
                
                const getVal = (possibleKeys, defaultVal = '-') => {
                    for (let k of possibleKeys) {
                        if (row[k] !== undefined) return row[k];
                        const lowerK = k.toLowerCase();
                        if (row[lowerK] !== undefined) return row[lowerK];
                        const upperK = k.toUpperCase();
                        if (row[upperK] !== undefined) return row[upperK];
                    }
                    return defaultVal;
                };

                let newItemData = {
                    id: currentMaxId,
                    tanggal: getVal(['tanggal', 'tanggal_input', 'tanggal_masuk', 'tgl', 'date'], tglInput)
                };

                if (currentTab === 'list_laptop') {
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

                } else if (currentTab === 'laptop_display') {
                    let textSpek = getVal(['spek_singkat', 'spek', 'spesifikasi'], '-');
                    newItemData.cabang = getVal(['cabang', 'cabang_toko'], 'Monumen Emmy Saelan');
                    newItemData.teknisi = getVal(['teknisi', 'nama_teknisi'], '-');
                    newItemData.merk = getVal(['merk', 'brand'], '-');
                    newItemData.tipe = getVal(['tipe', 'model', 'tipe_model'], '-');
                    newItemData.sn = String(getVal(['sn', 'serial_number', 'serial'], '-'));
                    newItemData.spek_singkat = textSpek;
                    newItemData.harga_jual = getVal(['harga_jual', 'harga'], 0);
                    newItemData.status = getVal(['status'], 'Ready');
                    newItemData.catatan = getVal(['catatan', 'keterangan'], '');

                } else if (currentTab === 'services') {
                    newItemData.pelanggan = getVal(['pelanggan', 'nama_pelanggan', 'nama'], '-');
                    newItemData.perangkat = getVal(['perangkat', 'device', 'unit'], '-');
                    newItemData.kerusakan = getVal(['kerusakan', 'gejala', 'keluhan'], '-');
                    newItemData.biaya = getVal(['biaya', 'estimasi_biaya', 'harga'], 0);
                    newItemData.status = getVal(['status'], 'Antrean');

                } else if (currentTab === 'penyewaan') {
                    newItemData.penyewa = getVal(['penyewa', 'nama_penyewa', 'nama'], '-');
                    newItemData.tgl_mulai = getVal(['tgl_mulai', 'mulai_sewa', 'tgl_sewa'], tglInput);
                    newItemData.tgl_selesai = getVal(['tgl_selesai', 'selesai_sewa', 'tgl_kembali'], tglInput);
                    newItemData.total_biaya = getVal(['total_biaya', 'biaya_sewa', 'harga'], 0);
                    newDataItem.status = getVal(['status', 'status_pembayaran'], 'Belum Bayar');
                    newItemData.unit = getVal(['unit', 'unit_laptop', 'laptop'], '-');

                } else if (currentTab === 'cctv') {
                    newItemData.klien = getVal(['klien', 'nama_klien', 'instansi'], '-');
                    newItemData.lokasi = getVal(['lokasi', 'lokasi_pemasangan', 'alamat'], '-');
                    newItemData.jumlah_cctv = getVal(['jumlah_cctv', 'jumlah', 'kamera'], 0);
                    newItemData.progres = getVal(['progres', 'progres_kerja'], 'Penarikan Kabel');
                    newItemData.status = getVal(['status', 'status_proyek'], 'Survei');

                } else if (currentTab === 'list_office') {
                    newItemData.nama_user = getVal(['nama_user', 'user', 'nama'], '-');
                    newItemData.akun = getVal(['akun', 'email', 'gmail'], '-');
                    newItemData.password = getVal(['password', 'pass'], '-');
                    newItemData.pemulihan = getVal(['pemulihan', 'info_pemulihan'], '-');
                    newItemData.tipe_akun = getVal(['tipe_akun', 'tipe'], 'Anggota'); 
                    newItemData.office = getVal(['office', 'jenis_office', 'lisensi'], '-');
                    newItemData.name = getVal(['name', 'device', 'nama_pc'], '-');
                    newItemData.workspace_expired = getVal(['workspace_expired', 'masa_aktif', 'masa', 'expired', 'durasi'], '-');
                    newItemData.status = getVal(['status', 'status_lisensi'], 'Aktif');
                    
                }

                const newPostPushRef = push(targetNodeRef);
                set(newPostPushRef, newItemData);
            });

            logActivity('Impor', currentTab, `Mengimpor sebanyak ${excelRows.length} baris data dari file spreadsheet.`);
            showToast("Data spreadsheet berhasil diimpor!");
            e.target.value = ''; 
        } catch (err) {
            alert("Gagal membaca dokumen spreadsheet: " + err.message);
        }
    };
    reader.readAsBinaryString(file);
};

window.clearCurrentListData = clearCurrentListData;
function clearCurrentListData() {
    const perms = window.currentUser.permissions || {};
    if(!isPermitted(perms.delete_data)) {
        alert("Anda tidak memiliki hak akses untuk mengosongkan/menghapus data.");
        return;
    }

    const listNames = {
        services: "Log Services",
        penyewaan: "Data Penyewaan",
        cctv: "Proyek CCTV",
        list_laptop: "Master Data List Laptop",
        laptop_display: "List Laptop Display",
        list_office: "List Akun Office",
        user_management: "User Management",
        activity_logs: "Riwayat Aktivitas"
    };

    const targetName = listNames[currentTab];
    const currentDataLength = (globalDataCloud[currentTab] || []).length;

    if (currentDataLength === 0) {
        alert(`List [ ${targetName} ] saat ini sudah kosong.`);
        return;
    }

    if (confirm(`🚨 PERINGATAN AKSES:\nHapus seluruh data terinput (${currentDataLength} baris) list [ ${targetName} ] secara permanen dari server Cloud?`)) {
        const inputConfirm = prompt(`Ketik kalimat verifikasi ini (Gunakan HURUF BESAR):\n${currentTab.toUpperCase()}`);
        if (inputConfirm === currentTab.toUpperCase()) {
            if (!db) return;
            const currentListRef = ref(db, currentTab);
            remove(currentListRef)
                .then(() => {
                    logActivity('Kosongkan', currentTab, `Mengosongkan seluruh baris data pada modul ${targetName}.`);
                    alert(`💥 Sukses dikosongkan.`);
                })
                .catch((err) => {
                    showToast("Gagal mengosongkan data: " + err.message, "error");
                });
        }
    }
}

window.renderTable = renderTable;
function renderTable() {
    const tbody = document.getElementById('table-body');
    if(!tbody) return;

    if (isTabLoadingState) {
        return;
    }

    const data = globalDataCloud[currentTab] || [];
    
    if (currentTab === 'activity_logs') {
        data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    const searchQuery = document.getElementById('search-bar').value.toLowerCase();
    const filterStatusValue = document.getElementById('status-filter').value;
    
    let branchFilterValue = window.userBranch || '';
    if(!branchFilterValue) {
        const branchFilterEl = document.getElementById('branch-filter');
        if(branchFilterEl && document.getElementById('branch-filter-container').style.display !== 'none') {
            branchFilterValue = branchFilterEl.value;
        }
    }
    
    tbody.innerHTML = '';

    const filteredData = data.filter(item => {
        if (filterStatusValue) {
            if (currentTab === 'activity_logs') {
                if (item.action !== filterStatusValue) return false;
            } else {
                if (item.status !== filterStatusValue) return false;
            }
        }
        if (branchFilterValue && item.cabang && item.cabang !== branchFilterValue) return false;
        
        return Object.values(item).some(val => {
            if (typeof val === 'object') return false;
            return String(val).toLowerCase().includes(searchQuery);
        });
    });

    const totalData = filteredData.length;

    if(totalData === 0) {
        tbody.innerHTML = `<tr><td colspan="${tableHeaders[currentTab].length}" class="px-4 py-8 text-center text-gray-400 bg-gray-50 font-medium"><i class="fa-solid fa-folder-open text-xl block mb-2"></i>Tidak ada data yang sesuai filter</td></tr>`;
        document.getElementById('pagination-controls').classList.add('hidden');
        return;
    }

    const totalPages = Math.ceil(totalData / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    paginatedData.forEach((item, index) => {
        const perms = window.currentUser.permissions || {};
        
        let rowBgColor = '';
        if (currentTab === 'penyewaan' && item.status !== 'Lunas') {
            const dateSelesai = new Date(item.tgl_selesai);
            const today = new Date();
            today.setHours(0,0,0,0);
            
            if (dateSelesai < today) {
                rowBgColor = 'bg-rose-50/70 hover:bg-rose-100/80 transition-colors duration-150';
            }
        }

        let rowHtml = `<tr class="${rowBgColor || 'hover:bg-slate-50 transition border-b'}">`;
        const keysOrder = dataKeysMapping[currentTab];
                
        keysOrder.forEach((key) => {
            const val = item[key] !== undefined ? item[key] : '-';
            
            if ((key === 'biaya' || key === 'total_biaya' || key === 'harga_jual') && currentTab !== 'list_laptop') {
                rowHtml += `<td class="px-4 py-3 font-medium text-slate-900">${Number(val).toLocaleString('id-ID')}</td>`;
            } else if (key === 'no_wa' && (currentTab === 'services' || currentTab === 'penyewaan')) {
                rowHtml += `
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                            <span class="font-mono text-xs text-slate-600">${val}</span>
                            ${val && val !== '-' ? `
                                <button onclick="window.sendWhatsAppNotify('${val}', '${currentTab === 'services' ? item.pelanggan : item.penyewa}', '${currentTab === 'services' ? item.perangkat : item.unit}', '${currentTab === 'services' ? item.biaya : item.total_biaya}', '${currentTab}')" class="text-emerald-500 hover:text-emerald-600 p-0.5 rounded transition hover:scale-110" title="Hubungi via WhatsApp">
                                    <i class="fa-brands fa-whatsapp text-base"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>`;
            } else if (key === 'permissions' && currentTab === 'user_management') {
                const permsDetail = val || {};
                let badges = [];
                if (isPermitted(permsDetail.dashboard)) badges.push('Dashboard');
                if (isPermitted(permsDetail.services)) badges.push('Services');
                if (isPermitted(permsDetail.penyewaan)) badges.push('Sewa');
                if (isPermitted(permsDetail.cctv)) badges.push('CCTV');
                if (isPermitted(permsDetail.list_laptop)) badges.push('Gudang');
                if (isPermitted(permsDetail.laptop_display)) badges.push('Display');
                if (isPermitted(permsDetail.list_office)) badges.push('Office');
                if (isPermitted(permsDetail.user_management)) badges.push('Users');
                if (isPermitted(permsDetail.activity_logs)) badges.push('Logs');
                if (isPermitted(permsDetail.backup_database)) badges.push('Backup'); 
                if (isPermitted(permsDetail.export_excel)) badges.push('Export');
                if (isPermitted(permsDetail.import_excel)) badges.push('Import');
                if (isPermitted(permsDetail.edit_data)) badges.push('Edit');
                if (isPermitted(permsDetail.delete_data)) badges.push('Hapus');

                let badgeHtml = '';
                if (badges.length === 0) {
                    badgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 inline-block">Tanpa Akses</span>`;
                } else {
                    const isScroll = badges.length > 4;
                    const scrollClass = isScroll ? 'max-h-[52px] overflow-y-auto custom-table-scrollbar pr-1' : '';
                    badgeHtml = `<div class="flex flex-wrap gap-1 max-w-[180px] ${scrollClass}">`;
                    badges.forEach(b => {
                        badgeHtml += `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-50 text-cyan-700 border border-cyan-100 whitespace-nowrap">${b}</span>`;
                    });
                    badgeHtml += `</div>`;
                }
                rowHtml += `<td class="px-4 py-3">${badgeHtml}</td>`;
            } else if (key === 'status') { 
                let badgeColor = "bg-amber-100 text-amber-800";
                let displayVal = val;
                
                // [BARU] Otomatis mengubah display status menjadi "Tidak Aktif" jika tanggal Masa Aktif telah terlewati (kedaluwarsa)
                if (currentTab === 'list_office') {
                    const expiredStr = item.workspace_expired || item.masa_aktif || '';
                    const expiredDate = parseFlexibleDate(expiredStr);
                    if (expiredDate) {
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        if (expiredDate < today) {
                            displayVal = 'Tidak Aktif';
                        }
                    }
                }

                if (displayVal === 'Selesai' || displayVal === 'Lunas' || displayVal === 'Tersedia' || displayVal === 'Ready' || displayVal === 'Aktif') badgeColor = "bg-emerald-100 text-emerald-800";
                if (displayVal === 'Permanen') badgeColor = "bg-cyan-100 text-cyan-800";
                if (displayVal === 'Belum Bayar' || displayVal === 'Maintenance' || displayVal === 'Gudang' || displayVal === 'Tidak Aksif' || displayVal === 'Tidak Aktif') badgeColor = "bg-rose-100 text-rose-800";
                if (displayVal === 'Disewa') badgeColor = "bg-blue-100 text-blue-800";
                if (displayVal === 'Terjual') badgeColor = "bg-slate-200 text-slate-800";
                if (displayVal === 'Staf') { badgeColor = "bg-indigo-100 text-indigo-800"; displayVal = "Digunakan Staf"; }
                rowHtml += `<td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-xs font-semibold ${badgeColor}">${displayVal}</span></td>`;
            } else if (key === 'action' && currentTab === 'activity_logs') {
                let badgeColor = "bg-sky-100 text-sky-800";
                if (val === 'Tambah') badgeColor = "bg-emerald-100 text-emerald-800";
                if (val === 'Ubah') badgeColor = "bg-amber-100 text-amber-800";
                if (val === 'Hapus') badgeColor = "bg-rose-100 text-rose-800";
                if (val === 'Kosongkan') badgeColor = "bg-purple-100 text-purple-800";
                if (val === 'Impor') badgeColor = "bg-indigo-100 text-indigo-800";
                rowHtml += `<td class="px-4 py-3"><span class="px-2.5 py-0.5 rounded text-xs font-bold ${badgeColor}">${val}</span></td>`;
            } else if (key === 'menu_display' && currentTab === 'activity_logs') {
                rowHtml += `<td class="px-4 py-3 font-semibold text-slate-500 uppercase text-[11px] tracking-wide">${val}</td>`;
            } else if (key === 'unit' && currentTab === 'penyewaan') {
                rowHtml += `
                    <td class="px-4 py-3 text-xs font-mono text-slate-700 whitespace-normal max-w-xs">
                        <div class="max-h-24 overflow-y-auto pr-2 space-y-1 custom-table-scrollbar">
                            ${val.replace(/, /g, '<br>')}
                        </div>
                    </td>`;
            } else if (key === 'spek_singkat' && currentTab === 'laptop_display') {
                rowHtml += `
                    <td class="px-4 py-3 text-xs text-slate-700 whitespace-normal max-w-xs">
                        <div class="max-h-20 overflow-y-auto pr-1 font-medium space-y-0.5 custom-table-scrollbar text-slate-600">
                            ${val.replace(/\n/g, '<br>')}
                        </div>
                    </td>`;
            } else if (key === 'spek' && currentTab === 'list_laptop') {
                rowHtml += `
                    <td class="px-4 py-3 text-xs text-slate-700 whitespace-normal max-w-xs">
                        <div class="max-h-20 overflow-y-auto pr-1 font-medium space-y-0.5 custom-table-scrollbar text-slate-600">
                            ${val.replace(/\n/g, '<br>')}
                        </div>
                    </td>`;
            } else if (key === 'sn') {
                rowHtml += `<td class="px-4 py-3 font-mono font-medium text-cyan-700">${val}</td>`;
            } else if (key === 'office' && currentTab === 'list_office') {
                // Deteksi tipe_akun untuk membuat badge visual pembeda (Kini ditambahkan tipe "Personal")
                const tipeAkun = item.tipe_akun || 'Anggota';
                let badgeHtml = '';
                if (tipeAkun === 'Utama') {
                    badgeHtml = `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-wider">Host/Server</span>`;
                } else if (tipeAkun === 'Personal') {
                    badgeHtml = `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-teal-100 text-teal-700 border border-teal-200 uppercase tracking-wider">Personal</span>`;
                } else {
                    badgeHtml = `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider">Anggota</span>`;
                }
                rowHtml += `<td class="px-4 py-3 whitespace-nowrap"><div class="flex items-center"><span>${val}</span>${badgeHtml}</div></td>`;
            } else if (key === 'password' && (currentTab === 'list_office' || currentTab === 'user_management')) {
                rowHtml += `
                    <td class="px-4 py-3">
                        <div class="flex items-center justify-between gap-2 min-w-[130px]">
                            <input type="password" id="tbl-pass-${item._firebaseKey}" value="${val}" readonly class="bg-transparent border-none p-0 w-full text-sm font-medium text-slate-700 focus:ring-0 cursor-default">
                            <button onclick="window.togglePassword('tbl-pass-${item._firebaseKey}', 'tbl-eye-${item._firebaseKey}')" class="text-gray-400 hover:text-cyan-600 focus:outline-none p-1">
                                <i id="tbl-eye-${item._firebaseKey}" class="fa-solid fa-eye"></i>
                            </button>
                        </div>
                    </td>`;
            } else if (key === 'kode_toko' && currentTab === 'list_laptop') {
                rowHtml += `<td class="px-4 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">${val}</td>`;
            } else if (key === 'catatan') {
                rowHtml += `<td class="px-4 py-3 text-xs font-medium italic text-slate-500 max-w-xs truncate" title="${val}">${val || '-'}</td>`;
            } else {
                rowHtml += `<td class="px-4 py-3">${val}</td>`;
            }
        });

        rowHtml += `<td class="px-4 py-3 flex items-center space-x-2">`;
        
        if (currentTab === 'penyewaan' && item.status !== 'Lunas' && item.status !== 'Selesai' && isPermitted(perms.edit_data)) {
            rowHtml += `
                <button onclick="window.markAsSelesai('${item._firebaseKey}')" class="text-emerald-500 hover:text-emerald-700 p-1 rounded hover:bg-emerald-50 transition" title="Selesai / Kembalikan Unit">
                    <i class="fa-solid fa-circle-check text-base"></i>
                </button>
            `;
        }
        
        if (isPermitted(perms.edit_data) && currentTab !== 'activity_logs') {
            rowHtml += `
                <button onclick="window.openEditModal('${item._firebaseKey}')" class="text-amber-500 hover:text-amber-700 p-1 rounded hover:bg-amber-50 transition" title="Edit Data">
                    <i class="fa-solid fa-pen-to-square text-base"></i>
                </button>
            `;
        }
        
        if (isPermitted(perms.delete_data)) {
            rowHtml += `
                <button onclick="window.deleteRow('${item._firebaseKey}')" class="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition" title="Hapus">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
        }
        
        rowHtml += `</td></tr>`;
        tbody.innerHTML += rowHtml;
    });

    const paginationControls = document.getElementById('pagination-controls');
    if (totalData > itemsPerPage) {
        paginationControls.classList.remove('hidden');
        document.getElementById('pagination-info').innerText = `Menampilkan data ke-${startIndex + 1} s/d ${Math.min(endIndex, totalData)} (Total ${totalData} Data)`;
        
        document.getElementById('btn-prev-page').disabled = (currentPage === 1);
        document.getElementById('btn-next-page').disabled = (currentPage === totalPages);
    } else {
        paginationControls.classList.add('hidden');
    }
}

window.openEditModal = openEditModal;
function openEditModal(firebaseKey) {
    const perms = window.currentUser.permissions || {};
    if(!isPermitted(perms.edit_data)) {
        alert("Anda tidak memiliki izin akses untuk mengubah data ini.");
        return;
    }

    const currentDataList = globalDataCloud[currentTab] || [];
    const targetItem = currentDataList.find(item => item._firebaseKey === firebaseKey);
    if(!targetItem) return;

    document.getElementById('edit-firebase-key').value = firebaseKey;
    const fieldsContainer = document.getElementById('edit-modal-fields');
    fieldsContainer.innerHTML = '';

    if (currentTab === 'services') {
        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Pelanggan</label><input type="text" id="edit-pelanggan" value="${targetItem.pelanggan || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">No. WhatsApp</label><input type="tel" id="edit-no_wa" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')" value="${targetItem.no_wa || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Perangkat</label><input type="text" id="edit-perangkat" value="${targetItem.perangkat || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Estimasi Biaya (Rp)</label><input type="number" id="edit-biaya" value="${targetItem.biaya || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Gejala / Kerusakan</label><textarea id="edit-kerusakan" rows="2" required class="w-full border p-2 text-sm rounded-lg">${targetItem.kerusakan || ''}</textarea></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Status</label><select id="edit-status" class="w-full border p-2 text-sm rounded-lg"><option value="Antrean" ${targetItem.status === 'Antrean' ? 'selected' : ''}>Antrean</option><option value="Proses" ${targetItem.status === 'Proses' ? 'selected' : ''}>Proses Pengecekan</option><option value="Selesai" ${targetItem.status === 'Selesai' ? 'selected' : ''}>Selesai</option></select></div>
        `;
    } else if (currentTab === 'cctv') {
        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Klien</label><input type="text" id="edit-klien" value="${targetItem.klien || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Lokasi Pemasangan</label><input type="text" id="edit-lokasi" value="${targetItem.lokasi || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Jumlah CCTV</label><input type="number" id="edit-jumlah_cctv" value="${targetItem.jumlah_cctv || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Progres</label><input type="text" id="edit-progres" value="${targetItem.progres || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Status Proyek</label><select id="edit-status" class="w-full border p-2 text-sm rounded-lg"><option value="Survei" ${targetItem.status === 'Survei' ? 'selected' : ''}>Tahap Survei</option><option value="Pengerjaan" ${targetItem.status === 'Pengerjaan' ? 'selected' : ''}>Sedang Dikerjakan</option><option value="Selesai" ${targetItem.status === 'Selesai' ? 'selected' : ''}>Selesai</option></select></div>
        `;
    } else if (currentTab === 'list_laptop') {
        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Tanggal Input</label><input type="date" id="edit-tanggal" value="${formatDateForInput(targetItem.tanggal)}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Cabang Toko</label><input type="text" id="edit-cabang" list="list-cabang" value="${targetItem.cabang || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Kode Toko</label><input type="text" id="edit-kode_toko" value="${targetItem.kode_toko || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Brand / Merk</label><input type="text" id="edit-merk" list="list-merk" value="${targetItem.merk || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Tipe / Model</label><input type="text" id="edit-tipe" list="list-tipe" value="${targetItem.tipe || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Serial Number (SN)</label><input type="text" id="edit-sn" value="${targetItem.sn || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Status Ketersediaan</label><select id="edit-status" class="w-full border p-2 text-sm rounded-lg"><option value="Tersedia" ${targetItem.status === 'Tersedia' ? 'selected' : ''}>Ready / Tersedia</option><option value="Disewa" ${targetItem.status === 'Disewa' ? 'selected' : ''}>Sedang Disewa</option><option value="Maintenance" ${targetItem.status === 'Maintenance' ? 'selected' : ''}>Perbaikan / Rusak</option><option value="Terjual" ${targetItem.status === 'Terjual' ? 'selected' : ''}>Sudah Terjual</option><option value="Staf" ${targetItem.status === 'Staf' ? 'selected' : ''}>Digunakan Oleh Staf</option></select></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Catatan Tambahan</label><input type="text" id="edit-catatan" value="${targetItem.catatan || ''}" class="w-full border p-2 text-sm rounded-lg"></div>
            <div class="md:col-span-2">
                <label class="block text-xs font-semibold text-slate-500 mb-1">Spesifikasi Unit (Pisahkan dengan baris enter)</label>
                <textarea id="edit-spek" rows="4" required class="w-full border p-2 text-sm rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500">${targetItem.spek || ''}</textarea>
            </div>
        `;
    } else if (currentTab === 'penyewaan') {
        window.editSelectedLaptopKeys = targetItem._linkedLaptopKeys ? [...targetItem._linkedLaptopKeys] : [];

        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Penyewa</label><input type="text" id="edit-penyewa" value="${targetItem.penyewa || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">No. WhatsApp</label><input type="tel" id="edit-no_wa" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')" value="${targetItem.no_wa || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div class="grid grid-cols-2 gap-2">
                <div><label class="block text-xs font-semibold text-slate-500 mb-1">Tanggal Mulai</label><input type="date" id="edit-tgl_mulai" value="${targetItem.tgl_mulai || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
                <div><label class="block text-xs font-semibold text-slate-500 mb-1">Tanggal Selesai</label><input type="date" id="edit-tgl_selesai" value="${targetItem.tgl_selesai || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            </div>
            
            <div class="md:col-span-2 space-y-1.5 border-t border-slate-200 pt-3 mt-1">
                <label class="block text-xs font-semibold text-slate-500">Edit Unit Laptop (Bisa Centang Banyak)</label>
                <div class="relative">
                    <i class="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-gray-400 text-xs"></i>
                    <input type="text" id="search-edit-laptop" oninput="window.populateEditLaptopCheckboxes()" placeholder="Ketik Merk, Tipe, SN, atau Kode Toko..." class="w-full pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none bg-slate-50">
                </div>
                <div id="edit-checkbox-laptop-container" class="border border-gray-300 rounded-xl p-2 max-h-40 overflow-y-auto bg-white space-y-1.5 custom-table-scrollbar">
                    <span class="text-xs text-gray-400 italic block py-2 text-center">Memuat list laptop...</span>
                </div>
            </div>

            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Total Biaya (Rp)</label><input type="number" id="edit-total_biaya" value="${targetItem.total_biaya || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Status Pembayaran</label><select id="edit-status" class="w-full border p-2 text-sm rounded-lg"><option value="Belum Bayar" ${targetItem.status === 'Belum Bayar' ? 'selected' : ''}>Belum Bayar</option><option value="DP 50%" ${targetItem.status === 'DP 50%' ? 'selected' : ''}>DP 50%</option><option value="Lunas" ${targetItem.status === 'Lunas' ? 'selected' : ''}>Lunas</option></select></div>
        `;
        
        setTimeout(() => { if (typeof populateEditLaptopCheckboxes === 'function') populateEditLaptopCheckboxes(); }, 50);
    } else if (currentTab === 'laptop_display') { 
        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Tanggal Masuk</label><input type="date" id="edit-tanggal" value="${formatDateForInput(targetItem.tanggal)}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Cabang Toko</label><input type="text" id="edit-cabang" list="list-cabang" value="${targetItem.cabang || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Teknisi</label><input type="text" id="edit-teknisi" list="list-teknisi" value="${targetItem.teknisi || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Brand / Merk</label><input type="text" id="edit-merk" list="list-merk" value="${targetItem.merk || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Tipe / Model</label><input type="text" id="edit-tipe" list="list-tipe" value="${targetItem.tipe || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Serial Number (SN)</label><input type="text" id="edit-sn" value="${targetItem.sn || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Harga Jual Display (Rp)</label><input type="number" id="edit-harga_jual" value="${targetItem.harga_jual || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Status Pajangan</label><select id="edit-status" class="w-full border p-2 text-sm rounded-lg"><option value="Ready" ${targetItem.status === 'Ready' ? 'selected' : ''}>Ready di Etalase</option><option value="Terjual" ${targetItem.status === 'Terjual' ? 'selected' : ''}>Sudah Terjual</option><option value="Gudang" ${targetItem.status === 'Gudang' ? 'selected' : ''}>Ditarik ke Gudang (Off)</option></select></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Catatan Etalase</label><input type="text" id="edit-catatan" value="${targetItem.catatan || ''}" class="w-full border p-2 text-sm rounded-lg"></div>
            <div class="md:col-span-2">
                <label class="block text-xs font-semibold text-slate-500 mb-1">Spesifikasi Pajangan (Pisahkan dengan baris enter)</label>
                <textarea id="edit-spek_singkat" rows="4" required class="w-full border p-2 text-sm rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500">${targetItem.spek_singkat || ''}</textarea>
            </div>
        `;
    } else if (currentTab === 'list_office') {
        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Tanggal Invite</label><input type="date" id="edit-tanggal" value="${formatDateForInput(targetItem.tanggal)}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama User</label><input type="text" id="edit-nama_user" value="${targetItem.nama_user || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Akun Gmail & Office</label><input type="text" id="edit-akun" value="${targetItem.akun || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Password</label>
                <div class="relative">
                    <input type="password" id="edit-password" value="${targetItem.password || ''}" required class="w-full border p-2 pr-10 text-sm rounded-lg">
                    <button type="button" onclick="window.togglePassword('edit-password', 'edit-eye')" class="absolute right-3 top-2.5 text-gray-400 hover:text-cyan-600 focus:outline-none transition">
                        <i id="edit-eye" class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </div>
            
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Pemulihan</label><input type="text" id="edit-pemulihan" value="${targetItem.pemulihan || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            
            <!-- BARU: SELEKTOR TIPE AKUN DI MODAL EDIT (KINI DITAMBAHKAN PILIHAN PERSONAL) -->
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Tipe Akun</label>
                <select id="edit-tipe_akun" class="w-full border p-2 text-sm rounded-lg">
                    <option value="Anggota" ${targetItem.tipe_akun === 'Anggota' ? 'selected' : ''}>Anggota (Member)</option>
                    <option value="Utama" ${targetItem.tipe_akun === 'Utama' ? 'selected' : ''}>Utama (Server / Host)</option>
                    <option value="Personal" ${targetItem.tipe_akun === 'Personal' ? 'selected' : ''}>Personal</option>
                </select>
            </div>

            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Lisensi Office</label><input type="text" id="edit-office" value="${targetItem.office || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Name (Device)</label><input type="text" id="edit-name" value="${targetItem.name || ''}" class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Masa Aktif</label><input type="text" id="edit-masa_aktif" value="${targetItem.workspace_expired || targetItem.masa_aktif || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Status</label><select id="edit-status" class="w-full border p-2 text-sm rounded-lg"><option value="Aktif" ${targetItem.status === 'Aktif' ? 'selected' : ''}>Aktif</option><option value="Tidak Aktif" ${targetItem.status === 'Tidak Aktif' ? 'selected' : ''}>Tidak Aktif</option><option value="Permanen" ${targetItem.status === 'Permanen' ? 'selected' : ''}>Permanen</option></select></div>
        `;
    } else if (currentTab === 'user_management') {
        const perms = targetItem.permissions || {};
        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Lengkap</label><input type="text" id="edit-user-name" value="${targetItem.name || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Email</label><input type="email" id="edit-user-email" value="${targetItem.email || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Password</label>
                <div class="relative">
                    <input type="password" id="edit-user-password" value="${targetItem.password || ''}" required class="w-full border p-2 pr-10 text-sm rounded-lg">
                    <button type="button" onclick="window.togglePassword('edit-user-password', 'edit-user-eye')" class="absolute right-3 top-2.5 text-gray-400 hover:text-cyan-600 focus:outline-none transition">
                        <i id="edit-user-eye" class="fa-solid fa-eye"></i>
                    </button>
                </div>
            </div>
            
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Cabang / Branch</label>
                <select id="edit-user-branch" class="w-full border p-2 text-sm rounded-lg">
                    <option value="Head Office" ${targetItem.branch === 'Head Office' ? 'selected' : ''}>Head Office</option>
                    <option value="Monumen Emmy Saelan" ${targetItem.branch === 'Monumen Emmy Saelan' ? 'selected' : ''}>Monumen Emmy Saelan</option>
                    <option value="Perintis" ${targetItem.branch === 'Perintis' ? 'selected' : ''}>Perintis</option>
                </select>
            </div>

            <div class="md:col-span-2 border-t pt-3 mt-2">
                <span class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2"><i class="fa-solid fa-key mr-1"></i> Edit Hak Akses Menu & Aksi</span>
                <div class="border border-gray-200 rounded-xl p-3 max-h-40 overflow-y-auto bg-slate-50 custom-table-scrollbar">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-dashboard" ${perms.dashboard ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>Dashboard</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-services" ${perms.services ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>Log Service</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-penyewaan" ${perms.penyewaan ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>Penyewaan</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-cctv" ${perms.cctv ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>CCTV</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-list_laptop" ${perms.list_laptop ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>Laptop Gudang</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-laptop_display" ${perms.laptop_display ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>Laptop Display</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-list_office" ${perms.list_office ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>List Office</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-user_management" ${perms.user_management ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>User Management</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-activity_logs" ${perms.activity_logs ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>Riwayat Aktivitas</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-backup" ${perms.backup_database ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>Backup Database</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-export" ${perms.export_excel ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>Export Excel</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-import" ${perms.import_excel ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>Import Excel</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-edit" ${perms.edit_data ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>Edit Data</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-delete" ${perms.delete_data ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                            <span>Hapus Data</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    if (window.userBranch) {
        const editCabang = document.getElementById('edit-cabang');
        if (editCabang) {
            editCabang.value = window.userBranch;
            editCabang.readOnly = true;
            editCabang.className = "w-full border p-2 text-sm rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed focus:outline-none";
        }
    }

    document.getElementById('edit-modal').classList.remove('hidden');
}

window.closeEditModal = closeEditModal;
function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

window.handleUpdateSubmit = handleUpdateSubmit;
function handleUpdateSubmit(e) {
    e.preventDefault();
    const firebaseKey = document.getElementById('edit-firebase-key').value;
    if(!firebaseKey || !db) return;

    let updatedData = {};
    let itemDescription = '';

    const btnUpdate = e.target.querySelector('button[type="submit"]');
    let originalText = '';
    if (btnUpdate) {
        originalText = btnUpdate.innerHTML;
        btnUpdate.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> Memperbarui...`;
        btnUpdate.disabled = true;
    }

    if (currentTab === 'services') {
        updatedData.pelanggan = document.getElementById('edit-pelanggan').value;
        updatedData.no_wa = document.getElementById('edit-no_wa').value;
        updatedData.perangkat = document.getElementById('edit-perangkat').value;
        updatedData.biaya = document.getElementById('edit-biaya').value;
        updatedData.status = document.getElementById('edit-status').value;
        updatedData.kerusakan = document.getElementById('edit-kerusakan').value;
        itemDescription = `${updatedData.pelanggan} (${updatedData.perangkat})`;
    } else if (currentTab === 'cctv') {
        updatedData.klien = document.getElementById('edit-klien').value;
        updatedData.lokasi = document.getElementById('edit-lokasi').value;
        updatedData.jumlah_cctv = document.getElementById('edit-jumlah_cctv').value;
        updatedData.progres = document.getElementById('edit-progres').value;
        updatedData.status = document.getElementById('edit-status').value;
        itemDescription = `${updatedData.klien} - ${updatedData.lokasi}`;
    } else if (currentTab === 'list_laptop') {
        let editTgl = document.getElementById('edit-tanggal').value;
        if (editTgl && editTgl.includes('-')) {
            const parts = editTgl.split('-');
            updatedData.tanggal = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        updatedData.cabang = document.getElementById('edit-cabang').value;
        updatedData.kode_toko = document.getElementById('edit-kode_toko').value;
        updatedData.merk = document.getElementById('edit-merk').value;
        updatedData.tipe = document.getElementById('edit-tipe').value;
        updatedData.sn = document.getElementById('edit-sn').value;
        updatedData.spek = document.getElementById('edit-spek').value;
        updatedData.status = document.getElementById('edit-status').value;
        updatedData.catatan = document.getElementById('edit-catatan').value;
        itemDescription = `${updatedData.merk} ${updatedData.tipe} (SN: ${updatedData.sn})`;
    } else if (currentTab === 'laptop_display') { 
        let editTgl = document.getElementById('edit-tanggal').value;
        if (editTgl && editTgl.includes('-')) {
            const parts = editTgl.split('-');
            updatedData.tanggal = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        updatedData.cabang = document.getElementById('edit-cabang').value;
        updatedData.teknisi = document.getElementById('edit-teknisi').value;
        updatedData.merk = document.getElementById('edit-merk').value;
        updatedData.tipe = document.getElementById('edit-tipe').value;
        updatedData.sn = document.getElementById('edit-sn').value;
        updatedData.harga_jual = document.getElementById('edit-harga_jual').value;
        updatedData.spek_singkat = document.getElementById('edit-spek_singkat').value;
        updatedData.status = document.getElementById('edit-status').value;
        updatedData.catatan = document.getElementById('edit-catatan').value;
        itemDescription = `${updatedData.merk} ${updatedData.tipe} (SN: ${updatedData.sn})`;
    } else if (currentTab === 'penyewaan') {
        const tglMulaiVal = document.getElementById('edit-tgl_mulai').value;
        const tglSelesaiVal = document.getElementById('edit-tgl_selesai').value;
        if (new Date(tglSelesaiVal) < new Date(tglMulaiVal)) {
            alert("Galat: Tanggal selesai sewa tidak boleh lebih awal daripada tanggal mulai!");
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
            return;
        }

        const newStatus = document.getElementById('edit-status').value;
        updatedData.penyewa = document.getElementById('edit-penyewa').value;
        updatedData.no_wa = document.getElementById('edit-no_wa').value;
        updatedData.tgl_mulai = tglMulaiVal;
        updatedData.tgl_selesai = tglSelesaiVal;
        updatedData.total_biaya = document.getElementById('edit-total_biaya').value;
        updatedData.status = newStatus;

        if (!window.editSelectedLaptopKeys || window.editSelectedLaptopKeys.length === 0) {
            alert("Silakan centang minimal 1 unit laptop!");
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
            return;
        }

        const masterLaptop = globalDataCloud['list_laptop'] || [];
        let listUnitSewa = [];
        window.editSelectedLaptopKeys.forEach(key => {
            const targetLap = masterLaptop.find(l => l._firebaseKey === key);
            if (targetLap) {
                listUnitSewa.push(`• ${targetLap.merk} ${targetLap.tipe} [SN: ${targetLap.sn || 'Tanpa SN'}]`);
            }
        });
        updatedData.unit = listUnitSewa.join(', ');
        updatedData._linkedLaptopKeys = window.editSelectedLaptopKeys;
        itemDescription = `Penyewa: ${updatedData.penyewa} (${updatedData.unit})`;

        const sewaItem = (globalDataCloud['penyewaan'] || []).find(item => item._firebaseKey === firebaseKey);
        const oldKeys = sewaItem && sewaItem._linkedLaptopKeys ? sewaItem._linkedLaptopKeys : [];
        const newKeys = window.editSelectedLaptopKeys;

        if (newStatus === 'Lunas' || newStatus === 'Selesai') {
            const allKeys = new Set([...oldKeys, ...newKeys]);
            allKeys.forEach(key => {
                const laptopStatusRef = ref(db, `list_laptop/${key}`);
                update(laptopStatusRef, { status: "Tersedia" });
            });
        } else {
            oldKeys.forEach(key => {
                if (!newKeys.includes(key)) {
                    const laptopStatusRef = ref(db, `list_laptop/${key}`);
                    update(laptopStatusRef, { status: "Tersedia" });
                }
            });
            
            newKeys.forEach(key => {
                if (!oldKeys.includes(key)) {
                    const laptopStatusRef = ref(db, `list_laptop/${key}`);
                    update(laptopStatusRef, { status: "Disewa" });
                }
            });
        }
    } else if (currentTab === 'list_office') {
        let editTgl = document.getElementById('edit-tanggal').value;
        if (editTgl && editTgl.includes('-')) {
            const parts = editTgl.split('-');
            updatedData.tanggal = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        updatedData.nama_user = document.getElementById('edit-nama_user').value;
        updatedData.akun = document.getElementById('edit-akun').value;
        updatedData.password = document.getElementById('edit-password').value;
        updatedData.pemulihan = document.getElementById('edit-pemulihan').value;
        updatedData.tipe_akun = document.getElementById('edit-tipe_akun').value; 
        updatedData.office = document.getElementById('edit-office').value;
        updatedData.name = document.getElementById('edit-name').value;
        updatedData.workspace_expired = document.getElementById('edit-masa_aktif').value;
        updatedData.status = document.getElementById('edit-status').value;
        itemDescription = `User: ${updatedData.nama_user} - Akun: ${updatedData.akun}`;
    } else if (currentTab === 'user_management') {
        // 1. Cari data terlebih dahulu menggunakan variabel baru (foundItem)
        const currentDataList = globalDataCloud['user_management'] || [];
        const foundItem = currentDataList.find(item => item._firebaseKey === firebaseKey);
        
        // 2. Baca permissions dari data yang sudah ditemukan
        const perms = foundItem?.permissions || {};
        
        updatedData.name = document.getElementById('edit-user-name')?.value || '';
        updatedData.email = document.getElementById('edit-user-email')?.value || '';
        updatedData.password = document.getElementById('edit-user-password')?.value || '';
        updatedData.branch = document.getElementById('edit-user-branch')?.value || 'Head Office';
        updatedData.role = 'custom';
        updatedData.permissions = {
            dashboard: document.getElementById('edit-perm-dashboard')?.checked || false,
            services: document.getElementById('edit-perm-services')?.checked || false,
            penyewaan: document.getElementById('edit-perm-penyewaan')?.checked || false,
            cctv: document.getElementById('edit-perm-cctv')?.checked || false,
            list_laptop: document.getElementById('edit-perm-list_laptop')?.checked || false,
            laptop_display: document.getElementById('edit-perm-laptop_display')?.checked || false,
            list_office: document.getElementById('edit-perm-list_office')?.checked || false,
            user_management: document.getElementById('edit-perm-user_management')?.checked || false,
            activity_logs: document.getElementById('edit-perm-activity_logs')?.checked || false,
            backup_database: document.getElementById('edit-perm-backup')?.checked || false, 
            export_excel: document.getElementById('edit-perm-export')?.checked || false,
            import_excel: document.getElementById('edit-perm-import')?.checked || false,
            edit_data: document.getElementById('edit-perm-edit')?.checked || false,
            delete_data: document.getElementById('edit-perm-delete')?.checked || false
        };

        if (foundItem && foundItem.uid) {
            updatedData.uid = foundItem.uid;
        }
        itemDescription = `Nama: ${updatedData.name} - Email: ${updatedData.email}`;
    }

    const targetItemRef = ref(db, `${currentTab}/${firebaseKey}`);
    update(targetItemRef, updatedData)
        .then(() => {
            logActivity('Ubah', currentTab, `Mengubah data pada modul ${currentTab} dengan detail: ${itemDescription}.`);
            closeEditModal();
            showToast("Data berhasil diperbarui secara online!");
        })
        .catch((error) => {
            showToast("Gagal memperbarui data: " + error.message, "error");
        })
        // PERBAIKAN: Ditambahkan kembali blok .finally() agar tombol Edit tidak stuck loading
        .finally(() => {
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
        });
}

window.markAsSelesai = markAsSelesai;
function markAsSelesai(firebaseKey) {
    const perms = window.currentUser.permissions || {};
    if(!isPermitted(perms.edit_data)) {
        alert("Anda tidak memiliki hak akses untuk mengedit atau menyelesaikan transaksi ini.");
        return;
    }

    if(confirm("Apakah unit laptop sudah dikembalikan dan pembayaran lunas?")) {
        const sewaItem = (globalDataCloud['penyewaan'] || []).find(item => item._firebaseKey === firebaseKey);
        if (sewaItem) {
            if (sewaItem._linkedLaptopKeys) {
                sewaItem._linkedLaptopKeys.forEach(laptopKey => {
                    const laptopStatusRef = ref(db, `list_laptop/${laptopKey}`);
                    update(laptopStatusRef, { status: "Tersedia" });
                });
            }
            const sewaStatusRef = ref(db, `penyewaan/${firebaseKey}`);
            update(sewaStatusRef, { status: "Lunas" }).then(() => {
                logActivity('Ubah', 'penyewaan', `Menyelesaikan & memproses pengembalian unit sewa ID #${sewaItem.id} atas nama Penyewa: ${sewaItem.penyewa}.`);
                showToast("Status penyewaan diubah menjadi Lunas!");
            });
        }
    }
}

window.handleSubmit = handleSubmit;
function handleSubmit(e) {
    e.preventDefault();
    if (!db) return;

    const formData = new FormData(e.target);
    const currentData = globalDataCloud[currentTab] || [];
    
    const d = new Date();
    const tanggalHariIni = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const btnSubmit = e.target.querySelector('button[type="submit"]');
    let originalText = '';
    if (btnSubmit) {
        originalText = btnSubmit.innerHTML;
        btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> Menyinkronkan...`;
        btnSubmit.disabled = true;
    }

    if (currentTab === 'penyewaan') {
        const tglMulai = new Date(formData.get('tgl_mulai'));
        const tglSelesai = new Date(formData.get('tgl_selesai'));
        if (tglSelesai < tglMulai) {
            alert("Galat: Tanggal selesai sewa tidak boleh lebih awal daripada tanggal mulai!");
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
            return;
        }
    }

    if (currentTab === 'user_management') {
        const name = formData.get('name');
        const email = formData.get('email');
        const password = formData.get('password');
        const branch = formData.get('branch');

        if (password.length < 6) {
            alert("Gagal: Password akun minimal harus terdiri dari 6 karakter!");
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
            return;
        }

        registerAuthUser(email, password)
            .then((uid) => {
                const permissions = {
                    dashboard: formData.get('perm_dashboard') === 'true',
                    services: formData.get('perm_services') === 'true',
                    penyewaan: formData.get('perm_penyewaan') === 'true',
                    cctv: formData.get('perm_cctv') === 'true',
                    list_laptop: formData.get('perm_list_laptop') === 'true',
                    laptop_display: formData.get('perm_laptop_display') === 'true',
                    list_office: formData.get('perm_list_office') === 'true',
                    user_management: formData.get('perm_user_management') === 'true',
                    activity_logs: formData.get('perm_activity_logs') === 'true',
                    backup_database: formData.get('perm_backup_database') === 'true', 
                    export_excel: formData.get('perm_export_excel') === 'true',
                    import_excel: formData.get('perm_import_excel') === 'true',
                    edit_data: formData.get('perm_edit_data') === 'true',
                    delete_data: formData.get('perm_delete_data') === 'true'
                };

                const nextId = currentData.length === 0 ? 1 : Math.max(...currentData.map(d => Number(d.id) || 0)) + 1;
                
                const newUserProfile = {
                    id: nextId,
                    uid: uid,
                    name: name,
                    email: email,
                    password: password,
                    role: 'custom',
                    branch: branch,
                    permissions: permissions
                };

                const userRef = ref(db, `user_management/${uid}`);
                return set(userRef, newUserProfile);
            })
            .then(() => {
                logActivity('Tambah', 'user_management', `Mendaftarkan user baru dengan Nama: ${name} (Email: ${email}).`);
                showToast("Akun Pengguna & Hak Akses berhasil didaftarkan secara online!");
                e.target.reset();
            })
            .catch((err) => {
                showToast("Gagal mendaftarkan akun: " + err.message, "error");
            })
            .finally(() => {
                if (btnSubmit) {
                    btnSubmit.innerHTML = originalText;
                    btnSubmit.disabled = false;
                }
            });
        
        return; 
    }

    const nextId = currentData.length === 0 ? 1 : Math.max(...currentData.map(d => Number(d.id) || 0)) + 1;
    const newDataItem = { id: nextId };

    let inputTgl = formData.get('tanggal');
    if (inputTgl && inputTgl.includes('-')) {
        const parts = inputTgl.split('-');
        newDataItem.tanggal = `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else {
        newDataItem.tanggal = tanggalHariIni;
    }

    let laptopKeysToUpdate = [];
    let logDetail = '';

    if (currentTab === 'penyewaan') {
        if (selectedLaptopKeys.length === 0) {
            alert("Silakan pilih minimal 1 laptop!");
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
            return;
        }

        let listUnitSewa = [];
        const masterLaptop = globalDataCloud['list_laptop'] || [];
        
        selectedLaptopKeys.forEach(key => {
            const targetLap = masterLaptop.find(l => l._firebaseKey === key);
            if (targetLap) {
                listUnitSewa.push(`• ${targetLap.merk} ${targetLap.tipe} [SN: ${targetLap.sn || 'Tanpa SN'}]`);
                laptopKeysToUpdate.push(key);
            }
        });

        newDataItem.penyewa = formData.get('penyewa');
        newDataItem.no_wa = formData.get('no_wa');
        newDataItem.tgl_mulai = formData.get('tgl_mulai');
        newDataItem.tgl_selesai = formData.get('tgl_selesai');
        newDataItem.total_biaya = formData.get('total_biaya');
        newDataItem.status = formData.get('status');
        newDataItem.unit = listUnitSewa.join(', ');
        newDataItem._linkedLaptopKeys = laptopKeysToUpdate;
        logDetail = `Penyewa: ${newDataItem.penyewa} dengan unit sewa: ${newDataItem.unit}`;
    } else if (currentTab === 'list_laptop') {
        const proc = formData.get('spec_proc');
        const ram = formData.get('spec_ram');
        const storage = formData.get('spec_storage');
        const vga = formData.get('spec_vga');
        const screen = formData.get('spec_screen');

        newDataItem.cabang = formData.get('cabang');
        newDataItem.merk = formData.get('merk');
        newDataItem.tipe = formData.get('tipe');
        newDataItem.sn = formData.get('sn');
        newDataItem.kode_toko = formData.get('kode_toko');
        newDataItem.status = formData.get('status');
        newDataItem.catatan = formData.get('catatan') || '';
        newDataItem.spek = `CPU: ${proc}\nRAM: ${ram}\nSSD/HDD: ${storage}\nVGA/Layar: ${vga} (${screen})`;
        logDetail = `${newDataItem.merk} ${newDataItem.tipe} (SN: ${newDataItem.sn}) di cabang ${newDataItem.cabang}`;
    } else if (currentTab === 'laptop_display') {
        const proc = formData.get('spec_proc');
        const ram = formData.get('spec_ram');
        const storage = formData.get('spec_storage');
        const vga = formData.get('spec_vga');
        const screen = formData.get('spec_screen');

        newDataItem.cabang = formData.get('cabang');
        newDataItem.teknisi = formData.get('teknisi');
        newDataItem.merk = formData.get('merk');
        newDataItem.tipe = formData.get('tipe');
        newDataItem.sn = formData.get('sn');
        newDataItem.harga_jual = formData.get('harga_jual');
        newDataItem.status = formData.get('status');
        newDataItem.catatan = formData.get('catatan') || '';
        newDataItem.spek_singkat = `CPU: ${proc}\nRAM: ${ram}\nSSD/HDD: ${storage}\nVGA/Layar: ${vga} (${screen})`;
        logDetail = `${newDataItem.merk} ${newDataItem.tipe} (SN: ${newDataItem.sn}) di etalase cabang ${newDataItem.cabang}`;
    } else if (currentTab === 'services') {
        newDataItem.pelanggan = formData.get('pelanggan');
        newDataItem.no_wa = formData.get('no_wa');
        newDataItem.perangkat = formData.get('perangkat');
        newDataItem.kerusakan = formData.get('kerusakan');
        newDataItem.biaya = formData.get('biaya');
        newDataItem.status = formData.get('status');
        logDetail = `Pelanggan: ${newDataItem.pelanggan} - Unit: ${newDataItem.perangkat} (Kerusakan: ${newDataItem.kerusakan})`;
    } else if (currentTab === 'cctv') {
        newDataItem.klien = formData.get('klien');
        newDataItem.lokasi = formData.get('lokasi'); 
        newDataItem.jumlah_cctv = formData.get('jumlah_cctv');
        newDataItem.progres = formData.get('progres');
        newDataItem.status = formData.get('status');
        logDetail = `Klien: ${newDataItem.klien} - Lokasi: ${newDataItem.lokasi} (${newDataItem.jumlah_cctv} Kamera)`;
    } else if (currentTab === 'list_office') {
        newDataItem.nama_user = formData.get('nama_user');
        newDataItem.akun = formData.get('akun');
        newDataItem.password = formData.get('password');
        newDataItem.pemulihan = formData.get('pemulihan');
        newDataItem.tipe_akun = formData.get('tipe_akun') || 'Anggota'; 
        newDataItem.office = formData.get('office');
        newDataItem.name = formData.get('name');
        newDataItem.workspace_expired = formData.get('masa_aktif');
        newDataItem.status = formData.get('status');
        logDetail = `User: ${newDataItem.nama_user} - Akun Office: ${newDataItem.akun}`;
    }

    const targetRef = ref(db, currentTab);
    const newPostRef = push(targetRef);
    
    set(newPostRef, newDataItem)
        .then(() => {
            if (currentTab === 'penyewaan' && laptopKeysToUpdate.length > 0 && newDataItem.status !== 'Lunas') {
                laptopKeysToUpdate.forEach(laptopKey => {
                    const laptopStatusRef = ref(db, `list_laptop/${laptopKey}`);
                    update(laptopStatusRef, { status: "Disewa" });
                });
            }
            logActivity('Tambah', currentTab, `Menambahkan data baru pada modul ${currentTab}: ${logDetail}.`);
            showToast("Data berhasil disimpan secara real-time!");
            e.target.reset();

            const dateInput = document.querySelector('#form-fields input[name="tanggal"]');
            if (dateInput) {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                dateInput.value = `${yyyy}-${mm}-${dd}`;
            }
            selectedLaptopKeys = []; 
            if(currentTab === 'penyewaan') populateLaptopCheckboxes();
        })
        .catch((error) => {
            showToast("Gagal menyimpan data: " + error.message, "error");
        })
        // PERBAIKAN: Ditambahkan kembali blok .finally() agar tombol Simpan tidak stuck loading
        .finally(() => {
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
}

window.deleteRow = deleteRow;
function deleteRow(firebaseKey) {
    const perms = window.currentUser.permissions || {};
    if(!isPermitted(perms.delete_data)) {
        alert("Anda tidak memiliki hak akses untuk menghapus data.");
        return;
    }

    let confirmationMessage = "Apakah Anda yakin ingin menghapus data ini secara permanen?";
    
    if (currentTab === 'user_management') {
        confirmationMessage = "Hapus profil pengguna ini dari database?\n\nCatatan Penting: Untuk menghapus kredensial login akun sepenuhnya, Anda juga disarankan menghapusnya secara manual di Firebase Authentication Console.";
    }

    const currentDataList = globalDataCloud[currentTab] || [];
    const targetItem = currentDataList.find(item => item._firebaseKey === firebaseKey);
    if (!targetItem) return;

    if(confirm(confirmationMessage)) {
        if (currentTab === 'penyewaan') {
            const sewaItem = (globalDataCloud['penyewaan'] || []).find(item => item._firebaseKey === firebaseKey);
            if (sewaItem && sewaItem._linkedLaptopKeys && sewaItem.status !== 'Lunas') {
                sewaItem._linkedLaptopKeys.forEach(laptopKey => {
                    const laptopStatusRef = ref(db, `list_laptop/${laptopKey}`);
                    update(laptopStatusRef, { status: "Tersedia" });
                });
            }
        }
        
        let targetLogDesc = targetItem?.pelanggan || targetItem?.penyewa || targetItem?.klien || targetItem?.merk || targetItem?.nama_user || targetItem?.name || '-';
        
        const targetRowRef = ref(db, `${currentTab}/${firebaseKey}`);
        remove(targetRowRef)
            .then(() => {
                logActivity('Hapus', currentTab, `Menghapus baris data ID #${targetItem.id} (Detail: ${targetLogDesc}) pada modul ${currentTab}.`);
            });
    }
}

window.populateEditLaptopCheckboxes = populateEditLaptopCheckboxes;
function populateEditLaptopCheckboxes() {
    const container = document.getElementById('edit-checkbox-laptop-container');
    if(!container) return;

    const masterLaptop = globalDataCloud['list_laptop'] || [];
    const searchInput = document.getElementById('search-edit-laptop');
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
    
    const filteredLaptop = masterLaptop.filter(lap => {
        const brand = (lap.merk || '').toLowerCase();
        const type = (lap.tipe || '').toLowerCase();
        const sn = (lap.sn || '').toLowerCase();
        const spec = (lap.spek || '').toLowerCase();
        const kdtoko = (lap.kode_toko || '').toLowerCase();
        return brand.includes(searchQuery) || type.includes(searchQuery) || sn.includes(searchQuery) || spec.includes(searchQuery) || kdtoko.includes(searchQuery);
    });

    if(filteredLaptop.length === 0) {
        container.innerHTML = `<span class="text-xs text-gray-400 italic block py-2 text-center">Unit laptop tidak ditemukan.</span>`;
        return;
    }

    let html = '';
    filteredLaptop.forEach((lap) => {
        const isMine = window.editSelectedLaptopKeys.includes(lap._firebaseKey);
        const isDisabled = tap => lap.status !== 'Tersedia' && !isMine;
        const isChecked = isMine ? 'checked' : '';
        
        const snText = lap.sn ? lap.sn : 'Tanpa SN';
        const kdTokoText = lap.kode_toko ? lap.kode_toko : '-';
        const infoText = `${lap.merk} ${lap.tipe} [SN: ${snText}]`;
        
        html += `
            <label class="flex items-start space-x-3 p-1.5 hover:bg-slate-50 rounded-lg transition text-sm ${isDisabled ? 'text-gray-400 bg-gray-50' : 'cursor-pointer'}">
                <input type="checkbox" 
                       value="${infoText}" 
                       data-key="${lap._firebaseKey}" 
                       ${isDisabled ? 'disabled' : ''} 
                       ${isChecked}
                       onchange="window.syncEditCheckboxState(this)"
                       class="mt-1 rounded text-cyan-600 focus:ring-cyan-500 focus:outline-none border-gray-300 disabled:bg-gray-200">
                <div>
                    <span class="font-semibold text-slate-800">${lap.merk} ${lap.tipe}</span> 
                    <span class="text-[10px] font-mono bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-bold ml-1">${kdTokoText}</span>
                    <span class="block text-[10px] text-gray-500">SN: <span class="font-mono text-cyan-600 font-medium">${snText}</span></span>
                    ${isDisabled ? `<span class="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-semibold mt-0.5 inline-block">${lap.status}</span>` : ''}
                </div>
            </label>
        `;
    });
    container.innerHTML = html;
}

window.syncEditCheckboxState = function(cb) {
    const laptopKey = cb.getAttribute('data-key');
    if (!window.editSelectedLaptopKeys) window.editSelectedLaptopKeys = [];
    
    if (cb.checked) {
        if (!window.editSelectedLaptopKeys.includes(laptopKey)) {
            window.editSelectedLaptopKeys.push(laptopKey);
        }
    } else {
        window.editSelectedLaptopKeys = window.editSelectedLaptopKeys.filter(key => key !== laptopKey);
    }
};

function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.innerText = message;
    toast.className = "fixed bottom-5 right-5 px-5 py-3 rounded-lg text-white shadow-lg z-50 transition duration-300";

    if(type === "success") toast.classList.add("bg-emerald-600");
    if(type === "error") toast.classList.add("bg-rose-600");
    if(type === "warning") toast.classList.add("bg-yellow-500");

    toast.classList.remove("hidden");
    setTimeout(() => { toast.classList.add("hidden"); }, 3000);
}

// =================================================================
// OBSERVER REAL-TIME KONEKTIVITAS JARINGAN CLOUD (.info/connected) [2]
// =================================================================
function startNetworkMonitoring() {
    const connectedRef = ref(db, ".info/connected");
    onValue(connectedRef, (snap) => {
        const isConnected = snap.val() === true;
        const dot = document.getElementById('connection-dot');
        const text = document.getElementById('connection-text');
        
        if (dot && text) {
            if (isConnected) {
                dot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block";
                text.innerText = "Online";
                text.className = "text-emerald-700 font-bold uppercase tracking-wider text-[10px]";
            } else {
                dot.className = "w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse inline-block";
                text.innerText = "Offline";
                text.className = "text-rose-700 font-bold uppercase tracking-wider text-[10px]";
            }
        }
    });
}

// =================================================================
// OBSERVER AUTENTIKASI & SINKRONISASI REAL-TIME
// =================================================================
onAuthStateChanged(auth, async (user) => {
    const loginSection = document.getElementById('login-section');
    const mainAppSection = document.getElementById('main-app-section');

    startNetworkMonitoring();

    // Bersihkan listener profil lama jika ada saat terjadi perubahan auth state untuk mencegah bentrok data
    if (userProfileListener) {
        userProfileListener();
        userProfileListener = null;
    }

    if (user) {
        loginSection.classList.add('hidden');
        mainAppSection.classList.remove('hidden');
        
        // Melakukan penulisan email operator ke elemen teks di dropdown
        const emailSpan = document.getElementById('user-logged-email');
        if (emailSpan) {
            emailSpan.innerText = user.email;
        }

        window.currentUser.uid = user.uid;
        window.currentUser.email = user.email;
        
        const userRef = ref(db, `user_management/${user.uid}`);
        
        // SINKRONISASI REAKTIF: Gunakan onValue() agar otomatis memuat ulang menu seketika token sinkron
        userProfileListener = onValue(userRef, (snapshot) => {
            if (snapshot.exists()) {
                const profile = snapshot.val();
                window.currentUser.role = profile.role || 'teknisi';
                window.currentUser.branch = profile.branch || 'Head Office';
                
                if (profile.permissions) {
                    window.currentUser.permissions = profile.permissions;
                } 
            } else {
                // Jika akun di luar user_management, hanya superadmin@wanasatria.com yang mendapat hak akses absolut bypass
                if (user.email === 'superadmin@wanasatria.com') {
                    window.currentUser.role = 'admin';
                    window.currentUser.branch = 'Head Office';
                    window.currentUser.permissions = {
                        dashboard: true, services: true, penyewaan: true, cctv: true,
                        list_laptop: true, laptop_display: true, list_office: true, user_management: true,
                        activity_logs: true, backup_database: true,
                        export_excel: true, import_excel: true, edit_data: true, delete_data: true
                    };
                } else {
                    // Semua akun selain superadmin@wanasatria.com jika tidak terdaftar di database akan dikunci di hak terbatas
                    window.currentUser.role = 'teknisi';
                    window.currentUser.branch = 'Head Office';
                    window.currentUser.permissions = {
                        dashboard: false, services: false, penyewaan: false, cctv: false,
                        list_laptop: true, laptop_display: true, list_office: false, user_management: false,
                        activity_logs: false, backup_database: false,
                        export_excel: false, import_excel: false, edit_data: true, delete_data: false
                    };
                }
            }
            
            initApp();
        }, (error) => {
            console.error("Gagal sinkronisasi data peran real-time:", error);
            // Default pengaman jika diblokir sementara
            window.currentUser.role = 'teknisi';
            window.currentUser.branch = 'Head Office';
            window.currentUser.permissions = {
                dashboard: false, services: false, penyewaan: false, cctv: false,
                list_laptop: true, laptop_display: true, list_office: false, user_management: false,
                activity_logs: false, backup_database: false,
                export_excel: false, import_excel: false, edit_data: true, delete_data: false
            };
            initApp();
        });
    } else {
        loginSection.classList.remove('hidden');
        mainAppSection.classList.add('hidden');
        
        // RE-ENABLE & RESET TOMBOL LOGIN SAAT LOGOUT
        const btnText = document.getElementById('btn-login-text');
        if (btnText) {
            btnText.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Verifikasi & Masuk`;
            btnText.disabled = false;
        }

        // Kosongkan input email & sandi login agar siap untuk operator baru
        const loginEmail = document.getElementById('login-email');
        const loginPass = document.getElementById('login-password');
        if (loginEmail) loginEmail.value = '';
        if (loginPass) loginPass.value = '';

        // Hentikan semua listener real-time agar tidak bentrok dengan aturan keamanan akun baru
        activeFirebaseListeners.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') unsubscribe();
        });
        activeFirebaseListeners = [];

        // Kosongkan data lokal di memori
        globalDataCloud = {
            services: [],
            penyewaan: [],
            cctv: [],
            list_laptop: [],
            laptop_display: [],
            list_office: [],
            user_management: [],
            activity_logs: []
        };
        currentPage = 1;

        window.currentUser = {
            uid: null,
            email: null,
            role: null,
            branch: null,
            permissions: {}
        };
    }
});
function initApp() {
    // 1. PENCEGAHAN PENUMPUKAN LISTENER (LEAK): Bersihkan listener lama setiap kali diinisialisasi ulang
    activeFirebaseListeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') unsubscribe();
    });
    activeFirebaseListeners = [];

    const d = new Date();
    const opsiHari = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').innerText = d.toLocaleDateString('id-ID', opsiHari);

    const perms = window.currentUser.permissions || {};
    const savedTab = sessionStorage.getItem('activeTab');
    
    // Atur visibilitas menu berdasarkan izin
    const firstAllowedTab = applyRoleBasedAccess();

    let defaultTab = savedTab;
    if (!defaultTab || !isPermitted(perms[defaultTab])) {
        defaultTab = firstAllowedTab;
    }

    switchTab(defaultTab);

    syncHamburgerIcon();

    const allnodes = ['services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'list_office','user_management', 'activity_logs'];
    allnodes.forEach(node => {
        if (!db) return;
        
        // 2. PENCEGAHAN ERROR: Jangan daftarkan listener real-time jika user tidak punya izin akses menu ini
        if (node !== 'user_management' && !isPermitted(perms[node])) {
            return; 
        }
        if (node === 'user_management' && !isPermitted(perms.user_management)) {
            return;
        }

        // SINKRONISASI ATURAN FIREBASE: Lakukan query terbatas cabang jika user aktif bukan admin
        let nodeRef;
        const branch = window.currentUser.branch;
        const role = window.currentUser.role;
        const email = window.currentUser.email;

        const isAdmin = (email === 'superadmin@wanasatria.com' || role === 'admin');
        const hasBranchRestriction = (branch && branch !== 'Head Office');

        if (node !== 'user_management' && !isAdmin && hasBranchRestriction) {
            nodeRef = query(ref(db, node), orderByChild('cabang'), equalTo(branch));
        } else {
            nodeRef = ref(db, node);
        }

        const unsubscribe = onValue(nodeRef, (snapshot) => {
            const value = snapshot.val();
            globalDataCloud[node] = value ? Object.keys(value).map(key => ({ _firebaseKey: key, ...value[key] })) : [];
            
            updateDynamicDatalists();

            if (currentTab === node) {
                renderTable(); 
            }
            if (node === 'list_laptop' || node === 'laptop_display') {
                updateDashboardBranchFilters();
            }
            if (node === 'list_laptop' && currentTab === 'penyewaan') {
                populateLaptopCheckboxes();
            }
            if (!document.getElementById('dashboard-modal').classList.contains('hidden')) {
                calculateAndRenderStats();
            }
        }, (error) => {
            console.error(`Gagal menyinkronkan data real-time pada node [${node}]:`, error);
        });

        activeFirebaseListeners.push(unsubscribe);
    });
}