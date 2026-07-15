/* ==========================================================================
   Teknisi Portal - app.js (Orchestrator Utama, Navigasi & Event Form)
   ========================================================================== */

// --- FUNGSI GLOBAL PEMFORMAT RUPIAH REAL-TIME ---
window.formatCurrencyInput = function(val) {
    if (!val) return '';
    // Hapus semua karakter selain angka
    let clean = String(val).replace(/\D/g, '');
    if (!clean) return '';
    // Tambahkan tanda titik sebagai pemisah ribuan
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

// Import konfigurasi & template
import { 
    db, ref, set, push, onValue, query, orderByChild, equalTo,
    firebaseLogin, firebaseLogout 
} from './firebase-config.js';

import { 
    fieldsTemplate, tableHeaders, filterOptionsTemplate 
} from './templates.js';

import { 
    togglePassword, parseDate, formatDateForInput 
} from './utils.js';

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================================================
// IMPORT MODUL EKSTERNAL BARU (Terintegrasi Otomatis via ES Modules)
// ==========================================================================
import './ui-handlers.js';       // Modul Navigasi & Dropdown Visual
import './table.js';             // Modul rendering tabel & data
import './dashboard.js';         // Modul statistik eksekutif & diagram
import './opname.js';            // Modul checklist audit fisik
import './excel.js';             // Modul transfer data XLSX biner
import './forms.js';             // Modul formulir transaksi & ERP
import './admin-utils.js';       // Modul backup & pemeliharaan database admin
import './jasa.js';              // Modul Master Jasa & Perawatan Data Tindakan Toko
import './cetak.js';             // Modul cetak dokumen & laporan PDF
import './katalog-penjualan.js'; // Modul Katalog Produk & Log Penjualan Baru

// ==========================================================================
// INISIALISASI STATUS GLOBAL WINDOW (Diakses oleh seluruh modul eksternal)
// ==========================================================================
window.currentTab = 'services';
window.currentSubTab = ''; 
window.selectedLaptopKeys = []; 
window.editSelectedLaptopKeys = [];
window.selectedPenjualanItems = []; // Menyimpan item keranjang belanja penjualan aktif

window.globalDataCloud = {
    services: [],
    penyewaan: [],
    cctv: [],
    list_laptop: [],
    laptop_display: [],
    inventaris: [], 
    master_jasa: [],
    katalog_produk: [], // Node Katalog Produk Global Baru
    log_penjualan: [],  // Node Log Penjualan Global Baru
    list_office: [],
    user_management: [],
    activity_logs: []
}; 

let activeFirebaseListeners = [];
let userProfileListener = null; 

window.currentPage = 1;
window.itemsPerPage = 20;
window.currentServerFilter = '';

let isTabLoadingState = false;

window.currentUser = {
    uid: null,
    email: null,
    name: null,
    role: null,
    branch: null,
    permissions: {}
};

window.userBranch = ''; 

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

    const currentItems = window.globalDataCloud.inventaris || [];
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
    if (window.currentTab !== 'inventaris') return;

    const categoryLists = ['list-kategori-inventaris', 'list-edit-kategori-inventaris'];
    categoryLists.forEach(listId => {
        const list = document.getElementById(listId);
        if (list) {
            list.innerHTML = buildInventarisCategoryOptions(window.globalDataCloud.inventaris || []);
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

function isPermitted(val) {
    if (window.currentUser && window.currentUser.email === 'superadmin@wanasatria.com') {
        return true; // Superadmin selalu diizinkan mutlak
    }
    return val === true || val === 'true';
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
    const btnMasterJasa = document.getElementById('btn-master_jasa'); 
    const btnKatalogProduk = document.getElementById('btn-katalog_produk'); 
    const btnLogPenjualan = document.getElementById('btn-log_penjualan'); 
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
    if (btnMasterJasa) {
        if (isPermitted(perms.master_jasa)) btnMasterJasa.classList.remove('hidden');
        else btnMasterJasa.classList.add('hidden');
    }
    if (btnKatalogProduk) {
        if (isPermitted(perms.katalog_produk)) btnKatalogProduk.classList.remove('hidden');
        else btnKatalogProduk.classList.add('hidden');
    }
    if (btnLogPenjualan) {
        if (isPermitted(perms.log_penjualan)) btnLogPenjualan.classList.remove('hidden');
        else btnLogPenjualan.classList.add('hidden');
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
    if (dropdownPurge) dropdownPurge.style.display = (canDelete && window.currentTab === 'activity_logs') ? '' : 'none';
    if (dropdownClear) dropdownClear.style.display = canDelete ? '' : 'none';
    if (dropdownExport) dropdownExport.style.display = canExport ? '' : 'none';
    if (dropdownImport) dropdownImport.style.display = canImport ? '' : 'none';

    const dropdownOpname = document.getElementById('dropdown-opname-container');
    if (dropdownOpname) {
        const isOpnameTab = (window.currentTab === 'list_laptop' || window.currentTab === 'laptop_display' || window.currentTab === 'inventaris');
        dropdownOpname.style.display = (isOpnameTab && perms.edit_data) ? '' : 'none';
    }

    if (utilityDropdownContainer) {
        if (canBackup || canDelete || canExport || canImport || canDashboard) {
            utilityDropdownContainer.classList.remove('hidden');
        } else {
            utilityDropdownContainer.classList.add('hidden');
        }
    }

    const tabsOrder = ['services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'inventaris', 'master_jasa', 'katalog_produk', 'log_penjualan', 'list_office', 'user_management', 'activity_logs'];
    for (let t of tabsOrder) {
        if (isPermitted(perms[t])) {
            return t;
        }
    }
    return 'list_laptop'; 
}

// --- FUNGSI OTOMATISASI & VISUAL LOCK KOLOM CABANG TOKO ---
function applyBranchFieldRules() {
    const form = document.getElementById('operational-form');
    if (!form) return;

    const branchElement = form.querySelector('[name="cabang"]');
    if (!branchElement) return;

    const isRestricted = !!window.userBranch; 

    if (isRestricted) {
        // Operator Cabang: Kunci input cabang secara visual (seperti di gambar Anda)
        const lockedInput = document.createElement('input');
        lockedInput.type = 'text';
        lockedInput.name = 'cabang';
        lockedInput.value = window.userBranch;
        lockedInput.readOnly = true;
        lockedInput.className = "w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-gray-100 text-gray-500 cursor-not-allowed focus:outline-none";

        branchElement.parentNode.replaceChild(lockedInput, branchElement);
    } else {
        // Admin / Superadmin: Tetap biarkan interaktif & pastikan pilihan "Head Office" bersih dari transaksi harian
        if (branchElement.tagName === 'SELECT') {
            for (let i = 0; i < branchElement.options.length; i++) {
                if (branchElement.options[i].value === 'Head Office') {
                    branchElement.remove(i);
                    break;
                }
            }
            if (!branchElement.value) {
                branchElement.value = "Monumen Emmy Saelan";
            }
        } else if (branchElement.tagName === 'INPUT') {
            branchElement.placeholder = "Pilih / ketik cabang...";
        }
    }
}

function updateDynamicDatalists() {
    const allLaptops = [...(window.globalDataCloud['list_laptop'] || []), ...(window.globalDataCloud['laptop_display'] || [])];
    const allServices = window.globalDataCloud['services'] || [];
    const allSewa = window.globalDataCloud['penyewaan'] || [];
    const allCCTV = window.globalDataCloud['cctv'] || [];

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

    const allLaptops = [...(window.globalDataCloud['list_laptop'] || []), ...(window.globalDataCloud['laptop_display'] || [])];
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
        const tabsOrder = ['dashboard','services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'inventaris', 'master_jasa', 'katalog_produk', 'log_penjualan', 'list_office', 'user_management', 'activity_logs'];
        const firstAllowed = tabsOrder.find(t => isPermitted(perms[t]));

        if (!firstAllowed) {
            return;
        }
        tabName = firstAllowed;
    }

    if (window.innerWidth < 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
            window.toggleSidebar(); 
        }
    }

    window.currentTab = tabName;
    window.currentSubTab = ''; 
    
    if (!isPermitted(perms[window.currentTab])) {
        return;
    }
    sessionStorage.setItem('activeTab', tabName);
    
    window.selectedLaptopKeys = []; 
    
    const titles = { 
        dashboard: "Dashboard Operasional",
        services: "Input Log Services", 
        penyewaan: "Input Data Penyewaan", 
        cctv: "Input Proyek CCTV Pemasangan",
        list_laptop: "Manajemen Unit Laptop yang Disewakan (Master Data)",
        laptop_display: "Manajemen List Laptop Display (Etalase Toko)",
        inventaris: "Manajemen Inventaris Suku Cadang, Alat & Part",
        master_jasa: "Manajemen Master Jasa & Tindakan Toko",
        katalog_produk: "Manajemen Katalog Produk Jual (Toko)",
        log_penjualan: "Input Log Penjualan Produk & Aksesoris",
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
        master_jasa: "Kosongkan Data Jasa",
        katalog_produk: "Kosongkan Katalog Produk",
        log_penjualan: "Kosongkan Log Penjualan",
        list_office: "Kosongkan Data Office",
        user_management: "Kosongkan Data Users",
        activity_logs: "Kosongkan Log Aktivitas"
    };
    
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.innerText = titles[tabName];

    const formFields = document.getElementById('form-fields');
    if (formFields) formFields.innerHTML = fieldsTemplate[tabName];
    refreshInventarisFieldOptions();

    // Jalankan aturan visualisasi kolom cabang
    applyBranchFieldRules();

    if (tabName === 'list_office') {
        const tipeSelect = document.querySelector('#form-fields select[name="tipe_akun"]');
        const serverContainer = document.getElementById('server-link-container');
        const serverSelect = document.getElementById('server-utama-select');
        const officeSelect = document.getElementById('select-office');
        const masaAktifContainer = document.getElementById('masa-aktif-container');

        function handleTipeAkunChange() {
            const val = tipeSelect ? tipeSelect.value : '';
            if (val === 'Anggota') {
                if (serverContainer) serverContainer.classList.remove('hidden');
                if (masaAktifContainer) masaAktifContainer.classList.add('hidden'); 
                refreshServerOptions();
            } else {
                if (serverContainer) serverContainer.classList.add('hidden');
                if (masaAktifContainer) masaAktifContainer.classList.remove('hidden'); 
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
                    const master = window.globalDataCloud['list_office'] || [];
                    const matchedServer = master.find(it => (it?.akun || '').toString() === v && (it?.tipe_akun || '').toString().toLowerCase() === 'utama');
                    const masaAktifInput = document.querySelector('#form-fields input[name="masa_aktif"]');
                    if (matchedServer && masaAktifInput) {
                        masaAktifInput.value = matchedServer.masa_aktif || '';
                    }
                } else {
                    if (officeSelect) {
                        officeSelect.disabled = false;
                    }
                }
            });
        }

        setTimeout(() => { if (tipeSelect) handleTipeAkunChange(); }, 50);
        setTimeout(() => { refreshServerFilterOptions(); }, 60);
    }

    if (tabName === 'log_penjualan') {
        window.selectedPenjualanItems = [];
        setTimeout(() => { 
            window.populatePenjualanCart(); 

            // Sinkronisasi dinamis dropdown cabang dengan list belanjaan
            const form = document.getElementById('operational-form');
            const branchSelect = form ? form.querySelector('[name="cabang"]') : null;
            if (branchSelect) {
                branchSelect.addEventListener('change', () => {
                    window.selectedPenjualanItems = []; // reset belanjaan agar tidak tercampur cabang lain
                    window.populatePenjualanCart();
                });
            }
        }, 50);
    }

    const searchBar = document.getElementById('search-bar');
    if (searchBar) searchBar.value = ''; 

    const formCard = document.getElementById('form-container-card');
    if (formCard) {
        const structuralPosition = String(window.currentUser.role || '').toLowerCase();
        if (tabName === 'activity_logs' || (structuralPosition === 'teknisi' && tabName === 'services')) {
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
        const nonBranchTabs = ['list_laptop', 'laptop_display', 'inventaris', 'master_jasa', 'katalog_produk', 'log_penjualan'];
        if (nonBranchTabs.includes(tabName) && !window.userBranch) {
            branchContainer.classList.remove('hidden');
        } else {
            branchContainer.classList.add('hidden');
        }
    }

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
            window.currentServerFilter = '';
        }
    }

    setTimeout(() => { window.updateFilterBadgeCount(); }, 80);

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
            master_jasa: "Data Jasa",
            katalog_produk: "Katalog Produk",
            log_penjualan: "Log Penjualan",
            list_office: "Data Office",
            user_management: "Data Users",
            activity_logs: "Log Aktivitas"
        };
        clearLabelDropdown.innerText = `Kosongkan ${listNames[tabName] || "List Ini"}`;
    }
    
    applyRoleBasedAccess();
    
    ['services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'inventaris', 'master_jasa', 'katalog_produk', 'log_penjualan', 'list_office','user_management', 'activity_logs'].forEach(tab => {
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

    if (window.renderTableHeader) window.renderTableHeader();
    if (window.updateSecondaryFilterDropdown) window.updateSecondaryFilterDropdown();
    
    isTabLoadingState = true;
    showTableLoading("Mengambil & Menyinkronkan Data Cloud...");
    
    setTimeout(() => {
        isTabLoadingState = false;
        if (isPermitted(perms[window.currentTab])) {
            if (window.renderTable) window.renderTable();
        }
    }, 350);
}

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

function showTableLoading(message = "Mengambil Data...") {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    
    const colSpanCount = tableHeaders[window.currentTab] ? tableHeaders[window.currentTab].length : 8;
    
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

function logActivity(action, menu, details) {
    if (!db) return;
    const logRef = ref(db, 'activity_logs');
    const newLogRef = push(logRef);
    
    const now = new Date();
    const tanggalJam = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const nextId = (window.globalDataCloud['activity_logs'] || []).length === 0 ? 1 : Math.max(...window.globalDataCloud['activity_logs'].map(l => Number(l.id) || 0)) + 1;

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
                    list_laptop: true, laptop_display: true, inventaris: true, master_jasa: true, katalog_produk: true, log_penjualan: true, list_office: true, user_management: true,
                    activity_logs: true, backup_database: true,
                    export_excel: true, import_excel: true, edit_data: true, delete_data: true, cetak_nota: true
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
                    list_laptop: true, laptop_display: true, inventaris: false, master_jasa: false, katalog_produk: false, log_penjualan: false, list_office: false, user_management: false,
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
                    list_laptop: true, laptop_display: true, inventaris: true, master_jasa: true, katalog_produk: true, log_penjualan: true, list_office: true, user_management: true,
                    activity_logs: true, backup_database: true,
                    export_excel: true, import_excel: true, edit_data: true, delete_data: true
                };
            } else {
                window.currentUser.name = user.email.split('@')[0];
                window.currentUser.role = 'teknisi';
                window.currentUser.branch = 'Head Office';
                window.currentUser.permissions = {
                    dashboard: false, services: false, penyewaan: false, cctv: false,
                    list_laptop: true, laptop_display: true, inventaris: false, master_jasa: false, katalog_produk: false, log_penjualan: false, list_office: false, user_management: false,
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

        window.globalDataCloud = {
            services: [],
            penyewaan: [],
            cctv: [],
            list_laptop: [],
            laptop_display: [],
            inventaris: [],
            master_jasa: [],
            katalog_produk: [],
            log_penjualan: [],
            list_office: [],
            user_management: [],
            activity_logs: []
        };
        window.currentPage = 1;

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

// Fungsi pembantu mengekstrak spesifikasi display laptop harian
function parseDisplaySpecs(spekStr) {
    let cpu = '';
    let ram = '';
    let ssd = '';
    let vga = '';
    if (spekStr) {
        const lines = spekStr.split('\n');
        lines.forEach(line => {
            const clean = line.trim();
            if (/^cpu:/i.test(clean)) {
                cpu = clean.replace(/^cpu:\s*/i, '').trim();
            } else if (/^ram:/i.test(clean)) {
                ram = clean.replace(/^ram:\s*/i, '').trim();
            } else if (/^(ssd\/hdd|storage):/i.test(clean)) {
                ssd = clean.replace(/^(ssd\/hdd|storage):\s*/i, '').trim();
            } else if (/^(vga\/layar|vga|layar):/i.test(clean)) {
                vga = clean.replace(/^(vga\/layar|vga|layar):\s*/i, '').trim();
            }
        });
    }
    return { cpu, ram, ssd, vga };
}

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
    if (window.syncHamburgerIcon) window.syncHamburgerIcon();

    const allnodes = ['services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'inventaris', 'master_jasa', 'katalog_produk', 'log_penjualan', 'list_office','user_management', 'activity_logs'];
    // --- KODE BARU (Bebas Galat & Sesuai Hak Akses) ---
    allnodes.forEach(node => {
        if (!db) return;
        
        // Periksa izin dasar untuk node saat ini
        let permitSync = isPermitted(perms[node]);

        // PILAR INTEGRASI: Izinkan sinkronisasi latar belakang jika ada ketergantungan (dependency)
        // 1. Katalog Produk diperlukan untuk input "Bahan" di Log Services dan Log Penjualan
        if (node === 'katalog_produk' && (isPermitted(perms.services) || isPermitted(perms.log_penjualan))) {
            permitSync = true;
        }

        // 2. Master Jasa diperlukan untuk input "Jasa" di Log Services
        if (node === 'master_jasa' && isPermitted(perms.services)) {
            permitSync = true;
        }

        // Aturan khusus untuk user_management
        if (node === 'user_management' && !isPermitted(perms.user_management)) {
            permitSync = false;
        }

        // Jika tidak diizinkan sinkronisasi, hentikan proses untuk node ini
        if (!permitSync) {
            return; 
        }

        let nodeRef;
        const branch = window.currentUser.branch;
        const role = window.currentUser.role;
        const email = window.currentUser.email;

        const isAdmin = (email === 'superadmin@wanasatria.com' || role === 'admin');
        const hasBranchRestriction = (branch && branch !== 'Head Office' && email !== 'superadmin@wanasatria.com');

        // Modul-modul yang datanya disaring spesifik berdasarkan cabang operator
        const filterableNodes = ['services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'inventaris', 'katalog_produk', 'log_penjualan'];

        if (filterableNodes.includes(node) && !isAdmin && hasBranchRestriction) {
            nodeRef = query(ref(db, node), orderByChild('cabang'), equalTo(branch));
        } else {
            nodeRef = ref(db, node);
        }

        const unsubscribe = onValue(nodeRef, (snapshot) => {
            const value = snapshot.val();
            window.globalDataCloud[node] = value ? Object.keys(value).map(key => ({ _firebaseKey: key, ...value[key] })) : [];
            
            updateDynamicDatalists();

            if (window.currentTab === node) {
                if (window.renderTable) window.renderTable(); 
            }
            if ((node === 'katalog_produk' || node === 'laptop_display') && window.currentTab === 'log_penjualan') {
                window.populatePenjualanCart();
            }
            if (node === 'list_laptop' || node === 'laptop_display') {
                if (window.updateDashboardBranchFilters) window.updateDashboardBranchFilters();
            }

            // Memicu pembaruan filter sekunder dinamis ketika data Cloud sinkron
            const nodesWithFilters = ['list_laptop', 'laptop_display', 'services', 'inventaris', 'list_office', 'activity_logs'];
            if (nodesWithFilters.includes(node)) {
                if (window.updateSecondaryFilterDropdown) window.updateSecondaryFilterDropdown();
            }
            if (node === 'list_office') {
                try { refreshServerOptions(); } catch(e) { }
            }
            if (node === 'list_laptop' && window.currentTab === 'penyewaan') {
                if (window.populateLaptopCheckboxes) window.populateLaptopCheckboxes();
            }
            const dashModal = document.getElementById('dashboard-modal');
            if (dashModal && !dashModal.classList.contains('hidden')) {
                if (window.calculateAndRenderStats) window.calculateAndRenderStats();
            }
        }, (error) => {
            console.error(`Gagal menyinkronkan data real-time pada node [${node}]:`, error);
        });

        activeFirebaseListeners.push(unsubscribe);
    });
}

window.refreshServerOptions = refreshServerOptions;
function refreshServerOptions() {
    const serverSelect = document.getElementById('server-utama-select');
    if (!serverSelect) return;

    const master = window.globalDataCloud['list_office'] || [];
    const utamaAccounts = master.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'utama');

    if (utamaAccounts.length === 0) {
        serverSelect.innerHTML = `<option value="">-- Tidak ada Server Utama terdaftar --</option>`;
        return;
    }

    const options = utamaAccounts.map(utama => {
        const email = utama?.akun || '';
        const anggotaCount = master.filter(it => (it?.server_utama || '') === email && (it?.tipe_akun || '').toString().toLowerCase() === 'anggota').length;
        const slotsLeft = Math.max(0, 5 - anggotaCount);
        if (slotsLeft > 0) {
            return `<option value="${escapeHtml(email)}">${escapeHtml(email)} (Sisa ${slotsLeft} Slot)</option>`;
        }
        return ''; 
    }).filter(Boolean).join('');

    if (options === '') {
        serverSelect.innerHTML = `<option value="">-- Semua Server Utama FULL (Penuh) --</option>`;
    } else {
        serverSelect.innerHTML = `<option value="">(Pilih Server Utama)</option>` + options;
    }
}

function refreshServerFilterOptions() {
    const serverSelect = document.getElementById('server-filter');
    if (!serverSelect) return;

    const master = window.globalDataCloud['list_office'] || [];
    const utamaAccounts = master.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'utama');

    let html = '<option value="">Semua Server</option>';
    utamaAccounts.forEach(utama => {
        const email = utama?.akun || ''; 
        const anggotaCount = master.filter(it => (it?.server_utama || '') === email && (it?.tipe_akun || '').toString().toLowerCase() === 'anggota').length;
        html += `<option value="${escapeHtml(email)}">${escapeHtml(email)} (${anggotaCount} anggota)</option>`;
    });
    serverSelect.innerHTML = html;

    serverSelect.value = window.currentServerFilter || '';
    serverSelect.onchange = () => {
        window.currentServerFilter = serverSelect.value || '';
        if (window.resetPaginationAndRender) window.resetPaginationAndRender();
        window.updateFilterBadgeCount();
    };
}

// ==========================================================================
// D. HELPER KERANJANG BELANJA LOG PENJUALAN
// ==========================================================================

window.populatePenjualanCart = function() {
    const container = document.getElementById('keranjang-penjualan-container');
    if (!container) return;

    // Mendapatkan cabang transaksi aktif di form
    const form = document.getElementById('operational-form');
    const branchSelect = form ? form.querySelector('[name="cabang"]') : null;
    const selectedBranch = branchSelect ? branchSelect.value : '';

    let katalog = window.globalDataCloud['katalog_produk'] || [];
    let displays = window.globalDataCloud['laptop_display'] || [];

    // Menyaring data katalog dan display berdasarkan cabang transaksi
    if (selectedBranch) {
        katalog = katalog.filter(item => item.cabang === selectedBranch);
        displays = displays.filter(item => item.cabang === selectedBranch);
    }

    if (katalog.length === 0 && displays.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-4">Katalog produk dan display kosong pada cabang ini</p>`;
        return;
    }

    const searchInput = document.getElementById('search-katalog-produk');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    // 1. Petakan Katalog Produk
    const mappedProducts = katalog.map(item => ({
        _firebaseKey: item._firebaseKey,
        nama_barang: item.nama_barang || '-',
        harga_jual: Number(item.harga_jual) || 0,
        stok: Number(item.stok) || 0,
        satuan: item.satuan || 'Pcs',
        kategori: item.kategori || 'Produk',
        isDisplay: false
    }));

    // 2. Akumulasi & Kelompokkan Laptop Display (Name + CPU + RAM + SSD + VGA/Layar)
    const laptopGroups = {};
    displays.forEach(item => {
        const isReady = (item.status === 'Ready' || !item.status);
        if (!isReady) return; // Hanya tampilkan unit display yang siap dijual

        const name = `${item.merk || ''} ${item.tipe || ''}`.trim() || 'Laptop Display';
        const specs = parseDisplaySpecs(item.spek_singkat || '');
        const groupKey = `${name}_${specs.cpu}_${specs.ram}_${specs.ssd}_${specs.vga}`.toLowerCase();

        if (!laptopGroups[groupKey]) {
            laptopGroups[groupKey] = {
                _firebaseKeys: [],
                nama_barang: name,
                harga_jual: Number(item.harga_jual) || 0,
                cpu: specs.cpu,
                ram: specs.ram,
                ssd: specs.ssd,
                vga: specs.vga,
                satuan: 'Unit',
                kategori: 'Laptop Display',
                isDisplay: true
            };
        }
        laptopGroups[groupKey]._firebaseKeys.push(item._firebaseKey);
    });

    const mappedLaptops = Object.values(laptopGroups).map(group => ({
        _firebaseKey: group._firebaseKeys[0], // Ambil key pertama sebagai rujukan checklist
        _firebaseKeys: group._firebaseKeys,
        nama_barang: group.nama_barang,
        harga_jual: group.harga_jual,
        stok: group._firebaseKeys.length, // Total kuantitas unit ready
        satuan: group.satuan,
        kategori: group.kategori,
        isDisplay: true,
        cpu: group.cpu,
        ram: group.ram,
        ssd: group.ssd,
        vga: group.vga
    }));

    const unifiedList = [...mappedProducts, ...mappedLaptops];

    // Saring data berdasarkan kata kunci (pencarian spesifikasi cerdas terintegrasi)
    const filtered = unifiedList.filter(item => {
        const searchTarget = item.isDisplay 
            ? `${item.nama_barang} ${item.cpu} ${item.ram} ${item.ssd} ${item.vga}`.toLowerCase()
            : `${item.nama_barang} ${item.kategori}`.toLowerCase();
        return searchTarget.includes(query);
    });

    let displayHtml = '';
    let productHtml = '';

    filtered.forEach(item => {
        const isChecked = window.selectedPenjualanItems.some(it => it.productKey === item._firebaseKey);
        const qtyObj = window.selectedPenjualanItems.find(it => it.productKey === item._firebaseKey);
        const qtyVal = qtyObj ? qtyObj.qty : 1;
        const isOutOfStock = (Number(item.stok) || 0) <= 0;

        if (item.isDisplay) {
            const specsInline = [item.cpu, item.ram, item.ssd, item.vga].filter(Boolean).join(' | ');
            const specsText = specsInline ? `<span class="block text-[10px] text-slate-500 font-mono italic mt-0.5 mb-0.5">${escapeHtml(specsInline)}</span>` : '';
            
            displayHtml += `
                <div class="flex items-start justify-between p-2.5 bg-white border border-slate-200 rounded-lg hover:border-cyan-300 transition text-xs">
                    <div class="flex items-start space-x-2.5">
                        <input type="checkbox" data-key="${item._firebaseKey}" data-name="${escapeHtml(item.nama_barang)}" data-price="${item.harga_jual}" ${isChecked ? 'checked' : ''} ${isOutOfStock ? 'disabled' : ''} onchange="window.togglePenjualanItem(this)" class="mt-1 rounded text-cyan-600 focus:ring-cyan-500">
                        <div>
                            <span class="font-bold text-slate-800">${escapeHtml(item.nama_barang)}</span>
                            <span class="px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded text-[10px] font-bold border ml-1">${escapeHtml(item.kategori)}</span>
                            ${specsText}
                            <span class="block text-[11px] text-slate-500 mt-0.5">
                                Stok: <span class="font-extrabold ${isOutOfStock ? 'text-rose-600' : 'text-emerald-600'}">${item.stok} ${escapeHtml(item.satuan)}</span> | Harga: <span class="font-bold text-slate-700">Rp ${Number(item.harga_jual).toLocaleString('id-ID')}</span>
                            </span>
                        </div>
                    </div>
                    ${isChecked ? `
                        <div class="flex items-center space-x-1">
                            <span class="text-[10px] text-slate-400 font-bold uppercase mr-1">Qty</span>
                            <input type="number" min="1" max="${item.stok}" value="${qtyVal}" data-key="${item._firebaseKey}" oninput="window.updatePenjualanQty(this)" class="w-14 border border-gray-300 rounded p-1 text-center font-bold bg-white">
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            productHtml += `
                <div class="flex items-start justify-between p-2.5 bg-white border border-slate-200 rounded-lg hover:border-cyan-300 transition text-xs">
                    <div class="flex items-start space-x-2.5">
                        <input type="checkbox" data-key="${item._firebaseKey}" data-name="${escapeHtml(item.nama_barang)}" data-price="${item.harga_jual}" ${isChecked ? 'checked' : ''} ${isOutOfStock ? 'disabled' : ''} onchange="window.togglePenjualanItem(this)" class="mt-1 rounded text-cyan-600 focus:ring-cyan-500">
                        <div>
                            <span class="font-bold text-slate-800">${escapeHtml(item.nama_barang)}</span>
                            <span class="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[10px] font-bold border ml-1">${escapeHtml(item.kategori)}</span>
                            <span class="block text-[11px] text-slate-500 mt-0.5">
                                Stok: <span class="font-extrabold ${isOutOfStock ? 'text-rose-600' : 'text-emerald-600'}">${item.stok} ${escapeHtml(item.satuan)}</span> | Harga: <span class="font-bold text-slate-700">Rp ${Number(item.harga_jual).toLocaleString('id-ID')}</span>
                            </span>
                        </div>
                    </div>
                    ${isChecked ? `
                        <div class="flex items-center space-x-1">
                            <span class="text-[10px] text-slate-400 font-bold uppercase mr-1">Qty</span>
                            <input type="number" min="1" max="${item.stok}" value="${qtyVal}" data-key="${item._firebaseKey}" oninput="window.updatePenjualanQty(this)" class="w-14 border border-gray-300 rounded p-1 text-center font-bold bg-white">
                        </div>
                    ` : ''}
                </div>
            `;
        }
    });

    let finalHtml = '';
    if (displayHtml) {
        finalHtml += `
            <div class="px-3 py-1.5 bg-purple-50 text-purple-700 font-extrabold text-[10px] uppercase tracking-wider rounded-lg mb-2 border border-purple-200/50 select-none">
                ── LAPTOP DISPLAY ─────────────────────────
            </div>
            <div class="space-y-2 mb-4">${displayHtml}</div>
        `;
    }
    if (productHtml) {
        finalHtml += `
            <div class="px-3 py-1.5 bg-cyan-50 text-cyan-700 font-extrabold text-[10px] uppercase tracking-wider rounded-lg mb-2 border border-cyan-200/50 select-none">
                ── KATALOG PRODUK ─────────────────────────
            </div>
            <div class="space-y-2">${productHtml}</div>
        `;
    }

    if (!displayHtml && !productHtml) {
        finalHtml = `<p class="text-xs text-slate-400 italic text-center py-4">Produk tidak ditemukan pada cabang ini</p>`;
    }

    container.innerHTML = finalHtml;
};

window.togglePenjualanItem = function(checkbox) {
    const productKey = checkbox.getAttribute('data-key');
    const name = checkbox.getAttribute('data-name');
    const price = Number(checkbox.getAttribute('data-price')) || 0;

    if (checkbox.checked) {
        if (!window.selectedPenjualanItems.some(it => it.productKey === productKey)) {
            window.selectedPenjualanItems.push({ productKey, name, qty: 1, price });
        }
    } else {
        window.selectedPenjualanItems = window.selectedPenjualanItems.filter(it => it.productKey !== productKey);
    }
    window.populatePenjualanCart();
};

window.updatePenjualanQty = function(input) {
    const productKey = input.getAttribute('data-key');
    const val = Math.max(1, Number(input.value) || 1);
    const obj = window.selectedPenjualanItems.find(it => it.productKey === productKey);
    if (obj) {
        obj.qty = val;
    }
};

//Filter 

window.updateSecondaryFilterDropdown = function() {
    const select = document.getElementById('secondary-filter');
    const label = document.getElementById('secondary-filter-label');
    const container = document.getElementById('secondary-filter-container');
    if (!select || !label || !container) return;

    const currentTab = window.currentTab;

    // Reset default
    container.classList.add('hidden');
    select.innerHTML = '<option value="">Semua</option>';

    let uniqueValues = new Set();
    let labelText = "Filter Tambahan";
    let defaultOptionText = "Semua";

    // 1. Kondisi Tab Laptop Gudang / Penyewaan (Hanya mengambil dari list_laptop)
    if (currentTab === 'list_laptop') {
        container.classList.remove('hidden');
        labelText = "Tipe Laptop";
        defaultOptionText = "Semua Tipe Laptop";
        
        const list = window.globalDataCloud['list_laptop'] || [];
        list.forEach(lap => {
            const merk = (lap.merk || '').trim();
            const tipe = (lap.tipe || '').trim();
            if (merk && tipe && merk !== '-' && tipe !== '-') {
                uniqueValues.add(`${merk} ${tipe}`);
            }
        });
    }
    // 2. Kondisi Tab Laptop Display (Hanya mengambil dari laptop_display)
    else if (currentTab === 'laptop_display') {
        container.classList.remove('hidden');
        labelText = "Tipe Laptop";
        defaultOptionText = "Semua Tipe Laptop";
        
        const list = window.globalDataCloud['laptop_display'] || [];
        list.forEach(lap => {
            const merk = (lap.merk || '').trim();
            const tipe = (lap.tipe || '').trim();
            if (merk && tipe && merk !== '-' && tipe !== '-') {
                uniqueValues.add(`${merk} ${tipe}`);
            }
        });
    }
    // 3. Kondisi Tab Log Services (Hanya mengambil perangkat dari pelanggan aktif)
    else if (currentTab === 'services') {
        container.classList.remove('hidden');
        labelText = "Perangkat Pelanggan";
        defaultOptionText = "Semua Perangkat";
        
        const list = window.globalDataCloud['services'] || [];
        list.forEach(item => {
            const perangkat = (item.perangkat || '').trim();
            if (perangkat && perangkat !== '-') {
                uniqueValues.add(perangkat);
            }
        });
    }
    // 4. Kondisi Tab Inventaris
    else if (currentTab === 'inventaris') {
        container.classList.remove('hidden');
        labelText = "Kategori Barang";
        defaultOptionText = "Semua Kategori";
        
        const list = window.globalDataCloud['inventaris'] || [];
        list.forEach(item => {
            if (item.kategori && item.kategori.trim()) {
                uniqueValues.add(item.kategori.trim());
            }
        });
    } 
    // 5. Kondisi Tab Office
    else if (currentTab === 'list_office') {
        container.classList.remove('hidden');
        labelText = "Tipe Akun";
        defaultOptionText = "Semua Tipe Akun";
        uniqueValues.add("Utama");
        uniqueValues.add("Anggota");
        uniqueValues.add("Personal");
    } 
    // 6. Kondisi Tab Log Aktivitas
    else if (currentTab === 'activity_logs') {
        container.classList.remove('hidden');
        labelText = "Modul Terkait";
        defaultOptionText = "Semua Modul";
        
        const list = window.globalDataCloud['activity_logs'] || [];
        list.forEach(item => {
            if (item.menu_display && item.menu_display.trim()) {
                uniqueValues.add(item.menu_display.trim());
            }
        });
    }

    // Jika filter ini ditampilkan, perbarui teks label dan isinya
    if (!container.classList.contains('hidden')) {
        label.innerText = labelText;
        const sortedValues = Array.from(uniqueValues).sort();
        let html = `<option value="">${defaultOptionText}</option>`;
        sortedValues.forEach(val => {
            html += `<option value="${val}">${val}</option>`;
        });

        const previousSelection = select.value;
        select.innerHTML = html;
        select.value = previousSelection;
    }
};

// Bind fungsi pembantu ke window agar diakses file table.js / opname.js / forms.js / excel.js / admin-utils.js
window.logActivity = logActivity;
window.showToast = showToast;
window.showTableLoading = showTableLoading;
window.buildInventarisCategoryOptions = buildInventarisCategoryOptions;
window.buildInventarisUnitOptions = buildInventarisUnitOptions;
window.generateInventarisSku = generateInventarisSku;
window.refreshInventarisFieldOptions = refreshInventarisFieldOptions;
window.applyBranchFieldRules = applyBranchFieldRules;

window.handleLoginSubmit = function(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btnText = document.getElementById('btn-login-text');

    if (btnText) {
        btnText.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> Memverifikasi...`;
        btnText.disabled = true;
    }

    firebaseLogin(email, password)
        .then(() => {
            if (window.showToast) window.showToast("Berhasil masuk!");
        })
        .catch((error) => {
            alert("Gagal masuk: " + error.message);
            if (btnText) {
                btnText.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Verifikasi & Masuk`;
                btnText.disabled = false;
            }
        });
};