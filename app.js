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
let currentSubTab = ''; 
let selectedLaptopKeys = []; 
window.editSelectedLaptopKeys = [];
let globalDataCloud = {
    services: [],
    penyewaan: [],
    cctv: [],
    list_laptop: [],
    laptop_display: [],
    inventaris: [], 
    list_office: [],
    user_management: [],
    activity_logs: []
}; 

let activeFirebaseListeners = [];
let userProfileListener = null; 

let currentPage = 1;
const itemsPerPage = 20;

let chartWorkloadInstance = null;
let chartLaptopStockInstance = null;
let currentServerFilter = '';

let isTabLoadingState = false;

window.currentUser = {
    uid: null,
    email: null,
    name: null,
    role: null,
    branch: null,
    permissions: {}
};

const inventarisCommonUnits = ['Pcs', 'Unit', 'Meter', 'Box', 'Pack', 'Set', 'Lembar', 'Roll', 'Buah', 'Liter', 'Kg', 'Dus'];

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildInventarisCategoryOptions(items = [], selectedValue = '') {
    const defaults = ['Alat Kerja', 'Sparepart Laptop', 'Part CCTV', 'Lainnya'];
    const values = [...new Set([
        ...defaults,
        ...items
            .map(item => item?.kategori)
            .filter(Boolean)
            .map(value => String(value).trim())
            .filter(Boolean)
    ])];

    if (selectedValue && String(selectedValue).trim()) {
        values.push(String(selectedValue).trim());
    }

    return [...new Set(values.filter(Boolean))]
        .map(value => `<option value="${escapeHtml(value)}"></option>`)
        .join('');
}

function buildInventarisUnitOptions(selectedValue = '') {
    const normalizedSelected = String(selectedValue || '').trim();
    let html = '<option value="">Pilih satuan</option>';

    inventarisCommonUnits.forEach(unit => {
        html += `<option value="${escapeHtml(unit)}"${normalizedSelected === unit ? ' selected' : ''}>${escapeHtml(unit)}</option>`;
    });

    if (normalizedSelected && !inventarisCommonUnits.includes(normalizedSelected)) {
        html += `<option value="${escapeHtml(normalizedSelected)}" selected>${escapeHtml(normalizedSelected)}</option>`;
    }

    return html;
}

function getInventarisCategoryPrefix(category = '') {
    const normalized = String(category || '').trim();
    if (!normalized) return 'XXX';

    const parts = normalized.split('|');
    const rawValue = parts[0].trim();
    const explicitPrefix = parts[1] ? parts[1].trim().toUpperCase() : '';

    if (explicitPrefix) {
        return explicitPrefix.replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(3, 'X');
    }

    const cleaned = rawValue.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return cleaned.slice(0, 3).padEnd(3, 'X');
}

function generateInventarisSku(category = '', tanggalInput = '') {
    const prefix = getInventarisCategoryPrefix(category);
    const year = (() => {
        if (tanggalInput && tanggalInput.includes('-')) {
            const parts = tanggalInput.split('-');
            if (parts[0] && parts[0].length === 4) {
                return parts[0];
            }
        }
        return String(new Date().getFullYear());
    })();

    const currentItems = globalDataCloud.inventaris || [];
    const matchingCodes = currentItems
        .map(item => String(item?.kode_barang || '').trim())
        .filter(Boolean)
        .map(code => code.match(/^([A-Z0-9]{3})-WSK-(\d{4})-(\d{3})$/i))
        .filter(Boolean)
        .filter(match => match[1].toUpperCase() === prefix && match[2] === year)
        .map(match => Number(match[3]) || 0);

    const nextNumber = matchingCodes.length > 0 ? Math.max(...matchingCodes) + 1 : 1;
    return `${prefix}-WSK-${year}-${String(nextNumber).padStart(3, '0')}`;
}

function refreshInventarisFieldOptions() {
    if (currentTab !== 'inventaris') return;

    const categoryLists = ['list-kategori-inventaris', 'list-edit-kategori-inventaris'];
    categoryLists.forEach(listId => {
        const list = document.getElementById(listId);
        if (list) {
            list.innerHTML = buildInventarisCategoryOptions(globalDataCloud.inventaris || []);
        }
    });

    const formSatuanSelect = document.querySelector('#form-fields select[name="satuan"]');
    if (formSatuanSelect) {
        formSatuanSelect.innerHTML = buildInventarisUnitOptions(formSatuanSelect.value || '');
    }

    const editSatuanSelect = document.getElementById('edit-satuan');
    if (editSatuanSelect) {
        editSatuanSelect.innerHTML = buildInventarisUnitOptions(editSatuanSelect.value || '');
    }
}

window.togglePassword = togglePassword;
window.firebaseLogout = firebaseLogout;
window.registerAuthUser = registerAuthUser;

function isPermitted(val) {
    return val === true || val === 'true';
}

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

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const icon = document.getElementById('hamburger-icon');

    let isCollapsed = false;
    
    if (window.innerWidth < 768) {
        sidebar.classList.toggle('-translate-x-full');
        overlay.classList.toggle('hidden');
        isCollapsed = sidebar.classList.contains('-translate-x-full');
    } else {
        sidebar.classList.toggle('md:-ml-64');
        isCollapsed = sidebar.classList.contains('md:-ml-64');
        overlay.classList.add('hidden');
    }

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

window.toggleSidebar = toggleSidebar;
window.toggleMobileMenu = toggleSidebar;

window.toggleUserDropdown = function(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('user-dropdown-menu');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
};

window.toggleUtilityDropdown = function(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('utility-dropdown-menu');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
};

/* ==========================================================================
   FUNGSI POPOVER & FILTER DATA TERPADU (OPSI 2)
   ========================================================================== */

// 1. Membuka atau menutup panel popover filter
window.toggleFilterPanel = function(event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById('filter-popover-panel');
    if (panel) {
        panel.classList.toggle('hidden');
    }
};

// 2. Menghitung dan memperbarui lencana indikator filter aktif harian
window.updateFilterBadgeCount = function() {
    const branchEl = document.getElementById('branch-filter');
    const statusEl = document.getElementById('status-filter');
    const serverEl = document.getElementById('server-filter');
    const badge = document.getElementById('filter-active-count');
    if (!badge) return;

    let activeCount = 0;

    // Hitung filter cabang jika terlihat/aktif
    const branchContainer = document.getElementById('branch-filter-container');
    if (branchContainer && !branchContainer.classList.contains('hidden')) {
        if (branchEl && branchEl.value) activeCount++;
    }

    // Hitung filter status jika dipilih
    if (statusEl && statusEl.value) activeCount++;

    // Hitung filter server utama jika terlihat/aktif
    const serverContainer = document.getElementById('server-filter-container');
    if (serverContainer && !serverContainer.classList.contains('hidden')) {
        if (serverEl && serverEl.value) activeCount++;
    }

    // Perbarui lencana visual
    if (activeCount > 0) {
        badge.innerText = activeCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
};

// 3. Mengatur ulang (reset) semua pilihan filter kembali ke kondisi awal
window.resetAllFilters = function() {
    const branchEl = document.getElementById('branch-filter');
    const statusEl = document.getElementById('status-filter');
    const serverEl = document.getElementById('server-filter');

    if (branchEl) branchEl.value = '';
    if (statusEl) statusEl.value = '';
    if (serverEl) serverEl.value = '';
    
    currentServerFilter = ''; // Reset variabel global pencarian server

    window.updateFilterBadgeCount();
    resetPaginationAndRender();
};

window.addEventListener('click', function(e) {
    const userDropdown = document.getElementById('user-dropdown-menu');
    const userButton = document.getElementById('user-menu-button');
    if (userDropdown && !userDropdown.classList.contains('hidden')) {
        if (!userDropdown.contains(e.target) && (!userButton || !userButton.contains(e.target))) {
            userDropdown.classList.add('hidden');
        }
    }

    const utilityDropdown = document.getElementById('utility-dropdown-menu');
    const utilityButton = document.getElementById('utility-menu-button');
    if (utilityDropdown && !utilityDropdown.classList.contains('hidden')) {
        if (!utilityDropdown.contains(e.target) && (!utilityButton || !utilityButton.contains(e.target))) {
            utilityDropdown.classList.add('hidden');
        }
    }

    // Menutup popover filter secara halus saat klik di luar area panel saring
    const filterPanel = document.getElementById('filter-popover-panel');
    const filterBtn = document.getElementById('filter-trigger-btn');
    if (filterPanel && !filterPanel.classList.contains('hidden')) {
        if (!filterPanel.contains(e.target) && (!filterBtn || !filterBtn.contains(e.target))) {
            filterPanel.classList.add('hidden');
        }
    }
});

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

let searchTimeout = null;
window.resetPaginationAndRenderWithDebounce = function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        resetPaginationAndRender();
    }, 250); 
};

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
    const modal = document.getElementById('dashboard-modal');
    if (modal) modal.classList.remove('hidden');
    calculateAndRenderStats();
};

window.closeDashboardModal = function() {
    const modal = document.getElementById('dashboard-modal');
    if (modal) modal.classList.add('hidden');
};

window.resetDisplayFilters = function() {
    const filterBranch = document.getElementById('filter-display-cabang');
    const filterStart = document.getElementById('filter-display-start');
    const filterEnd = document.getElementById('filter-display-end');
    if (filterBranch) filterBranch.value = '';
    if (filterStart) filterStart.value = '';
    if (filterEnd) filterEnd.value = '';
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

function applyRoleBasedAccess() {
    const perms = window.currentUser.permissions || {};
    const branch = window.currentUser.branch || 'Head Office';
    const email = window.currentUser.email || '';
    
    const btnServices = document.getElementById('btn-services');
    const btnPenyewaan = document.getElementById('btn-penyewaan');
    const btnCctv = document.getElementById('btn-cctv');
    const btnListLaptop = document.getElementById('btn-list_laptop');
    const btnLaptopDisplay = document.getElementById('btn-laptop_display');
    const btnInventaris = document.getElementById('btn-inventaris'); 
    const btnListOffice = document.getElementById('btn-list_office');
    const btnUserManagement = document.getElementById('btn-user_management');
    const btnActivityLogs = document.getElementById('btn-activity_logs');
    
    window.userBranch = ''; 
    if (branch && branch !== 'Head Office' && email !== 'superadmin@wanasatria.com') {
        window.userBranch = branch;
    }

    if (btnServices) {
        if (isPermitted(perms.services)) btnServices.classList.remove('hidden');
        else btnServices.classList.add('hidden');
    }
    if (btnPenyewaan) {
        if (isPermitted(perms.penyewaan)) btnPenyewaan.classList.remove('hidden');
        else btnPenyewaan.classList.add('hidden');
    }
    if (btnCctv) {
        if (isPermitted(perms.cctv)) btnCctv.classList.remove('hidden');
        else btnCctv.classList.add('hidden');
    }
    if (btnListLaptop) {
        if (isPermitted(perms.list_laptop)) btnListLaptop.classList.remove('hidden');
        else btnListLaptop.classList.add('hidden');
    }
    if (btnLaptopDisplay) {
        if (isPermitted(perms.laptop_display)) btnLaptopDisplay.classList.remove('hidden');
        else btnLaptopDisplay.classList.add('hidden');
    }
    if (btnInventaris) {
        if (isPermitted(perms.inventaris)) btnInventaris.classList.remove('hidden');
        else btnInventaris.classList.add('hidden');
    }
    if (btnListOffice) {
        if (isPermitted(perms.list_office)) btnListOffice.classList.remove('hidden');
        else btnListOffice.classList.add('hidden');
    }
    if (btnUserManagement) {
        if (isPermitted(perms.user_management)) btnUserManagement.classList.remove('hidden');
        else btnUserManagement.classList.add('hidden');
    }
    if (btnActivityLogs) {
        if (isPermitted(perms.activity_logs)) btnActivityLogs.classList.remove('hidden');
        else btnActivityLogs.classList.add('hidden');
    }

    const canBackup = isPermitted(perms.backup_database);
    const canDelete = isPermitted(perms.delete_data);
    const canExport = isPermitted(perms.export_excel);
    const canImport = isPermitted(perms.import_excel);
    const canDashboard = isPermitted(perms.dashboard);

    const dropdownDashboard = document.getElementById('dropdown-dashboard-container');
    const dropdownBackup = document.getElementById('dropdown-backup-container');
    const dropdownPurge = document.getElementById('dropdown-purge-container');
    const dropdownClear = document.getElementById('dropdown-clear-container');
    const dropdownExport = document.getElementById('dropdown-export-container');
    const dropdownImport = document.getElementById('dropdown-import-container');
    const utilityDropdownContainer = document.getElementById('utility-dropdown-container');

    if (dropdownDashboard) dropdownDashboard.style.display = canDashboard ? '' : 'none';
    if (dropdownBackup) dropdownBackup.style.display = canBackup ? '' : 'none';
    if (dropdownPurge) dropdownPurge.style.display = (canDelete && currentTab === 'activity_logs') ? '' : 'none';
    if (dropdownClear) dropdownClear.style.display = canDelete ? '' : 'none';
    if (dropdownExport) dropdownExport.style.display = canExport ? '' : 'none';
    if (dropdownImport) dropdownImport.style.display = canImport ? '' : 'none';

    const dropdownOpname = document.getElementById('dropdown-opname-container');
    if (dropdownOpname) {
        const isOpnameTab = (currentTab === 'list_laptop' || currentTab === 'laptop_display' || currentTab === 'inventaris');
        dropdownOpname.style.display = (isOpnameTab && perms.edit_data) ? '' : 'none';
    }

    if (utilityDropdownContainer) {
        if (canBackup || canDelete || canExport || canImport || canDashboard) {
            utilityDropdownContainer.classList.remove('hidden');
        } else {
            utilityDropdownContainer.classList.add('hidden');
        }
    }

    const tabsOrder = ['services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'inventaris', 'list_office', 'user_management', 'activity_logs'];
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
    const dataInventaris = globalDataCloud['inventaris'] || [];
    const dataOffice = globalDataCloud['list_office'] || [];

    const filterDisplayCabang = document.getElementById('filter-display-cabang');
    const filterGudangCabang = document.getElementById('filter-gudang-cabang');

    if (window.userBranch) {
        if (filterDisplayCabang) filterDisplayCabang.style.display = 'none';
        if (filterGudangCabang) filterGudangCabang.style.display = 'none';
    } else {
        if (filterDisplayCabang) filterDisplayCabang.style.display = '';
        if (filterGudangCabang) filterGudangCabang.style.display = '';
    }

    const displayBranchVal = window.userBranch || (filterDisplayCabang ? filterDisplayCabang.value : '');
    const gudangBranchVal = window.userBranch || (filterGudangCabang ? filterGudangCabang.value : '');
    
    const startValEl = document.getElementById('filter-display-start');
    const endValEl = document.getElementById('filter-display-end');
    const startVal = startValEl ? startValEl.value : '';
    const endVal = endValEl ? endValEl.value : '';

    let filteredServices = dataServices;
    let filteredPenyewaan = dataPenyewaan;
    let filteredCctv = dataCctv;

    const generalBranchVal = window.userBranch || displayBranchVal || gudangBranchVal;
    if (generalBranchVal) {
        filteredServices = filteredServices.filter(item => item.cabang === generalBranchVal);
        filteredPenyewaan = filteredPenyewaan.filter(item => item.cabang === generalBranchVal);
        filteredCctv = filteredCctv.filter(item => item.cabang === generalBranchVal);
    }

    let filteredLaptop = dataLaptop;
    if (gudangBranchVal) {
        filteredLaptop = filteredLaptop.filter(item => item.cabang === gudangBranchVal);
    }

    let filteredDisplay = dataDisplayRaw;
    if (displayBranchVal) {
        filteredDisplay = filteredDisplay.filter(item => item.cabang === displayBranchVal);
    }

    let pendingServices = filteredServices.filter(s => s.status === 'Antrean' || s.status === 'Proses').length;
    
    let totalOmsetSewa = 0;
    filteredPenyewaan.forEach(p => { totalOmsetSewa += (Number(p.total_biaya) || 0); });
    
    let activeCctv = filteredCctv.filter(c => c.status === 'Survei' || c.status === 'Pengerjaan').length;
    
    let totalLaptopAset = filteredLaptop.length;
    let lapReady = filteredLaptop.filter(l => l.status === 'Tersedia').length;
    let lapSewa = filteredLaptop.filter(l => l.status === 'Disewa').length;
    let lapRusak = filteredLaptop.filter(l => l.status === 'Maintenance').length;
    let lapTerjual = filteredLaptop.filter(l => l.status === 'Terjual').length;
    let lapStaf = filteredLaptop.filter(l => l.status === 'Staf').length; 

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

    const setInnerText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    setInnerText('stat-services-pending', pendingServices);
    setInnerText('stat-rent-omset', totalOmsetSewa.toLocaleString('id-ID'));
    setInnerText('stat-cctv-active', activeCctv);
    setInnerText('stat-laptop-total', totalLaptopAset);
    setInnerText('stat-laptop-ready', lapReady);
    setInnerText('stat-laptop-rented', lapSewa);
    setInnerText('stat-laptop-broken', lapRusak);
    setInnerText('stat-laptop-sold', lapTerjual);
    setInnerText('stat-laptop-staf', lapStaf);
    setInnerText('stat-display-total', totalDisplay);
    setInnerText('stat-display-ready', dispReady);
    setInnerText('stat-display-sold', dispSold);
    setInnerText('stat-display-off', dispOff);

    const totalInventarisVariants = dataInventaris.length;
    let totalInventarisQty = 0;
    let lowStockCount = 0;
    let baikCount = 0;
    let rusakCount = 0;

    dataInventaris.forEach(item => {
        const stokVal = Number(item.stok) || 0;
        totalInventarisQty += stokVal;
        if (stokVal <= 3) {
            lowStockCount++;
        }
        if (item.kondisi === 'Baik') {
            baikCount++;
        } else if (item.kondisi === 'Rusak') {
            rusakCount++;
        }
    });

    setInnerText('stat-inventaris-variants', totalInventarisVariants);
    setInnerText('stat-inventaris-total-qty', totalInventarisQty);
    setInnerText('stat-inventaris-alert-qty', lowStockCount);
    setInnerText('stat-inventaris-condition-summary', `${baikCount} Baik / ${rusakCount} Rusak`);
    
    // =================================================================
        // PROSES PENGELOMPOKAN INVENTARIS SUKU CADANG (BAIK VS RUSAK)
        // =================================================================
        let inventarisGroupBaik = {};
        let inventarisGroupRusak = {};
        let totalInvBaik = 0;
        let totalInvRusak = 0;

        dataInventaris.forEach(item => {
            let namaText = (item.nama_barang || '').trim();
            if (!namaText) namaText = "Barang Tanpa Nama";
            
            let stokVal = Number(item.stok) || 0;
            let kondisi = item.kondisi || 'Baik';

            if (kondisi === 'Baik') {
                inventarisGroupBaik[namaText] = (inventarisGroupBaik[namaText] || 0) + stokVal;
                totalInvBaik += stokVal;
            } else {
                inventarisGroupRusak[namaText] = (inventarisGroupRusak[namaText] || 0) + stokVal;
                totalInvRusak += stokVal;
            }
        });

        const inventarisContainer = document.getElementById('dashboard-inventaris-models-container');
        if (inventarisContainer) {
            inventarisContainer.innerHTML = '';
            if (dataInventaris.length === 0) {
                inventarisContainer.innerHTML = `<p class="text-center text-xs text-gray-400 py-6 italic">Tidak ada item inventaris kerja</p>`;
            } else {
                let finalHtml = '';
                finalHtml += renderGroupCard('Baik & Layak Kerja', inventarisGroupBaik, totalInvBaik, '<i class="fa-solid fa-square-check text-emerald-500"></i>', 'bg-emerald-100 text-emerald-800', 'bg-emerald-50/70', 'border-emerald-200');
                finalHtml += renderGroupCard('Rusak & Afkir', inventarisGroupRusak, totalInvRusak, '<i class="fa-solid fa-triangle-exclamation text-rose-500"></i>', 'bg-rose-100 text-rose-800', 'bg-rose-50/70', 'border-rose-200');
                inventarisContainer.innerHTML = finalHtml;
            }
        }

    const criticalBody = document.getElementById('critical-stock-table-body');
    if (criticalBody) {
        const lowStockItems = dataInventaris.filter(item => (Number(item.stok) || 0) <= 3 && item.kondisi === 'Baik');
        if (lowStockItems.length === 0) {
            criticalBody.innerHTML = `<tr><td colspan="4" class="py-3 text-center text-slate-400 italic">Semua stok inventaris dalam kondisi aman harian.</td></tr>`;
        } else {
            criticalBody.innerHTML = lowStockItems.map(item => `
                <tr class="hover:bg-rose-50/40 transition">
                    <td class="py-2 px-2 font-semibold text-slate-800">${escapeHtml(item.nama_barang)}</td>
                    <td class="py-2 px-2 text-slate-500">${escapeHtml(item.kategori)}</td>
                    <td class="py-2 px-2 text-center font-bold text-rose-600">${item.stok} ${escapeHtml(item.satuan)}</td>
                    <td class="py-2 px-2 font-mono font-medium">${escapeHtml(item.lokasi_rak || 'Belum Diatur')}</td>
                </tr>
            `).join('');
        }
    }

    const servers = dataOffice.filter(i => (i.tipe_akun || '').toString().toLowerCase() === 'utama');
    const members = dataOffice.filter(i => (i.tipe_akun || '').toString().toLowerCase() === 'anggota');

    const totalServersCount = servers.length;
    const totalMembersCount = members.length;

    let filledSlots = 0;
    let fullServersCount = 0;

    servers.forEach(srv => {
        const srvEmail = srv.akun || '';
        const linkedMembers = dataOffice.filter(it => (it.server_utama || '') === srvEmail && (it.tipe_akun || '').toString().toLowerCase() === 'anggota').length;
        filledSlots += linkedMembers;
        if (linkedMembers >= 5) {
            fullServersCount++;
        }
    });

    const freeSlots = Math.max(0, (totalServersCount * 5) - filledSlots);

    setInnerText('stat-office-servers', totalServersCount);
    setInnerText('stat-office-members', totalMembersCount);
    setInnerText('stat-office-filled-slots', `${filledSlots} / ${totalServersCount * 5}`);
    setInnerText('stat-office-free-slots', freeSlots);
    setInnerText('stat-office-full-servers', fullServersCount);

    const officeGrid = document.getElementById('office-server-grid');
    if (officeGrid) {
        officeGrid.innerHTML = '';
        if (servers.length === 0) {
            officeGrid.innerHTML = `<p class="col-span-full text-center text-xs text-slate-400 py-4 italic">Belum ada Server Utama terdaftar di database.</p>`;
        } else {
            let gridHtml = '';
            servers.forEach(server => {
                const hostEmail = server.akun || '';
                const linkedMembers = dataOffice.filter(it => (it.server_utama || '') === hostEmail && (it.tipe_akun || '').toString().toLowerCase() === 'anggota');
                
                gridHtml += `
                    <div class="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3 transition duration-150 hover:border-purple-300">
                        <div class="flex items-center justify-between border-b pb-2">
                            <span class="text-xs font-extrabold text-purple-700 truncate block max-w-[180px]" title="${escapeHtml(hostEmail)}">
                                <i class="fa-solid fa-server mr-1"></i> ${escapeHtml(hostEmail)}
                            </span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800">
                                ${linkedMembers.length}/5 Slot Terisi
                            </span>
                        </div>
                        <div class="space-y-1.5">
                `;

                for (let i = 0; i < 5; i++) {
                    if (linkedMembers[i]) {
                        const m = linkedMembers[i];
                        gridHtml += `
                            <div class="flex items-center justify-between text-xs py-1 border-b border-slate-50">
                                <span class="font-semibold text-slate-700 truncate max-w-[120px]">▸ ${escapeHtml(m.nama_user || 'User')}</span>
                                <span class="text-[10px] text-slate-500 truncate max-w-[120px] font-mono">${escapeHtml(m.akun)}</span>
                            </div>
                        `;
                    } else {
                        gridHtml += `
                            <div class="border border-dashed border-emerald-300 bg-emerald-50/20 rounded-lg p-1.5 text-center text-[10px] font-bold text-emerald-600 flex items-center justify-center gap-1">
                                <span>➕ Slot Tersedia</span>
                            </div>
                        `;
                    }
                }

                gridHtml += `
                        </div>
                    </div>
                `;
            });
            officeGrid.innerHTML = gridHtml;
        }
    }

    let warehouseReady = {};
    let warehouseSewa = {};
    let warehouseMaintenance = {};
    let warehouseStaf = {};
    let warehouseTerjual = {};

    let totalWhReady = 0, totalWhSewa = 0, totalWhMaintenance = 0, totalWhStaf = 0, totalWhTerjual = 0;

    filteredLaptop.forEach(lap => {
        let merkText = (lap.merk || '').trim();
        let tipeText = (lap.tipe || '').trim();
        let fullModelName = `${merkText} ${tipeText}`.trim();
        if(!fullModelName || fullModelName === "- -") fullModelName = "Model Tidak Diketahui";
        
        let statusWh = lap.status || 'Tersedia';

        if (statusWh === 'Tersedia') {
            warehouseReady[fullModelName] = (warehouseReady[fullModelName] || 0) + 1;
            totalWhReady++;
        } else if (statusWh === 'Disewa') {
            warehouseSewa[fullModelName] = (warehouseSewa[fullModelName] || 0) + 1;
            totalWhSewa++;
        } else if (statusWh === 'Maintenance') {
            warehouseMaintenance[fullModelName] = (warehouseMaintenance[fullModelName] || 0) + 1;
            totalWhMaintenance++;
        } else if (statusWh === 'Staf') {
            warehouseStaf[fullModelName] = (warehouseStaf[fullModelName] || 0) + 1;
            totalWhStaf++;
        } else if (statusWh === 'Terjual') {
            warehouseTerjual[fullModelName] = (warehouseTerjual[fullModelName] || 0) + 1;
            totalWhTerjual++;
        }
    });

    function renderGroupCard(title, dataObj, totalGroup, iconStr, badgeClass, bgClass, borderClass) {
        let keys = Object.keys(dataObj).sort();
        if(keys.length === 0) return '';
        
        let cardHtml = `
            <div class="bg-white rounded-xl border ${borderClass} shadow-sm overflow-hidden transition duration-150">
                <div class="${bgClass} px-3 py-2 flex items-center justify-between border-b ${borderClass}">
                    <span class="font-bold text-xs flex items-center gap-1.5 uppercase tracking-wider text-slate-800">
                        ${iconStr}${title}
                    </span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${badgeClass}">
                        Sub-Total: ${totalGroup}
                    </span>
                </div>
                <div class="p-2.5 divide-y divide-slate-100 text-xs text-slate-700">
        `;
        keys.forEach(model => {
            cardHtml += `
                <div class="py-1.5 flex justify-start items-center pl-2 hover:bg-slate-50 transition rounded-md gap-4">
                    <span class="font-medium text-slate-700">▸ ${model}</span>
                    <span class="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded ml-auto">${dataObj[model]}</span>
                </div>
            `;
        });
        cardHtml += `</div></div>`;
        return cardHtml;
    }

    const laptopContainer = document.getElementById('dashboard-laptop-models-container');
    if (laptopContainer) {
        laptopContainer.innerHTML = '';
        if (filteredLaptop.length === 0) {
            laptopContainer.innerHTML = `<p class="text-center text-xs text-gray-400 py-6 italic">Tidak ada unit laptop pada cabang ini</p>`;
        } else {
            let finalHtml = '';
            finalHtml += renderGroupCard('Tersedia di Gudang', warehouseReady, totalWhReady, '<i class="fa-solid fa-circle-check text-emerald-500"></i>', 'bg-emerald-100 text-emerald-800', 'bg-emerald-50/70', 'border-emerald-200');
            finalHtml += renderGroupCard('Sedang Disewa', warehouseSewa, totalWhSewa, '<i class="fa-solid fa-boxes-packing text-indigo-500"></i>', 'bg-indigo-100 text-indigo-800', 'bg-indigo-50/70', 'border-indigo-200');
            finalHtml += renderGroupCard('Maintenance / Perbaikan', warehouseMaintenance, totalWhMaintenance, '<i class="fa-solid fa-screwdriver-wrench text-rose-500"></i>', 'bg-rose-100 text-rose-800', 'bg-rose-50/70', 'border-rose-200');
            finalHtml += renderGroupCard('Digunakan Staf', warehouseStaf, totalWhStaf, '<i class="fa-solid fa-user-tie text-blue-500"></i>', 'bg-blue-100 text-blue-800', 'bg-blue-50/70', 'border-blue-200');
            finalHtml += renderGroupCard('Sudah Terjual', warehouseTerjual, totalWhTerjual, '<i class="fa-solid fa-hand-holding-dollar text-slate-500"></i>', 'bg-slate-200 text-slate-800', 'bg-slate-100', 'border-slate-200');
            laptopContainer.innerHTML = finalHtml;
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

    const displayContainer = document.getElementById('dashboard-display-models-container');
    if (displayContainer) {
        displayContainer.innerHTML = '';
        if (filteredDisplay.length === 0) {
            displayContainer.innerHTML = `<p class="text-center text-xs text-gray-400 py-6 italic">Tidak ada unit display pada kriteria filter ini</p>`;
        } else {
            let finalHtml = '';
            finalHtml += renderGroupCard('Ready di Etalase', displayCountsReady, totalReady, '<i class="fa-solid fa-store text-cyan-500"></i>', 'bg-cyan-100 text-cyan-800', 'bg-cyan-50/70', 'border-cyan-200');
            finalHtml += renderGroupCard('Sudah Terjual', displayCountsTerjual, totalTerjual, '<i class="fa-solid fa-money-bill-wave text-emerald-500"></i>', 'bg-emerald-100 text-emerald-800', 'bg-emerald-50/70', 'border-emerald-200');
            finalHtml += renderGroupCard('Ditarik ke Gudang', displayCountsGudang, totalGudang, '<i class="fa-solid fa-arrow-rotate-left text-amber-500"></i>', 'bg-amber-100 text-amber-800', 'bg-amber-50/70', 'border-amber-200');
            displayContainer.innerHTML = finalHtml;
        }
    }

    let sAntrean = filteredServices.filter(s => s.status === 'Antrean').length;
    let sProses = filteredServices.filter(s => s.status === 'Proses').length;
    let sSelesai = filteredServices.filter(s => s.status === 'Selesai').length;

    let cSurvei = filteredCctv.filter(c => c.status === 'Survei').length;
    let cKerja = filteredCctv.filter(c => c.status === 'Pengerjaan').length;
    let cSelesai = filteredCctv.filter(c => c.status === 'Selesai' || c.status === 'Selesai / Serah Terima').length;

    const workloadCanvas = document.getElementById('chartWorkload');
    if (workloadCanvas) {
        const ctxWorkload = workloadCanvas.getContext('2d');
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
    }

    const laptopStockCanvas = document.getElementById('chartLaptopStock');
    if (laptopStockCanvas) {
        const ctxLaptop = laptopStockCanvas.getContext('2d');
        if (chartLaptopStockInstance !== null) chartLaptopStockInstance.destroy();

        chartLaptopStockInstance = new Chart(ctxLaptop, {
            type: 'doughnut',
            data: {
                labels: [
                    'Tersedia ('+lapReady+')', 
                    'Disewa ('+lapSewa+')', 
                    'Maintenance ('+lapRusak+')', 
                    'Staf ('+lapStaf+')', 
                    'Terjual ('+lapTerjual+')'
                ],
                datasets: [{
                    data: [lapReady, lapSewa, lapRusak, lapStaf, lapTerjual],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#64748b'],
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
}

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
        if (!container) return;
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
        if (!form) return;
        
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
        const tabsOrder = ['dashboard','services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'inventaris', 'list_office', 'user_management', 'activity_logs'];
        const firstAllowed = tabsOrder.find(t => isPermitted(perms[t]));

        if (!firstAllowed) {
            return;
        }
        tabName = firstAllowed;
    }

    if (window.innerWidth < 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
            toggleSidebar(); 
        }
    }

    currentTab = tabName;
    currentSubTab = ''; 
    
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
        inventaris: "Manajemen Inventaris Suku Cadang, Alat & Part",
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
        inventaris: "Kosongkan List Inventaris",
        list_office: "Kosongkan Data Office",
        user_management: "Kosongkan Data Users",
        activity_logs: "Kosongkan Log Aktivitas"
    };
    
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.innerText = titles[tabName];

    const formFields = document.getElementById('form-fields');
    if (formFields) formFields.innerHTML = fieldsTemplate[tabName];
    refreshInventarisFieldOptions();

    if (tabName === 'list_office') {
        const tipeSelect = document.querySelector('#form-fields select[name="tipe_akun"]');
        const serverContainer = document.getElementById('server-link-container');
        const serverSelect = document.getElementById('server-utama-select');
        const officeSelect = document.getElementById('select-office');

        function handleTipeAkunChange() {
            const val = tipeSelect ? tipeSelect.value : '';
            if (val === 'Anggota') {
                if (serverContainer) serverContainer.classList.remove('hidden');
                refreshServerOptions();
            } else {
                if (serverContainer) serverContainer.classList.add('hidden');
                if (serverSelect) serverSelect.value = '';
                if (officeSelect) officeSelect.disabled = false;
            }
        }

        if (tipeSelect) {
            tipeSelect.addEventListener('change', () => {
                handleTipeAkunChange();
            });
        }

        if (serverSelect) {
            serverSelect.addEventListener('change', () => {
                const v = serverSelect.value || '';
                if (v) {
                    if (officeSelect) {
                        officeSelect.value = '365 Family';
                        officeSelect.disabled = true;
                    }
                } else {
                    if (officeSelect) officeSelect.disabled = false;
                }
            });
        }

        setTimeout(() => { if (tipeSelect) handleTipeAkunChange(); }, 50);
        setTimeout(() => { refreshServerFilterOptions(); }, 60);
    }

    const searchBar = document.getElementById('search-bar');
    if (searchBar) searchBar.value = ''; 

    const formCard = document.getElementById('form-container-card');
    if (formCard) {
        const structuralPosition = String(window.currentUser.role || '').toLowerCase();
        
        // Pemisahan "Posisi" vs "Hak Akses": Sembunyikan form input harian dari Teknisi
        if (structuralPosition === 'teknisi' || tabName === 'activity_logs') {
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

    // 1. Tampilkan/Sembunyikan filter cabang di dalam popover
    const branchContainer = document.getElementById('branch-filter-container');
    if (branchContainer) {
        if ((tabName === 'list_laptop' || tabName === 'laptop_display' || tabName === 'inventaris') && !window.userBranch) {
            branchContainer.classList.remove('hidden');
        } else {
            branchContainer.classList.add('hidden');
        }
    }

    // 2. Tampilkan/Sembunyikan filter server utama di dalam popover
    const serverFilterContainer = document.getElementById('server-filter-container');
    if (tabName === 'list_office') {
        if (serverFilterContainer) {
            serverFilterContainer.classList.remove('hidden');
            refreshServerFilterOptions();
        } else {
            setTimeout(() => { try { refreshServerFilterOptions(); } catch(e){} }, 60);
        }
    } else {
        if (serverFilterContainer) {
            serverFilterContainer.classList.add('hidden');
            currentServerFilter = '';
        }
    }

    // 3. Perbarui angka lencana filter aktif setiap kali berpindah tab
    setTimeout(() => { if (typeof window.updateFilterBadgeCount === 'function') window.updateFilterBadgeCount(); }, 80);

    renderSubTabs();

    const txtClearBtn = document.getElementById('clear-btn-text');
    if (txtClearBtn) {
        txtClearBtn.innerText = btnClearLabels[tabName];
    }

    const clearLabelDropdown = document.getElementById('clear-btn-text-dropdown');
    if (clearLabelDropdown) {
        const listNames = {
            services: "Data Services",
            penyewaan: "Data Penyewaan",
            cctv: "Data CCTV",
            list_laptop: "Master Laptop",
            laptop_display: "Laptop Display",
            inventaris: "List Inventaris",
            list_office: "Data Office",
            user_management: "Data Users",
            activity_logs: "Log Aktivitas"
        };
        clearLabelDropdown.innerText = `Kosongkan ${listNames[tabName] || "List Ini"}`;
    }
    
    applyRoleBasedAccess();
    
    ['services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'inventaris', 'list_office','user_management', 'activity_logs'].forEach(tab => {
        const btn = document.getElementById(`btn-${tab}`);
        if(btn) {
            if(tab === tabName) {
                btn.classList.add('bg-slate-800', 'text-cyan-400', 'font-medium');
                btn.classList.remove('text-slate-400', 'hover:bg-slate-800', 'hover:text-white');
            } else {
                btn.classList.remove('bg-slate-800', 'text-cyan-400', 'font-medium');
                btn.classList.add('text-slate-400', 'hover:bg-slate-800', 'hover:text-white');
            }
        }
    });

    window.renderTableHeader = renderTableHeader;
    renderTableHeader();
    
    isTabLoadingState = true;
    showTableLoading("Mengambil & Menyinkronkan Data Cloud...");
    
    setTimeout(() => {
        isTabLoadingState = false;
        if (isPermitted(perms[currentTab])) {
            renderTable();
        }
    }, 350);
}

function renderSubTabs() {
    const container = document.getElementById('subtab-filters-container');
    if (container) {
        container.classList.add('hidden');
    }
}

window.setSubTabFilter = function(val) {
    currentSubTab = val;
    currentPage = 1;
    renderSubTabs();
    renderTable();
};

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
            const excelRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            
            if (excelRows.length === 0) {
                showToast("File spreadsheet kosong atau format salah","error");
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
                    workspace_expired: ['workspace_expired', 'workspace_expired', 'workspace_expired', 'workspace_expired', 'workspace_expired', 'workspace_expired', 'workspace_expired', 'workspace_expired'],
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
            const expected = requiredImportFields[currentTab] || [];
            const matched = expected.filter(field => {
                const aliases = (importFieldAliases[currentTab] && importFieldAliases[currentTab][field]) || [field];
                return aliases.some(alias => headers.includes(normalizeSpreadsheetKey(alias)));
            });
            if (expected.length > 0 && matched.length < Math.min(2, expected.length)) {
                const expectedHeaders = expected.map(field => {
                    const aliases = (importFieldAliases[currentTab] && importFieldAliases[currentTab][field]) || [field];
                    return aliases[0];
                });
                showToast(
                    `Format spreadsheet tidak cocok untuk tab [${labelsMapping[currentTab] || currentTab}]. ` +
                    `Gunakan file yang diekspor dari tab yang sama. Contoh header yang dibutuhkan: ${expectedHeaders.join(', ')}.`,
                    'error'
                );
                return;
            }

            const tabNameStr = labelsMapping[currentTab] || currentTab;
            if (!confirm(`Ditemukan ${excelRows.length} baris data. Impor langsung ke cloud database pada list [${tabNameStr}]?`)) return;

            const targetNodeRef = ref(db, currentTab);
            const d = new Date();
            const tglInput = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            
            const currentDataTab = globalDataCloud[currentTab] || [];
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

                } else if (currentTab === 'inventaris') { 
                    newItemData.nama_barang = getVal(['nama_barang', 'nama', 'barang'], '-');
                    newItemData.kode_barang = getVal(['kode_barang', 'kode', 'sku', 'part_number'], '-');
                    const kategoriValue = getVal(['kategori', 'jenis', 'category'], 'Sparepart Laptop');
                    newItemData.kategori = kategoriValue;
                    newItemData.stok = Number(getVal(['stok', 'jumlah', 'qty'], 0)) || 0;
                    newItemData.satuan = getVal(['satuan', 'unit'], 'Pcs');
                    newItemData.lokasi_rak = getVal(['lokasi_rak', 'rak', 'posisi'], '');
                    newItemData.kondisi = getVal(['kondisi', 'condition'], 'Baik');
                    newItemData.catatan = getVal(['catatan', 'keterangan', 'notes'], '');

                } else if (currentTab === 'services') {
                    newItemData.pelanggan = getVal(['pelanggan', 'nama_pelanggan', 'nama'], '-');
                    newItemData.no_wa = getVal(['no_wa', 'whatsapp', 'telp'], '-');
                    newItemData.perangkat = getVal(['perangkat', 'device', 'unit'], '-');
                    newItemData.kerusakan = getVal(['kerusakan', 'gejala', 'keluhan'], '-');
                    newItemData.biaya = getVal(['biaya', 'estimasi_biaya', 'harga'], 0);
                    newItemData.status = getVal(['status'], 'Antrean');
                    newItemData.teknisi = getVal(['teknisi', 'nama_teknisi'], 'Belum Ditentukan');
                    newItemData.tindakan_teknisi = '';

                } else if (currentTab === 'penyewaan') {
                    newItemData.penyewa = getVal(['penyewa', 'nama_penyewa', 'nama'], '-');
                    newItemData.no_wa = getVal(['no_wa', 'whatsapp', 'telp'], '-');
                    newItemData.tgl_mulai = getVal(['tgl_mulai', 'mulai_sewa', 'tgl_sewa'], tglInput);
                    newItemData.tgl_selesai = getVal(['tgl_selesai', 'selesai_sewa', 'tgl_kembali'], tglInput);
                    newItemData.total_biaya = getVal(['total_biaya', 'biaya_sewa', 'harga'], 0);
                    newItemData.status = getVal(['status', 'status_pembayaran'], 'Belum Bayar');
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
                    newItemData.workspace_expired = getVal(['workspace_expired', 'workspace_expired', 'workspace_expired', 'workspace_expired', 'workspace_expired', 'workspace_expired', 'workspace_expired', 'workspace_expired'], '-');
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
        inventaris: "Data Inventaris Alat & Part",
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
            const currentItems = globalDataCloud[currentTab] || [];
            const removePromises = currentItems
                .filter(item => item && item._firebaseKey)
                .map(item => remove(ref(db, `${currentTab}/${item._firebaseKey}`)));

            Promise.allSettled(removePromises)
                .then(results => {
                    const failed = results.filter(result => result.status === 'rejected');
                    if (failed.length > 0) {
                        showToast(`Gagal menghapus ${failed.length} dari ${results.length} item.`, 'warning');
                    } else {
                        logActivity('Kosongkan', currentTab, `Mengosongkan seluruh baris data pada modul ${targetName}.`);
                        alert(`💥 Sukses dikosongkan.`);
                    }
                })
                .catch((err) => {
                    showToast("Gagal mengosongkan data: " + err.message, "error");
                });
        }
    }
}

window.openOpnameModal = function() {
    const filterEl = document.getElementById('opname-branch-filter');
    const searchEl = document.getElementById('opname-search-bar'); 
    const titleEl = document.getElementById('opname-title');
    const modal = document.getElementById('opname-modal');
    
    if (!modal || !filterEl) return;

    if (searchEl) searchEl.value = '';

    if (currentTab === 'list_laptop') {
        titleEl.innerText = "Stok Opname: Master Laptop Gudang";
    } else if (currentTab === 'laptop_display') {
        titleEl.innerText = "Stok Opname: Laptop Display (Etalase)";
    } else if (currentTab === 'inventaris') {
        titleEl.innerText = "Stok Opname: Inventaris Suku Cadang, Alat & Part";
    } else {
        showToast("Stok Opname hanya didukung untuk tab Laptop / Inventaris.", "warning");
        return;
    }

    const email = window.currentUser.email || '';
    const role = window.currentUser.role || '';
    const userBranch = window.currentUser.branch || '';

    const isSuperadmin = (email === 'superadmin@wanasatria.com' || role === 'admin' || userBranch === 'Head Office');

    if (isSuperadmin) {
        filterEl.disabled = false;
        filterEl.value = ""; 
    } else {
        filterEl.value = userBranch;
        filterEl.disabled = true; 
    }

    modal.classList.remove('hidden');
    window.renderOpnameItems(true); 
};

window.closeOpnameModal = function() {
    const modal = document.getElementById('opname-modal');
    if (modal) modal.classList.add('hidden');
};

window.renderOpnameItems = function(isFullRebuild = false) {
    const container = document.getElementById('opname-list-container');
    const countEl = document.getElementById('opname-count-info');
    const filterEl = document.getElementById('opname-branch-filter');
    const searchEl = document.getElementById('opname-search-bar');

    if (!container || !filterEl) return;

    const selectedBranch = filterEl.value;
    const searchQuery = searchEl ? searchEl.value.toLowerCase().trim() : '';

    if (isFullRebuild) {
        if (!selectedBranch) {
            container.innerHTML = `
                <div class="text-center py-8 text-slate-400">
                    <i class="fa-solid fa-map-location-dot text-3xl mb-2 block animate-pulse text-cyan-500"></i>
                    <p class="text-xs font-semibold">Silakan pilih cabang terlebih dahulu untuk memuat daftar barang.</p>
                </div>
            `;
            if (countEl) countEl.innerText = "Total: 0 Barang";
            return;
        }

        container.innerHTML = `
            <div class="text-center py-8 text-slate-500">
                <i class="fa-solid fa-circle-notch animate-spin text-2xl text-cyan-600 mb-2"></i>
                <p class="text-xs font-medium">Menyinkronkan data fisik...</p>
            </div>
        `;

        const rawData = globalDataCloud[currentTab] || [];
        let items = [];

        if (selectedBranch === 'Semua') {
            items = rawData;
        } else {
            items = rawData.filter(item => item.cabang === selectedBranch);
        }

        if (currentTab === 'list_laptop') {
            items = items.filter(item => ['Tersedia', 'Disewa', 'Maintenance', 'Staf'].includes(item.status));
        } else if (currentTab === 'laptop_display') {
            items = items.filter(item => ['Ready', 'Gudang'].includes(item.status));
        }

        if (items.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-slate-400">
                    <i class="fa-solid fa-box-open text-3xl mb-2 block"></i>
                    <p class="text-xs font-medium">Tidak ada barang fisik yang terdaftar pada cabang ini.</p>
                </div>
            `;
            if (countEl) countEl.innerText = "Total: 0 Barang";
            return;
        }

        let html = '';
        items.forEach(item => {
            const searchableText = `${item.merk || ''} ${item.tipe || ''} ${item.sn || ''} ${item.kode_toko || ''} ${item.kode_barang || ''} ${item.nama_barang || ''} ${item.kategori || ''} ${item.spek || ''} ${item.spek_singkat || ''}`.toLowerCase();

            if (currentTab === 'list_laptop' || currentTab === 'laptop_display') {
                let statusBadgeColor = 'bg-slate-100 text-slate-800 border-slate-200';
                if (item.status === 'Tersedia' || item.status === 'Ready' || item.status === 'Aktif') {
                    statusBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200/40';
                } else if (item.status === 'Disewa') {
                    statusBadgeColor = 'bg-blue-100 text-blue-800 border-blue-200/40';
                } else if (item.status === 'Maintenance' || item.status === 'Gudang' || item.status === 'Tidak Aktif' || item.status === 'Rusak') {
                    statusBadgeColor = 'bg-rose-100 text-rose-800 border-rose-200/40';
                } else if (item.status === 'Staf') {
                    statusBadgeColor = 'bg-purple-100 text-purple-800 border-purple-200/40';
                }

                const specInlineText = (item.spek || item.spek_singkat || '')
                    .split('\n')
                    .map(line => line.trim())
                    .filter(Boolean)
                    .map(escapeHtml)
                    .join(' | ');

                html += `
                    <label data-search-text="${escapeHtml(searchableText)}" class="flex items-start space-x-3.5 p-4 bg-white border border-slate-200 hover:border-cyan-300 hover:bg-slate-50/50 rounded-xl transition cursor-pointer text-xs shadow-sm">
                        <input type="checkbox" name="opname_checkbox" data-key="${item._firebaseKey}" data-name="${escapeHtml(item.merk + ' ' + item.tipe)}" data-sn="${escapeHtml(item.sn)}" class="mt-1 rounded text-cyan-600 focus:ring-cyan-500 border-gray-300 w-4.5 h-4.5 cursor-pointer">
                        <div class="flex-grow space-y-2">
                            <div class="flex items-center flex-wrap gap-1">
                                <span class="font-extrabold text-slate-800 text-sm">${escapeHtml(item.merk)} ${escapeHtml(item.tipe)}</span>
                                <span class="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-extrabold rounded border border-slate-200 font-mono">${escapeHtml(item.kode_toko || 'N/A')}</span>
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${statusBadgeColor}">${escapeHtml(item.status === 'Staf' ? 'Digunakan Staf' : item.status)}</span>
                            </div>
                            <div class="text-[11px] text-slate-500 leading-relaxed">
                                <span class="font-bold text-slate-700">SN:</span> <span class="font-mono text-cyan-600 font-extrabold">${escapeHtml(item.sn || 'Tanpa SN')}</span>${specInlineText ? ' | ' + specInlineText : ''}
                            </div>
                            ${item.catatan ? `<div class="text-[10px] text-amber-600 italic font-bold">Catatan: ${escapeHtml(item.catatan)}</div>` : ''}
                        </div>
                    </label>
                `;
            } else if (currentTab === 'inventaris') {
                html += `
                    <div data-search-text="${escapeHtml(searchableText)}" class="p-4 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-4 shadow-sm hover:border-cyan-200 transition">
                        <div class="flex-grow space-y-1.5">
                            <div class="flex items-center flex-wrap gap-1">
                                <span class="font-extrabold text-slate-800 text-sm">${escapeHtml(item.nama_barang)}</span>
                                <span class="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-mono font-bold rounded border border-slate-200">${escapeHtml(item.kode_barang || 'N/A')}</span>
                            </div>
                            <div class="text-[11px] text-slate-500 font-semibold">
                                Kategori: <span class="text-slate-800 font-extrabold">${escapeHtml(item.kategori)}</span> | Lokasi Penyimpanan (Rak): <span class="text-slate-800 font-extrabold">${escapeHtml(item.lokasi_rak || 'Belum Diatur')}</span>
                            </div>
                            ${item.catatan ? `<div class="text-[10px] text-amber-600 italic font-bold">Catatan: ${escapeHtml(item.catatan)}</div>` : ''}
                        </div>
                        <div class="flex items-center gap-4 bg-slate-50 p-2.5 rounded-lg border border-slate-100 self-end sm:self-auto">
                            <div>
                                <span class="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Stok Sistem</span>
                                <span class="font-extrabold text-slate-700 text-sm">${item.stok} ${escapeHtml(item.satuan)}</span>
                            </div>
                            <div class="border-l border-slate-200 h-8"></div>
                            <div>
                                <span class="block text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider">Fisik Aktual</span>
                                <input type="number" name="opname_stock_input" data-key="${item._firebaseKey}" data-system="${item.stok}" data-name="${escapeHtml(item.nama_barang)}" data-unit="${escapeHtml(item.satuan)}" value="${item.stok}" class="w-20 border border-gray-300 rounded-lg p-1.5 text-center font-extrabold text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white">
                            </div>
                        </div>
                    </div>
                `;
            }
        });

        container.innerHTML = html;
    }

    let visibleCount = 0;
    const cards = container.children;

    for (let card of cards) {
        const searchText = card.getAttribute('data-search-text');
        if (searchText) {
            if (searchText.includes(searchQuery)) {
                card.classList.remove('hidden');
                visibleCount++;
            } else {
                card.classList.add('hidden');
            }
        }
    }

    if (countEl) countEl.innerText = `Total: ${visibleCount} Barang`;
};

window.submitOpname = function() {
    const filterEl = document.getElementById('opname-branch-filter');
    if (!filterEl || !filterEl.value) {
        alert("Silakan pilih cabang audit terlebih dahulu!");
        return;
    }

    let alertSummary = [];
    let logDetails = [];
    let updates = {};
    let hasDiscrepancy = false;
    let cocokCount = 0;
    let totalItems = 0;

    if (currentTab === 'list_laptop' || currentTab === 'laptop_display') {
        const checkboxes = Array.from(document.querySelectorAll('input[name="opname_checkbox"]'));
        totalItems = checkboxes.length;

        checkboxes.forEach(cb => {
            const fKey = cb.getAttribute('data-key');
            const name = cb.getAttribute('data-name');
            const sn = cb.getAttribute('data-sn');

            if (cb.checked) {
                cocokCount++;
            } else {
                hasDiscrepancy = true;
                const targetStatus = currentTab === 'list_laptop' ? 'Hilang/Disesuaikan' : 'Gudang';
                updates[`/${currentTab}/${fKey}/status`] = targetStatus;
                alertSummary.push(`• ${name} (SN: ${sn}) - Status: ${targetStatus}`);
                logDetails.push(`${name} (SN: ${sn})`);
            }
        });

        if (hasDiscrepancy) {
            const warningMsg = `⚠️ PERINGATAN SELISIH STOK OPNAME LAPTOP!\n\n` +
                `Audit Selesai. Hasil:\n` +
                `- Cocok: ${cocokCount}/${totalItems} Unit.\n` +
                `- SELISIH/HILANG (Fisik Tidak Ditemukan): ${alertSummary.length} Unit:\n` +
                `${alertSummary.join('\n')}\n\n` +
                `Apakah Anda yakin ingin memproses penyesuaian ini? Stok sistem akan otomatis disesuaikan dengan kondisi fisik aktual.`;

            if (confirm(warningMsg)) {
                update(ref(db), updates)
                    .then(() => {
                        logActivity('Ubah', currentTab, `Melakukan Stok Opname Laptop. Selisih: ${alertSummary.length} unit hilang (${logDetails.join(', ')}). Status sistem disesuaikan.`);
                        showToast(`Stok Opname berhasil disesuaikan. ${alertSummary.length} unit hilang diproses.`, "success");
                        window.closeOpnameModal();
                    })
                    .catch(err => {
                        showToast("Gagal menyesuaikan stok: " + err.message, "error");
                    });
            }
        } else {
            alert(`✅ Stok Opname Selesai!\n\nSemua fisik unit cocok dengan data sistem (Total: ${totalItems} Unit).`);
            logActivity('Lainnya', currentTab, `Melakukan Stok Opname Laptop. Hasil: Semua fisik unit cocok dengan data sistem (Total: ${totalItems} Unit).`);
            window.closeOpnameModal();
        }

    } else if (currentTab === 'inventaris') {
        const inputs = Array.from(document.querySelectorAll('input[name="opname_stock_input"]'));
        totalItems = inputs.length;

        inputs.forEach(input => {
            const fKey = input.getAttribute('data-key');
            const name = input.getAttribute('data-name');
            const unit = input.getAttribute('data-unit');
            const systemVal = Number(input.getAttribute('data-system')) || 0;
            const physicalVal = Number(input.value) || 0;

            if (physicalVal === systemVal) {
                cocokCount++;
            } else {
                hasDiscrepancy = true;
                const selisih = physicalVal - systemVal;
                updates[`/inventaris/${fKey}/stok`] = physicalVal;
                alertSummary.push(`• ${name} (Sistem: ${systemVal}, Fisik: ${physicalVal}, Selisih: ${selisih > 0 ? '+' : ''}${selisih} ${unit})`);
                logDetails.push(`${name} (${selisih > 0 ? '+' : ''}${selisih} ${unit})`);
            }
        });

        if (hasDiscrepancy) {
            const warningMsg = `⚠️ PERINGATAN SELISIH STOK OPNAME INVENTARIS!\n\n` +
                `Audit Selesai. Hasil:\n` +
                `- Cocok: ${cocokCount}/${totalItems} Item.\n` +
                `- Ditemukan SELISIH STOK pada ${alertSummary.length} Item:\n` +
                `${alertSummary.join('\n')}\n\n` +
                `Apakah Anda yakin ingin memproses penyesuaian ini? Stok sistem akan otomatis disesuaikan dengan kondisi fisik aktual.`;

            if (confirm(warningMsg)) {
                update(ref(db), updates)
                    .then(() => {
                        logActivity('Ubah', 'inventaris', `Melakukan Stok Opname Inventaris. Hasil: Selisih stok ditemukan pada ${alertSummary.length} item (${logDetails.join(', ')}). Stok sistem disesuaikan.`);
                        showToast(`Stok Opname disesuaikan. ${alertSummary.length} item diperbarui.`, "success");
                        window.closeOpnameModal();
                    })
                    .catch(err => {
                        showToast("Gagal menyesuaikan stok: " + err.message, "error");
                    });
            }
        } else {
            alert(`✅ Stok Opname Selesai!\n\nSemua fisik item cocok dengan data sistem (Total: ${totalItems} Item).`);
            logActivity('Lainnya', 'inventaris', `Melakukan Stok Opname Inventaris. Hasil: Semua fisik item cocok dengan data sistem (Total: ${totalItems} Item).`);
            window.closeOpnameModal();
        }
    }
};

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

    const searchBar = document.getElementById('search-bar');
    const searchQuery = searchBar ? searchBar.value.toLowerCase() : '';
    const statusFilter = document.getElementById('status-filter');
    const filterStatusValue = statusFilter ? statusFilter.value : '';
    const serverFilterValue = currentServerFilter || '';
    
    let branchFilterValue = window.userBranch || '';
    if (!branchFilterValue) {
        const branchFilterEl = document.getElementById('branch-filter');
        const branchContainer = document.getElementById('branch-filter-container'); // Pastikan baris ini ada
        
        if (branchFilterEl && branchContainer && !branchContainer.classList.contains('hidden')) {
            branchFilterValue = branchFilterEl.value;
        }
    }
    
    tbody.innerHTML = '';

    const filteredData = data.filter(item => {
        if (filterStatusValue) {
            if (currentTab === 'activity_logs') {
                if (item.action !== filterStatusValue) return false;
            } else if (currentTab === 'inventaris') {
                if (item.kondisi !== filterStatusValue) return false;
            } else {
                if (item.status !== filterStatusValue) return false;
            }
        }
        if (branchFilterValue && item.cabang && item.cabang !== branchFilterValue) return false;
        if (serverFilterValue) {
            const acct = (item.akun || '').toString();
            const srv = (item.server_utama || '').toString();
            if (acct !== serverFilterValue && srv !== serverFilterValue) return false;
        }
        
        if (currentSubTab) {
            if (currentSubTab === 'Terlambat' && currentTab === 'penyewaan') {
                if (item.status === 'Lunas') return false;
                const dateSelesai = new Date(item.tgl_selesai);
                const today = new Date();
                today.setHours(0,0,0,0);
                if (dateSelesai >= today) return false;
            } else {
                if (item.status !== currentSubTab) return false;
            }
        }

        return Object.values(item).some(val => {
            if (typeof val === 'object') return false;
            return String(val).toLowerCase().includes(searchQuery);
        });
    });

    const totalData = filteredData.length;

    if(totalData === 0) {
        tbody.innerHTML = `<tr><td colspan="${tableHeaders[currentTab].length}" class="px-4 py-8 text-center text-gray-400 bg-gray-50 font-medium"><i class="fa-solid fa-folder-open text-xl block mb-2"></i>Tidak ada data yang sesuai filter</td></tr>`;
        const paginationControls = document.getElementById('pagination-controls');
        if (paginationControls) paginationControls.classList.add('hidden');
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
            
            if (key === 'id') {
                rowHtml += `<td class="px-4 py-3 font-semibold text-slate-500 font-mono">${val}</td>`;
            } else if (key === 'tanggal' || key === 'tanggal_jam') {
                rowHtml += `<td class="px-4 py-3 whitespace-nowrap"><span class="font-mono text-xs text-slate-700">${val}</span></td>`;
            } else if (key === 'tgl_mulai' && currentTab === 'penyewaan') {
                const tglSelesai = item.tgl_selesai || '-';
                rowHtml += `<td class="px-4 py-3 whitespace-nowrap"><span class="font-mono text-xs text-slate-700">${val} - ${tglSelesai}</span></td>`;
            } else if ((key === 'biaya' || key === 'total_biaya' || key === 'harga_jual') && currentTab !== 'list_laptop') {
                rowHtml += `<td class="px-4 py-3 font-medium text-slate-900">Rp ${Number(val).toLocaleString('id-ID')}</td>`;
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
                if (isPermitted(permsDetail.inventaris)) badges.push('Inventaris'); 
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
                
                if (currentTab === 'list_office') {
                    const expiredStr = item.workspace_expired || item.workspace_expired || '';
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
                if (displayVal === 'Belum Bayar' || displayVal === 'Maintenance' || displayVal === 'Gudang' || displayVal === 'Tidak Aktif' || displayVal === 'Rusak') badgeColor = "bg-rose-100 text-rose-800";
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
                const unitItems = val.split(', ').map(u => u.trim());
                const unitHtml = unitItems.map(u => `<div class="flex gap-2 text-xs"><span>•</span><span class="font-mono text-cyan-700 font-medium">${u}</span></div>`).join('');
                rowHtml += `
                    <td class="px-4 py-3 text-xs text-slate-700 whitespace-normal min-w-[220px]">
                        <div class="max-h-28 overflow-y-auto pr-2 space-y-1.5 custom-table-scrollbar">
                            ${unitHtml}
                        </div>
                    </td>`;
            } else if (key === 'spek_singkat' && currentTab === 'laptop_display') {
                rowHtml += `
                    <td class="px-4 py-3 text-xs text-slate-700 whitespace-normal min-w-[240px]">
                        <div class="max-h-28 overflow-y-auto pr-1 font-mono space-y-0.5 custom-table-scrollbar text-slate-600">
                            ${val.replace(/\n/g, '<br>')}
                        </div>
                    </td>`;
            } else if (key === 'spek' && currentTab === 'list_laptop') {
                rowHtml += `
                    <td class="px-4 py-3 text-xs text-slate-700 whitespace-normal min-w-[240px]">
                        <div class="max-h-28 overflow-y-auto pr-1 font-mono space-y-0.5 custom-table-scrollbar text-slate-600">
                            ${val.replace(/\n/g, '<br>')}
                        </div>
                    </td>`;
            } else if (key === 'sn') {
                rowHtml += `<td class="px-4 py-3 font-mono font-medium text-cyan-700">${val}</td>`;
            } else if (key === 'office' && currentTab === 'list_office') {
                const tipeAkun = item.tipe_akun || 'Anggota';
                let badgeHtml = '';
                
                if (tipeAkun === 'Utama') {
                    const allOfficeData = globalDataCloud['list_office'] || [];
                    const familyName = (item.office || '').trim().toLowerCase();
                    const membersInGroup = allOfficeData.filter(off => (off.office || '').trim().toLowerCase() === familyName);
                    const totalSlotsFilled = membersInGroup.length;
                    
                    let limitBadge = '';
                    if (totalSlotsFilled >= 6) {
                        limitBadge = `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-700 border border-rose-200">Slot FULL (6/6)</span>`;
                    } else {
                        limitBadge = `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Tersedia ${6 - totalSlotsFilled} Slot</span>`;
                    }

                    badgeHtml = `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-wider">Host/Server</span>${limitBadge}`;
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
            } else if (key === 'kode_barang' && currentTab === 'inventaris') {
                rowHtml += `<td class="px-4 py-3 font-mono font-semibold text-cyan-700 whitespace-nowrap">${val}</td>`;
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
    if (paginationControls) {
        if (totalData > itemsPerPage) {
            paginationControls.classList.remove('hidden');
            const infoEl = document.getElementById('pagination-info');
            if (infoEl) infoEl.innerText = `Menampilkan data ke-${startIndex + 1} s/d ${Math.min(endIndex, totalData)} (Total ${totalData} Data)`;
            
            const btnPrev = document.getElementById('btn-prev-page');
            const btnNext = document.getElementById('btn-next-page');
            if (btnPrev) btnPrev.disabled = (currentPage === 1);
            if (btnNext) btnNext.disabled = (currentPage === totalPages);
        } else {
            paginationControls.classList.add('hidden');
        }
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

    const keyInput = document.getElementById('edit-firebase-key');
    if (keyInput) keyInput.value = firebaseKey;
    
    const fieldsContainer = document.getElementById('edit-modal-fields');
    if (!fieldsContainer) return;
    fieldsContainer.innerHTML = '';

    if (currentTab === 'services') {
        const inventarisList = globalDataCloud.inventaris || [];
        const availableSpareparts = inventarisList.filter(item => item.kondisi === 'Baik' && Number(item.stok) > 0);
        let sparepartOptions = '<option value="">-- Tanpa Penggantian Suku Cadang --</option>';
        availableSpareparts.forEach(part => {
            sparepartOptions += `<option value="${part._firebaseKey}">${escapeHtml(part.nama_barang)} (Sisa: ${part.stok} ${escapeHtml(part.satuan)} - Rak: ${escapeHtml(part.lokasi_rak || 'N/A')})</option>`;
        });

        let teknisiVal = targetItem.teknisi || 'Belum Ditentukan';
        let teknisiReadonlyAttr = '';
        if (String(window.currentUser.role).toLowerCase() === 'teknisi') {
            if (!targetItem.teknisi || targetItem.teknisi === 'Belum Ditentukan') {
                teknisiVal = window.currentUser.name || window.currentUser.email.split('@')[0];
            }
            teknisiReadonlyAttr = 'readonly class="w-full border p-2 text-sm rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed focus:outline-none"';
        } else {
            teknisiReadonlyAttr = 'class="w-full border p-2 text-sm rounded-lg bg-white"';
        }

        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Pelanggan</label><input type="text" id="edit-pelanggan" value="${targetItem.pelanggan || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">No. WhatsApp</label><input type="tel" id="edit-no_wa" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')" value="${targetItem.no_wa || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Perangkat</label><input type="text" id="edit-perangkat" value="${targetItem.perangkat || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Estimasi Biaya (Rp)</label><input type="number" id="edit-biaya" value="${targetItem.biaya || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div class="md:col-span-2"><label class="block text-xs font-semibold text-slate-500 mb-1">Gejala / Kerusakan & Kelengkapan</label><textarea id="edit-kerusakan" rows="2" required class="w-full border p-2 text-sm rounded-lg">${targetItem.kerusakan || ''}</textarea></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Teknisi Penanggung Jawab</label><input type="text" id="edit-teknisi" value="${teknisiVal}" ${teknisiReadonlyAttr}></div>
            <div class="md:col-span-2"><label class="block text-xs font-semibold text-slate-500 mb-1">Hasil Analisa / Tindakan Teknisi</label><textarea id="edit-tindakan_teknisi" rows="2" placeholder="Tuliskan tindakan servis, perbaikan komponen, dll." class="w-full border p-2 text-sm rounded-lg">${targetItem.tindakan_teknisi || ''}</textarea></div>
            
            <!-- ERP Suku Cadang Gudang Integrasi -->
            <div class="md:col-span-2 bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Pilih Suku Cadang Kerja (Potong Stok)</label>
                    <select id="edit-sparepart-select" class="w-full border p-2 text-xs rounded-lg bg-white focus:ring-1 focus:ring-cyan-500">${sparepartOptions}</select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Kuantitas Pemakaian</label>
                    <input type="number" id="edit-sparepart-qty" value="0" min="0" class="w-full border p-2 text-xs rounded-lg bg-white focus:ring-1 focus:ring-cyan-500">
                </div>
            </div>

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
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Brand / Merk Laptop</label><input type="text" id="edit-merk" list="list-merk" value="${targetItem.merk || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Tipe / Model Laptop</label><input type="text" id="edit-tipe" list="list-tipe" value="${targetItem.tipe || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Serial Number (SN)</label><input type="text" id="edit-sn" value="${targetItem.sn || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Status Ketersediaan</label><select id="edit-status" class="w-full border p-2 text-sm rounded-lg"><option value="Tersedia" ${targetItem.status === 'Tersedia' ? 'selected' : ''}>Ready / Tersedia</option><option value="Disewa" ${targetItem.status === 'Disewa' ? 'selected' : ''}>Sedang Disewa</option><option value="Maintenance" ${targetItem.status === 'Maintenance' ? 'selected' : ''}>Perbaikan / Rusak</option><option value="Terjual" ${targetItem.status === 'Terjual' ? 'selected' : ''}>Sudah Terjual</option><option value="Staf" ${targetItem.status === 'Staf' ? 'selected' : ''}>Digunakan Oleh Staf</option></select></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Catatan Tambahan</label><input type="text" id="edit-catatan" value="${targetItem.catatan || ''}" class="w-full border p-2 text-sm rounded-lg"></div>
            <div class="md:col-span-2">
                <label class="block text-xs font-semibold text-slate-500 mb-1">Spesifikasi Unit (Pisahkan dengan baris enter)</label>
                <textarea id="edit-spek" rows="4" required class="w-full border p-2 text-sm rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500">${targetItem.spek || ''}</textarea>
            </div>
        `;
    } else if (currentTab === 'laptop_display') { 
        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Tanggal Masuk</label><input type="date" id="edit-tanggal" value="${formatDateForInput(targetItem.tanggal)}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Cabang Toko</label><input type="text" id="edit-cabang" list="list-cabang" value="${targetItem.cabang || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Teknisi</label><input type="text" id="edit-teknisi" list="list-teknisi" value="${targetItem.teknisi || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Brand / Merk Laptop</label><input type="text" id="edit-merk" list="list-merk" value="${targetItem.merk || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Tipe / Model Laptop</label><input type="text" id="edit-tipe" list="list-tipe" value="${targetItem.tipe || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Serial Number (SN)</label><input type="text" id="edit-sn" value="${targetItem.sn || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Harga Jual Display (Rp)</label><input type="number" id="edit-harga_jual" value="${targetItem.harga_jual || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Status Pajangan</label><select id="edit-status" class="w-full border p-2 text-sm rounded-lg"><option value="Ready" ${targetItem.status === 'Ready' ? 'selected' : ''}>Ready di Etalase</option><option value="Terjual" ${targetItem.status === 'Terjual' ? 'selected' : ''}>Sudah Terjual</option><option value="Gudang" ${targetItem.status === 'Gudang' ? 'selected' : ''}>Ditarik ke Gudang (Off)</option></select></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Catatan Etalase</label><input type="text" id="edit-catatan" value="${targetItem.catatan || ''}" class="w-full border p-2 text-sm rounded-lg"></div>
            <div class="md:col-span-2">
                <label class="block text-xs font-semibold text-slate-500 mb-1">Spesifikasi-Spesifikasi Pajangan (Pisahkan dengan enter)</label>
                <textarea id="edit-spek_singkat" rows="4" required class="w-full border p-2 text-sm rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500">${targetItem.spek_singkat || ''}</textarea>
            </div>
        `;
    } else if (currentTab === 'inventaris') { 
        const inventarisCategoryOptions = buildInventarisCategoryOptions(globalDataCloud.inventaris || [], targetItem.kategori || '');
        const inventarisUnitOptions = buildInventarisUnitOptions(targetItem.satuan || '');

        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Tanggal Input</label><input type="date" id="edit-tanggal" value="${formatDateForInput(targetItem.tanggal)}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Cabang Toko</label><input type="text" id="edit-cabang" list="list-cabang" value="${targetItem.cabang || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Barang / Part</label><input type="text" id="edit-nama_barang" value="${targetItem.nama_barang || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Kategori</label><input type="text" id="edit-kategori" list="list-edit-kategori-inventaris" value="${targetItem.kategori || ''}" required class="w-full border p-2 text-sm rounded-lg"><datalist id="list-edit-kategori-inventaris">${inventarisCategoryOptions}</datalist></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Stok Fisik</label><input type="number" id="edit-stok" value="${targetItem.stok || '0'}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Satuan</label><select id="edit-satuan" class="w-full border p-2 text-sm rounded-lg">${inventarisUnitOptions}</select></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Lokasi Penyimpanan (Rak)</label><input type="text" id="edit-lokasi_rak" value="${targetItem.lokasi_rak || ''}" placeholder="Opsional" class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Kondisi</label><select id="edit-kondisi" class="w-full border p-2 text-sm rounded-lg"><option value="Baik" ${targetItem.kondisi === 'Baik' ? 'selected' : ''}>Baik / Layak</option><option value="Rusak" ${targetItem.kondisi === 'Rusak' ? 'selected' : ''}>Rusak / Tidak Layak</option></select></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Catatan Tambahan</label><input type="text" id="edit-catatan" value="${targetItem.catatan || ''}" class="w-full border p-2 text-sm rounded-lg"></div>
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
            
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Tipe Akun</label>
                <select id="edit-tipe_akun" class="w-full border p-2 text-sm rounded-lg bg-white">
                    <option value="Anggota" ${targetItem.tipe_akun === 'Anggota' ? 'selected' : ''}>Anggota (Member)</option>
                    <option value="Utama" ${targetItem.tipe_akun === 'Utama' ? 'selected' : ''}>Utama (Server / Host)</option>
                    <option value="Personal" ${targetItem.tipe_akun === 'Personal' ? 'selected' : ''}>Personal</option>
                </select>
            </div>

            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Lisensi Office</label>
                <select id="edit-office-select" class="w-full border p-2 text-sm rounded-lg bg-white">
                    <option value="">Pilih Jenis Office</option>
                    <option value="365 Family">365 Family</option>
                    <option value="365 Personal">365 Personal</option>
                    <option value="Home & Student 2016">Home & Student 2016</option>
                    <option value="Home & Student 2019">Home & Student 2019</option>
                    <option value="Home & Student 2021">Home & Student 2021</option>
                    <option value="Home 2024">Home 2024</option>
                </select>
            </div>
            <div id="edit-server-container" class="mt-2">
                <label class="block text-xs font-semibold text-slate-500 mb-1">Kaitkan ke Server Utama</label>
                <select id="edit-server_utama" class="w-full border p-2 text-sm rounded-lg bg-white">
                    <option value="">(Memuat daftar server...)</option>
                </select>
            </div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Name (Device)</label><input type="text" id="edit-name" value="${targetItem.name || ''}" class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Masa Aktif</label><input type="text" id="edit-masa_aktif" value="${targetItem.workspace_expired || targetItem.masa_aktif || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Status Lisensi</label><select id="edit-status" class="w-full border p-2 text-sm rounded-lg bg-white"><option value="Aktif" ${targetItem.status === 'Aktif' ? 'selected' : ''}>Aktif</option><option value="Tidak Aktif" ${targetItem.status === 'Tidak Aktif' ? 'selected' : ''}>Tidak Aktif</option><option value="Permanen" ${targetItem.status === 'Permanen' ? 'selected' : ''}>Permanen</option></select></div>
        `;
    } else if (currentTab === 'user_management') {
        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Lengkap</label><input type="text" id="edit-name-user" value="${targetItem.name || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Email Akun</label><input type="email" id="edit-email-user" value="${targetItem.email || ''}" required class="w-full border p-2 text-sm rounded-lg" readonly></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Password Baru (Kosongkan jika tak diubah)</label><input type="password" id="edit-password-user" class="w-full border p-2 text-sm rounded-lg"></div>
            
            <!-- DROPDOWN EDIT POSISI STRUKTURAL -->
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Posisi Struktural (Alur Visual)</label>
                <select id="edit-role-user" class="w-full border p-2 text-sm rounded-lg bg-white">
                    <option value="Sales Counter" ${targetItem.role === 'Sales Counter' ? 'selected' : ''}>Sales Counter</option>
                    <option value="Teknisi" ${targetItem.role === 'Teknisi' ? 'selected' : ''}>Teknisi (Sembunyikan Form)</option>
                    <option value="Customer Service" ${targetItem.role === 'Customer Service' ? 'selected' : ''}>Customer Service</option>
                    <option value="Admin" ${targetItem.role === 'Admin' ? 'selected' : ''}>Admin</option>
                </select>
            </div>

            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Wilayah Cabang</label><select id="edit-branch-user" class="w-full border p-2 text-sm rounded-lg bg-white"><option value="Head Office" ${targetItem.branch === 'Head Office' ? 'selected' : ''}>Head Office (Semua)</option><option value="Monumen Emmy Saelan" ${targetItem.branch === 'Monumen Emmy Saelan' ? 'selected' : ''}>Monumen Emmy Saelan</option><option value="Perintis" ${targetItem.branch === 'Perintis' ? 'selected' : ''}>Perintis</option></select></div>
            <div class="md:col-span-2 border-t pt-3 mt-2">
                <span class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2"><i class="fa-solid fa-key mr-1"></i> Edit Hak Akses Menu</span>
                <div class="border border-gray-200 rounded-xl p-3 max-h-40 overflow-y-auto bg-slate-50 custom-table-scrollbar">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-dashboard" ${targetItem.permissions?.dashboard ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Dashboard</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-services" ${targetItem.permissions?.services ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Log Service</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-penyewaan" ${targetItem.permissions?.penyewaan ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Penyewaan</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-cctv" ${targetItem.permissions?.cctv ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>CCTV</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-list_laptop" ${targetItem.permissions?.list_laptop ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Laptop Gudang</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-laptop_display" ${targetItem.permissions?.laptop_display ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Laptop Display</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-inventaris" ${targetItem.permissions?.inventaris ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Inventaris Alat & Part</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-list_office" ${targetItem.permissions?.list_office ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>List Office</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-user_management" ${targetItem.permissions?.user_management ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>User Management</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-activity_logs" ${targetItem.permissions?.activity_logs ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Riwayat Aktivitas</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-backup" ${targetItem.permissions?.backup_database ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Backup Database</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-export" ${targetItem.permissions?.export_excel ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Export Excel</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-import" ${targetItem.permissions?.import_excel ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Import Excel</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-edit" ${targetItem.permissions?.edit_data ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Edit Data</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-delete" ${targetItem.permissions?.delete_data ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
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

    const editModal = document.getElementById('edit-modal');
    if (editModal) editModal.classList.remove('hidden');

    if (currentTab === 'list_office') {
        const editTipe = document.getElementById('edit-tipe_akun');
        const editServer = document.getElementById('edit-server_utama');
        const editOfficeSelect = document.getElementById('edit-office-select');

        if (editOfficeSelect) {
            const cur = targetItem.office || '';
            if (cur) editOfficeSelect.value = cur;
        }

        try { refreshServerOptions(); } catch(e){}
        setTimeout(() => {
            if (editServer) {
                editServer.value = targetItem.server_utama || '';
            }
            if (editServer && editServer.value) {
                if (editOfficeSelect) { editOfficeSelect.value = '365 Family'; editOfficeSelect.disabled = true; }
            }
        }, 80);

        function handleEditTipeChange() {
            if (!editTipe) return;
            const v = editTipe.value || '';
            const srvCont = document.getElementById('edit-server-container');
            if (v === 'Anggota') {
                if (srvCont) srvCont.style.display = '';
            } else {
                if (srvCont) srvCont.style.display = 'none';
                if (editServer) editServer.value = '';
                if (editOfficeSelect) editOfficeSelect.disabled = false;
            }
        }

        if (editTipe) {
            editTipe.addEventListener('change', handleEditTipeChange);
            setTimeout(() => { handleEditTipeChange(); }, 50);
        }

        if (editServer) {
            editServer.addEventListener('change', () => {
                const v = editServer.value || '';
                if (v) {
                    if (editOfficeSelect) { editOfficeSelect.value = '365 Family'; editOfficeSelect.disabled = true; }
                } else {
                    if (editOfficeSelect) editOfficeSelect.disabled = false;
                }
            });
        }
    }
}

window.closeEditModal = closeEditModal;
function closeEditModal() {
    const editModal = document.getElementById('edit-modal');
    if (editModal) editModal.classList.add('hidden');
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

    const currentDataList = globalDataCloud[currentTab] || [];
    const targetItem = currentDataList.find(item => item._firebaseKey === firebaseKey);

    if (currentTab === 'services') {
        updatedData.pelanggan = document.getElementById('edit-pelanggan').value;
        updatedData.no_wa = document.getElementById('edit-no_wa').value;
        updatedData.perangkat = document.getElementById('edit-perangkat').value;
        updatedData.biaya = document.getElementById('edit-biaya').value;
        updatedData.status = document.getElementById('edit-status').value;
        updatedData.kerusakan = document.getElementById('edit-kerusakan').value;
        updatedData.teknisi = document.getElementById('edit-teknisi').value;
        updatedData.tindakan_teknisi = document.getElementById('edit-tindakan_teknisi').value || '';
        updatedData.cabang = targetItem?.cabang || window.currentUser.branch || 'Head Office'; 

        const sparepartKey = document.getElementById('edit-sparepart-select').value;
        const sparepartQty = Number(document.getElementById('edit-sparepart-qty').value) || 0;

        if (sparepartKey && sparepartQty > 0) {
            const part = (globalDataCloud.inventaris || []).find(p => p._firebaseKey === sparepartKey);
            if (part) {
                const currentStock = Number(part.stok) || 0;
                if (currentStock >= sparepartQty) {
                    const newStock = currentStock - sparepartQty;
                    const inventarisRef = ref(db, `inventaris/${sparepartKey}`);
                    update(inventarisRef, { stok: newStock });
                    
                    updatedData.tindakan_teknisi = (updatedData.tindakan_teknisi ? updatedData.tindakan_teknisi + '\n' : '') + 
                        `[ERP] Pemakaian Suku Cadang Gudang: ${sparepartQty} ${part.satuan} ${part.nama_barang}`;
                } else {
                    alert(`Peringatan ERP: Suku cadang ${part.nama_barang} tidak mencukupi (Stok: ${currentStock}). Penyesuaian dibatalkan.`);
                }
            }
        }
        itemDescription = `${updatedData.pelanggan} (${updatedData.perangkat}) - Teknisi: ${updatedData.teknisi}`;
    } else if (currentTab === 'cctv') {
        updatedData.klien = document.getElementById('edit-klien').value;
        updatedData.lokasi = document.getElementById('edit-lokasi').value;
        updatedData.jumlah_cctv = document.getElementById('edit-jumlah_cctv').value;
        updatedData.progres = document.getElementById('edit-progres').value;
        updatedData.status = document.getElementById('edit-status').value;
        updatedData.cabang = targetItem?.cabang || window.currentUser.branch || 'Head Office'; 
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
    } else if (currentTab === 'inventaris') {
        let editTgl = document.getElementById('edit-tanggal').value;
        if (editTgl && editTgl.includes('-')) {
            const parts = editTgl.split('-');
            updatedData.tanggal = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        updatedData.cabang = document.getElementById('edit-cabang').value;
        updatedData.nama_barang = document.getElementById('edit-nama_barang').value;
        updatedData.kategori = document.getElementById('edit-kategori').value;
        updatedData.stok = Number(document.getElementById('edit-stok').value) || 0;
        updatedData.satuan = document.getElementById('edit-satuan').value;
        updatedData.lokasi_rak = document.getElementById('edit-lokasi_rak').value || '';
        updatedData.kondisi = document.getElementById('edit-kondisi').value;
        updatedData.catatan = document.getElementById('edit-catatan').value;
        updatedData.kode_barang = targetItem?.kode_barang || generateInventarisSku(updatedData.kategori, editTgl);
        itemDescription = `Barang: ${updatedData.nama_barang} (Stok: ${updatedData.stok} ${updatedData.satuan})`;
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
        updatedData.cabang = targetItem?.cabang || window.currentUser.branch || 'Head Office'; 

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
        const editOfficeEl = document.getElementById('edit-office-select');
        updatedData.office = editOfficeEl ? editOfficeEl.value : '';
        const editServerEl = document.getElementById('edit-server_utama');
        updatedData.server_utama = editServerEl ? (editServerEl.value || '') : '';
        updatedData.name = document.getElementById('edit-name').value;
        updatedData.workspace_expired = document.getElementById('edit-masa_aktif').value;
        updatedData.status = document.getElementById('edit-status').value;
        updatedData.cabang = targetItem?.cabang || window.currentUser.branch || 'Head Office'; 
        itemDescription = `User: ${updatedData.nama_user} - Akun: ${updatedData.akun}`;
    } else if (currentTab === 'user_management') {
        updatedData.name = document.getElementById('edit-name-user')?.value || '';
        updatedData.email = document.getElementById('edit-email-user')?.value || '';
        updatedData.branch = document.getElementById('edit-branch-user')?.value || 'Head Office';
        updatedData.role = document.getElementById('edit-role-user')?.value || 'Teknisi';
        updatedData.permissions = {
            dashboard: document.getElementById('edit-perm-dashboard')?.checked || false,
            services: document.getElementById('edit-perm-services')?.checked || false,
            penyewaan: document.getElementById('edit-perm-penyewaan')?.checked || false,
            cctv: document.getElementById('edit-perm-cctv')?.checked || false,
            list_laptop: document.getElementById('edit-perm-list_laptop')?.checked || false,
            laptop_display: document.getElementById('edit-perm-laptop_display')?.checked || false,
            inventaris: document.getElementById('edit-perm-inventaris')?.checked || false, 
            list_office: document.getElementById('edit-perm-list_office')?.checked || false,
            user_management: document.getElementById('edit-perm-user_management')?.checked || false,
            activity_logs: document.getElementById('edit-perm-activity_logs')?.checked || false,
            backup_database: document.getElementById('edit-perm-backup')?.checked || false, 
            export_excel: document.getElementById('edit-perm-export')?.checked || false,
            import_excel: document.getElementById('edit-perm-import')?.checked || false,
            edit_data: document.getElementById('edit-perm-edit')?.checked || false,
            delete_data: document.getElementById('edit-perm-delete')?.checked || false
        };

        const newPass = document.getElementById('edit-password-user')?.value;
        if (newPass && newPass.trim().length >= 6) {
            updatedData.password = newPass.trim();
        } else {
            updatedData.password = targetItem.password || '';
        }
        itemDescription = `User: ${updatedData.name} (${updatedData.email}) - Posisi: ${updatedData.role}`;
    }

    const targetRef = ref(db, `${currentTab}/${firebaseKey}`);
    update(targetRef, updatedData)
        .then(() => {
            logActivity('Ubah', currentTab, `Mengubah data pada ID: ${targetItem.id || '-'} (${itemDescription}).`);
            showToast("Data berhasil diperbarui secara real-time!");
            closeEditModal();
        })
        .catch(err => {
            alert("Gagal memperbarui data: " + err.message);
        })
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
        alert("Anda tidak memiliki hak akses untuk menyelesaikan transaksi.");
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
                logActivity('Ubah', 'penyewaan', `Menyelesaikan pengembalian sewa unit ID #${sewaItem.id} atas nama ${sewaItem.penyewa}.`);
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
        const selectedRole = formData.get('role') || 'Teknisi';

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
                    inventaris: formData.get('perm_inventaris') === 'true', 
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
                    role: selectedRole,
                    branch: branch,
                    permissions: permissions
                };

                const userRef = ref(db, `user_management/${uid}`);
                return set(userRef, newUserProfile);
            })
            .then(() => {
                logActivity('Tambah', 'user_management', `Mendaftarkan user baru dengan Nama: ${name} (Email: ${email}) posisi: ${selectedRole}.`);
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

    const userBranch = window.currentUser.branch || 'Head Office';
    newDataItem.cabang = userBranch;

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

        newDataItem.cabang = formData.get('cabang') || userBranch;
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

        newDataItem.cabang = formData.get('cabang') || userBranch;
        newDataItem.teknisi = formData.get('teknisi');
        newDataItem.merk = formData.get('merk');
        newDataItem.tipe = formData.get('tipe');
        newDataItem.sn = formData.get('sn');
        newDataItem.harga_jual = formData.get('harga_jual');
        newDataItem.status = formData.get('status');
        newDataItem.catatan = formData.get('catatan') || '';
        newDataItem.spek_singkat = `CPU: ${proc}\nRAM: ${ram}\nSSD/HDD: ${storage}\nVGA/Layar: ${vga} (${screen})`;
        logDetail = `${newDataItem.merk} ${newDataItem.tipe} (SN: ${newDataItem.sn}) di etalase cabang ${newDataItem.cabang}`;
    } else if (currentTab === 'inventaris') { 
        newDataItem.cabang = formData.get('cabang') || userBranch;
        newDataItem.nama_barang = formData.get('nama_barang');
        newDataItem.kategori = formData.get('kategori');
        newDataItem.stok = Number(formData.get('stok')) || 0;
        newDataItem.satuan = formData.get('satuan');
        newDataItem.lokasi_rak = formData.get('lokasi_rak') || '';
        newDataItem.kondisi = formData.get('kondisi');
        newDataItem.catatan = formData.get('catatan') || '';
        newDataItem.kode_barang = generateInventarisSku(newDataItem.kategori, inputTgl);
        logDetail = `Barang: ${newDataItem.nama_barang} (Stok: ${newDataItem.stok} ${newDataItem.satuan}) di Rak ${newDataItem.lokasi_rak}`;
    } else if (currentTab === 'services') {
    const activeName = window.currentUser.name || window.currentUser.email.split('@')[0];
    
    // Menentukan penamaan peran/role secara rapi untuk ditampilkan pada baris Penerima
    let roleDisplay = 'Sales Counter';
    if (window.currentUser.role === 'admin') {
        roleDisplay = 'Admin';
    } else if (window.currentUser.role === 'teknisi') {
        roleDisplay = 'Teknisi';
    } else if (window.currentUser.role) {
        // Mengubah format role database (misal: 'sales_counter') menjadi berhuruf besar (misal: 'Sales Counter')
        roleDisplay = window.currentUser.role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
    
    const rawKeluhan = formData.get('kerusakan') || '';

    newDataItem.pelanggan = formData.get('pelanggan');
    newDataItem.no_wa = formData.get('no_wa');
    newDataItem.perangkat = formData.get('perangkat');
    newDataItem.biaya = formData.get('biaya');
    newDataItem.status = formData.get('status');
    newDataItem.teknisi = 'Belum Ditentukan';
    newDataItem.tindakan_teknisi = '';
    
    // Menyusun teks Penerima diikuti baris kelengkapan & keluhan yang diketik sales counter
    newDataItem.kerusakan = `Penerima: ${activeName} (${roleDisplay})\n${rawKeluhan}`;
    logDetail = `Pelanggan: ${newDataItem.pelanggan} - Unit: ${newDataItem.perangkat}`;
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
        newDataItem.server_utama = formData.get('server_utama') || '';
        newDataItem.name = formData.get('name');
        newDataItem.workspace_expired = formData.get('masa_aktif');
        newDataItem.status = formData.get('status');
        logDetail = `User: ${newDataItem.nama_user} - Akun Office: ${newDataItem.akun}`;
    }

    const targetRef = ref(db, currentTab);
    const newPostRef = push(targetRef);
    
    set(newPostRef, newDataItem)
        .then(() => {
            if (currentTab === 'inventaris') {
                refreshInventarisFieldOptions();
            }

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
        .finally(() => {
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
}

function reindexSequentialIdsForTab(tabName, excludedFirebaseKey = null) {
    const dataList = Array.isArray(globalDataCloud[tabName]) ? globalDataCloud[tabName] : [];
    if (!dataList.length) return Promise.resolve();

    const remainingItems = dataList.filter(item => item && item._firebaseKey && item._firebaseKey !== excludedFirebaseKey);
    if (remainingItems.length === 0) {
        globalDataCloud[tabName] = [];
        return Promise.resolve();
    }

    const sortedItems = [...remainingItems].sort((a, b) => {
        const idA = Number(a?.id) || 0;
        const idB = Number(b?.id) || 0;
        return idA - idB;
    });

    const updatePromises = sortedItems.map((item, index) => {
        const newId = index + 1;
        if (Number(item.id) === newId) return Promise.resolve();
        const itemRef = ref(db, `${tabName}/${item._firebaseKey}`);
        return update(itemRef, { id: newId }).catch(() => null);
    });

    return Promise.allSettled(updatePromises).then((results) => {
        const hasFailures = results.some(result => result.status === 'rejected');
        if (!hasFailures) {
            globalDataCloud[tabName] = sortedItems.map((item, index) => ({
                ...item,
                id: index + 1
            }));
        }
        return results;
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
        confirmationMessage = "Hapus profil pengguna ini dari database?\n\nKredensial login disarankan juga dihapus secara manual di Firebase Console.";
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
        
        let targetLogDesc = targetItem?.pelanggan || targetItem?.penyewa || targetItem?.klien || targetItem?.merk || targetItem?.nama_user || targetItem?.name || targetItem?.nama_barang || '-';
        
        const targetRowRef = ref(db, `${currentTab}/${firebaseKey}`);
        remove(targetRowRef)
            .then(() => reindexSequentialIdsForTab(currentTab, firebaseKey))
            .then(() => {
                logActivity('Hapus', currentTab, `Menghapus baris data ID #${targetItem.id} (Detail: ${targetLogDesc}) pada modul ${currentTab}.`);
            })
            .catch((error) => {
                console.warn('Gagal reindex ID setelah hapus data:', error);
                showToast('Data terhapus, tetapi pengurutan ID tidak selesai.', 'warning');
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
        const isDisabled = lap.status !== 'Tersedia' && !isMine;
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

function startNetworkMonitoring() {
    const connectedRef = ref(db, ".info/connected");
    onValue(connectedRef, (snap) => {
        const isConnected = snap.val() === true;
        const userBtn = document.getElementById('user-menu-button');
        
        if (userBtn) {
            if (isConnected) {
                userBtn.className = "relative flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-700 hover:bg-cyan-50 hover:text-cyan-600 border-2 border-emerald-500 focus:outline-none transition shadow-sm";
            } else {
                userBtn.className = "relative flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-700 hover:bg-cyan-50 hover:text-cyan-600 border-2 border-rose-500 animate-pulse focus:outline-none transition shadow-sm";
            }
        }
    });
}

onAuthStateChanged(auth, async (user) => {
    const loginSection = document.getElementById('login-section');
    const mainAppSection = document.getElementById('main-app-section');

    startNetworkMonitoring();

    if (userProfileListener) {
        userProfileListener();
        userProfileListener = null;
    }

    if (user) {
        if (loginSection) loginSection.classList.add('hidden');
        if (mainAppSection) mainAppSection.classList.remove('hidden');
        
        const emailSpan = document.getElementById('user-logged-email');
        if (emailSpan) {
            emailSpan.innerText = user.email;
        }

        window.currentUser.uid = user.uid;
        window.currentUser.email = user.email;
        
        const userRef = ref(db, `user_management/${user.uid}`);
        
        userProfileListener = onValue(userRef, (snapshot) => {
            if (user.email === 'superadmin@wanasatria.com') {
                window.currentUser.name = 'Superadmin';
                window.currentUser.role = 'admin';
                window.currentUser.branch = 'Head Office';
                window.currentUser.permissions = {
                    dashboard: true, services: true, penyewaan: true, cctv: true,
                    list_laptop: true, laptop_display: true, inventaris: true, list_office: true, user_management: true,
                    activity_logs: true, backup_database: true,
                    export_excel: true, import_excel: true, edit_data: true, delete_data: true
                };
            } else if (snapshot.exists()) {
                const profile = snapshot.val();
                window.currentUser.name = profile.name || profile.email.split('@')[0];
                window.currentUser.role = profile.role || 'teknisi';
                window.currentUser.branch = profile.branch || 'Head Office';
                
                if (profile.permissions) {
                    window.currentUser.permissions = profile.permissions;
                } 
            } else {
                window.currentUser.name = user.email.split('@')[0];
                window.currentUser.role = 'teknisi';
                window.currentUser.branch = 'Head Office';
                window.currentUser.permissions = {
                    dashboard: false, services: false, penyewaan: false, cctv: false,
                    list_laptop: true, laptop_display: true, inventaris: false, list_office: false, user_management: false,
                    activity_logs: false, backup_database: false,
                    export_excel: false, import_excel: false, edit_data: true, delete_data: false
                };
            }
            
            initApp();
        }, (error) => {
            console.error("Gagal sinkronisasi data peran real-time:", error);
            if (user.email === 'superadmin@wanasatria.com') {
                window.currentUser.name = 'Superadmin';
                window.currentUser.role = 'admin';
                window.currentUser.branch = 'Head Office';
                window.currentUser.permissions = {
                    dashboard: true, services: true, penyewaan: true, cctv: true,
                    list_laptop: true, laptop_display: true, inventaris: true, list_office: true, user_management: true,
                    activity_logs: true, backup_database: true,
                    export_excel: true, import_excel: true, edit_data: true, delete_data: true
                };
            } else {
                window.currentUser.name = user.email.split('@')[0];
                window.currentUser.role = 'teknisi';
                window.currentUser.branch = 'Head Office';
                window.currentUser.permissions = {
                    dashboard: false, services: false, penyewaan: false, cctv: false,
                    list_laptop: true, laptop_display: true, inventaris: false, list_office: false, user_management: false,
                    activity_logs: false, backup_database: false,
                    export_excel: false, import_excel: false, edit_data: true, delete_data: false
                };
            }
            initApp();
        });
    } else {
        if (loginSection) loginSection.classList.remove('hidden');
        if (mainAppSection) mainAppSection.classList.add('hidden');
        
        const btnText = document.getElementById('btn-login-text');
        if (btnText) {
            btnText.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Verifikasi & Masuk`;
            btnText.disabled = false;
        }

        const loginEmail = document.getElementById('login-email');
        const loginPass = document.getElementById('login-password');
        if (loginEmail) loginEmail.value = '';
        if (loginPass) loginPass.value = '';

        activeFirebaseListeners.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') unsubscribe();
        });
        activeFirebaseListeners = [];

        globalDataCloud = {
            services: [],
            penyewaan: [],
            cctv: [],
            list_laptop: [],
            laptop_display: [],
            inventaris: [],
            list_office: [],
            user_management: [],
            activity_logs: []
        };
        currentPage = 1;

        window.currentUser = {
            uid: null,
            name: null,
            email: null,
            role: null,
            branch: null,
            permissions: {}
        };
    }
});

function initApp() {
    activeFirebaseListeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') unsubscribe();
    });
    activeFirebaseListeners = [];

    const d = new Date();
    const opsiHari = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    
    const userDropdownDate = document.getElementById('user-dropdown-date');
    if (userDropdownDate) {
        userDropdownDate.innerText = d.toLocaleDateString('id-ID', opsiHari);
    }

    const perms = window.currentUser.permissions || {};
    const savedTab = sessionStorage.getItem('activeTab');
    
    const firstAllowedTab = applyRoleBasedAccess();

    let defaultTab = savedTab;
    if (!defaultTab || !isPermitted(perms[defaultTab])) {
        defaultTab = firstAllowedTab;
    }

    switchTab(defaultTab);
    syncHamburgerIcon();

    const allnodes = ['services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'inventaris', 'list_office','user_management', 'activity_logs'];
    allnodes.forEach(node => {
        if (!db) return;
        
        if (node !== 'user_management' && !isPermitted(perms[node])) {
            return; 
        }
        if (node === 'user_management' && !isPermitted(perms.user_management)) {
            return;
        }

        let nodeRef;
        const branch = window.currentUser.branch;
        const role = window.currentUser.role;
        const email = window.currentUser.email;

        const isAdmin = (email === 'superadmin@wanasatria.com' || role === 'admin');
        const hasBranchRestriction = (branch && branch !== 'Head Office' && email !== 'superadmin@wanasatria.com');

        if (node !== 'user_management' && node !== 'list_office' && !isAdmin && hasBranchRestriction) {
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
            if (node === 'list_office') {
                try { refreshServerOptions(); } catch(e) { }
            }
            if (node === 'list_laptop' && currentTab === 'penyewaan') {
                populateLaptopCheckboxes();
            }
            const dashModal = document.getElementById('dashboard-modal');
            if (dashModal && !dashModal.classList.contains('hidden')) {
                calculateAndRenderStats();
            }
        }, (error) => {
            console.error(`Gagal menyinkronkan data real-time pada node [${node}]:`, error);
        });

        activeFirebaseListeners.push(unsubscribe);
    });
}

function refreshServerOptions() {
    const serverSelect = document.getElementById('server-utama-select');
    if (!serverSelect) return;

    const master = globalDataCloud['list_office'] || [];
    const utamaAccounts = master.filter(i => (i.tipe_akun || '').toString().toLowerCase() === 'utama');

    if (utamaAccounts.length === 0) {
        serverSelect.innerHTML = `<option value="">-- Tidak ada Server Utama terdaftar --</option>`;
        return;
    }

    const options = utamaAccounts.map(utama => {
        const email = utama.akun || '';
        const anggotaCount = master.filter(it => (it.server_utama || '') === email).length;
        const slotsLeft = Math.max(0, 5 - anggotaCount);
        if (slotsLeft > 0) {
            return `<option value="${escapeHtml(email)}">${escapeHtml(email)} (Sisa ${slotsLeft} Slot)</option>`;
        }
        return `<option value="${escapeHtml(email)}" disabled>${escapeHtml(email)} (FULL - 0 Slot)</option>`;
    }).join('');

    serverSelect.innerHTML = `<option value="">(Pilih Server Utama)</option>` + options;
}

function refreshServerFilterOptions() {
    const serverSelect = document.getElementById('server-filter');
    if (!serverSelect) return;

    const master = globalDataCloud['list_office'] || [];
    const utamaAccounts = master.filter(i => (i.tipe_akun || '').toString().toLowerCase() === 'utama');

    let html = '<option value="">Semua Server</option>';
    utamaAccounts.forEach(utama => {
        const email = utama.akun || '';
        const anggotaCount = master.filter(it => (it.server_utama || '') === email).length;
        html += `<option value="${escapeHtml(email)}">${escapeHtml(email)} (${anggotaCount} anggota)</option>`;
    });
    serverSelect.innerHTML = html;

    serverSelect.value = currentServerFilter || '';
    serverSelect.onchange = () => {
        currentServerFilter = serverSelect.value || '';
        resetPaginationAndRender();
        window.updateFilterBadgeCount();
    };
}