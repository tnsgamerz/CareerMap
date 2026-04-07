// ─── src/App.jsx ──────────────────────────────────────────────────────────────
// CareerMap AI — Main App with real Firebase Google Auth
// Drop-in replacement for the Claude artifact version.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from "react";
import AuthScreen from "./AuthScreen";
import {
  onAuthChange,
  signOutUser,
  getUserData,
  upsertUser,
  saveHistory,
  savePlan,
} from "./firebase";

// ─────────────────────────────────────────────────────────────────────────────
// Paste your full CAREERS, ICONS, ALL, LEVELS, REGIONS, CSS, resilience engine,
// parser, generatePDF, SubModal, NotifToast, PrivacyModal, etc. from the
// CareerRoadmap.jsx artifact below this comment.
//
// The ONLY things that change vs the artifact are:
//   1. import AuthScreen from "./AuthScreen"   (above)
//   2. The useEffect for auth (below)
//   3. The sign-out handler (below)
//   4. Replace window.storage calls with Firebase Firestore calls
//
// Everything else — CSS, career data, roadmap logic, blur, subscription UI —
// stays exactly the same.
// ─────────────────────────────────────────────────────────────────────────────

// ... paste your CAREERS, ICONS, ALL, LEVELS, REGIONS here ...
// ... paste CSS const here ...
// ... paste resilience engine here ...
// ... paste parseResult here ...
// ... paste generatePDF here ...
// ... paste SubModal, NotifToast, PrivacyModal here ...

export default function App() {
  const [user,         setUser]         = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true); // true while Firebase checks session
  const [profileOpen,  setProfileOpen]  = useState(false);
  const [histOpen,     setHistOpen]     = useState(false);
  const [subOpen,      setSubOpen]      = useState(false);
  const [privacyOpen,  setPrivacyOpen]  = useState(false);
  const [history,      setHistory]      = useState([]);
  const [plan,         setPlan]         = useState("free");
  const [notifToast,   setNotifToast]   = useState(null);
  const profileRef = useRef(null);

  // ── Firebase Auth listener ─────────────────────────────────────────────────
  // This runs once on mount. Firebase automatically restores the session
  // from the browser's IndexedDB — user stays logged in across tabs & refreshes.
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in — load their Firestore data
        const userData = await getUserData(firebaseUser.uid);

        const normalizedUser = {
          name:    firebaseUser.displayName || firebaseUser.email,
          email:   firebaseUser.email,
          picture: firebaseUser.photoURL || "",
          sub:     firebaseUser.uid,
          uid:     firebaseUser.uid,
        };

        if (userData) {
          setHistory(userData.history || []);
          setPlan(userData.plan || "free");
        } else {
          // First time login — create their Firestore document
          await upsertUser(firebaseUser.uid, {
            name:    normalizedUser.name,
            email:   normalizedUser.email,
            picture: normalizedUser.picture,
            plan:    "free",
            history: [],
          });
        }

        setUser(normalizedUser);
      } else {
        // User is signed out
        setUser(null);
        setHistory([]);
        setPlan("free");
      }
      setAuthLoading(false);
    });

    return () => unsubscribe(); // cleanup listener on unmount
  }, []);

  // ── Handle login from AuthScreen ───────────────────────────────────────────
  async function handleLogin(normalizedUser) {
    // Load Firestore data for this user
    const userData = await getUserData(normalizedUser.uid);
    if (userData) {
      setHistory(userData.history || []);
      setPlan(userData.plan || "free");
    } else {
      await upsertUser(normalizedUser.uid, {
        name:    normalizedUser.name,
        email:   normalizedUser.email,
        picture: normalizedUser.picture,
        plan:    "free",
        history: [],
      });
    }
    setUser(normalizedUser);
  }

  // ── Sign out ───────────────────────────────────────────────────────────────
  async function handleSignOut() {
    setProfileOpen(false);
    await signOutUser(); // Firebase handles clearing the session
    // onAuthChange listener above will set user to null automatically
    reset();
  }

  // ── Save history to Firestore (called after roadmap generated) ─────────────
  async function saveHistoryToFirestore(newHistory) {
    if (user?.uid) {
      setHistory(newHistory);
      await saveHistory(user.uid, newHistory);
    }
  }

  // ── Upgrade plan (connect to Razorpay/Stripe in production) ───────────────
  async function upgradePlan(newPlan) {
    // TODO: Open Razorpay/Stripe checkout here before setting plan
    // Example with Razorpay:
    //   const options = { key: "rzp_live_xxx", amount: 9900, currency: "INR", ... };
    //   const rzp = new window.Razorpay(options);
    //   rzp.open();
    //   rzp.on("payment.success", async () => { ... set plan ... });

    setPlan(newPlan);
    if (user?.uid) await savePlan(user.uid, newPlan);
    setSubOpen(false);
  }

  // ── Show loading spinner while Firebase restores session ───────────────────
  if (authLoading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#09090f",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          border: "3px solid #252540", borderTopColor: "#8b5cf6",
          animation: "spin .75s linear infinite",
        }} />
        <div style={{ color: "#7a7898", fontSize: 13 }}>Loading CareerMap…</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  // ── Main app (same JSX as artifact, just with handleSignOut + upgradePlan) ─
  // Replace all window.storage.set/get calls with saveHistoryToFirestore()
  // and upgradePlan() as shown above.
  return (
    <div>
      {/* Your full app JSX goes here — paste from CareerRoadmap.jsx */}
      {/* Replace: onClick={() => { setUser(null); reset(); }}  */}
      {/* With:    onClick={handleSignOut}                       */}
      {/* Replace: window.storage.set(`plan_${user.sub}`, plan) */}
      {/* With:    upgradePlan(newPlan)                          */}
    </div>
  );
}
