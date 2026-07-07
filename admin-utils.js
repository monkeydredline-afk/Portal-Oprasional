/* ==========================================================================
   Teknisi Portal - admin-utils.js (Modul Administrasi & Perawatan Database)
   ========================================================================== */
import { db, ref, remove, update } from './firebase-config.js';

function isPermitted(val) {
    return val === true || val === 'true';
}

function backupDatabase() {
    const perms = window.currentUser.permissions || {};
    if (!isPermitted(perms.backup_database)) {
        if (window.showToast) window.showToast("Anda tidak memiliki hak akses eksplisit untuk membackup database.", "warning");
        return;
    }

    if (confirm("Apakah Anda yakin ingin mengunduh cadangan lengkap seluruh database Cloud (Format JSON)?")) {
        try {
            const cleanBackup = {};
            Object.keys(window.globalDataCloud).forEach(node => {
                cleanBackup[node] = (window.globalDataCloud[node] || []).map(item => {
                    const cleanItem = { ...item };
                    delete cleanItem._firebaseKey; 
                    return cleanItem;
                });
            });

            const jsonString = JSON.stringify(cleanBackup, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            
            const now = new Date();
            const formattedDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            const fileName = `Backup_Teknisi_Portal_${formattedDate}.json`;

            const link = document.createElement('a');
            link.download = fileName;
            link.href = URL.createObjectURL(blob);
            link.click();

            if (window.logActivity) window.logActivity('Lainnya', 'database', `Melakukan backup data: Mengunduh berkas cadangan database lengkap ${fileName}.`);
            if (window.showToast) window.showToast("Database berhasil dicadangkan!");
        } catch (err) {
            if (window.showToast) window.showToast("Gagal membackup database: " + err.message, "error");
        }
    }
}

function purgeOldLogs() {
    const perms = window.currentUser.permissions || {};
    if (!isPermitted(perms.delete_data)) {
        if (window.showToast) window.showToast("Anda tidak memiliki hak akses untuk menghapus log aktivitas.", "warning");
        return;
    }

    const limitDate = Date.now() - (30 * 24 * 60 * 60 * 1000); 
    const logs = window.globalDataCloud['activity_logs'] || [];
    const oldLogs = logs.filter(log => log.timestamp && log.timestamp < limitDate);

    if (oldLogs.length === 0) {
        if (window.showToast) window.showToast("Tidak ada riwayat aktivitas yang berusia lebih dari 30 hari.", "info");
        return;
    }

    if (confirm(`Apakah Anda yakin ingin menghapus secara permanen ${oldLogs.length} baris log aktivitas yang berusia lebih dari 30 hari?`)) {
        const updates = {};
        oldLogs.forEach(log => {
            updates[`/activity_logs/${log._firebaseKey}`] = null;
        });

        const rootRef = ref(db);
        update(rootRef, updates)
            .then(() => {
                if (window.logActivity) window.logActivity('Hapus', 'activity_logs', `Melakukan pembersihan berkala: Menghapus ${oldLogs.length} baris log aktivitas yang berusia > 30 hari.`);
                if (window.showToast) window.showToast(`Berhasil menghapus ${oldLogs.length} log aktivitas lama.`);
            })
            .catch(err => {
                if (window.showToast) window.showToast("Gagal melakukan pembersihan: " + err.message, "error");
            });
    }
}

function clearCurrentListData() {
    const perms = window.currentUser.permissions || {};
    if (!isPermitted(perms.delete_data)) {
        alert("Anda tidak memiliki hak akses untuk mengosongkan/menghapus data.");
        return;
    }

    const listNames = {
        services: "Log Services",
        penyewaan: "Data Penyewaan",
        cctv: "Proyek CCTV",
        list_laptop: "Master Data List Laptop",
        laptop_display: "List Laptop Display",
        inventaris: "Data Inventaris Alat & Part",
        list_office: "List Akun Office",
        user_management: "User Management",
        activity_logs: "Riwayat Aktivitas"
    };

    const targetName = listNames[window.currentTab];
    const currentDataLength = (window.globalDataCloud[window.currentTab] || []).length;

    if (currentDataLength === 0) {
        alert(`List [ ${targetName} ] saat ini sudah kosong.`);
        return;
    }

    if (confirm(`🚨 PERINGATAN AKSES:\nHapus seluruh data terinput (${currentDataLength} baris) list [ ${targetName} ] secara permanen dari server Cloud?`)) {
        const inputConfirm = prompt(`Ketik kalimat verifikasi ini (Gunakan HURUF BESAR):\n${window.currentTab.toUpperCase()}`);
        if (inputConfirm === window.currentTab.toUpperCase()) {
            if (!db) return;
            const currentItems = window.globalDataCloud[window.currentTab] || [];
            const removePromises = currentItems
                .filter(item => item && item._firebaseKey)
                .map(item => remove(ref(db, `${window.currentTab}/${item._firebaseKey}`)));

            Promise.allSettled(removePromises)
                .then(results => {
                    const failed = results.filter(result => result.status === 'rejected');
                    if (failed.length > 0) {
                        if (window.showToast) window.showToast(`Gagal menghapus ${failed.length} dari ${results.length} item.`, 'warning');
                    } else {
                        if (window.logActivity) window.logActivity('Kosongkan', window.currentTab, `Mengosongkan seluruh baris data pada modul ${targetName}.`);
                        alert(`💥 Sukses dikosongkan.`);
                    }
                })
                .catch((err) => {
                    if (window.showToast) window.showToast("Gagal mengosongkan data: " + err.message, "error");
                });
        }
    }
}

function reindexSequentialIdsForTab(tabName, excludedFirebaseKey = null) {
    const dataList = Array.isArray(window.globalDataCloud[tabName]) ? window.globalDataCloud[tabName] : [];
    if (!dataList.length) return Promise.resolve();

    const remainingItems = dataList.filter(item => item && item._firebaseKey && item._firebaseKey !== excludedFirebaseKey);
    if (remainingItems.length === 0) {
        window.globalDataCloud[tabName] = [];
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
        const itemRef = ref(db, `${tabName}/${item._firebaseKey}`);
        return update(itemRef, { id: newId }).catch(() => null);
    });

    return Promise.allSettled(updatePromises).then((results) => {
        const hasFailures = results.some(result => result.status === 'rejected');
        if (!hasFailures) {
            window.globalDataCloud[tabName] = sortedItems.map((item, index) => ({
                ...item,
                id: index + 1
            }));
        }
        return results;
    });
}

// Ikat ke global window agar HTML & table.js langsung mengenali tombol admin
window.backupDatabase = backupDatabase;
window.purgeOldLogs = purgeOldLogs;
window.clearCurrentListData = clearCurrentListData;
window.reindexSequentialIdsForTab = reindexSequentialIdsForTab;