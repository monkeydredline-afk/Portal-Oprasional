/* ==========================================================================
   Teknisi Portal - templates.js (Template Input Form & Struktur Tabel)
   ========================================================================== */

export const fieldsTemplate = {
    services: `
        <div id="cabang-input-container">
            <label class="block text-sm font-medium text-gray-700 mb-1">Cabang Toko</label>
            <select name="cabang" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Monumen Emmy Saelan">Monumen Emmy Saelan</option>
                <option value="Perintis">Perintis</option>
                <option value="Head Office">Head Office</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nama Pelanggan</label>
            <input type="text" name="pelanggan" list="list-pelanggan" autocomplete="off" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">No. WhatsApp Pelanggan</label>
            <input type="tel" name="no_wa" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')" placeholder="Contoh: 08123456789" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Perangkat (Laptop/PC/dll)</label>
            <input type="text" name="perangkat" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Estimasi Biaya (Rp)</label>
            <input type="text" name="biaya" oninput="this.value = window.formatCurrencyInput(this.value)" placeholder="Contoh: 90.000" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Gejala / Kerusakan & Kelengkapan</label>
            <textarea name="kerusakan" rows="4" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">Detail Unit: &#10;kelengkapan: &#10;keluhan: </textarea>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select name="status" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Antrean">Antrean</option>
                <option value="Proses">Proses Pengecekan</option>
                <option value="Selesai">Selesai</option>
                <option value="Cancel">Cancel</option>
            </select>
        </div>
    `,
    penyewaan: `
        <div id="cabang-input-container">
            <label class="block text-sm font-medium text-gray-700 mb-1">Cabang Toko</label>
            <select name="cabang" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Monumen Emmy Saelan">Monumen Emmy Saelan</option>
                <option value="Perintis">Perintis</option>
                <option value="Head Office">Head Office</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nama Penyewa</label>
            <input type="text" name="penyewa" list="list-penyewa" autocomplete="off" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">No. WhatsApp Penyewa</label>
            <input type="tel" name="no_wa" pattern="[0-9]*" oninput="this.value = this.value.replace(/[^0-9]/g, '')" placeholder="Contoh: 08123456789" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div class="grid grid-cols-2 gap-2">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Tgl Mulai Sewa</label>
                <input type="date" name="tgl_mulai" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Tgl Selesai Sewa</label>
                <input type="date" name="tgl_selesai" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
            </div>
        </div>
        <div class="md:col-span-2 space-y-1.5">
            <label class="block text-sm font-medium text-gray-700">Pilih Unit Laptop yang Tersedia (Bisa Centang Banyak)</label>
            <div class="relative">
                <i class="fa-solid fa-magnifying-glass absolute left-3 top-3 text-gray-400 text-xs"></i>
                <input type="text" id="search-form-laptop" oninput="populateLaptopCheckboxes()" placeholder="Ketik Merk, Tipe, SN, atau Kode Toko..." class="w-full pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none bg-slate-50">
            </div>
            <div id="checkbox-laptop-container" class="border border-gray-300 rounded-xl p-3 max-h-52 overflow-y-auto bg-white space-y-2"></div>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Total Biaya Sewa (Rp)</label>
            <input type="text" name="total_biaya" oninput="this.value = window.formatCurrencyInput(this.value)" placeholder="Contoh: 150.000" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status Pembayaran</label>
            <select name="status" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Belum Bayar">Belum Bayar</option>
                <option value="DP 50%">DP 50%</option>
                <option value="Lunas">Lunas</option>
            </select>
        </div>
    `,
    cctv: `
        <div id="cabang-input-container">
            <label class="block text-sm font-medium text-gray-700 mb-1">Cabang Toko</label>
            <select name="cabang" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Monumen Emmy Saelan">Monumen Emmy Saelan</option>
                <option value="Perintis">Perintis</option>
                <option value="Head Office">Head Office</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nama Klien / Instansi</label>
            <input type="text" name="klien" list="list-klien" autocomplete="off" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Lokasi Pemasangan</label>
            <input type="text" name="lokasi" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Jumlah Kamera CCTV</label>
            <input type="number" name="jumlah_cctv" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Progres Kerja</label>
            <input type="text" name="progres" value="Penarikan Kabel" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status Proyek</label>
            <select name="status" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Survei">Tahap Survei</option>
                <option value="Pengerjaan">Sedang Dikerjakan</option>
                <option value="Selesai">Selesai / Serah Terima</option>
            </select>
        </div>
    `,
    list_laptop: `
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tanggal Input Master</label>
            <input type="date" name="tanggal" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Cabang Toko</label>
            <input type="text" name="cabang" list="list-cabang" autocomplete="off" placeholder="Pilih / ketik cabang baru..." required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Kode Toko</label>
            <input type="text" name="kode_toko" placeholder="TK-01, LT-A5" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Brand / Merk Laptop</label>
            <input type="text" name="merk" list="list-merk" autocomplete="off" placeholder="Pilih / ketik manual..." required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipe / Model Laptop</label>
            <input type="text" name="tipe" list="list-tipe" autocomplete="off" onchange="autoFillSpecsByTipe(event)" placeholder="Pilih / ketik manual..." required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Serial Number (SN) Unit</label>
            <input type="text" name="sn" placeholder="Masukkan nomor SN unik" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status Ketersediaan</label>
            <select name="status" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Tersedia">Ready / Tersedia</option>
                <option value="Disewa">Sedang Disewa</option>
                <option value="Maintenance">Perbaikan / Rusak</option>
                <option value="Terjual">Sudah Terjual</option>
                <option value="Staf">Digunakan Oleh Staf</option>
            </select>
        </div>
        <div class="md:col-span-2 bg-slate-50 p-4 border border-dashed rounded-xl grid grid-cols-2 gap-3">
            <span class="col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wide"><i class="fa-solid fa-microchip mr-1"></i> Detail Spesifikasi Unit</span>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Processor</label>
                <input type="text" name="spec_proc" list="list-proc" autocomplete="off" placeholder="Core i5-8250U / Ryzen 5" required class="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Kapasitas RAM</label>
                <input type="text" name="spec_ram" list="list-ram" autocomplete="off" placeholder="8GB DDR4 / 16GB" required class="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Penyimpanan (Storage)</label>
                <input type="text" name="spec_storage" list="list-storage" autocomplete="off" placeholder="SSD 256GB NVMe / HDD 1TB" required class="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">VGA / Layar</label>
                <input type="text" name="spec_vga" list="list-vga" autocomplete="off" placeholder="Intel UHD / Nvidia GTX / 14 Inch" required class="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
            </div>
            <div class="col-span-2">
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Fitur Layar</label>
                <select name="spec_screen" class="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                    <option value="Non-Touch">Non-Touch</option>
                    <option value="Touchscreen">Touchscreen</option>
                </select>
            </div>
        </div>
        <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Catatan Tambahan (Opsional)</label>
            <input type="text" name="catatan" placeholder="Contoh: Terjual ke Bpk Budi / Dipakai Staf Admin" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
    `,
    laptop_display: `
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tanggal Masuk Etalase</label>
            <input type="date" name="tanggal" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Cabang Toko</label>
            <input type="text" name="cabang" list="list-cabang" autocomplete="off" placeholder="Pilih / ketik cabang baru..." required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nama Teknisi</label>
            <input type="text" name="teknisi" list="list-teknisi" autocomplete="off" placeholder="Pilih / ketik nama teknisi..." required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Brand / Merk Laptop</label>
            <input type="text" name="merk" list="list-merk" autocomplete="off" placeholder="Pilih / ketik manual..." required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipe / Model Laptop</label>
            <input type="text" name="tipe" list="list-tipe" autocomplete="off" onchange="autoFillSpecsByTipe(event)" placeholder="Pilih / ketik manual..." required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nomor Seri (SN) / Identitas</label>
            <input type="text" name="sn" placeholder="Masukkan SN unit pajangan" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Harga Jual Display (Rp)</label>
            <input type="text" name="harga_jual" oninput="this.value = window.formatCurrencyInput(this.value)" placeholder="Contoh: 4.500.000" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status Pajangan</label>
            <select name="status" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Ready">Ready di Etalase</option>
                <option value="Terjual">Sudah Terjual</option>
                <option value="Gudang">Ditarik ke Gudang (Off)</option>
            </select>
        </div>
        <div class="md:col-span-2 bg-slate-50 p-4 border border-dashed rounded-xl grid grid-cols-2 gap-3">
            <span class="col-span-2 text-xs font-bold text-slate-500 uppercase tracking-wide"><i class="fa-solid fa-microchip mr-1"></i> Detail Spesifikasi Pajangan Toko</span>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Processor</label>
                <input type="text" name="spec_proc" list="list-proc" autocomplete="off" placeholder="Core i5-8250U / Ryzen 5" required class="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Kapasitas RAM</label>
                <input type="text" name="spec_ram" list="list-ram" autocomplete="off" placeholder="8GB DDR4 / 16GB" required class="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Penyimpanan (Storage)</label>
                <input type="text" name="spec_storage" list="list-storage" autocomplete="off" placeholder="SSD 256GB NVMe / HDD 1TB" required class="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 mb-0.5">VGA / Layar</label>
                <input type="text" name="spec_vga" list="list-vga" autocomplete="off" placeholder="Intel UHD / 13.3 Inch" required class="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
            </div>
            <div class="col-span-2">
                <label class="block text-xs font-medium text-gray-600 mb-0.5">Fitur Layar</label>
                <select name="spec_screen" class="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                    <option value="Non-Touch">Non-Touch</option>
                    <option value="Touchscreen">Touchscreen</option>
                </select>
            </div>
        </div>
        <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Catatan Etalase</label>
            <input type="text" name="catatan" placeholder="Contoh: Posisi Rak Atas Depan" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
    `,
    inventaris: `
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tanggal Input</label>
            <input type="date" name="tanggal" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nama Barang / Part</label>
            <input type="text" name="nama_barang" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <input type="text" name="kategori" list="list-kategori-inventaris" placeholder="Contoh: Alat Kerja / Sparepart Laptop" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
            <datalist id="list-kategori-inventaris"></datalist>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Stok Fisik</label>
            <input type="number" name="stok" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Satuan</label>
            <select id="inventaris-satuan-select" name="satuan" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="">Pilih satuan</option>
                <option value="Pcs">Pcs</option>
                <option value="Unit">Unit</option>
                <option value="Meter">Meter</option>
                <option value="Box">Box</option>
                <option value="Pack">Pack</option>
                <option value="Set">Set</option>
                <option value="Lembar">Lembar</option>
                <option value="Roll">Roll</option>
                <option value="Buah">Buah</option>
                <option value="Liter">Liter</option>
                <option value="Kg">Kg</option>
                <option value="Dus">Dus</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Lokasi Penyimpanan (Rak)</label>
            <input type="text" name="lokasi_rak" placeholder="Opsional" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Kondisi</label>
            <select name="kondisi" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Baik">Baik / Layak</option>
                <option value="Rusak">Rusak / Tidak Layak</option>
            </select>
        </div>
        <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Catatan Tambahan (Opsional)</label>
            <input type="text" name="catatan" placeholder="Contoh: Pembelian baru / Mutasi" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
    `,
    list_office: `
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tanggal Invite</label>
            <input type="date" name="tanggal" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nama User</label>
            <input type="text" name="nama_user" placeholder="Nama Pelanggan / User" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Akun Gmail dan Office</label>
            <input type="email" name="akun" placeholder="contoh@gmail.com" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div class="relative">
                <input type="password" id="input-password" name="password" required class="w-full border border-gray-300 rounded-lg p-2.5 pr-10 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
                <button type="button" onclick="window.togglePassword('input-password', 'input-eye')" class="absolute right-3 top-2.5 text-gray-400 hover:text-cyan-600 focus:outline-none transition">
                    <i id="input-eye" class="fa-solid fa-eye"></i>
                </button>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Info Pemulihan</label>
            <input type="text" name="pemulihan" placeholder="Nomor HP / Email Pemulihan" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Tipe Akun Office</label>
            <select name="tipe_akun" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Anggota">Anggota (Member)</option>
                <option value="Utama">Utama (Server / Host)</option>
                <option value="Personal">Personal</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Jenis Office</label>
            <select id="select-office" name="office" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="">Pilih Jenis Office</option>
                <option value="365 Family">365 Family</option>
                <option value="365 Personal">365 Personal</option>
                <option value="Home & Student 2016">Home & Student 2016</option>
                <option value="Home & Student 2019">Home & Student 2019</option>
                <option value="Home & Student 2021">Home & Student 2021</option>
                <option value="Home 2024">Home 2024</option>
            </select>
        </div>
        <div id="server-link-container" class="hidden">
            <label class="block text-sm font-medium text-gray-700 mb-1">Kaitkan ke Server Utama</label>
            <select id="server-utama-select" name="server_utama" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="">Memuat daftar server...</option>
            </select>
            <p class="text-xs text-gray-400 mt-1">Pilihan server hanya memuat server yang memiliki sisa slot kosong.</p>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name (Device / Identitas)</label>
            <input type="text" name="name" placeholder="Nama PC / Perangkat" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div id="masa-aktif-container">
            <label class="block text-sm font-medium text-gray-700 mb-1">Masa Aktif</label>
            <input type="text" name="masa_aktif" placeholder="Contoh: 1 Tahun / 25-12-2026" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Status Lisensi</label>
            <select name="status" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Aktif">Aktif</option>
                <option value="Tidak Aktif">Tidak Aktif</option>
                <option value="Permanen">Permanen</option>
            </select>
        </div>  
        <div class="font-medium text-gray-700 mb-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Link Redemption</label>
            <a href="http://redeem.astrindo-starvision.com/" target="_blank" class="text-cyan-600 hover:underline"><i class="fa-solid fa-file-invoice"></i> Redemption Office</a>
        </div>
    `,
    user_management: `
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
            <input id="user-name" name="name" type="text" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" placeholder="Masukkan nama" required>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email Akun (Login)</label>
            <input id="user-email" name="email" type="email" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" placeholder="Masukkan email" required>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Password Account (Min. 6 Karakter)</label>
            <div class="relative">
                <input id="user-password" name="password" type="password" class="w-full border border-gray-300 rounded-lg p-2.5 pr-10 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" placeholder="Minimal 6 karakter" required>
                <button type="button" onclick="window.togglePassword('user-password', 'user-eye')" class="absolute right-3 top-2.5 text-gray-400 hover:text-cyan-600 focus:outline-none transition">
                    <i id="user-eye" class="fa-solid fa-eye"></i>
                </button>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Wilayah Cabang (Branch)</label>
            <select id="user-branch" name="branch" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                <option value="Head Office">Head Office (Semua)</option>
                <option value="Monumen Emmy Saelan">Monumen Emmy Saelan</option>
                <option value="Perintis">Perintis</option>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Posisi Struktural (Alur Visual)</label>
            <select id="user-role" name="role" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white" required>
                <option value="Sales Counter">Sales Counter</option>
                <option value="Teknisi">Teknisi</option>
                <option value="Customer Service">Customer Service</option>
                <option value="Admin">Admin</option>
            </select>
        </div>
        <div class="md:col-span-2 border-t pt-3 mt-2">
            <span class="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2"><i class="fa-solid fa-key mr-1"></i> Hak Akses Menu & Aksi</span>
            <div class="border border-gray-200 rounded-xl p-3 max-h-40 overflow-y-auto bg-slate-50 custom-table-scrollbar">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_dashboard" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Dashboard</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_services" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Log Service</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_penyewaan" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Penyewaan</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_cctv" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>CCTV</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_list_laptop" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Laptop Gudang</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_laptop_display" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Laptop Display</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_inventaris" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Inventaris Suku Cadang & Alat</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_list_office" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>List Office</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_user_management" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>User Management</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_activity_logs" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Riwayat Aktivitas</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_backup_database" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Backup Database</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_export_excel" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Export Excel</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_import_excel" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Import Excel</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_edit_data" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Edit Data</span>
                    </label>
                    <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition">
                        <input type="checkbox" name="perm_delete_data" value="true" class="rounded text-cyan-600 border-gray-300 focus:ring-cyan-500">
                        <span>Hapus Data</span>
                    </label>
                </div>
            </div>
        </div>
    `,
    activity_logs: `
        <div class="md:col-span-2 p-4 bg-slate-50 rounded-lg border text-center text-slate-500 italic text-sm">
            <i class="fa-solid fa-circle-info text-cyan-600 text-lg mr-1"></i>
            Riwayat Aktivitas dicatat secara otomatis oleh sistem Cloud. Tidak diperlukan input manual pada modul ini.
        </div>
    `
};

export const tableHeaders = {
    services: ['ID', 'No. Referensi', 'Tanggal', 'Cabang', 'Pelanggan', 'No. WhatsApp', 'Perangkat', 'Teknisi', 'Biaya', 'Status', 'Aksi'],
    penyewaan: ['ID', 'Tanggal', 'Cabang', 'Penyewa', 'No. WhatsApp', 'Unit & SN Laptop', 'Tanggal Sewa', 'Total Biaya', 'Status', 'Aksi'],
    cctv: ['ID', 'Tanggal', 'Cabang', 'Klien', 'Lokasi', 'Kamera', 'Progres', 'Status', 'Aksi'],
    list_laptop: ['ID', 'Tanggal Input', 'Cabang', 'Kode Toko', 'Merk', 'Tipe', 'Serial Number (SN)', 'Spesifikasi Teknik', 'Status', 'Catatan', 'Aksi'],
    laptop_display: ['ID', 'Tanggal Masuk', 'Cabang', 'Teknisi', 'Merk', 'Tipe Model', 'Serial Number (SN)', 'Spesifikasi Ringkas', 'Harga Jual', 'Status Display', 'Catatan', 'Aksi'],
    inventaris: ['ID', 'Tanggal', 'Cabang', 'Nama Barang', 'Kode SKU', 'Kategori', 'Stok', 'Satuan', 'Lokasi Rak', 'Kondisi', 'Catatan', 'Aksi'],
    list_office: ['ID', 'Tanggal', 'Nama User', 'Akun', 'Server Utama', 'Password', 'Pemulihan', 'Office', 'Name', 'Masa Aktif', 'Status', 'Aksi'],
    user_management: ['ID', 'Nama Lengkap', 'Email Akun', 'Sandi Terdaftar', 'Hak Akses Menu', 'Cabang / Branch', 'Aksi'],
    activity_logs: ['Waktu Log', 'Operator (User)', 'Aksi', 'Modul', 'Detail Aktivitas', 'Aksi']
};

export const dataKeysMapping = {
    services: ['id', 'no_ref', 'tanggal', 'cabang', 'pelanggan', 'no_wa', 'perangkat', 'teknisi', 'biaya', 'status'],
    penyewaan: ['id', 'tanggal', 'cabang', 'penyewa', 'no_wa', 'unit', 'tgl_mulai', 'total_biaya', 'status'],
    cctv: ['id', 'tanggal', 'cabang', 'klien', 'lokasi', 'jumlah_cctv', 'progres', 'status'],
    list_laptop: ['id', 'tanggal', 'cabang', 'kode_toko', 'merk', 'tipe', 'sn', 'spek', 'status', 'catatan'],
    laptop_display: ['id', 'tanggal', 'cabang', 'teknisi', 'merk', 'tipe', 'sn', 'spek_singkat', 'harga_jual', 'status', 'catatan'],
    inventaris: ['id', 'tanggal', 'cabang', 'nama_barang', 'kode_barang', 'kategori', 'stok', 'satuan', 'lokasi_rak', 'kondisi', 'catatan'],
    list_office: ['id', 'tanggal', 'nama_user', 'akun', 'server_utama', 'password', 'pemulihan', 'office', 'name', 'masa_aktif', 'status'],
    user_management: ['id', 'name', 'email', 'password', 'permissions', 'branch'],
    activity_logs: ['tanggal_jam', 'user', 'action', 'menu_display', 'details']
};

export const filterOptionsTemplate = {
    services: ['Antrean', 'Proses', 'Seleser','Cancel'],
    penyewaan: ['Belum Bayar', 'DP 50%', 'Lunas'],
    cctv: ['Survei', 'Pengerjaan', 'Selesai'],
    list_laptop: ['Tersedia', 'Disewa', 'Maintenance', 'Terjual', 'Staf'],
    laptop_display: ['Ready', 'Terjual', 'Gudang'],
    inventaris: ['Baik', 'Rusak'],
    list_office: ['Aktif', 'Tidak Aktif', 'Permanen'],
    user_management: ['Head Office', 'Monumen Emmy Saelan', 'Perintis'],
    activity_logs: ['Tambah', 'Ubah', 'Hapus', 'Kosongkan', 'Impor']
};