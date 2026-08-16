/* ==========================================================================
   Teknisi Portal - ui-handlers.js (Modul Navigasi, Dropdown & Kontrol UI)
   ========================================================================== */

// --- FUNGSI UNIVERSAL UNTUK MENUTUP SEMUA PANEL MELAYANG (MUTUAL EXCLUSION) ---
function closeAllFloatingPanels(exceptId = '') {
    const userMenu = document.getElementById('user-dropdown-menu');
    const utilityMenu = document.getElementById('utility-dropdown-menu');
    const filterPanel = document.getElementById('filter-popover-panel');

    if (userMenu && exceptId !== 'user-dropdown-menu') {
        userMenu.classList.add('hidden');
    }
    if (utilityMenu && exceptId !== 'utility-dropdown-menu') {
        utilityMenu.classList.add('hidden');
    }
    if (filterPanel && exceptId !== 'filter-popover-panel') {
        filterPanel.classList.add('hidden');
    }

    // Tutup juga seluruh dropdown aksi baris tabel jika ada yang terbuka
    const rowDropdowns = document.querySelectorAll('.row-action-dropdown');
    rowDropdowns.forEach(dropdown => {
        dropdown.classList.add('hidden');
    });
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

function toggleUserDropdown(event) {
    if (event) event.stopPropagation();
    
    // Tutup panel melayang lain sebelum membuka menu user
    closeAllFloatingPanels('user-dropdown-menu');
    
    const dropdown = document.getElementById('user-dropdown-menu');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

function toggleUtilityDropdown(event) {
    if (event) event.stopPropagation();
    
    // Tutup panel melayang lain sebelum membuka menu utilitas
    closeAllFloatingPanels('utility-dropdown-menu');
    
    const dropdown = document.getElementById('utility-dropdown-menu');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

// ==========================================================================
// PENGENDALIAN MODAL PILIHAN EKSPOR HYBRID
// ==========================================================================
function openExportOptionModal() {
    const modal = document.getElementById('export-option-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeExportOptionModal() {
    const modal = document.getElementById('export-option-modal');
    if (modal) modal.classList.add('hidden');
}

function triggerExport(isCompatibleForImport) {
    // Jalankan fungsi ekspor bawaan excel.js dengan filter parameter yang dipilih
    if (window.exportToExcel) {
        window.exportToExcel(isCompatibleForImport);
    }
    closeExportOptionModal();
}

// Ikat fungsi ke lingkup window agar dapat dieksekusi oleh elemen HTML
window.openExportOptionModal = openExportOptionModal;
window.closeExportOptionModal = closeExportOptionModal;
window.triggerExport = triggerExport;

/* ==========================================================================
   FUNGSI POPOVER & FILTER DATA TERPADU
   ========================================================================== */

function toggleFilterPanel(event) {
    if (event) event.stopPropagation();
    
    // Tutup panel melayang lain sebelum membuka popover filter
    closeAllFloatingPanels('filter-popover-panel');
    
    const panel = document.getElementById('filter-popover-panel');
    if (panel) {
        panel.classList.toggle('hidden');
    }
}

function updateFilterBadgeCount() {
    const branchEl = document.getElementById('branch-filter');
    const statusEl = document.getElementById('status-filter');
    const serverEl = document.getElementById('server-filter');
    const typeEl = document.getElementById('secondary-filter');
    
    const badge = document.getElementById('filter-active-count');
    if (!badge) return;

    let activeCount = 0;

    // Hitung filter cabang jika aktif
    const branchContainer = document.getElementById('branch-filter-container');
    if (branchContainer && !branchContainer.classList.contains('hidden')) {
        if (branchEl && branchEl.value) activeCount++;
    }

    // Hitung filter status jika dipilih
    if (statusEl && statusEl.value) activeCount++;

    // Hitung filter server utama jika aktif
    const serverContainer = document.getElementById('server-filter-container');
    if (serverContainer && !serverContainer.classList.contains('hidden')) {
        if (serverEl && serverEl.value) activeCount++;
    }

    // Hitung filter tipe laptop / kategori sekunder jika aktif
    const typeContainer = document.getElementById('secondary-filter-container');
    if (typeContainer && !typeContainer.classList.contains('hidden')) {
        if (typeEl && typeEl.value) activeCount++;
    }

    // Perbarui lencana visual
    if (activeCount > 0) {
        badge.innerText = activeCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function resetAllFilters() {
    const branchEl = document.getElementById('branch-filter');
    const statusEl = document.getElementById('status-filter');
    const serverEl = document.getElementById('server-filter');
    const typeEl = document.getElementById('secondary-filter');

    if (branchEl) branchEl.value = '';
    if (statusEl) statusEl.value = '';
    if (serverEl) serverEl.value = '';
    if (typeEl) typeEl.value = '';
    
    window.currentServerFilter = ''; // Reset filter server global

    updateFilterBadgeCount();
    if (window.resetPaginationAndRender) window.resetPaginationAndRender();
}

// --- FUNGSI TOGGLE DROPDOWN MENU AKSI BARIS TABEL (SERVICES) ---
function toggleRowActionDropdown(event, firebaseKey) {
    if (event) event.stopPropagation();
    
    // Tutup seluruh panel melayang navigasi luar
    closeAllFloatingPanels();

    // Sembunyikan seluruh dropdown baris lain yang mungkin sedang aktif
    const allRowDropdowns = document.querySelectorAll('.row-action-dropdown');
    allRowDropdowns.forEach(dropdown => {
        if (dropdown.id !== `srv-action-dropdown-${firebaseKey}`) {
            dropdown.classList.add('hidden');
        }
    });

    // Toggle status dropdown baris target
    const targetDropdown = document.getElementById(`srv-action-dropdown-${firebaseKey}`);
    if (targetDropdown) {
        targetDropdown.classList.toggle('hidden');
    }
}

// Sensor penutupan dropdown jika pengguna mengeklik di luar area menu
window.addEventListener('click', function(e) {
    const userDropdown = document.getElementById('user-dropdown-menu');
    const userButton = document.getElementById('user-menu-button');
    if (userDropdown && !userDropdown.classList.contains('hidden')) {
        if (!userDropdown.contains(e.target) && (!userButton || !userButton.contains(e.target))) {
            userDropdown.classList.add('hidden');
        }
    }
    // TAMBAHKAN INI: Pendeteksi klik di luar menu dropdown mode tanggal servisan
    const srvDateDropdown = document.getElementById('services-date-mode-dropdown');
    const srvDateBtn = e.target.closest('button[onclick*="toggleServicesDateModeDropdown"]');
    if (srvDateDropdown && !srvDateDropdown.classList.contains('hidden')) {
        if (!srvDateDropdown.contains(e.target) && !srvDateBtn) {
            srvDateDropdown.classList.add('hidden');
        }
    }

    const utilityDropdown = document.getElementById('utility-dropdown-menu');
    const utilityButton = document.getElementById('utility-menu-button');
    if (utilityDropdown && !utilityDropdown.classList.contains('hidden')) {
        if (!utilityDropdown.contains(e.target) && (!utilityButton || !utilityButton.contains(e.target))) {
            utilityDropdown.classList.add('hidden');
        }
    }

    const filterPanel = document.getElementById('filter-popover-panel');
    const filterBtn = document.getElementById('filter-trigger-btn');
    if (filterPanel && !filterPanel.classList.contains('hidden')) {
        if (!filterPanel.contains(e.target) && (!filterBtn || !filterBtn.contains(e.target))) {
            filterPanel.classList.add('hidden');
        }
    }

    // Pendeteksi klik di luar menu dropdown jenis unit (agar otomatis menutup)
    const unitTypeDropdown = document.getElementById('unit-type-dropdown-menu');
    const unitTypeBtn = e.target.closest('button[onclick*="toggleUnitTypeDropdown"]');
    if (unitTypeDropdown && !unitTypeDropdown.classList.contains('hidden')) {
        if (!unitTypeDropdown.contains(e.target) && !unitTypeBtn) {
            unitTypeDropdown.classList.add('hidden');
        }
    }

    // Klik di luar baris aksi dropdown juga akan menyembunyikan semua dropdown baris aktif
    const activeRowDropdowns = document.querySelectorAll('.row-action-dropdown');
    activeRowDropdowns.forEach(dropdown => {
        if (!dropdown.classList.contains('hidden')) {
            const parentTd = dropdown.closest('td');
            if (parentTd && !parentTd.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        }
    });
});
// --- FUNGSI TOGGLE FORM SPESIFIKASI (LAPTOP VS PRINTER) ---
window.toggleJenisUnitForm = function(jenis) {
    const specLaptop = document.getElementById('spec-laptop-container');
    const specPrinter = document.getElementById('spec-printer-container');
    if (!specLaptop || !specPrinter) return;

    if (jenis === 'Printer') {
        specLaptop.classList.add('hidden');
        specPrinter.classList.remove('hidden');
    } else {
        specPrinter.classList.add('hidden');
        specLaptop.classList.remove('hidden');
    }
};

// --- FUNGSI BUKA/TUTUP DROPDOWN GELAP (SEPERTI GAMBAR 1) ---
window.toggleUnitTypeDropdown = function(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('unit-type-dropdown-menu');
    if (menu) {
        menu.classList.toggle('hidden');
    }
};

// --- FUNGSI SAAT PILIH UNIT DARI MENU DROPDOWN ---
window.selectUnitType = function(type) {
    const hiddenInput = document.getElementById('input-jenis-unit');
    const btnLabel = document.getElementById('unit-type-btn-label');
    const menu = document.getElementById('unit-type-dropdown-menu');

    if (hiddenInput) hiddenInput.value = type;

    if (btnLabel) {
        btnLabel.innerHTML = (type === 'Printer') 
            ? `<span>🖨️ Printer</span>` 
            : `<span>💻 Laptop</span>`;
    }

    if (menu) menu.classList.add('hidden');

    if (window.toggleJenisUnitForm) {
        window.toggleJenisUnitForm(type);
    }
};

// --- FUNGSI MEMASANG TOMBOL KAPSUL DI POJOK KANAN HEADER FORM ---
window.renderFormHeaderAction = function() {
    const headerAction = document.getElementById('form-header-action');
    if (!headerAction) return;

    // 1. KONTROL MODE UNIT PENYEWAAN (LAPTOP VS PRINTER)
    if (window.currentTab === 'list_laptop') {
        const currentVal = document.getElementById('input-jenis-unit')?.value || 'Laptop';
        headerAction.innerHTML = `
            <div class="relative inline-block text-left">
                <button type="button" onclick="window.toggleUnitTypeDropdown(event)" class="bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-800 px-3.5 py-1.5 rounded-full text-xs font-bold transition shadow-sm flex items-center gap-2 cursor-pointer">
                    <span id="unit-type-btn-label">${currentVal === 'Printer' ? '🖨️ Printer' : '💻 Laptop'}</span>
                    <i class="fa-solid fa-chevron-down text-[10px] text-cyan-400"></i>
                </button>
                
                <div id="unit-type-dropdown-menu" class="hidden absolute right-0 mt-2 w-40 origin-top-right rounded-2xl bg-white shadow-xl border border-slate-200 p-1.5 z-50 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                    <button type="button" onclick="window.selectUnitType('Laptop')" class="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition flex items-center gap-2 cursor-pointer">
                        <span>💻 Laptop</span>
                    </button>
                    <button type="button" onclick="window.selectUnitType('Printer')" class="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition flex items-center gap-2 cursor-pointer">
                        <span>🖨️ Printer</span>
                    </button>
                </div>
            </div>
        `;
    } 
    // 2. KONTROL DUA MODE LOG SERVIS (KHUSUS ADMIN & SUPERADMIN)
    else if (window.currentTab === 'services') {
        const isSuperadmin = (window.currentUser && window.currentUser.email === 'superadmin@wanasatria.com');
        const isAdmin = (window.currentUser && String(window.currentUser.role || '').toLowerCase() === 'admin');
        const canAccessManualDate = isSuperadmin || isAdmin;

        // JIKA BUKAN ADMIN / SUPERADMIN -> KOSONGKAN (TOMBOL TIDAK MUNCUL)
        if (!canAccessManualDate) {
            headerAction.innerHTML = '';
            return;
        }

        // JIKA ADMIN / SUPERADMIN -> MUNCULKAN TOMBOL KAPSUL
        headerAction.innerHTML = `
            <div class="relative inline-block text-left">
                <button type="button" onclick="window.toggleServicesDateModeDropdown(event)" class="bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-800 px-3.5 py-1.5 rounded-full text-xs font-bold transition shadow-sm flex items-center gap-2 cursor-pointer">
                    <span id="services-date-mode-label">⚡ Mode Otomatis</span>
                    <i class="fa-solid fa-chevron-down text-[10px] text-cyan-400"></i>
                </button>
                
                <div id="services-date-mode-dropdown" class="hidden absolute right-0 mt-2 w-52 origin-top-right rounded-2xl bg-white shadow-xl border border-slate-200 p-1.5 z-50 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                    <button type="button" onclick="window.selectServicesDateMode('otomatis')" class="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition flex items-center gap-2 cursor-pointer">
                        <span>⚡ Mode Otomatis (Hari Ini)</span>
                    </button>
                    <button type="button" onclick="window.selectServicesDateMode('manual')" class="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition flex items-center gap-2 cursor-pointer">
                        <span>📅 Mode Manual (Pilih Tanggal)</span>
                    </button>
                </div>
            </div>
        `;
    } 
    else {
        headerAction.innerHTML = '';
    }
};

// --- FUNGSI BUKA / TUTUP DROPDOWN MODE TANGGAL SERVIS (ADMIN) ---
window.toggleServicesDateModeDropdown = function(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('services-date-mode-dropdown');
    if (menu) {
        menu.classList.toggle('hidden');
    }
};

// --- FUNGSI SAAT ADMIN MEMILIH MODE (OTOMATIS VS MANUAL) ---
window.selectServicesDateMode = function(mode) {
    const container = document.getElementById('services-tanggal-container');
    const label = document.getElementById('services-date-mode-label');
    const menu = document.getElementById('services-date-mode-dropdown');
    const dateInput = document.querySelector('#form-fields input[name="tanggal"]');

    if (menu) menu.classList.add('hidden');

    if (mode === 'manual') {
        // Tampilkan kolom tanggal untuk input manual
        if (container) container.classList.remove('hidden');
        if (label) label.innerHTML = `<span>📅 Mode Manual</span>`;
        if (dateInput) dateInput.focus();
    } else {
        // Sembunyikan kolom tanggal (kembali ke otomatis hari ini)
        if (container) container.classList.add('hidden');
        if (label) label.innerHTML = `<span>⚡ Mode Otomatis</span>`;
        if (dateInput) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dateInput.value = `${yyyy}-${mm}-${dd}`;
        }
    }
};

// Daftarkan ke window agar langsung dipanggil oleh atribut HTML
window.toggleSidebar = toggleSidebar;
window.toggleMobileMenu = toggleSidebar;
window.syncHamburgerIcon = syncHamburgerIcon;
window.toggleUserDropdown = toggleUserDropdown;
window.toggleUtilityDropdown = toggleUtilityDropdown;
window.toggleFilterPanel = toggleFilterPanel;
window.updateFilterBadgeCount = updateFilterBadgeCount;
window.resetAllFilters = resetAllFilters;
window.toggleRowActionDropdown = toggleRowActionDropdown;

