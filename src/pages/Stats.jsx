import React, { useState, useEffect, useCallback } from "react";
import { db } from "../firebaseConfig";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "../styles/StatsPage.css";
import BackButton from "../components/BackButton";
import { getAuth } from "firebase/auth";
import BottomNavigationBar from "../components/BottomNavigationBar";
import { useNavigate } from "react-router-dom";

const INR = (n) => Number(n || 0).toLocaleString("en-IN");

const StatsPage = () => {
  const navigate = useNavigate();
  const [target, setTarget] = useState(1000000);
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([]); // FY years which actually have data
  const [viewMode, setViewMode] = useState("monthly"); // monthly | quarterly | full
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [userAppType, setUserAppType] = useState(null);
  const [allTransactions, setAllTransactions] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null); // monthIndex 0–11
  const [modeFilter, setModeFilter] = useState("all"); // "all" or specific mode string

  // ----------------- HELPERS -----------------
  const formatDateIST = (dateString) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
    } catch {
      return dateString;
    }
  };

  // ----------------- FETCH USER TYPE -----------------
  useEffect(() => {
    const fetchUserType = async () => {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      const ref = doc(db, "usersAccess", user.email);
      const snap = await getDoc(ref);
      if (snap.exists()) setUserAppType(snap.data().accessToApp);
    };
    fetchUserType();
  }, []);

  // ----------------- AVAILABLE FY YEARS (ONLY WHERE DATA EXISTS) -----------------
  const fetchAllYears = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "prebookings"));
      const fyYears = new Set();

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        Object.values(data).forEach((booking) => {
          (booking.advancePayments || []).forEach((p) => {
            const d = new Date(p.receiptDate);
            if (isNaN(d)) return;

            const year = d.getFullYear();
            const month = d.getMonth(); // 0-based
            // FY starts in April → month >= 3
            const fyStartYear = month >= 3 ? year : year - 1;
            fyYears.add(fyStartYear);
          });
        });
      });

      const sorted = [...fyYears].sort((a, b) => a - b);
      setAvailableYears(sorted);

      // Adjust currentYear if it has no data
      if (sorted.length > 0 && !sorted.includes(currentYear)) {
        setCurrentYear(sorted[sorted.length - 1]);
      }
    } catch (err) {
      console.error("Error fetching available FY years:", err);
    }
  }, [currentYear]);

  // ----------------- LOAD TARGET -----------------
  const loadTarget = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, "settings", "stats"));
      if (snap.exists() && snap.data().yearlyTarget) {
        setTarget(snap.data().yearlyTarget);
      }
    } catch (err) {
      console.error("Error loading target:", err);
    }
  }, []);

  const saveTarget = async (val) => {
    try {
      await setDoc(
        doc(db, "settings", "stats"),
        { yearlyTarget: val },
        { merge: true }
      );
    } catch (err) {
      console.error("Error saving target:", err);
    }
  };

  // ----------------- MAIN FETCH: MONTHLY / QUARTERLY / FULL + TRANSACTIONS -----------------
  const fetchMonthlyRevenue = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "prebookings"));
      const monthMap = {}; // monthIndex -> { mode1: amt, mode2: amt }
      const transactions = [];

      snap.forEach((docSnap) => {
        const bookings = docSnap.data();

        Object.values(bookings).forEach((b) => {
          (b.advancePayments || []).forEach((p) => {
            const dt = new Date(p.receiptDate);
            if (isNaN(dt)) return;

            const applyRange = fromDate && toDate;
            const from = new Date(fromDate);
            const to = new Date(toDate);

            const fyStart = new Date(currentYear, 3, 1);
            const fyEnd = new Date(currentYear + 1, 2, 31);

            if (applyRange) {
              if (dt < from || dt > to) return;
            } else {
              if (dt < fyStart || dt > fyEnd) return;
            }

            const idx = dt.getMonth();
            const amount = Number(p.amount || 0);

            if (!monthMap[idx]) monthMap[idx] = {};
            if (!monthMap[idx][p.mode]) monthMap[idx][p.mode] = 0;
            monthMap[idx][p.mode] += amount;

            transactions.push({
              date: p.receiptDate,
              amount,
              mode: p.mode || "Unknown",
              monthIndex: idx,
            });
          });
        });
      });

      setAllTransactions(transactions);

      const months = [
        "April", "May", "June", "July", "August", "September",
        "October", "November", "December", "January", "February", "March"
      ];

      // ---- MONTHLY DATA ----
      const allData = months.map((m, i) => {
        const realMonth = (i + 3) % 12;
        const modes = monthMap[realMonth] || {};
        return {
          month: m,
          monthIndex: realMonth,
          modes,
          generated: Object.values(modes).reduce((a, b) => a + b, 0),
          target: target / 12,
          ...modes
        };
      });

      let finalData = allData;

      // ---- QUARTERLY DATA FIXED ----
      if (viewMode === "quarterly") {
        const quarters = [
          allData.slice(0, 3),
          allData.slice(3, 6),
          allData.slice(6, 9),
          allData.slice(9, 12)
        ];

        finalData = quarters.map((months, i) => {
          const qModes = {};

          months.forEach(m => {
            Object.entries(m.modes).forEach(([mode, amt]) => {
              if (!qModes[mode]) qModes[mode] = 0;
              qModes[mode] += amt;
            });
          });

          return {
            month: `Q${i + 1}`,
            modes: qModes,
            generated: Object.values(qModes).reduce((a, b) => a + b, 0),
            target: target / 4,
            ...qModes
          };
        });
      }

      // ---- FULL YEAR FIXED ----
      if (viewMode === "full") {
        const yearModes = {};

        allData.forEach(m => {
          Object.entries(m.modes).forEach(([mode, amt]) => {
            if (!yearModes[mode]) yearModes[mode] = 0;
            yearModes[mode] += amt;
          });
        });

        finalData = [
          {
            month: `${currentYear}-${currentYear + 1}`,
            modes: yearModes,
            generated: Object.values(yearModes).reduce((a, b) => a + b, 0),
            target,
            ...yearModes
          }
        ];
      }

      setMonthlyData(finalData);
    } catch (e) {
      console.error("Error fetching stats:", e);
    } finally {
      setLoading(false);
    }
  }, [target, currentYear, viewMode, fromDate, toDate]);

  // ----------------- EFFECTS -----------------
  useEffect(() => {
    fetchAllYears();
  }, [fetchAllYears]);

  useEffect(() => {
    loadTarget();
  }, [loadTarget]);

  useEffect(() => {
    fetchMonthlyRevenue();
  }, [fetchMonthlyRevenue]);

  // When viewMode changes, month filter should not affect quarterly/full
  useEffect(() => {
    if (viewMode !== "monthly" && selectedMonth !== null) {
      setSelectedMonth(null);
    }
  }, [viewMode, selectedMonth]);

  // ----------------- DERIVED DATA: FILTERED TRANSACTIONS -----------------
  const filteredTransactions = allTransactions.filter((t) => {
    // Month filter only in monthly view
    if (viewMode === "monthly" && selectedMonth !== null) {
      if (t.monthIndex !== selectedMonth) return false;
    }

    // Mode filter
    if (modeFilter !== "all" && t.mode !== modeFilter) return false;

    return true;
  });

  // Dynamic list of modes
  const allModes = Array.from(
    new Set(allTransactions.map((t) => t.mode || "Unknown"))
  ).sort();

  // CREDIT / DEBIT & MODE-WISE TOTALS (APPLYING FILTERS)
  const totalCredit = filteredTransactions
    .filter((t) => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);

  const totalDebit = filteredTransactions
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + t.amount, 0);

  const netTotal = totalCredit + totalDebit;

  const totalCash = filteredTransactions
    .filter((t) => t.mode === "Cash")
    .reduce((s, t) => s + t.amount, 0);

  const totalBank = filteredTransactions
    .filter((t) => t.mode !== "Cash")
    .reduce((s, t) => s + t.amount, 0);

  const remaining = target - netTotal;

  // ----------------- RENDER -----------------
  return (
    <div className="page-scroller">
      <div style={{ marginBottom: 70 }}>
        <BackButton />
      </div>
      <div className="stats-container">

        <h2>
          📊 Business Stats ({currentYear}-{String(currentYear + 1).slice(-2)})
        </h2>

        {/* FILTER & SETTINGS */}
        <div className="control-section">

          {/* TARGET */}
          <div className="target-input-group">
            <label>🎯 Yearly Target (₹)</label>
            <input
              type="text"
              inputMode="numeric"
              value={INR(target)}
              onChange={(e) => {
                const raw = e.target.value.replace(/,/g, "").replace(/\D/g, "");
                const num = Number(raw || 0);
                setTarget(num);
                saveTarget(num);
              }}
            />
          </div>

          {/* DATE RANGE */}
          <div className="target-input-group">
            <label>📆 From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />

            <label>To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />

            {(fromDate || toDate) && (
              <button
                className="clear-btn"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                }}
              >
                ❌ Clear Date
              </button>
            )}
          </div>

          {/* VIEW MODE + FY */}
          <div className="target-input-group">
            <label>📊 View Mode</label>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="full">Full Year</option>
            </select>

            <label>📅 FY Start Year</label>
            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
            >
              {availableYears.length === 0 && (
                <option value={currentYear}>{currentYear}</option>
              )}
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* LOADING */}
        {loading ? (
          <p className="loading-text">Loading Stats...</p>
        ) : (
          <>
            {/* GRAPH */}
            <ResponsiveContainer width="100%" height={260} style={{ color: "black", display: "none" }}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v) => "₹" + INR(v)} />

                {allModes.map((mode, index) => (
                  <Bar
                    key={mode}
                    dataKey={mode}
                    stackId="a"
                    fill={`hsl(${index * 60}, 70%, 30%)`}
                    name={mode}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {/* MONTH CARDS – only in monthly view */}
            {viewMode === "monthly" && (
              <div className="month-grid">
                {monthlyData
                  .filter(m => m.generated > 0)
                  .map((m) => (
                    <div
                      key={m.monthIndex}
                      className="month-card"
                      onClick={() =>
                        setSelectedMonth(
                          selectedMonth === m.monthIndex ? null : m.monthIndex
                        )
                      }
                      style={{
                        border:
                          selectedMonth === m.monthIndex
                            ? "1px solid #15a4fa"
                            : "1px solid transparent",
                        boxShadow:
                          selectedMonth === m.monthIndex
                            ? "0 0 8px rgba(21,164,250,0.7)"
                            : "none",
                      }}
                    >
                      <strong style={{ color: "violet" }}>{m.month}</strong>

                      {/* MODE-WISE BREAKDOWN */}
                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "13px",
                          lineHeight: "16px",
                        }}
                      >
                        {Object.entries(m.modes).map(([mode, amt]) => (
                          <div key={mode} style={{ fontWeight: 600 }}>
                            {mode}: ₹{INR(amt)}
                          </div>
                        ))}
                      </div>

                      {/* TOTAL */}
                      <div style={{ marginTop: "5px", fontWeight: "bold", color: "green" }}>
                        ₹{INR(m.generated)}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* QUARTERLY CARDS */}
            {viewMode === "quarterly" && (
              <div className="month-grid">
                {monthlyData.map((q, i) => (
                  <div
                    key={i}
                    className="month-card"
                    style={{
                      border: "1px solid #888",
                    }}
                  >
                    <strong style={{ color: "violet" }}>{q.month}</strong>

                    {/* MODE-WISE BREAKDOWN */}
                    <div
                      style={{
                        marginTop: "6px",
                        fontSize: "13px",
                        lineHeight: "16px",
                      }}
                    >
                      {Object.entries(q.modes || {}).map(([mode, amt]) => (
                        <div key={mode} style={{ fontWeight: 600 }}>
                          {mode}: ₹{INR(amt)}
                        </div>
                      ))}
                    </div>

                    {/* TOTAL */}
                    <div style={{ marginTop: "5px", fontWeight: "bold", color: "green" }}>
                      ₹{INR(q.generated)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* FULL YEAR CARD */}
            {viewMode === "full" && monthlyData.length > 0 && (
              <div className="month-grid">
                <div
                  className="month-card"
                  style={{
                    border: "1px solid #888",
                  }}
                >
                  <strong style={{ color: "violet" }}>{monthlyData[0].month}</strong>

                  {/* MODE-WISE BREAKDOWN */}
                  <div
                    style={{
                      marginTop: "6px",
                      fontSize: "13px",
                      lineHeight: "16px",
                    }}
                  >
                    {Object.entries(monthlyData[0].modes || {}).map(([mode, amt]) => (
                      <div key={mode} style={{ fontWeight: 600 }}>
                        {mode}: ₹{INR(amt)}
                      </div>
                    ))}
                  </div>

                  {/* TOTAL */}
                  <div style={{ marginTop: "5px", fontWeight: "bold", color: "green" }}>
                    ₹{INR(monthlyData[0].generated)}
                  </div>
                </div>
              </div>
            )}


            {/* MODE FILTER BUTTONS (DYNAMIC) */}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 15,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {/* ALL MODES */}
              <button
                className="mode-btn"
                onClick={() => setModeFilter("all")}
                style={{
                  background: modeFilter === "all" ? "#15a4fa" : "#333",
                  border: "1px solid #777",
                  padding: "6px 12px",
                  borderRadius: 6,
                  color: "white",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ALL MODES
              </button>

              {/* CASH BUTTON (NEW) */}
              <button
                className="mode-btn"
                onClick={() => setModeFilter(modeFilter === "Cash" ? "all" : "Cash")}
                style={{
                  background: modeFilter === "Cash" ? "#15a4fa" : "#444",
                  border: "1px solid #777",
                  padding: "6px 12px",
                  borderRadius: 6,
                  color: "white",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                CASH
              </button>

              {/* OTHER MODES */}
              {allModes.map((m) => {
                const active = modeFilter === m;
                return (
                  <button
                    key={m}
                    className="mode-btn"
                    onClick={() => setModeFilter(active ? "all" : m)}
                    style={{
                      background: active ? "#15a4fa" : "#444",
                      border: "1px solid #777",
                      padding: "6px 12px",
                      borderRadius: 6,
                      color: "white",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                    }}
                  >
                    {m.toUpperCase()}
                  </button>
                );
              })}
            </div>

            {/* SUMMARY BOX */}
            <div className="summary-row">
              <div>
                <strong>💰 Cash:</strong> ₹{INR(totalCash)}
              </div>
              <div>
                <strong>🏦 Bank:</strong> ₹{INR(totalBank)}
              </div>
              <div>
                <strong>➕ Credit:</strong> ₹{INR(totalCredit)}
              </div>
              <div>
                <strong>➖ Debit:</strong> ₹
                {INR(Math.abs(totalDebit))}
              </div>
              <div>
                <strong>📊 Net Total:</strong> ₹{INR(netTotal)}
              </div>
              {remaining > 0 && (
                <div>
                  <strong>⏳ Remaining Target:</strong> ₹{INR(remaining)}
                </div>
              )}
            </div>

            {/* TRANSACTIONS TABLE */}
            <div className="transaction-table-container">
              <h3>📋 Detailed Payments</h3>

              <table className="transaction-table">
                <thead>
                  <tr style={{}}>
                    <th style={{ backgroundColor: "#fde0e0ff", color: "black", textAlign: "center", fontWeight: "800" }}>Date</th>
                    <th style={{ backgroundColor: "#fde0e0ff", color: "black", textAlign: "center", fontWeight: "800" }}>Mode</th>
                    <th style={{ backgroundColor: "#fde0e0ff", color: "black", textAlign: "center", fontWeight: "800" }}>Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTransactions
                    .sort(
                      (a, b) => new Date(a.date) - new Date(b.date)
                    )
                    .map((t, i) => {
                      const isCredit = t.amount >= 0;
                      return (
                        <tr
                          key={i}
                          style={{
                            background: isCredit
                              ? "#0ba106aa"
                              : "#c40505ac",
                            color: "white",
                            fontWeight: "600"
                          }}
                        >
                          <td>{formatDateIST(t.date)}</td>
                          <td>{t.mode}</td>
                          <td> ₹{INR(t.amount)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div style={{ marginBottom: 60 }} />
      <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
    </div>
  );
};

export default StatsPage;
