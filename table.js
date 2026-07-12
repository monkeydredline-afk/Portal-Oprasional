/* ==========================================================================
   Teknisi Portal - table.js (Modul Tampilan Tabel, Paginasi & Modal Edit)
   ========================================================================== */
import { db, ref, update, remove } from './firebase-config.js';
import { tableHeaders, dataKeysMapping } from './templates.js';
import { parseDate, formatDateForInput } from './utils.js';

let activeBahanJasaTicketKey = ''; // Menyimpan kunci tiket aktif untuk penambahan bahan/jasa
window.editSelectedPenjualanItems = []; // Array temporer item terjual saat proses edit transaksi

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
        const specialHeaders = [
            'Kode Toko', 'Harga Jual', 'Cabang', 'Masa Aktif', 'No. WhatsApp', 
            'Tanggal Invite', 'Tanggal Masuk', 'Tanggal Input', 'Tanggal', 
            'Spesifikasi Ringkas', 'Nama User', 'Serial Number (SN)', 'Pemulihan', 
            'No. Referensi', 'No. WA', 'Akun', 'Status Display', 'Stok', 'Kondisi'
        ];
        if (specialHeaders.includes(header)) {
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

    let data = [];
    
    // Logika Konsolidasi Katalog Produk + Laptop Display secara Real-time
    if (window.currentTab === 'katalog_produk') {
        const prodData = window.globalDataCloud['katalog_produk'] || [];
        const dispData = window.globalDataCloud['laptop_display'] || [];

        // Petakan produk biasa ke struktur konsolidasi standar
        const mappedProducts = prodData.map(item => ({
            ...item,
            _sourceNode: 'katalog_produk',
            display_name: item.nama_barang || '-',
            display_kategori: item.kategori || '-',
            display_identitas: item.satuan || 'Pcs',
            display_stok: `${item.stok || 0} ${item.satuan || 'Pcs'}`,
            display_detail: item.catatan || '-',
            display_harga_modal: item.harga_modal || 0,
            display_harga_jual: item.harga_jual || 0
        }));

        // Petakan laptop display ke struktur konsolidasi standar
        const mappedLaptops = dispData.map(item => ({
            ...item,
            _sourceNode: 'laptop_display',
            display_name: `${item.merk || ''} ${item.tipe || ''}`.trim() || '-',
            display_kategori: 'Laptop Display',
            display_identitas: `SN: ${item.sn || 'N/A'}`,
            display_stok: item.status || 'Ready',
            display_detail: item.spek_singkat || item.catatan || '-',
            display_harga_modal: item.harga_modal || 0,
            display_harga_jual: item.harga_jual || 0
        }));

        data = [...mappedProducts, ...mappedLaptops];
    } else {
        data = window.globalDataCloud[window.currentTab] || [];
    }
    
    if (window.currentTab === 'activity_logs') {
        data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else if (window.currentTab === 'services') {
        data.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    } else if (window.currentTab === 'master_jasa' || window.currentTab === 'katalog_produk' || window.currentTab === 'log_penjualan') {
        data.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
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
        
        const nonCabangNodes = ['list_office', 'user_management', 'activity_logs', 'inventaris', 'master_jasa', 'katalog_produk'];
        if (!nonCabangNodes.includes(window.currentTab)) {
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
                const displayId = (window.currentTab === 'services' || window.currentTab === 'master_jasa' || window.currentTab === 'katalog_produk' || window.currentTab === 'log_penjualan') ? (startIndex + index + 1) : val;
                rowHtml += `<td class="px-4 py-3 font-semibold text-slate-500 font-mono">${displayId}</td>`;
            } else if (key === 'no_ref') {
                const refDisplay = (val && val !== '-') ? val : `SRV-Legacy-#${item.id}`;
                rowHtml += `<td class="px-4 py-3 font-bold text-slate-700 font-mono text-xs whitespace-nowrap">${refDisplay}</td>`;
            } else if (key === 'tanggal' || key === 'tanggal_jam') {
                rowHtml += `<td class="px-4 py-3 whitespace-nowrap"><span class="font-mono text-xs text-slate-700">${val}</span></td>`;
            } else if (key === 'tgl_mulai' && window.currentTab === 'penyewaan') {
                const tglSelesai = item.tgl_selesai || '-';
                rowHtml += `<td class="px-4 py-3 whitespace-nowrap"><span class="font-mono text-xs text-slate-700">${val} - ${tglSelesai}</span></td>`;
            } else if ((key === 'biaya' || key === 'total_biaya' || key === 'harga_jual' || key === 'harga_modal' || key === 'display_harga_jual' || key === 'display_harga_modal' || key === 'total_bayar' || key === 'biaya_jasa') && window.currentTab !== 'list_laptop') {
                rowHtml += `<td class="px-4 py-3 font-medium text-slate-900">Rp ${Number(val).toLocaleString('id-ID')}</td>`;
            } else if (key === 'akun' && window.currentTab === 'list_office') {
                rowHtml += `<td class="px-4 py-3 whitespace-nowrap"><span class="font-medium text-slate-800">${val}</span></td>`;
            } else if (key === 'no_wa' && (window.currentTab === 'services' || window.currentTab === 'penyewaan' || window.currentTab === 'log_penjualan')) {
                rowHtml += `
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="flex items-center gap-1.5">
                            <span class="font-mono text-xs text-slate-600">${val}</span>
                            ${val && val !== '-' ? `
                                <button onclick="window.sendWhatsAppNotify('${val}', '${window.currentTab === 'services' ? item.pelanggan : (window.currentTab === 'log_penjualan' ? item.nama_pembeli : item.penyewa)}', '${window.currentTab === 'services' ? item.perangkat : (window.currentTab === 'log_penjualan' ? 'Produk Toko' : item.unit)}', '${window.currentTab === 'services' ? item.biaya : (window.currentTab === 'log_penjualan' ? item.total_bayar : item.total_biaya)}', '${window.currentTab}')" class="text-emerald-500 hover:text-emerald-600 p-0.5 rounded transition hover:scale-110" title="Hubungi via WhatsApp">
                                    <i class="fa-brands fa-whatsapp text-base"></i>
                                </button>
                            ` : ''}
                        </div>
                    </td>`;
            } else if (key === 'permissions' && window.currentTab === 'user_management') {
                const permsDetail = val || {};
                let badges = [];
                if (permsDetail.dashboard) badges.push('Dashboard');
                if (permsDetail.services) badges.push('Services');
                if (permsDetail.penyewaan) badges.push('Sewa');
                if (permsDetail.cctv) badges.push('CCTV');
                if (permsDetail.list_laptop) badges.push('Gudang');
                if (permsDetail.laptop_display) badges.push('Display');
                if (permsDetail.inventaris) badges.push('Inventaris'); 
                if (permsDetail.master_jasa) badges.push('Jasa'); 
                if (permsDetail.katalog_produk) badges.push('Katalog'); 
                if (permsDetail.log_penjualan) badges.push('Penjualan'); 
                if (permsDetail.list_office) badges.push('Office');
                if (permsDetail.user_management) badges.push('Users');
                if (permsDetail.activity_logs) badges.push('Logs');
                if (permsDetail.backup_database) badges.push('Backup'); 
                if (permsDetail.export_excel) badges.push('Export');
                if (permsDetail.import_excel) badges.push('Import');
                if (permsDetail.edit_data) badges.push('Edit');
                if (permsDetail.delete_data) badges.push('Hapus');
                if (permsDetail.cetak_nota) badges.push('Cetak Nota');

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
                    const expiredStr = item.workspace_aktif || item.workspace_expired || item.masa_aktif || '';
                    const expiredDate = parseFlexibleDate(expiredStr);
                    if (expiredDate) {
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        if (expiredDate < today) {
                            displayVal = 'Tidak Aktif';
                        }
                    }
                }

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
                if (displayVal === 'Belum Bayar' || displayVal === 'Maintenance' || displayVal === 'Gudang' || displayVal === 'Tidak Aktif' || displayVal === 'Rusak' || displayVal === 'Cancel') badgeColor = "bg-rose-100 text-rose-800";
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
            } else if (key === 'items_terjual' && window.currentTab === 'log_penjualan') {
                const soldItems = val || [];
                const itemsHtml = soldItems.map(it => `
                    <div class="flex gap-2 text-xs">
                        <span>•</span>
                        <span class="font-medium text-slate-800">${escapeHtml(it.name)}</span>
                        <span class="text-slate-500 font-mono font-semibold">(x${it.qty})</span>
                    </div>
                `).join('');
                rowHtml += `
                    <td class="px-4 py-3 text-xs text-slate-700 whitespace-normal min-w-[200px]">
                        <div class="max-h-24 overflow-y-auto pr-1 space-y-1 custom-table-scrollbar">
                            ${itemsHtml || '<span class="text-slate-400 italic">Tidak ada item</span>'}
                        </div>
                    </td>`;
            } else if (key === 'display_identitas' && window.currentTab === 'katalog_produk') {
                // Tampilkan Serial Number (SN) dengan warna biru toska (cyan)
                if (val.startsWith('SN:')) {
                    const cleanSn = val.replace('SN:', '').trim();
                    rowHtml += `<td class="px-4 py-3 font-mono font-bold text-cyan-600 whitespace-nowrap">${cleanSn}</td>`;
                } else {
                    rowHtml += `<td class="px-4 py-3 text-slate-600 font-semibold font-mono text-xs whitespace-nowrap">${val}</td>`;
                }
            } else if (key === 'display_stok' && window.currentTab === 'katalog_produk') {
                let badgeColor = "bg-slate-100 text-slate-800 border-slate-200";
                if (val === 'Ready' || val === 'Tersedia' || val === 'Aktif') {
                    badgeColor = "bg-emerald-100 text-emerald-800 border-emerald-200/40";
                } else if (val === 'Gudang' || val === 'Tidak Aktif' || val === 'Rusak') {
                    badgeColor = "bg-rose-100 text-rose-800 border-rose-200/40";
                }
                
                if (val.includes('Pcs') || val.includes('Unit')) {
                    rowHtml += `<td class="px-4 py-3 font-semibold text-slate-700 font-mono text-xs whitespace-nowrap">${val}</td>`;
                } else {
                    rowHtml += `<td class="px-4 py-3 whitespace-nowrap"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeColor}">${val}</span></td>`;
                }
            } else if (key === 'display_detail' && window.currentTab === 'katalog_produk') {
                // Deteksi spesifikasi laptop untuk format visual box
                if (val.includes('CPU:') || val.includes('\n')) {
                    rowHtml += `
                        <td class="px-4 py-3 text-xs text-slate-700 whitespace-normal min-w-[240px]">
                            <div class="max-h-28 overflow-y-auto pr-1 font-mono space-y-0.5 custom-table-scrollbar text-slate-600 leading-normal">
                                ${val.replace(/\n/g, '<br>')}
                            </div>
                        </td>`;
                } else {
                    rowHtml += `<td class="px-4 py-3 text-xs font-semibold italic text-slate-500 max-w-xs truncate" title="${val}">${val}</td>`;
                }
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
                rowHtml += `<td class="px-4 py-3 text-xs font-semibold italic text-slate-500 max-w-xs truncate" title="${val}">${val || '-'}</td>`;
            } else if (key === 'name' && window.currentTab === 'list_office') {
                rowHtml += `<td class="px-4 py-3 whitespace-nowrap">${val}</td>`;
            } else if (key === 'cabang') {
                rowHtml += `<td class="px-4 py-3 whitespace-nowrap">${val}</td>`;
            } else if (key === 'masa_aktif' || key === 'workspace_expired') {
                rowHtml += `<td class="px-4 py-3 whitespace-nowrap min-w-[150px]">${val}</td>`;
            } else {
                rowHtml += `<td class="px-4 py-3">${val}</td>`;
            }
        });

        if (window.currentTab === 'services') {
            const perms = window.currentUser.permissions || {};
            const isSuperadmin = (window.currentUser && window.currentUser.email === 'superadmin@wanasatria.com');
            const canPrint = isSuperadmin || perms.cetak_nota === true || perms.cetak_nota === 'true';
            rowHtml += `
                <td class="px-4 py-3 align-middle">
                    <div class="grid grid-cols-2 gap-1.5 w-max">
                        <button onclick="window.openEditModal('${item._firebaseKey}')" 
                                class="w-8 h-8 flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700 transition shadow-sm" 
                                title="Edit / Proses">
                            <i class="fa-solid fa-screwdriver-wrench text-xs"></i>
                        </button>
            `;
            
            if (perms.cetak_nota === true || perms.cetak_nota === 'true') {
                rowHtml += `
                    <button onclick="window.printServiceNota('${item._firebaseKey}')" 
                            class="w-8 h-8 flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 transition shadow-sm" 
                            title="Cetak Struk Thermal (Bukti Pelanggan)">
                        <i class="fa-solid fa-receipt text-xs"></i>
                    </button>
                    <button onclick="window.printLaptopWorkOrder('${item._firebaseKey}')" 
                            class="w-8 h-8 flex items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-600 hover:bg-cyan-100 hover:text-cyan-700 transition shadow-sm" 
                            title="Cetak Lembar Kerja A5 (Label Laptop)">
                        <i class="fa-solid fa-tags text-xs"></i>
                    </button>
                `;
            }
            
            rowHtml += `
                        <button onclick="window.deleteRow('${item._firebaseKey}')" 
                                class="w-8 h-8 flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition shadow-sm" 
                                title="Hapus Servis">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </td>
            `;
        } else if (window.currentTab === 'master_jasa') {
            rowHtml += `
                <td class="px-4 py-3 flex items-center space-x-2">
                    <button onclick="window.openEditModal('${item._firebaseKey}')" class="text-amber-500 hover:text-amber-700 p-1 rounded hover:bg-amber-50 transition" title="Edit Data Jasa">
                        <i class="fa-solid fa-pen-to-square text-base"></i>
                    </button>
                    <button onclick="window.deleteMasterJasa('${item._firebaseKey}', ${JSON.stringify(item).replace(/"/g, '&quot;')})" class="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition" title="Hapus Jasa">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
        } else if (window.currentTab === 'katalog_produk') {
            if (item._sourceNode === 'katalog_produk') {
                rowHtml += `
                    <td class="px-4 py-3 flex items-center space-x-2">
                        <button onclick="window.openEditModal('${item._firebaseKey}')" class="text-amber-500 hover:text-amber-700 p-1 rounded hover:bg-amber-50 transition" title="Edit Produk">
                            <i class="fa-solid fa-pen-to-square text-base"></i>
                        </button>
                        <button onclick="window.deleteKatalogProduk('${item._firebaseKey}', ${JSON.stringify(item).replace(/"/g, '&quot;')})" class="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition" title="Hapus Produk">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                `;
            } else {
                rowHtml += `
                    <td class="px-4 py-3 text-slate-400 text-xs italic font-semibold whitespace-nowrap min-w-[120px]">
                        <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 block text-center" title="Pengeditan unit display hanya dapat diproses di menu Laptop Display">
                            <i class="fa-solid fa-desktop mr-1"></i> Aset Display
                        </span>
                    </td>
                `;
            }
        } else if (window.currentTab === 'log_penjualan') {
            rowHtml += `
                <td class="px-4 py-3 flex items-center space-x-2">
                    <button onclick="window.openEditModal('${item._firebaseKey}')" class="text-amber-500 hover:text-amber-700 p-1 rounded hover:bg-amber-50 transition" title="Edit Transaksi">
                        <i class="fa-solid fa-pen-to-square text-base"></i>
                    </button>
                    <button onclick="window.deleteLogPenjualan('${item._firebaseKey}', ${JSON.stringify(item).replace(/"/g, '&quot;')})" class="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition" title="Hapus Transaksi">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
        } else if (window.currentTab === 'penyewaan') {
            rowHtml += `
                <td class="px-4 py-3 align-middle">
                    <div class="grid grid-cols-2 gap-1.5 w-max">
            `;
            
            if (item.status !== 'Lunas' && item.status !== 'Selesai' && (perms.edit_data === true || perms.edit_data === 'true')) {
                rowHtml += `
                    <button onclick="window.markAsSelesai('${item._firebaseKey}')" 
                            class="w-8 h-8 flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 transition shadow-sm" 
                            title="Selesai / Kembalikan Unit">
                        <i class="fa-solid fa-circle-check text-xs"></i>
                    </button>
                `;
            }
            
            if (perms.edit_data === true || perms.edit_data === 'true') {
                rowHtml += `
                    <button onclick="window.openEditModal('${item._firebaseKey}')" 
                            class="w-8 h-8 flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700 transition shadow-sm" 
                            title="Edit Data">
                        <i class="fa-solid fa-pen-to-square text-xs"></i>
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
            
            rowHtml += `
                    </div>
                </td>
            `;
        } else {
            rowHtml += `<td class="px-4 py-3 flex items-center space-x-2">`;
            
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
            
            rowHtml += `</td>`;
        }
        
        rowHtml += `</tr>`;
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

window.toggleRowActionDropdown = function(event, key) {
    if (event) event.stopPropagation();
    
    const allDropdowns = document.querySelectorAll('.row-action-dropdown');
    allDropdowns.forEach(el => {
        if (el.id !== `srv-action-dropdown-${key}`) {
            el.classList.add('hidden');
        }
    });

    const targetDropdown = document.getElementById(`srv-action-dropdown-${key}`);
    if (targetDropdown) {
        targetDropdown.classList.toggle('hidden');
    }
};

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

    let cabangEditHtml = '';
    if (!window.userBranch) {
        cabangEditHtml = `
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Cabang Toko</label>
                <select id="edit-cabang" class="w-full border p-2 text-sm rounded-lg bg-white">
                    <option value="Monumen Emmy Saelan" ${targetItem.cabang === 'Monumen Emmy Saelan' ? 'selected' : ''}>Monumen Emmy Saelan</option>
                    <option value="Perintis" ${targetItem.cabang === 'Perintis' ? 'selected' : ''}>Perintis</option>
                </select>
            </div>
        `;
    } else {
        cabangEditHtml = `
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Cabang Toko</label>
                <input type="text" id="edit-cabang" value="${window.userBranch}" readonly class="w-full border p-2 text-sm rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed focus:outline-none">
            </div>
        `;
    }

    if (window.currentTab === 'services') {
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

        const itemsTerpakai = targetItem.items_terpakai || [];
        let itemsRowsHtml = '';
        if (itemsTerpakai.length === 0) {
            itemsRowsHtml = `<tr><td colspan="6" class="p-4 text-center text-slate-400 italic font-semibold">Belum ada bahan atau jasa terpasang pada servis ini.</td></tr>`;
        } else {
            itemsTerpakai.forEach((it, idx) => {
                const subtotal = (Number(it.qty) || 1) * (Number(it.price) || 0);
                itemsRowsHtml += `
                    <tr class="hover:bg-slate-50 border-b">
                        <td class="p-2 font-semibold text-slate-800">${escapeHtml(it.name)}</td>
                        <td class="p-2 text-center"><span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold ${it.type === 'Produk' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">${it.type}</span></td>
                        <td class="p-2 text-center font-bold font-mono">${it.qty}</td>
                        <td class="p-2 text-right font-mono">Rp ${Number(it.price).toLocaleString('id-ID')}</td>
                        <td class="p-2 text-right font-bold text-slate-900 font-mono">Rp ${subtotal.toLocaleString('id-ID')}</td>
                        <td class="p-2 text-center">
                            <button type="button" onclick="window.removeBahanJasaFromTicket('${firebaseKey}', ${idx})" class="text-rose-500 hover:text-rose-700 p-1" title="Hapus Item Ini">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        fieldsContainer.innerHTML = `
            ${cabangEditHtml}
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Pelanggan</label><input type="text" id="edit-pelanggan" value="${targetItem.pelanggan || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">No. WhatsApp</label><input type="tel" id="edit-no_wa" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')" value="${targetItem.no_wa || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Perangkat</label><input type="text" id="edit-perangkat" value="${targetItem.perangkat || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            
            <div>
                <label class="block text-xs font-bold text-cyan-600 mb-1">Total Biaya Akhir (Rp)</label>
                <input type="text" id="edit-biaya" value="${window.formatCurrencyInput(String(targetItem.biaya || '0'))}" readonly class="w-full border border-cyan-300 p-2 text-sm font-black text-cyan-700 bg-cyan-50/50 rounded-lg cursor-not-allowed focus:outline-none">
            </div>

            <div class="md:col-span-2"><label class="block text-xs font-semibold text-slate-500 mb-1">Gejala / Kerusakan & Kelengkapan</label><textarea id="edit-kerusakan" rows="2" required class="w-full border p-2 text-sm rounded-lg">${targetItem.kerusakan || ''}</textarea></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Teknisi Penanggung Jawab</label><input type="text" id="edit-teknisi" value="${teknisiVal}" ${teknisiReadonlyAttr}></div>
            <div class="md:col-span-2"><label class="block text-xs font-semibold text-slate-500 mb-1">Hasil Analisa / Tindakan Teknisi</label><textarea id="edit-tindakan_teknisi" rows="2" placeholder="Tuliskan tindakan servis, perbaikan komponen, dll." class="w-full border p-2 text-sm rounded-lg">${targetItem.tindakan_teknisi || ''}</textarea></div>
            
            <!-- SUB-TABEL BAHAN & JASA TERPAKAI -->
            <div class="md:col-span-2 border-t pt-3.5 space-y-2">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5"><i class="fa-solid fa-boxes-packing text-cyan-600"></i> Bahan & Jasa Pengerjaan Terpakai</span>
                    <button type="button" onclick="window.openAddBahanJasaModal('${firebaseKey}')" class="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 shadow-sm">
                        <i class="fa-solid fa-circle-plus"></i> Tambah Bahan / Jasa
                    </button>
                </div>
                <div class="border rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto custom-table-scrollbar">
                    <table class="w-full text-left text-xs border-collapse">
                        <thead class="sticky top-0 bg-slate-100 border-b text-slate-500 font-extrabold uppercase tracking-wide">
                            <tr>
                                <th class="p-2">Nama Barang / Jasa</th>
                                <th class="p-2 text-center">Jenis</th>
                                <th class="p-2 text-center">Qty</th>
                                <th class="p-2 text-right">Harga Satuan</th>
                                <th class="p-2 text-right">Subtotal</th>
                                <th class="p-2 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y text-slate-700">
                            ${itemsRowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>

            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Status</label>
                <select id="edit-status" onchange="window.handleEditStatusChange(this.value)" class="w-full border p-2 text-sm rounded-lg">
                    <option value="Antrean" ${targetItem.status === 'Antrean' ? 'selected' : ''}>Antrean</option>
                    <option value="Proses" ${targetItem.status === 'Proses' ? 'selected' : ''}>Proses Pengecekan</option>
                    <option value="Selesai" ${targetItem.status === 'Selesai' ? 'selected' : ''}>Selesai</option>
                    <option value="Cancel" ${targetItem.status === 'Cancel' ? 'selected' : ''}>Cancel</option>
                </select>
            </div>
            
            <div id="tgl-selesai-container" class="${targetItem.status === 'Selesai' ? '' : 'hidden'}">
                <label class="block text-xs font-semibold text-slate-500 mb-1">Tanggal Selesai Servis</label>
                <input type="date" id="edit-tgl-selesai" value="${targetItem.tgl_selesai || ''}" class="w-full border p-2 text-sm rounded-lg">
            </div>
        `;
    } else if (window.currentTab === 'master_jasa') {
        fieldsContainer.innerHTML = `
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Nama Tindakan Jasa</label>
                <input type="text" id="edit-nama_jasa" value="${targetItem.nama_jasa || ''}" required class="w-full border p-2 text-sm rounded-lg">
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Biaya Standar Jasa (Rp)</label>
                <input type="text" id="edit-biaya_jasa" value="${window.formatCurrencyInput(String(targetItem.biaya_jasa || ''))}" oninput="this.value = window.formatCurrencyInput(this.value)" required class="w-full border p-2 text-sm rounded-lg">
            </div>
        `;
    } else if (window.currentTab === 'katalog_produk') {
        fieldsContainer.innerHTML = `
            ${cabangEditHtml}
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Barang / Aksesoris</label><input type="text" id="edit-nama_barang" value="${targetItem.nama_barang || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Kategori</label><input type="text" id="edit-kategori" value="${targetItem.kategori || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="block text-xs font-semibold text-slate-500 mb-1">Stok Fisik</label><input type="number" id="edit-stok" value="${targetItem.stok || '0'}" required class="w-full border p-2 text-sm rounded-lg"></div>
                <div><label class="block text-xs font-semibold text-slate-500 mb-1">Satuan</label><input type="text" id="edit-satuan" value="${targetItem.satuan || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            </div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Harga Modal (Rp)</label><input type="text" id="edit-harga_modal" value="${window.formatCurrencyInput(String(targetItem.harga_modal || ''))}" oninput="this.value = window.formatCurrencyInput(this.value)" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Harga Jual (Rp)</label><input type="text" id="edit-harga_jual" value="${window.formatCurrencyInput(String(targetItem.harga_jual || ''))}" oninput="this.value = window.formatCurrencyInput(this.value)" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div class="md:col-span-2"><label class="block text-xs font-semibold text-slate-500 mb-1">Catatan Tambahan</label><input type="text" id="edit-catatan" value="${targetItem.catatan || ''}" class="w-full border p-2 text-sm rounded-lg"></div>
        `;
    } else if (window.currentTab === 'log_penjualan') {
        window.editSelectedPenjualanItems = targetItem.items_terjual ? [...targetItem.items_terjual] : [];
        fieldsContainer.innerHTML = `
            ${cabangEditHtml}
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Pembeli</label><input type="text" id="edit-nama_pembeli" value="${targetItem.nama_pembeli || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">No. WhatsApp</label><input type="tel" id="edit-no_wa" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')" value="${targetItem.no_wa || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div class="md:col-span-2 space-y-1.5 border-t border-slate-200 pt-3 mt-1">
                <label class="block text-xs font-bold text-slate-600 uppercase tracking-wide">Edit Item Penjualan (Tinjau Kuantitas)</label>
                <div id="edit-penjualan-items-container" class="space-y-2 bg-slate-50 border p-3 rounded-lg max-h-48 overflow-y-auto custom-table-scrollbar">
                    ${(targetItem.items_terjual || []).map((it, idx) => `
                        <div class="flex items-center justify-between text-xs py-1.5 border-b">
                            <span class="font-bold text-slate-800">${escapeHtml(it.name)} (Rp ${Number(it.price).toLocaleString('id-ID')})</span>
                            <div class="flex items-center space-x-1">
                                <span class="text-[10px] text-slate-400 font-bold uppercase">Qty</span>
                                <input type="number" min="1" id="edit-sale-qty-${idx}" value="${it.qty}" onchange="window.updateEditSaleQty(${idx}, this.value)" class="w-14 border border-gray-300 rounded p-1 text-center font-bold bg-white">
                            </div>
                        </div>
                    `).join('')}
                </div>
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
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Harga Jual Display (Rp)</label><input type="text" id="edit-harga_jual" value="${window.formatCurrencyInput(String(targetItem.harga_jual || ''))}" oninput="this.value = window.formatCurrencyInput(this.value)" required class="w-full border p-2 text-sm rounded-lg"></div>
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
            ${cabangEditHtml}
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

            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Total Biaya (Rp)</label><input type="text" id="edit-total_biaya" value="${window.formatCurrencyInput(String(targetItem.total_biaya || ''))}" oninput="this.value = window.formatCurrencyInput(this.value)" required class="w-full border p-2 text-sm rounded-lg"></div>
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
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Name (Device / Identitas)</label><input type="text" id="edit-name" value="${targetItem.name || ''}" class="w-full border p-2 text-sm rounded-lg"></div>
            
            <div id="edit-masa-aktif-container" class="${targetItem.tipe_akun === 'Anggota' ? 'hidden' : ''}">
                <label class="block text-xs font-semibold text-slate-500 mb-1">Masa Aktif</label>
                <input type="text" id="edit-masa_aktif" value="${targetItem.masa_aktif || ''}" required class="w-full border p-2 text-sm rounded-lg">
            </div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Status Lisensi</label><select id="edit-status" class="w-full border p-2 text-sm rounded-lg bg-white"><option value="Aktif" ${targetItem.status === 'Aktif' ? 'selected' : ''}>Aktif</option><option value="Tidak Aktif" ${targetItem.status === 'Tidak Aktif' ? 'selected' : ''}>Tidak Aktif</option><option value="Permanen" ${targetItem.status === 'Permanen' ? 'selected' : ''}>Permanen</option></select></div>
        `;
    } else if (window.currentTab === 'user_management') {
        fieldsContainer.innerHTML = `
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Nama Lengkap</label><input type="text" id="edit-name-user" value="${targetItem.name || ''}" required class="w-full border p-2 text-sm rounded-lg"></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Email Akun</label><input type="email" id="edit-email-user" value="${targetItem.email || ''}" required class="w-full border p-2 text-sm rounded-lg" readonly></div>
            <div><label class="block text-xs font-semibold text-slate-500 mb-1">Password Baru (Kosongkan jika tak diubah)</label><input type="password" id="edit-password-user" class="w-full border p-2 text-sm rounded-lg"></div>
            
            <div>
                <label class="block text-xs font-semibold text-slate-500 mb-1">Posisi Struktural</label>
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
                            <input type="checkbox" id="edit-perm-master_jasa" ${targetItem.permissions?.master_jasa ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Master Jasa</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-katalog_produk" ${targetItem.permissions?.katalog_produk ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Katalog Produk</span>
                        </label>
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-log_penjualan" ${targetItem.permissions?.log_penjualan ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Log Penjualan</span>
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
                        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input type="checkbox" id="edit-perm-cetak" ${targetItem.permissions?.cetak_nota ? 'checked' : ''} class="rounded text-cyan-600 border-gray-300">
                            <span>Cetak Nota</span>
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
        const editServerSelect = document.getElementById('edit-server_utama');
        const editOfficeSelect = document.getElementById('edit-office-select');
        const editMasaAktifCont = document.getElementById('edit-masa-aktif-container');
        const editMasaAktifInput = document.getElementById('edit-masa_aktif');

        if (editServerSelect) {
            const master = window.globalDataCloud['list_office'] || [];
            const utamaAccounts = master.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'utama');
            const options = utamaAccounts.map(utama => {
                const email = utama?.akun || '';
                const linkedMembers = master.filter(it => (it?.server_utama || '') === email && (it?.tipe_akun || '').toString().toLowerCase() === 'anggota' && it._firebaseKey !== targetItem._firebaseKey);
                const slotsLeft = Math.max(0, 5 - linkedMembers.length);
                if (slotsLeft > 0 || (targetItem.server_utama && targetItem.server_utama === email)) {
                    return `<option value="${escapeHtml(email)}"${targetItem.server_utama === email ? ' selected' : ''}>${escapeHtml(email)} (Sisa ${slotsLeft} Slot)</option>`;
                }
                return '';
            }).filter(Boolean).join('');
            editServerSelect.innerHTML = `<option value="">(Pilih Server Utama)</option>` + options;
        }

        function handleEditTipeChange() {
            if (!editTipe) return;
            const v = editTipe.value || '';
            const srvCont = document.getElementById('edit-server-container');
            if (v === 'Anggota') {
                if (srvCont) srvCont.style.display = '';
                if (editMasaAktifCont) editMasaAktifCont.classList.add('hidden'); 
            } else {
                if (srvCont) srvCont.style.display = 'none';
                if (editMasaAktifCont) editMasaAktifCont.classList.remove('hidden'); 
                if (editServerSelect) editServerSelect.value = '';
                if (editOfficeSelect) editOfficeSelect.disabled = false;
            }
        }

        if (editTipe) {
            editTipe.addEventListener('change', handleEditTipeChange);
            setTimeout(() => { handleEditTipeChange(); }, 50);
        }

        if (editServerSelect) {
            editServerSelect.addEventListener('change', () => {
                const v = editServerSelect.value || '';
                if (v) {
                    if (editOfficeSelect) {
                        editOfficeSelect.value = '365 Family';
                        editOfficeSelect.disabled = true;
                    }
                    const master = window.globalDataCloud['list_office'] || [];
                    const matchedServer = master.find(it => (it?.akun || '').toString() === v && (it?.tipe_akun || '').toString().toLowerCase() === 'utama');
                    if (matchedServer && editMasaAktifInput) {
                        editMasaAktifInput.value = matchedServer.masa_aktif || '';
                    }
                } else {
                    if (editOfficeSelect) {
                        editOfficeSelect.disabled = false;
                    }
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
    if (!window.editSelectedLaptopKeys) window.editSelectedPenjualanItems = [];
    
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

// ==========================================================================
// 1. DYNAMIC INJECTION FOR BAHAN / JASA INPUT FORM (EMBEDDED STYLE - GAMBAR 2)
// ==========================================================================
function ensureBahanJasaModalExists() {
    if (document.getElementById('add-bahan-jasa-modal')) return;
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = `
        <div id="add-bahan-jasa-modal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-xl shadow-xl border max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <header class="bg-slate-900 text-white p-4 flex justify-between items-center">
                    <h3 class="font-bold flex items-center gap-2">
                        <i class="fa-solid fa-cart-plus text-cyan-400"></i> Tambah Bahan atau Jasa
                    </h3>
                    <button type="button" onclick="window.closeAddBahanJasaModal()" class="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </header>
                <form id="add-bahan-jasa-form" onsubmit="window.saveBahanJasaItem(event)" class="p-6 space-y-4" autocomplete="off">
                    <div>
                        <label class="block text-xs font-semibold text-slate-500 mb-1">Jenis Item</label>
                        <select id="bj-type" required onchange="window.onBahanJasaTypeChange()" class="w-full border p-2 text-sm rounded-lg bg-white">
                            <option value="Jasa">Jasa / Tindakan</option>
                            <option value="Produk">Bahan / Sparepart</option>
                        </select>
                    </div>
                    <!-- SEARCH & STATIC SCROLLBOX CONTAINER (GAYA GAMBAR 2) -->
                    <div class="space-y-2">
                        <label class="block text-xs font-semibold text-slate-500 mb-1">Nama Barang / Jasa</label>
                        <div class="relative">
                            <i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-400 text-xs"></i>
                            <input type="text" id="bj-name" required oninput="window.onBahanJasaNameInput()" class="w-full pl-8 pr-4 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500" placeholder="Ketik kata kunci untuk mencari...">
                        </div>
                        
                        <!-- Box kontainer statis di dalam form flow (tidak menutupi elemen lain) -->
                        <div id="bj-autocomplete-results" class="border border-gray-300 rounded-xl p-3 max-h-48 overflow-y-auto bg-white space-y-2 custom-table-scrollbar">
                            <div class="text-center py-6 text-slate-400 text-xs italic">
                                Ketik nama barang/jasa di kolom pencarian di atas...
                            </div>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-semibold text-slate-500 mb-1">Kuantitas (Qty)</label>
                            <input type="number" id="bj-qty" min="1" value="1" required class="w-full border p-2 text-sm rounded-lg">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-slate-500 mb-1">Harga Satuan (Rp)</label>
                            <input type="text" id="bj-price" required oninput="this.value = window.formatCurrencyInput(this.value)" class="w-full border p-2 text-sm rounded-lg" placeholder="0">
                        </div>
                    </div>
                    <div class="flex justify-end space-x-3 pt-4 border-t">
                        <button type="button" onclick="window.closeAddBahanJasaModal()" class="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-100 font-medium transition">Batal</button>
                        <button type="submit" class="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm transition flex items-center space-x-2">
                            <i class="fa-solid fa-circle-check"></i> <span>Tambahkan</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modalDiv.firstElementChild);
}

// ==========================================================================
// 2. DIALOG OPERATIONAL HANDLERS FOR ADDING/DELETING TICKET MATERIALS
// ==========================================================================
window.openAddBahanJasaModal = function(ticketKey) {
    ensureBahanJasaModalExists();
    activeBahanJasaTicketKey = ticketKey;
    
    document.getElementById('add-bahan-jasa-form').reset();
    window.onBahanJasaTypeChange();
    
    const modal = document.getElementById('add-bahan-jasa-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeAddBahanJasaModal = function() {
    const modal = document.getElementById('add-bahan-jasa-modal');
    if (modal) modal.classList.add('hidden');
};

// ==========================================================================
// 3. LOGIKA CUSTOM AUTOCOMPLETE PADA INPUT BAHAN / JASA (STOK OPNAME STYLE)
// ==========================================================================

window.onBahanJasaTypeChange = function() {
    const nameInput = document.getElementById('bj-name');
    const priceInput = document.getElementById('bj-price');
    const resultsBox = document.getElementById('bj-autocomplete-results');
    
    if (nameInput) {
        nameInput.value = '';
        delete nameInput.dataset.productKey;
    }
    if (priceInput) {
        priceInput.value = '';
    }
    if (resultsBox) {
        resultsBox.innerHTML = `
            <div class="text-center py-6 text-slate-400 text-xs italic">
                Ketik nama barang/jasa di kolom pencarian di atas...
            </div>
        `;
    }
};

window.onBahanJasaNameInput = function() {
    const typeSelect = document.getElementById('bj-type');
    const nameInput = document.getElementById('bj-name');
    const resultsBox = document.getElementById('bj-autocomplete-results');
    if (!typeSelect || !nameInput || !resultsBox) return;

    const query = nameInput.value.toLowerCase().trim();
    
    // Jika kolom pencarian kosong, bersihkan dan tampilkan petunjuk
    if (query.length < 1) {
        resultsBox.innerHTML = `
            <div class="text-center py-6 text-slate-400 text-xs italic">
                Ketik nama barang/jasa di kolom pencarian di atas...
            </div>
        `;
        return;
    }

    const type = typeSelect.value;
    let html = '';

    if (type === 'Jasa') {
        const list = window.globalDataCloud['master_jasa'] || [];
        const filtered = list.filter(item => (item.nama_jasa || '').toLowerCase().includes(query));
        
        if (filtered.length === 0) {
            html = `<div class="p-4 text-center text-xs text-slate-400 italic">Jasa tidak ditemukan di database</div>`;
        } else {
            filtered.forEach(item => {
                const name = item.nama_jasa;
                const price = Number(item.biaya_jasa) || 0;
                html += `
                    <div onclick="window.selectBahanJasaAutocomplete(this, '${escapeHtml(name)}', ${price}, '')" 
                         class="bj-item-card flex items-start space-x-3 p-3 bg-white border border-slate-200 hover:border-cyan-300 hover:bg-slate-50/50 rounded-xl transition cursor-pointer text-xs shadow-sm">
                        <div class="flex-grow space-y-1">
                            <div class="flex items-center gap-1.5">
                                <span class="font-extrabold text-slate-800 text-sm">🛠️ ${escapeHtml(name)}</span>
                            </div>
                            <div class="text-[11px] text-slate-500 font-semibold">
                                Tindakan / Jasa Standar Toko
                            </div>
                        </div>
                        <div class="text-right self-center">
                            <span class="font-extrabold text-slate-700 text-sm font-mono">Rp ${price.toLocaleString('id-ID')}</span>
                        </div>
                    </div>
                `;
            });
        }
    } else {
        const list = window.globalDataCloud['katalog_produk'] || [];
        const filtered = list.filter(item => (item.nama_barang || '').toLowerCase().includes(query));
        
        if (filtered.length === 0) {
            html = `<div class="p-4 text-center text-xs text-slate-400 italic">Bahan/aksesoris tidak ditemukan di database</div>`;
        } else {
            filtered.forEach(item => {
                const name = item.nama_barang;
                const price = Number(item.harga_jual) || 0;
                const stok = Number(item.stok) || 0;
                const productKey = item._firebaseKey;
                const isOutOfStock = stok <= 0;

                html += `
                    <div onclick="${isOutOfStock ? 'void(0)' : `window.selectBahanJasaAutocomplete(this, '${escapeHtml(name)}', ${price}, '${productKey}')`}" 
                         class="bj-item-card flex items-start space-x-3 p-3 bg-white border border-slate-200 hover:border-cyan-300 hover:bg-slate-50/50 rounded-xl transition cursor-pointer text-xs shadow-sm ${isOutOfStock ? 'opacity-50 cursor-not-allowed bg-rose-50/20' : ''}">
                        <div class="flex-grow space-y-1">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="font-extrabold text-slate-800 text-sm">📦 ${escapeHtml(name)}</span>
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${isOutOfStock ? 'bg-rose-100 text-rose-800 border-rose-200/40' : 'bg-emerald-100 text-emerald-800 border-emerald-200/40'}">
                                    Stok: ${stok} ${escapeHtml(item.satuan)}
                                </span>
                            </div>
                            <div class="text-[11px] text-slate-500 font-semibold">
                                Kategori: <span class="text-slate-700 font-bold">${escapeHtml(item.kategori || 'Suku Cadang')}</span>
                            </div>
                        </div>
                        <div class="text-right self-center">
                            <span class="font-extrabold text-slate-700 text-sm font-mono">Rp ${price.toLocaleString('id-ID')}</span>
                        </div>
                    </div>
                `;
            });
        }
    }

    resultsBox.innerHTML = html;
};

window.selectBahanJasaAutocomplete = function(element, name, price, productKey) {
    const nameInput = document.getElementById('bj-name');
    const priceInput = document.getElementById('bj-price');

    if (nameInput) {
        nameInput.value = name;
        if (productKey) {
            nameInput.dataset.productKey = productKey;
        } else {
            delete nameInput.dataset.productKey;
        }
    }
    if (priceInput) {
        priceInput.value = window.formatCurrencyInput(String(price));
    }

    // Bersihkan highlight aktif pada seluruh kartu di dalam kontainer
    const allCards = document.querySelectorAll('.bj-item-card');
    allCards.forEach(card => {
        card.classList.remove('bg-cyan-50/70', 'border-cyan-400', 'ring-1', 'ring-cyan-400');
        card.classList.add('bg-white', 'border-slate-200');
    });

    // Berikan efek highlight aktif biru toska pada kartu yang diklik
    if (element) {
        element.classList.remove('bg-white', 'border-slate-200');
        element.classList.add('bg-cyan-50/70', 'border-cyan-400', 'ring-1', 'ring-cyan-400');
    }
};

// Deteksi klik di luar (Modifikasi agar kontainer statis tidak ikut tersembunyi)
document.addEventListener('click', function(e) {
    // Kontainer hasil pencarian bahan/jasa dibiarkan statis mengikuti alur form
    // Jadi tidak disembunyikan lewat klik luar, mirip seperti list pada gambar 2.
});

// ==========================================================================
// 4. PENYIMPANAN DATA BAHAN / JASA (DENGAN VALIDASI VALID MATCHING)
// ==========================================================================
window.saveBahanJasaItem = function(event) {
    event.preventDefault();
    if (!activeBahanJasaTicketKey) return;
    
    const typeSelect = document.getElementById('bj-type');
    const nameInput = document.getElementById('bj-name');
    const qtyInput = document.getElementById('bj-qty');
    const priceInput = document.getElementById('bj-price');
    
    if (!typeSelect || !nameInput || !qtyInput || !priceInput) return;
    
    const type = typeSelect.value;
    const name = nameInput.value;
    const qtyValue = Number(qtyInput.value) || 1;
    const priceValue = Number(priceInput.value.replace(/\D/g, '')) || 0;
    
    const services = window.globalDataCloud['services'] || [];
    const ticket = services.find(item => item._firebaseKey === activeBahanJasaTicketKey);
    if (!ticket) return;
    
    const newItem = {
        name: name,
        type: type,
        qty: qtyValue,
        price: priceValue
    };

    // Validasi ketat: Tidak boleh menulis nama baru secara bebas (harus dari database) [3]
    if (type === 'Produk') {
        const productKey = nameInput.dataset.productKey;
        const katalog = window.globalDataCloud['katalog_produk'] || [];
        const matchProd = katalog.find(item => item.nama_barang === name && item._firebaseKey === productKey);
        
        if (!matchProd) {
            alert("Galat: Nama produk harus dipilih dari hasil pencarian katalog yang terdaftar!");
            return;
        }

        const currentStok = Number(matchProd.stok) || 0;
        if (currentStok < qtyValue) {
            if (!confirm(`Peringatan: Stok fisik hanya tersisa ${currentStok} unit. Tetap lanjutkan?`)) {
                return;
            }
        }
        newItem._productKey = matchProd._firebaseKey;

        if (window.adjustKatalogStock) {
            window.adjustKatalogStock(matchProd._firebaseKey, -qtyValue);
        }
    } else { // Jasa
        const list = window.globalDataCloud['master_jasa'] || [];
        const matchJasa = list.find(item => item.nama_jasa === name);

        if (!matchJasa) {
            alert("Galat: Nama tindakan jasa harus dipilih dari hasil pencarian master jasa yang terdaftar!");
            return;
        }
    }
    
    const updatedItems = [...(ticket.items_terpakai || []), newItem];
    const newTotalBiaya = updatedItems.reduce((sum, it) => sum + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
    
    const ticketRef = ref(db, `services/${activeBahanJasaTicketKey}`);
    update(ticketRef, {
        items_terpakai: updatedItems,
        biaya: String(newTotalBiaya)
    }).then(() => {
        if (window.showToast) window.showToast("Bahan/Jasa berhasil ditambahkan!");
        window.closeAddBahanJasaModal();
        window.openEditModal(activeBahanJasaTicketKey);
    }).catch(err => {
        alert("Gagal menambahkan rincian item: " + err.message);
    });
};

window.removeBahanJasaFromTicket = function(ticketKey, index) {
    if (!confirm("Apakah Anda yakin ingin menghapus item ini dari rincian pengerjaan?")) return;
    
    const services = window.globalDataCloud['services'] || [];
    const ticket = services.find(item => item._firebaseKey === ticketKey);
    if (!ticket || !ticket.items_terpakai) return;
    
    const itemToRemove = ticket.items_terpakai[index];
    
    if (itemToRemove && itemToRemove.type === 'Produk') {
        const prodKey = itemToRemove._productKey || itemToRemove.productKey;
        if (prodKey && window.adjustKatalogStock) {
            window.adjustKatalogStock(prodKey, (Number(itemToRemove.qty) || 1));
        } else {
            const katalog = window.globalDataCloud['katalog_produk'] || [];
            const matchProd = katalog.find(item => item.nama_barang === itemToRemove.name);
            if (matchProd && window.adjustKatalogStock) {
                window.adjustKatalogStock(matchProd._firebaseKey, (Number(itemToRemove.qty) || 1));
            }
        }
    }
    
    const updatedItems = [...ticket.items_terpakai];
    updatedItems.splice(index, 1);
    const newTotalBiaya = updatedItems.reduce((sum, it) => sum + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
    
    const ticketRef = ref(db, `services/${ticketKey}`);
    update(ticketRef, {
        items_terpakai: updatedItems,
        biaya: String(newTotalBiaya)
    }).then(() => {
        if (window.showToast) window.showToast("Item berhasil dihapus.");
        window.openEditModal(ticketKey);
    }).catch(err => {
        alert("Gagal menghapus item: " + err.message);
    });
};

window.updateEditSaleQty = function(idx, val) {
    if (window.editSelectedPenjualanItems && window.editSelectedPenjualanItems[idx]) {
        window.editSelectedPenjualanItems[idx].qty = Math.max(1, Number(val) || 1);
        window.editSelectedPenjualanItems[idx].subtotal = window.editSelectedPenjualanItems[idx].qty * window.editSelectedPenjualanItems[idx].price;
    }
};

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
