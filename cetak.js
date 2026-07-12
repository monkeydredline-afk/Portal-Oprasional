/* ==========================================================================
   Teknisi Portal - cetak.js (Modul Cetak Nota Thermal & Lembar Kerja A5)
   ========================================================================== */

// Fungsi pembantu untuk mengamankan karakter HTML agar tidak merusak layout
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==========================================================================
// 1. FUNGSI CETAK NOTA STRUK PELANGGAN (OPTIMASI THERMAL 58mm/80mm)
// ==========================================================================
window.printServiceNota = function(firebaseKey) {
    const perms = window.currentUser.permissions || {};
    const isSuperadmin = (window.currentUser && window.currentUser.email === 'superadmin@wanasatria.com');
    const canPrint = isSuperadmin || perms.cetak_nota === true || perms.cetak_nota === 'true';

    if (!canPrint) {
        alert("Maaf, Anda tidak memiliki izin akses untuk mencetak nota.");
        return;
    }

    const ticket = (window.globalDataCloud.services || []).find(t => t._firebaseKey === firebaseKey);
    if (!ticket) return;

    // Bersihkan sisa area cetak lama agar tidak menumpuk di DOM
    let oldArea1 = document.getElementById('invoice-print-area');
    if (oldArea1) oldArea1.remove();
    let oldArea2 = document.getElementById('label-print-area');
    if (oldArea2) oldArea2.remove();

    // SINKRONISASI UKURAN KERTAS DINAMIS (KUNCI): 
    // Suntikkan aturan @page thermal 80mm secara eksklusif ke <head> saat ini saja
    let printStyle = document.getElementById('dynamic-print-style');
    if (printStyle) printStyle.remove();
    printStyle = document.createElement('style');
    printStyle.id = 'dynamic-print-style';
    printStyle.innerHTML = `
        @media print {
            @page {
                size: 80mm auto; /* Mengunci kertas ke lebar thermal vertikal */
                margin: 0mm;
            }
        }
    `;
    document.head.appendChild(printStyle);

    const printArea = document.createElement('div');
    printArea.id = 'invoice-print-area';
    printArea.className = 'hidden';

    const srvId = ticket.no_ref || `SRV/Legacy/#${ticket.id}`;
    const itemsTerpakai = ticket.items_terpakai || [];
    let itemsHtml = '';
    
    if (itemsTerpakai.length === 0) {
        itemsHtml = `<div style="text-align:center; font-style:italic; padding: 4px 0;">-- Tidak ada tindakan/jasa --</div>`;
    } else {
        itemsHtml = itemsTerpakai.map(it => {
            const subtotal = (Number(it.qty) || 1) * (Number(it.price) || 0);
            return `
                <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                    <span style="max-width: 65%; text-align: left;">${escapeHtml(it.name)} (x${it.qty})</span>
                    <span style="font-weight: bold; font-family: monospace;">Rp ${subtotal.toLocaleString('id-ID')}</span>
                </div>
            `;
        }).join('');
    }

    printArea.innerHTML = `
        <div style="width: 100%; max-width: 80mm; margin: 0; padding: 8px; font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.3; color: #000; box-sizing: border-box;">
            
            <!-- Header Struk -->
            <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
                <h3 style="margin: 0; font-size: 13px; font-weight: bold; text-transform: uppercase;">Wana Satria Komputer</h3>
                <p style="margin: 2px 0; font-size: 9px;">Menerima Jual-Beli, Sewa, Sparepart & Service</p>
                <p style="margin: 2px 0; font-size: 10px; font-weight: bold;">Cabang: ${escapeHtml(ticket.cabang || 'Perintis')}</p>
                <p style="margin: 2px 0; font-size: 9px; color: #333;">Tgl: ${ticket.tanggal || '-'}</p>
            </div>

            <!-- Detail Pelanggan -->
            <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; font-size: 10px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="width: 32%; font-weight: bold;">No. Ref</td><td>: ${escapeHtml(srvId)}</td></tr>
                    <tr><td style="font-weight: bold;">Pelanggan</td><td>: ${escapeHtml(ticket.pelanggan)}</td></tr>
                    <tr><td style="font-weight: bold;">No. WA</td><td>: ${escapeHtml(ticket.no_wa || '-')}</td></tr>
                    <tr><td style="font-weight: bold;">Unit</td><td>: ${escapeHtml(ticket.perangkat)}</td></tr>
                    <tr><td style="font-weight: bold;">Teknisi PJ</td><td>: ${escapeHtml(ticket.teknisi || 'Belum Ditentukan')}</td></tr>
                </table>
            </div>

            <!-- Tabel Tindakan -->
            <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                <div style="font-weight: bold; margin-bottom: 4px; text-decoration: underline;">RINCIAN TINDAKAN & PART:</div>
                ${itemsHtml}
            </div>

            <!-- Total Biaya -->
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; margin-top: 8px; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px;">
                <span>TOTAL TAGIHAN:</span>
                <span style="font-family: monospace;">Rp ${Number(ticket.biaya || 0).toLocaleString('id-ID')}</span>
            </div>

            <!-- Pesan Penutup -->
            <div style="text-align: center; font-size: 8px; font-style: italic; margin-top: 10px; line-height: 1.2;">
                <p style="margin: 2px 0;">Terima kasih atas kunjungan Anda!</p>
                <p style="margin: 2px 0;">* Garansi servis sesuai ketentuan tertulis toko.</p>
                <p style="margin: 2px 0;">* Struk ini adalah bukti pembayaran resmi.</p>
            </div>
        </div>
    `;

    document.body.appendChild(printArea);

    setTimeout(() => {
        window.print();
    }, 250);
};

// ==========================================================================
// 2. FUNGSI CETAK LEMBAR KERJA SERVISAN LAPTOP (A5 LANDSCAPE - BERSIH TANPA GARIS DI BAWAH)
// ==========================================================================
window.printLaptopWorkOrder = function(firebaseKey) {
    const perms = window.currentUser.permissions || {};
    const isSuperadmin = (window.currentUser && window.currentUser.email === 'superadmin@wanasatria.com');
    const canPrint = isSuperadmin || perms.cetak_nota === true || perms.cetak_nota === 'true';

    if (!canPrint) {
        alert("Maaf, Anda tidak memiliki izin akses untuk mencetak lembar kerja.");
        return;
    }

    const ticket = (window.globalDataCloud.services || []).find(t => t._firebaseKey === firebaseKey);
    if (!ticket) return;

    // Bersihkan sisa area cetak lama agar tidak menumpuk di DOM
    let oldArea1 = document.getElementById('invoice-print-area');
    if (oldArea1) oldArea1.remove();
    let oldArea2 = document.getElementById('label-print-area');
    if (oldArea2) oldArea2.remove();

    // SINKRONISASI UKURAN KERTAS DINAMIS (KUNCI):
    // Suntikkan aturan @page A5 landscape secara eksklusif ke <head> saat ini saja
    let printStyle = document.getElementById('dynamic-print-style');
    if (printStyle) printStyle.remove();
    printStyle = document.createElement('style');
    printStyle.id = 'dynamic-print-style';
    printStyle.innerHTML = `
        @media print {
            @page {
                size: A5 landscape; /* Mengunci kertas ke A5 landscape */
                margin: 0mm;
            }
        }
    `;
    document.head.appendChild(printStyle);

    const printArea = document.createElement('div');
    printArea.id = 'label-print-area';
    printArea.className = 'hidden';

    const srvId = ticket.no_ref || `SRV/Legacy/#${ticket.id}`;
    const clientName = ticket.pelanggan || '-';
    const clientPhone = ticket.no_wa || '-';
    const deviceUnit = ticket.perangkat || '-';
    const keluhanLengkap = ticket.kerusakan || '';
    const ticketDate = ticket.tanggal || '-';
    const cashierName = window.currentUser.name || 'Finance Wana Satria';

    printArea.innerHTML = `
        <div style="width: 210mm; height: 148mm; box-sizing: border-box; padding: 12px; font-family: Arial, sans-serif; font-size: 10px; color: #000; line-height: 1.3; border: 1px solid #000; background: #fff; display: flex; flex-direction: column; justify-content: space-between;">
            
            <!-- 1. Header Atas (Nama Toko & No. Ref) -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px;">
                <div>
                    <h2 style="margin: 0; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">CV. Wana Satria Komputindo</h2>
                    <p style="margin: 1px 0; font-size: 8px; color: #333;">
                        Jalan Monumen Emmy Saelan No. 9C, Kel. Gn. Sari, Kec. Rappocini Kota Makassar | Telepon: 0811459354
                    </p>
                </div>
                <div style="text-align: right;">
                    <h3 style="margin: 0; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #000;">REPAIR / SERVICES</h3>
                    <p style="margin: 1px 0; font-size: 9.5px; font-family: monospace; font-weight: bold; color: #111;">${escapeHtml(srvId)}</p>
                    <p style="margin: 1px 0; font-size: 8px; color: #555;">Tanggal Dibuat: ${escapeHtml(ticketDate)} | Cashier: ${escapeHtml(cashierName)}</p>
                </div>
            </div>

            <!-- 2. KOTAK CUSTOMER (Bagian Atas, Melintang Penuh dengan Sub-kolom) -->
            <div style="border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 6px; box-sizing: border-box;">
                <span style="font-weight: bold; text-transform: uppercase; font-size: 8px; display: block; margin-bottom: 4px; color: #333;">
                    Customer
                </span>
                <div style="display: flex; justify-content: space-between; font-size: 9.5px;">
                    <div style="width: 48%;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="width: 25%; font-weight: bold; padding: 1.5px 0;">Name</td><td style="width: 5%;">:</td><td>${escapeHtml(clientName)}</td></tr>
                            <tr><td style="font-weight: bold; padding: 1.5px 0;">Phone</td><td>:</td><td style="font-family: monospace;">${escapeHtml(clientPhone)}</td></tr>
                        </table>
                    </div>
                    <div style="width: 48%;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr><td style="width: 25%; font-weight: bold; padding: 1.5px 0;">Address</td><td style="width: 5%;">:</td><td>makassar</td></tr>
                            <tr><td style="font-weight: bold; padding: 1.5px 0;">City</td><td>:</td><td style="text-transform: uppercase;">KOTA MAKASSAR</td></tr>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 3. KOTAK INFORMATION (Tepat di bawah Customer, Melintang Penuh dengan Sub-kolom) -->
            <div style="border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 6px; box-sizing: border-box;">
                <span style="font-weight: bold; text-transform: uppercase; font-size: 8px; display: block; margin-bottom: 4px; color: #333;">
                    Information
                </span>
                <div style="display: flex; justify-content: space-between; font-size: 9.5px;">
                    <div style="width: 48%;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="width: 25%; font-weight: bold; padding: 1.5px 0; vertical-align: top;">Device</td>
                                <td style="width: 5%; vertical-align: top;">:</td>
                                <td style="vertical-align: top; font-weight: bold;">${escapeHtml(deviceUnit)}</td>
                            </tr>
                        </table>
                    </div>
                    <div style="width: 48%;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="width: 25%; font-weight: bold; padding: 1.5px 0; vertical-align: top;">Keluhan</td>
                                <td style="width: 5%; vertical-align: top;">:</td>
                                <td style="vertical-align: top; white-space: pre-wrap; font-size: 8.5px; line-height: 1.1; color: #333;">${escapeHtml(keluhanLengkap)}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 4. SEKSI CATATAN DIAGNOSIS (Hanya Judul & Area Kosong Putih Bersih) -->
            <div style="padding-bottom: 5px; margin-bottom: 6px; box-sizing: border-box; min-height: 50px; flex-grow: 1;">
                <span style="font-weight: bold; text-transform: uppercase; font-size: 8px; display: block; margin-bottom: 3px; color: #444;">
                    Catatan Diagnosis & Tindakan Teknisi (Tulis Tangan)
                </span>
            </div>

            <!-- 5. TANDA TANGAN SECTION (Paling Bawah) -->
            <div style="display: flex; justify-content: space-between; font-size: 8.5px; text-align: center; padding: 0 15px; margin-top: auto; padding-top: 10px;">
                <div style="width: 40%;">
                    <p style="margin: 0 0 24px 0; font-weight: bold; color: #444;">Signing for acceptance :</p>
                    <p style="margin: 0; border-top: 1px solid #000; display: inline-block; width: 130px; font-weight: bold; text-transform: uppercase;">
                        ${escapeHtml(clientName)}
                    </p>
                </div>
                <div style="width: 40%;">
                    <p style="margin: 0 0 24px 0; font-weight: bold; color: #444;">Signature :</p>
                    <p style="margin: 0; border-top: 1px solid #000; display: inline-block; width: 130px; font-weight: bold; text-transform: uppercase;">
                        ( RECEIVER )
                    </p>
                </div>
            </div>

        </div>
    `;

    document.body.appendChild(printArea);

    setTimeout(() => {
        window.print();
    }, 250);
};