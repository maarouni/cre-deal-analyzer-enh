// DealRadarCRE.js — CRE Deal Radar (adapted from Residential Deal Radar)
//
// Key differences from the residential version, and why:
// 1. Column casing fixed to match real Chicago Title CRE farm exports:
//    "Number Of Units" / "Number Of Stories" (capital "Of"), confirmed
//    against an actual 2,142-row Sacramento County commercial export.
// 2. Entity-ownership scoring now reads "Owner Name" — present in
//    CRE farm exports (unlike the first residential-schema pull tested,
//    which had no owner-name field at all).
// 3. Data-quality pre-filter added: rows with $0 sales price, $0 building
//    area, or a government owner (State Of / County Of / City Of / USA)
//    are marked EXCLUDED rather than silently scored as low-grade leads —
//    confirmed necessary after finding 23 of 42 real rows were empty
//    tax-roll records, not actual transactions.
// 4. Multifamily bonus removed — apartment use codes are filtered out
//    upstream at the ActiveFarm export stage for CRE, so the signal
//    no longer applies here.
// 5. Motivated-seller signals (tax delinquent, NOD/NTS, absentee/out-of-
//    state owner, entity ownership) are kept — these still meaningfully
//    apply to LLC/institutional CRE ownership. Death/Divorce signals are
//    kept too but will rarely fire for entity-owned commercial parcels;
//    they still apply to individually-held commercial property.

import React, { useState } from "react";

const C = {
  navy: "#0F1F3D", navyMid: "#1B2A4A", navyLt: "#243558",
  gold: "#C9A84C", goldLt: "#F0D98C", white: "#F5F7FA",
  muted: "#8A9BB5", green: "#2ECC8A", red: "#E05C5C",
  orange: "#F2994A", border: "rgba(201,168,76,0.25)",
};

const ENTITY_KEYWORDS = ["LLC", "TRUST", "LIVING TRUST", "INC", " LP", "LTD", "PROPERTIES", "HOLDINGS", "PARTNERS", "GROUP"];
const GOV_KEYWORDS = ["STATE OF", "COUNTY OF", "CITY OF", "USA", "UNITED STATES", "SCHOOL DISTRICT", "REDEVELOPMENT AGENCY"];

function safeStr(val) {
  if (val === null || val === undefined) return "";
  return String(val).trim().toUpperCase();
}
function safeNum(val) {
  if (val === null || val === undefined) return NaN;
  return parseFloat(String(val).replace(/[$,]/g, ""));
}
function yearsOwned(saleDateStr) {
  if (!saleDateStr) return null;
  const d = new Date(saleDateStr);
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

// Data-quality pre-filter — confirmed necessary against real Sacramento export.
function isExcludable(row) {
  const price = safeNum(row["Sales Price"]);
  const bldg = safeNum(row["Building Area"]);
  const owner = safeStr(row["Owner Name"]);
  const isGov = GOV_KEYWORDS.some(k => owner.includes(k));
  const reasons = [];
  if (isNaN(price) || price <= 0) reasons.push("No recorded sale price");
  if (isNaN(bldg) || bldg <= 0) reasons.push("No building area (land/tax-roll record)");
  if (isGov) reasons.push("Government-owned parcel");
  return { excluded: reasons.length > 0, reason: reasons.join("; ") };
}

function scoreRow(row) {
  let score = 0;
  const reasons = [];
  const ownerOcc = safeStr(row["Owner Occupied"]);
  const isAbsentee = ownerOcc === "N";
  if (isAbsentee) { score += 3; reasons.push("Absentee owner (+3)"); }

  const yrs = yearsOwned(row["Sale Date"]);
  if (isAbsentee && yrs !== null && yrs >= 13) { score += 3; reasons.push(`Long-term owner, ${Math.round(yrs)} yrs (+3)`); }

  const mailState = safeStr(row["Mail Address State"]);
  const siteState = safeStr(row["Site Address State"]);
  const mailCity = safeStr(row["Mail Address City"]);
  const siteCity = safeStr(row["Site Address City"]);
  if (isAbsentee && mailState && siteState && mailState !== siteState) { score += 3; reasons.push(`Out-of-state owner (${mailState}) (+3)`); }
  else if (isAbsentee && mailCity && siteCity && mailCity !== siteCity) { score += 1; reasons.push("Out-of-area owner, in-state (+1)"); }

  if (safeStr(row["Tax Delinquent"]) === "Y") { score += 4; reasons.push("Tax delinquent (+4)"); }

  const nod = row["NOD"];
  if (nod && !["", "N", "NAN"].includes(safeStr(nod))) { score += 4; reasons.push("Pre-foreclosure: NOD (+4)"); }
  const nts = row["NTS"];
  if (nts && !["", "N", "NAN"].includes(safeStr(nts))) { score += 5; reasons.push("Pre-foreclosure: NTS scheduled (+5)"); }

  if (safeStr(row["DEATH"]) === "Y") { score += 5; reasons.push("Death on record (+5)"); }
  if (safeStr(row["DIVORCE"]) === "Y") { score += 3; reasons.push("Divorce on record (+3)"); }

  const ownerName = safeStr(row["Owner Name"]);
  const isEntity = ENTITY_KEYWORDS.some(k => ownerName.includes(k));
  if (isEntity) { score += 1; reasons.push("Entity owner: LLC/Trust/Inc (+1)"); }

  // Fixed casing vs. residential version — confirmed against real export headers.
  const stories = parseFloat(row["Number Of Stories"]);
  if (!isNaN(stories) && stories >= 2) { score += 0.5; reasons.push("Multi-story building (+0.5)"); }

  return { score: Math.round(score * 10) / 10, reasons: reasons.join("; ") || "No motivated-seller signals present" };
}

function gradeOf(score) {
  if (score >= 8) return "A";
  if (score >= 4) return "B";
  if (score >= 1) return "C";
  return "D";
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h] = (vals[i] || "").trim().replace(/^"|"$/g, ""));
    return obj;
  });
}

export default function DealRadarCRE() {
  const [rows, setRows] = useState([]);
  const [fileNames, setFileNames] = useState([]);
  const [gradeFilter, setGradeFilter] = useState("ALL");
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList) {
    const files = Array.from(fileList);
    setFileNames(files.map(f => f.name));
    let allRows = [];
    let done = 0;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const parsed = parseCSV(e.target.result);
        const scored = parsed.map(row => {
          const { excluded, reason } = isExcludable(row);
          if (excluded) {
            return { ...row, "Seller Score": null, "Lead Grade": "EXCLUDED", "Score Reasons": reason, "Source File": file.name };
          }
          const { score, reasons } = scoreRow(row);
          return { ...row, "Seller Score": score, "Lead Grade": gradeOf(score), "Score Reasons": reasons, "Source File": file.name };
        });
        allRows = allRows.concat(scored);
        done += 1;
        if (done === files.length) {
          allRows.sort((a, b) => {
            if (a["Lead Grade"] === "EXCLUDED") return 1;
            if (b["Lead Grade"] === "EXCLUDED") return -1;
            return (b["Seller Score"] ?? 0) - (a["Seller Score"] ?? 0);
          });
          setRows(allRows);
        }
      };
      reader.readAsText(file);
    });
  }

  const filteredRows = gradeFilter === "ALL" ? rows : rows.filter(r => r["Lead Grade"] === gradeFilter);
  const counts = { A: 0, B: 0, C: 0, D: 0, EXCLUDED: 0 };
  rows.forEach(r => { if (counts[r["Lead Grade"]] !== undefined) counts[r["Lead Grade"]]++; });
  const gradeColor = { A: C.gold, B: C.green, C: C.muted, D: C.border, EXCLUDED: C.red };

  function downloadCSV() {
    if (filteredRows.length === 0) return;
    const headers = Object.keys(filteredRows[0]);
    const csv = [headers.join(",")].concat(
      filteredRows.map(r => headers.map(h => `"${(r[h] ?? "").toString().replace(/"/g, '""')}"`).join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cre_deal_radar_scored_leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: C.gold, fontWeight: 700, marginBottom: 4 }}>
        🎯 Deal Radar (CRE): A/B/C Leads
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
        Drag in one or more ActiveFarm Commercial CSV exports — get graded leads back instantly, ranked across all files.
        Filtered for retail / office / industrial / entertainment parcels (excludes apartments — see Residential Deal Radar for multifamily).
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => document.getElementById("cre-dealradar-file-input").click()}
        style={{
          border: `2px dashed ${dragOver ? C.gold : C.border}`,
          borderRadius: 8, padding: "24px", textAlign: "center",
          background: dragOver ? C.navyLt : C.navyMid, cursor: "pointer", marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 12.5, color: C.muted }}>
          📂 Drag &amp; drop CSV(s) here, or click to browse
        </div>
        <input id="cre-dealradar-file-input" type="file" accept=".csv" multiple style={{ display: "none" }}
          onChange={e => handleFiles(e.target.files)} />
      </div>

      {fileNames.length > 0 && (
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
          Loaded: {fileNames.join(", ")}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
            {["ALL", "A", "B", "C", "D", "EXCLUDED"].map(g => (
              <button key={g} onClick={() => setGradeFilter(g)}
                style={{
                  padding: "5px 12px", borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                  border: `1px solid ${g === "ALL" ? C.border : gradeColor[g] + "60"}`,
                  background: gradeFilter === g ? (g === "ALL" ? C.navyLt : gradeColor[g] + "22") : "transparent",
                  color: g === "ALL" ? C.white : gradeColor[g], cursor: "pointer",
                }}>
                {g}{g !== "ALL" ? ` (${counts[g] || 0})` : ` (${rows.length})`}
              </button>
            ))}
            <button onClick={downloadCSV}
              style={{ marginLeft: "auto", padding: "5px 14px", borderRadius: 6, fontSize: 11.5,
                fontWeight: 700, border: "none", background: C.gold, color: C.navy, cursor: "pointer" }}>
              ⬇ Export Scored CSV
            </button>
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: C.navyLt }}>
                  {["Grade", "Score", "Address", "City", "Use Code", "Owner Name", "Sales Price", "Reasons"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: C.gold, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "7px 10px", color: gradeColor[r["Lead Grade"]], fontWeight: 700 }}>{r["Lead Grade"]}</td>
                    <td style={{ padding: "7px 10px", color: C.white }}>{r["Seller Score"] ?? "—"}</td>
                    <td style={{ padding: "7px 10px", color: C.white }}>
                      {[r["Site Address House Number"], r["Site Address Street Name"]].filter(Boolean).join(" ")}
                    </td>
                    <td style={{ padding: "7px 10px", color: C.muted }}>{r["Site Address City"]}</td>
                    <td style={{ padding: "7px 10px", color: C.muted }}>{r["Use Code Description"]}</td>
                    <td style={{ padding: "7px 10px", color: C.muted }}>{r["Owner Name"]}</td>
                    <td style={{ padding: "7px 10px", color: C.white }}>
                      {r["Sales Price"] && safeNum(r["Sales Price"]) > 0
                        ? "$" + Math.round(safeNum(r["Sales Price"])).toLocaleString() : "—"}
                    </td>
                    <td style={{ padding: "7px 10px", color: C.muted, maxWidth: 320 }}>{r["Score Reasons"]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: 12, padding: "9px 12px", background: C.navyLt,
        borderRadius: 7, fontSize: 11, color: C.muted, borderLeft: `3px solid ${C.gold}` }}>
        💡 Data-quality filter applied automatically: rows with no recorded sale price, no building
        area, or a government owner are marked EXCLUDED rather than silently scored — confirmed
        necessary after testing against a real Sacramento County export.
      </div>
    </div>
  );
}
