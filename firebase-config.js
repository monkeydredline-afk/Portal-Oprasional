import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, push, onValue, remove, update, get, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getAuth as getAuthSecondary, createUserWithEmailAndPassword as createSecondaryUser, signOut as signOutSecondary } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyColh0-AXgzBs_qIyIX7vj9C7As2KsEQRs",
    authDomain: "teknisi-portal.firebaseapp.com",
    databaseURL: "https://teknisi-portal-default-rtdb.firebaseio.com", 
    projectId: "teknisi-portal",
    storageBucket: "teknisi-portal.firebasestorage.app",
    messagingSenderId: "535247512587",
    appId: "1:535247512587:web:499ccf9a6ae310d6c6930e"
};

let firebaseInitError = null;
let app = null;
let db = null;
let auth = null;
let secondaryAuth = null;

try {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    auth = getAuth(app);

    const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
    secondaryAuth = getAuthSecondary(secondaryApp);
} catch (error) {
    firebaseInitError = error;
    console.error("Gagal menginisialisasi Firebase:", error);
}

export { db, auth, secondaryAuth, firebaseInitError };
export { ref, set, push, onValue, remove, update, get, query, orderByChild, equalTo };

export const firebaseLogin = (email, password) => {
    if (!auth) {
        return Promise.reject(firebaseInitError || new Error("Firebase Auth belum siap."));
    }
    return signInWithEmailAndPassword(auth, email, password);
};

export const firebaseLogout = () => {
    if (!auth) {
        return Promise.resolve();
    }
    return signOut(auth);
};

export const registerAuthUser = async (email, password) => {
    if (!secondaryAuth) {
        throw firebaseInitError || new Error("Firebase Auth belum siap.");
    }
    const userCredential = await createSecondaryUser(secondaryAuth, email, password);
    const uid = userCredential.user.uid;
    await signOutSecondary(secondaryAuth);
    return uid;
};