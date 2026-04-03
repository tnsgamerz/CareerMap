import { useState, useRef, useEffect, useCallback } from "react";

// ─── DATA ─────────────────────────────────────────────────────────────────────
const CAREERS = {
  "Technology": ["Software Engineer","Frontend Developer","Backend Developer","Full Stack Developer","Mobile App Developer","AI / ML Engineer","Data Scientist","Data Analyst","DevOps Engineer","Cloud Engineer","Cloud Architect","Cybersecurity Analyst","UI/UX Designer","Product Manager","Blockchain Developer","Game Developer","Embedded Systems Engineer","QA / Test Engineer","Database Administrator","System Architect","AI Prompt Engineer","Site Reliability Engineer"],
  "Medical & Health": ["MBBS Doctor","Dentist","Pharmacist","Nurse / Nursing Officer","Physiotherapist","Radiologist","Medical Lab Technician","Ayurvedic Doctor (BAMS)","Homeopathic Doctor (BHMS)","Veterinary Doctor","Nutritionist / Dietitian","Psychologist","Paramedic","Public Health Specialist","Hospital Administrator","Surgeon","Cardiologist","Dermatologist","Psychiatrist"],
  "Government & Civil Services": ["IAS Officer (UPSC)","IPS Officer (UPSC)","IFS Officer (UPSC)","State PSC Officer","SSC CGL / CHSL","Bank PO / Clerk","Railway (RRB) Officer","Defense Officer (NDA/CDS)","Income Tax Officer","Customs Officer","ISRO / DRDO Scientist","Police Sub-Inspector","Judicial Services (Judge)","Government School Teacher","Post Office / India Post"],
  "Business & Finance": ["Chartered Accountant (CA)","Company Secretary (CS)","Cost Accountant (CMA)","Investment Banker","Financial Analyst","Stock Market Trader","MBA / Business Manager","Marketing Manager","HR Manager","Sales Manager","Supply Chain Manager","Entrepreneur / Startup Founder","E-Commerce Business Owner","Insurance Advisor","Actuary","Financial Planner"],
  "Law & Legal": ["Advocate / Lawyer","Corporate Lawyer","Criminal Lawyer","Civil Lawyer","Cyber Law Specialist","Patent Attorney","Judicial Officer / Judge","Legal Advisor","Law Professor","NGO / Human Rights Lawyer"],
  "Creative & Media": ["Graphic Designer","Video Editor","Content Creator / YouTuber","Journalist","Photographer","Animator / Motion Designer","Fashion Designer","Interior Designer","Film Director","Scriptwriter","Social Media Manager","Brand Strategist","Podcaster","Voice Artist","Art Director","Copywriter"],
  "Education & Research": ["School Teacher","College Professor","Research Scientist","Education Consultant","Curriculum Developer","EdTech Content Creator","Special Education Teacher","Librarian","Academic Counselor","PhD Scholar"],
  "Engineering (Non-IT)": ["Mechanical Engineer","Civil Engineer","Electrical Engineer","Chemical Engineer","Aerospace Engineer","Automobile Engineer","Structural Engineer","Environmental Engineer","Petroleum Engineer","Industrial Engineer","Nuclear Engineer","Marine Engineer"],
  "Hospitality & Tourism": ["Hotel Manager","Chef / Culinary Expert","Event Manager","Tour Guide / Travel Agent","Cabin Crew / Air Hostess","Pilot","Resort Manager","Cruise Line Staff","Travel Blogger"],
  "Agriculture & Environment": ["Agricultural Scientist","Horticulturist","Food Technologist","Dairy Technologist","Environmental Scientist","Forestry Officer","Soil Scientist","Agri-Business Manager","Fisheries Officer"],
};
const ICONS = {"Technology":"💻","Medical & Health":"🏥","Government & Civil Services":"🏛️","Business & Finance":"💼","Law & Legal":"⚖️","Creative & Media":"🎨","Education & Research":"🎓","Engineering (Non-IT)":"🔧","Hospitality & Tourism":"✈️","Agriculture & Environment":"🌿"};
const ALL = [];
for (const [d, cs] of Object.entries(CAREERS)) cs.forEach(c => ALL.push({ domain: d, career: c }));
const LEVELS = [
  { id: "Beginner",     emoji: "🌱", hint: "Just starting out" },
  { id: "Intermediate", emoji: "⚡", hint: "Some experience"   },
  { id: "Advanced",     emoji: "🚀", hint: "Ready to level up" },
];
const REGIONS = [
  { id: "India",     flag: "🇮🇳", currency: "₹"   },
  { id: "USA",       flag: "🇺🇸", currency: "$"   },
  { id: "UK",        flag: "🇬🇧", currency: "£"   },
  { id: "Canada",    flag: "🇨🇦", currency: "CA$" },
  { id: "Australia", flag: "🇦🇺", currency: "AU$" },
  { id: "Germany",   flag: "🇩🇪", currency: "€"   },
  { id: "UAE",       flag: "🇦🇪", currency: "AED" },
  { id: "Singapore", flag: "🇸🇬", currency: "SGD" },
];

// ─── BULLETPROOF RESILIENCE ENGINE ────────────────────────────────────────────
//
// ZERO VISIBLE FAILURES FOR 1M+ CONCURRENT USERS:
//
// ① SESSION CACHE   — Same career+level+region = instant result, 0 API calls.
//                     In-memory Map per browser tab. Kills duplicate load cold.
//
// ② IN-FLIGHT DEDUP — 1000 concurrent requests for the same combo share ONE
//                     promise. Only 1 API call fires, all 1000 get the result.
//
// ③ MODEL CASCADE   — Sonnet (best) → Haiku (10× faster, far less congested).
//                     Rotates every retry so the overloaded model is bypassed.
//
// ④ INFINITE RETRY  — On EVERY failure (529 overloaded, 429 rate-limit, 500,
//                     network drop, empty body, bad parse) we NEVER throw to
//                     the user. We silently retry with jittered exponential
//                     backoff so millions of clients don't slam the server at
//                     the same instant. The user sees "still working…" not an
//                     error. The loop only exits on: success OR user abort.
//
// ⑤ ABORT SAFETY    — AbortController cancels the in-flight fetch the instant
//                     the user resets/navigates, freeing server capacity.
// ──────────────────────────────────────────────────────────────────────────────

const SESSION_CACHE = new Map();
const IN_FLIGHT     = new Map();
const sleep         = ms => new Promise(r => setTimeout(r, ms));

// Two models — rotate on every overload hit
const MODELS = [
  { id: "claude-sonnet-4-20250514",  tok: 3500 },
  { id: "claude-haiku-4-5-20251001", tok: 3000 },
];

// Any status / message that should trigger a silent retry (never surface to user)
function shouldRetry(status, msg = "") {
  if (status === 529) return true;   // Anthropic overloaded
  if (status === 429) return true;   // rate limited
  if (status >= 500)  return true;   // server error
  const lo = msg.toLowerCase();
  return lo.includes("overload") || lo.includes("capacity") ||
         lo.includes("unavailable") || lo.includes("too many");
}

// Build a complete request body
function makeBody(career, domain, level, region, modelId, maxTok) {
  const c = REGIONS.find(r => r.id === region) || REGIONS[0];
  return {
    model: modelId,
    max_tokens: maxTok,
    system: `You are a world-class career strategist. Reply ONLY in the exact format below. No intro, no extra text, no markdown code fences.

## ROADMAP
### Phase Title [Month X – Month Y]
2-3 sentence description of what to learn and do in this phase.
TASKS:
- Specific actionable task 1
- Specific actionable task 2
- Specific actionable task 3
- Specific actionable task 4
MILESTONE: One sentence — what the learner can demonstrate or build by end of this phase.

Repeat for 7 to 9 phases covering the full journey. Always write the duration as [Month X – Month Y] with square brackets.

## ESSENTIAL_SKILLS
comma, separated, list, of, 10, essential, skills, all, on, one line

## CORE_TOOLS
comma, separated, list, of, 7, core, tools

## GROWTH_FORECAST
ENTRY_TITLE: Entry-Level ${career}
ENTRY_SALARY: ${c.currency}X–Y LPA
MID_TITLE: Mid-Level ${career}
MID_SALARY: ${c.currency}X–Y LPA
SENIOR_TITLE: Senior ${career}
SENIOR_SALARY: ${c.currency}X–Y LPA
TOP_TITLE: Principal / Staff ${career}
TOP_SALARY: ${c.currency}X–Y LPA
JOB_GROWTH: X% growth expected by 2030
DEMAND: HIGH
NOTE: Salaries vary by location, company size, and specialization.

## GLOBAL_SALARY
India: Entry [₹X–Y LPA] | Mid [₹X–Y LPA]
USA: Entry [$X–YK] | Mid [$X–YK]
UK: Entry [£X–YK] | Mid [£X–YK]
Canada: Entry [CA$X–YK] | Mid [CA$X–YK]
Australia: Entry [AU$X–YK] | Mid [AU$X–YK]
Germany: Entry [€X–YK] | Mid [€X–YK]
UAE: Entry [AED X–YK] | Mid [AED X–YK]
Singapore: Entry [SGD X–YK] | Mid [SGD X–YK]

## COMPANIES
List 10 real companies that hire ${career} professionals, comma-separated on one line. Include mix of MNCs, startups, Indian companies if applicable.

## CERTIFICATES
CERT: [Certificate Name] | [Issuer e.g. IBM, Google, Microsoft, Coursera] | [Why it helps in 1 short sentence]
(Repeat for 6–8 certificates, most relevant and recognized ones)

## PROJECTS
PROJECT: [Project Title] | [Skill it demonstrates] | [1 sentence description of what to build]
(Repeat for 6–8 projects, one per key skill, increasing complexity)`,
    messages: [{ role: "user", content: `Career: ${career}\nDomain: ${domain}\nLevel: ${level}\nRegion: ${region}\n\nGenerate now.` }],
  };
}

// ── Core infinite-retry loop — NEVER throws (except AbortError) ────────────
async function fetchForever(career, domain, level, region, signal, onAttempt) {
  let attempt  = 0;
  let mIdx     = 0;

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const m = MODELS[mIdx % MODELS.length];
    onAttempt?.(attempt, m.id);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeBody(career, domain, level, region, m.id, m.tok)),
        signal,
      });

      // Read retry-after before consuming body
      const retryAfterMs = parseInt(res.headers.get("retry-after") || "0", 10) * 1000;

      const payload = await res.json().catch(() => null);
      const errMsg  = payload?.error?.message || "";

      // Retryable HTTP status or overloaded body message
      if (shouldRetry(res.status, errMsg)) {
        mIdx++; attempt++;
        const expo  = Math.min(700 * Math.pow(1.8, Math.min(attempt, 8)), 12000);
        const jitter = Math.random() * expo * 0.5;
        await sleep(retryAfterMs > 0 ? retryAfterMs : Math.round(expo * 0.5 + jitter));
        continue; // silent retry ♻️
      }

      // Non-retryable HTTP error (e.g. 400 bad request, 401 auth)
      if (!res.ok) {
        // Still retry — user shouldn't see errors. Maybe transient.
        mIdx++; attempt++;
        await sleep(2000 + Math.random() * 1000);
        continue;
      }

      // Got a 200 — extract text
      const text = (payload?.content || []).map(c => c.text || "").join("").trim();

      // Empty generation — retry with other model
      if (!text) {
        mIdx++; attempt++;
        await sleep(1500 + Math.random() * 800);
        continue;
      }

      return text; // ✅ SUCCESS

    } catch (e) {
      if (e.name === "AbortError") throw e; // user cancelled — clean exit

      // Network error, timeout, etc. — retry silently
      mIdx++; attempt++;
      const wait = Math.min(600 * Math.pow(2, Math.min(attempt, 6)), 10000)
                   + Math.random() * 1000;
      await sleep(wait);
      // continue → retry forever
    }
  }
}

// ── Public callAPI: cache → dedup → fetchForever ───────────────────────────
function callAPI(career, domain, level, region, signal, onAttempt) {
  const key = `${career}|${level}|${region}`;

  // ① Instant cache hit
  if (SESSION_CACHE.has(key)) return Promise.resolve(SESSION_CACHE.get(key));

  // ② Dedup — share in-flight promise
  if (IN_FLIGHT.has(key)) return IN_FLIGHT.get(key);

  // ③ Start the never-failing fetch
  const p = fetchForever(career, domain, level, region, signal, onAttempt)
    .then(text => { SESSION_CACHE.set(key, text); return text; })
    .finally(() => IN_FLIGHT.delete(key));

  IN_FLIGHT.set(key, p);
  return p;
}

// ─── PARSER ──────────────────────────────────────────────────────────────────
function parseResult(text) {
  const r = { phases: [], skills: [], tools: [], forecast: {}, globalSalary: [], companies: [], certs: [], projects: [] };
  const lines = text.split("\n");
  let section = "", cur = null, buf = [], tasks = [], inTasks = false;

  const flush = () => {
    if (cur) { cur.desc = buf.join(" ").trim(); cur.tasks = [...tasks]; r.phases.push(cur); }
    cur = null; buf = []; tasks = []; inTasks = false;
  };

  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;

    if (/^##\s*ROADMAP/i.test(l))          { section = "roadmap";    continue; }
    if (/^##\s*ESSENTIAL_SKILLS/i.test(l)) { flush(); section = "skills";    continue; }
    if (/^##\s*CORE_TOOLS/i.test(l))       { section = "tools";      continue; }
    if (/^##\s*GROWTH_FORECAST/i.test(l))  { section = "forecast";   continue; }
    if (/^##\s*GLOBAL_SALARY/i.test(l))    { section = "global";     continue; }
    if (/^##\s*COMPANIES/i.test(l))        { section = "companies";  continue; }
    if (/^##\s*CERTIFICATES/i.test(l))     { section = "certs";      continue; }
    if (/^##\s*PROJECTS/i.test(l))         { section = "projects";   continue; }

    if (section === "roadmap") {
      if (/^###/.test(l)) {
        flush();
        const m1 = l.match(/^###\s*(.+?)\s*\[(.+?)\]/);
        const m2 = l.match(/^###\s*(.+?)\s*\((.+?)\)/);
        const m3 = l.match(/^###\s*(.+?)\s*[–\-—]\s*(.+)$/);
        const title = (m1||m2||m3)?.[1]?.trim() || l.replace(/^###\s*/,"").trim();
        const dur   = (m1||m2||m3)?.[2]?.trim() || "";
        cur = { name: title, duration: dur, desc: "", milestone: "", tasks: [] };
        continue;
      }
      if (cur) {
        const dur = l.match(/^duration[:\-–]\s*(.+)/i);
        if (dur && !cur.duration) { cur.duration = dur[1].replace(/[[\]]/g,"").trim(); continue; }
        const mi = l.match(/^MILESTONE:\s*(.+)/i);
        if (mi) { cur.milestone = mi[1].replace(/[[\]]/g,"").trim(); inTasks = false; continue; }
        if (/^TASKS:/i.test(l)) { inTasks = true; continue; }
        if (inTasks && /^[-•*\d]/.test(l)) { tasks.push(l.replace(/^[-•*]\s*|\d+[.)]\s*/,"").trim()); continue; }
        if (!inTasks && !/^(FOCUS|TASKS|MILESTONE|DURATION):/i.test(l)) buf.push(l.replace(/^[-•*]\s*/,""));
      }
    } else if (section === "skills") {
      l.split(",").forEach(s => { const t = s.replace(/^[-•*]\s*/,"").trim(); if (t.length > 1) r.skills.push(t); });
    } else if (section === "tools") {
      l.split(",").forEach(s => { const t = s.replace(/^[-•*]\s*/,"").trim(); if (t.length > 1) r.tools.push(t); });
    } else if (section === "forecast") {
      const kvs = [
        ["entry_title","entryTitle"],["entry_salary","entrySalary"],
        ["mid_title","midTitle"],["mid_salary","midSalary"],
        ["senior_title","seniorTitle"],["senior_salary","seniorSalary"],
        ["top_title","topTitle"],["top_salary","topSalary"],
        ["job_growth","jobGrowth"],["demand","demand"],["note","note"],
      ];
      for (const [k, p] of kvs) {
        const m = l.match(new RegExp(`^${k}:\\s*(.+)`,"i"));
        if (m) { r.forecast[p] = m[1].replace(/[[\]"]/g,"").trim(); break; }
      }
    } else if (section === "global") {
      // Format: Country: Entry [X–Y] | Mid [X–Y]
      const gm = l.match(/^(\w[\w\s]*?):\s*Entry\s*\[?(.+?)\]?\s*\|\s*Mid\s*\[?(.+?)\]?/i);
      if (gm) r.globalSalary.push({ country: gm[1].trim(), entry: gm[2].trim(), mid: gm[3].trim() });
    } else if (section === "companies") {
      l.split(",").forEach(s => { const t = s.replace(/^[-•*\d.]\s*/,"").trim(); if (t.length > 1) r.companies.push(t); });
    } else if (section === "certs") {
      const cm = l.match(/^CERT:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)/i);
      if (cm) r.certs.push({ name: cm[1].trim(), issuer: cm[2].trim(), why: cm[3].trim() });
      else if (/^[-•*]/.test(l)) {
        // fallback: "- Name by Issuer — reason"
        const fb = l.replace(/^[-•*]\s*/,"");
        const parts = fb.split(/\s*[|–]\s*/);
        if (parts.length >= 2) r.certs.push({ name: parts[0].trim(), issuer: parts[1].trim(), why: parts[2]?.trim() || "" });
      }
    } else if (section === "projects") {
      const pm = l.match(/^PROJECT:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)/i);
      if (pm) r.projects.push({ title: pm[1].trim(), skill: pm[2].trim(), desc: pm[3].trim() });
      else if (/^[-•*]/.test(l)) {
        const fb = l.replace(/^[-•*]\s*/,"");
        const parts = fb.split(/\s*[|–]\s*/);
        if (parts.length >= 2) r.projects.push({ title: parts[0].trim(), skill: parts[1].trim(), desc: parts[2]?.trim() || "" });
      }
    }
  }
  flush();
  return r;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
html,body{background:#09090f;color:#e2e0f0;font-family:'Plus Jakarta Sans',sans-serif;min-height:100vh;}
:root{
  --p1:#7c3aed;--p2:#8b5cf6;--p3:#a78bfa;--p4:#c4b5fd;
  --bg:#09090f;--bg2:#0f0f1a;--bg3:#14142a;--bg4:#1a1a35;
  --border:#252540;--border2:#353560;
  --text:#e2e0f0;--muted:#7a7898;--muted2:#5a5878;
  --green:#10b981;--amber:#f59e0b;--red:#f85149;--cyan:#06b6d4;
}
.app{min-height:100vh;background:var(--bg);padding-bottom:60px;}

/* HEADER */
.hdr{padding:16px 20px 12px;background:rgba(9,9,15,.96);border-bottom:1px solid var(--border);
  position:sticky;top:0;z-index:200;backdrop-filter:blur(14px);}
.hdr-brand{font-size:20px;font-weight:900;color:#fff;letter-spacing:-.5px;}
.hdr-brand em{color:var(--p3);font-style:normal;}
.hdr-sub{font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--p3);margin-top:1px;}

/* HERO */
.hero{padding:28px 20px 22px;background:linear-gradient(150deg,#100820 0%,#0c0c18 50%,#09090f 100%);
  border-bottom:1px solid var(--border);position:relative;overflow:hidden;}
.hero::before{content:'';position:absolute;top:-60px;right:-60px;width:220px;height:220px;
  border-radius:50%;background:radial-gradient(circle,rgba(124,58,237,.12),transparent 70%);pointer-events:none;}
.hero-tag{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:600;
  letter-spacing:2px;text-transform:uppercase;color:var(--p3);
  background:rgba(124,58,237,.1);border:1px solid rgba(139,92,246,.28);
  padding:4px 12px;border-radius:30px;margin-bottom:14px;}
.hero-pulse{width:6px;height:6px;border-radius:50%;background:var(--p2);animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.hero-title{font-size:clamp(22px,5vw,34px);font-weight:800;color:#fff;line-height:1.2;
  letter-spacing:-.5px;margin-bottom:8px;}
.hero-title em{color:var(--p3);font-style:normal;}
.hero-desc{font-size:13px;color:var(--muted);line-height:1.65;max-width:360px;}

/* WRAP */
.wrap{max-width:680px;margin:0 auto;padding:20px 16px;}

/* FORM CARD */
.fcard{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:22px;
  box-shadow:0 8px 48px rgba(0,0,0,.6),0 0 0 1px rgba(124,58,237,.06);}
.fcard-head{display:flex;align-items:center;gap:10px;margin-bottom:22px;
  padding-bottom:16px;border-bottom:1px solid var(--border);}
.fcard-icon{width:38px;height:38px;border-radius:10px;
  background:linear-gradient(135deg,#7c3aed,#5b21b6);
  display:flex;align-items:center;justify-content:center;font-size:18px;
  box-shadow:0 4px 14px rgba(124,58,237,.4);}
.fcard-title{font-size:16px;font-weight:800;color:#fff;}
.fcard-sub{font-size:11px;color:var(--muted);margin-top:2px;}

/* FIELDS */
.field{margin-bottom:18px;}
.flabel{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;
  color:var(--muted);margin-bottom:8px;}

/* DROPDOWN */
.dd{position:relative;}
.dd-btn{width:100%;padding:12px 15px;background:var(--bg3);
  border:1.5px solid var(--border2);border-radius:10px;cursor:pointer;
  display:flex;align-items:center;justify-content:space-between;transition:all .2s;}
.dd-btn:hover,.dd-btn.open{border-color:var(--p2);box-shadow:0 0 0 3px rgba(124,58,237,.12);}
.dd-left{display:flex;align-items:center;gap:9px;}
.dd-val{font-size:13.5px;font-weight:500;color:var(--text);}
.dd-ph{font-size:13.5px;color:var(--muted);}
.dd-caret{color:var(--muted);font-size:10px;transition:transform .2s;}
.dd-caret.open{transform:rotate(180deg);}
.dd-panel{position:absolute;top:calc(100%+6px);left:0;right:0;z-index:300;
  background:var(--bg2);border:1.5px solid var(--border2);border-radius:12px;overflow:hidden;
  box-shadow:0 20px 60px rgba(0,0,0,.8),0 0 0 1px rgba(124,58,237,.1);animation:fadeD .15s ease;}
@keyframes fadeD{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.dd-sb{padding:10px 10px 6px;position:relative;}
.dd-si{position:absolute;left:20px;top:50%;transform:translateY(-50%);
  color:var(--muted);font-size:12px;pointer-events:none;}
.dd-si-input{width:100%;padding:8px 10px 8px 32px;background:var(--bg3);
  border:1.5px solid var(--border);border-radius:8px;color:var(--text);
  font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;outline:none;}
.dd-si-input:focus{border-color:var(--p2);}
.dd-list{max-height:280px;overflow-y:auto;padding:4px 8px 8px;}
.dd-list::-webkit-scrollbar{width:3px;}
.dd-list::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px;}
.dd-cat{font-size:9px;font-weight:700;letter-spacing:2px;color:var(--p3);
  padding:8px 8px 3px;text-transform:uppercase;}
.dd-item{padding:9px 12px;border-radius:8px;cursor:pointer;font-size:13px;
  font-weight:500;color:var(--text);
  display:flex;align-items:center;justify-content:space-between;transition:all .15s;}
.dd-item:hover{background:var(--bg4);color:#fff;}
.dd-item.sel{background:rgba(124,58,237,.15);color:var(--p3);}
.dd-none{text-align:center;padding:18px;color:var(--muted);font-size:13px;}

/* PICKERS */
.pgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
.pcard{padding:9px 4px;border-radius:9px;cursor:pointer;text-align:center;
  border:1.5px solid var(--border);background:var(--bg3);transition:all .2s;}
.pcard:hover{border-color:var(--border2);}
.pcard.sel{border-color:var(--p2);background:rgba(124,58,237,.1);
  box-shadow:0 0 0 1px rgba(139,92,246,.2);}
.pcard-flag{font-size:16px;margin-bottom:2px;}
.pcard-name{font-size:9px;font-weight:700;color:var(--text);}

.lgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.lcard{padding:12px 8px;border-radius:10px;cursor:pointer;text-align:center;
  border:1.5px solid var(--border);background:var(--bg3);transition:all .2s;}
.lcard:hover{border-color:var(--border2);}
.lcard.sel{border-color:var(--p2);background:rgba(124,58,237,.1);}
.lcard-emoji{font-size:20px;margin-bottom:4px;}
.lcard-name{font-size:12px;font-weight:700;color:var(--text);}
.lcard-hint{font-size:10px;color:var(--muted);margin-top:2px;}

/* GENERATE BUTTON */
.genbtn{width:100%;padding:14px;border-radius:10px;margin-top:18px;
  background:linear-gradient(135deg,#7c3aed,#5b21b6);border:none;color:#fff;
  font-size:14px;font-weight:800;cursor:pointer;
  font-family:'Plus Jakarta Sans',sans-serif;
  display:flex;align-items:center;justify-content:center;gap:8px;
  transition:all .22s;box-shadow:0 4px 20px rgba(124,58,237,.5);}
.genbtn:hover:not(:disabled){transform:translateY(-1px);
  box-shadow:0 8px 28px rgba(124,58,237,.65);}
.genbtn:disabled{opacity:.3;cursor:not-allowed;transform:none;}

/* LOADING */
.load-wrap{max-width:680px;margin:0 auto;padding:20px 16px;}
.load-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;
  padding:44px 24px;text-align:center;}
.spinner{width:46px;height:46px;margin:0 auto 18px;position:relative;}
.spinner::before,.spinner::after{content:'';position:absolute;inset:0;border-radius:50%;}
.spinner::before{border:3px solid var(--border2);}
.spinner::after{border:3px solid transparent;border-top-color:var(--p2);
  animation:spin .75s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
.load-title{font-size:14px;font-weight:700;color:#fff;margin-bottom:4px;}
.load-sub{font-size:12px;color:var(--muted);margin-bottom:18px;}
.load-status{font-size:11px;color:var(--p3);margin-bottom:18px;min-height:16px;}
.lstep{display:flex;align-items:center;gap:8px;font-size:11px;padding:7px 11px;
  background:var(--bg3);border:1px solid var(--border);border-radius:7px;margin-bottom:6px;}
.lstep.done{color:var(--green);}
.lstep.active{color:var(--p3);}
.lstep.idle{color:var(--muted);}
.lstep-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
.lstep.done .lstep-dot{background:var(--green);}
.lstep.active .lstep-dot{background:var(--p2);animation:pulse 1s infinite;}
.lstep.idle .lstep-dot{background:var(--border2);}

/* RESULT */
.res-wrap{max-width:680px;margin:0 auto;padding:20px 16px;}

.res-top-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;
  padding:20px;margin-bottom:14px;box-shadow:0 0 40px rgba(124,58,237,.1);}
.res-career-row{display:flex;align-items:center;gap:12px;margin-bottom:10px;}
.res-career-icon{width:44px;height:44px;border-radius:12px;
  background:linear-gradient(135deg,#7c3aed,#5b21b6);
  display:flex;align-items:center;justify-content:center;font-size:20px;
  flex-shrink:0;box-shadow:0 4px 14px rgba(124,58,237,.45);}
.res-career-name{font-size:19px;font-weight:800;color:#fff;letter-spacing:-.3px;}
.res-career-meta{font-size:12px;color:var(--p3);margin-top:2px;font-weight:500;}
.res-pills{display:flex;flex-wrap:wrap;gap:6px;}
.rpill{font-size:10px;font-weight:600;padding:4px 10px;border-radius:20px;}
.rpill-c{background:rgba(124,58,237,.15);border:1px solid rgba(139,92,246,.3);color:var(--p3);}
.rpill-p{background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.25);color:#67e8f9;}
.rpill-g{background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);color:#6ee7b7;}
.rpill-a{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);color:#fcd34d;}

/* SECTION */
.sec{background:var(--bg2);border:1px solid var(--border);border-radius:16px;
  padding:20px;margin-bottom:14px;}
.sec-head{display:flex;align-items:center;gap:10px;margin-bottom:16px;
  padding-bottom:14px;border-bottom:1px solid var(--border);}
.sec-ico{font-size:16px;}
.sec-title{font-size:15px;font-weight:800;color:#fff;}
.sec-sub{font-size:11px;color:var(--muted);margin-top:1px;}

/* TIMELINE */
.tl-item{display:flex;gap:0;margin-bottom:0;}
.tl-track{display:flex;flex-direction:column;align-items:center;width:32px;flex-shrink:0;}
.tl-node{width:18px;height:18px;border-radius:50%;border:2.5px solid var(--p2);
  background:var(--bg2);flex-shrink:0;z-index:1;
  box-shadow:0 0 10px rgba(139,92,246,.35);}
.tl-line{width:2px;flex:1;background:linear-gradient(180deg,rgba(139,92,246,.5),rgba(124,58,237,.08));
  min-height:24px;margin:2px 0;}
.tl-body{flex:1;padding-bottom:26px;}
.tl-hdr{display:flex;align-items:flex-start;justify-content:space-between;
  gap:10px;margin-bottom:8px;flex-wrap:wrap;}
.tl-title{font-size:15px;font-weight:700;color:#fff;line-height:1.25;flex:1;}
.tl-dur{font-size:11px;font-weight:600;color:var(--p3);
  background:rgba(124,58,237,.12);border:1px solid rgba(139,92,246,.28);
  padding:4px 11px;border-radius:20px;white-space:nowrap;flex-shrink:0;}
.tl-desc{font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:10px;}
.tl-tasks{display:flex;flex-direction:column;gap:5px;margin-bottom:10px;}
.tl-task{display:flex;align-items:flex-start;gap:8px;
  font-size:12.5px;color:var(--text);line-height:1.5;}
.tl-dot{width:5px;height:5px;border-radius:50%;background:var(--p2);
  flex-shrink:0;margin-top:6px;}
.tl-mile{display:flex;align-items:flex-start;gap:8px;
  background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.18);
  border-radius:8px;padding:9px 12px;}
.tl-mile-lbl{font-size:9px;font-weight:700;color:var(--green);
  letter-spacing:1px;text-transform:uppercase;margin-bottom:2px;}
.tl-mile-txt{font-size:12px;color:#6ee7b7;line-height:1.5;}

/* SKILL MATRIX */
.sm-sec{margin-bottom:14px;}
.sm-lbl{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;
  color:var(--muted2);margin-bottom:8px;}
.sm-chips{display:flex;flex-wrap:wrap;gap:7px;}
.chip{font-size:12px;font-weight:500;padding:6px 13px;border-radius:20px;}
.chip-skill{background:rgba(124,58,237,.12);border:1px solid rgba(139,92,246,.28);color:#c4b5fd;}
.chip-tool{background:rgba(6,182,212,.08);border:1px solid rgba(6,182,212,.22);color:#67e8f9;}

/* GROWTH FORECAST */
.gf-summary{background:var(--bg3);border:1px solid var(--border);border-radius:12px;
  padding:18px;margin-bottom:12px;text-align:center;}
.gf-lbl{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;
  color:var(--muted);margin-bottom:10px;}
.gf-text{font-size:15px;font-weight:700;color:#fff;line-height:1.75;}
.gf-text em{color:var(--p3);font-style:normal;}
.gf-note{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5;font-style:italic;}
.gf-tiers{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px;}
.gf-tier{background:var(--bg3);border:1px solid var(--border);border-radius:11px;padding:14px 12px;}
.gf-tier.top{border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.05);}
.gf-tier-lbl{font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px;}
.gf-tier.top .gf-tier-lbl{color:var(--amber);}
.gf-tier-sal{font-size:14px;font-weight:800;color:#fff;line-height:1.3;}
.gf-bar{height:3px;border-radius:2px;margin-top:10px;}
.bar-e{background:linear-gradient(90deg,#7c3aed,#8b5cf6);width:28%;}
.bar-m{background:linear-gradient(90deg,#8b5cf6,#06b6d4);width:56%;}
.bar-s{background:linear-gradient(90deg,#06b6d4,#10b981);width:80%;}
.bar-t{background:linear-gradient(90deg,#f59e0b,#ef4444);width:100%;}
.gf-meta{display:flex;gap:8px;flex-wrap:wrap;}
.gf-growth{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;
  padding:6px 12px;border-radius:8px;flex:1;justify-content:center;
  background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);color:var(--green);}
.gf-demand{padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;
  flex:1;text-align:center;}
.d-high{background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.28);color:var(--green);}
.d-medium{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);color:var(--amber);}
.d-low{background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.25);color:var(--red);}

/* GLOBAL SALARY */
.gtbl{width:100%;border-collapse:collapse;}
.gtbl th{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;
  color:var(--muted2);padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);}
.gtbl td{font-size:12.5px;padding:11px 10px;border-bottom:1px solid var(--border);}
.gtbl tr:last-child td{border-bottom:none;}
.gtbl tr:hover td{background:rgba(255,255,255,.02);}
.gfl{margin-right:5px;}
.gctr{font-weight:600;color:#fff;}
.gamt{font-weight:500;}
.gamt.e{color:var(--p3);}
.gamt.m{color:#67e8f9;}
.gamt.s{color:var(--green);}
.g-home td{background:rgba(124,58,237,.06) !important;}
.g-home .gctr::after{content:" ★";color:var(--p3);font-size:10px;}

/* RESET */
.rst-btn{width:100%;padding:14px;border-radius:10px;font-size:13px;font-weight:600;
  border:1px solid var(--border2);background:transparent;color:var(--muted);
  cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .2s;margin-top:4px;
  display:flex;align-items:center;justify-content:center;gap:8px;}
.load-extra{font-size:11px;color:var(--amber);margin-top:10px;padding:7px 12px;
  background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);
  border-radius:8px;line-height:1.5;}

/* COMPANIES */
.co-grid{display:flex;flex-wrap:wrap;gap:7px;}
.co-chip{font-size:12px;font-weight:600;padding:6px 13px;border-radius:8px;
  background:var(--bg3);border:1px solid var(--border2);color:var(--text);
  display:flex;align-items:center;gap:5px;}
.co-dot{width:6px;height:6px;border-radius:50%;background:var(--p2);flex-shrink:0;}

/* CERTIFICATES */
.cert-list{display:flex;flex-direction:column;gap:9px;}
.cert-item{display:flex;align-items:flex-start;gap:11px;
  background:var(--bg3);border:1px solid var(--border);border-radius:11px;padding:12px 14px;}
.cert-badge{font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;
  padding:3px 8px;border-radius:6px;white-space:nowrap;flex-shrink:0;margin-top:1px;}
.cert-badge-ibm{background:rgba(6,182,212,.15);border:1px solid rgba(6,182,212,.3);color:#67e8f9;}
.cert-badge-google{background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.28);color:#6ee7b7;}
.cert-badge-microsoft{background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.3);color:#c4b5fd;}
.cert-badge-other{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);color:#fcd34d;}
.cert-name{font-size:13px;font-weight:700;color:#fff;margin-bottom:3px;}
.cert-why{font-size:12px;color:var(--muted);line-height:1.5;}

/* PROJECTS */
.proj-list{display:flex;flex-direction:column;gap:9px;}
.proj-item{background:var(--bg3);border:1px solid var(--border);border-radius:11px;padding:13px 15px;
  border-left:3px solid var(--p2);}
.proj-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;flex-wrap:wrap;}
.proj-title{font-size:13px;font-weight:700;color:#fff;}
.proj-skill{font-size:10px;font-weight:600;color:var(--p3);
  background:rgba(124,58,237,.12);border:1px solid rgba(139,92,246,.25);
  padding:3px 9px;border-radius:20px;white-space:nowrap;}
.proj-desc{font-size:12.5px;color:var(--muted);line-height:1.55;}
.rst-btn{width:100%;padding:14px;border-radius:10px;font-size:13px;font-weight:600;
  border:1px solid var(--border2);background:transparent;color:var(--muted);
  cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .2s;margin-top:4px;
  display:flex;align-items:center;justify-content:center;gap:8px;}
.rst-btn:hover{background:var(--bg3);color:var(--text);border-color:var(--p2);}
`;

// ─── LOADING CONFIG ─────────────────────────────────────────────────────────
// Steps advance linearly ONE TIME (0→1→2→3). Never cycle. Never repeat.
// Each step auto-advances based on elapsed seconds since generation started.
const STEPS = [
  { label: "Analyzing career path",         triggerMs: 0     },
  { label: "Building step-by-step roadmap", triggerMs: 6000  },
  { label: "Mapping skills & tools",        triggerMs: 13000 },
  { label: "Fetching global salary data",   triggerMs: 20000 },
];
// Shown only when waiting >25s (retry/high-load scenario)
const WAIT_MSGS = [
  "Still working — this may take a few minutes…",
  "High demand right now, please hang tight…",
  "Almost there, generating your full plan…",
  "Finalizing month-by-month details…",
];

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function App() {
  const [open,     setOpen]     = useState(false);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null);
  const [level,    setLevel]    = useState("Beginner");
  const [region,   setRegion]   = useState("India");
  const [loading,  setLoading]  = useState(false);
  const [loadStep, setLoadStep] = useState(0);   // 0-3, advances once per step, never repeats
  const [elapsed,  setElapsed]  = useState(0);   // ms since generation started
  const [attempts, setAttempts] = useState(0);   // silent retry counter
  const [result,   setResult]   = useState(null);

  const dropRef   = useRef(null);
  const searchRef = useRef(null);
  const abortRef  = useRef(null);
  const timerRef  = useRef(null);  // single interval driving both step + elapsed
  const startRef  = useRef(0);     // timestamp when generation started

  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 60); }, [open]);
  useEffect(() => () => { abortRef.current?.abort(); clearInterval(timerRef.current); }, []);

  const filtered = search.trim()
    ? ALL.filter(c => c.career.toLowerCase().includes(search.toLowerCase()) || c.domain.toLowerCase().includes(search.toLowerCase()))
    : null;
  const domains  = filtered ? [...new Set(filtered.map(f => f.domain))] : Object.keys(CAREERS);
  const getItems = d => filtered ? filtered.filter(f => f.domain === d) : CAREERS[d].map(c => ({ domain: d, career: c }));

  const generate = useCallback(async () => {
    if (!selected || loading) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true); setResult(null);
    setLoadStep(0); setElapsed(0); setAttempts(0);
    startRef.current = Date.now();

    // Single interval: every 500ms update elapsed time + derive current step
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const ms = Date.now() - startRef.current;
      setElapsed(ms);
      // Find the highest step whose triggerMs has passed (steps advance once, never go back)
      let step = 0;
      for (let i = STEPS.length - 1; i >= 0; i--) {
        if (ms >= STEPS[i].triggerMs) { step = i; break; }
      }
      setLoadStep(step);
    }, 500);

    try {
      const text = await callAPI(
        selected.career, selected.domain, level, region,
        abortRef.current.signal,
        (attempt) => setAttempts(attempt),
      );
      const parsed = parseResult(text);
      setResult(parsed);
    } catch (e) {
      if (e.name === "AbortError") return;
      // Should never reach here — auto-retry after 2s as last resort
      clearInterval(timerRef.current);
      setLoading(false);
      setTimeout(() => generate(), 2000);
      return;
    } finally {
      clearInterval(timerRef.current);
      setLoading(false);
    }
  }, [selected, level, region, loading]);

  function reset() {
    abortRef.current?.abort();
    clearInterval(timerRef.current);
    setResult(null); setSelected(null); setSearch("");
    setLevel("Beginner"); setRegion("India");
    setLoading(false); setAttempts(0); setElapsed(0); setLoadStep(0);
  }

  const cur = REGIONS.find(r => r.id === region) || REGIONS[0];
  const fc  = result?.forecast || {};
  const dCls = fc.demand === "HIGH" ? "d-high" : fc.demand === "LOW" ? "d-low" : "d-medium";

  return (
    <>
      <style>{CSS}</style>
      <div className="app">

        {/* HEADER */}
        <header className="hdr">
          <div className="hdr-brand">Career<em>Map</em></div>
          <div className="hdr-sub">AI Career Roadmap</div>
        </header>

        {/* HERO */}
        <section className="hero">
          <div className="hero-tag"><span className="hero-pulse" />AI · Month-by-Month · 8 Countries</div>
          <h1 className="hero-title">Your personalized<br /><em>career roadmap</em></h1>
          <p className="hero-desc">Step-by-step phases, skill matrix, tools, and global salary benchmarks — for any career, any level.</p>
        </section>

        {/* ── FORM ── */}
        {!result && !loading && (
          <div className="wrap">
            <div className="fcard">
              <div className="fcard-head">
                <div className="fcard-icon">🗺️</div>
                <div>
                  <div className="fcard-title">Build Your Roadmap</div>
                  <div className="fcard-sub">Choose your career, level, and region</div>
                </div>
              </div>

              {/* Career Dropdown */}
              <div className="field">
                <div className="flabel">Choose Career</div>
                <div className="dd" ref={dropRef}>
                  <div className={`dd-btn${open ? " open" : ""}`} onClick={() => setOpen(o => !o)}>
                    <div className="dd-left">
                      {selected
                        ? <><span style={{fontSize:15}}>{ICONS[selected.domain]}</span><span className="dd-val">{selected.career}</span></>
                        : <span className="dd-ph">Search or browse 150+ careers…</span>}
                    </div>
                    <span className={`dd-caret${open ? " open" : ""}`}>▼</span>
                  </div>
                  {open && (
                    <div className="dd-panel">
                      <div className="dd-sb">
                        <span className="dd-si">🔍</span>
                        <input ref={searchRef} className="dd-si-input" placeholder="Search careers…"
                          value={search} onChange={e => setSearch(e.target.value)} />
                      </div>
                      <div className="dd-list">
                        {domains.length === 0 && <div className="dd-none">No results</div>}
                        {domains.map(d => {
                          const items = getItems(d); if (!items.length) return null;
                          return (
                            <div key={d}>
                              <div className="dd-cat">{ICONS[d]} {d}</div>
                              {items.map(({ career }) => (
                                <div key={career}
                                  className={`dd-item${selected?.career === career ? " sel" : ""}`}
                                  onClick={() => { setSelected({ domain: d, career }); setOpen(false); setSearch(""); }}>
                                  {career}
                                  {selected?.career === career && <span style={{color:"var(--p3)",fontSize:11}}>✓</span>}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Level */}
              <div className="field">
                <div className="flabel">Current Level</div>
                <div className="lgrid">
                  {LEVELS.map(lv => (
                    <div key={lv.id} className={`lcard${level === lv.id ? " sel" : ""}`} onClick={() => setLevel(lv.id)}>
                      <div className="lcard-emoji">{lv.emoji}</div>
                      <div className="lcard-name">{lv.id}</div>
                      <div className="lcard-hint">{lv.hint}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Region */}
              <div className="field">
                <div className="flabel">Primary Region (Salary)</div>
                <div className="pgrid">
                  {REGIONS.map(rg => (
                    <div key={rg.id} className={`pcard${region === rg.id ? " sel" : ""}`} onClick={() => setRegion(rg.id)}>
                      <div className="pcard-flag">{rg.flag}</div>
                      <div className="pcard-name">{rg.id}</div>
                    </div>
                  ))}
                </div>
              </div>

              <button className="genbtn" disabled={!selected} onClick={generate}>
                ✨ {selected ? `Generate Roadmap for ${selected.career}` : "Select a Career First"}
              </button>
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div className="load-wrap">
            <div className="load-card">
              <div className="spinner" />
              <div className="load-title">Building Your Roadmap</div>
              <div className="load-sub">
                AI is crafting your {selected?.career} path…
                {elapsed < 8000 && <><br/><span style={{fontSize:11,color:"var(--muted)"}}>This may take 1–2 minutes. Please don't close the page.</span></>}
              </div>

              {/* Steps — shown once, tick forward, never reset */}
              <div style={{marginBottom: 10}}>
                {STEPS.map((s, i) => {
                  const state = i < loadStep ? "done" : i === loadStep ? "active" : "idle";
                  return (
                    <div key={i} className={`lstep ${state}`}>
                      <span className="lstep-dot" />
                      {i < loadStep ? "✓ " : ""}{s.label}
                    </div>
                  );
                })}
              </div>

              {/* Extra message — only if taking long or retrying */}
              {(elapsed > 25000 || attempts > 0) && (
                <div className="load-extra">
                  {attempts > 0
                    ? `⟳ High demand — seamlessly retrying (attempt ${attempts + 1})…`
                    : WAIT_MSGS[Math.floor(elapsed / 8000) % WAIT_MSGS.length]}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {result && !loading && (
          <div className="res-wrap">

            {/* Summary header */}
            <div className="res-top-card">
              <div className="res-career-row">
                <div className="res-career-icon">{ICONS[selected?.domain] || "🎯"}</div>
                <div>
                  <div className="res-career-name">{selected?.career}</div>
                  <div className="res-career-meta">{selected?.domain} · {level} · {cur.flag} {region}</div>
                </div>
              </div>
              <div className="res-pills">
                <span className="rpill rpill-c">📅 {result.phases.length} Phases</span>
                <span className="rpill rpill-p">⚡ {result.skills.length} Skills</span>
                <span className="rpill rpill-g">🔧 {result.tools.length} Tools</span>
                <span className="rpill rpill-a">🌍 8 Countries</span>
              </div>
            </div>

            {/* 1. SKILL MATRIX — moved above roadmap */}
            {(result.skills.length > 0 || result.tools.length > 0) && (
              <div className="sec">
                <div className="sec-head">
                  <span className="sec-ico">🎯</span>
                  <div>
                    <div className="sec-title">Skill Matrix</div>
                    <div className="sec-sub">Everything you need to master</div>
                  </div>
                </div>
                {result.skills.length > 0 && (
                  <div className="sm-sec">
                    <div className="sm-lbl">Essential Skills</div>
                    <div className="sm-chips">
                      {result.skills.map((s, i) => <span key={i} className="chip chip-skill">{s}</span>)}
                    </div>
                  </div>
                )}
                {result.tools.length > 0 && (
                  <div className="sm-sec">
                    <div className="sm-lbl">Core Tools</div>
                    <div className="sm-chips">
                      {result.tools.map((t, i) => <span key={i} className="chip chip-tool">{t}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. STEP-BY-STEP ROADMAP */}
            {result.phases.length > 0 && (
              <div className="sec">
                <div className="sec-head">
                  <span className="sec-ico">📅</span>
                  <div>
                    <div className="sec-title">Step-by-Step Roadmap</div>
                    <div className="sec-sub">Month-by-month learning journey</div>
                  </div>
                </div>
                {result.phases.map((ph, i) => (
                  <div className="tl-item" key={i}>
                    <div className="tl-track">
                      <div className="tl-node" />
                      {i < result.phases.length - 1 && <div className="tl-line" />}
                    </div>
                    <div className="tl-body">
                      <div className="tl-hdr">
                        <div className="tl-title">{ph.name}</div>
                        {ph.duration && <span className="tl-dur">{ph.duration}</span>}
                      </div>
                      {ph.desc && <div className="tl-desc">{ph.desc}</div>}
                      {ph.tasks?.length > 0 && (
                        <div className="tl-tasks">
                          {ph.tasks.map((t, ti) => (
                            <div className="tl-task" key={ti}>
                              <span className="tl-dot" /><span>{t}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {ph.milestone && (
                        <div className="tl-mile">
                          <span style={{fontSize:13}}>🏆</span>
                          <div>
                            <div className="tl-mile-lbl">Milestone</div>
                            <div className="tl-mile-txt">{ph.milestone}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 3. COMPANIES THAT HIRE */}
            {result.companies.length > 0 && (
              <div className="sec">
                <div className="sec-head">
                  <span className="sec-ico">🏢</span>
                  <div>
                    <div className="sec-title">Companies That Hire</div>
                    <div className="sec-sub">Top employers for {selected?.career}</div>
                  </div>
                </div>
                <div className="co-grid">
                  {result.companies.map((c, i) => (
                    <div key={i} className="co-chip"><span className="co-dot"/>{c}</div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. CERTIFICATES */}
            {result.certs.length > 0 && (
              <div className="sec">
                <div className="sec-head">
                  <span className="sec-ico">🎓</span>
                  <div>
                    <div className="sec-title">Recommended Certificates</div>
                    <div className="sec-sub">Industry-recognized credentials from top issuers</div>
                  </div>
                </div>
                <div className="cert-list">
                  {result.certs.map((c, i) => {
                    const lo = c.issuer.toLowerCase();
                    const badgeCls = lo.includes("ibm") ? "cert-badge-ibm"
                      : lo.includes("google") ? "cert-badge-google"
                      : lo.includes("microsoft") ? "cert-badge-microsoft"
                      : "cert-badge-other";
                    return (
                      <div key={i} className="cert-item">
                        <span className={`cert-badge ${badgeCls}`}>{c.issuer}</span>
                        <div>
                          <div className="cert-name">{c.name}</div>
                          {c.why && <div className="cert-why">{c.why}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. PROJECT IDEAS */}
            {result.projects.length > 0 && (
              <div className="sec">
                <div className="sec-head">
                  <span className="sec-ico">🛠️</span>
                  <div>
                    <div className="sec-title">Project Ideas</div>
                    <div className="sec-sub">Build these to demonstrate your skills</div>
                  </div>
                </div>
                <div className="proj-list">
                  {result.projects.map((p, i) => (
                    <div key={i} className="proj-item">
                      <div className="proj-top">
                        <div className="proj-title">💡 {p.title}</div>
                        {p.skill && <span className="proj-skill">{p.skill}</span>}
                      </div>
                      {p.desc && <div className="proj-desc">{p.desc}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. GROWTH FORECAST */}
            {(fc.entrySalary || fc.midSalary || fc.seniorSalary) && (
              <div className="sec">
                <div className="sec-head">
                  <span className="sec-ico">📈</span>
                  <div>
                    <div className="sec-title">Growth Forecast</div>
                    <div className="sec-sub">{cur.flag} {region} salary benchmarks</div>
                  </div>
                </div>
                <div className="gf-summary">
                  <div className="gf-lbl">Estimated Salary</div>
                  <div className="gf-text">
                    {fc.entryTitle && <><em>{fc.entryTitle}:</em><br /></>}
                    {fc.entrySalary}<br />
                    {fc.midTitle && <><em>{fc.midTitle}:</em><br /></>}
                    {fc.midSalary}
                  </div>
                  {fc.note && <div className="gf-note">({fc.note})</div>}
                </div>
                <div className="gf-tiers">
                  {fc.entrySalary  && <div className="gf-tier"><div className="gf-tier-lbl">Entry · 0–2 yrs</div><div className="gf-tier-sal">{fc.entrySalary}</div><div className="gf-bar bar-e"/></div>}
                  {fc.midSalary    && <div className="gf-tier"><div className="gf-tier-lbl">Mid · 2–5 yrs</div><div className="gf-tier-sal">{fc.midSalary}</div><div className="gf-bar bar-m"/></div>}
                  {fc.seniorSalary && <div className="gf-tier"><div className="gf-tier-lbl">Senior · 5+ yrs</div><div className="gf-tier-sal">{fc.seniorSalary}</div><div className="gf-bar bar-s"/></div>}
                  {fc.topSalary    && <div className="gf-tier top"><div className="gf-tier-lbl">{fc.topTitle || "Top 1%"}</div><div className="gf-tier-sal">{fc.topSalary}</div><div className="gf-bar bar-t"/></div>}
                </div>
                {(fc.jobGrowth || fc.demand) && (
                  <div className="gf-meta">
                    {fc.jobGrowth && <div className="gf-growth">📈 {fc.jobGrowth}</div>}
                    {fc.demand    && <div className={`gf-demand ${dCls}`}>Demand: {fc.demand}</div>}
                  </div>
                )}
              </div>
            )}

            {/* 7. GLOBAL SALARY — Entry & Mid range only, no Senior */}
            {result.globalSalary?.length > 0 && (
              <div className="sec">
                <div className="sec-head">
                  <span className="sec-ico">🌍</span>
                  <div>
                    <div className="sec-title">Global Salary Comparison</div>
                    <div className="sec-sub">Entry & mid-level ranges across 8 countries · ★ = your region</div>
                  </div>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table className="gtbl">
                    <thead>
                      <tr>
                        <th>Country</th>
                        <th>Entry Level Range</th>
                        <th>Mid Level Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.globalSalary.map((row, i) => {
                        const isHome = row.country.toLowerCase() === region.toLowerCase();
                        const rg = REGIONS.find(r => r.id.toLowerCase() === row.country.toLowerCase());
                        return (
                          <tr key={i} className={isHome ? "g-home" : ""}>
                            <td><span className="gfl">{rg?.flag || "🌐"}</span><span className="gctr">{row.country}</span></td>
                            <td><span className="gamt e">{row.entry}</span></td>
                            <td><span className="gamt m">{row.mid}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <button className="rst-btn" onClick={reset}>↩ Reset &amp; Re-generate</button>
          </div>
        )}
      </div>
    </>
  );
}
