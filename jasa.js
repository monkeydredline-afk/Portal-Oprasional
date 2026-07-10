/* ==========================================================================
   Teknisi Portal - jasa.js (Modul Hub Data & Perawatan Master Jasa)
   ========================================================================== */
import { db, ref, set, push, update, remove } from './firebase-config.js';

// --- FUNGSI RE-INDEXING URUTAN ID MASTER JASA ---
function reindexMasterJasaIds(excludedFirebaseKey = null) {
    const dataList = Array.isArray(window.globalDataCloud.master_jasa) ? window.globalDataCloud.master_jasa : [];
    if (!dataList.length) return Promise.resolve();

    const remainingItems = dataList.filter(item => item && item._firebaseKey && item._firebaseKey !== excludedFirebaseKey);
    if (remainingItems.length === 0) {
        window.globalDataCloud.master_jasa = [];
        return Promise.resolve();
    }

    const sortedItems = [...remainingItems].sort((a, b) => {
        const idA = Number(a?.id) || 0;
        const idB = Number(b?.id) || 0;
        return idA - idB;
    });

    const updatePromises = sortedItems.map((item, index) => {
        const newId = index + 1;
        if (Number(item.id) === newId) return Promise.resolve();
        const itemRef = ref(db, `master_jasa/${item._firebaseKey}`);
        return update(itemRef, { id: newId }).catch(() => null);
    });

    return Promise.allSettled(updatePromises).then((results) => {
        const hasFailures = results.some(result => result.status === 'rejected');
        if (!hasFailures) {
            window.globalDataCloud.master_jasa = sortedItems.map((item, index) => ({
                ...item,
                id: index + 1
            }));
        }
        return results;
    });
}

// --- FUNGSI SUBMIT FORM MASTER JASA BARU ---
function submitMasterJasa(formData, btnSubmit, originalText, formElement) {
    const currentData = window.globalDataCloud.master_jasa || [];
    const namaJasa = formData.get('nama_jasa');
    const biayaJasa = String(formData.get('biaya_jasa') || '').replace(/\D/g, '');

    const nextId = currentData.length === 0 ? 1 : Math.max(...currentData.map(d => Number(d.id) || 0)) + 1;

    const newJasaItem = {
        id: nextId,
        nama_jasa: namaJasa,
        biaya_jasa: biayaJasa
    };

    const targetRef = ref(db, 'master_jasa');
    const newPostRef = push(targetRef);

    set(newPostRef, newJasaItem)
        .then(() => {
            if (window.logActivity) window.logActivity('Tambah', 'master_jasa', `Menambahkan tindakan jasa baru: ${namaJasa} (Biaya: Rp ${Number(biayaJasa).toLocaleString('id-ID')}).`);
            if (window.showToast) window.showToast("Data jasa berhasil didaftarkan secara online!");
            formElement.reset();
        })
        .catch((error) => {
            if (window.showToast) window.showToast("Gagal menyimpan data jasa: " + error.message, "error");
        })
        .finally(() => {
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
}

// --- FUNGSI UPDATE DATA MASTER JASA ---
function updateMasterJasa(firebaseKey, updatedData, targetItem, btnUpdate, originalText) {
    const targetRef = ref(db, `master_jasa/${firebaseKey}`);
    
    update(targetRef, updatedData)
        .then(() => {
            if (window.logActivity) window.logActivity('Ubah', 'master_jasa', `Mengubah data Jasa ID: ${targetItem.id || '-'} (Menjadi: ${updatedData.nama_jasa} - Rp ${Number(updatedData.biaya_jasa).toLocaleString('id-ID')}).`);
            if (window.showToast) window.showToast("Data jasa berhasil diperbarui secara real-time!");
            if (window.closeEditModal) window.closeEditModal();
        })
        .catch(err => {
            alert("Gagal memperbarui data jasa: " + err.message);
        })
        .finally(() => {
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
        });
}

// --- FUNGSI HAPUS DATA MASTER JASA ---
function deleteMasterJasa(firebaseKey, targetItem) {
    if (confirm(`Apakah Anda yakin ingin menghapus tindakan jasa [ ${targetItem.nama_jasa} ] secara permanen?`)) {
        const targetRowRef = ref(db, `master_jasa/${firebaseKey}`);
        
        remove(targetRowRef)
            .then(() => {
                return reindexMasterJasaIds(firebaseKey);
            })
            .then(() => {
                if (window.logActivity) window.logActivity('Hapus', 'master_jasa', `Menghapus tindakan jasa ID #${targetItem.id} (${targetItem.nama_jasa}) dari database.`);
                if (window.showToast) window.showToast("Data jasa berhasil dihapus.");
            })
            .catch((error) => {
                console.warn('Gagal menata ulang ID master jasa:', error);
                if (window.showToast) window.showToast('Data terhapus, tetapi penyusunan ulang ID gagal.', 'warning');
            });
    }
}

// Ikat ke global window agar dapat diakses oleh modul form & tabel
window.submitMasterJasa = submitMasterJasa;
window.updateMasterJasa = updateMasterJasa;
window.deleteMasterJasa = deleteMasterJasa;
window.reindexMasterJasaIds = reindexMasterJasaIds;