import { useState, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

// ─── Access Control ───────────────────────────────────────────────────────────
import { APP_PASSWORD, USER_PINS } from "./secrets";

const C = {
  navy:    "#0F1F3D",
  navyMid: "#1B2A4A",
  navyLt:  "#243558",
  gold:    "#C9A84C",
  goldLt:  "#F0D98C",
  white:   "#F5F7FA",
  muted:   "#8A9BB5",
  green:   "#2ECC8A",
  red:     "#E05C5C",
  orange:  "#F2994A",
  border:  "rgba(201,168,76,0.25)",
  gridLine:"rgba(138,155,181,0.15)",
};

// ─── Calc engine ──────────────────────────────────────────────────────────────
function calcMetrics({ purchasePrice, monthlyRent, downPct, mortgageRate,
  mortgageTerm, monthlyExpenses, economicVacancy, appreciationRate,
  rentGrowthRate, timeHorizon, brokerFeePct, leaseType,
  rentBumpPct, rentBumpYears, tenantCredit }) {

  const down     = purchasePrice * (downPct / 100);
  const loan     = purchasePrice - down;
  const mRate    = (mortgageRate / 100) / 12;
  const nPay     = mortgageTerm * 12;
  const mortgage = mRate > 0
    ? loan * mRate / (1 - Math.pow(1 + mRate, -nPay))
    : loan / nPay;

  const effExp = leaseType === "NNN" ? 0
    : leaseType === "Modified Gross" ? monthlyExpenses * 0.5
    : monthlyExpenses;

  const effRent = monthlyRent * (1 - economicVacancy / 100);
  const annRent = effRent * 12;
  const annExp  = effExp * 12;
  const annMort = mortgage * 12;
  const noi1    = annRent - annExp;
  const cf1     = noi1 - annMort;
  const dscr    = annMort ? noi1 / annMort : 0;

  const creditAdj = tenantCredit === "Investment Grade" ? -0.75
    : tenantCredit === "Franchisee" ? 0.5 : 0;
  const capRate = purchasePrice ? (noi1 / purchasePrice) * 100 + creditAdj : 0;
  const coc     = down ? (cf1 / down) * 100 : 0;

  const cashFlows = [], rents = [], rois = [];
  let curRent = monthlyRent;

  for (let yr = 1; yr <= timeHorizon; yr++) {
    if (yr > 1) {
      if (rentBumpYears > 0 && (yr - 1) % rentBumpYears === 0)
        curRent *= (1 + rentBumpPct / 100);
      else
        curRent *= (1 + rentGrowthRate / 100);
    }
    const yEff  = curRent * (1 - economicVacancy / 100);
    const yRent = yEff * 12;
    const yNOI  = yRent - annExp;
    const yCF   = yNOI - annMort;
    const appVal= purchasePrice * ((1 + appreciationRate / 100) ** yr - 1);
    const cumCF = cashFlows.reduce((a, b) => a + b, 0) + yCF;
    const roi   = down ? ((cumCF + appVal) / down) * 100 : 0;
    cashFlows.push(Math.round(yCF));
    rents.push(Math.round(curRent * 12));
    rois.push(Math.round(roi));
  }

  const brokerFeeAdj = purchasePrice * (brokerFeePct / 100);
  const saleVal = purchasePrice * ((1 + appreciationRate / 100) ** timeHorizon) - brokerFeeAdj;
  const cfTotal = [...cashFlows];
  cfTotal[cfTotal.length - 1] += saleVal;

  function irrSolve(flows) {
    if (!down || down <= 0) return null;
    const npv = (r) => flows.reduce((a, cf, j) => a + cf / (1 + r) ** (j + 1), -down);
    const dnpv = (r) => flows.reduce((a, cf, j) => a - (j + 1) * cf / (1 + r) ** (j + 2), 0);
    for (const guess of [0.1, 0.05, 0.15, 0.01, 0.2, -0.05, -0.1, -0.2, -0.3, -0.15, -0.25]) {
      let r = guess;
      let converged = false;
      for (let i = 0; i < 300; i++) {
        const f = npv(r), df = dnpv(r);
        if (!isFinite(f) || !isFinite(df) || Math.abs(df) < 1e-14) break;
        const step = f / df;
        r -= step;
        if (r < -0.99) break;
        if (r > 100) break;
        if (Math.abs(step) < 1e-10) { converged = true; break; }
      }
      if (converged && isFinite(r) && r > -0.99 && r < 100) return r * 100;
    }
    return null;
  }

  const irrOp    = irrSolve(cashFlows);
  const irrTotal = irrSolve(cfTotal);
  const eqMult   = down ? cfTotal.reduce((a, b) => a + b, 0) / down : 0;

  return { capRate, coc, dscr, cf1, irrOp, irrTotal, eqMult,
           cashFlows, rents, rois, mortgage, down };
}

// ─── Gate Screen ──────────────────────────────────────────────────────────────
// PIN-to-name mapping (PIN is the only thing user types in step 2)
const PIN_TO_NAME = Object.fromEntries(
  Object.entries(USER_PINS).map(([name, pin]) => [pin, name])
);

function GateScreen({ onAuth }) {
  const [step,   setStep]   = useState("password");
  const [pwd,    setPwd]    = useState("");
  const [pin,    setPin]    = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [pinErr, setPinErr] = useState("");

  function submitPassword() {
    if (pwd === APP_PASSWORD) { setStep("pin"); setPwdErr(""); }
    else setPwdErr("❌ Incorrect password. Please try again.");
  }

  function submitPin() {
    const name = PIN_TO_NAME[pin.trim()];
    if (name) { onAuth(name); }
    else setPinErr("❌ Incorrect PIN. Please try again.");
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: C.navyLt, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: "12px 14px", color: C.white,
    fontSize: 15, marginBottom: 10, outline: "none",
  };
  const btnStyle = {
    width: "100%", padding: "13px", background: C.gold, border: "none",
    color: C.navy, borderRadius: 8, cursor: "pointer",
    fontSize: 15, fontWeight: 700, marginTop: 4, boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.navy,
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 360, background: C.navyMid,
        borderRadius: 16, padding: "36px 32px",
        border: `1px solid ${C.border}`,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: C.gold, letterSpacing: 3,
            textTransform: "uppercase", marginBottom: 6 }}>
            RealEstate-Analytics.ai
          </div>
          <div style={{ fontSize: 22, fontWeight: 700,
            fontFamily: "Georgia,serif", color: C.white }}>
            🏢 CRE Deal Analyzer
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
            {step === "password" ? "🔒 Enter access password" : "🔑 Enter your PIN"}
          </div>
        </div>

        {step === "password" && (
          <form onSubmit={e => { e.preventDefault(); submitPassword(); }}>
            <input type="password" placeholder="Access password"
              value={pwd} onChange={e => setPwd(e.target.value)}
              autoComplete="current-password"
              style={inputStyle} />
            {pwdErr && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{pwdErr}</div>}
            <button type="submit" style={btnStyle}>Continue →</button>
          </form>
        )}

        {step === "pin" && (
          <form onSubmit={e => { e.preventDefault(); submitPin(); }}>
            <input type="password" placeholder="Your 4-digit PIN"
              value={pin} onChange={e => setPin(e.target.value)}
              maxLength={4} inputMode="numeric"
              style={inputStyle} />
            {pinErr && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{pinErr}</div>}
            <button type="submit" style={btnStyle}>Access Analyzer →</button>
            <button type="button"
              onClick={() => { setStep("password"); setPwd(""); setPin(""); setPinErr(""); }}
              style={{ ...btnStyle, background: "transparent", color: C.muted,
                border: `1px solid ${C.border}`, marginTop: 8 }}>
              ← Back
            </button>
          </form>
        )}

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 10, color: C.muted }}>
          Protected access — RealEstate-Analytics.ai
        </div>
      </div>
    </div>
  );
}

// ─── Tiny UI components ───────────────────────────────────────────────────────
function Label({ children }) {
  return <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{children}</div>;
}

function SliderInput({ label, value, min, max, step = 1, display, onChange }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.goldLt }}>{display(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: C.gold, cursor: "pointer" }} />
    </div>
  );
}

function PlusMinusInput({ label, value, min, max, step = 1, display, onChange, note }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");
  return (
    <div style={{ marginBottom: 13 }}>
      <Label>{label}</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => onChange(Math.max(min, value - step))}
          style={{ width: 28, height: 28, border: `1px solid ${C.border}`,
            background: C.navyLt, color: C.gold, borderRadius: 5,
            cursor: "pointer", fontSize: 16, lineHeight: 1 }}>−</button>
        {editing ? (
          <input
            autoFocus
            type="number"
            value={raw}
            onChange={e => setRaw(e.target.value)}
            onBlur={() => {
              const parsed = parseFloat(raw);
              if (!isNaN(parsed) && parsed >= min && parsed <= max) onChange(parsed);
              setEditing(false);
              setRaw("");
            }}
            onKeyDown={e => {
              if (e.key === "Enter") e.target.blur();
              if (e.key === "Escape") { setEditing(false); setRaw(""); }
            }}
            style={{ flex: 1, background: C.navyLt, border: `1px solid ${C.gold}`,
              borderRadius: 5, padding: "5px 10px", fontSize: 13,
              color: C.white, textAlign: "center" }}
          />
        ) : (
          <div
            onClick={() => { setRaw(String(value)); setEditing(true); }}
            title="Click to type a value"
            style={{ flex: 1, background: C.navyLt, border: `1px solid ${C.border}`,
              borderRadius: 5, padding: "5px 10px", fontSize: 13,
              color: C.white, textAlign: "center", cursor: "text" }}>{display(value)}</div>
        )}
        <button onClick={() => onChange(Math.min(max, value + step))}
          style={{ width: 28, height: 28, border: `1px solid ${C.border}`,
            background: C.navyLt, color: C.gold, borderRadius: 5,
            cursor: "pointer", fontSize: 16, lineHeight: 1 }}>+</button>
      </div>
      {note && <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{note}</div>}
    </div>
  );
}

function SelectInput({ label, value, options, onChange }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <Label>{label}</Label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", background: C.navyLt, color: C.white,
          border: `1px solid ${C.border}`, borderRadius: 5,
          padding: "6px 8px", fontSize: 12 }}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Pill({ label, value, color = C.gold }) {
  return (
    <div style={{ textAlign: "center", padding: "10px 14px",
      background: C.navyMid, borderRadius: 10,
      border: `1px solid ${C.border}`, flex: "1 1 110px" }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase",
        letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color,
        fontFamily: "Georgia,serif" }}>{value}</div>
    </div>
  );
}

function DSCRBar({ val }) {
  const pct = Math.min(val / 3, 1) * 100;
  const col = val >= 1.25 ? C.green : val >= 1.0 ? C.gold : C.red;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between",
        fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: C.muted }}>DSCR (Debt Service Coverage)</span>
        <span style={{ color: col, fontWeight: 700 }}>
          {val.toFixed(2)}×  {val >= 1.25 ? "✓ Lender OK" : val >= 1.0 ? "⚠ Borderline" : "✗ Below 1.0"}
        </span>
      </div>
      <div style={{ background: C.navyLt, borderRadius: 99, height: 7 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: col,
          borderRadius: 99, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

// ─── Multi-line SVG chart ─────────────────────────────────────────────────────
function MultiLineChart({ cashFlows, rents, rois, timeHorizon }) {
  const W = 560, H = 200, PL = 62, PR = 55, PT = 28, PB = 32;
  const cW = W - PL - PR, cH = H - PT - PB;

  const allVals = [...cashFlows, ...rents];
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 1);
  const rangeV = maxV - minV || 1;
  const maxROI = Math.max(...rois, 1);

  function xPx(i) { return PL + (i / (timeHorizon - 1 || 1)) * cW; }
  function yL(v)  { return PT + cH - ((v - minV) / rangeV) * cH; }
  function yR(v)  { return PT + cH - (v / maxROI) * cH; }

  function polyline(data, yFn, col) {
    const pts = data.map((v, i) => `${xPx(i)},${yFn(v)}`).join(" ");
    return <polyline points={pts} fill="none" stroke={col}
      strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />;
  }

  const ticks = 4;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}
      preserveAspectRatio="xMidYMid meet">

      {/* Legend */}
      {[["#4A90D9","Multi-Year Cash Flow ($)"],[C.orange,"Pro Forma Rent ($/yr)"],[C.green,"ROI (%)"]].map(([col, lbl], i) => (
        <g key={i} transform={`translate(${PL + i * 182}, 6)`}>
          <line x1="0" y1="5" x2="16" y2="5" stroke={col} strokeWidth="2.5" />
          <circle cx="8" cy="5" r="3" fill={col} />
          <text x="20" y="9" style={{ fontSize: 9, fill: C.muted }}>{lbl}</text>
        </g>
      ))}

      {/* Grid */}
      {Array.from({ length: ticks + 1 }, (_, i) => (
        <line key={i} x1={PL} y1={PT + (i / ticks) * cH}
          x2={W - PR} y2={PT + (i / ticks) * cH}
          stroke={C.gridLine} strokeWidth="1" strokeDasharray="3,3" />
      ))}

      {/* Left Y labels */}
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = minV + ((ticks - i) / ticks) * rangeV;
        return <text key={i} x={PL - 4} y={PT + (i / ticks) * cH + 4}
          textAnchor="end" style={{ fontSize: 9, fill: C.muted }}>
          {Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`}
        </text>;
      })}

      {/* Right Y labels */}
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = ((ticks - i) / ticks) * maxROI;
        return <text key={i} x={W - PR + 4} y={PT + (i / ticks) * cH + 4}
          textAnchor="start" style={{ fontSize: 9, fill: C.muted }}>
          {Math.round(v)}%
        </text>;
      })}

      {/* X labels */}
      {cashFlows.map((_, i) => (
        (i === 0 || i === timeHorizon - 1 || (timeHorizon > 5 && i % 2 === 0)) &&
        <text key={i} x={xPx(i)} y={H - 6} textAnchor="middle"
          style={{ fontSize: 9, fill: C.muted }}>{i + 1}</text>
      ))}

      {/* Axes */}
      <line x1={PL} y1={PT} x2={PL} y2={PT + cH} stroke={C.muted} strokeWidth="1" />
      <line x1={PL} y1={PT + cH} x2={W - PR} y2={PT + cH} stroke={C.muted} strokeWidth="1" />
      <text x={PL + cW / 2} y={H - 1} textAnchor="middle"
        style={{ fontSize: 9, fill: C.muted }}>Year</text>

      {/* Lines */}
      {polyline(cashFlows, yL, "#4A90D9")}
      {polyline(rents,     yL, C.orange)}
      {polyline(rois,      yR, C.green)}

      {/* Dots */}
      {cashFlows.map((v, i) => <circle key={i} cx={xPx(i)} cy={yL(v)} r="3" fill="#4A90D9" />)}
      {rents.map((v, i)     => <circle key={i} cx={xPx(i)} cy={yL(v)} r="3" fill={C.orange} />)}
      {rois.map((v, i)      => <circle key={i} cx={xPx(i)} cy={yR(v)} r="3" fill={C.green} />)}
    </svg>
  );
}

// ─── Document Type Definitions ────────────────────────────────────────────────
const DOC_TYPES = {
  OM:      { label: "Offering Memo",   icon: "📋", color: "#C9A84C" },
  T12:     { label: "T-12 Financials", icon: "📊", color: "#4A9EF5" },
  UNKNOWN: { label: "Unknown",         icon: "📄", color: "#8A9BB5" },
};

function detectDocType(text) {
  const t = text.toLowerCase();
  const omScore  = (t.includes("offering memorandum")||t.includes("offering memo")?4:0)
                 + (t.includes("net operating income")||t.includes("noi")?2:0)
                 + (t.includes("cap rate")?2:0)+(t.includes("investment highlights")?2:0)
                 + (t.includes("pro forma")?1:0);
  const t12Score = (t.includes("trailing 12")||t.includes("t-12")||t.includes("t12")?4:0)
                 + (t.includes("gross revenue")?1:0)+(t.includes("total expenses")?1:0)
                 + ((t.match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/g)||[]).length>=6?2:0);
  if (t12Score >= 2 && t12Score >= omScore) return "T12";
  if (omScore  >= 2) return "OM";
  return "UNKNOWN";
}

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
  // Was capped at 20 pages — CBRE-style OMs put the entire Financials
  // section (Executive Summary, Rent Roll, Cash Flow) in the back half of
  // the document, well past page 20 on anything 30+ pages long. Read the
  // whole document (up to a sane ceiling) instead.
  const maxPages = Math.min(pdf.numPages, 75);
  const pageTexts = [];
  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent({normalizeWhitespace: true});
    pageTexts.push(content.items.map(i => i.str).join(" "));
  }
  return pageTexts; // array, one entry per page — lets callers prioritize
}

// Pages whose text matches these are almost certainly where the real
// numbers live (rent rolls, cash flow tables, executive summaries, T-12s).
const FIN_KEYWORDS = /rent\s*roll|net operating income|\bnoi\b|operating expense|cash flow|executive summary|capitalization rate|cap rate|trailing[- ]?12|\bt-?12\b|debt (service|coverage)|dscr|gross (scheduled|potential) income|total expenses|expense recover/i;

// Build the text actually sent to the extraction model. If the whole
// document is small, just send it all. Otherwise, keep the first few
// pages (address/price/property description) plus every page that looks
// financial, so long documents don't silently drop their numbers.
function buildExtractionText(pageTexts, maxChars = 45000) {
  const full = pageTexts.join("\n");
  if (full.length <= maxChars) return full;
  const picked = pageTexts.filter((t, i) => i < 5 || FIN_KEYWORDS.test(t));
  const text = picked.join("\n");
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function normNum(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  const s = String(val).replace(/[$,%\s]/g, "");
  if (s.toUpperCase().endsWith("M")) return parseFloat(s) * 1e6;
  if (s.toUpperCase().endsWith("K")) return parseFloat(s) * 1e3;
  if (s.includes("-")) {
    const parts = s.split("-").map(Number).filter(n => !isNaN(n));
    if (parts.length === 2) return Math.round((parts[0] + parts[1]) / 2);
  }
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

async function extractWithClaudeCRE(pageTexts, docType) {
  const isT12 = docType === "T12";
  const text = buildExtractionText(pageTexts);
  const prompt = `You are a commercial real estate underwriting analyst. Extract fields from this ${isT12 ? "Trailing-12-Month income statement" : "Offering Memorandum"}.

RULES:
- Return ONLY a valid JSON object. No markdown, no backticks, no explanation.
- Use null for any field not found.
- All money values as plain numbers (no $ or commas). Convert: "$4.85M"->4850000, "$280K"->280000.
- If a value is a range, use the midpoint.
- capRate as a number (e.g. 5.25 not "5.25%").
- leaseType: normalize to exactly one of: "NNN", "Modified Gross", "Gross".
- listPrice may appear as "Asking Price", "List Price", "Offering Price", "Sale Price", "Acquisition Price", "Purchase Price".
- For T-12 documents: listPrice will be null.
- inPlaceMonthlyRent: total monthly rent across all units/spaces.
- annualGrossIncome: also called "Gross Scheduled Income", "GSI", "Effective Gross Income".
- noi: also called "Net Operating Income", "NOI", "Annual NOI", "Net Income", "Annual Net Income".
- annualOperatingExpenses: also called "Total Expenses", "Operating Expenses", "OpEx", "Total Ann Oper Exp".

FIELDS: address, city, state, zip, assetClass, listPrice, buildingSqft, lotSizeAcres, yearBuilt, totalUnits, occupancyPct, inPlaceMonthlyRent, annualGrossIncome, annualOperatingExpenses, noi, capRate, leaseType, tenantName, leaseTerm

DOCUMENT TEXT:
${text}`;

  try {
    const resp = await fetch("https://autumn-shape-7ddf.maarouni.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) throw new Error("API error " + resp.status);
    const data = await resp.json();
    if (data?.error) throw new Error(data.error.message || "API error");
    const raw = data?.content?.[0]?.text || "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    const numFields = ["listPrice","buildingSqft","lotSizeAcres","yearBuilt","totalUnits",
      "occupancyPct","inPlaceMonthlyRent","annualGrossIncome","annualOperatingExpenses","noi","capRate","leaseTerm"];
    numFields.forEach(f => { if (parsed[f] != null) parsed[f] = normNum(parsed[f]); });
    return parsed;
  } catch(e) {
    return { _parseError: true, _errorMsg: e.message };
  }
}

// ─── OM · T-12 Import Tab (CRE) ───────────────────────────────────────────────
function OmImportTab({ onLoad, queue, setQueue, openDealInNewTab }) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const processFile = useCallback(async (file, idx) => {
    if (!file.name.endsWith(".pdf")) {
      setQueue(q => q.map((item, i) => i === idx ? { ...item, status: "error", error: "Not a PDF file." } : item));
      return;
    }
    setQueue(q => q.map((item, i) => i === idx ? { ...item, status: "detecting" } : item));
    try {
      const pageTexts = await extractPdfText(file);
      const docType = detectDocType(pageTexts.join("\n"));
      setQueue(q => q.map((item, i) => i === idx ? { ...item, status: "parsing", docType } : item));
      const extracted = await extractWithClaudeCRE(pageTexts, docType);
      if (extracted._parseError) {
        setQueue(q => q.map((item, i) => i === idx ? { ...item, status: "error",
          error: extracted._errorMsg || "AI extraction failed — try re-uploading." } : item));
        return;
      }
      const result = { ...extracted, fileName: file.name, docType };
      setQueue(q => q.map((item, i) => i === idx ? { ...item, status: "done", result } : item));
    } catch (e) {
      setQueue(q => q.map((item, i) => i === idx ? { ...item, status: "error", error: e.message || "Parse failed." } : item));
    }
  }, []);

  const addFiles = useCallback((files) => {
    const MAX_MB = 20;
    const existingNames = queue.map(q => q.file?.name || q.result?.fileName || "");
    const pdfs = Array.from(files)
      .filter(f => f.name.endsWith(".pdf"))
      .filter(f => {
        if (f.size > MAX_MB * 1024 * 1024) { alert(`"${f.name}" exceeds ${MAX_MB}MB and was skipped.`); return false; }
        if (existingNames.includes(f.name)) { alert(`"${f.name}" is already in the queue.`); return false; }
        return true;
      })
      .slice(0, 8 - queue.length);
    if (!pdfs.length) return;
    setQueue(prev => {
      const startIdx = prev.length;
      const newItems = pdfs.map(file => ({ file, status: "queued", docType: null, result: null, error: null }));
      setTimeout(() => { pdfs.forEach((f, i) => processFile(f, startIdx + i)); }, 0);
      return [...prev, ...newItems];
    });
  }, [queue.length, processFile]);

  const removeItem = (idx) => setQueue(q => q.filter((_, i) => i !== idx));

  const dt = (type) => DOC_TYPES[type] || DOC_TYPES.UNKNOWN;
  const sl = (item) => {
    if (item.status === "queued")    return { text: "Queued",       color: C.muted };
    if (item.status === "detecting") return { text: "Reading…",     color: C.gold };
    if (item.status === "parsing")   return { text: "Extracting…",  color: C.gold };
    if (item.status === "done")      return { text: "Ready ✓",      color: C.green };
    if (item.status === "error")     return { text: "Error",        color: C.red };
    return { text: "—", color: C.muted };
  };

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Drop zone */}
      <div style={{ background: C.navyMid, borderRadius: 10, padding: "16px",
        border: `1px solid ${C.border}`, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 4 }}>
          📂 Upload CRE Documents
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
          Drop up to <strong style={{ color: C.white }}>8 PDFs</strong> at once —
          Offering Memorandums and T-12 financials are auto-classified and extracted.
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {Object.entries(DOC_TYPES).filter(([k]) => k !== "UNKNOWN").map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 4,
              background: v.color + "18", border: `1px solid ${v.color}40`,
              borderRadius: 6, padding: "3px 8px", fontSize: 10 }}>
              <span>{v.icon}</span>
              <span style={{ color: v.color, fontWeight: 600 }}>{v.label}</span>
            </div>
          ))}
        </div>
        <div
          onClick={() => fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          style={{ border: `2px dashed ${dragOver ? C.gold : C.border}`, borderRadius: 10,
            padding: "28px 16px", textAlign: "center", cursor: "pointer",
            background: dragOver ? C.navyLt + "80" : C.navyLt, transition: "all 0.2s" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 13, color: C.gold, fontWeight: 600 }}>Click to upload or drag & drop</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>OM · T-12 — PDF only · max 8 files</div>
        </div>
        <input ref={fileRef} type="file" accept=".pdf" multiple style={{ display: "none" }}
          onChange={e => addFiles(e.target.files)} />
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div style={{ background: C.navyMid, borderRadius: 10, padding: "16px",
          border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>
              📋 Documents ({queue.length}/8)
            </div>
            <button onClick={() => { if (window.confirm("Clear all documents from the queue?")) setQueue([]); }}
              style={{ background: "transparent", border: `1px solid ${C.border}`,
              color: C.muted, borderRadius: 5, padding: "2px 8px", fontSize: 10, cursor: "pointer" }}>
              Clear all</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {queue.map((item, idx) => {
              const type = dt(item.docType); const s = sl(item);
              return (
                <div key={idx} style={{ background: C.navyLt, borderRadius: 8,
                  padding: "12px", border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", marginBottom: item.result ? 8 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 16 }}>{type.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: C.white, fontWeight: 600,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.file?.name || item.result?.fileName || "Restored document"}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                          {item.docType && (
                            <span style={{ fontSize: 9, color: type.color, fontWeight: 700,
                              background: type.color + "18", borderRadius: 4, padding: "1px 5px" }}>
                              {type.label}
                            </span>
                          )}
                          <span style={{ fontSize: 9, color: s.color, fontWeight: 600 }}>{s.text}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeItem(idx)} style={{ background: "transparent",
                      border: "none", color: C.muted, cursor: "pointer",
                      fontSize: 14, padding: "0 4px", flexShrink: 0 }}>✕</button>
                  </div>

                  {(item.status === "detecting" || item.status === "parsing") && (
                    <div style={{ fontSize: 11, color: C.gold, marginTop: 4 }}>
                      {item.status === "detecting" ? "⏳ Detecting document type…" : "⏳ Extracting CRE financials via AI…"}
                    </div>
                  )}
                  {item.status === "error" && (
                    <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>⚠️ {item.error}</div>
                  )}

                  {item.status === "done" && item.result && (() => {
                    const r = item.result;
                    const addr = [r.address, r.city, r.state].filter(Boolean).join(", ");
                    const pills = [
                      ["Price",  r.listPrice             ? "$" + Number(r.listPrice).toLocaleString() : null],
                      ["NOI",    r.noi                   ? "$" + Number(r.noi).toLocaleString() + "/yr" : null],
                      ["Cap",    r.capRate               ? Number(r.capRate).toFixed(2) + "%" : null],
                      ["SF",     r.buildingSqft          ? Number(r.buildingSqft).toLocaleString() + " sf" : null],
                      ["Occ",    r.occupancyPct          ? r.occupancyPct + "%" : null],
                      ["Lease",  r.leaseType             || null],
                    ].filter(([, v]) => v != null);
                    const hasData = pills.length > 0 || !!addr;
                    const isNNN = (r.leaseType || "").toString().toUpperCase().includes("NNN");
                    const missingRent = !r.inPlaceMonthlyRent && !r.annualGrossIncome;
                    const missingOpex = !r.annualOperatingExpenses && !isNNN; // NNN: tenant covers OpEx directly — nothing to find, not an error
                    return (
                      <>
                        {!hasData && (
                          <div style={{ fontSize: 11, color: "#E8A020", marginBottom: 8,
                            background: "#7B4A0022", border: "1px solid #C9A84C40",
                            borderRadius: 6, padding: "6px 10px" }}>
                            ⚠️ No financial data extracted. This may be image-based, scanned, or non-CRE. Manual entry required.
                          </div>
                        )}
                        {hasData && (missingRent || missingOpex) && (
                          <div style={{ fontSize: 11, color: "#E8A020", marginBottom: 8,
                            background: "#7B4A0022", border: "1px solid #C9A84C40",
                            borderRadius: 6, padding: "6px 10px" }}>
                            ⚠️ {missingRent && missingOpex ? "Rent and OpEx were" : missingRent ? "Rent was" : "OpEx was"} not found in this document — enter {missingRent && missingOpex ? "them" : "it"} manually after loading.
                          </div>
                        )}
                        {addr && (
                          <div style={{ fontSize: 11, color: C.gold, fontWeight: 600,
                            marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            📍 {addr}
                          </div>
                        )}
                        {pills.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                            {pills.map(([k, v]) => (
                              <div key={k} style={{ background: C.navy, borderRadius: 5, padding: "3px 7px", fontSize: 10 }}>
                                <span style={{ color: C.muted }}>{k}: </span>
                                <span style={{ color: C.white, fontWeight: 700 }}>{v}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => onLoad(r, idx)}
                            style={{ flex: 1, padding: "9px",
                              background: hasData ? C.gold : C.muted,
                              border: "none", color: C.navy, borderRadius: 7,
                              cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                            {hasData ? "⚡ Load into Analyzer →" : "⚡ Load anyway (manual entry required)"}
                          </button>
                          {item.dealId && (
                            <button onClick={() => openDealInNewTab(item.dealId)}
                              title="Open this deal in a new browser tab"
                              style={{ padding: "9px 12px",
                                background: "transparent", border: `1px solid ${C.border}`,
                                color: C.muted, borderRadius: 7,
                                cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                              ↗
                            </button>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 10, textAlign: "center" }}>
            AI extraction reads asking price, NOI, cap rate, SF, occupancy, and lease terms (~3 sec/file)
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Multi-deal storage helpers ───────────────────────────────────────────────
// Each loaded OM/T-12 gets its own storage namespace instead of one shared
// bucket, so several deals can be loaded — and compared — without
// overwriting each other's numbers.
function makeId() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const DEAL_FIELDS = [
  ["purchasePrice", 300000], ["monthlyRent", 2000], ["downPct", 20],
  ["mortgageRate", 6.5], ["mortgageTerm", 30], ["monthlyExpenses", 300],
  ["economicVacancy", 5], ["appreciationRate", 3], ["rentGrowthRate", 3],
  ["timeHorizon", 10], ["brokerFeePct", 2.5], ["leaseType", "Gross"],
  ["rentBumpPct", 10], ["rentBumpYears", 5], ["tenantCredit", "Non-Rated"],
  ["propAddress", ""], ["propZip", ""],
  ["needsPrice", false], ["needsRent", false], ["needsExpenses", false],
];

function dealKey(dealId, field) { return "cre_deal_" + dealId + "_" + field; }
function readDealField(dealId, field, def) {
  try { const v = localStorage.getItem(dealKey(dealId, field)); return v !== null ? JSON.parse(v) : def; } catch { return def; }
}
function writeDealField(dealId, field, value) {
  try { localStorage.setItem(dealKey(dealId, field), JSON.stringify(value)); } catch {}
}
function readDealBundle(dealId) {
  const bundle = {};
  DEAL_FIELDS.forEach(([key, def]) => { bundle[key] = readDealField(dealId, key, def); });
  return bundle;
}
function readDealIndex() {
  try { return JSON.parse(localStorage.getItem("cre_dealIndex") || "[]"); } catch { return []; }
}
function writeDealIndex(idx) {
  try { localStorage.setItem("cre_dealIndex", JSON.stringify(idx)); } catch {}
}

// Same field-mapping logic that used to live inline in loadFromOm, but
// writes straight to a deal's storage slot instead of through React
// setters, since the deal being loaded may not be the mounted/active one.
// Preserves any financing/growth assumptions already saved for this deal
// (e.g. re-loading the same document after tweaking its inputs).
function applyExtractionToDeal(dealId, r) {
  const next = readDealBundle(dealId);

  if (r.address || r.city) next.propAddress = [r.address, r.city, r.state].filter(Boolean).join(", ");
  if (r.zip) next.propZip = String(r.zip);

  if (r.listPrice) { next.purchasePrice = Number(r.listPrice); next.needsPrice = false; }
  else if (r.docType === "T12") { next.purchasePrice = 0; next.needsPrice = true; }

  if (r.inPlaceMonthlyRent)      { next.monthlyRent = Number(r.inPlaceMonthlyRent); next.needsRent = false; }
  else if (r.annualGrossIncome)  { next.monthlyRent = Math.round(Number(r.annualGrossIncome) / 12); next.needsRent = false; }
  else                            next.needsRent = true;

  const ltRaw = (r.leaseType || "").toString().toUpperCase();
  const isNNN = ltRaw.includes("NNN") || ltRaw.includes("TRIPLE");

  if (r.annualOperatingExpenses) { next.monthlyExpenses = Math.round(Number(r.annualOperatingExpenses) / 12); next.needsExpenses = false; }
  else if (isNNN)                { next.monthlyExpenses = 0; next.needsExpenses = false; }
  else                            next.needsExpenses = true;

  if (r.leaseType) {
    if (isNNN) next.leaseType = "NNN";
    else if (ltRaw.includes("MODIFIED")) next.leaseType = "Modified Gross";
    else next.leaseType = "Gross";
  }

  DEAL_FIELDS.forEach(([key]) => writeDealField(dealId, key, next[key]));
  return next;
}

// Plain global (not deal-scoped) persistence — for app-level state like
// which tab is active, shared across every loaded deal.
function useGlobalPersist(key, def) {
  const [val, setVal] = useState(() => {
    try { const v = localStorage.getItem("cre_" + key); return v !== null ? JSON.parse(v) : def; } catch { return def; }
  });
  const set = (v) => {
    setVal(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem("cre_" + key, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  return [val, set];
}

// ─── Compare Tab ────────────────────────────────────────────────────────────
function CompareTab({ dealIndex, switchToDeal, openDealInNewTab, removeFromCompare }) {
  const rows = dealIndex.map(d => {
    const bundle = readDealBundle(d.id);
    const m = calcMetrics(bundle);
    const grade = m.coc >= 15 ? "A" : m.coc >= 12 ? "B" : m.coc >= 9 ? "C" : m.coc >= 6 ? "D" : "F";
    const gCol = { A: C.green, B: "#6FCF97", C: C.gold, D: C.orange, F: C.red }[grade];
    return { id: d.id, address: bundle.propAddress || d.address || d.fileName || "Untitled Deal", bundle, m, grade, gCol };
  });

  if (rows.length === 0) {
    return (
      <div style={{ background: C.navyMid, borderRadius: 10, padding: "28px",
        border: `1px solid ${C.border}`, textAlign: "center", color: C.muted, fontSize: 13 }}>
        No deals loaded yet. Go to the OM · T-12 tab, upload documents, and click
        "Load into Analyzer" on each one you want to compare.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginBottom: 10 }}>
        ⚖️ Comparing {rows.length} Deal{rows.length !== 1 ? "s" : ""}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
        {rows.map(row => (
          <div key={row.id} style={{ background: C.navyMid, borderRadius: 10,
            border: `1px solid ${C.border}`, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: C.white, fontWeight: 700, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }} title={row.address}>{row.address}</div>
              <div style={{ background: row.gCol + "22", border: `1.5px solid ${row.gCol}`,
                borderRadius: 6, padding: "1px 7px", fontSize: 11, fontWeight: 900, color: row.gCol, flexShrink: 0 }}>{row.grade}</div>
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>
              ${Number(row.bundle.purchasePrice).toLocaleString()} · {row.bundle.leaseType}
            </div>
            {[
              ["Cap Rate", row.m.capRate.toFixed(2) + "%"],
              ["DSCR", row.m.dscr.toFixed(2) + "×"],
              ["Cash-on-Cash", row.m.coc.toFixed(2) + "%"],
              ["IRR (Total)", row.m.irrTotal != null ? row.m.irrTotal.toFixed(2) + "%" : "N/A"],
              ["Equity Multiple", row.m.eqMult.toFixed(2) + "×"],
              ["Yr 1 Cash Flow", "$" + Math.round(row.m.cf1).toLocaleString()],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between",
                fontSize: 11, padding: "3px 0", borderBottom: `1px solid ${C.gridLine}` }}>
                <span style={{ color: C.muted }}>{k}</span>
                <span style={{ color: C.white, fontWeight: 700 }}>{v}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button onClick={() => switchToDeal(row.id)} style={{ flex: 1, padding: "7px",
                background: C.gold, border: "none", color: C.navy, borderRadius: 6,
                cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Edit</button>
              <button onClick={() => openDealInNewTab(row.id)} style={{ flex: 1, padding: "7px",
                background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
                borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Open in Tab ↗</button>
            </div>
            <button onClick={() => removeFromCompare(row.id)} style={{ width: "100%", marginTop: 6,
              padding: "5px", background: "transparent", border: "none", color: C.muted,
              cursor: "pointer", fontSize: 10 }}>Remove from comparison</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────
// Widget owns app-level state shared across every loaded deal: which tab
// you're on, the document queue, and the registry of loaded deals. Per-deal
// inputs (price, rent, financing assumptions, etc.) live in DealWorkspace,
// keyed by dealId — React fully remounts DealWorkspace when you switch
// deals, so each one reads its own storage slot fresh instead of inheriting
// whatever was in memory for the previous deal.
function Widget({ userName }) {
  const [activeTab, setActiveTab] = useGlobalPersist("activeTab", "import");

  const [omQueue, setOmQueueRaw] = useState(() => {
    try { const q = JSON.parse(localStorage.getItem("cre_omQueue") || "[]");
      return q.map(item => ({...item, file: null, status: item.status === "done" ? "done" : "queued"}));
    } catch { return []; }
  });
  const setOmQueue = (updater) => {
    setOmQueueRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { localStorage.setItem("cre_omQueue", JSON.stringify(next.map(({file, ...rest}) => rest))); } catch {}
      return next;
    });
  };

  const [dealIndex, setDealIndexState] = useState(() => readDealIndex());
  const setDealIndex = (updater) => {
    setDealIndexState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      writeDealIndex(next);
      return next;
    });
  };

  const [activeDealId, setActiveDealIdState] = useState(() => {
    try {
      const urlId = new URLSearchParams(window.location.search).get("deal");
      const idx = readDealIndex();
      if (urlId && idx.some(d => d.id === urlId)) return urlId;

      // One-time migration: if this is the first load after the multi-deal
      // update and there's data sitting under the old flat keys, adopt it
      // as the first deal instead of losing it.
      if (idx.length === 0 && localStorage.getItem("cre_purchasePrice") !== null) {
        const legacyId = makeId();
        DEAL_FIELDS.forEach(([key]) => {
          const old = localStorage.getItem("cre_" + key);
          if (old !== null) localStorage.setItem(dealKey(legacyId, key), old);
        });
        let addr = "Untitled Deal";
        try { const a = JSON.parse(localStorage.getItem("cre_propAddress") || '""'); if (a) addr = a; } catch {}
        writeDealIndex([{ id: legacyId, address: addr, updatedAt: Date.now() }]);
        return legacyId;
      }

      const last = localStorage.getItem("cre_lastActiveDeal");
      if (last && idx.some(d => d.id === last)) return last;
      if (idx.length > 0) return idx[idx.length - 1].id;
    } catch {}
    return makeId();
  });
  const setActiveDealId = (id) => {
    try { localStorage.setItem("cre_lastActiveDeal", id); } catch {}
    setActiveDealIdState(id);
  };

  // Load (or re-load) an extraction result into its own deal slot, then
  // switch this tab to view it. Re-clicking "Load into Analyzer" on a
  // document you already loaded updates that same deal instead of
  // creating a duplicate.
  const loadFromOm = (r, queueIdx) => {
    const dealId = omQueue[queueIdx]?.dealId || makeId();
    const bundle = applyExtractionToDeal(dealId, r);
    setDealIndex(idx => {
      const filtered = idx.filter(d => d.id !== dealId);
      return [...filtered, { id: dealId, address: bundle.propAddress || r.fileName || "Untitled Deal", fileName: r.fileName, docType: r.docType, updatedAt: Date.now() }];
    });
    setOmQueue(q => q.map((item, i) => i === queueIdx ? { ...item, dealId } : item));
    setActiveDealId(dealId);
    setActiveTab("deal");
  };

  const switchToDeal = (id) => { setActiveDealId(id); setActiveTab("deal"); };

  const openDealInNewTab = (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set("deal", id);
    window.open(url.toString(), "_blank");
  };

  const removeFromCompare = (id) => {
    setDealIndex(idx => idx.filter(d => d.id !== id));
  };

  return (
    <DealWorkspace
      key={activeDealId}
      dealId={activeDealId}
      userName={userName}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      omQueue={omQueue}
      setOmQueue={setOmQueue}
      loadFromOm={loadFromOm}
      dealIndex={dealIndex}
      switchToDeal={switchToDeal}
      openDealInNewTab={openDealInNewTab}
      removeFromCompare={removeFromCompare}
    />
  );
}

function DealWorkspace({ dealId, userName, activeTab, setActiveTab, omQueue, setOmQueue,
  loadFromOm, dealIndex, switchToDeal, openDealInNewTab, removeFromCompare }) {
  const ls = (key, def) => { try { const v = localStorage.getItem(dealKey(dealId, key)); return v !== null ? JSON.parse(v) : def; } catch { return def; } };
  const save = (key, val) => { try { localStorage.setItem(dealKey(dealId, key), JSON.stringify(val)); } catch {} };
  const usePersist = (key, def) => {
    const [val, setVal] = useState(() => ls(key, def));
    const set = (v) => { const next = typeof v === "function" ? v(val) : v; save(key, next); setVal(next); };
    return [val, set];
  };
  const [purchasePrice,    setPurchasePrice]    = usePersist("purchasePrice", 300000);
  const [monthlyRent,      setMonthlyRent]      = usePersist("monthlyRent", 2000);
  const [downPct,          setDownPct]          = usePersist("downPct", 20);
  const [mortgageRate,     setMortgageRate]     = usePersist("mortgageRate", 6.5);
  const [mortgageTerm,     setMortgageTerm]     = usePersist("mortgageTerm", 30);
  const [monthlyExpenses,  setMonthlyExpenses]  = usePersist("monthlyExpenses", 300);
  const [economicVacancy,  setEconomicVacancy]  = usePersist("economicVacancy", 5);
  const [appreciationRate, setAppreciationRate] = usePersist("appreciationRate", 3);
  const [rentGrowthRate,   setRentGrowthRate]   = usePersist("rentGrowthRate", 3);
  const [timeHorizon,      setTimeHorizon]      = usePersist("timeHorizon", 10);
  const [brokerFeePct,     setBrokerFeePct]     = usePersist("brokerFeePct", 2.5);
  const [leaseType,        setLeaseType]        = usePersist("leaseType", "Gross");
  const [rentBumpPct,      setRentBumpPct]      = usePersist("rentBumpPct", 10);
  const [rentBumpYears,    setRentBumpYears]    = usePersist("rentBumpYears", 5);
  const [tenantCredit,     setTenantCredit]     = usePersist("tenantCredit", "Non-Rated");
  const [propAddress,      setPropAddress]      = usePersist("propAddress", "");
  const [propZip,          setPropZip]          = usePersist("propZip", "");
  const [needsPrice,    setNeedsPrice]    = usePersist("needsPrice", false);
  const [needsRent,     setNeedsRent]     = usePersist("needsRent", false);
  const [needsExpenses, setNeedsExpenses] = usePersist("needsExpenses", false);
  const [emailAddr,  setEmailAddr]  = useState("");
  const [emailSent,  setEmailSent]  = useState(false);

  const m = calcMetrics({
    purchasePrice, monthlyRent, downPct, mortgageRate, mortgageTerm,
    monthlyExpenses, economicVacancy, appreciationRate, rentGrowthRate,
    timeHorizon, brokerFeePct, leaseType, rentBumpPct, rentBumpYears, tenantCredit,
  });

  const grade  = m.coc >= 15 ? "A" : m.coc >= 12 ? "B" : m.coc >= 9 ? "C" : m.coc >= 6 ? "D" : "F";
  const gCol   = { A: C.green, B: "#6FCF97", C: C.gold, D: C.orange, F: C.red }[grade];

  const tab = (id, label) => (
    <button onClick={() => setActiveTab(id)} style={{
      padding: "8px 0", border: "none", cursor: "pointer", fontSize: 12, flex: 1,
      background: activeTab === id ? C.navy : "transparent",
      color: activeTab === id ? C.gold : C.muted,
      borderBottom: activeTab === id ? `2px solid ${C.gold}` : "2px solid transparent",
      fontWeight: activeTab === id ? 700 : 400,
    }}>{label}</button>
  );

  return (
    <div style={{ fontFamily: "'Calibri','Segoe UI',sans-serif", background: C.navy,
      color: C.white, minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: C.navyMid, borderBottom: `2px solid ${C.gold}`,
        padding: "12px 20px", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 10, color: C.gold, letterSpacing: 3, textTransform: "uppercase" }}>
            RealEstate-Analytics.ai
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "Georgia,serif" }}>
            🏢 CRE Deal Analyzer
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>
            Model rents, expenses, leverage, and returns over your hold period.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 11, color: C.muted }}>
            👤 {userName.charAt(0).toUpperCase() + userName.slice(1)}
          </div>
          <div style={{ textAlign: "center", background: gCol + "22",
            border: `2px solid ${gCol}`, borderRadius: 10, padding: "6px 18px" }}>
            <div style={{ fontSize: 9, color: gCol, letterSpacing: 2 }}>GRADE</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: gCol, lineHeight: 1 }}>{grade}</div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: C.navyMid, borderBottom: `1px solid ${C.border}`,
        display: "flex", flexShrink: 0 }}>
        {tab("import",  "📂 OM · T-12")}
        {tab("deal",     "Deal Analyzer")}
        {tab("compare",  `⚖️ Compare${dealIndex.length ? " (" + dealIndex.length + ")" : ""}`)}
        {tab("insights", "Insights")}
        {tab("report",   "Agent Report")}
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar — hidden on import and compare tabs */}
        {activeTab !== "import" && activeTab !== "compare" && <div style={{ width: 200, background: C.navyMid,
          borderRight: `1px solid ${C.border}`,
          padding: "14px 12px", overflowY: "auto", flexShrink: 0, fontSize: 12 }}>

          <div style={{ fontSize: 11, color: C.gold, fontWeight: 700,
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
            🚀 Property Information
          </div>

          <button onClick={() => {
            if (!window.confirm("Reset this deal's inputs to defaults? Your other loaded deals won't be affected.")) return;
            try { DEAL_FIELDS.forEach(([key]) => localStorage.removeItem(dealKey(dealId, key))); } catch {}
            window.location.reload();
          }} style={{width:"100%",padding:"5px",marginBottom:10,background:"transparent",
            border:`1px solid ${C.border}`,color:C.muted,borderRadius:5,
            fontSize:10,cursor:"pointer"}}>↺ Clear Deal &amp; Reset</button>

          <Label>Property Address (optional)</Label>
          <input placeholder="123 Main St" value={propAddress} onChange={e=>setPropAddress(e.target.value)} style={{ width: "100%", boxSizing: "border-box",
            background: C.navyLt, border: `1px solid ${C.border}`, borderRadius: 5,
            padding: "5px 8px", color: C.white, fontSize: 12, marginBottom: 10 }} />

          <Label>ZIP Code (optional)</Label>
          <input placeholder="94526" value={propZip} onChange={e=>setPropZip(e.target.value)} style={{ width: "100%", boxSizing: "border-box",
            background: C.navyLt, border: `1px solid ${C.border}`, borderRadius: 5,
            padding: "5px 8px", color: C.white, fontSize: 12, marginBottom: 12 }} />

          {needsPrice && (
            <div style={{background:"#7B4A0022",border:"1px solid #C9A84C",borderRadius:6,
              padding:"7px 10px",marginBottom:8,fontSize:11,color:"#C9A84C"}}>
              ⚠️ T-12 documents don&apos;t include asking price — enter it manually below.
            </div>
          )}
          <PlusMinusInput label="Acquisition Price ($)" value={purchasePrice}
            min={50000} max={50000000} step={10000}
            display={v => "$" + v.toLocaleString()} onChange={v=>{setPurchasePrice(v);setNeedsPrice(false);}} />

          {needsRent && (
            <div style={{background:"#7B4A0022",border:"1px solid #C9A84C",borderRadius:6,
              padding:"7px 10px",marginBottom:8,fontSize:11,color:"#C9A84C"}}>
              ⚠️ Rent wasn&apos;t found in this document — the value below is a placeholder, not real data. Enter it manually.
            </div>
          )}
          <PlusMinusInput label="In-Place Rent ($/mo)" value={monthlyRent}
            min={200} max={500000} step={100}
            display={v => "$" + v.toLocaleString()} onChange={v=>{setMonthlyRent(v);setNeedsRent(false);}} />

          {needsExpenses && (
            <div style={{background:"#7B4A0022",border:"1px solid #C9A84C",borderRadius:6,
              padding:"7px 10px",marginBottom:8,fontSize:11,color:"#C9A84C"}}>
              ⚠️ Operating expenses weren&apos;t found in this document — the value below is a placeholder, not real data. Enter it manually.
            </div>
          )}
          <PlusMinusInput label="Operating Expenses (OpEx) ($/mo)" value={monthlyExpenses}
            min={0} max={200000} step={50}
            display={v => "$" + v.toLocaleString()} onChange={v=>{setMonthlyExpenses(v);setNeedsExpenses(false);}}
            note="Includes property tax, insurance, and miscellaneous costs" />

          <SelectInput label="Lease Type" value={leaseType}
            options={["Gross", "Modified Gross", "NNN"]} onChange={setLeaseType} />

          <SelectInput label="Tenant Credit" value={tenantCredit}
            options={["Investment Grade", "Non-Rated", "Franchisee"]} onChange={setTenantCredit} />

          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: C.gold, fontWeight: 700,
              letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              💰 Financing & Growth
            </div>
            <SliderInput label="Equity Contribution (%)" value={downPct}
              min={5} max={60} display={v => v + "%"} onChange={setDownPct} />
            <SliderInput label="Loan Interest Rate (%)" value={mortgageRate}
              min={3} max={12} step={0.125} display={v => v.toFixed(3) + "%"} onChange={setMortgageRate} />
            <PlusMinusInput label="Amortization Term (years)" value={mortgageTerm}
              min={10} max={30} step={5} display={v => v + " yr"} onChange={setMortgageTerm} />
            <SliderInput label="Economic Vacancy (%)" value={economicVacancy}
              min={0} max={30} display={v => v + "%"} onChange={setEconomicVacancy} />
            <SliderInput label="Annual Appreciation (%)" value={appreciationRate}
              min={0} max={10} step={0.5} display={v => v + "%"} onChange={setAppreciationRate} />
            <SliderInput label="Annual Rent Growth (%)" value={rentGrowthRate}
              min={0} max={10} step={0.5} display={v => v + "%"} onChange={setRentGrowthRate} />
            <PlusMinusInput label="Hold Period (Years)" value={timeHorizon}
              min={1} max={20} display={v => v + " yr"} onChange={setTimeHorizon} />
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: C.gold, fontWeight: 700,
              letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              ⚙️ CRE Advanced
            </div>
            <SliderInput label="Broker Fee (%)" value={brokerFeePct}
              min={0} max={6} step={0.25} display={v => v.toFixed(2) + "%"} onChange={setBrokerFeePct} />
            <SliderInput label="Rent Bump (%)" value={rentBumpPct}
              min={0} max={25} display={v => v + "%"} onChange={setRentBumpPct} />
            <SliderInput label="Bump Every N Years" value={rentBumpYears}
              min={1} max={10} display={v => "Every " + v + " yr"} onChange={setRentBumpYears} />
          </div>

          {leaseType === "NNN" && (
            <div style={{ background: C.green + "18", border: `1px solid ${C.green}40`,
              borderRadius: 7, padding: "8px 10px", fontSize: 11,
              color: C.green, marginTop: 8 }}>
              ✓ NNN: Tenant covers all OpEx. Expenses set to $0.
            </div>
          )}
        </div>}

        {/* Main panel */}
        <div style={{ flex: 1, padding: "16px 18px", overflowY: "auto" }}>

          {activeTab === "import" && <OmImportTab onLoad={loadFromOm} queue={omQueue} setQueue={setOmQueue} openDealInNewTab={openDealInNewTab}/>}

          {activeTab === "compare" && <CompareTab dealIndex={dealIndex} switchToDeal={switchToDeal}
            openDealInNewTab={openDealInNewTab} removeFromCompare={removeFromCompare} />}

          {activeTab === "deal" && <>
            <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginBottom: 10 }}>
              📈 Long-Term Metrics
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <Pill label="IRR (Operational) (%)" value={m.irrOp != null ? m.irrOp.toFixed(2) : "N/A"}
                color={m.irrOp != null && m.irrOp >= 0 ? C.white : C.red} />
              <Pill label="IRR (Total incl. Sale) (%)" value={m.irrTotal != null ? m.irrTotal.toFixed(2) : "N/A"}
                color={m.irrTotal != null && m.irrTotal >= 8 ? C.green : C.gold} />
              <Pill label="Equity Multiple" value={m.eqMult.toFixed(2) + "×"} color={C.goldLt} />
              <Pill label="DSCR (Year 1)" value={m.dscr.toFixed(2)}
                color={m.dscr >= 1.25 ? C.green : m.dscr >= 1 ? C.gold : C.red} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <Pill label="Cap Rate (%)" value={m.capRate.toFixed(2)}
                color={m.capRate >= 6 ? C.green : C.gold} />
              <Pill label="Cash-on-Cash (%)" value={m.coc.toFixed(2)}
                color={m.coc >= 8 ? C.green : m.coc >= 0 ? C.gold : C.red} />
              <Pill label="Yr 1 Cash Flow" value={"$" + Math.round(m.cf1).toLocaleString()}
                color={m.cf1 >= 0 ? C.green : C.red} />
              <Pill label="Monthly Mortgage" value={"$" + Math.round(m.mortgage).toLocaleString()}
                color={C.white} />
            </div>

            <div style={{ background: C.navyMid, borderRadius: 10, padding: "12px 14px",
              border: `1px solid ${C.border}`, marginBottom: 12 }}>
              <DSCRBar val={m.dscr} />
            </div>

            <div style={{ background: C.navyMid, borderRadius: 10, padding: "14px 16px",
              border: `1px solid ${C.border}`, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginBottom: 10 }}>
                📊 Multi-Year Cash Flow Projection
              </div>
              <div style={{ background: "#0d1b35", borderRadius: 8, padding: "10px 6px" }}>
                <MultiLineChart cashFlows={m.cashFlows} rents={m.rents}
                  rois={m.rois} timeHorizon={timeHorizon} />
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 6, textAlign: "center" }}>
                Hold Period Cash Flow, Rent & ROI — {timeHorizon} Year Projection
              </div>
            </div>
          </>}

          {activeTab === "insights" && (
            <div style={{ background: C.navyMid, borderRadius: 10, padding: "16px",
              border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 12 }}>
                💡 Deal Insights
              </div>
              {[
                ["Annual NOI (Yr 1)", "$" + Math.round(
                  monthlyRent * (1 - economicVacancy / 100) * 12 -
                  (leaseType === "NNN" ? 0 : leaseType === "Modified Gross"
                    ? monthlyExpenses * 0.5 * 12 : monthlyExpenses * 12)
                ).toLocaleString()],
                ["Down Payment",          "$" + Math.round(m.down).toLocaleString()],
                ["Loan Amount",           "$" + Math.round(purchasePrice - m.down).toLocaleString()],
                ["Monthly Mortgage",      "$" + Math.round(m.mortgage).toLocaleString()],
                ["Lease Type",            leaseType],
                ["Tenant Credit Tier",    tenantCredit],
                ["Broker Fee at Sale",    "$" + Math.round(purchasePrice * brokerFeePct / 100).toLocaleString()],
                ["Rent Yr " + timeHorizon + " (annual)", "$" + m.rents[m.rents.length - 1]?.toLocaleString()],
                ["Total Cash Flow (" + timeHorizon + " yr)", "$" + m.cashFlows.reduce((a, b) => a + b, 0).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between",
                  padding: "7px 0", borderBottom: `1px solid ${C.gridLine}` }}>
                  <span style={{ color: C.muted, fontSize: 12 }}>{k}</span>
                  <span style={{ color: C.white, fontWeight: 700, fontSize: 12 }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === "report" && (
            <div>
              <div style={{ background: C.navyMid, borderRadius: 10, padding: "16px",
                border: `1px solid ${C.border}`, marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 12 }}>
                  📄 Reports & Export
                </div>

                {/* User Manual — direct PDF link */}
                <a href="./Investment_Metrics_User_Guide_v2.pdf"
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", width: "100%", padding: "11px", marginBottom: 10,
                    background: "transparent", border: `1px solid ${C.gold}`,
                    color: C.gold, borderRadius: 8, cursor: "pointer", fontSize: 13,
                    fontWeight: 600, textAlign: "center", textDecoration: "none",
                    boxSizing: "border-box" }}>
                  📘 Download User Manual (PDF)
                </a>

                {/* PDF Report — generated client-side */}
                <button onClick={() => {
                  const lines = [
                    "CRE Deal Analyzer — RealEstate-Analytics.ai",
                    "Generated: " + new Date().toLocaleDateString(),
                    propAddress ? "Property: " + propAddress + (propZip ? " " + propZip : "") : "",
                    "---",
                    "PROPERTY INPUTS",
                    "Acquisition Price: $" + purchasePrice.toLocaleString(),
                    "In-Place Rent: $" + monthlyRent.toLocaleString() + "/mo",
                    "Operating Expenses: $" + monthlyExpenses.toLocaleString() + "/mo",
                    "Lease Type: " + leaseType,
                    "Tenant Credit: " + tenantCredit,
                    "Equity Contribution: " + downPct + "%",
                    "Loan Interest Rate: " + mortgageRate + "%",
                    "Amortization: " + mortgageTerm + " years",
                    "Economic Vacancy: " + economicVacancy + "%",
                    "Annual Appreciation: " + appreciationRate + "%",
                    "Annual Rent Growth: " + rentGrowthRate + "%",
                    "Hold Period: " + timeHorizon + " years",
                    "Broker Fee: " + brokerFeePct + "%",
                    "---",
                    "RESULTS",
                    "Cap Rate: " + m.capRate.toFixed(2) + "%",
                    "Cash-on-Cash: " + m.coc.toFixed(2) + "%",
                    "IRR (Operational): " + m.irrOp != null ? m.irrOp.toFixed(2) + "%" : "N/A",
                    "IRR (Total incl. Sale): " + m.irrTotal != null ? m.irrTotal.toFixed(2) + "%" : "N/A",
                    "Equity Multiple: " + m.eqMult.toFixed(2) + "x",
                    "DSCR (Year 1): " + m.dscr.toFixed(2),
                    "Year 1 Cash Flow: $" + Math.round(m.cf1).toLocaleString(),
                    "Monthly Mortgage: $" + Math.round(m.mortgage).toLocaleString(),
                    "---",
                    "MULTI-YEAR CASH FLOWS",
                    m.cashFlows.map((v, i) => "Year " + (i+1) + ": $" + v.toLocaleString()).join("\n"),
                    "---",
                    "realestate-analytics.ai | 925-353-5263",
                  ];
                  const text = lines.join("\n");
                  const blob = new Blob([text], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "CRE_Deal_Analysis_" + (propAddress ? propAddress.replace(/[^a-zA-Z0-9]/g,"_").slice(0,30) + "_" : "") + new Date().toISOString().slice(0,10) + ".txt";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                  style={{ width: "100%", padding: "11px", marginBottom: 10,
                    background: "transparent", border: `1px solid ${C.gold}`,
                    color: C.gold, borderRadius: 8, cursor: "pointer", fontSize: 13,
                    fontWeight: 600, boxSizing: "border-box" }}>
                  📊 Download Deal Report (.txt)
                </button>
              </div>

              <div style={{ background: C.navyMid, borderRadius: 10, padding: "16px",
                border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 12 }}>
                  ✉️ Email This Report
                </div>
                <Label>Enter email address to send the report</Label>
                <input type="email" placeholder="you@example.com" value={emailAddr}
                  onChange={e => { setEmailAddr(e.target.value); setEmailSent(false); }}
                  style={{ width: "100%", boxSizing: "border-box", background: C.navyLt,
                    border: `1px solid ${C.border}`, borderRadius: 6,
                    padding: "8px 10px", color: C.white, fontSize: 13, marginBottom: 10 }} />
                <button onClick={() => {
                  if (!emailAddr) return;
                  const subject = encodeURIComponent("CRE Deal Analysis — RealEstate-Analytics.ai");
                  const body = encodeURIComponent(
                    "CRE Deal Analyzer Report\n\n" +
                    "Acquisition Price: $" + purchasePrice.toLocaleString() + "\n" +
                    "In-Place Rent: $" + monthlyRent.toLocaleString() + "/mo\n" +
                    "Lease Type: " + leaseType + "\n" +
                    "Tenant Credit: " + tenantCredit + "\n\n" +
                    "RESULTS\n" +
                    "Cap Rate: " + m.capRate.toFixed(2) + "%\n" +
                    "Cash-on-Cash: " + m.coc.toFixed(2) + "%\n" +
                    "IRR (Total): " + m.irrTotal.toFixed(2) + "%\n" +
                    "Equity Multiple: " + m.eqMult.toFixed(2) + "x\n" +
                    "DSCR: " + m.dscr.toFixed(2) + "\n" +
                    "Year 1 Cash Flow: $" + Math.round(m.cf1).toLocaleString() + "\n\n" +
                    "Full analysis: https://maarouni.github.io/cre-deal-analyzer-enh/\n" +
                    "RealEstate-Analytics.ai | 925-353-5263"
                  );
                  window.open("mailto:" + emailAddr + "?subject=" + subject + "&body=" + body);
                  setEmailSent(true);
                }}
                  style={{ width: "100%", padding: "11px",
                    background: emailSent ? C.green : C.gold, border: "none",
                    color: emailSent ? C.white : C.navy, borderRadius: 8,
                    cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  {emailSent ? "✓ Email Draft Opened!" : "Send Email Report"}
                </button>
                {emailSent && (
                  <div style={{ fontSize: 11, color: C.green, marginTop: 8, textAlign: "center" }}>
                    Your email client opened with the report pre-filled for {emailAddr}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, padding: "9px 12px", background: C.navyLt,
            borderRadius: 7, fontSize: 11, color: C.muted,
            borderLeft: `3px solid ${C.gold}` }}>
            💡 Embeddable via single <code style={{ color: C.goldLt }}>&lt;iframe&gt;</code> tag.
            All metrics update in real time. API-powered mode available for CRM integration.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authedUser, setAuthedUser] = useState(null);
  if (!authedUser) return <GateScreen onAuth={setAuthedUser} />;
  return <Widget userName={authedUser} />;
}
