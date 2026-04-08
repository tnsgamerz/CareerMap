// ─── src/firebase.js ─────────────────────────────────────────────────────────
// Firebase config using environment variables.
// On Vercel: add these in Project Settings → Environment Variables
// Locally: copy .env.example → .env and fill in values
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

const app      = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

// ── Auth helpers ──────────────────────────────────────────────────────────────
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser() {
  await signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── Firestore helpers ─────────────────────────────────────────────────────────
export async function getUserData(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error("getUserData:", e);
    return null;
  }
}

export async function upsertUser(uid, data) {
  try {
    const ref  = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, data);
    } else {
      await setDoc(ref, {
        plan: "free",
        history: [],
        createdAt: Date.now(),
        ...data,
      });
    }
  } catch (e) {
    console.error("upsertUser:", e);
  }
}

export async function saveHistory(uid, historyArray) {
  try {
    await updateDoc(doc(db, "users", uid), { history: historyArray });
  } catch (e) {
    console.error("saveHistory:", e);
  }
}

export async function savePlan(uid, plan) {
  try {
    await updateDoc(doc(db, "users", uid), { plan });
  } catch (e) {
    console.error("savePlan:", e);
  }
}
