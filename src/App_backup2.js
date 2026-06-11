import { useState } from "react";

// ─── Access Control ───────────────────────────────────────────────────────────
const APP_PASSWORD = "InvestAgent_Full1!";
const USER_PINS = {
  masoud: "1234",
  andy:   "7788",
  colin:  "8877",
};

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
    let r = 0.1;
    for (let i = 0; i < 200; i++) {
      const f  = flows.reduce((a, cf, j) => a + cf / (1 + r) ** (j + 1), -down);
      const df = flows.reduce((a, cf, j) => a - (j + 1) * cf / (1 + r) ** (j + 2), 0);
      if (!isFinite(f) || Math.abs(df) < 1e-12) break;
      r -= f / df;
      if (r < -0.99) { r = -0.99; break; }
    }
    return r * 100;
  }

  const irrOp    = irrSolve(cashFlows);
  const irrTotal = irrSolve(cfTotal);
  const eqMult   = down ? cfTotal.reduce((a, b) => a + b, 0) / down : 0;

  return { capRate, coc, dscr, cf1, irrOp, irrTotal, eqMult,
           cashFlows, rents, rois, mortgage, down };
}

// ─── Gate Screen ──────────────────────────────────────────────────────────────
function GateScreen({ onAuth }) {
  const [step,    setStep]    = useState("password"); // "password" | "pin"
  const [pwd,     setPwd]     = useState("");
  const [user,    setUser]    = useState("");
  const [pin,     setPin]     = useState("");
  const [pwdErr,  setPwdErr]  = useState("");
  const [pinErr,  setPinErr]  = useState("");

  function submitPassword() {
    if (pwd === APP_PASSWORD) { setStep("pin"); setPwdErr(""); }
    else setPwdErr("❌ Incorrect password. Please try again.");
  }

  function submitPin() {
    const name = user.toLowerCase().trim();
    if (!USER_PINS[name]) { setPinErr("❌ Username not recognised."); return; }
    if (USER_PINS[name] === pin.trim()) { onAuth(name); }
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
    fontSize: 15, fontWeight: 700, marginTop: 4,
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
            {step === "password" ? "🔒 Enter access password" : "🔑 Enter your username & PIN"}
          </div>
        </div>

        {step === "password" && <>
          <input type="password" placeholder="Access password"
            value={pwd} onChange={e => setPwd(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitPassword()}
            style={inputStyle} />
          {pwdErr && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{pwdErr}</div>}
          <button onClick={submitPassword} style={btnStyle}>Continue →</button>
        </>}

        {step === "pin" && <>
          <input type="text" placeholder="Your username (e.g. andy)"
            value={user} onChange={e => setUser(e.target.value)}
            style={inputStyle} />
          <input type="password" placeholder="Your PIN"
            value={pin} onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitPin()}
            style={inputStyle} />
          {pinErr && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{pinErr}</div>}
          <button onClick={submitPin} style={btnStyle}>Access Analyzer →</button>
          <button onClick={() => { setStep("password"); setPwd(""); setPinErr(""); }}
            style={{ ...btnStyle, background: "transparent", color: C.muted,
              border: `1px solid ${C.border}`, marginTop: 8 }}>
            ← Back
          </button>
        </>}

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
  return (
    <div style={{ marginBottom: 13 }}>
      <Label>{label}</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={() => onChange(Math.max(min, value - step))}
          style={{ width: 28, height: 28, border: `1px solid ${C.border}`,
            background: C.navyLt, color: C.gold, borderRadius: 5,
            cursor: "pointer", fontSize: 16, lineHeight: 1 }}>−</button>
        <div style={{ flex: 1, background: C.navyLt, border: `1px solid ${C.border}`,
          borderRadius: 5, padding: "5px 10px", fontSize: 13,
          color: C.white, textAlign: "center" }}>{display(value)}</div>
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

// ─── Main Widget ──────────────────────────────────────────────────────────────
function Widget({ userName }) {
  const [purchasePrice,    setPurchasePrice]    = useState(300000);
  const [monthlyRent,      setMonthlyRent]      = useState(2000);
  const [downPct,          setDownPct]          = useState(20);
  const [mortgageRate,     setMortgageRate]     = useState(6.5);
  const [mortgageTerm,     setMortgageTerm]     = useState(30);
  const [monthlyExpenses,  setMonthlyExpenses]  = useState(300);
  const [economicVacancy,  setEconomicVacancy]  = useState(5);
  const [appreciationRate, setAppreciationRate] = useState(3);
  const [rentGrowthRate,   setRentGrowthRate]   = useState(3);
  const [timeHorizon,      setTimeHorizon]      = useState(10);
  const [brokerFeePct,     setBrokerFeePct]     = useState(2.5);
  const [leaseType,        setLeaseType]        = useState("Gross");
  const [rentBumpPct,      setRentBumpPct]      = useState(10);
  const [rentBumpYears,    setRentBumpYears]    = useState(5);
  const [tenantCredit,     setTenantCredit]     = useState("Non-Rated");
  const [emailAddr,        setEmailAddr]        = useState("");
  const [emailSent,        setEmailSent]        = useState(false);
  const [activeTab,        setActiveTab]        = useState("deal");

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
        {tab("deal",     "Deal Analyzer")}
        {tab("insights", "Insights")}
        {tab("report",   "Agent Report")}
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{ width: 200, background: C.navyMid,
          borderRight: `1px solid ${C.border}`,
          padding: "14px 12px", overflowY: "auto", flexShrink: 0, fontSize: 12 }}>

          <div style={{ fontSize: 11, color: C.gold, fontWeight: 700,
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
            🚀 Property Information
          </div>

          <Label>Property Address (optional)</Label>
          <input placeholder="123 Main St" style={{ width: "100%", boxSizing: "border-box",
            background: C.navyLt, border: `1px solid ${C.border}`, borderRadius: 5,
            padding: "5px 8px", color: C.white, fontSize: 12, marginBottom: 10 }} />

          <Label>ZIP Code (optional)</Label>
          <input placeholder="94526" style={{ width: "100%", boxSizing: "border-box",
            background: C.navyLt, border: `1px solid ${C.border}`, borderRadius: 5,
            padding: "5px 8px", color: C.white, fontSize: 12, marginBottom: 12 }} />

          <PlusMinusInput label="Acquisition Price ($)" value={purchasePrice}
            min={50000} max={5000000} step={10000}
            display={v => "$" + v.toLocaleString()} onChange={setPurchasePrice} />

          <PlusMinusInput label="In-Place Rent ($/mo)" value={monthlyRent}
            min={200} max={50000} step={100}
            display={v => "$" + v.toLocaleString()} onChange={setMonthlyRent} />

          <PlusMinusInput label="Operating Expenses (OpEx) ($/mo)" value={monthlyExpenses}
            min={0} max={20000} step={50}
            display={v => "$" + v.toLocaleString()} onChange={setMonthlyExpenses}
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
        </div>

        {/* Main panel */}
        <div style={{ flex: 1, padding: "16px 18px", overflowY: "auto" }}>

          {activeTab === "deal" && <>
            <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginBottom: 10 }}>
              📈 Long-Term Metrics
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <Pill label="IRR (Operational) (%)" value={m.irrOp.toFixed(2)}
                color={m.irrOp >= 0 ? C.white : C.red} />
              <Pill label="IRR (Total incl. Sale) (%)" value={m.irrTotal.toFixed(2)}
                color={m.irrTotal >= 8 ? C.green : C.gold} />
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
                    "IRR (Operational): " + m.irrOp.toFixed(2) + "%",
                    "IRR (Total incl. Sale): " + m.irrTotal.toFixed(2) + "%",
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
                  a.download = "CRE_Deal_Analysis_" + new Date().toISOString().slice(0,10) + ".txt";
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
