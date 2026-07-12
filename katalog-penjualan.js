/* ==========================================================================
   Teknisi Portal - katalog-penjualan.js (Modul Katalog & Log Penjualan)
   ========================================================================== */
import { db, ref, set, push, update, remove, get } from './firebase-config.js';

// ==========================================================================
// A. HELPER UTAMA: SINKRONISASI STOK KATALOG PRODUK
// ==========================================================================

/**
 * Menyesuaikan stok barang secara langsung di Firebase berdasarkan kuantitas perubahan.
 * @param {string} productKey - Firebase Key dari Katalog Produk.
 * @param {number} changeAmount - Jumlah perubahan (+ untuk mengembalikan stok, - untuk mengurangi stok).
 */
export async function adjustKatalogStock(productKey, changeAmount) {
    if (!productKey) return;
    const productRef = ref(db, `katalog_produk/${productKey}`);
    try {
        const snapshot = await get(productRef);
        if (snapshot.exists()) {
            const productData = snapshot.val();
            const currentStock = Number(productData.stok) || 0;
            const newStock = Math.max(0, currentStock + changeAmount);
            await update(productRef, { stok: newStock });
        }
    } catch (err) {
        console.error(`Gagal menyesuaikan stok untuk ${productKey}:`, err);
    }
}

/**
 * Membandingkan array belanja lama dan baru untuk menghitung selisih perubahan stok.
 * @param {Array} oldItems - Array berisi item terjual lama.
 * @param {Array} newItems - Array berisi item terjual baru.
 * @param {boolean} isCancelledOrDeleted - True jika seluruh transaksi dibatalkan/dihapus.
 */
export async function syncStockAdjustment(oldItems = [], newItems = [], isCancelledOrDeleted = false) {
    const netChanges = {}; // Menyimpan akumulasi perubahan per productKey

    if (isCancelledOrDeleted) {
        // Kembalikan seluruh stok barang lama
        oldItems.forEach(item => {
            const key = item._productKey || item.productKey;
            if (key) {
                const qty = Number(item.qty) || 0;
                netChanges[key] = (netChanges[key] || 0) + qty;
            }
        });
    } else {
        // Kembalikan stok lama terlebih dahulu (reverse)
        oldItems.forEach(item => {
            const key = item._productKey || item.productKey;
            if (key) {
                const qty = Number(item.qty) || 0;
                netChanges[key] = (netChanges[key] || 0) + qty;
            }
        });
        // Kurangi dengan stok yang baru dibeli/dipakai
        newItems.forEach(item => {
            const key = item._productKey || item.productKey;
            if (key) {
                const qty = Number(item.qty) || 0;
                netChanges[key] = (netChanges[key] || 0) - qty;
            }
        });
    }

    // Jalankan pembaruan stok ke Firebase database
    for (const key of Object.keys(netChanges)) {
        const change = netChanges[key];
        if (change !== 0) {
            await adjustKatalogStock(key, change);
        }
    }
}

/**
 * Logika Integrasi Pilar 3: Mengelola stok untuk pemakaian "Bahan/Produk" pada Log Services.
 */
export async function syncServiceMaterialStock(oldItems = [], newItems = [], isCancelledOrDeleted = false) {
    // Saring hanya item yang bertipe "Produk"
    const oldProducts = (oldItems || []).filter(item => item.type === 'Produk');
    const newProducts = (newItems || []).filter(item => item.type === 'Produk');
    await syncStockAdjustment(oldProducts, newProducts, isCancelledOrDeleted);
}


// ==========================================================================
// B. OPERASI CRUD: KATALOG PRODUK
// ==========================================================================

export function reindexKatalogProdukIds(excludedFirebaseKey = null) {
    const dataList = Array.isArray(window.globalDataCloud.katalog_produk) ? window.globalDataCloud.katalog_produk : [];
    if (!dataList.length) return Promise.resolve();

    const remainingItems = dataList.filter(item => item && item._firebaseKey && item._firebaseKey !== excludedFirebaseKey);
    if (remainingItems.length === 0) {
        window.globalDataCloud.katalog_produk = [];
        return Promise.resolve();
    }

    const sortedItems = [...remainingItems].sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0));

    const updatePromises = sortedItems.map((item, index) => {
        const newId = index + 1;
        if (Number(item.id) === newId) return Promise.resolve();
        const itemRef = ref(db, `katalog_produk/${item._firebaseKey}`);
        return update(itemRef, { id: newId }).catch(() => null);
    });

    return Promise.allSettled(updatePromises).then((results) => {
        const hasFailures = results.some(result => result.status === 'rejected');
        if (!hasFailures) {
            window.globalDataCloud.katalog_produk = sortedItems.map((item, index) => ({
                ...item,
                id: index + 1
            }));
        }
        return results;
    });
}

export function submitKatalogProduk(formData, btnSubmit, originalText, formElement) {
    const currentData = window.globalDataCloud.katalog_produk || [];
    const name = formData.get('nama_barang');
    const category = formData.get('kategori');
    const stock = Number(formData.get('stok')) || 0;
    const unit = formData.get('satuan') || 'Pcs';
    const cPrice = String(formData.get('harga_modal') || '').replace(/\D/g, '');
    const sPrice = String(formData.get('harga_jual') || '').replace(/\D/g, '');
    const branch = formData.get('cabang') || window.currentUser.branch || 'Head Office';
    const notes = formData.get('catatan') || '';

    const nextId = currentData.length === 0 ? 1 : Math.max(...currentData.map(d => Number(d.id) || 0)) + 1;

    const newItem = {
        id: nextId,
        nama_barang: name,
        kategori: category,
        stok: stock,
        satuan: unit,
        harga_modal: cPrice,
        harga_jual: sPrice,
        cabang: branch,
        catatan: notes
    };

    const targetRef = ref(db, 'katalog_produk');
    push(targetRef, newItem)
        .then(() => {
            if (window.logActivity) window.logActivity('Tambah', 'katalog_produk', `Menambah produk baru: ${name} (Stok: ${stock} ${unit}) di cabang ${branch}.`);
            if (window.showToast) window.showToast("Produk berhasil ditambahkan!");
            formElement.reset();
        })
        .catch((error) => {
            if (window.showToast) window.showToast("Gagal menyimpan produk: " + error.message, "error");
        })
        .finally(() => {
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
}

export function updateKatalogProduk(firebaseKey, updatedData, targetItem, btnUpdate, originalText) {
    const targetRef = ref(db, `katalog_produk/${firebaseKey}`);
    update(targetRef, updatedData)
        .then(() => {
            if (window.logActivity) window.logActivity('Ubah', 'katalog_produk', `Mengubah produk ID: ${targetItem.id || '-'} (${updatedData.nama_barang}).`);
            if (window.showToast) window.showToast("Data produk berhasil diperbarui!");
            if (window.closeEditModal) window.closeEditModal();
        })
        .catch(err => {
            alert("Gagal memperbarui produk: " + err.message);
        })
        .finally(() => {
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
        });
}

export function deleteKatalogProduk(firebaseKey, targetItem) {
    if (confirm(`Apakah Anda yakin ingin menghapus produk [ ${targetItem.nama_barang} ] secara permanen?`)) {
        const targetRowRef = ref(db, `katalog_produk/${firebaseKey}`);
        remove(targetRowRef)
            .then(() => {
                return reindexKatalogProdukIds(firebaseKey);
            })
            .then(() => {
                if (window.logActivity) window.logActivity('Hapus', 'katalog_produk', `Menghapus produk ID #${targetItem.id} (${targetItem.nama_barang}) dari database.`);
                if (window.showToast) window.showToast("Produk berhasil dihapus.");
            })
            .catch((error) => {
                console.warn('Gagal menata ulang ID Katalog Produk:', error);
                if (window.showToast) window.showToast('Data terhapus, tetapi penyusunan ulang ID gagal.', 'warning');
            });
    }
}


// ==========================================================================
// C. OPERASI CRUD & INTEGRASI STOK: LOG PENJUALAN
// ==========================================================================

export function reindexLogPenjualanIds(excludedFirebaseKey = null) {
    const dataList = Array.isArray(window.globalDataCloud.log_penjualan) ? window.globalDataCloud.log_penjualan : [];
    if (!dataList.length) return Promise.resolve();

    const remainingItems = dataList.filter(item => item && item._firebaseKey && item._firebaseKey !== excludedFirebaseKey);
    if (remainingItems.length === 0) {
        window.globalDataCloud.log_penjualan = [];
        return Promise.resolve();
    }

    const sortedItems = [...remainingItems].sort((a, b) => (Number(a?.id) || 0) - (Number(b?.id) || 0));

    const updatePromises = sortedItems.map((item, index) => {
        const newId = index + 1;
        if (Number(item.id) === newId) return Promise.resolve();
        const itemRef = ref(db, `log_penjualan/${item._firebaseKey}`);
        return update(itemRef, { id: newId }).catch(() => null);
    });

    return Promise.allSettled(updatePromises).then((results) => {
        const hasFailures = results.some(result => result.status === 'rejected');
        if (!hasFailures) {
            window.globalDataCloud.log_penjualan = sortedItems.map((item, index) => ({
                ...item,
                id: index + 1
            }));
        }
        return results;
    });
}

export function submitLogPenjualan(formData, btnSubmit, originalText, formElement, selectedItems = []) {
    if (selectedItems.length === 0) {
        alert("Silakan pilih minimal 1 barang dari Katalog Produk!");
        if (btnSubmit) {
            btnSubmit.innerHTML = originalText;
            btnSubmit.disabled = false;
        }
        return;
    }

    const currentData = window.globalDataCloud.log_penjualan || [];
    const buyerName = formData.get('nama_pembeli') || 'Walk-in Customer';
    const phone = formData.get('no_wa') || '-';
    const branch = formData.get('cabang') || window.currentUser.branch || 'Head Office';
    const dateInput = formData.get('tanggal');

    const d = new Date();
    const formattedToday = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const tanggal = dateInput ? dateInput.split('-').reverse().join('/') : formattedToday;

    const nextId = currentData.length === 0 ? 1 : Math.max(...currentData.map(d => Number(d.id) || 0)) + 1;
    const paddedId = String(nextId).padStart(5, '0');
    const refCode = `SLS/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${paddedId}`;

    let totalBayar = 0;
    const itemsTerjual = selectedItems.map(item => {
        const subtotal = (Number(item.qty) || 1) * (Number(item.price) || 0);
        totalBayar += subtotal;
        return {
            _productKey: item.productKey || item._productKey,
            name: item.name,
            qty: Number(item.qty) || 1,
            price: Number(item.price) || 0,
            subtotal: subtotal
        };
    });

    const newSale = {
        id: nextId,
        no_ref: refCode,
        tanggal: tanggal,
        cabang: branch,
        nama_pembeli: buyerName,
        no_wa: phone,
        total_bayar: totalBayar,
        items_terjual: itemsTerjual
    };

    const targetRef = ref(db, 'log_penjualan');
    push(targetRef, newSale)
        .then(async () => {
            // Potong stok produk terkait di Katalog Produk
            await syncStockAdjustment([], itemsTerjual, false);

            if (window.logActivity) window.logActivity('Tambah', 'log_penjualan', `Menyimpan transaksi penjualan ${refCode} senilai Rp ${totalBayar.toLocaleString('id-ID')} kepada ${buyerName}.`);
            if (window.showToast) window.showToast("Penjualan berhasil disimpan!");
            formElement.reset();
        })
        .catch((error) => {
            if (window.showToast) window.showToast("Gagal menyimpan penjualan: " + error.message, "error");
        })
        .finally(() => {
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
}

export function updateLogPenjualan(firebaseKey, updatedData, targetItem, btnUpdate, originalText) {
    const targetRef = ref(db, `log_penjualan/${firebaseKey}`);
    update(targetRef, updatedData)
        .then(async () => {
            // Sinkronisasi penyesuaian selisih stok (lama vs baru)
            const oldItems = targetItem.items_terjual || [];
            const newItems = updatedData.items_terjual || [];
            await syncStockAdjustment(oldItems, newItems, false);

            if (window.logActivity) window.logActivity('Ubah', 'log_penjualan', `Memperbarui transaksi penjualan ID: ${targetItem.id} (${updatedData.no_ref}).`);
            if (window.showToast) window.showToast("Transaksi penjualan berhasil diperbarui!");
            if (window.closeEditModal) window.closeEditModal();
        })
        .catch(err => {
            alert("Gagal memperbarui transaksi: " + err.message);
        })
        .finally(() => {
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
        });
}

export function deleteLogPenjualan(firebaseKey, targetItem) {
    if (confirm(`Apakah Anda yakin ingin membatalkan/menghapus penjualan [ ${targetItem.no_ref} ] secara permanen?`)) {
        const targetRowRef = ref(db, `log_penjualan/${firebaseKey}`);
        remove(targetRowRef)
            .then(async () => {
                // Kembalikan seluruh stok barang yang terjual ke master Katalog Produk
                const oldItems = targetItem.items_terjual || [];
                await syncStockAdjustment(oldItems, [], true);

                return reindexLogPenjualanIds(firebaseKey);
            })
            .then(() => {
                if (window.logActivity) window.logActivity('Hapus', 'log_penjualan', `Membatalkan/Menghapus transaksi penjualan ID #${targetItem.id} (${targetItem.no_ref}).`);
                if (window.showToast) window.showToast("Transaksi berhasil dibatalkan dan dihapus.");
            })
            .catch((error) => {
                console.warn('Gagal menata ulang ID Log Penjualan:', error);
                if (window.showToast) window.showToast('Data terhapus, tetapi penataan ID gagal.', 'warning');
            });
    }
}

// Ikat ke window object global agar langsung dikenal oleh app.js, table.js, dan forms.js
window.adjustKatalogStock = adjustKatalogStock;
window.syncStockAdjustment = syncStockAdjustment;
window.syncServiceMaterialStock = syncServiceMaterialStock;

window.submitKatalogProduk = submitKatalogProduk;
window.updateKatalogProduk = updateKatalogProduk;
window.deleteKatalogProduk = deleteKatalogProduk;
window.reindexKatalogProdukIds = reindexKatalogProdukIds;

window.submitLogPenjualan = submitLogPenjualan;
window.updateLogPenjualan = updateLogPenjualan;
window.deleteLogPenjualan = deleteLogPenjualan;
window.reindexLogPenjualanIds = reindexLogPenjualanIds;