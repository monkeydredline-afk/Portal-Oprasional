/* ==========================================================================
   Teknisi Portal - table.js (Modul Manajemen Tabel, Data & Paginasi)
   ========================================================================== */
import { db, ref, update, remove } from './firebase-config.js';
import { tableHeaders, dataKeysMapping } from './templates.js';
import { parseDate, formatDateForInput } from './utils.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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

function renderTableHeader() {
    const head = document.getElementById('table-head');
    if(!head) return;
    let html = '<tr>';
    tableHeaders[window.currentTab].forEach(header => {
        if(header === 'Kode Toko' || header === 'Harga Jual' || header === 'Cabang') {
            html += `<th class="px-4 py-3 font-semibold whitespace-nowrap">${header}</th>`;
        } else {
            html += `<th class="px-4 py-3 font-semibold">${header}</th>`;
        }
    });
    html += '</tr>';
    head.innerHTML = html;
}

function renderTable() {
    const tbody = document.getElementById('table-body');
    if(!tbody) return;

    const data = window.globalDataCloud[window.currentTab] || [];
    
    if (window.currentTab === 'activity_logs') {
        data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else if (window.currentTab === 'services') {
        // Khusus Log Servisan: Urutkan Descending dari ID terbesar ke terkecil (Newest on Top)
        data.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    }

    const searchBar = document.getElementById('search-bar');
    const searchQuery = searchBar ? searchBar.value.toLowerCase() : '';
    const statusFilter = document.getElementById('status-filter');
    const filterStatusValue = statusFilter ? statusFilter.value : '';
    const serverFilterValue = window.currentServerFilter || '';
    
    let branchFilterValue = window.userBranch || '';
    if (!branchFilterValue) {
        const branchFilterEl = document.getElementById('branch-filter');
        const branchContainer = document.getElementById('branch-filter-container');
        
        if (branchFilterEl && branchContainer && !branchContainer.classList.contains('hidden')) {
            branchFilterValue = branchFilterEl.value;
        }
    }
    
    tbody.innerHTML = '';

    const filteredData = data.filter(item => {
        if (filterStatusValue) {
            if (window.currentTab === 'activity_logs') {
                if (item.action !== filterStatusValue) return false;
            } else if (window.currentTab === 'inventaris') {
                if (item.kondisi !== filterStatusValue) return false;
            } else {
                if (item.status !== filterStatusValue) return false;
            }
        }
        
        // Filter cabang diabaikan untuk menu global dan inventaris agar memunculkan seluruh data
        if (window.currentTab !== 'list_office' && window.currentTab !== 'user_management' && window.currentTab !== 'activity_logs' && window.currentTab !== 'inventaris') {
            if (branchFilterValue && item.cabang && item.cabang !== branchFilterValue) return false;
        }
        
        if (window.currentSubTab) {
            if (window.currentSubTab === 'Terlambat' && window.currentTab === 'penyewaan') {
                if (item.status === 'Lunas') return false;
                const dateSelesai = new Date(item.tgl_selesai);
                const today = new Date();
                today.setHours(0,0,0,0);
                if (dateSelesai >= today) return false;
            } else {
                if (item.status !== window.currentSubTab) return false;
            }
        }

        return Object.values(item).some(val => {
            if (typeof val === 'object') return false;
            return String(val).toLowerCase().includes(searchQuery);
        });
    });

    const totalData = filteredData.length;

    if(totalData === 0) {
        tbody.innerHTML = `<tr><td colspan="${tableHeaders[window.currentTab].length}" class="px-4 py-12 text-center text-slate-500 bg-slate-50/50"> <div class="flex flex-col items-center justify-center space-y-3"> <i class="fa-solid fa-folder-open text-3xl text-cyan-600"></i> <span class="text-sm font-semibold tracking-wide">Tidak ada data yang sesuai filter</span> </div> </td></tr>`;
        const paginationControls = document.getElementById('pagination-controls');
        if (paginationControls) paginationControls.classList.add('hidden');
        return;
    }

    const totalPages = Math.ceil(totalData / window.itemsPerPage) || 1;
    if (window.currentPage > totalPages) window.currentPage = totalPages;
    
    const startIndex = (window.currentPage - 1) * window.itemsPerPage;
    const endIndex = startIndex + window.itemsPerPage;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    paginatedData.forEach((item, index) => {
        const perms = window.currentUser.permissions || {};
        
        let rowBgColor = '';
        if (window.currentTab === 'penyewaan' && item.status !== 'Lunas') {
            const dateSelesai = new Date(item.tgl_selesai);
            const today = new Date();
            today.setHours(0,0,0,0);
            
            if (dateSelesai < today) {
                rowBgColor = 'bg-rose-50/70 hover:bg-rose-100/80 transition-colors duration-150';
            }
        }

        let rowHtml = `<tr class="${rowBgColor || 'hover:bg-slate-50 transition border-b'}">`;
        const keysOrder = dataKeysMapping[window.currentTab];
                
        keysOrder.forEach((key) => {
            const val = item[key] !== undefined ? item[key] : '-';
            
            if (key === 'id') {
                rowHtml += `<td class="px-4 py-3 font-semibold text-slate-500 font-mono">${val}</td>`;
            } else if (key === 'no_ref') {
                // Menampilkan No. Referensi permanen, jika data lama gunakan ID lama sebagai fallback
                const refDisplay = (val && val !== '-') ? val : `SRV-Legacy-#${item.id}`;
                rowHtml += `<td class="px-4 py-3 font-bold text-slate-700 font-mono text-xs whitespace-nowrap">${refDisplay}</td>`;
            } else if (key === 'tanggal' || key === 'tanggal_jam') {
                rowHtml += `<td class="px-4 py-3 whitespace-nowrap"><span class="font-mono text-xs text-slate-700">${val}</span></td>`;
            } else if (key === 'tgl_mulai' && window.currentTab === 'penyewaan') {
                const tglSelesai = item.tgl_selesai || '-';
                rowHtml += `<td class="px-4 py-3 whitespace-nowrap"><span class="font-mono text-xs text-slate-700">${val} - ${tglSelesai}</span></td>`;
            } else if ((key === 'biaya' || key === 'total_biaya' || key === 'harga_jual') && window.currentTab !== 'list_laptop') {
                rowHtml += `<td class="px-4 py-3 font-medium text-slate-900">Rp ${Number(val).toLocaleString('id-ID')}</td>`;
            } else if (key === 'no_wa' && (window.currentTab === 'services' || window.currentTab === 'penyewaan')) {
                rowHtml += `
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                            <span class="font-mono text-xs text-slate-600">${val}</span>
                            ${val && val !== '-' ? `
                                <button onclick="window.sendWhatsAppNotify('${val}', '${window.currentTab === 'services' ? item.pelanggan : item.penyewa}', '${window.currentTab === 'services' ? item.perangkat : item.unit}', '${window.currentTab === 'services' ? item.biaya : item.total_biaya}', '${window.currentTab}')" class="text-emerald-500 hover:text-emerald-600 p-0.5 rounded transition hover:scale-110" title="Hubungi via WhatsApp">
                                    <i class="fa-brands fa-whatsapp text-base"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>`;
            } else if (key === 'permissions' && window.currentTab === 'user_management') {
                const permsDetail = val || {};
                let badges = [];
                if (permsDetail.dashboard === true || permsDetail.dashboard === 'true') badges.push('Dashboard');
                if (permsDetail.services === true || permsDetail.services === 'true') badges.push('Services');
                if (permsDetail.penyewaan === true || permsDetail.penyewaan === 'true') badges.push('Sewa');
                if (permsDetail.cctv === true || permsDetail.cctv === 'true') badges.push('CCTV');
                if (permsDetail.list_laptop === true || permsDetail.list_laptop === 'true') badges.push('Gudang');
                if (permsDetail.laptop_display === true || permsDetail.laptop_display === 'true') badges.push('Display');
                if (permsDetail.inventaris === true || permsDetail.inventaris === 'true') badges.push('Inventaris'); 
                if (permsDetail.list_office === true || permsDetail.list_office === 'true') badges.push('Office');
                if (permsDetail.user_management === true || permsDetail.user_management === 'true') badges.push('Users');
                if (permsDetail.activity_logs === true || permsDetail.activity_logs === 'true') badges.push('Logs');
                if (permsDetail.backup_database === true || permsDetail.backup_database === 'true') badges.push('Backup'); 
                if (permsDetail.export_excel === true || permsDetail.export_excel === 'true') badges.push('Export');
                if (permsDetail.import_excel === true || permsDetail.import_excel === 'true') badges.push('Import');
                if (permsDetail.edit_data === true || permsDetail.edit_data === 'true') badges.push('Edit');
                if (permsDetail.delete_data === true || permsDetail.delete_data === 'true') badges.push('Hapus');

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
                
                if (window.currentTab === 'list_office') {
                    const expiredStr = item.workspace_expired || '';
                    const expiredDate = parseFlexibleDate(expiredStr);
                    if (expiredDate) {
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        if (expiredDate < today) {
                            displayVal = 'Tidak Aktif';
                        }
                    }
                }

                // Tambahan: Menyisipkan tanggal selesai di lencana status untuk modul Servis
                if (window.currentTab === 'services' && val === 'Selesai') {
                    if (item.tgl_selesai) {
                        const dateParts = item.tgl_selesai.split('-');
                        const formattedSelesai = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : item.tgl_selesai;
                        displayVal = `Selesai (${formattedSelesai})`;
                    } else {
                        displayVal = `Selesai`;
                    }
                }

                if (val === 'Selesai' || displayVal === 'Lunas' || displayVal === 'Tersedia' || displayVal === 'Ready' || displayVal === 'Aktif') badgeColor = "bg-emerald-100 text-emerald-800";
                if (displayVal === 'Permanen') badgeColor = "bg-cyan-100 text-cyan-800";
                if (displayVal === 'Belum Bayar' || displayVal === 'Maintenance' || displayVal === 'Gudang' || displayVal === 'Tidak Aktif' || displayVal === 'Rusak') badgeColor = "bg-rose-100 text-rose-800";
                if (displayVal === 'Disewa') badgeColor = "bg-blue-100 text-blue-800";
                if (displayVal === 'Terjual') badgeColor = "bg-slate-200 text-slate-800";
                if (displayVal === 'Staf') { badgeColor = "bg-indigo-100 text-indigo-800"; displayVal = "Digunakan Staf"; }
                rowHtml += `<td class="px-4 py-3"><span class="px-2 py-1 rounded-full text-xs font-semibold ${badgeColor}">${displayVal}</span></td>`;
            } else if (key === 'action' && window.currentTab === 'activity_logs') {
                let badgeColor = "bg-sky-100 text-sky-800";
                if (val === 'Tambah') badgeColor = "bg-emerald-100 text-emerald-800";
                if (val === 'Ubah') badgeColor = "bg-amber-100 text-amber-800";
                if (val === 'Hapus') badgeColor = "bg-rose-100 text-rose-800";
                if (val === 'Kosongkan') badgeColor = "bg-purple-100 text-purple-800";
                if (val === 'Impor') badgeColor = "bg-indigo-100 text-indigo-800";
                rowHtml += `<td class="px-4 py-3"><span class="px-2.5 py-0.5 rounded text-xs font-bold ${badgeColor}">${val}</span></td>`;
            } else if (key === 'menu_display' && window.currentTab === 'activity_logs') {
                rowHtml += `<td class="px-4 py-3 font-semibold text-slate-500 uppercase text-[11px] tracking-wide">${val}</td>`;
            } else if (key === 'unit' && window.currentTab === 'penyewaan') {
                const unitItems = val.split(', ').map(u => u.trim());
                const unitHtml = unitItems.map(u => `<div class="flex gap-2 text-xs"><span>•</span><span class="font-mono text-cyan-700 font-medium">${u}</span></div>`).join('');
                rowHtml += `
                    <td class="px-4 py-3 text-xs text-slate-700 whitespace-normal min-w-[220px]">
                        <div class="max-h-28 overflow-y-auto pr-2 space-y-1.5 custom-table-scrollbar">
                            ${unitHtml}
                        </div>
                    </td>`;
            } else if (key === 'spek_singkat' && window.currentTab === 'laptop_display') {
                rowHtml += `
                    <td class="px-4 py-3 text-xs text-slate-700 whitespace-normal min-w-[240px]">
                        <div class="max-h-28 overflow-y-auto pr-1 font-mono space-y-0.5 custom-table-scrollbar text-slate-600">
                            ${val.replace(/\n/g, '<br>')}
                        </div>
                    </td>`;
            } else if (key === 'spek' && window.currentTab === 'list_laptop') {
                rowHtml += `
                    <td class="px-4 py-3 text-xs text-slate-700 whitespace-normal min-w-[240px]">
                        <div class="max-h-28 overflow-y-auto pr-1 font-mono space-y-0.5 custom-table-scrollbar text-slate-600">
                            ${val.replace(/\n/g, '<br>')}
                        </div>
                    </td>`;
            } else if (key === 'sn') {
                rowHtml += `<td class="px-4 py-3 font-mono font-medium text-cyan-700">${val}</td>`;
            } else if (key === 'office' && window.currentTab === 'list_office') {
                const tipeAkun = item.tipe_akun || 'Anggota';
                let badgeHtml = '';
                
                if (tipeAkun === 'Utama') {
                    const allOfficeData = window.globalDataCloud['list_office'] || [];
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
            } else if (key === 'password' && (window.currentTab === 'list_office' || window.currentTab === 'user_management')) {
                rowHtml += `
                    <td class="px-4 py-3">
                        <div class="flex items-center justify-between gap-2 min-w-[130px]">
                            <input type="password" id="tbl-pass-${item._firebaseKey}" value="${val}" readonly class="bg-transparent border-none p-0 w-full text-sm font-medium text-slate-700 focus:ring-0 cursor-default">
                            <button onclick="window.togglePassword('tbl-pass-${item._firebaseKey}', 'tbl-eye-${item._firebaseKey}')" class="text-gray-400 hover:text-cyan-600 focus:outline-none p-1">
                                <i id="tbl-eye-${item._firebaseKey}" class="fa-solid fa-eye"></i>
                            </button>
                        </div>
                    </td>`;
            } else if (key === 'kode_toko' && window.currentTab === 'list_laptop') {
                rowHtml += `<td class="px-4 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">${val}</td>`;
            } else if (key === 'kode_barang' && window.currentTab === 'inventaris') {
                rowHtml += `<td class="px-4 py-3 font-mono font-semibold text-cyan-700 whitespace-nowrap">${val}</td>`;
            } else if (key === 'catatan') {
                rowHtml += `<td class="px-4 py-3 text-xs font-medium italic text-slate-500 max-w-xs truncate" title="${val}">${val || '-'}</td>`;
            } else {
                rowHtml += `<td class="px-4 py-3">${val}</td>`;
            }
        });

        rowHtml += `<td class="px-4 py-3 flex items-center space-x-2">`;
        
        if (window.currentTab === 'penyewaan' && item.status !== 'Lunas' && item.status !== 'Selesai' && (perms.edit_data === true || perms.edit_data === 'true')) {
            rowHtml += `
                <button onclick="window.markAsSelesai('${item._firebaseKey}')" class="text-emerald-500 hover:text-emerald-700 p-1 rounded hover:bg-emerald-50 transition" title="Selesai / Kembalikan Unit">
                    <i class="fa-solid fa-circle-check text-base"></i>
                </button>
            `;
        }
        
        if ((perms.edit_data === true || perms.edit_data === 'true') && window.currentTab !== 'activity_logs') {
            rowHtml += `
                <button onclick="window.openEditModal('${item._firebaseKey}')" class="text-amber-500 hover:text-amber-700 p-1 rounded hover:bg-amber-50 transition" title="Edit Data">
                    <i class="fa-solid fa-pen-to-square text-base"></i>
                </button>
            `;
        }
        
        if (perms.delete_data === true || perms.delete_data === 'true') {
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
        if (totalData > window.itemsPerPage) {
            paginationControls.classList.remove('hidden');
            const infoEl = document.getElementById('pagination-info');
            if (infoEl) infoEl.innerText = `Menampilkan data ke-${startIndex + 1} s/d ${Math.min(endIndex, totalData)} (Total ${totalData} Data)`;
            
            const btnPrev = document.getElementById('btn-prev-page');
            const btnNext = document.getElementById('btn-next-page');
            if (btnPrev) btnPrev.disabled = (window.currentPage === 1);
            if (btnNext) btnNext.disabled = (window.currentPage === totalPages);
        } else {
            paginationControls.classList.add('hidden');
        }
    }
}

function openEditModal(firebaseKey) {
    const perms = window.currentUser.permissions || {};
    if (perms.edit_data !== true && perms.edit_data !== 'true') {
        alert("Anda tidak memiliki izin akses untuk mengubah data ini.");
        return;
    }

    const currentDataList = window.globalDataCloud[window.currentTab] || [];
    const targetItem = currentDataList.find(item => item._firebaseKey === firebaseKey);
    if(!targetItem) return;

    const keyInput = document.getElementById('edit-firebase-key');
    if (keyInput) keyInput.value = firebaseKey;
    
    const fieldsContainer = document.getElementById('edit-modal-fields');
    if (!fieldsContainer) return;
    fieldsContainer.innerHTML = '';

    // Logika HTML dinamis kolom cabang untuk modal edit
    let cabangEditHtml = '';
    if (!window.userBranch) {
        // Untuk Admin / Superadmin: Muncul dropdown pilihan cabang
        cabangEditHtml = `
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Cabang Toko</label>
                <select id="edit-cabang" class="w-full border p-2 text-sm rounded-lg bg-white">
                    <option value="Monumen Emmy Saelan" ${targetItem.cabang === 'Monumen Emmy Saelan' ? 'selected' : ''}>Monumen Emmy Saelan</option>
                    <option value="Perintis" ${targetItem.cabang === 'Perintis' ? 'selected' : ''}>Perintis</option>
                    <option value="Head Office" ${targetItem.cabang === 'Head Office' ? 'selected' : ''}>Head Office</option>
                </select>
            </div>
        `;
    } else {
        // Untuk Staf Cabang: Cabang dikunci (hidden) sesuai dengan hak akses
        cabangEditHtml = `<input type="hidden" id="edit-cabang" value="${window.userBranch}">`;
    }

    if (window.currentTab === 'services') {
        const inventarisList = window.globalDataCloud.inventaris || [];
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
            ${cabangEditHtml}
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Pelanggan</label><input type="text" id="edit-pelanggan" value="${targetItem.pelanggan || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">No. WhatsApp</label><input type="tel" id="edit-no_wa" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')" value="${targetItem.no_wa || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Perangkat</label><input type="text" id="edit-perangkat" value="${targetItem.perangkat || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Estimasi Biaya (Rp)</label><input type="number" id="edit-biaya" value="${targetItem.biaya || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div class="md:col-span-2"><label class="block text-xs font-semibold text-slate-500 mb-1">Gejala / Kerusakan & Kelengkapan</label><textarea id="edit-kerusakan" rows="2" required class="w-full border p-2 text-sm rounded-lg">${targetItem.kerusakan || ''}</textarea></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Teknisi Penanggung Jawab</label><input type="text" id="edit-teknisi" value="${teknisiVal}" ${teknisiReadonlyAttr}></div>
            <div class="md:col-span-2"><label class="block text-xs font-semibold text-slate-500 mb-1">Hasil Analisa / Tindakan Teknisi</label><textarea id="edit-tindakan_teknisi" rows="2" placeholder="Tuliskan tindakan servis, perbaikan komponen, dll." class="w-full border p-2 text-sm rounded-lg">${targetItem.tindakan_teknisi || ''}</textarea></div>
            
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

            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Status</label>
                <select id="edit-status" onchange="window.handleEditStatusChange(this.value)" class="w-full border p-2 text-sm rounded-lg">
                    <option value="Antrean" ${targetItem.status === 'Antrean' ? 'selected' : ''}>Antrean</option>
                    <option value="Proses" ${targetItem.status === 'Proses' ? 'selected' : ''}>Proses Pengecekan</option>
                    <option value="Selesai" ${targetItem.status === 'Selesai' ? 'selected' : ''}>Selesai</option>
                </select>
            </div>
            
            <div id="tgl-selesai-container" class="${targetItem.status === 'Selesai' ? '' : 'hidden'}">
                <label class="block text-xs font-semibold text-slate-500 mb-1">Tanggal Selesai Servis</label>
                <input type="date" id="edit-tgl-selesai" value="${targetItem.tgl_selesai || ''}" class="w-full border p-2 text-sm rounded-lg">
            </div>
        `;
    } else if (window.currentTab === 'cctv') {
        fieldsContainer.innerHTML = `
            ${cabangEditHtml}
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Klien</label><input type="text" id="edit-klien" value="${targetItem.klien || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Lokasi Pemasangan</label><input type="text" id="edit-lokasi" value="${targetItem.lokasi || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Jumlah CCTV</label><input type="number" id="edit-jumlah_cctv" value="${targetItem.jumlah_cctv || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Progres</label><input type="text" id="edit-progres" value="${targetItem.progres || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Status Proyek</label><select id="edit-status" class="w-full border p-2 text-sm rounded-lg"><option value="Survei" ${targetItem.status === 'Survei' ? 'selected' : ''}>Tahap Survei</option><option value="Pengerjaan" ${targetItem.status === 'Pengerjaan' ? 'selected' : ''}>Sedang Dikerjakan</option><option value="Selesai" ${targetItem.status === 'Selesai' ? 'selected' : ''}>Selesai</option></select></div>
        `;
    } else if (window.currentTab === 'list_laptop') {
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
    } else if (window.currentTab === 'laptop_display') { 
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
    } else if (window.currentTab === 'inventaris') { 
        const inventarisCategoryOptions = window.buildInventarisCategoryOptions ? window.buildInventarisCategoryOptions(window.globalDataCloud.inventaris || [], targetItem.kategori || '') : '';
        const inventarisUnitOptions = window.buildInventarisUnitOptions ? window.buildInventarisUnitOptions(targetItem.satuan || '') : '';

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
    } else if (window.currentTab === 'penyewaan') {
        window.editSelectedLaptopKeys = targetItem._linkedLaptopKeys ? [...targetItem._linkedLaptopKeys] : [];

        fieldsContainer.innerHTML = `
            ${cabangFieldHtml}
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
        
        setTimeout(() => { populateEditLaptopCheckboxes(); }, 50);
    } else if (window.currentTab === 'list_office') {
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
    } else if (window.currentTab === 'user_management') {
        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Lengkap</label><input type="text" id="edit-name-user" value="${targetItem.name || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Email Akun</label><input type="email" id="edit-email-user" value="${targetItem.email || ''}" required class="w-full border p-2 text-sm rounded-lg" readonly></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Password Baru (Kosongkan jika tak diubah)</label><input type="password" id="edit-password-user" class="w-full border p-2 text-sm rounded-lg"></div>
            
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

    if (window.currentTab === 'list_office') {
        const editTipe = document.getElementById('edit-tipe_akun');
        const editServer = document.getElementById('edit-server_utama');
        const editOfficeSelect = document.getElementById('edit-office-select');

        if (editOfficeSelect) {
            const cur = targetItem.office || '';
            if (cur) editOfficeSelect.value = cur;
        }

        if (window.refreshServerOptions) window.refreshServerOptions();
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
                    if (editOfficeSelect) { editOfficeSelect.value = '365 Family'; editOfficeSelect.disabled = false; }
                }
            });
        }
    }
}

function closeEditModal() {
    const editModal = document.getElementById('edit-modal');
    if (editModal) editModal.classList.add('hidden');
}

function populateLaptopCheckboxes() {
    const container = document.getElementById('checkbox-laptop-container');
    if(!container) return;

    const masterLaptop = window.globalDataCloud['list_laptop'] || [];
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
        const isChecked = window.selectedLaptopKeys.includes(lap._firebaseKey) ? 'checked' : '';
        
        html += `
            <label class="flex items-start space-x-3 p-1.5 hover:bg-slate-50 rounded-lg transition text-sm ${isDisabled ? 'text-gray-400 bg-gray-50' : 'cursor-pointer'}">
                <input type="checkbox" 
                       name="selected_laptops" 
                       value="${infoText}" 
                       data-key="${lap._firebaseKey}" 
                       ${isDisabled ? 'disabled' : ''} 
                       ${isChecked}
                       onchange="window.syncCheckboxState(this)"
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

function populateEditLaptopCheckboxes() {
    const container = document.getElementById('edit-checkbox-laptop-container');
    if(!container) return;

    const masterLaptop = window.globalDataCloud['list_laptop'] || [];
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

function syncCheckboxState(cb) {
    const laptopKey = cb.getAttribute('data-key');
    if (cb.checked) {
        if (!window.selectedLaptopKeys.includes(laptopKey)) {
            window.selectedLaptopKeys.push(laptopKey);
        }
    } else {
        window.selectedLaptopKeys = window.selectedLaptopKeys.filter(key => key !== laptopKey);
    }
}

function syncEditCheckboxState(cb) {
    const laptopKey = cb.getAttribute('data-key');
    if (!window.editSelectedLaptopKeys) window.editSelectedLaptopKeys = [];
    
    if (cb.checked) {
        if (!window.editSelectedLaptopKeys.includes(laptopKey)) {
            window.editSelectedLaptopKeys.push(laptopKey);
        }
    } else {
        window.editSelectedLaptopKeys = window.editSelectedLaptopKeys.filter(key => key !== laptopKey);
    }
}

function markAsSelesai(firebaseKey) {
    const perms = window.currentUser.permissions || {};
    if (perms.edit_data !== true && perms.edit_data !== 'true') {
        alert("Anda tidak memiliki hak akses untuk menyelesaikan transaksi.");
        return;
    }

    if(confirm("Apakah unit laptop sudah dikembalikan dan pembayaran lunas?")) {
        const sewaItem = (window.globalDataCloud['penyewaan'] || []).find(item => item._firebaseKey === firebaseKey);
        if (sewaItem) {
            if (sewaItem._linkedLaptopKeys) {
                sewaItem._linkedLaptopKeys.forEach(laptopKey => {
                    const laptopStatusRef = ref(db, `list_laptop/${laptopKey}`);
                    update(laptopStatusRef, { status: "Tersedia" });
                });
            }
            const sewaStatusRef = ref(db, `penyewaan/${firebaseKey}`);
            update(sewaStatusRef, { status: "Lunas" }).then(() => {
                if (window.logActivity) window.logActivity('Ubah', 'penyewaan', `Menyelesaikan pengembalian sewa unit ID #${sewaItem.id} atas nama ${sewaItem.penyewa}.`);
                if (window.showToast) window.showToast("Status penyewaan diubah menjadi Lunas!");
            });
        }
    }
}

function deleteRow(firebaseKey) {
    const perms = window.currentUser.permissions || {};
    if (perms.delete_data !== true && perms.delete_data !== 'true') {
        alert("Anda tidak memiliki hak akses untuk menghapus data.");
        return;
    }

    let confirmationMessage = "Apakah Anda yakin ingin menghapus data ini secara permanen?";
    
    if (window.currentTab === 'user_management') {
        confirmationMessage = "Hapus profil pengguna ini dari database?\n\nKredensial login disarankan juga dihapus secara manual di Firebase Console.";
    }

    const currentDataList = window.globalDataCloud[window.currentTab] || [];
    const targetItem = currentDataList.find(item => item._firebaseKey === firebaseKey);
    if (!targetItem) return;

    if(confirm(confirmationMessage)) {
        if (window.currentTab === 'penyewaan') {
            const sewaItem = (window.globalDataCloud['penyewaan'] || []).find(item => item._firebaseKey === firebaseKey);
            if (sewaItem && sewaItem._linkedLaptopKeys && sewaItem.status !== 'Lunas') {
                sewaItem._linkedLaptopKeys.forEach(laptopKey => {
                    const laptopStatusRef = ref(db, `list_laptop/${laptopKey}`);
                    update(laptopStatusRef, { status: "Tersedia" });
                });
            }
        }
        
        let targetLogDesc = targetItem?.pelanggan || targetItem?.penyewa || targetItem?.klien || targetItem?.merk || targetItem?.nama_user || targetItem?.name || targetItem?.nama_barang || '-';
        
        const targetRowRef = ref(db, `${window.currentTab}/${firebaseKey}`);
        remove(targetRowRef)
            .then(() => {
                if (window.reindexSequentialIdsForTab) {
                    return window.reindexSequentialIdsForTab(window.currentTab, firebaseKey);
                }
            })
            .then(() => {
                if (window.logActivity) window.logActivity('Hapus', window.currentTab, `Menghapus baris data ID #${targetItem.id} (Detail: ${targetLogDesc}) pada modul ${window.currentTab}.`);
            })
            .catch((error) => {
                console.warn('Gagal reindex ID setelah hapus data:', error);
                if (window.showToast) window.showToast('Data terhapus, tetapi pengurutan ID tidak selesai.', 'warning');
            });
    }
}

window.handleEditStatusChange = function(statusValue) {
    const container = document.getElementById('tgl-selesai-container');
    const input = document.getElementById('edit-tgl-selesai');
    if (container && input) {
        if (statusValue === 'Selesai') {
            container.classList.remove('hidden');
            if (!input.value) {
                input.value = new Date().toISOString().slice(0, 10);
            }
        } else {
            container.classList.add('hidden');
            input.value = '';
        }
    }
};

// Pasang fungsi navigasi halaman dan rendering
window.nextPage = function() {
    window.currentPage++;
    renderTable();
};
window.prevPage = function() {
    if (window.currentPage > 1) {
        window.currentPage--;
        renderTable();
    }
};
window.resetPaginationAndRender = function() {
    window.currentPage = 1;
    renderTable();
};

window.renderTableHeader = renderTableHeader;
window.renderTable = renderTable;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.populateLaptopCheckboxes = populateLaptopCheckboxes;
window.populateEditLaptopCheckboxes = populateEditLaptopCheckboxes;
window.syncCheckboxState = syncCheckboxState;
window.syncEditCheckboxState = syncEditCheckboxState;
window.markAsSelesai = markAsSelesai;
window.deleteRow = deleteRow;