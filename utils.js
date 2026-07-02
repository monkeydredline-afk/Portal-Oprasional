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
    const str = String(dateStr); // Memaksa konversi ke String agar aman
    const parts = str.split('/');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return new Date(str); 
}

export function formatDateForInput(dateStr) {
    if(!dateStr) return '';
    const str = String(dateStr); // Memaksa konversi ke String agar aman dari Number
    if(str.includes('/')) {
        const parts = str.split('/');
        if(parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return str;
}