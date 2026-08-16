/* ==========================================================================
   Teknisi Portal - sheets.js (Modul Integrasi 2 Cabang Google Sheets)
   ========================================================================== */

// PASTE KEDUA URL WEB APP GOOGLE APPS SCRIPT ANDA DI SINI
const GOOGLE_SHEETS_URLS = {
    "Monumen Emmy Saelan": "https://script.google.com/macros/s/AKfycbxqqruBHGeIJPjUK312S3t0WzW8qDOlx5sI1uYaCUEoOYh6z8PYGFtH4hg7nGknzDqpkA/exec",
    "Perintis": "https://script.google.com/macros/s/AKfycbyhezcq5axSwFgwKAq44JdjQbmth-h0OBVLOSynsyxn8CLdcUipV2lmEyLmjBe-BQ2Z/exec"
};

/**
 * Memformat data sewa dari Web Portal menjadi bentuk rapi sesuai Kolom A - R di Google Sheet
 */
function formatPenyewaanDataForSheet(sewaItem) {
    const currentUser = window.currentUser || {};
    const activeName = currentUser.name || (currentUser.email ? currentUser.email.split('@')[0] : 'ADMIN');
    const activeBranch = sewaItem.cabang || currentUser.branch || 'Head Office';
    const operatorName = `${activeName} (${activeBranch})`;

    let specString = '-';
    let totalQty = 0;
    let mainBrand = 'LENOVO';
    let unitTypeDisplay = 'Laptop';

    if (sewaItem.unit) {
        const rawUnits = sewaItem.unit.split(',').map(u => u.trim()).filter(Boolean);
        totalQty = rawUnits.length || 1;

        const counts = {};
        const types = new Set();
        const brands = new Set();

        rawUnits.forEach(uStr => {
            const clean = uStr.replace(/^[•\s\-\[\]]+/, '');
            
            if (uStr.toLowerCase().includes('printer')) {
                types.add('Printer');
            } else {
                types.add('Laptop');
            }

            const parts = clean.split('[');
            const modelName = parts[0] ? parts[0].trim() : clean;
            
            if (modelName) {
                const firstWord = modelName.split(' ')[0];
                if (firstWord) brands.add(firstWord.toUpperCase());
                counts[modelName] = (counts[modelName] || 0) + 1;
            }
        });

        const specParts = [];
        for (const mName in counts) {
            specParts.push(`${mName} (${counts[mName]})`);
        }
        if (specParts.length > 0) {
            specString = specParts.join(', ');
        }

        if (types.has('Laptop') && types.has('Printer')) {
            unitTypeDisplay = 'Laptop & Printer';
        } else if (types.has('Printer')) {
            unitTypeDisplay = 'Printer';
        } else {
            unitTypeDisplay = 'Laptop';
        }

        if (brands.size > 0) {
            mainBrand = Array.from(brands).join(', ');
        }
    }

    return {
        id: sewaItem.id || '-',
        tanggal: sewaItem.tanggal || '',
        cabang: activeBranch,
        merk: mainBrand,
        jenis_produk: unitTypeDisplay,
        spesifikasi: specString,
        total_biaya: Number(sewaItem.total_biaya) || 0,
        sumber_info: sewaItem.sumber_info || 'GOOGLE',
        kondisi_produk: 'Layak Sewa',
        status_produk: 'Disewakan',
        penyewa: sewaItem.penyewa || '-',
        jumlah_sewa: totalQty,
        tgl_mulai: sewaItem.tgl_mulai || '-',
        tgl_selesai: sewaItem.tgl_selesai || '-',
        uang_jaminan: Number(sewaItem.uang_jaminan) || 0,
        status_sewa: (sewaItem.status === 'Selesai') ? 'Selesai' : 'Sementara',
        penanggung_jawab: operatorName
    };
}

/**
 * Mengirimkan data transaksi penyewaan ke Google Sheet Cabang yang Sesuai
 */
window.syncSinglePenyewaanToSheet = function(sewaItem, isUpdateAction = false) {
    if (!sewaItem) return Promise.resolve();

    const payload = formatPenyewaanDataForSheet(sewaItem);
    if (isUpdateAction) {
        payload.action = "update_status";
    }

    const targetBranch = sewaItem.cabang || window.currentUser?.branch || 'Head Office';
    let webhookUrl = "";

    // Tentukan URL Google Sheet berdasarkan Cabang
    if (targetBranch.toLowerCase().includes('perintis')) {
        webhookUrl = GOOGLE_SHEETS_URLS["Perintis"];
    } else {
        webhookUrl = GOOGLE_SHEETS_URLS["Monumen Emmy Saelan"];
    }

    if (!webhookUrl || webhookUrl.includes('PASTE_URL')) {
        console.warn("Sinkronisasi Google Sheet dibatalkan: URL Web App untuk cabang [" + targetBranch + "] belum diisi.");
        return Promise.resolve();
    }

    return fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch(err => console.warn("Gagal mengirim ke Google Sheet:", err));
};

/**
 * Fungsi Manual Bulk Sync (Dipanggil saat tombol di Alat & Utilitas diklik)
 */
window.syncAllPenyewaanToSheet = function() {
    const dataList = window.globalDataCloud['penyewaan'] || [];
    if (dataList.length === 0) {
        if (window.showToast) window.showToast("Tidak ada data penyewaan untuk disinkronkan.", "warning");
        return;
    }

    if (!confirm(`Apakah Anda yakin ingin menyinkronkan seluruh ${dataList.length} data penyewaan ke Google Sheet masing-masing cabang?`)) {
        return;
    }

    if (window.showToast) window.showToast("Memulai sinkronisasi massal ke Google Sheet...", "info");

    let index = 0;
    function processNext() {
        if (index < dataList.length) {
            const item = dataList[index];
            window.syncSinglePenyewaanToSheet(item, false).finally(() => {
                index++;
                setTimeout(processNext, 400);
            });
        } else {
            if (window.showToast) window.showToast("Sinkronisasi massal ke Google Sheet selesai!", "success");
        }
    }
    processNext();
};