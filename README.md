# CareerMap AI — Deployment Guide
## Real Google OAuth in 15 Minutes

---

## What You Get After Deployment
- ✅ Real Google Sign-In (one click, shows actual Google account)
- ✅ User sessions persist across browser refreshes & tabs
- ✅ User data (plan, history) stored in Firestore per Google account
- ✅ Works on any device — phone, tablet, desktop
- ✅ Free hosting on Firebase / Vercel / Netlify

---

## STEP 1 — Create Firebase Project (5 minutes)

1. Go to **https://console.firebase.google.com**
2. Click **"Create a project"** → Name it `careermap-ai`
3. Disable Google Analytics (optional) → **Create Project**

### Enable Google Sign-In
4. In your project: **Authentication** (left sidebar)
5. Click **"Get started"**
6. Click **Google** → Toggle **Enable** → Enter your email → **Save**

### Create Firestore Database
7. **Firestore Database** (left sidebar) → **Create database**
8. Choose **"Start in production mode"** → Select a region → **Done**

### Get Your Config
9. Click the ⚙️ gear → **Project Settings**
10. Scroll to **"Your apps"** → Click **</>** (Web)
11. Register app name: `careermap-web` → **Register App**
12. Copy the `firebaseConfig` object — you'll need it in Step 3

---

## STEP 2 — Set Up Your Local Project (2 minutes)

```bash
# Clone or download this folder, then:
cd careermap-deploy
npm install
```

---

## STEP 3 — Add Your Config (2 minutes)

Open `src/firebase.js` and replace the placeholder config:

```javascript
// BEFORE (placeholder):
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  ...
};

// AFTER (your real values from Step 1):
const firebaseConfig = {
  apiKey:            "AIzaSyAbc123...",
  authDomain:        "careermap-ai-xyz.firebaseapp.com",
  projectId:         "careermap-ai-xyz",
  storageBucket:     "careermap-ai-xyz.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc123",
};
```

---

## STEP 4 — Add Your App Code (3 minutes)

Open `src/App.jsx`. You'll see comments showing where to paste things.

Copy from your `CareerRoadmap.jsx` artifact:
- The `CAREERS`, `ICONS`, `ALL`, `LEVELS`, `REGIONS` constants
- The `CSS` template literal
- The resilience engine (all the fetch/cache functions)
- The `parseResult` function
- The `generatePDF` function
- The `SubModal`, `NotifToast`, `PrivacyModal` components
- The full JSX from the App component's return statement

Then make these 3 small replacements in the JSX:

```jsx
// 1. Sign out button — REPLACE:
onClick={() => { setUser(null); reset(); }}
// WITH:
onClick={handleSignOut}

// 2. Plan upgrade — REPLACE:
await window.storage.set(`plan_${user?.sub}`, plan, false)
// WITH:
await upgradePlan(plan)

// 3. History save — REPLACE:
await window.storage.set(`hist_${user?.sub}`, JSON.stringify(newHist), false)
// WITH:
await saveHistoryToFirestore(newHist)
```

---

## STEP 5 — Test Locally

```bash
npm start
# Opens http://localhost:3000
# Google login will work because localhost is auto-authorized
```

---

## STEP 6 — Deploy (choose one)

### Option A: Firebase Hosting (Recommended — free, fast)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # Select your project, build folder = "build"
npm run build
firebase deploy
# Your app is live at: https://careermap-ai-xyz.web.app
```

### Option B: Vercel (Easiest)
```bash
npm install -g vercel
vercel
# Follow prompts — done in 60 seconds
# Your app is live at: https://careermap-ai-xyz.vercel.app
```

### Option C: Netlify (Drag & Drop)
```bash
npm run build
# Go to netlify.com → drag the "build" folder onto the page
# Done! You get a URL like https://careermap-ai-xyz.netlify.app
```

---

## STEP 7 — Authorize Your Domain (IMPORTANT)

After deploying, add your domain to Google's allowed list:

1. Go to **https://console.cloud.google.com**
2. Select your project → **APIs & Services → Credentials**
3. Click your **OAuth 2.0 Client ID** (auto-created by Firebase)
4. Under **"Authorized JavaScript origins"**, add:
   ```
   https://your-app.web.app
   https://your-app.firebaseapp.com
   https://your-app.vercel.app    (if using Vercel)
   http://localhost:3000           (for local dev)
   ```
5. Click **Save**

> ⚠️ Without this step, Google will show "Error 400: redirect_uri_mismatch"

---

## STEP 8 — Add Anthropic API Key (Security)

Currently the API key is handled by the Claude artifact environment.
For production, **never expose API keys in frontend code**.

**Recommended approach — Firebase Cloud Functions:**

```bash
firebase init functions
```

```javascript
// functions/index.js
const functions = require("firebase-functions");
const fetch = require("node-fetch");

exports.generateRoadmap = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Login required");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": functions.config().anthropic.key, // stored securely
    },
    body: JSON.stringify(data.body),
  });

  return response.json();
});
```

```bash
# Store API key securely (never in code):
firebase functions:config:set anthropic.key="sk-ant-your-key-here"
firebase deploy --only functions
```

---

## Subscription Payments (Razorpay)

Add Razorpay to the `upgradePlan` function in `App.jsx`:

```javascript
async function upgradePlan(newPlan) {
  const PRICES = { pro: 9900, ultrapro: 19900 }; // paise (₹99, ₹199)

  return new Promise((resolve) => {
    const options = {
      key: "rzp_live_YOUR_KEY_HERE",  // Get from razorpay.com
      amount: PRICES[newPlan],
      currency: "INR",
      name: "CareerMap AI",
      description: newPlan === "pro" ? "Pro Plan" : "Ultra Pro Plan",
      image: "/logo.png",
      prefill: { name: user.name, email: user.email },
      theme: { color: "#7c3aed" },
      handler: async function (response) {
        // Payment successful — verify on backend, then set plan
        await savePlan(user.uid, newPlan);
        setPlan(newPlan);
        setSubOpen(false);
        resolve();
      },
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  });
}
```

Add Razorpay script to `public/index.html`:
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

---

## Project Structure

```
careermap-deploy/
├── public/
│   ├── index.html          ← HTML shell
│   └── logo.png            ← Add your CareerMap logo here
├── src/
│   ├── firebase.js         ← Firebase config + auth helpers (EDIT THIS)
│   ├── AuthScreen.jsx      ← Google Sign-In screen (ready to use)
│   ├── App.jsx             ← Main app (paste your code here)
│   └── index.js            ← Entry point
├── firebase.json           ← Firebase Hosting config
├── firestore.rules         ← Database security rules
├── vercel.json             ← Vercel config
├── netlify.toml            ← Netlify config
└── package.json            ← Dependencies
```

---

## What Changes vs the Artifact

| Artifact Version | Deployed Version |
|---|---|
| `window.storage` (artifact KV) | Firebase Firestore (real database) |
| Email/name fake login | Real Google OAuth via Firebase |
| Session in artifact storage | Firebase Auth (persists automatically) |
| API key in browser | Firebase Cloud Functions (secure) |
| No payment | Razorpay integration |

**Everything else is identical** — CSS, career data, roadmap logic, blur system, subscription UI, PDF generation, notifications.

---

## Support

- Firebase docs: https://firebase.google.com/docs
- Razorpay docs: https://razorpay.com/docs
- Questions: Open an issue or contact your developer

---

*CareerMap AI © 2026 · Built with React + Firebase + Claude AI*
