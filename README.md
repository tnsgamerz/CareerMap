# CareerMap AI — Deployment Guide
## Fix 404 + Deploy with Real Google Login

---

## Why You Got 404 on Vercel

React is a **Single Page App (SPA)** — only `index.html` exists.
When Vercel serves `/some-route`, it looks for a real file that doesn't exist → 404.

The fix is already in the new `vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "framework": "create-react-app",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
This tells Vercel: *"For any URL, serve index.html"* → React handles the routing.

---

## Full Setup in 15 Minutes

### STEP 1 — Create Firebase Project (5 min)

1. Go to **https://console.firebase.google.com**
2. **Add project** → name it `careermap-ai` → Create
3. **Authentication** (left sidebar) → Get started → **Google** → Enable → Save
4. **Firestore Database** → Create database → Production mode → Choose region → Done
5. ⚙️ **Project Settings** → scroll to "Your apps" → click **</>** (Web)
6. Register app: `careermap-web` → you'll see a `firebaseConfig` object → **copy it**

---

### STEP 2 — Add Environment Variables on Vercel (2 min)

> ⚠️ This is the most important step. Without this, your app builds but shows a blank screen or auth errors.

1. Go to your project on **https://vercel.com**
2. **Settings** → **Environment Variables**
3. Add each variable (copy values from your Firebase config):

| Variable Name | Value (from Firebase) |
|---|---|
| `REACT_APP_FIREBASE_API_KEY` | `AIzaSy...` |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `REACT_APP_FIREBASE_PROJECT_ID` | `your-project-id` |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | `123456789` |
| `REACT_APP_FIREBASE_APP_ID` | `1:123:web:abc123` |

4. Make sure **all 3 environments** are checked: Production, Preview, Development
5. Click **Save** for each variable

---

### STEP 3 — Authorize Your Vercel Domain (2 min)

> Without this, Google shows "Error 400: redirect_uri_mismatch"

1. Go to **https://console.cloud.google.com**
2. Select your Firebase project (same name)
3. **APIs & Services** → **Credentials**
4. Click the **OAuth 2.0 Client ID** (auto-created by Firebase Auth)
5. Under **"Authorized JavaScript origins"** click **+ Add URI** and add:
   ```
   https://your-app.vercel.app
   http://localhost:3000
   ```
   *(Replace `your-app` with your actual Vercel URL)*
6. Click **Save** — takes ~5 minutes to propagate

---

### STEP 4 — Add Your CareerMap Code

Open `src/App.jsx`. Paste in from your CareerRoadmap.jsx artifact (in order):

1. The `CAREERS`, `ICONS`, `ALL`, `LEVELS`, `REGIONS` constants
2. The `CSS` template literal (the big string)
3. All resilience engine functions (`SESSION_CACHE`, `IN_FLIGHT`, `fetchForever`, `callAPI`, etc.)
4. The `parseResult` function
5. The `generatePDF` function
6. The `SubModal`, `NotifToast`, `PrivacyModal` components
7. The `NOTIFICATIONS` array and `STEPS` config
8. Inside the `App()` function body — all state, effects, and JSX

Then make these **3 replacements** (search & replace in your editor):

**Replace 1 — sign out:**
```js
// FIND:
onClick={async () => {
  try { await window.storage.delete("cm_session", false); } catch {}
  setUser(null); reset();
}}

// REPLACE WITH:
onClick={handleSignOut}
```

**Replace 2 — upgrade plan:**
```js
// FIND (inside SubModal upgrade function):
setPlan(p);
try { await window.storage.set(`plan_${user?.sub}`, p, false); } catch {}
setSubOpen(false);

// REPLACE WITH:
await upgradePlan(p);
```

**Replace 3 — save history:**
```js
// FIND (inside generate function, after setResult):
await window.storage.set(`hist_${user?.sub}`, JSON.stringify(newHist), false);

// REPLACE WITH:
await saveHistoryToFirestore(newHist);
```

**Remove these** (no longer needed — Firebase handles sessions):
```js
// DELETE these lines from useEffect:
const saved = await window.storage.get("cm_session", false);
const h = await window.storage.get(`hist_${user.sub}`, false);
const p = await window.storage.get(`plan_${user.sub}`, false);
```

---

### STEP 5 — Deploy

**Option A: Redeploy on Vercel (if already connected to GitHub)**
```bash
git add .
git commit -m "fix: add vercel.json, env vars, firebase auth"
git push
# Vercel auto-deploys — done in ~2 minutes
```

**Option B: Deploy via Vercel CLI**
```bash
npm install -g vercel
npm run build
vercel --prod
```

**Option C: Fresh Vercel deploy from GitHub**
1. Push this folder to a GitHub repo
2. Go to vercel.com → **New Project** → Import your repo
3. Framework: **Create React App** (auto-detected)
4. Add the environment variables from Step 2
5. Click **Deploy**

---

### STEP 6 — Test

1. Open your Vercel URL
2. Click **"Continue with Google"**
3. Google popup opens → select your account → redirects back
4. You should be logged in with your real Google name and photo ✅

**If you still see errors:**
- `auth/unauthorized-domain` → You missed Step 3 (add domain to Google Cloud Console)
- Blank page after login → Check browser console for missing env vars
- `400 redirect_uri_mismatch` → Your Vercel URL isn't in authorized origins yet (wait 5 min after adding)

---

## Razorpay Payments (Optional)

Add to `public/index.html`:
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

Replace the `upgradePlan` function in `App.jsx`:
```javascript
async function upgradePlan(newPlan) {
  const PRICES = { pro: 9900, ultrapro: 19900 }; // paise = ₹99, ₹199

  await new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: "rzp_live_YOUR_KEY",       // from razorpay.com dashboard
      amount: PRICES[newPlan],
      currency: "INR",
      name: "CareerMap AI",
      description: newPlan === "pro" ? "Pro Plan — ₹99/month" : "Ultra Pro — ₹199/month",
      image: "/logo.png",
      prefill: { name: user.name, email: user.email },
      theme: { color: "#7c3aed" },
      handler: async (response) => {
        // TODO: Verify payment signature on your backend
        await savePlan(user.uid, newPlan);
        setPlan(newPlan);
        setSubOpen(false);
        resolve();
      },
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    rzp.open();
  });
}
```

---

## Project Files

```
careermap-deploy/
├── public/
│   └── index.html          ← HTML shell
├── src/
│   ├── firebase.js         ← Firebase config (uses env vars) ✅
│   ├── AuthScreen.jsx      ← Real Google Sign-In ✅
│   ├── App.jsx             ← Paste your app code here
│   └── index.js            ← Entry point ✅
├── .env.example            ← Template — copy to .env for local dev
├── .gitignore              ← Keeps .env out of git ✅
├── vercel.json             ← Fixed SPA routing + build config ✅
├── firebase.json           ← Firebase Hosting (alternative to Vercel)
├── firestore.rules         ← DB security rules ✅
├── netlify.toml            ← Netlify alternative ✅
└── package.json            ← Fixed with Node 18+ engine ✅
```

---

*CareerMap AI © 2026 · React + Firebase + Vercel + Claude AI*
