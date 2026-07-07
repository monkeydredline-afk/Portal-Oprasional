/* ==========================================================================
   Teknisi Portal - dashboard.js (Modul Statistik & Visualisasi - Robust Version)
   ========================================================================== */
import { parseDate } from './utils.js';

let chartWorkloadInstance = null;
let chartLaptopStockInstance = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function calculateAndRenderStats() {
    try {
        // 1. Amankan inisialisasi awal data global
        if (!window.globalDataCloud) window.globalDataCloud = {};
        
        const nodes = ['services', 'penyewaan', 'cctv', 'list_laptop', 'laptop_display', 'inventaris', 'list_office'];
        nodes.forEach(node => {
            if (!window.globalDataCloud[node]) {
                window.globalDataCloud[node] = [];
            }
        });

        const dataServices = window.globalDataCloud['services'];
        const dataPenyewaan = window.globalDataCloud['penyewaan'];
        const dataCctv = window.globalDataCloud['cctv'];
        const dataLaptop = window.globalDataCloud['list_laptop'];
        const dataDisplayRaw = window.globalDataCloud['laptop_display'];
        const dataInventaris = window.globalDataCloud['inventaris'];
        const dataOffice = window.globalDataCloud['list_office'];

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

        // Gunakan optional chaining (?.) untuk menghindari pembacaan data null
        let filteredServices = dataServices;
        let filteredPenyewaan = dataPenyewaan;
        let filteredCctv = dataCctv;

        const generalBranchVal = window.userBranch || displayBranchVal || gudangBranchVal;
        if (generalBranchVal) {
            filteredServices = filteredServices.filter(item => item?.cabang === generalBranchVal);
            filteredPenyewaan = filteredPenyewaan.filter(item => item?.cabang === generalBranchVal);
            filteredCctv = filteredCctv.filter(item => item?.cabang === generalBranchVal);
        }

        let filteredLaptop = dataLaptop;
        if (gudangBranchVal) {
            filteredLaptop = filteredLaptop.filter(item => item?.cabang === gudangBranchVal);
        }

        let filteredDisplay = dataDisplayRaw;
        if (displayBranchVal) {
            filteredDisplay = filteredDisplay.filter(item => item?.cabang === displayBranchVal);
        }

        let pendingServices = filteredServices.filter(s => s?.status === 'Antrean' || s?.status === 'Proses').length;
        
        let totalOmsetSewa = 0;
        filteredPenyewaan.forEach(p => { totalOmsetSewa += (Number(p?.total_biaya) || 0); });
        
        let activeCctv = filteredCctv.filter(c => c?.status === 'Survei' || c?.status === 'Pengerjaan').length;
        
        let totalLaptopAset = filteredLaptop.length;
        let lapReady = filteredLaptop.filter(l => l?.status === 'Tersedia').length;
        let lapSewa = filteredLaptop.filter(l => l?.status === 'Disewa').length;
        let lapRusak = filteredLaptop.filter(l => l?.status === 'Maintenance').length;
        let lapTerjual = filteredLaptop.filter(l => l?.status === 'Terjual').length;
        let lapStaf = filteredLaptop.filter(l => l?.status === 'Staf').length; 

        if (startVal && endVal) {
            const startDate = new Date(startVal);
            startDate.setHours(0,0,0,0);
            const endDate = new Date(endVal);
            endDate.setHours(23,59,59,999);

            filteredDisplay = filteredDisplay.filter(item => {
                const itemDate = parseDate(item?.tanggal);
                if (!itemDate) return false;
                return itemDate >= startDate && itemDate <= endDate;
            });
        }

        let totalDisplay = filteredDisplay.length;
        let dispReady = filteredDisplay.filter(d => d?.status === 'Ready').length;
        let dispSold = filteredDisplay.filter(d => d?.status === 'Terjual').length;
        let dispOff = filteredDisplay.filter(d => d?.status === 'Gudang').length;

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
            const stokVal = Number(item?.stok) || 0;
            totalInventarisQty += stokVal;
            if (stokVal <= 3) {
                lowStockCount++;
            }
            if (item?.kondisi === 'Baik') {
                baikCount++;
            } else if (item?.kondisi === 'Rusak') {
                rusakCount++;
            }
        });

        setInnerText('stat-inventaris-variants', totalInventarisVariants);
        setInnerText('stat-inventaris-total-qty', totalInventarisQty);
        setInnerText('stat-inventaris-alert-qty', lowStockCount);
        setInnerText('stat-inventaris-condition-summary', `${baikCount} Baik / ${rusakCount} Rusak`);
        
        let inventarisGroupBaik = {};
        let inventarisGroupRusak = {};
        let totalInvBaik = 0;
        let totalInvRusak = 0;

        dataInventaris.forEach(item => {
            let namaText = (item?.nama_barang || '').trim();
            if (!namaText) namaText = "Barang Tanpa Nama";
            
            let stokVal = Number(item?.stok) || 0;
            let kondisi = item?.kondisi || 'Baik';

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
            const lowStockItems = dataInventaris.filter(item => (Number(item?.stok) || 0) <= 3 && item?.kondisi === 'Baik');
            if (lowStockItems.length === 0) {
                criticalBody.innerHTML = `<tr><td colspan="4" class="py-3 text-center text-slate-400 italic">Semua stok inventaris dalam kondisi aman harian.</td></tr>`;
            } else {
                criticalBody.innerHTML = lowStockItems.map(item => `
                    <tr class="hover:bg-rose-50/40 transition">
                        <td class="py-2 px-2 font-semibold text-slate-800">${escapeHtml(item?.nama_barang)}</td>
                        <td class="py-2 px-2 text-slate-500">${escapeHtml(item?.kategori)}</td>
                        <td class="py-2 px-2 text-center font-bold text-rose-600">${item?.stok} ${escapeHtml(item?.satuan)}</td>
                        <td class="py-2 px-2 font-mono font-medium">${escapeHtml(item?.lokasi_rak || 'Belum Diatur')}</td>
                    </tr>
                `).join('');
            }
        }

        const servers = dataOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'utama');
        const members = dataOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'anggota');

        const totalServersCount = servers.length;
        const totalMembersCount = members.length;

        let filledSlots = 0;
        let fullServersCount = 0;

        servers.forEach(srv => {
            const srvEmail = srv?.akun || '';
            const linkedMembers = dataOffice.filter(it => (it?.server_utama || '') === srvEmail && (it?.tipe_akun || '').toString().toLowerCase() === 'anggota').length;
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
                    const hostEmail = server?.akun || '';
                    const linkedMembers = dataOffice.filter(it => (it?.server_utama || '') === hostEmail && (it?.tipe_akun || '').toString().toLowerCase() === 'anggota');
                    
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
                                    <span class="font-semibold text-slate-700 truncate max-w-[120px]">▸ ${escapeHtml(m?.nama_user || 'User')}</span>
                                    <span class="text-[10px] text-slate-500 truncate max-w-[120px] font-mono">${escapeHtml(m?.akun)}</span>
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
            let merkText = (lap?.merk || '').trim();
            let tipeText = (lap?.tipe || '').trim();
            let fullModelName = `${merkText} ${tipeText}`.trim();
            if(!fullModelName || fullModelName === "- -") fullModelName = "Model Tidak Diketahui";
            
            let statusWh = lap?.status || 'Tersedia';

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
            let merkText = (disp?.merk || '').trim();
            let tipeText = (disp?.tipe || '').trim();
            let fullModelName = `${merkText} ${tipeText}`.trim();
            if(!fullModelName || fullModelName === "- -") fullModelName = "Model Tidak Diketahui";
            
            let statusDisp = disp?.status || 'Ready';

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

        let sAntrean = filteredServices.filter(s => s?.status === 'Antrean').length;
        let sProses = filteredServices.filter(s => s?.status === 'Proses').length;
        let sSelesai = filteredServices.filter(s => s?.status === 'Selesai').length;

        let cSurvei = filteredCctv.filter(c => c?.status === 'Survei').length;
        let cKerja = filteredCctv.filter(c => c?.status === 'Pengerjaan').length;
        let cSelesai = filteredCctv.filter(c => c?.status === 'Selesai' || c?.status === 'Selesai / Serah Terima').length;

        // 2. Bungkus inisialisasi visual grafik dengan try-catch agar terisolasi
        try {
            const workloadCanvas = document.getElementById('chartWorkload');
            if (workloadCanvas && typeof Chart !== 'undefined') {
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
        } catch (chartErr) {
            console.warn("Gagal menggambar diagram workload:", chartErr);
        }

        try {
            const laptopStockCanvas = document.getElementById('chartLaptopStock');
            if (laptopStockCanvas && typeof Chart !== 'undefined') {
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
        } catch (chartErr) {
            console.warn("Gagal menggambar diagram stok laptop:", chartErr);
        }

    } catch (globalErr) {
        console.error("Galat fatal pada calculateAndRenderStats():", globalErr);
    }
}

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

function updateDashboardBranchFilters() {
    try {
        let branches = new Set();
        branches.add("Monumen Emmy Saelan");
        branches.add("Perintis");

        if (window.globalDataCloud) {
            (window.globalDataCloud['list_laptop'] || []).forEach(item => { if(item?.cabang) branches.add(item.cabang); });
            (window.globalDataCloud['laptop_display'] || []).forEach(item => { if(item?.cabang) branches.add(item.cabang); });
        }
        
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
    } catch (err) {
        console.warn("Gagal menyinkronkan filter cabang di dashboard:", err);
    }
}

function resetDisplayFilters() {
    const filterBranch = document.getElementById('filter-display-cabang');
    const filterStart = document.getElementById('filter-display-start');
    const filterEnd = document.getElementById('filter-display-end');
    if (filterBranch) filterBranch.value = '';
    if (filterStart) filterStart.value = '';
    if (filterEnd) filterEnd.value = '';
    calculateAndRenderStats();
}

function openDashboardModal() {
    const modal = document.getElementById('dashboard-modal');
    if (modal) {
        modal.classList.remove('hidden');
        calculateAndRenderStats();
    }
}

function closeDashboardModal() {
    const modal = document.getElementById('dashboard-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Ikat ke global window agar HTML dapat memanggil secara langsung
window.calculateAndRenderStats = calculateAndRenderStats;
window.updateDashboardBranchFilters = updateDashboardBranchFilters;
window.resetDisplayFilters = resetDisplayFilters;
window.openDashboardModal = openDashboardModal;
window.closeDashboardModal = closeDashboardModal;
