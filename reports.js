/* ==========================================================================
   Teknisi Portal - reports.js (Modul Pusat Unduh Laporan & 4-Format Export)
   ========================================================================== */
import { parseDate } from './utils.js';

// Fungsi pembantu mengamankan teks HTML
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==========================================================================
// 1. DAFTAR KONFIGURASI 11 MODUL LAPORAN
// ==========================================================================
const REPORT_MODULES_CONFIG = {
    services: {
        title: "Laporan Log Services",
        desc: "Rekap tiket servisan masuk, status pengerjaan, teknisi PJ, dan biaya.",
        icon: "fa-solid fa-laptop-medical text-cyan-600",
        node: "services"
    },
    penyewaan: {
        title: "Laporan Data Penyewaan",
        desc: "Rekap transaksi penyewaan laptop/printer, masa sewa, dan total omset.",
        icon: "fa-solid fa-boxes-packing text-amber-600",
        node: "penyewaan"
    },
    cctv: {
        title: "Laporan Proyek CCTV",
        desc: "Rekap data instalasi kamera CCTV klien, lokasi, dan progres pengerjaan.",
        icon: "fa-solid fa-video text-blue-600",
        node: "cctv"
    },
    list_laptop: {
        title: "Laporan Stok Master Laptop Gudang",
        desc: "Rekap data aset fisik unit laptop gudang, SN, dan status ketersediaan.",
        icon: "fa-solid fa-laptop text-emerald-600",
        node: "list_laptop"
    },
    laptop_display: {
        title: "Laporan Laptop Display (Etalase)",
        desc: "Rekap unit pajangan etalase toko, spesifikasi ringkas, harga, dan status.",
        icon: "fa-solid fa-desktop text-purple-600",
        node: "laptop_display"
    },
    gabungan_servis_display: {
        title: "🌟 Laporan Gabungan: Servis & Display",
        desc: "Rekap komprehensif performa tiket servisan dan penjualan unit display toko.",
        icon: "fa-solid fa-chart-pie text-indigo-600",
        node: "gabungan"
    },
    inventaris: {
        title: "Laporan Inventaris Suku Cadang & Alat",
        desc: "Rekap data stok sparepart, alat kerja teknisi, lokasi rak, dan kondisi fisik.",
        icon: "fa-solid fa-toolbox text-slate-700",
        node: "inventaris"
    },
    log_penjualan: {
        title: "Laporan Log Penjualan Produk",
        desc: "Rekap data transaksi penjualan barang/aksesoris toko, item terjual, dan omset.",
        icon: "fa-solid fa-cart-shopping text-rose-600",
        node: "log_penjualan"
    },
    master_jasa_katalog: {
        title: "Laporan Master Jasa & Katalog Produk",
        desc: "Daftar tarif standar jasa tindakan teknisi dan katalog harga jual produk.",
        icon: "fa-solid fa-briefcase text-teal-600",
        node: "master_jasa_katalog"
    },
    list_office: {
        title: "Laporan Lisensi Microsoft Office",
        desc: "Peta akun server utama Microsoft 365, anggota member, dan sisa slot kosong.",
        icon: "fa-brands fa-microsoft text-sky-600",
        node: "list_office"
    },
    activity_logs: {
        title: "Laporan Audit Log Aktivitas",
        desc: "Jejak audit aktivitas tambah, ubah, hapus, dan login seluruh operator sistem.",
        icon: "fa-solid fa-clock-rotate-left text-amber-700",
        node: "activity_logs"
    }
};

// ==========================================================================
// 2. LOGIKA PENYARING DATA (FILTER CABANG & TANGGAL)
// ==========================================================================
function getFilteredReportData(moduleKey) {
    const rawBranch = document.getElementById('reports-filter-cabang')?.value || '';
    const userBranch = window.userBranch || '';
    const selectedBranch = userBranch || rawBranch;

    const startVal = document.getElementById('reports-filter-start')?.value || '';
    const endVal = document.getElementById('reports-filter-end')?.value || '';

    let startDate = null;
    let endDate = null;
    if (startVal && endVal) {
        startDate = new Date(startVal);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(endVal);
        endDate.setHours(23, 59, 59, 999);
    }

    const filterArray = (arr, dateField = 'tanggal') => {
        return (arr || []).filter(item => {
            if (selectedBranch && item.cabang && item.cabang !== selectedBranch) {
                return false;
            }
            if (startDate && endDate && item[dateField]) {
                const itemDate = parseDate(item[dateField]);
                if (!itemDate || itemDate < startDate || itemDate > endDate) {
                    return false;
                }
            }
            return true;
        });
    };

    const cloud = window.globalDataCloud || {};

    switch (moduleKey) {
        case 'services': {
            const raw = filterArray(cloud.services || []);
            const rows = raw.map((item, idx) => ({
                "No": idx + 1,
                "No. Ref": item.no_ref || `SRV/Legacy/#${item.id}`,
                "Tanggal": item.tanggal || '-',
                "Cabang": item.cabang || '-',
                "Pelanggan": item.pelanggan || '-',
                "No. WA": item.no_wa || '-',
                "Perangkat": item.perangkat || '-',
                "Teknisi": item.teknisi || 'Belum Ditentukan',
                "Status": item.status || 'Antrean',
                "Total Biaya": Number(item.biaya || 0)
            }));
            const totalBiaya = raw.reduce((sum, it) => sum + (Number(it.biaya) || 0), 0);
            return {
                title: "Laporan Log Services",
                rows,
                totalCount: rows.length,
                summaryText: `Total Tiket: ${rows.length} Tiket | Total Omset: Rp ${totalBiaya.toLocaleString('id-ID')}`
            };
        }

        case 'penyewaan': {
            const raw = filterArray(cloud.penyewaan || [], 'tgl_mulai');
            const rows = raw.map((item, idx) => ({
                "No": idx + 1,
                "Penyewa": item.penyewa || '-',
                "No. WA": item.no_wa || '-',
                "Unit Disewa": item.unit || '-',
                "Tgl Mulai": item.tgl_mulai || '-',
                "Tgl Selesai": item.tgl_selesai || '-',
                "Cabang": item.cabang || '-',
                "Status": item.status || 'Proses',
                "Total Biaya": Number(item.total_biaya || 0)
            }));
            const totalSewa = raw.reduce((sum, it) => sum + (Number(it.total_biaya) || 0), 0);
            return {
                title: "Laporan Data Penyewaan",
                rows,
                totalCount: rows.length,
                summaryText: `Total Transaksi: ${rows.length} Sewa | Total Omset: Rp ${totalSewa.toLocaleString('id-ID')}`
            };
        }

        case 'cctv': {
            const raw = filterArray(cloud.cctv || []);
            const rows = raw.map((item, idx) => ({
                "No": idx + 1,
                "Klien / Instansi": item.klien || '-',
                "Lokasi": item.lokasi || '-',
                "Jumlah Kamera": `${item.jumlah_cctv || 0} Unit`,
                "Progres": item.progres || '-',
                "Status": item.status || 'Survei',
                "Cabang": item.cabang || '-',
                "Tanggal": item.tanggal || '-'
            }));
            return {
                title: "Laporan Proyek CCTV",
                rows,
                totalCount: rows.length,
                summaryText: `Total Proyek: ${rows.length} Proyek`
            };
        }

        case 'list_laptop': {
            const raw = filterArray(cloud.list_laptop || []);
            const rows = raw.map((item, idx) => ({
                "No": idx + 1,
                "Jenis": item.jenis_unit || 'Laptop',
                "Kode Toko": item.kode_toko || '-',
                "Merk": item.merk || '-',
                "Tipe": item.tipe || '-',
                "Serial Number (SN)": item.sn || '-',
                "Spesifikasi": (item.spek || '-').replace(/\n/g, ' / '),
                "Status": item.status || 'Tersedia',
                "Cabang": item.cabang || '-'
            }));
            return {
                title: "Laporan Stok Master Laptop Gudang",
                rows,
                totalCount: rows.length,
                summaryText: `Total Unit Terdaftar: ${rows.length} Unit`
            };
        }

        case 'laptop_display': {
            const raw = filterArray(cloud.laptop_display || []);
            const rows = raw.map((item, idx) => ({
                "No": idx + 1,
                "Merk / Model": `${item.merk || ''} ${item.tipe || ''}`.trim() || '-',
                "Serial Number (SN)": item.sn || '-',
                "Spesifikasi": (item.spek_singkat || '-').replace(/\n/g, ' / '),
                "Harga Jual": Number(item.harga_jual || 0),
                "Status": item.status || 'Ready',
                "Teknisi PJ": item.teknisi || '-',
                "Cabang": item.cabang || '-'
            }));
            return {
                title: "Laporan Laptop Display (Etalase)",
                rows,
                totalCount: rows.length,
                summaryText: `Total Display: ${rows.length} Unit`
            };
        }

        case 'gabungan_servis_display': {
            const rawServices = filterArray(cloud.services || []);
            const rawDisplay = filterArray(cloud.laptop_display || []);

            const rows = [];
            let no = 1;

            rawServices.forEach(s => {
                rows.push({
                    "No": no++,
                    "Kategori": "Log Servisan",
                    "Kode/Ref": s.no_ref || `SRV/#${s.id}`,
                    "Keterangan Unit": `${s.pelanggan || 'Pelanggan'} - ${s.perangkat || '-'}`,
                    "Status": s.status || 'Antrean',
                    "Nominal (Rp)": Number(s.biaya || 0),
                    "Cabang": s.cabang || '-',
                    "Tanggal": s.tanggal || '-'
                });
            });

            rawDisplay.forEach(d => {
                rows.push({
                    "No": no++,
                    "Kategori": "Laptop Display",
                    "Kode/Ref": `SN: ${d.sn || 'N/A'}`,
                    "Keterangan Unit": `${d.merk || ''} ${d.tipe || ''}`.trim() || 'Laptop Display',
                    "Status": d.status || 'Ready',
                    "Nominal (Rp)": Number(d.harga_jual || 0),
                    "Cabang": d.cabang || '-',
                    "Tanggal": d.tanggal || '-'
                });
            });

            const totalNominal = rows.reduce((sum, r) => sum + (Number(r["Nominal (Rp)"]) || 0), 0);

            return {
                title: "Laporan Gabungan: Log Services & Laptop Display",
                rows,
                totalCount: rows.length,
                summaryText: `Total Rekap: ${rows.length} Item (Servis: ${rawServices.length}, Display: ${rawDisplay.length}) | Akumulasi Nilai: Rp ${totalNominal.toLocaleString('id-ID')}`
            };
        }

        case 'inventaris': {
            const raw = filterArray(cloud.inventaris || []);
            const rows = raw.map((item, idx) => ({
                "No": idx + 1,
                "Kode SKU": item.kode_barang || '-',
                "Nama Barang": item.nama_barang || '-',
                "Kategori": item.kategori || '-',
                "Stok": `${item.stok || 0} ${item.satuan || 'Pcs'}`,
                "Lokasi Rak": item.lokasi_rak || '-',
                "Kondisi": item.kondisi || 'Baik',
                "Cabang": item.cabang || '-'
            }));
            return {
                title: "Laporan Inventaris Suku Cadang & Alat",
                rows,
                totalCount: rows.length,
                summaryText: `Total Varian Part: ${rows.length} Item`
            };
        }

        case 'log_penjualan': {
            const raw = filterArray(cloud.log_penjualan || []);
            const rows = raw.map((item, idx) => {
                const itemNames = (item.items_terjual || []).map(it => `${it.name} (x${it.qty})`).join(', ');
                return {
                    "No": idx + 1,
                    "No. Ref": item.no_ref || `SLS/#${item.id}`,
                    "Tanggal": item.tanggal || '-',
                    "Pembeli": item.nama_pembeli || 'Walk-in Customer',
                    "No. WA": item.no_wa || '-',
                    "Item Terjual": itemNames || '-',
                    "Total Bayar": Number(item.total_bayar || 0),
                    "Cabang": item.cabang || '-'
                };
            });
            const totalOmset = raw.reduce((sum, it) => sum + (Number(it.total_bayar) || 0), 0);
            return {
                title: "Laporan Log Penjualan Produk & Aksesoris",
                rows,
                totalCount: rows.length,
                summaryText: `Total Transaksi: ${rows.length} Penjualan | Omset Kasir: Rp ${totalOmset.toLocaleString('id-ID')}`
            };
        }

        case 'master_jasa_katalog': {
            const rawJasa = cloud.master_jasa || [];
            const rawKatalog = cloud.katalog_produk || [];
            const rows = [];
            let no = 1;

            rawJasa.forEach(j => {
                rows.push({
                    "No": no++,
                    "Tipe": "Jasa Tindakan",
                    "Nama": j.nama_jasa || '-',
                    "Kategori/Satuan": "Tindakan Servis",
                    "Harga Modal (Rp)": 0,
                    "Tarif Jual (Rp)": Number(j.biaya_jasa || 0)
                });
            });

            rawKatalog.forEach(k => {
                rows.push({
                    "No": no++,
                    "Tipe": "Katalog Produk",
                    "Nama": k.nama_barang || '-',
                    "Kategori/Satuan": `${k.kategori || 'Part'} (${k.satuan || 'Pcs'})`,
                    "Harga Modal (Rp)": Number(k.harga_modal || 0),
                    "Tarif Jual (Rp)": Number(k.harga_jual || 0)
                });
            });

            return {
                title: "Laporan Master Jasa & Katalog Produk",
                rows,
                totalCount: rows.length,
                summaryText: `Total Master: ${rows.length} Item (${rawJasa.length} Jasa, ${rawKatalog.length} Produk)`
            };
        }

        case 'list_office': {
            const raw = cloud.list_office || [];
            const rows = raw.map((item, idx) => ({
                "No": idx + 1,
                "Nama User": item.nama_user || '-',
                "Akun Office": item.akun || '-',
                "Tipe Akun": item.tipe_akun || 'Anggota',
                "Lisensi": item.office || '365 Family',
                "Server Induk": item.server_utama || '-',
                "Masa Aktif": item.workspace_expired || item.masa_aktif || '-',
                "Status": item.status || 'Aktif'
            }));
            return {
                title: "Laporan Lisensi Microsoft Office",
                rows,
                totalCount: rows.length,
                summaryText: `Total Akun Lisensi: ${rows.length} Akun`
            };
        }

        case 'activity_logs': {
            const raw = filterArray(cloud.activity_logs || [], 'tanggal_jam');
            const rows = raw.map((item, idx) => ({
                "No": idx + 1,
                "Waktu Log": item.tanggal_jam || '-',
                "Operator": item.user || '-',
                "Aksi": item.action || '-',
                "Modul": item.menu_display || '-',
                "Detail": item.details || '-'
            }));
            return {
                title: "Laporan Audit Log Aktivitas",
                rows,
                totalCount: rows.length,
                summaryText: `Total Jejak Audit: ${rows.length} Baris Log`
            };
        }

        default:
            return { title: "Laporan Operasional", rows: [], totalCount: 0, summaryText: "Tidak ada data" };
    }
}

// ==========================================================================
// 3. ENGINE EXPORT 1: EXCEL (.xlsx)
// ==========================================================================
function exportReportExcel(moduleKey) {
    const report = getFilteredReportData(moduleKey);
    if (!report.rows.length) {
        if (window.showToast) window.showToast("Tidak ada data laporan untuk diekspor pada filter ini.", "warning");
        return;
    }

    const worksheet = XLSX.utils.json_to_sheet(report.rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan");

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `${report.title.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    if (window.logActivity) window.logActivity('Lainnya', 'reports', `Mengunduh Laporan Excel: ${report.title}.`);
    if (window.showToast) window.showToast("Laporan Excel berhasil diunduh!");
}

// ==========================================================================
// 4. ENGINE EXPORT 2: PDF / CETAK RESMI (PRINT-READY)
// ==========================================================================
function exportReportPdf(moduleKey) {
    const report = getFilteredReportData(moduleKey);
    if (!report.rows.length) {
        if (window.showToast) window.showToast("Tidak ada data laporan untuk dicetak.", "warning");
        return;
    }

    const oldArea = document.getElementById('report-print-area');
    if (oldArea) oldArea.remove();

    let printStyle = document.getElementById('dynamic-print-style');
    if (printStyle) printStyle.remove();
    printStyle = document.createElement('style');
    printStyle.id = 'dynamic-print-style';
    printStyle.innerHTML = `
        @media print {
            @page {
                size: A4 landscape;
                margin: 8mm;
            }
            body * { visibility: hidden !important; }
            #report-print-area, #report-print-area * { visibility: visible !important; }
            #report-print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                display: block !important;
                background: #fff;
                color: #000;
                font-family: Arial, sans-serif;
            }
        }
    `;
    document.head.appendChild(printStyle);

    const headers = Object.keys(report.rows[0]);
    const tableHeaderHtml = headers.map(h => `<th style="border: 1px solid #333; padding: 5px 6px; background: #0f172a; color: #fff; font-size: 9px; text-transform: uppercase;">${escapeHtml(h)}</th>`).join('');
    
    const tableRowsHtml = report.rows.map((row, idx) => {
        const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        const cols = headers.map(h => {
            let val = row[h];
            if (typeof val === 'number' && (h.includes('Biaya') || h.includes('Harga') || h.includes('Nominal') || h.includes('Tarif') || h.includes('Bayar'))) {
                val = `Rp ${val.toLocaleString('id-ID')}`;
            }
            return `<td style="border: 1px solid #ccc; padding: 4px 6px; font-size: 8.5px; background: ${bg};">${escapeHtml(val)}</td>`;
        }).join('');
        return `<tr>${cols}</tr>`;
    }).join('');

    const startVal = document.getElementById('reports-filter-start')?.value || 'Awal';
    const endVal = document.getElementById('reports-filter-end')?.value || 'Sekarang';
    const rawBranch = document.getElementById('reports-filter-cabang')?.value || 'Semua Cabang';
    const branchVal = window.userBranch || rawBranch;
    const operatorName = window.currentUser?.name || window.currentUser?.email || 'Admin Operasional';
    const nowStr = new Date().toLocaleString('id-ID');

    const printArea = document.createElement('div');
    printArea.id = 'report-print-area';
    printArea.className = 'hidden';

    printArea.innerHTML = `
        <div style="padding: 10px; box-sizing: border-box; width: 100%;">
            <!-- Kop Dokumen Resmi -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px;">
                <div>
                    <h2 style="margin: 0; font-size: 14px; font-weight: bold; text-transform: uppercase; color: #0f172a; letter-spacing: 0.5px;">CV. Wana Satria Komputindo</h2>
                    <p style="margin: 2px 0; font-size: 8.5px; color: #333;">Jual-Beli, Sewa, Service Laptop & CCTV | Makassar (Monumen Emmy Saelan & Perintis)</p>
                </div>
                <div style="text-align: right;">
                    <h3 style="margin: 0; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #0891b2;">${escapeHtml(report.title)}</h3>
                    <p style="margin: 2px 0; font-size: 8px; color: #555;">Periode: ${escapeHtml(startVal)} s/d ${escapeHtml(endVal)} | Cabang: ${escapeHtml(branchVal)}</p>
                </div>
            </div>

            <!-- Ringkasan Eksekutif -->
            <div style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 10px; margin-bottom: 8px; font-size: 9px; font-weight: bold; color: #0f172a; border-radius: 4px;">
                <span>📊 ${escapeHtml(report.summaryText)}</span>
                <span style="float: right; font-weight: normal; color: #64748b;">Dicetak: ${escapeHtml(nowStr)} | Operator: ${escapeHtml(operatorName)}</span>
            </div>

            <!-- Tabel Data Utama -->
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead><tr>${tableHeaderHtml}</tr></thead>
                <tbody>${tableRowsHtml}</tbody>
            </table>

            <!-- Lembar Pengesahan / Tanda Tangan -->
            <div style="display: flex; justify-content: space-between; margin-top: 24px; padding: 0 40px; font-size: 9px; text-align: center; page-break-inside: avoid;">
                <div style="width: 200px;">
                    <p style="margin: 0 0 40px 0; color: #475569;">Dibuat Oleh (Operator / Kasir):</p>
                    <p style="margin: 0; border-top: 1px solid #333; font-weight: bold; text-transform: uppercase;">${escapeHtml(operatorName)}</p>
                </div>
                <div style="width: 200px;">
                    <p style="margin: 0 0 40px 0; color: #475569;">Diketahui / Disetujui:</p>
                    <p style="margin: 0; border-top: 1px solid #333; font-weight: bold; text-transform: uppercase;">Pimpinan CV. Wana Satria</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(printArea);
    setTimeout(() => { window.print(); }, 250);
}

// ==========================================================================
// 5. ENGINE EXPORT 3: WORD (.doc / .docx)
// ==========================================================================
function exportReportWord(moduleKey) {
    const report = getFilteredReportData(moduleKey);
    if (!report.rows.length) {
        if (window.showToast) window.showToast("Tidak ada data laporan untuk diekspor ke Word.", "warning");
        return;
    }

    const headers = Object.keys(report.rows[0]);
    const startVal = document.getElementById('reports-filter-start')?.value || 'Awal';
    const endVal = document.getElementById('reports-filter-end')?.value || 'Sekarang';
    const rawBranch = document.getElementById('reports-filter-cabang')?.value || 'Semua Cabang';
    const branchVal = window.userBranch || rawBranch;
    const operatorName = window.currentUser?.name || window.currentUser?.email || 'Admin Operasional';
    const nowStr = new Date().toLocaleString('id-ID');

    const tableHeaderHtml = headers.map(h => `<th style="border: 1px solid #333; padding: 6px; background-color: #0f172a; color: #ffffff; font-size: 9pt;">${escapeHtml(h)}</th>`).join('');
    
    const tableRowsHtml = report.rows.map((row, idx) => {
        const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        const cols = headers.map(h => {
            let val = row[h];
            if (typeof val === 'number' && (h.includes('Biaya') || h.includes('Harga') || h.includes('Nominal') || h.includes('Tarif') || h.includes('Bayar'))) {
                val = `Rp ${val.toLocaleString('id-ID')}`;
            }
            return `<td style="border: 1px solid #cbd5e1; padding: 5px; font-size: 9pt; background-color: ${bg};">${escapeHtml(val)}</td>`;
        }).join('');
        return `<tr>${cols}</tr>`;
    }).join('');

    const wordHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${escapeHtml(report.title)}</title>
        <style>
            body { font-family: Arial, Calibri, sans-serif; font-size: 10pt; color: #111; }
            table { border-collapse: collapse; width: 100%; margin-top: 10pt; }
            .kop { text-align: left; border-bottom: 2px solid #0f172a; padding-bottom: 6pt; margin-bottom: 12pt; }
            .kpi { background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6pt 10pt; font-weight: bold; margin-bottom: 10pt; }
        </style>
        </head>
        <body>
            <div class="kop">
                <h2 style="margin: 0; font-size: 14pt; color: #0f172a; text-transform: uppercase;">CV. WANA SATRIA KOMPUTINDO</h2>
                <p style="margin: 2pt 0; font-size: 9pt; color: #475569;">Jual-Beli, Sewa, Service Laptop & CCTV | Makassar (Monumen Emmy Saelan & Perintis)</p>
                <h3 style="margin: 6pt 0 0 0; font-size: 12pt; color: #0891b2;">${escapeHtml(report.title)}</h3>
                <p style="margin: 2pt 0; font-size: 8.5pt; color: #64748b;">Periode: ${escapeHtml(startVal)} s/d ${escapeHtml(endVal)} | Cabang: ${escapeHtml(branchVal)} | Operator: ${escapeHtml(operatorName)} | Waktu: ${escapeHtml(nowStr)}</p>
            </div>

            <div class="kpi">
                <span>📊 ${escapeHtml(report.summaryText)}</span>
            </div>

            <table>
                <thead><tr>${tableHeaderHtml}</tr></thead>
                <tbody>${tableRowsHtml}</tbody>
            </table>

            <br><br>
            <table style="border: none; width: 100%; margin-top: 20pt;">
                <tr style="border: none;">
                    <td style="border: none; text-align: center; width: 50%;">
                        <p style="margin: 0 0 45pt 0;">Dibuat Oleh (Operator / Kasir):</p>
                        <p style="margin: 0; font-weight: bold;">( ${escapeHtml(operatorName)} )</p>
                    </td>
                    <td style="border: none; text-align: center; width: 50%;">
                        <p style="margin: 0 0 45pt 0;">Diketahui / Disetujui:</p>
                        <p style="margin: 0; font-weight: bold;">( Pimpinan CV. Wana Satria )</p>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;

    const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `${report.title.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.doc`;

    const link = document.createElement('a');
    link.download = fileName;
    link.href = URL.createObjectURL(blob);
    link.click();

    if (window.logActivity) window.logActivity('Lainnya', 'reports', `Mengunduh Laporan Word: ${report.title}.`);
    if (window.showToast) window.showToast("Laporan Word berhasil diunduh!");
}

// ==========================================================================
// 6. ENGINE EXPORT 4: POWERPOINT (.pptx)
// ==========================================================================
function exportReportPpt(moduleKey) {
    if (typeof PptxGenJS === 'undefined') {
        alert("Library PowerPoint (PptxGenJS) belum dimuat. Pastikan koneksi internet aktif.");
        return;
    }

    const report = getFilteredReportData(moduleKey);
    if (!report.rows.length) {
        if (window.showToast) window.showToast("Tidak ada data laporan untuk dibuatkan presentasi PowerPoint.", "warning");
        return;
    }

    try {
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_16x9';

        const startVal = document.getElementById('reports-filter-start')?.value || 'Awal';
        const endVal = document.getElementById('reports-filter-end')?.value || 'Sekarang';
        const rawBranch = document.getElementById('reports-filter-cabang')?.value || 'Semua Cabang';
        const branchVal = window.userBranch || rawBranch;
        const operatorName = window.currentUser?.name || window.currentUser?.email || 'Admin Operasional';
        const nowStr = new Date().toLocaleString('id-ID');

        // SLIDE 1: COVER
        const slideCover = pptx.addSlide();
        slideCover.background = { color: '0F172A' }; // Dark Slate

        slideCover.addText('CV. WANA SATRIA KOMPUTINDO', {
            x: 0.8, y: 1.5, fontSize: 16, color: '38BDF8', bold: true, fontFace: 'Arial'
        });
        slideCover.addText(report.title, {
            x: 0.8, y: 2.2, fontSize: 26, color: 'FFFFFF', bold: true, fontFace: 'Arial', w: '85%'
        });
        slideCover.addText(`Periode: ${startVal} s/d ${endVal} | Cabang: ${branchVal}\nOperator: ${operatorName} | Generate: ${nowStr}`, {
            x: 0.8, y: 3.8, fontSize: 12, color: '94A3B8', fontFace: 'Arial', lineSpacing: 20
        });

        // SLIDE 2: RINGKASAN EKSEKUTIF (KPI CARDS)
        const slideSummary = pptx.addSlide();
        slideSummary.background = { color: 'F8FAFC' };

        slideSummary.addText('RINGKASAN EKSEKUTIF & KPI', {
            x: 0.8, y: 0.6, fontSize: 18, color: '0F172A', bold: true, fontFace: 'Arial'
        });
        slideSummary.addText(`${report.title} — Periode: ${startVal} s/d ${endVal}`, {
            x: 0.8, y: 1.1, fontSize: 11, color: '64748B', fontFace: 'Arial'
        });

        slideSummary.addShape(pptx.ShapeType.rect, {
            x: 0.8, y: 1.8, w: 4.0, h: 2.2, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 }
        });
        slideSummary.addText('TOTAL DATA / TRANSAKSI', {
            x: 1.0, y: 2.1, fontSize: 10, color: '64748B', bold: true, fontFace: 'Arial'
        });
        slideSummary.addText(`${report.totalCount}`, {
            x: 1.0, y: 2.7, fontSize: 32, color: '0891B2', bold: true, fontFace: 'Arial'
        });

        slideSummary.addShape(pptx.ShapeType.rect, {
            x: 5.2, y: 1.8, w: 6.8, h: 2.2, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 }
        });
        slideSummary.addText('CATATAN / RINGKASAN PERFORMA', {
            x: 5.4, y: 2.1, fontSize: 10, color: '64748B', bold: true, fontFace: 'Arial'
        });
        slideSummary.addText(report.summaryText, {
            x: 5.4, y: 2.6, fontSize: 13, color: '0F172A', bold: true, fontFace: 'Arial', w: 6.2
        });

        // SLIDE 3+: TABEL DATA UTAMA DENGAN SLIDE PAGINATION
        const headers = Object.keys(report.rows[0]);
        const tableData = [];

        // Header Row
        tableData.push(headers.map(h => ({
            text: h,
            options: { fill: '0F172A', color: 'FFFFFF', bold: true, fontSize: 9, align: 'center' }
        })));

        // Data Rows
        report.rows.forEach((row, rIdx) => {
            const bg = rIdx % 2 === 0 ? 'FFFFFF' : 'F1F5F9';
            tableData.push(headers.map(h => {
                let val = row[h];
                if (typeof val === 'number' && (h.includes('Biaya') || h.includes('Harga') || h.includes('Nominal') || h.includes('Tarif') || h.includes('Bayar'))) {
                    val = `Rp ${val.toLocaleString('id-ID')}`;
                }
                return {
                    text: String(val ?? '-'),
                    options: { fill: bg, color: '1E293B', fontSize: 8, align: 'left' }
                };
            }));
        });

        const slideTable = pptx.addSlide();
        slideTable.background = { color: 'FFFFFF' };
        slideTable.addText(`DATA DETAIL - ${report.title}`, {
            x: 0.5, y: 0.4, fontSize: 14, color: '0F172A', bold: true, fontFace: 'Arial'
        });

        slideTable.addTable(tableData, {
            x: 0.5, y: 0.9, w: 12.3, autoPage: true, autoPageRepeatHeader: true,
            border: { pt: '1', color: 'CBD5E1' }
        });

        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `${report.title.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.pptx`;
        pptx.writeFile({ fileName });

        if (window.logActivity) window.logActivity('Lainnya', 'reports', `Mengunduh Laporan PowerPoint: ${report.title}.`);
        if (window.showToast) window.showToast("Presentasi PowerPoint berhasil diunduh!");
    } catch (err) {
        console.error("Galat pembuatan PowerPoint:", err);
        alert("Gagal membuat berkas PowerPoint: " + err.message);
    }
}

// ==========================================================================
// 7. PENGENDALI MODAL UI & RENDER DAFTAR 11 MODUL
// ==========================================================================
window.openReportsModal = function() {
    const perms = window.currentUser?.permissions || {};
    const isSuperadmin = (window.currentUser?.email === 'superadmin@wanasatria.com');
    const canAccess = isSuperadmin || perms.unduh_laporan === true || perms.unduh_laporan === 'true';

    if (!canAccess) {
        alert("Maaf, Anda tidak memiliki hak akses untuk membuka Pusat Unduh Laporan.");
        return;
    }

    const modal = document.getElementById('reports-modal');
    const branchFilter = document.getElementById('reports-filter-cabang');

    if (branchFilter) {
        if (window.userBranch) {
            branchFilter.value = window.userBranch;
            branchFilter.disabled = true;
        } else {
            branchFilter.disabled = false;
        }
    }

    if (modal) {
        modal.classList.remove('hidden');
        renderReportsList();
    }
};

window.closeReportsModal = function() {
    const modal = document.getElementById('reports-modal');
    if (modal) modal.classList.add('hidden');
};

window.resetReportsFilter = function() {
    const branchFilter = document.getElementById('reports-filter-cabang');
    const startFilter = document.getElementById('reports-filter-start');
    const endFilter = document.getElementById('reports-filter-end');

    if (branchFilter && !window.userBranch) branchFilter.value = '';
    if (startFilter) startFilter.value = '';
    if (endFilter) endFilter.value = '';

    renderReportsList();
};

window.renderReportsList = function() {
    const container = document.getElementById('reports-list-container');
    if (!container) return;

    const moduleKeys = Object.keys(REPORT_MODULES_CONFIG);
    let html = '';

    moduleKeys.forEach((key, index) => {
        const conf = REPORT_MODULES_CONFIG[key];
        const dataPreview = getFilteredReportData(key);

        html += `
            <div class="p-3.5 hover:bg-slate-50/70 transition flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div class="flex items-start gap-3 flex-1">
                    <div class="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-sm shrink-0">
                        <i class="${conf.icon}"></i>
                    </div>
                    <div class="space-y-0.5">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-bold text-xs text-slate-800">${index + 1}. ${escapeHtml(conf.title)}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold font-mono bg-slate-100 text-slate-700 border border-slate-200">
                                ${dataPreview.totalCount} Data
                            </span>
                        </div>
                        <p class="text-[11px] text-slate-500">${escapeHtml(conf.desc)}</p>
                    </div>
                </div>

                <div class="flex items-center gap-1.5 shrink-0 self-end md:self-center flex-wrap">
                    <button type="button" onclick="window.exportReport('${key}', 'excel')" class="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs" title="Unduh Spreadsheet Excel">
                        <i class="fa-solid fa-file-excel"></i> <span>Excel</span>
                    </button>
                    <button type="button" onclick="window.exportReport('${key}', 'pdf')" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs" title="Cetak / Simpan PDF Resmi">
                        <i class="fa-solid fa-file-pdf"></i> <span>PDF</span>
                    </button>
                    <button type="button" onclick="window.exportReport('${key}', 'word')" class="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs" title="Unduh Dokumen Word Siap Edit">
                        <i class="fa-solid fa-file-word"></i> <span>Word</span>
                    </button>
                    <button type="button" onclick="window.exportReport('${key}', 'ppt')" class="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs" title="Unduh Slide Presentasi PowerPoint">
                        <i class="fa-solid fa-file-powerpoint"></i> <span>PPT</span>
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
};

// Dispatcher Universal
window.exportReport = function(moduleKey, format) {
    if (format === 'excel') exportReportExcel(moduleKey);
    else if (format === 'pdf') exportReportPdf(moduleKey);
    else if (format === 'word') exportReportWord(moduleKey);
    else if (format === 'ppt') exportReportPpt(moduleKey);
};