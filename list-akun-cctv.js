/* ==========================================================================
   Teknisi Portal - list-akun-cctv.js (Modul Master Data: List Akun CCTV)
   ==========================================================================
   File terpisah untuk memudahkan penambahan modul baru tanpa mengubah file
   utama yang sedang dipakai. Modul ini mengikuti pola data cabang, form add/
   edit, dan role permission yang sama seperti modul lain di project.

   Cara pakai:
   - import './list-akun-cctv.js';
   - panggil window.listAkunCctv.init(); atau gunakan method yang dibutuhkan.
   ========================================================================== */

import { db, ref, set, push, update, remove } from './firebase-config.js';

const CCTV_ACCOUNT_NODE = 'list_akun_cctv';

const defaultBranchOptions = [
    'Head Office',
    'Monumen Emmy Saelan',
    'Perintis'
];

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parsePatternValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return [];

    const digits = raw
        .split(/[^0-9]+/)
        .filter(Boolean)
        .flatMap((chunk) => chunk.split(''))
        .map((digit) => Number(digit))
        .filter((digit) => Number.isInteger(digit) && digit >= 1 && digit <= 9);

    return [...new Set(digits.map(String))];
}

function getPatternGridMarkup(initialValue = '') {
    const selected = parsePatternValue(initialValue);
    const buttons = [1, 2, 3, 4, 5, 6, 7, 8, 9]
        .map((cell) => {
            const isSelected = selected.includes(String(cell));
            return `
                <button
                    type="button"
                    data-pattern-cell="${cell}"
                    onclick="window.toggleCctvPatternNode(this)"
                    class="w-12 h-12 rounded-xl border text-sm font-bold transition ${isSelected ? 'bg-cyan-600 text-white border-cyan-600 shadow-md' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-cyan-50 hover:border-cyan-300'}"
                >
                    ${cell}
                </button>
            `;
        })
        .join('');

    const displayValue = selected.join('-');

    return `
        <div data-pattern-root class="space-y-2">
            <input type="hidden" name="pola" value="${escapeHtml(displayValue)}">
            <div class="grid grid-cols-3 gap-2 w-40 mx-auto">
                ${buttons}
            </div>
            <div data-pattern-display class="text-center text-[11px] ${displayValue ? 'text-cyan-700' : 'text-slate-500'}">
                ${displayValue ? `Pola dipilih: ${escapeHtml(displayValue)}` : 'Pilih urutan pola unlock'}
            </div>
            <div class="text-center">
                <button type="button" onclick="window.resetCctvPattern(this)" class="text-[11px] text-slate-500 underline underline-offset-2">Reset pola</button>
            </div>
        </div>
    `;
}

function getCurrentBranchOptions() {
    const allowed = (window.branchOptions || []).map(String);
    if (allowed.length > 0) return allowed;
    return defaultBranchOptions;
}

export function getListAkunCctvFieldsTemplate() {
    return `
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Cabang</label>
            <select name="cabang" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                ${getCurrentBranchOptions()
                    .map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
                    .join('')}
            </select>
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nama Pelanggan</label>
            <input type="text" name="nama_pelanggan" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Lokasi</label>
            <input type="text" name="lokasi" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Perangkat</label>
            <input type="text" name="perangkat" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input type="text" name="username" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="text" name="password" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email Akun Online</label>
            <input type="email" name="email" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Password Email</label>
            <input type="text" name="password_email" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Pola Unlock</label>
            ${getPatternGridMarkup('')}
        </div>

        <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
            <textarea name="catatan" rows="3" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"></textarea>
        </div>
    `;
}

export function buildListAkunCctvTableRows(items = []) {
    const validItems = [...(items || [])]
        .filter((item) => {
            const safeItem = item || {};
            const coreValues = [safeItem.nama_pelanggan, safeItem.lokasi, safeItem.perangkat, safeItem.username, safeItem.password];
            return coreValues.some((value) => String(value ?? '').trim() !== '') || String(safeItem.cabang || '').trim() || String(safeItem.tanggal || '').trim();
        })
        .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));

    if (!validItems.length) {
        return `
            <tr>
                <td colspan="12" class="px-4 py-10 text-center text-sm text-slate-500">
                    <i class="fa-solid fa-video text-xl block mb-2 text-slate-400"></i>
                    Belum ada data akun CCTV.
                </td>
            </tr>
        `;
    }

    return validItems
        .map((item, index) => {
            const safeItem = item || {};
            const customerName = safeItem.nama_pelanggan || '-';
            const location = safeItem.lokasi || '-';
            const device = safeItem.perangkat || '-';
            const username = safeItem.username || '-';
            const password = safeItem.password || '-';
            const email = safeItem.email || '-';
            const passwordEmail = safeItem.password_email || '-';
            const pattern = safeItem.pola ?? safeItem.pola_unlock ?? '-';
            const note = safeItem.catatan || '-';

            return `
                <tr class="border-b border-slate-200 hover:bg-slate-50 align-top">
                    <td class="px-3 py-3 text-xs text-slate-700 font-medium font-mono">${index + 1}</td>
                    <td class="px-3 py-3 text-xs text-slate-700 font-medium">${escapeHtml(safeItem.cabang || 'Head Office')}</td>
                    <td class="px-3 py-3 text-xs text-slate-700 font-medium">${escapeHtml(customerName)}</td>
                    <td class="px-3 py-3 text-xs text-slate-700">${escapeHtml(location)}</td>
                    <td class="px-3 py-3 text-xs text-slate-700">${escapeHtml(device)}</td>
                    <td class="px-3 py-3 text-xs text-slate-700 font-mono">${escapeHtml(username)}</td>
                    <td class="px-3 py-3 text-xs text-slate-700 font-mono">${escapeHtml(password)}</td>
                    <td class="px-3 py-3 text-xs text-slate-700 font-mono">${escapeHtml(email)}</td>
                    <td class="px-3 py-3 text-xs text-slate-700 font-mono">${escapeHtml(passwordEmail)}</td>
                    <td class="px-3 py-3 text-xs text-slate-700">${escapeHtml(pattern)}</td>
                    <td class="px-3 py-3 text-xs text-slate-700 max-w-[220px]">${escapeHtml(note)}</td>
                    <td class="px-3 py-3 text-right">
                        <button type="button" onclick="window.listAkunCctv.openEditModal('${item._firebaseKey || item.id || ''}')" class="px-2 py-1 rounded text-[11px] bg-amber-500 hover:bg-amber-600 text-white font-medium">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button type="button" onclick="window.listAkunCctv.deleteItem('${item._firebaseKey || item.id || ''}')" class="ml-1 px-2 py-1 rounded text-[11px] bg-rose-500 hover:bg-rose-600 text-white font-medium">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        })
        .join('');
}

export function renderListAkunCctvTable() {
    const container = document.getElementById('table-body');
    if (!container) return;

    const items = Array.isArray(window.globalDataCloud?.[CCTV_ACCOUNT_NODE]) ? window.globalDataCloud[CCTV_ACCOUNT_NODE] : [];
    const branchFilter = String(window.branchFilterValue || '').trim();

    let filtered = items.filter((item) => {
        const safeItem = item || {};
        const coreValues = [safeItem.nama_pelanggan, safeItem.lokasi, safeItem.perangkat, safeItem.username, safeItem.password];
        return coreValues.some((value) => String(value ?? '').trim() !== '') || String(safeItem.cabang || '').trim() || String(safeItem.tanggal || '').trim();
    });

    if (branchFilter && branchFilter !== 'Semua') {
        filtered = filtered.filter((item) => String(item.cabang || '').toLowerCase() === branchFilter.toLowerCase());
    }

    container.innerHTML = buildListAkunCctvTableRows(filtered);
}

export function normalizeCctvAccountInput(raw = {}) {
    return {
        cabang: raw.cabang || window.currentUser?.branch || 'Head Office',
        nama_pelanggan: raw.nama_pelanggan || '',
        lokasi: raw.lokasi || '',
        perangkat: raw.perangkat || '',
        username: raw.username || '',
        password: raw.password || '',
        email: raw.email || raw.email_online || '',
        password_email: raw.password_email || raw.passwordOnline || '',
        pola: raw.pola ?? raw.pola_unlock ?? '',
        catatan: raw.catatan || '',
        tanggal: raw.tanggal || new Date().toISOString().slice(0, 10)
    };
}

export function submitListAkunCctv(event) {
    if (!event || !db) return Promise.resolve();
    const form = event.target;
    const formData = new FormData(form);
    const payload = normalizeCctvAccountInput({
        cabang: formData.get('cabang'),
        nama_pelanggan: formData.get('nama_pelanggan'),
        lokasi: formData.get('lokasi'),
        perangkat: formData.get('perangkat'),
        username: formData.get('username'),
        password: formData.get('password'),
        email: formData.get('email') || formData.get('email_online'),
        password_email: formData.get('password_email') || formData.get('passwordOnline'),
        pola: formData.get('pola') ?? formData.get('pola_unlock'),
        catatan: formData.get('catatan')
    });

    if (!payload.nama_pelanggan || !payload.lokasi || !payload.perangkat || !payload.username || !payload.password) {
        alert('Semua field wajib diisi.');
        return Promise.reject(new Error('Field wajib belum lengkap.'));
    }

    const existingItems = Array.isArray(window.globalDataCloud?.[CCTV_ACCOUNT_NODE]) ? window.globalDataCloud[CCTV_ACCOUNT_NODE] : [];
    const nextId = existingItems.length === 0 ? 1 : Math.max(...existingItems.map((item) => Number(item.id) || 0)) + 1;
    payload.id = nextId;

    const newKey = push(ref(db, CCTV_ACCOUNT_NODE)).key;
    const data = { _firebaseKey: newKey, ...payload };

    return set(ref(db, `${CCTV_ACCOUNT_NODE}/${newKey}`), data)
        .then(() => {
            if (window.showToast) window.showToast('Data akun CCTV berhasil disimpan.', 'success');
            if (window.logActivity) window.logActivity('Tambah', CCTV_ACCOUNT_NODE, `Menambahkan akun CCTV ${payload.nama_pelanggan} cabang ${payload.cabang}`);
            form.reset();
            return true;
        })
        .catch((error) => {
            const errorMessage = error && error.message ? error.message : String(error);
            if (window.showToast) {
                if (/permission_denied/i.test(errorMessage)) {
                    window.showToast('Gagal menyimpan akun CCTV: izin Firebase ditolak. Periksa rules database untuk node list_akun_cctv.', 'error');
                } else {
                    window.showToast('Gagal menyimpan akun CCTV: ' + errorMessage, 'error');
                }
            }
            throw error;
        });
}

export function openEditModal(firebaseKey) {
    if (!firebaseKey) return;
    const item = (window.globalDataCloud?.[CCTV_ACCOUNT_NODE] || []).find((row) => String(row._firebaseKey || row.id) === String(firebaseKey));
    if (!item) return;

    let modal = document.getElementById('cctv-account-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cctv-account-modal';
        modal.className = 'fixed inset-0 bg-slate-900/50 z-50 hidden items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <h3 class="text-base font-bold text-slate-800">Edit Akun CCTV</h3>
                    <button type="button" onclick="document.getElementById('cctv-account-modal').classList.add('hidden')" class="text-slate-500 hover:text-slate-700">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <form id="cctv-account-edit-form" class="p-5 space-y-4">
                    <input type="hidden" name="firebaseKey" id="cctv-account-edit-key">
                    <div id="cctv-account-edit-fields" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
                    <div class="flex justify-end gap-2 pt-2">
                        <button type="button" onclick="document.getElementById('cctv-account-modal').classList.add('hidden')" class="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium">Batal</button>
                        <button type="submit" class="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium">Simpan Perubahan</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const editFields = document.getElementById('cctv-account-edit-fields');
    if (editFields) {
        editFields.innerHTML = `
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Cabang</label>
                <select name="cabang" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none bg-white">
                    ${getCurrentBranchOptions()
                        .map(option => `<option value="${escapeHtml(option)}" ${String(item.cabang || '').trim() === option ? 'selected' : ''}>${escapeHtml(option)}</option>`)
                        .join('')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Nama Pelanggan</label>
                <input type="text" name="nama_pelanggan" value="${escapeHtml(item.nama_pelanggan || '')}" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Lokasi</label>
                <input type="text" name="lokasi" value="${escapeHtml(item.lokasi || '')}" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Perangkat</label>
                <input type="text" name="perangkat" value="${escapeHtml(item.perangkat || '')}" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input type="text" name="username" value="${escapeHtml(item.username || '')}" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input type="text" name="password" value="${escapeHtml(item.password || '')}" required class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email Akun Online</label>
                <input type="email" name="email" value="${escapeHtml(item.email || item.email_online || '')}" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Password Email</label>
                <input type="text" name="password_email" value="${escapeHtml(item.password_email || item.passwordOnline || '')}" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Pola Unlock</label>
                ${getPatternGridMarkup(item.pola ?? item.pola_unlock ?? '')}
            </div>
            <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                <textarea name="catatan" rows="3" class="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">${escapeHtml(item.catatan || '')}</textarea>
            </div>
        `;
    }

    const keyInput = document.getElementById('cctv-account-edit-key');
    if (keyInput) keyInput.value = firebaseKey;

    const form = document.getElementById('cctv-account-edit-form');
    if (form) {
        form.onsubmit = function (event) {
            event.preventDefault();
            const editData = new FormData(form);
            const updated = {
                cabang: editData.get('cabang') || 'Head Office',
                nama_pelanggan: editData.get('nama_pelanggan'),
                lokasi: editData.get('lokasi'),
                perangkat: editData.get('perangkat'),
                username: editData.get('username'),
                password: editData.get('password'),
                email: editData.get('email') || editData.get('email_online') || '',
                password_email: editData.get('password_email') || editData.get('passwordOnline') || '',
                pola: editData.get('pola') ?? editData.get('pola_unlock'),
                catatan: editData.get('catatan')
            };

            update(ref(db, `${CCTV_ACCOUNT_NODE}/${firebaseKey}`), updated)
                .then(() => {
                    if (window.showToast) window.showToast('Data akun CCTV berhasil diperbarui.', 'success');
                    if (window.logActivity) window.logActivity('Ubah', CCTV_ACCOUNT_NODE, `Mengubah akun CCTV ${updated.nama_pelanggan} cabang ${updated.cabang}`);
                    modal.classList.add('hidden');
                })
                .catch((error) => {
                    if (window.showToast) window.showToast('Gagal memperbarui akun CCTV: ' + error.message, 'error');
                });
        };
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function deleteListAkunCctvItem(firebaseKey) {
    if (!firebaseKey) return;
    const confirmDelete = window.confirm ? window.confirm('Apakah Anda yakin ingin menghapus akun CCTV ini?') : true;
    if (!confirmDelete) return;

    remove(ref(db, `${CCTV_ACCOUNT_NODE}/${firebaseKey}`))
        .then(() => {
            if (window.showToast) window.showToast('Data akun CCTV berhasil dihapus.', 'success');
            if (window.logActivity) window.logActivity('Hapus', CCTV_ACCOUNT_NODE, `Menghapus akun CCTV key ${firebaseKey}`);
        })
        .catch((error) => {
            if (window.showToast) window.showToast('Gagal menghapus akun CCTV: ' + error.message, 'error');
        });
}

window.toggleCctvPatternNode = function (button) {
    const root = button?.closest('[data-pattern-root]');
    if (!root) return;

    const hidden = root.querySelector('input[name="pola"]');
    const display = root.querySelector('[data-pattern-display]');
    if (!hidden) return;

    const selected = (hidden.value || '').split('-').filter(Boolean);
    const value = String(button.dataset.patternCell || '').trim();
    if (!value || selected.includes(value)) return;

    selected.push(value);
    hidden.value = selected.join('-');

    root.querySelectorAll('[data-pattern-cell]').forEach((node) => {
        const isSelected = selected.includes(String(node.dataset.patternCell || ''));
        node.classList.toggle('bg-cyan-600', isSelected);
        node.classList.toggle('text-white', isSelected);
        node.classList.toggle('border-cyan-600', isSelected);
        node.classList.toggle('shadow-md', isSelected);
        node.classList.toggle('bg-slate-100', !isSelected);
        node.classList.toggle('text-slate-600', !isSelected);
        node.classList.toggle('border-slate-200', !isSelected);
    });

    if (display) {
        display.textContent = `Pola dipilih: ${hidden.value}`;
        display.classList.remove('text-slate-500');
        display.classList.add('text-cyan-700');
    }
};

window.resetCctvPattern = function (trigger) {
    const root = trigger?.closest('[data-pattern-root]');
    if (!root) return;

    const hidden = root.querySelector('input[name="pola"]');
    const display = root.querySelector('[data-pattern-display]');
    if (!hidden) return;

    hidden.value = '';
    root.querySelectorAll('[data-pattern-cell]').forEach((node) => {
        node.classList.remove('bg-cyan-600', 'text-white', 'border-cyan-600', 'shadow-md');
        node.classList.add('bg-slate-100', 'text-slate-600', 'border-slate-200');
    });

    if (display) {
        display.textContent = 'Pilih urutan pola unlock';
        display.classList.remove('text-cyan-700');
        display.classList.add('text-slate-500');
    }
};

export function initListAkunCctvModule() {
    window.listAkunCctv = {
        node: CCTV_ACCOUNT_NODE,
        fieldsTemplate: getListAkunCctvFieldsTemplate,
        renderTable: renderListAkunCctvTable,
        submit: submitListAkunCctv,
        openEditModal,
        deleteItem: deleteListAkunCctvItem,
        normalizeInput: normalizeCctvAccountInput,
        buildRows: buildListAkunCctvTableRows
    };

    if (window.globalDataCloud && !Array.isArray(window.globalDataCloud[CCTV_ACCOUNT_NODE])) {
        window.globalDataCloud[CCTV_ACCOUNT_NODE] = [];
    }
}

if (typeof window !== 'undefined') {
    window.listAkunCctv = window.listAkunCctv || {};
    window.listAkunCctv.init = initListAkunCctvModule;
    window.listAkunCctv.renderTable = renderListAkunCctvTable;
    window.listAkunCctv.submit = submitListAkunCctv;
    window.listAkunCctv.openEditModal = openEditModal;
    window.listAkunCctv.deleteItem = deleteListAkunCctvItem;
}

export default {
    CCTV_ACCOUNT_NODE,
    getListAkunCctvFieldsTemplate,
    renderListAkunCctvTable,
    submitListAkunCctv,
    openEditModal,
    deleteListAkunCctvItem,
    initListAkunCctvModule
};
