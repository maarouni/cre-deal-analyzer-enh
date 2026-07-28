// InsuranceEstimatePanel_Tier3.js — PROTOTYPE
// True $/SF insurance modeling. Lease-type aware: NNN deals show tenant-paid,
// not a landlord estimate. Office benchmark is CALIBRATED to a real, sourced
// comp (The Cove, 6529 Riverside Ave — CBRE/Argus underwriting, Insurance
// line in Cash Flow: $8,657 Yr1 -> $10,036 Yr6 on 30,444 SF = $0.28-$0.33/SF).
// Other property types remain industry rule-of-thumb until a real comp
// is sourced for them too — labeled accordingly, not blended together.

const C = {
  navy: "#0F1F3D", navyMid: "#1B2A4A", navyLt: "#243558",
  gold: "#C9A84C", white: "#F5F7FA", muted: "#8A9BB5",
  green: "#2ECC8A", red: "#E05C5C", border: "rgba(201,168,76,0.25)",
};

// $/SF/year, Year-1 basis. "verified" = backed by a real underwritten comp.
// "estimate" = industry rule-of-thumb, not yet calibrated to a real deal.
const RATE_PSF = {
  Office:      { rate: 0.28, growth: 0.030, source: "verified", note: "The Cove, Riverside CA — CBRE/Argus Cash Flow, Insurance line" },
  Retail:      { rate: 0.22, growth: 0.030, source: "estimate", note: "Industry rule-of-thumb — no sourced comp yet" },
  Industrial:  { rate: 0.16, growth: 0.030, source: "estimate", note: "Industry rule-of-thumb — no sourced comp yet" },
  Multifamily: { rate: 0.62, growth: 0.030, source: "estimate", note: "Per-unit-derived $/SF avg — no sourced comp yet" },
};

const REGION_MULTIPLIER = {
  "94124": 1.35, "94538": 1.15, "95407": 1.55, "75052": 1.20, "92506": 1.10,
};

export default function InsuranceEstimatePanelTier3({ zip, buildingSF, propertyType, leaseType, onBuildingSFChange }) {
  const isNNN = leaseType === "NNN";
  const mult = REGION_MULTIPLIER[(zip || "").trim()] || 1.0;
  const cfg = RATE_PSF[propertyType] || RATE_PSF.Office;
  const sf = Number(buildingSF) || 0;

  const yr1PSF = cfg.rate * mult;
  const annualYr1 = yr1PSF * sf;
  const yr6PSF = yr1PSF * Math.pow(1 + cfg.growth, 5);
  const annualYr6 = yr6PSF * sf;

  if (isNNN) {
    return (
      <div style={{ background: C.navyMid, borderRadius: 10, padding: "14px 16px",
        border: `1px solid ${C.border}`, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: C.gold, fontWeight: 700, marginBottom: 6 }}>
          🛡️ Insurance — NNN Lease
        </div>
        <div style={{ background: C.green + "18", border: `1px solid ${C.green}40`,
          borderRadius: 7, padding: "8px 10px", fontSize: 11.5, color: C.green }}>
          ✓ Tenant Responsibility. Not a landlord expense — excluded from NOI.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.navyMid, borderRadius: 10, padding: "14px 16px",
      border: `1px solid ${C.border}`, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>
          🛡️ Insurance Estimate — {propertyType || "Office"}, $/SF
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 700,
          color: cfg.source === "verified" ? C.green : C.muted,
          background: (cfg.source === "verified" ? C.green : C.muted) + "22",
          borderRadius: 6, padding: "3px 10px" }}>
          {cfg.source === "verified" ? "✓ Verified comp" : "Estimate — unsourced"}
        </div>
      </div>

      {!sf ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>Building SF:</span>
          <input
            type="number"
            placeholder="e.g. 30444"
            style={{ width: 120, background: C.navy, border: `1px solid ${C.gold}`,
              borderRadius: 6, padding: "6px 8px", fontSize: 13, color: C.white }}
            onChange={e => onBuildingSFChange && onBuildingSFChange(Number(e.target.value) || 0)}
          />
          <span style={{ fontSize: 10.5, color: C.muted }}>← type here to calculate</span>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 24, marginBottom: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10.5, color: C.muted }}>Year 1 ($/SF)</div>
              <div style={{ fontSize: 16, color: C.white, fontWeight: 700 }}>${yr1PSF.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: C.muted }}>Year 1 Annual</div>
              <div style={{ fontSize: 16, color: C.white, fontWeight: 700 }}>${Math.round(annualYr1).toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: C.muted }}>Year 6 ($/SF)</div>
              <div style={{ fontSize: 16, color: C.white, fontWeight: 700 }}>${yr6PSF.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: C.muted }}>Year 6 Annual</div>
              <div style={{ fontSize: 16, color: C.white, fontWeight: 700 }}>${Math.round(annualYr6).toLocaleString()}</div>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: C.muted, fontStyle: "italic" }}>
            {cfg.note}. Regional factor {mult.toFixed(2)}x applied for ZIP {zip || "—"}.
            {cfg.source !== "verified" && " Confirm with a local insurance broker before underwriting."}
            {" "}
            <span style={{ cursor: "pointer", color: C.gold, textDecoration: "underline" }}
              onClick={() => onBuildingSFChange && onBuildingSFChange(0)}>
              Edit SF
            </span>
          </div>
        </>
      )}
    </div>
  );
}
