/* ==========================================================================
   Teknisi Portal - dashboard.js (Modul Statistik & Visualisasi - Full Version)
   ========================================================================== */
import { parseDate } from './utils.js';

let chartServicesInstance = null;
let chartServicesLineInstance = null; 
let chartCctvInstance = null;
let chartCctvLineInstance = null; 
let chartLaptopStockInstance = null;
let chartLaptopStockStackedInstance = null; 

let activeLaptopGudangLayoutMode = 'analytics'; // Default: Tampilan Analitis

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
        const filterInventarisCabang = document.getElementById('filter-inventaris-cabang');

        if (window.userBranch) {
            if (filterDisplayCabang) filterDisplayCabang.style.display = 'none';
            if (filterGudangCabang) filterGudangCabang.style.display = 'none';
            if (filterInventarisCabang) filterInventarisCabang.style.display = 'none';
        } else {
            if (filterDisplayCabang) filterDisplayCabang.style.display = '';
            if (filterGudangCabang) filterGudangCabang.style.display = '';
            if (filterInventarisCabang) filterInventarisCabang.style.display = '';
        }

        const displayBranchVal = window.userBranch || (filterDisplayCabang ? filterDisplayCabang.value : '');
        const gudangBranchVal = window.userBranch || (filterGudangCabang ? filterGudangCabang.value : '');
        const inventarisBranchVal = window.userBranch || (filterInventarisCabang ? filterInventarisCabang.value : '');
        
        const startValEl = document.getElementById('filter-display-start');
        const endValEl = document.getElementById('filter-display-end');
        const startVal = startValEl ? startValEl.value : '';
        const endVal = endValEl ? endValEl.value : '';

        // ==========================================================================
        // 2. SEKSI LOGIKA DYNAMIC FILTERING LOG SERVIS
        // ==========================================================================
        const filterServicesCabang = document.getElementById('filter-services-cabang');
        const filterServicesStart = document.getElementById('filter-services-start');
        const filterServicesEnd = document.getElementById('filter-services-end');

        if (window.userBranch) {
            if (filterServicesCabang) filterServicesCabang.style.display = 'none';
        } else {
            if (filterServicesCabang) filterServicesCabang.style.display = '';
        }

        const servicesBranchVal = window.userBranch || (filterServicesCabang ? filterServicesCabang.value : '');
        const startServicesVal = filterServicesStart ? filterServicesStart.value : '';
        const endServicesVal = filterServicesEnd ? filterServicesEnd.value : '';

        let filteredServices = dataServices;

        if (servicesBranchVal) {
            filteredServices = filteredServices.filter(item => item?.cabang === servicesBranchVal);
        }

        if (startServicesVal && endServicesVal) {
            const startDate = new Date(startServicesVal);
            startDate.setHours(0,0,0,0);
            const endDate = new Date(endServicesVal);
            endDate.setHours(23,59,59,999);

            filteredServices = filteredServices.filter(item => {
                const itemDate = parseDate(item?.tanggal);
                if (!itemDate) return false;
                return itemDate >= startDate && itemDate <= endDate;
            });
        }

        const totalServicesCount = filteredServices.length;
        const sAntrean = filteredServices.filter(s => s?.status === 'Antrean').length;
        const sProses = filteredServices.filter(s => s?.status === 'Proses').length;
        const sVendor = filteredServices.filter(s => s?.status === 'Oper Vendor').length;
        const sWaiting = filteredServices.filter(s => s?.status === 'Tunggu Konfirmasi').length;
        const sSelesai = filteredServices.filter(s => s?.status === 'Selesai').length;
        const sCancel = filteredServices.filter(s => s?.status === 'Cancel').length;

        const setInnerText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setInnerText('stat-services-total', totalServicesCount);
        setInnerText('stat-services-pending-only', sAntrean);
        setInnerText('stat-services-processing', sProses);
        setInnerText('stat-services-vendor', sVendor);
        setInnerText('stat-services-waiting', sWaiting);
        setInnerText('stat-services-completed', sSelesai);
        setInnerText('stat-services-cancelled', sCancel);

        // ==========================================================================
        // 3. SEKSI LOGIKA DYNAMIC FILTERING PROYEK CCTV
        // ==========================================================================
        const filterCctvCabang = document.getElementById('filter-cctv-cabang');
        const filterCctvStart = document.getElementById('filter-cctv-start');
        const filterCctvEnd = document.getElementById('filter-cctv-end');

        if (window.userBranch) {
            if (filterCctvCabang) filterCctvCabang.style.display = 'none';
        } else {
            if (filterCctvCabang) filterCctvCabang.style.display = '';
        }

        const cctvBranchVal = window.userBranch || (filterCctvCabang ? filterCctvCabang.value : '');
        const startCctvVal = filterCctvStart ? filterCctvStart.value : '';
        const endCctvVal = filterCctvEnd ? filterCctvEnd.value : '';

        let filteredCctv = dataCctv;

        if (cctvBranchVal) {
            filteredCctv = filteredCctv.filter(item => item?.cabang === cctvBranchVal);
        }

        if (startCctvVal && endCctvVal) {
            const startDate = new Date(startCctvVal);
            startDate.setHours(0,0,0,0);
            const endDate = new Date(endCctvVal);
            endDate.setHours(23,59,59,999);

            filteredCctv = filteredCctv.filter(item => {
                const itemDate = parseDate(item?.tanggal);
                if (!itemDate) return false;
                return itemDate >= startDate && itemDate <= endDate;
            });
        }

        const totalCctvCount = filteredCctv.length;
        const cSurvei = filteredCctv.filter(c => c?.status === 'Survei').length;
        const cKerja = filteredCctv.filter(c => c?.status === 'Pengerjaan').length;
        const cSelesai = filteredCctv.filter(c => c?.status === 'Selesai' || c?.status === 'Selesai / Serah Terima').length;

        setInnerText('stat-cctv-total', totalCctvCount);
        setInnerText('stat-cctv-survey', cSurvei);
        setInnerText('stat-cctv-working', cKerja);
        setInnerText('stat-cctv-completed', cSelesai);

        // ==========================================================================
        // 4. PENYETTINGAN NILAI KARTU STATISTIK LAIN & LAPTOP
        // ==========================================================================
        let filteredPenyewaan = dataPenyewaan;
        if (window.userBranch) {
            filteredPenyewaan = filteredPenyewaan.filter(item => item?.cabang === window.userBranch);
        }
        let totalOmsetSewa = 0;
        filteredPenyewaan.forEach(p => { 
            if (p?.status !== 'Dibatalkan') {
                totalOmsetSewa += (Number(p?.total_biaya) || 0); 
            }
        });

        setInnerText('stat-rent-omset', totalOmsetSewa.toLocaleString('id-ID'));

        let filteredLaptop = dataLaptop;
        if (gudangBranchVal) {
            filteredLaptop = filteredLaptop.filter(item => item?.cabang === gudangBranchVal);
        }

        let filteredDisplay = dataDisplayRaw;
        if (displayBranchVal) {
            filteredDisplay = filteredDisplay.filter(item => item?.cabang === displayBranchVal);
        }

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

        let filteredInventaris = dataInventaris;
        if (inventarisBranchVal) {
            filteredInventaris = filteredInventaris.filter(item => item?.cabang === inventarisBranchVal);
        }

        const totalInventarisVariants = filteredInventaris.length;
        let totalInventarisQty = 0;
        let lowStockCount = 0;
        let baikCount = 0;
        let rusakCount = 0;

        filteredInventaris.forEach(item => {
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

        filteredInventaris.forEach(item => {
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
            if (filteredInventaris.length === 0) {
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
            const lowStockItems = filteredInventaris.filter(item => (Number(item?.stok) || 0) <= 3 && item?.kondisi === 'Baik');
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

        let servers = dataOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'utama');
        const members = dataOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'anggota');

        const filterOfficeStatus = document.getElementById('filter-office-status')?.value || '';
        if (filterOfficeStatus === 'available') {
            servers = servers.filter(srv => {
                const srvEmail = srv?.akun || '';
                const count = dataOffice.filter(it => (it?.server_utama || '') === srvEmail && (it?.tipe_akun || '').toString().toLowerCase() === 'anggota').length;
                return count < 5;
            });
        } else if (filterOfficeStatus === 'full') {
            servers = servers.filter(srv => {
                const srvEmail = srv?.akun || '';
                const count = dataOffice.filter(it => (it?.server_utama || '') === srvEmail && (it?.tipe_akun || '').toString().toLowerCase() === 'anggota').length;
                return count >= 5;
            });
        }

        const totalServersCount = dataOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'utama').length;
        const totalMembersCount = members.length;

        let filledSlots = 0;
        let fullServersCount = 0;

        dataOffice.filter(i => (i?.tipe_akun || '').toString().toLowerCase() === 'utama').forEach(srv => {
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
                officeGrid.innerHTML = `<p class="col-span-full text-center text-xs text-slate-400 py-4 italic">Tidak ada Server Utama yang sesuai filter.</p>`;
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
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${linkedMembers.length >= 5 ? 'bg-rose-100 text-rose-800' : 'bg-purple-100 text-purple-800'}">
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

        // ==========================================================================
        // AKUMULASI MODEL LAPTOP GUDANG BERDASARKAN STATUS
        // ==========================================================================
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

        // MODE 1: ANALITIS
        const laptopContainer = document.getElementById('dashboard-laptop-models-container');
        if (laptopContainer) {
            laptopContainer.innerHTML = '';
            if (filteredLaptop.length === 0) {
                laptopContainer.innerHTML = `<p class="text-center text-xs text-gray-400 py-6 italic">Tidak ada unit laptop pada cabang ini</p>`;
            } else {
                let finalHtml = '';
                finalHtml += renderGroupCard('Tersedia di Gudang', warehouseReady, totalWhReady, '<i class="fa-solid fa-circle-check text-emerald-500"></i>', 'bg-emerald-100 text-emerald-800', 'bg-emerald-50/70', 'border-emerald-200');
                finalHtml += renderGroupCard('Sedang Disewa', warehouseSewa, totalWhSewa, '<i class="fa-solid fa-boxes-packing text-amber-500"></i>', 'bg-amber-100 text-amber-800', 'bg-amber-50/70', 'border-amber-200');
                finalHtml += renderGroupCard('Maintenance / Rusak', warehouseMaintenance, totalWhMaintenance, '<i class="fa-solid fa-screwdriver-wrench text-rose-500"></i>', 'bg-rose-100 text-rose-800', 'bg-rose-50/70', 'border-rose-200');
                finalHtml += renderGroupCard('Digunakan Staf', warehouseStaf, totalWhStaf, '<i class="fa-solid fa-user-tie text-indigo-500"></i>', 'bg-indigo-100 text-indigo-800', 'bg-indigo-50/70', 'border-indigo-200');
                finalHtml += renderGroupCard('Sudah Terjual', warehouseTerjual, totalWhTerjual, '<i class="fa-solid fa-hand-holding-dollar text-slate-500"></i>', 'bg-slate-200 text-slate-800', 'bg-slate-100', 'border-slate-200');
                laptopContainer.innerHTML = finalHtml;
            }
        }

        // MODE 2: GRID 5-BOX
        const gridContainer = document.getElementById('laptop-5box-grid-container');
        if (gridContainer) {
            gridContainer.innerHTML = '';
            if (filteredLaptop.length === 0) {
                gridContainer.innerHTML = `<p class="col-span-full text-center text-xs text-gray-400 py-8 italic">Tidak ada unit laptop pada cabang ini</p>`;
            } else {
                let gridHtml = '';
                gridHtml += renderGroupCard('🟢 Tersedia di Gudang', warehouseReady, totalWhReady, '', 'bg-emerald-100 text-emerald-800', 'bg-emerald-50', 'border-emerald-200');
                gridHtml += renderGroupCard('🟡 Sedang Disewa', warehouseSewa, totalWhSewa, '', 'bg-amber-100 text-amber-800', 'bg-amber-50', 'border-amber-200');
                gridHtml += renderGroupCard('🔴 Maintenance / Rusak', warehouseMaintenance, totalWhMaintenance, '', 'bg-rose-100 text-rose-800', 'bg-rose-50', 'border-rose-200');
                gridHtml += renderGroupCard('🔵 Digunakan Staf', warehouseStaf, totalWhStaf, '', 'bg-indigo-100 text-indigo-800', 'bg-indigo-50', 'border-indigo-200');
                gridHtml += renderGroupCard('⚪ Sudah Terjual', warehouseTerjual, totalWhTerjual, '', 'bg-slate-200 text-slate-800', 'bg-slate-100', 'border-slate-200');
                gridContainer.innerHTML = gridHtml;
            }
        }

        // MODE 3: FULL LAPORAN
        const stackedContainer = document.getElementById('dashboard-laptop-models-stacked-container');
        if (stackedContainer) {
            stackedContainer.innerHTML = '';
            if (filteredLaptop.length === 0) {
                stackedContainer.innerHTML = `<p class="col-span-full text-center text-xs text-gray-400 py-6 italic">Tidak ada unit laptop pada cabang ini</p>`;
            } else {
                let stackedHtml = '';
                
                if (totalWhReady > 0) {
                    stackedHtml += renderGroupCard('Tersedia di Gudang', warehouseReady, totalWhReady, '<i class="fa-solid fa-circle-check text-emerald-500"></i>', 'bg-emerald-100 text-emerald-800', 'bg-emerald-50/70', 'border-emerald-200');
                }
                
                if (totalWhSewa > 0) {
                    stackedHtml += renderGroupCard('Sedang Disewa', warehouseSewa, totalWhSewa, '<i class="fa-solid fa-boxes-packing text-amber-500"></i>', 'bg-amber-100 text-amber-800', 'bg-amber-50/70', 'border-amber-200');
                }

                if (totalWhMaintenance > 0) {
                    stackedHtml += renderGroupCard('Maintenance / Rusak', warehouseMaintenance, totalWhMaintenance, '<i class="fa-solid fa-screwdriver-wrench text-rose-500"></i>', 'bg-rose-100 text-rose-800', 'bg-rose-50/70', 'border-rose-200');
                }

                if (totalWhStaf > 0) {
                    stackedHtml += renderGroupCard('Digunakan Staf', warehouseStaf, totalWhStaf, '<i class="fa-solid fa-user-tie text-indigo-500"></i>', 'bg-indigo-100 text-indigo-800', 'bg-indigo-50/70', 'border-indigo-200');
                }

                if (totalWhTerjual > 0) {
                    stackedHtml += renderGroupCard('Sudah Terjual', warehouseTerjual, totalWhTerjual, '<i class="fa-solid fa-hand-holding-dollar text-slate-500"></i>', 'bg-slate-200 text-slate-800', 'bg-slate-100', 'border-slate-200');
                }

                stackedContainer.innerHTML = stackedHtml;
            }
        }

        try {
            const stackedStockCanvas = document.getElementById('chartLaptopStockStacked');
            if (stackedStockCanvas && typeof Chart !== 'undefined') {
                const ctxStacked = stackedStockCanvas.getContext('2d');
                if (chartLaptopStockStackedInstance !== null) chartLaptopStockStackedInstance.destroy();

                chartLaptopStockStackedInstance = new Chart(ctxStacked, {
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
            console.warn("Gagal menggambar diagram stok laptop mode stacked:", chartErr);
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

        // ==========================================================================
        // 5. VISUALISASI GRAFIK SERVIS & CCTV
        // ==========================================================================
        
        // 1. DIAGRAM BATANG HORIZONTAL: DISTRIBUSI MEREK UNIT SERVISAN
        try {
            const servicesCanvas = document.getElementById('chartServicesProgress');
            const servicesChartsContainer = document.getElementById('services-charts-container');
            
            if (servicesChartsContainer) {
                servicesChartsContainer.classList.remove('hidden');
            }

            if (servicesCanvas && typeof Chart !== 'undefined' && servicesChartsContainer && !servicesChartsContainer.classList.contains('hidden')) {
                const ctxServices = servicesCanvas.getContext('2d');
                if (chartServicesInstance !== null) chartServicesInstance.destroy();

                const extractBrand = (perangkatStr) => {
                    if (!perangkatStr) return 'Lainnya';
                    const clean = perangkatStr.trim().toLowerCase();
                    if (clean.includes('lenovo')) return 'Lenovo';
                    if (clean.includes('asus')) return 'Asus';
                    if (clean.includes('acer')) return 'Acer';
                    if (clean.includes('hp')) return 'HP';
                    if (clean.includes('dell')) return 'Dell';
                    if (clean.includes('apple') || clean.includes('macbook') || clean.includes('ipad')) return 'Apple';
                    if (clean.includes('axioo')) return 'Axioo';
                    if (clean.includes('toshiba')) return 'Toshiba';
                    if (clean.includes('msi')) return 'MSI';
                    if (clean.includes('samsung')) return 'Samsung';
                    if (clean.includes('razer')) return 'Razer';
                    
                    const firstWord = perangkatStr.trim().split(' ')[0];
                    if (firstWord && firstWord.length > 2) {
                        return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
                    }
                    return 'Lainnya';
                };

                const brandCounts = {};
                filteredServices.forEach(item => {
                    const brand = extractBrand(item?.perangkat || '');
                    brandCounts[brand] = (brandCounts[brand] || 0) + 1;
                });

                const sortedBrands = Object.keys(brandCounts).sort((a, b) => brandCounts[b] - brandCounts[a]);
                const barData = sortedBrands.map(brand => brandCounts[brand]);

                const presetColors = {
                    'Lenovo': '#f59e0b',
                    'Asus': '#3b82f6',
                    'Acer': '#10b981',
                    'HP': '#8b5cf6',
                    'Dell': '#06b6d4',
                    'Apple': '#64748b',
                    'Axioo': '#ec4899',
                    'MSI': '#ef4444',
                    'Razer': '#84cc16',
                    'Toshiba': '#f97316',
                    'Samsung': '#14b8a6',
                    'Lainnya': '#94a3b8'
                };
                const backgroundColors = sortedBrands.map(brand => presetColors[brand] || '#06b6d4');

                // Diagram Batang Horizontal (indexAxis: 'y')
                chartServicesInstance = new Chart(ctxServices, {
                    type: 'bar',
                    data: {
                        labels: sortedBrands.length > 0 ? sortedBrands : ['Tidak Ada Data'],
                        datasets: [{
                            label: 'Jumlah Unit Servis',
                            data: barData.length > 0 ? barData : [0],
                            backgroundColor: backgroundColors.length > 0 ? backgroundColors : ['#cbd5e1'],
                            borderRadius: 6,
                            borderSkipped: false
                        }]
                    },
                    options: {
                        indexAxis: 'y', // Memanjang ke samping secara horizontal
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return ` ${context.parsed.x} Unit Servis`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                beginAtZero: true,
                                ticks: { precision: 0 },
                                grid: { color: '#f1f5f9' }
                            },
                            y: {
                                grid: { display: false },
                                ticks: { font: { size: 11, weight: 'bold' } }
                            }
                        }
                    }
                });
            }
        } catch (chartErr) {
            console.warn("Gagal menggambar diagram batang merek servis:", chartErr);
        }

        // 2. DIAGRAM GARIS: TREN TOTAL SERVISAN / TIKET USER PER TANGGAL
        try {
            const servicesLineCanvas = document.getElementById('chartServicesLine');
            if (servicesLineCanvas && typeof Chart !== 'undefined') {
                const ctxServicesLine = servicesLineCanvas.getContext('2d');
                if (chartServicesLineInstance !== null) chartServicesLineInstance.destroy();

                const servicesByDate = {};
                filteredServices.forEach(item => {
                    const tgl = item?.tanggal || '';
                    if (tgl) {
                        servicesByDate[tgl] = (servicesByDate[tgl] || 0) + 1;
                    }
                });

                const sortedServicesDates = Object.keys(servicesByDate).sort((a, b) => {
                    const dateA = parseDate(a) || new Date(0);
                    const dateB = parseDate(b) || new Date(0);
                    return dateA - dateB;
                });

                const lineLabels = sortedServicesDates;
                const lineData = sortedServicesDates.map(d => servicesByDate[d]);

                chartServicesLineInstance = new Chart(ctxServicesLine, {
                    type: 'line',
                    data: {
                        labels: lineLabels.length > 0 ? lineLabels : ['Tidak Ada Data'],
                        datasets: [{
                            label: 'Servisan Masuk (Tiket User)',
                            data: lineData.length > 0 ? lineData : [0],
                            borderColor: '#06b6d4',
                            backgroundColor: 'rgba(6, 182, 212, 0.12)',
                            fill: true,
                            tension: 0.35,
                            borderWidth: 2.5,
                            pointRadius: 3.5,
                            pointBackgroundColor: '#0891b2',
                            hoverRadius: 5
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return ` ${context.parsed.y} Servisan / User Masuk`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { precision: 0 }
                            },
                            x: {
                                ticks: { font: { size: 10 } },
                                grid: { color: '#f8fafc' }
                            }
                        }
                    }
                });
            }
        } catch (chartErr) {
            console.warn("Gagal menggambar diagram garis tren servisan user:", chartErr);
        }

        // 3. DIAGRAM GARIS: PROYEK CCTV
        try {
            const cctvLineCanvas = document.getElementById('chartCctvLine');
            if (cctvLineCanvas && typeof Chart !== 'undefined') {
                const ctxCctvLine = cctvLineCanvas.getContext('2d');
                if (chartCctvLineInstance !== null) chartCctvLineInstance.destroy();

                const cctvByDate = {};
                filteredCctv.forEach(item => {
                    let tgl = item?.tanggal || '';
                    if (tgl) {
                        cctvByDate[tgl] = (cctvByDate[tgl] || 0) + 1;
                    }
                });

                const sortedCctvDates = Object.keys(cctvByDate).sort((a, b) => {
                    const dateA = parseDate(a) || new Date(0);
                    const dateB = parseDate(b) || new Date(0);
                    return dateA - dateB;
                });

                const lineLabels = sortedCctvDates;
                const lineData = sortedCctvDates.map(d => cctvByDate[d]);

                chartCctvLineInstance = new Chart(ctxCctvLine, {
                    type: 'line',
                    data: {
                        labels: lineLabels.length > 0 ? lineLabels : ['No Data'],
                        datasets: [{
                            label: 'Pendaftaran Proyek Baru',
                            data: lineData.length > 0 ? lineData : [0],
                            borderColor: '#06b6d4',
                            backgroundColor: 'rgba(6, 182, 212, 0.1)',
                            fill: true,
                            tension: 0.3,
                            borderWidth: 2.5,
                            pointRadius: 3
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                    }
                });
            }
        } catch (chartErr) {
            console.warn("Gagal menggambar diagram garis proyek CCTV:", chartErr);
        }

        // RENDER DETAIL ANTREAN SERVIS & CCTV
        const servicesDetailsBody = document.getElementById('dashboard-services-details');
        if (servicesDetailsBody) {
            const activeServices = [...filteredServices]; 
            activeServices.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));

            if (activeServices.length === 0) {
                servicesDetailsBody.innerHTML = `<tr><td colspan="5" class="py-3 text-center text-slate-400 italic font-semibold">Tidak ada log servis terdaftar saat ini.</td></tr>`;   
            } else {
                servicesDetailsBody.innerHTML = activeServices.map((s, idx) => {
                    const visualId = idx + 1;
                    const refCode = s.no_ref || `SRV-Legacy-#${s.id}`;
                    const pelangganText = s.pelanggan || '-';
                    const perangkatText = s.perangkat || '-';
                    const teknisiText = s.teknisi || 'Belum Ditentukan';
                    
                    let statusColor = 'text-amber-600 bg-amber-50 border border-amber-100';
                    if (s.status === 'Proses') {
                        statusColor = 'text-blue-600 bg-blue-50 border border-blue-100';
                    } else if (s.status === 'Oper Vendor') {
                        statusColor = 'text-purple-600 bg-purple-50 border border-purple-100';
                    } else if (s.status === 'Tunggu Konfirmasi') {
                        statusColor = 'text-orange-600 bg-orange-50 border border-orange-100';
                    } else if (s.status === 'Selesai') {
                        statusColor = 'text-emerald-600 bg-emerald-50 border border-emerald-100';
                    } else if (s.status === 'Cancel') {
                        statusColor = 'text-rose-600 bg-rose-50 border border-rose-100';
                    }

                    return `
                        <tr class="hover:bg-slate-50 transition border-b border-slate-50">
                            <td class="py-2 px-1.5 font-bold font-mono text-[11px] text-slate-700 whitespace-nowrap">${escapeHtml(refCode)} (ID: ${visualId})</td>
                            <td class="py-2 px-1.5 font-semibold text-slate-800">${escapeHtml(pelangganText)}</td>
                            <td class="py-2 px-1.5">${escapeHtml(perangkatText)}</td>
                            <td class="py-2 px-1.5 font-semibold text-slate-500">${escapeHtml(teknisiText)}</td>
                            <td class="py-2 px-1.5"><span class="px-2 py-0.5 rounded text-[10px] font-extrabold border ${statusColor}">${s.status}</span></td>
                        </tr>
                    `;
                }).join('');
            }
        }

        const cctvDetailsBody = document.getElementById('dashboard-cctv-details');
        if (cctvDetailsBody) {
            const activeCctvList = [...filteredCctv]; 
            activeCctvList.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));

            if (activeCctvList.length === 0) {
                cctvDetailsBody.innerHTML = `<tr><td colspan="5" class="py-3 text-center text-slate-400 italic font-semibold">Tidak ada proyek CCTV terdaftar saat ini.</td></tr>`;
            } else {
                cctvDetailsBody.innerHTML = activeCctvList.map(c => {
                    const klienText = c.klien || '-';
                    const lokasiText = c.lokasi || '-';
                    const kameraText = c.jumlah_cctv || 0;
                    const progresText = c.progres || '-';
                    
                    let statusColor = 'text-purple-600 bg-purple-50 border border-purple-100';
                    if (c.status === 'Pengerjaan') {
                        statusColor = 'text-cyan-600 bg-cyan-50 border border-cyan-100';
                    } else if (c.status === 'Selesai' || c.status === 'Selesai / Serah Terima') {
                        statusColor = 'text-emerald-600 bg-emerald-50 border border-emerald-100';
                    }

                    return `
                        <tr class="hover:bg-slate-50 transition border-b border-slate-50">
                            <td class="py-2 px-1.5 font-semibold text-slate-800">${escapeHtml(klienText)}</td>
                            <td class="py-2 px-1.5">${escapeHtml(lokasiText)}</td>
                            <td class="py-2 px-1.5 text-center font-bold font-mono">${kameraText} Unit</td>
                            <td class="py-2 px-1.5 text-slate-500 italic font-medium">${escapeHtml(progresText)}</td>
                            <td class="py-2 px-1.5"><span class="px-2 py-0.5 rounded text-[10px] font-extrabold border ${statusColor}">${c.status}</span></td>
                        </tr>
                    `;
                }).join('');
            }
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

// ==========================================================================
// KONTROL TOGGLE MASTER MENU POP-UP UNTUK SEMUA SEKSI
// ==========================================================================

function toggleMasterMenuHelper(popoverId, event) {
    if (event) event.stopPropagation();
    
    const allPopovers = ['popover-services-master', 'popover-cctv-master', 'popover-display-master', 'popover-laptop-master', 'popover-inventaris-master', 'popover-office-master'];
    allPopovers.forEach(id => {
        if (id !== popoverId) {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        }
    });

    const popover = document.getElementById(popoverId);
    if (popover) {
        popover.classList.toggle('hidden');
    }
}

window.toggleServicesMasterMenu = function(event) { toggleMasterMenuHelper('popover-services-master', event); };
window.toggleCctvMasterMenu = function(event) { toggleMasterMenuHelper('popover-cctv-master', event); };
window.toggleDisplayMasterMenu = function(event) { toggleMasterMenuHelper('popover-display-master', event); };
window.toggleLaptopMasterMenu = function(event) { toggleMasterMenuHelper('popover-laptop-master', event); };
window.toggleInventarisMasterMenu = function(event) { toggleMasterMenuHelper('popover-inventaris-master', event); };
window.toggleOfficeMasterMenu = function(event) { toggleMasterMenuHelper('popover-office-master', event); };

// Pengatur Mode Tampilan Laptop Gudang (3 Mode)
window.setLaptopGudangLayout = function(mode) {
    activeLaptopGudangLayoutMode = mode;
    const analyticsEl = document.getElementById('laptop-layout-analytics');
    const gridEl = document.getElementById('laptop-layout-grid');
    const stackedEl = document.getElementById('laptop-layout-stacked');
    
    const btnAnalytics = document.getElementById('btn-layout-analytics');
    const btnGrid = document.getElementById('btn-layout-grid');
    const btnStacked = document.getElementById('btn-layout-stacked');

    const defaultBtnClass = "py-1.5 px-1 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 text-slate-600 hover:text-slate-900";

    if (btnAnalytics) btnAnalytics.className = defaultBtnClass;
    if (btnGrid) btnGrid.className = defaultBtnClass;
    if (btnStacked) btnStacked.className = defaultBtnClass;

    if (analyticsEl) analyticsEl.classList.add('hidden');
    if (gridEl) gridEl.classList.add('hidden');
    if (stackedEl) stackedEl.classList.add('hidden');

    if (mode === 'grid') {
        if (gridEl) gridEl.classList.remove('hidden');
        if (btnGrid) btnGrid.className = "py-1.5 px-1 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 bg-white text-emerald-600 shadow-xs border border-slate-200";
    } else if (mode === 'stacked') {
        if (stackedEl) stackedEl.classList.remove('hidden');
        if (btnStacked) btnStacked.className = "py-1.5 px-1 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 bg-white text-purple-600 shadow-xs border border-slate-200";
    } else {
        if (analyticsEl) analyticsEl.classList.remove('hidden');
        if (btnAnalytics) btnAnalytics.className = "py-1.5 px-1 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 bg-white text-cyan-600 shadow-xs border border-slate-200";
    }

    if (typeof calculateAndRenderStats === 'function') {
        calculateAndRenderStats();
    }
};

// ==========================================================================
// ENGINE TANGKAP GAMBAR (SCREENSHOT) PRESISI UNTUK SETIAP SEKSI
// ==========================================================================

function captureSectionHelper(sectionId, popoverId, fileNamePrefix) {
    const originalSection = document.getElementById(sectionId);
    const masterPopover = document.getElementById(popoverId);
    if (!originalSection) return;

    if (masterPopover) masterPopover.classList.add('hidden');

    if (window.showToast) window.showToast("Mengambil gambar laporan presisi...", "info");

    if (typeof html2canvas === 'undefined') {
        alert("Library html2canvas belum dimuat. Pastikan koneksi internet Anda stabil.");
        return;
    }

    const clone = originalSection.cloneNode(true);

    const originalCanvases = originalSection.querySelectorAll('canvas');
    const cloneCanvases = clone.querySelectorAll('canvas');
    originalCanvases.forEach((origCanvas, index) => {
        const cloneCanvas = cloneCanvases[index];
        if (cloneCanvas && origCanvas.width > 0 && origCanvas.height > 0) {
            const ctx = cloneCanvas.getContext('2d');
            cloneCanvas.width = origCanvas.width;
            cloneCanvas.height = origCanvas.height;
            ctx.drawImage(origCanvas, 0, 0);
        }
    });

    const clonePopover = clone.querySelector(`#${popoverId}`);
    if (clonePopover) clonePopover.remove();

    const cloneScrollables = clone.querySelectorAll('.overflow-y-auto');
    cloneScrollables.forEach(el => {
        el.style.maxHeight = 'none';
        el.style.height = 'auto';
        el.style.overflow = 'visible';
    });

    const actualWidth = originalSection.offsetWidth;
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = `${actualWidth}px`;
    clone.style.height = 'auto';
    clone.style.boxSizing = 'border-box';
    clone.style.margin = '0';

    document.body.appendChild(clone);

    html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
    }).then(canvas => {
        document.body.removeChild(clone);

        const now = new Date();
        const formattedDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        
        const link = document.createElement('a');
        link.download = `${fileNamePrefix}_${formattedDate}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        if (window.showToast) window.showToast("Gambar presisi rapi berhasil diunduh!", "success");
    }).catch(err => {
        if (document.body.contains(clone)) {
            document.body.removeChild(clone);
        }
        console.error("Gagal capture gambar:", err);
        if (window.showToast) window.showToast("Gagal mengunduh gambar: " + err.message, "error");
    });
}

window.captureServicesSection = function() { captureSectionHelper('section-services', 'popover-services-master', 'Laporan_Antrean_Servis'); };
window.captureCctvSection = function() { captureSectionHelper('section-cctv', 'popover-cctv-master', 'Laporan_Proyek_CCTV'); };
window.captureDisplaySection = function() { captureSectionHelper('section-laptop-display', 'popover-display-master', 'Laporan_Laptop_Display'); };
window.captureLaptopGudangSection = function() { captureSectionHelper('section-laptop-gudang', 'popover-laptop-master', 'Laporan_Laptop_Gudang'); };
window.captureInventarisSection = function() { captureSectionHelper('section-inventaris', 'popover-inventaris-master', 'Laporan_Inventaris_Part'); };
window.captureOfficeSection = function() { captureSectionHelper('section-office', 'popover-office-master', 'Laporan_Lisensi_Office'); };

document.addEventListener('click', function(e) {
    const allPopovers = [
        { id: 'popover-services-master', btn: 'toggleServicesMasterMenu' },
        { id: 'popover-cctv-master', btn: 'toggleCctvMasterMenu' },
        { id: 'popover-display-master', btn: 'toggleDisplayMasterMenu' },
        { id: 'popover-laptop-master', btn: 'toggleLaptopMasterMenu' },
        { id: 'popover-inventaris-master', btn: 'toggleInventarisMasterMenu' },
        { id: 'popover-office-master', btn: 'toggleOfficeMasterMenu' }
    ];

    allPopovers.forEach(item => {
        const popover = document.getElementById(item.id);
        if (popover && !popover.classList.contains('hidden')) {
            const btn = e.target.closest(`button[onclick*="${item.btn}"]`);
            if (!btn && !popover.contains(e.target)) {
                popover.classList.add('hidden');
            }
        }
    });
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
        const servicesSelect = document.getElementById('filter-services-cabang');
        const cctvSelect = document.getElementById('filter-cctv-cabang');
        const inventarisSelect = document.getElementById('filter-inventaris-cabang');
        
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

        if (servicesSelect) {
            let currentServices = servicesSelect.value;
            servicesSelect.innerHTML = optionsHtml;
            servicesSelect.value = currentServices;
        }

        if (cctvSelect) {
            let currentCctv = cctvSelect.value;
            cctvSelect.innerHTML = optionsHtml;
            cctvSelect.value = currentCctv;
        }

        if (inventarisSelect) {
            let currentInventaris = inventarisSelect.value;
            inventarisSelect.innerHTML = optionsHtml;
            inventarisSelect.value = currentInventaris;
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

function resetServicesFilters() {
    const filterBranch = document.getElementById('filter-services-cabang');
    const filterStart = document.getElementById('filter-services-start');
    const filterEnd = document.getElementById('filter-services-end');
    if (filterBranch) filterBranch.value = '';
    if (filterStart) filterStart.value = '';
    if (filterEnd) filterEnd.value = '';
    calculateAndRenderStats();
}

function resetCctvFilters() {
    const filterBranch = document.getElementById('filter-cctv-cabang');
    const filterStart = document.getElementById('filter-cctv-start');
    const filterEnd = document.getElementById('filter-cctv-end');
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

// Ikat ke global window
window.calculateAndRenderStats = calculateAndRenderStats;
window.updateDashboardBranchFilters = updateDashboardBranchFilters;
window.resetDisplayFilters = resetDisplayFilters;
window.resetServicesFilters = resetServicesFilters;
window.resetCctvFilters = resetCctvFilters;
window.openDashboardModal = openDashboardModal;
window.closeDashboardModal = closeDashboardModal;