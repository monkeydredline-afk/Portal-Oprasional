/* ==========================================================================
   Teknisi Portal - opname.js (Modul Stok Opname / Audit Fisik)
   ========================================================================== */
import { db, ref, update, push } from './firebase-config.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Mengatur ketersediaan fisik (Checkbox Kiri)
window.toggleOpnameUnitAda = function(cb, key) {
    const wrapKondisi = document.getElementById(`opname-kondisi-wrap-${key}`);
    const boxCatatan = document.getElementById(`opname-catatan-box-${key}`);
    const inputCatatan = document.getElementById(`opname-catatan-${key}`);

    if (cb.checked) {
        // Fisik Ada: Aktifkan pilihan Normal vs Bermasalah
        if (wrapKondisi) {
            wrapKondisi.classList.remove('opacity-40', 'pointer-events-none');
        }
        // Cek apakah radio saat ini bermasalah
        const isBermasalah = document.querySelector(`input[name="kondisi_${key}"][value="Bermasalah"]`)?.checked;
        if (isBermasalah && boxCatatan) {
            boxCatatan.classList.remove('hidden');
        }
    } else {
        // Fisik Hilang/Tidak Ada: Redupkan pilihan dan sembunyikan catatan
        if (wrapKondisi) {
            wrapKondisi.classList.add('opacity-40', 'pointer-events-none');
        }
        if (boxCatatan) {
            boxCatatan.classList.add('hidden');
        }
        if (inputCatatan) {
            inputCatatan.value = '';
        }
    }
    updateOpnameCheckedCount();
};

// Mengatur pilihan kondisi Normal vs Bermasalah
window.toggleOpnameKondisi = function(key, kondisi) {
    const boxCatatan = document.getElementById(`opname-catatan-box-${key}`);
    const inputCatatan = document.getElementById(`opname-catatan-${key}`);

    if (kondisi === 'Bermasalah') {
        if (boxCatatan) {
            boxCatatan.classList.remove('hidden');
            if (inputCatatan) inputCatatan.focus();
        }
    } else {
        if (boxCatatan) {
            boxCatatan.classList.add('hidden');
        }
        if (inputCatatan) {
            inputCatatan.value = '';
        }
    }
};

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

function updateOpnameCheckedCount() {
    const checkedCountInfo = document.getElementById('opname-checked-count-info');
    if (!checkedCountInfo) return;

    if (window.currentTab === 'list_laptop' || window.currentTab === 'laptop_display') {
        const totalChecked = document.querySelectorAll('input[name="opname_checkbox"]:checked').length;
        checkedCountInfo.innerText = `Terpilih: ${totalChecked} Unit`;
        checkedCountInfo.classList.remove('hidden');
    } else {
        checkedCountInfo.classList.add('hidden');
    }
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
            
            // Sembunyikan live counter terpilih jika cabang belum dipilih
            const checkedCountInfo = document.getElementById('opname-checked-count-info');
            if (checkedCountInfo) checkedCountInfo.classList.add('hidden');
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
            
            const checkedCountInfo = document.getElementById('opname-checked-count-info');
            if (checkedCountInfo) checkedCountInfo.classList.add('hidden');
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

                const unitIcon = (item.jenis_unit === 'Printer') ? '🖨️' : '💻';
                const kodeUnit = item.kode_toko || item.kode || 'N/A';

                html += `
                    <div data-search-text="${escapeHtml(searchableText)}" class="p-4 bg-white border border-slate-200 rounded-xl space-y-2.5 text-xs shadow-sm hover:border-cyan-300 transition">
                        <div class="flex items-start space-x-3">
                            <!-- Checkbox Fisik Ada / Hilang -->
                            <input type="checkbox" 
                                   name="opname_checkbox" 
                                   data-key="${item._firebaseKey}" 
                                   data-name="${escapeHtml(item.merk + ' ' + item.tipe)}" 
                                   data-sn="${escapeHtml(item.sn || 'Tanpa SN')}" 
                                   data-kode="${escapeHtml(kodeUnit)}"
                                   data-spek="${escapeHtml(specInlineText)}"
                                   onchange="window.toggleOpnameUnitAda(this, '${item._firebaseKey}')" 
                                   class="mt-1 rounded text-cyan-600 focus:ring-cyan-500 border-gray-300 w-4 h-4 cursor-pointer">
                            
                            <div class="flex-grow space-y-1.5">
                                <!-- Baris Judul & Opsi Normal / Bermasalah -->
                                <div class="flex items-center justify-between flex-wrap gap-2">
                                    <div class="flex items-center flex-wrap gap-1">
                                        <span class="font-extrabold text-slate-800 text-sm">${unitIcon} ${escapeHtml(item.merk)} ${escapeHtml(item.tipe)}</span>
                                        <span class="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-extrabold rounded border border-slate-200 font-mono">${escapeHtml(kodeUnit)}</span>
                                        <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${statusBadgeColor}">${escapeHtml(item.status === 'Staf' ? 'Digunakan Staf' : item.status)}</span>
                                    </div>

                                    <!-- Opsi Ceklis Normal vs Bermasalah -->
                                    <div id="opname-kondisi-wrap-${item._firebaseKey}" class="flex items-center gap-1.5 opacity-40 pointer-events-none transition">
                                        <label class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] font-bold cursor-pointer hover:bg-emerald-100 transition select-none">
                                            <input type="radio" name="kondisi_${item._firebaseKey}" value="Normal" checked onchange="window.toggleOpnameKondisi('${item._firebaseKey}', 'Normal')" class="text-emerald-600 focus:ring-emerald-500">
                                            <span>Normal 🟢</span>
                                        </label>
                                        <label class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-bold cursor-pointer hover:bg-amber-100 transition select-none">
                                            <input type="radio" name="kondisi_${item._firebaseKey}" value="Bermasalah" onchange="window.toggleOpnameKondisi('${item._firebaseKey}', 'Bermasalah')" class="text-amber-600 focus:ring-amber-500">
                                            <span>Bermasalah 🟡</span>
                                        </label>
                                    </div>
                                </div>

                                <!-- Baris SN & Spesifikasi -->
                                <div class="text-[11px] text-slate-500 leading-relaxed">
                                    <span class="font-bold text-slate-700">SN:</span> <span class="font-mono text-cyan-600 font-extrabold">${escapeHtml(item.sn || 'Tanpa SN')}</span>${specInlineText ? ' | ' + specInlineText : ''}
                                </div>

                                <!-- Kotak Catatan Dinamis (Hanya Muncul jika Bermasalah) -->
                                <div id="opname-catatan-box-${item._firebaseKey}" class="hidden pt-1.5">
                                    <label class="block text-[10px] font-bold text-amber-800 uppercase tracking-wide mb-1">Catatan Kerusakan / Kendala Fisik:</label>
                                    <textarea id="opname-catatan-${item._firebaseKey}" rows="2" placeholder="Contoh: Layar ada garis putih tipis, tombol spasi keras..." class="w-full border border-amber-300 rounded-lg p-2 text-xs bg-amber-50/40 text-slate-800 font-sans focus:outline-none focus:ring-2 focus:ring-amber-400 leading-relaxed"></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
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
    
    // Hitung ulang centang terpilih
    updateOpnameCheckedCount();
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

        if (totalItems === 0) {
            alert("Tidak ada unit yang terdaftar untuk di-opname.");
            return;
        }

        let normalCount = 0;
        let bermasalahCount = 0;
        let hilangCount = 0;
        const auditItemsDetail = [];

        checkboxes.forEach(cb => {
            const fKey = cb.getAttribute('data-key');
            const name = cb.getAttribute('data-name');
            const sn = cb.getAttribute('data-sn');
            const kode = cb.getAttribute('data-kode');
            const spek = cb.getAttribute('data-spek');

            const isAda = cb.checked;
            const kondisiRadio = document.querySelector(`input[name="kondisi_${fKey}"]:checked`)?.value || 'Normal';
            const catatanInput = document.getElementById(`opname-catatan-${fKey}`)?.value.trim() || '';

            if (!isAda) {
                // KASUS 1: Fisik Tidak Ditemukan (HILANG)
                hilangCount++;
                hasDiscrepancy = true;
                const targetStatus = (window.currentTab === 'list_laptop') ? 'Hilang/Disesuaikan' : 'Gudang';
                
                updates[`/${window.currentTab}/${fKey}/status`] = targetStatus;
                updates[`/${window.currentTab}/${fKey}/catatan`] = 'Fisik tidak ditemukan saat stok opname.';
                
                alertSummary.push(`• [HILANG] ${name} (${kode} / SN: ${sn}) -> Status diubah ke ${targetStatus}`);
                logDetails.push(`${name} (Hilang)`);

                auditItemsDetail.push({
                    laptopKey: fKey,
                    nama: name,
                    sn: sn,
                    kode: kode,
                    spek: spek,
                    hasil: 'Hilang',
                    catatan: 'Fisik tidak ditemukan saat opname'
                });
            } else if (kondisiRadio === 'Bermasalah') {
                // KASUS 2: Fisik Ada tapi BERMASALAH
                bermasalahCount++;
                hasDiscrepancy = true;

                updates[`/${window.currentTab}/${fKey}/status`] = 'Maintenance';
                updates[`/${window.currentTab}/${fKey}/catatan`] = catatanInput || 'Unit bermasalah saat opname.';

                alertSummary.push(`• [BERMASALAH] ${name} (${kode} / SN: ${sn}) -> Masuk Maintenance (${catatanInput || 'Ada kendala'})`);
                logDetails.push(`${name} (Maintenance)`);

                auditItemsDetail.push({
                    laptopKey: fKey,
                    nama: name,
                    sn: sn,
                    kode: kode,
                    spek: spek,
                    hasil: 'Bermasalah',
                    catatan: catatanInput || 'Ada kendala fisik'
                });
            } else {
                // KASUS 3: Fisik Ada dan NORMAL
                normalCount++;
                cocokCount++;

                // Bersihkan catatan lama
                updates[`/${window.currentTab}/${fKey}/catatan`] = '';

                auditItemsDetail.push({
                    laptopKey: fKey,
                    nama: name,
                    sn: sn,
                    kode: kode,
                    spek: spek,
                    hasil: 'Normal',
                    catatan: ''
                });
            }
        });

        // Hitung Periode Minggu Otomatis (Siklus 7 Hari)
        const now = new Date();
        const tglHari = now.getDate();
        let mingguKe = 1;
        if (tglHari >= 1 && tglHari <= 7) mingguKe = 1;
        else if (tglHari >= 8 && tglHari <= 14) mingguKe = 2;
        else if (tglHari >= 15 && tglHari <= 21) mingguKe = 3;
        else if (tglHari >= 22 && tglHari <= 28) mingguKe = 4;
        else mingguKe = 5;

        const bulanTahun = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const tglFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // Siapkan Dokumen Riwayat Sesi Opname Baru
        const riwayatKey = push(ref(db, 'riwayat_opname')).key;
        updates[`/riwayat_opname/${riwayatKey}`] = {
            id: riwayatKey,
            timestamp: Date.now(),
            tanggal: tglFormatted,
            bulan_tahun: bulanTahun,
            minggu_ke: mingguKe,
            cabang: filterEl.value,
            modul: window.currentTab,
            auditor: window.currentUser.name || window.currentUser.email || 'Teknisi',
            total_unit: totalItems,
            total_normal: normalCount,
            total_bermasalah: bermasalahCount,
            total_hilang: hilangCount,
            items: auditItemsDetail
        };

        const confirmMsg = `📋 HASIL AUDIT STOK OPNAME:\n\n` +
            `• Total Diperiksa : ${totalItems} Unit\n` +
            `• Kondisi Normal  : ${normalCount} Unit 🟢\n` +
            `• Bermasalah      : ${bermasalahCount} Unit 🟡\n` +
            `• Tidak Ditemukan : ${hilangCount} Unit 🔴\n\n` +
            (alertSummary.length > 0 ? `Rincian Temuan:\n${alertSummary.slice(0, 5).join('\n')}${alertSummary.length > 5 ? '\n...dan lainnya' : ''}\n\n` : '') +
            `Apakah Anda ingin memproses penyesuaian status master data & menyimpan rekapan ini ke Riwayat Opname?`;

        if (confirm(confirmMsg)) {
            update(ref(db), updates)
                .then(() => {
                    if (window.logActivity) {
                        window.logActivity('Ubah', window.currentTab, `Stok Opname Selesai: ${normalCount} Normal, ${bermasalahCount} Bermasalah, ${hilangCount} Hilang.`);
                    }
                    if (window.showToast) {
                        window.showToast(`Stok Opname berhasil diselesaikan & sesi dicatat!`, "success");
                    }
                    closeOpnameModal();
                })
                .catch(err => {
                    if (window.showToast) window.showToast("Gagal menyimpan opname: " + err.message, "error");
                });
        }
        return;
    
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
window.updateOpnameCheckedCount = updateOpnameCheckedCount;