/* ==========================================================================
   Teknisi Portal - forms.js (Modul Form Handler & ERP Data Writer)
   ========================================================================== */
import { db, ref, set, push, update, registerAuthUser } from './firebase-config.js';
import { formatDateForInput } from './utils.js';

function isPermitted(val) {
    return val === true || val === 'true';
}

// ==========================================================================
// PENGENDALI PENDAFTARAN DATA BARU (FORM UTAMA)
// ==========================================================================
function handleSubmit(e) {
    e.preventDefault();
    if (!db) return;

    const formData = new FormData(e.target);
    const currentData = window.globalDataCloud[window.currentTab] || [];
    
    const d = new Date();
    const tanggalHariIni = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const btnSubmit = e.target.querySelector('button[type="submit"]');
    let originalText = '';
    if (btnSubmit) {
        originalText = btnSubmit.innerHTML;
        btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> Menyinkronkan...`;
        btnSubmit.disabled = true;
    }

    // --- DELEGASI KHUSUS UNTUK FORM MASTER JASA BARU ---
    if (window.currentTab === 'master_jasa') {
        if (window.submitMasterJasa) {
            window.submitMasterJasa(formData, btnSubmit, originalText, e.target);
        } else {
            alert("Gagal memproses: Modul Master Jasa belum sepenuhnya siap.");
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        }
        return;
    }

    // --- DELEGASI KHUSUS UNTUK FORM KATALOG PRODUK BARU ---
    if (window.currentTab === 'katalog_produk') {
        if (window.submitKatalogProduk) {
            window.submitKatalogProduk(formData, btnSubmit, originalText, e.target);
        } else {
            alert("Gagal memproses: Modul Katalog Produk belum sepenuhnya siap.");
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        }
        return;
    }

    // --- DELEGASI KHUSUS UNTUK FORM LOG PENJUALAN BARU ---
    if (window.currentTab === 'log_penjualan') {
        if (window.submitLogPenjualan) {
            window.submitLogPenjualan(formData, btnSubmit, originalText, e.target, window.selectedPenjualanItems || []);
        } else {
            alert("Gagal memproses: Modul Log Penjualan belum sepenuhnya siap.");
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        }
        return;
    }

    if (window.currentTab === 'penyewaan') {
        const tglMulai = new Date(formData.get('tgl_mulai'));
        const tglSelesai = new Date(formData.get('tgl_selesai'));
        if (tglSelesai < tglMulai) {
            alert("Galat: Tanggal selesai sewa tidak boleh lebih awal daripada tanggal mulai!");
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
            return;
        }
    }

    if (window.currentTab === 'user_management') {
        const name = formData.get('name');
        const email = formData.get('email');
        const password = formData.get('password');
        const branch = formData.get('branch');
        const selectedRole = formData.get('role') || 'Teknisi';

        if (password.length < 6) {
            alert("Gagal: Password akun minimal harus terdiri dari 6 karakter!");
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
            return;
        }

        registerAuthUser(email, password)
            .then((uid) => {
                const permissions = {
                    dashboard: formData.get('perm_dashboard') === 'true',
                    services: formData.get('perm_services') === 'true',
                    penyewaan: formData.get('perm_penyewaan') === 'true',
                    cctv: formData.get('perm_cctv') === 'true',
                    list_laptop: formData.get('perm_list_laptop') === 'true',
                    laptop_display: formData.get('perm_laptop_display') === 'true',
                    inventaris: formData.get('perm_inventaris') === 'true', 
                    master_jasa: formData.get('perm_master_jasa') === 'true',
                    katalog_produk: formData.get('perm_katalog_produk') === 'true', // Menyimpan hak akses Katalog Produk
                    log_penjualan: formData.get('perm_log_penjualan') === 'true',   // Menyimpan hak akses Log Penjualan
                    list_office: formData.get('perm_list_office') === 'true',
                    user_management: formData.get('perm_user_management') === 'true',
                    activity_logs: formData.get('perm_activity_logs') === 'true',
                    backup_database: formData.get('perm_backup_database') === 'true', 
                    export_excel: formData.get('perm_export_excel') === 'true',
                    import_excel: formData.get('perm_import_excel') === 'true',
                    edit_data: formData.get('perm_edit_data') === 'true',
                    delete_data: formData.get('perm_delete_data') === 'true',
                    cetak_nota: formData.get('perm_cetak_nota') === 'true'
                };

                const nextId = currentData.length === 0 ? 1 : Math.max(...currentData.map(d => Number(d.id) || 0)) + 1;
                
                const newUserProfile = {
                    id: nextId,
                    uid: uid,
                    name: name,
                    email: email,
                    password: password,
                    role: selectedRole,
                    branch: branch,
                    permissions: permissions
                };

                const userRef = ref(db, `user_management/${uid}`);
                return set(userRef, newUserProfile);
            })
            .then(() => {
                if (window.logActivity) window.logActivity('Tambah', 'user_management', `Mendaftarkan user baru dengan Nama: ${name} (Email: ${email}) posisi: ${selectedRole}.`);
                if (window.showToast) window.showToast("Akun Pengguna & Hak Akses berhasil didaftarkan secara online!");
                e.target.reset();
            })
            .catch((err) => {
                if (window.showToast) window.showToast("Gagal mendaftarkan akun: " + err.message, "error");
            })
            .finally(() => {
                if (btnSubmit) {
                    btnSubmit.innerHTML = originalText;
                    btnSubmit.disabled = false;
                }
            });
        
        return; 
    }

    const nextId = currentData.length === 0 ? 1 : Math.max(...currentData.map(d => Number(d.id) || 0)) + 1;
    const newDataItem = { id: nextId };

    const submittedCabang = formData.get('cabang');
    newDataItem.cabang = submittedCabang || window.currentUser.branch || 'Head Office';

    let inputTgl = formData.get('tanggal');
    if (!inputTgl) {
        inputTgl = tanggalHariIni;
    } else if (inputTgl.includes('-')) {
        const parts = inputTgl.split('-');
        inputTgl = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    newDataItem.tanggal = inputTgl;

    let laptopKeysToUpdate = [];
    let logDetail = '';

    if (window.currentTab === 'penyewaan') {
        if (window.selectedLaptopKeys.length === 0) {
            alert("Silakan pilih minimal 1 laptop!");
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
            return;
        }

        let listUnitSewa = [];
        const masterLaptop = window.globalDataCloud['list_laptop'] || [];
        
        window.selectedLaptopKeys.forEach(key => {
            const targetLap = masterLaptop.find(l => l._firebaseKey === key);
            if (targetLap) {
                listUnitSewa.push(`• ${targetLap.merk} ${targetLap.tipe} [SN: ${targetLap.sn || 'Tanpa SN'}]`);
                laptopKeysToUpdate.push(key);
            }
        });

        newDataItem.penyewa = formData.get('penyewa');
        newDataItem.no_wa = formData.get('no_wa');
        newDataItem.tgl_mulai = formData.get('tgl_mulai');
        newDataItem.tgl_selesai = formData.get('tgl_selesai');
        
        newDataItem.total_biaya = String(formData.get('total_biaya') || '').replace(/\D/g, '');
        
        newDataItem.status = formData.get('status');
        newDataItem.unit = listUnitSewa.join(', ');
        newDataItem._linkedLaptopKeys = laptopKeysToUpdate;
        logDetail = `Penyewa: ${newDataItem.penyewa} dengan unit sewa: ${newDataItem.unit} di cabang ${newDataItem.cabang}`;
    } else if (window.currentTab === 'list_laptop') {
        const proc = formData.get('spec_proc');
        const ram = formData.get('spec_ram');
        const storage = formData.get('spec_storage');
        const vga = formData.get('spec_vga');
        const screen = formData.get('spec_screen');

        newDataItem.merk = formData.get('merk');
        newDataItem.tipe = formData.get('tipe');
        newDataItem.sn = formData.get('sn');
        newDataItem.kode_toko = formData.get('kode_toko');
        newDataItem.status = formData.get('status');
        newDataItem.catatan = formData.get('catatan') || '';
        newDataItem.spek = `CPU: ${proc}\nRAM: ${ram}\nSSD/HDD: ${storage}\nVGA/Layar: ${vga} (${screen})`;
        logDetail = `${newDataItem.merk} ${newDataItem.tipe} (SN: ${newDataItem.sn}) di cabang ${newDataItem.cabang}`;
    } else if (window.currentTab === 'laptop_display') {
        const proc = formData.get('spec_proc');
        const ram = formData.get('spec_ram');
        const storage = formData.get('spec_storage');
        const vga = formData.get('spec_vga');
        const screen = formData.get('spec_screen');

        newDataItem.teknisi = formData.get('teknisi');
        newDataItem.merk = formData.get('merk');
        newDataItem.tipe = formData.get('tipe');
        newDataItem.sn = formData.get('sn');
        
        newDataItem.harga_jual = String(formData.get('harga_jual') || '').replace(/\D/g, '');
        
        newDataItem.status = formData.get('status');
        newDataItem.catatan = formData.get('catatan') || '';
        newDataItem.spek_singkat = `CPU: ${proc}\nRAM: ${ram}\nSSD/HDD: ${storage}\nVGA/Layar: ${vga} (${screen})`;
        logDetail = `${newDataItem.merk} ${newDataItem.tipe} (SN: ${newDataItem.sn}) di etalase cabang ${newDataItem.cabang}`;
    } else if (window.currentTab === 'inventaris') { 
        newDataItem.nama_barang = formData.get('nama_barang');
        newDataItem.kategori = formData.get('kategori');
        newDataItem.stok = Number(formData.get('stok')) || 0;
        newDataItem.satuan = formData.get('satuan');
        newDataItem.lokasi_rak = formData.get('lokasi_rak') || '';
        newDataItem.kondisi = formData.get('kondisi');
        newDataItem.catatan = formData.get('catatan') || '';
        newDataItem.kode_barang = window.generateInventarisSku ? window.generateInventarisSku(newDataItem.kategori, inputTgl) : 'SKU-ERR';
        logDetail = `Barang: ${newDataItem.nama_barang} (Stok: ${newDataItem.stok} ${newDataItem.satuan}) di Rak ${newDataItem.lokasi_rak} cabang ${newDataItem.cabang}`;
    } else if (window.currentTab === 'services') {
        const activeName = window.currentUser.name || window.currentUser.email.split('@')[0];
        
        let roleDisplay = 'Sales Counter';
        if (window.currentUser.role === 'admin') {
            roleDisplay = 'Admin';
        } else if (window.currentUser.role === 'teknisi') {
            roleDisplay = 'Teknisi';
        } else if (window.currentUser.role) {
            roleDisplay = window.currentUser.role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }
        
        const rawKeluhan = formData.get('kerusakan') || '';

        // Pembuatan No. Referensi Permanen Otomatis
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const paddedId = String(nextId).padStart(5, '0');
        newDataItem.no_ref = `SRV/${year}/${month}/${paddedId}`;

        newDataItem.pelanggan = formData.get('pelanggan');
        newDataItem.no_wa = formData.get('no_wa');
        newDataItem.perangkat = formData.get('perangkat');
        
        // Penerimaan awal bernilai Rp 0 secara bawaan
        newDataItem.biaya = "0";
        
        newDataItem.status = formData.get('status');
        newDataItem.teknisi = 'Belum Ditentukan';
        newDataItem.tindakan_teknisi = '';
        newDataItem.tgl_selesai = ''; 
        newDataItem.items_terpakai = [];
        
        newDataItem.kerusakan = `Penerima: ${activeName} (${roleDisplay})\n${rawKeluhan}`;
        logDetail = `Pelanggan: ${newDataItem.pelanggan} - Unit: ${newDataItem.perangkat} - Ref: ${newDataItem.no_ref} cabang ${newDataItem.cabang}`;
    } else if (window.currentTab === 'cctv') {
        newDataItem.klien = formData.get('klien');
        newDataItem.lokasi = formData.get('lokasi'); 
        newDataItem.jumlah_cctv = formData.get('jumlah_cctv');
        newDataItem.progres = formData.get('progres');
        newDataItem.status = formData.get('status');
        logDetail = `Klien: ${newDataItem.klien} - Lokasi: ${newDataItem.lokasi} (${newDataItem.jumlah_cctv} Kamera) cabang ${newDataItem.cabang}`;
    } else if (window.currentTab === 'list_office') {
        newDataItem.nama_user = formData.get('nama_user');
        newDataItem.akun = formData.get('akun');
        newDataItem.password = formData.get('password');
        newDataItem.pemulihan = formData.get('pemulihan');
        newDataItem.tipe_akun = formData.get('tipe_akun') || 'Anggota'; 
        newDataItem.office = formData.get('office');
        newDataItem.server_utama = formData.get('server_utama') || '';
        newDataItem.name = formData.get('name');
        newDataItem.workspace_expired = formData.get('masa_aktif');
        newDataItem.status = formData.get('status');
        logDetail = `User: ${newDataItem.nama_user} - Akun Office: ${newDataItem.akun} cabang ${newDataItem.cabang}`;
    }

    const targetRef = ref(db, window.currentTab);
    const newPostRef = push(targetRef);
    
    set(newPostRef, newDataItem)
        .then(() => {
            if (window.currentTab === 'inventaris') {
                if (window.refreshInventarisFieldOptions) window.refreshInventarisFieldOptions();
            }

            if (window.currentTab === 'penyewaan' && laptopKeysToUpdate.length > 0 && newDataItem.status !== 'Lunas') {
                laptopKeysToUpdate.forEach(laptopKey => {
                    const laptopStatusRef = ref(db, `list_laptop/${laptopKey}`);
                    update(laptopStatusRef, { status: "Disewa" });
                });
            }
            if (window.logActivity) window.logActivity('Tambah', window.currentTab, `Menambahkan data baru pada modul ${window.currentTab}: ${logDetail}.`);
            if (window.showToast) window.showToast("Data berhasil disimpan secara real-time!");
            e.target.reset();

            const dateInput = document.querySelector('#form-fields input[name="tanggal"]');
            if (dateInput) {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                dateInput.value = `${yyyy}-${mm}-${dd}`;
            }
            window.selectedLaptopKeys = []; 
            if(window.currentTab === 'penyewaan' && window.populateLaptopCheckboxes) window.populateLaptopCheckboxes();
        })
        .catch((error) => {
            if (window.showToast) window.showToast("Gagal menyimpan data: " + error.message, "error");
        })
        .finally(() => {
            if (btnSubmit) {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
}

// ==========================================================================
// PENGENDALI SIMPAN EDIT / UPDATE DATA ONLINE REAL-TIME
// ==========================================================================
function handleUpdateSubmit(e) {
    e.preventDefault();
    const firebaseKey = document.getElementById('edit-firebase-key').value;
    if(!firebaseKey || !db) return;

    let updatedData = {};
    let itemDescription = '';

    const btnUpdate = e.target.querySelector('button[type="submit"]');
    let originalText = '';
    if (btnUpdate) {
        originalText = btnUpdate.innerHTML;
        btnUpdate.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> Memperbarui...`;
        btnUpdate.disabled = true;
    }

    const currentDataList = window.globalDataCloud[window.currentTab] || [];
    const targetItem = currentDataList.find(item => item._firebaseKey === firebaseKey);

    // --- DELEGASI UPDATE KHUSUS MASTER JASA ---
    if (window.currentTab === 'master_jasa') {
        if (window.updateMasterJasa) {
            const compiledJasaData = {
                nama_jasa: document.getElementById('edit-nama_jasa').value,
                biaya_jasa: String(document.getElementById('edit-biaya_jasa').value || '').replace(/\D/g, '')
            };
            window.updateMasterJasa(firebaseKey, compiledJasaData, targetItem, btnUpdate, originalText);
        } else {
            alert("Sistem modul Master Jasa belum siap.");
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
        }
        return;
    }

    // --- DELEGASI UPDATE KHUSUS KATALOG PRODUK ---
    if (window.currentTab === 'katalog_produk') {
        if (window.updateKatalogProduk) {
            const compiledKatalogData = {
                nama_barang: document.getElementById('edit-nama_barang').value,
                kategori: document.getElementById('edit-kategori').value,
                stok: Number(document.getElementById('edit-stok').value) || 0,
                satuan: document.getElementById('edit-satuan').value,
                harga_modal: String(document.getElementById('edit-harga_modal').value || '').replace(/\D/g, ''),
                harga_jual: String(document.getElementById('edit-harga_jual').value || '').replace(/\D/g, ''),
                catatan: document.getElementById('edit-catatan').value,
                cabang: document.getElementById('edit-cabang')?.value || targetItem.cabang || 'Head Office',
                tanggal: targetItem.tanggal || ''
            };
            window.updateKatalogProduk(firebaseKey, compiledKatalogData, targetItem, btnUpdate, originalText);
        } else {
            alert("Sistem modul Katalog Produk belum siap.");
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
        }
        return;
    }

    // --- DELEGASI UPDATE KHUSUS LOG PENJUALAN ---
    if (window.currentTab === 'log_penjualan') {
        if (window.updateLogPenjualan) {
            let totalBayar = 0;
            const itemsTerjual = (window.editSelectedPenjualanItems || []).map(it => {
                totalBayar += Number(it.subtotal) || 0;
                return {
                    _productKey: it._productKey || it.productKey,
                    name: it.name,
                    qty: Number(it.qty) || 1,
                    price: Number(it.price) || 0,
                    subtotal: Number(it.subtotal) || 0
                };
            });
            const compiledPenjualanData = {
                nama_pembeli: document.getElementById('edit-nama_pembeli').value,
                no_wa: document.getElementById('edit-no_wa').value,
                cabang: document.getElementById('edit-cabang')?.value || targetItem.cabang || 'Head Office',
                tanggal: targetItem.tanggal || '',
                no_ref: targetItem.no_ref || '',
                total_bayar: totalBayar,
                items_terjual: itemsTerjual
            };
            window.updateLogPenjualan(firebaseKey, compiledPenjualanData, targetItem, btnUpdate, originalText);
        } else {
            alert("Sistem modul Log Penjualan belum siap.");
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
        }
        return;
    }

    if (window.currentTab === 'services') {
        updatedData.pelanggan = document.getElementById('edit-pelanggan').value;
        updatedData.no_wa = document.getElementById('edit-no_wa').value;
        updatedData.perangkat = document.getElementById('edit-perangkat').value;
        
        // Biaya Log Services dikunci dan diisi oleh total kalkulasi Bahan & Jasa yang tersimpan
        updatedData.biaya = targetItem?.biaya || "0";
        updatedData.items_terpakai = targetItem?.items_terpakai || [];
        
        const oldStatus = targetItem?.status || '';
        const newStatus = document.getElementById('edit-status').value;
        
        // PEMBAHARUAN PILAR 3: Sinkronisasi pemulihan stok jika status diubah menjadi Cancel
        if (newStatus === 'Cancel' && oldStatus !== 'Cancel') {
            if (window.syncServiceMaterialStock) {
                window.syncServiceMaterialStock(targetItem.items_terpakai || [], [], true);
            }
        } else if (newStatus !== 'Cancel' && oldStatus === 'Cancel') {
            // Potong kembali stok jika servisan diaktifkan lagi dari status Cancel
            if (window.syncServiceMaterialStock) {
                window.syncServiceMaterialStock([], targetItem.items_terpakai || [], false);
            }
        }

        updatedData.status = newStatus;
        updatedData.kerusakan = document.getElementById('edit-kerusakan').value;
        updatedData.teknisi = document.getElementById('edit-teknisi').value;
        updatedData.tindakan_teknisi = document.getElementById('edit-tindakan_teknisi').value || '';
        updatedData.cabang = document.getElementById('edit-cabang')?.value || targetItem?.cabang || window.currentUser.branch || 'Head Office'; 

        updatedData.no_ref = targetItem?.no_ref || `SRV/Legacy/#${targetItem?.id}`;
        updatedData.tgl_selesai = document.getElementById('edit-tgl-selesai')?.value || '';

        itemDescription = `${updatedData.pelanggan} (${updatedData.perangkat}) - Teknisi: ${updatedData.teknisi}`;
    } else if (window.currentTab === 'cctv') {
        updatedData.klien = document.getElementById('edit-klien').value;
        updatedData.lokasi = document.getElementById('edit-lokasi').value;
        updatedData.jumlah_cctv = document.getElementById('edit-jumlah_cctv').value;
        updatedData.progres = document.getElementById('edit-progres').value;
        updatedData.status = document.getElementById('edit-status').value;
        updatedData.cabang = document.getElementById('edit-cabang')?.value || targetItem?.cabang || window.currentUser.branch || 'Head Office'; 
        itemDescription = `${updatedData.klien} - ${updatedData.lokasi}`;
    } else if (window.currentTab === 'list_laptop') {
        let editTgl = document.getElementById('edit-tanggal').value;
        if (editTgl && editTgl.includes('-')) {
            const parts = editTgl.split('-');
            updatedData.tanggal = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        updatedData.cabang = document.getElementById('edit-cabang').value;
        updatedData.kode_toko = document.getElementById('edit-kode_toko').value;
        updatedData.merk = document.getElementById('edit-merk').value;
        updatedData.tipe = document.getElementById('edit-tipe').value;
        updatedData.sn = document.getElementById('edit-sn').value;
        updatedData.spek = document.getElementById('edit-spek').value;
        updatedData.status = document.getElementById('edit-status').value;
        updatedData.catatan = document.getElementById('edit-catatan').value;
        itemDescription = `${updatedData.merk} ${updatedData.tipe} (SN: ${updatedData.sn})`;
    } else if (window.currentTab === 'laptop_display') { 
        let editTgl = document.getElementById('edit-tanggal').value;
        if (editTgl && editTgl.includes('-')) {
            const parts = editTgl.split('-');
            updatedData.tanggal = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }

        updatedData.cabang = document.getElementById('edit-cabang').value;
        updatedData.teknisi = document.getElementById('edit-teknisi').value;
        updatedData.merk = document.getElementById('edit-merk').value;
        updatedData.tipe = document.getElementById('edit-tipe').value;
        updatedData.sn = document.getElementById('edit-sn').value;
        
        updatedData.harga_jual = String(document.getElementById('edit-harga_jual').value || '').replace(/\D/g, '');
        
        updatedData.spek_singkat = document.getElementById('edit-spek_singkat').value;
        updatedData.status = document.getElementById('edit-status').value;
        updatedData.catatan = document.getElementById('edit-catatan').value;
        itemDescription = `${updatedData.merk} ${updatedData.tipe} (SN: ${updatedData.sn})`;
    } else if (window.currentTab === 'inventaris') {
        let editTgl = document.getElementById('edit-tanggal').value;
        if (editTgl && editTgl.includes('-')) {
            const parts = editTgl.split('-');
            updatedData.tanggal = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        updatedData.cabang = document.getElementById('edit-cabang').value;
        updatedData.nama_barang = document.getElementById('edit-nama_barang').value;
        updatedData.kategori = document.getElementById('edit-kategori').value;
        updatedData.stok = Number(document.getElementById('edit-stok').value) || 0;
        updatedData.satuan = document.getElementById('edit-satuan').value;
        updatedData.lokasi_rak = document.getElementById('edit-lokasi_rak').value || '';
        updatedData.kondisi = document.getElementById('edit-kondisi').value;
        updatedData.catatan = document.getElementById('edit-catatan').value;
        updatedData.kode_barang = targetItem?.kode_barang || (window.generateInventarisSku ? window.generateInventarisSku(updatedData.kategori, editTgl) : 'SKU-ERR');
        itemDescription = `Barang: ${updatedData.nama_barang} (Stok: ${updatedData.stok} ${updatedData.satuan})`;
    } else if (window.currentTab === 'penyewaan') {
        const tglMulaiVal = document.getElementById('edit-tgl_mulai').value;
        const tglSelesaiVal = document.getElementById('edit-tgl_selesai').value;
        if (new Date(tglSelesaiVal) < new Date(tglMulaiVal)) {
            alert("Galat: Tanggal selesai sewa tidak boleh lebih awal daripada tanggal mulai!");
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
            return;
        }

        const newStatus = document.getElementById('edit-status').value;
        updatedData.penyewa = document.getElementById('edit-penyewa').value;
        updatedData.no_wa = document.getElementById('edit-no_wa').value;
        updatedData.tgl_mulai = tglMulaiVal;
        updatedData.tgl_selesai = tglSelesaiVal;
        
        updatedData.total_biaya = String(document.getElementById('edit-total_biaya').value || '').replace(/\D/g, '');
        
        updatedData.status = newStatus;
        updatedData.cabang = document.getElementById('edit-cabang')?.value || targetItem?.cabang || window.currentUser.branch || 'Head Office'; 

        if (!window.editSelectedLaptopKeys || window.editSelectedLaptopKeys.length === 0) {
            alert("Silakan centang minimal 1 unit laptop!");
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
            return;
        }

        const masterLaptop = window.globalDataCloud['list_laptop'] || [];
        let listUnitSewa = [];
        window.editSelectedLaptopKeys.forEach(key => {
            const targetLap = masterLaptop.find(l => l._firebaseKey === key);
            if (targetLap) {
                listUnitSewa.push(`• ${targetLap.merk} ${targetLap.tipe} [SN: ${targetLap.sn || 'Tanpa SN'}]`);
            }
        });
        updatedData.unit = listUnitSewa.join(', ');
        updatedData._linkedLaptopKeys = window.editSelectedLaptopKeys;
        itemDescription = `Penyewa: ${updatedData.penyewa} (${updatedData.unit})`;

        const sewaItem = (window.globalDataCloud['penyewaan'] || []).find(item => item._firebaseKey === firebaseKey);
        const oldKeys = sewaItem && sewaItem._linkedLaptopKeys ? sewaItem._linkedLaptopKeys : [];
        const newKeys = window.editSelectedLaptopKeys;

        if (newStatus === 'Lunas' || newStatus === 'Selesai') {
            const allKeys = new Set([...oldKeys, ...newKeys]);
            allKeys.forEach(key => {
                const laptopStatusRef = ref(db, `list_laptop/${key}`);
                update(laptopStatusRef, { status: "Tersedia" });
            });
        } else {
            oldKeys.forEach(key => {
                if (!newKeys.includes(key)) {
                    const laptopStatusRef = ref(db, `list_laptop/${key}`);
                    update(laptopStatusRef, { status: "Tersedia" });
                }
            });
            
            newKeys.forEach(key => {
                if (!oldKeys.includes(key)) {
                    const laptopStatusRef = ref(db, `list_laptop/${key}`);
                    update(laptopStatusRef, { status: "Disewa" });
                }
            });
        }
    } else if (window.currentTab === 'list_office') {
        let editTgl = document.getElementById('edit-tanggal').value;
        if (editTgl && editTgl.includes('-')) {
            const parts = editTgl.split('-');
            updatedData.tanggal = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        updatedData.nama_user = document.getElementById('edit-nama_user').value;
        updatedData.akun = document.getElementById('edit-akun').value;
        updatedData.password = document.getElementById('edit-password').value;
        updatedData.pemulihan = document.getElementById('edit-pemulihan').value;
        updatedData.tipe_akun = document.getElementById('edit-tipe_akun').value; 
        const editOfficeEl = document.getElementById('edit-office-select');
        updatedData.office = editOfficeEl ? editOfficeEl.value : '';
        const editServerEl = document.getElementById('edit-server_utama');
        updatedData.server_utama = editServerEl ? (editServerEl.value || '') : '';
        updatedData.name = document.getElementById('edit-name').value;
        updatedData.workspace_expired = document.getElementById('edit-masa_aktif').value;
        updatedData.status = document.getElementById('edit-status').value;
        updatedData.cabang = targetItem?.cabang || window.currentUser.branch || 'Head Office'; 
        itemDescription = `User: ${updatedData.nama_user} - Akun: ${updatedData.akun}`;
    } else if (window.currentTab === 'user_management') {
        updatedData.name = document.getElementById('edit-name-user')?.value || '';
        updatedData.email = document.getElementById('edit-email-user')?.value || '';
        updatedData.branch = document.getElementById('edit-branch-user')?.value || 'Head Office';
        updatedData.role = document.getElementById('edit-role-user')?.value || 'Teknisi';
        updatedData.permissions = {
            dashboard: document.getElementById('edit-perm-dashboard')?.checked || false,
            services: document.getElementById('edit-perm-services')?.checked || false,
            penyewaan: document.getElementById('edit-perm-penyewaan')?.checked || false,
            cctv: document.getElementById('edit-perm-cctv')?.checked || false,
            list_laptop: document.getElementById('edit-perm-list_laptop')?.checked || false,
            laptop_display: document.getElementById('edit-perm-laptop_display')?.checked || false,
            inventaris: document.getElementById('edit-perm-inventaris')?.checked || false, 
            master_jasa: document.getElementById('edit-perm-master_jasa')?.checked || false,
            katalog_produk: document.getElementById('edit-perm-katalog_produk')?.checked || false, // Membaca pembaruan izin Katalog Produk
            log_penjualan: document.getElementById('edit-perm-log_penjualan')?.checked || false,   // Membaca pembaruan izin Log Penjualan
            list_office: document.getElementById('edit-perm-list_office')?.checked || false,
            user_management: document.getElementById('edit-perm-user_management')?.checked || false,
            activity_logs: document.getElementById('edit-perm-activity_logs')?.checked || false,
            backup_database: document.getElementById('edit-perm-backup')?.checked || false, 
            export_excel: document.getElementById('edit-perm-export')?.checked || false,
            import_excel: document.getElementById('edit-perm-import')?.checked || false,
            edit_data: document.getElementById('edit-perm-edit')?.checked || false,
            delete_data: document.getElementById('edit-perm-delete')?.checked || false,
            cetak_nota: document.getElementById('edit-perm-cetak')?.checked || false
        };

        const newPass = document.getElementById('edit-password-user')?.value;
        if (newPass && newPass.trim().length >= 6) {
            updatedData.password = newPass.trim();
        } else {
            updatedData.password = targetItem.password || '';
        }
        itemDescription = `User: ${updatedData.name} (${updatedData.email}) - Posisi: ${updatedData.role}`;
    }

    const targetRef = ref(db, `${window.currentTab}/${firebaseKey}`);
    update(targetRef, updatedData)
        .then(() => {
            if (window.logActivity) window.logActivity('Ubah', window.currentTab, `Mengubah data pada ID: ${targetItem.id || '-'} (${itemDescription}).`);
            if (window.showToast) window.showToast("Data berhasil diperbarui secara real-time!");
            if (window.closeEditModal) window.closeEditModal();
        })
        .catch(err => {
            alert("Gagal memperbarui data: " + err.message);
        })
        .finally(() => {
            if (btnUpdate) {
                btnUpdate.innerHTML = originalText;
                btnUpdate.disabled = false;
            }
        });
}

// Bind ke global window agar dapat dipanggil dari berkas lainnya
window.handleSubmit = handleSubmit;
window.handleUpdateSubmit = handleUpdateSubmit;