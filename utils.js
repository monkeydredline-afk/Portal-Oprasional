/* ==========================================================================
   Teknisi Portal - utils.js (Versi Aman Bebas Galat)
   ========================================================================== */

export function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input || !icon) return;
    
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
    }
}

export function parseDate(dateStr) {
    if (!dateStr) return null;
    const str = String(dateStr).trim();
    const parts = str.split('/');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    const ymdParts = str.split('-');
    if (ymdParts.length === 3 && ymdParts[0].length === 4) {
        return new Date(ymdParts[0], ymdParts[1] - 1, ymdParts[2]);
    }
    const timestamp = Date.parse(str);
    if (!isNaN(timestamp)) {
        return new Date(timestamp);
    }
    return null;
}

export function formatDateForInput(dateStr) {
    if(!dateStr) return '';
    const str = String(dateStr);
    if(str.includes('/')) {
        const parts = str.split('/');
        if(parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${year}-${month}-${day}`;
        }
    }
    return str;
}