/* ==========================================================================
   Teknisi Portal - opname.js (Modul Stok Opname / Audit Fisik)
   ========================================================================== */
import { db, ref, update } from './firebase-config.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function openOpnameModal() {
    const filterEl = document.getElementById('opname-branch-filter');
    const searchEl = document.getElementById('opname-search-bar'); 
    const titleEl = document.getElementById('opname-title');
    const modal = document.getElementById('opname-modal');
    
    if (!modal || !filterEl) return;

    if (searchEl) searchEl.value = '';

    if (window.currentTab === 'list_laptop') {
        titleEl.innerText = "Stok Opname: Master Laptop Gudang";
    } else if (window.currentTab === 'laptop_display') {
        titleEl.innerText = "Stok Opname: Laptop Display (Etalase)";
    } else if (window.currentTab === 'inventaris') {
        titleEl.innerText = "Stok Opname: Inventaris Suku Cadang, Alat & Part";
    } else {
        if (window.showToast) window.showToast("Stok Opname hanya didukung untuk tab Laptop / Inventaris.", "warning");
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
    renderOpnameItems(true); 
}

function closeOpnameModal() {
    const modal = document.getElementById('opname-modal');
    if (modal) modal.classList.add('hidden');
}

function renderOpnameItems(isFullRebuild = false) {
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

        const rawData = window.globalDataCloud[window.currentTab] || [];
        let items = [];

        if (selectedBranch === 'Semua') {
            items = rawData;
        } else {
            items = rawData.filter(item => item.cabang === selectedBranch);
        }

        if (window.currentTab === 'list_laptop') {
            items = items.filter(item => ['Tersedia', 'Disewa', 'Maintenance', 'Staf'].includes(item.status));
        } else if (window.currentTab === 'laptop_display') {
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

            if (window.currentTab === 'list_laptop' || window.currentTab === 'laptop_display') {
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
            } else if (window.currentTab === 'inventaris') {
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
}

function submitOpname() {
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

    if (window.currentTab === 'list_laptop' || window.currentTab === 'laptop_display') {
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
                const targetStatus = window.currentTab === 'list_laptop' ? 'Hilang/Disesuaikan' : 'Gudang';
                updates[`/${window.currentTab}/${fKey}/status`] = targetStatus;
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
                        if (window.logActivity) window.logActivity('Ubah', window.currentTab, `Melakukan Stok Opname Laptop. Selisih: ${alertSummary.length} unit hilang (${logDetails.join(', ')}). Status sistem disesuaikan.`);
                        if (window.showToast) window.showToast(`Stok Opname berhasil disesuaikan. ${alertSummary.length} unit hilang diproses.`, "success");
                        closeOpnameModal();
                    })
                    .catch(err => {
                        if (window.showToast) window.showToast("Gagal menyesuaikan stok: " + err.message, "error");
                    });
            }
        } else {
            alert(`✅ Stok Opname Selesai!\n\nSemua fisik unit cocok dengan data sistem (Total: ${totalItems} Unit).`);
            if (window.logActivity) window.logActivity('Lainnya', window.currentTab, `Melakukan Stok Opname Laptop. Hasil: Semua fisik unit cocok dengan data sistem (Total: ${totalItems} Unit).`);
            closeOpnameModal();
        }

    } else if (window.currentTab === 'inventaris') {
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
                        if (window.logActivity) window.logActivity('Ubah', 'inventaris', `Melakukan Stok Opname Inventaris. Hasil: Selisih stok ditemukan pada ${alertSummary.length} item (${logDetails.join(', ')}). Stok sistem disesuaikan.`);
                        if (window.showToast) window.showToast(`Stok Opname disesuaikan. ${alertSummary.length} item diperbarui.`, "success");
                        closeOpnameModal();
                    })
                    .catch(err => {
                        if (window.showToast) window.showToast("Gagal menyesuaikan stok: " + err.message, "error");
                    });
            }
        } else {
            alert(`✅ Stok Opname Selesai!\n\nSemua fisik item cocok dengan data sistem (Total: ${totalItems} Item).`);
            if (window.logActivity) window.logActivity('Lainnya', 'inventaris', `Melakukan Stok Opname Inventaris. Hasil: Semua fisik item cocok dengan data sistem (Total: ${totalItems} Item).`);
            closeOpnameModal();
        }
    }
}

// Pasang ke global window
window.openOpnameModal = openOpnameModal;
window.closeOpnameModal = closeOpnameModal;
window.renderOpnameItems = renderOpnameItems;
window.submitOpname = submitOpname;