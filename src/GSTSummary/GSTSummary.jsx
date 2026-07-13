import React, { useState, useEffect, useCallback } from "react";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import "./GSTSummary.css";
import { getAuth } from "firebase/auth";
import BackButton from "../components/BackButton";
import BottomNavigationBar from "../components/BottomNavigationBar";
import { useNavigate } from "react-router-dom";

const GSTSummary = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [financialYear, setFinancialYear] = useState(null);
    const [financialYears, setFinancialYears] = useState([]);
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [sortConfig, setSortConfig] = useState({ key: "functionDate", direction: "desc" });
    const [userAppType, setUserAppType] = useState(null);
    const [uniqueModes, setUniqueModes] = useState([]);

    const parseToIST = (dateInput) => {
        if (!dateInput) return null;

        // Firestore Timestamp
        if (dateInput.toDate) {
            return dateInput.toDate(); // already local (IST)
        }

        // DD-MM-YYYY
        if (typeof dateInput === "string" && /^\d{2}-\d{2}-\d{4}$/.test(dateInput)) {
            const [dd, mm, yyyy] = dateInput.split("-").map(Number);
            return new Date(yyyy, mm - 1, dd); // LOCAL DATE (IST)
        }

        // YYYY-MM-DD (input type="date")
        if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            const [yyyy, mm, dd] = dateInput.split("-").map(Number);
            return new Date(yyyy, mm - 1, dd); // LOCAL DATE (IST)
        }

        // ISO string
        return new Date(dateInput);
    };

    const [paymentMode, setPaymentMode] = useState("");

    const getCurrentFY = useCallback(() => {
        const today = parseToIST(new Date());
        const month = today.getMonth() + 1;
        return month >= 4 ? today.getFullYear() : today.getFullYear() - 1;
    }, []);

    const today = React.useMemo(() => {
        const d = parseToIST(new Date());
        d.setHours(23, 59, 59, 999);
        return d;
    }, []);

    // today.setHours(23, 59, 59, 999);

    // Format IST date as DD-MM-YYYY
    const formatDateIST = (dateInput) => {
        const d = parseToIST(dateInput);
        if (!d) return "-";

        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();

        return `${day}-${month}-${year}`;
    };

    // ✅ Fetch user app type
    useEffect(() => {
        const fetchUserAppType = async () => {
            const auth = getAuth();
            const user = auth.currentUser;
            if (user) {
                try {
                    const userRef = doc(db, "usersAccess", user.email);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        setUserAppType(userSnap.data().accessToApp);
                    }
                } catch (err) {
                    console.error("Error fetching user app type:", err);
                }
            }
        };
        fetchUserAppType();
    }, []);

    // ✅ Fetch and merge Firestore data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);

            try {
                const snapshot = await getDocs(collection(db, "prebookings"));

                const bookingMap = new Map();
                const fySet = new Set();       // 🔥 FY from RECEIPT DATE only
                const modeSet = new Set();

                // 1️⃣ Extract FY ONLY FROM RECEIPT DATE
                snapshot.forEach((outerDoc) => {
                    const docData = outerDoc.data();

                    Object.entries(docData).forEach(([subId, subData]) => {
                        if (!subData?.advancePayments || subData.advancePayments.length === 0) return;

                        subData.advancePayments.forEach((payment) => {
                            if (!payment.amount || !payment.receiptDate) return;
                            if (payment.mode === "Cash") return;

                            // Track payment modes too
                            modeSet.add(payment.mode);

                            // Extract FY from receipt date
                            // const receipt = parseToIST(payment.receiptDate);
                            // const month = receipt.getMonth() + 1;
                            // const fy = month >= 4 ? receipt.getFullYear() : receipt.getFullYear() - 1;

                            // fySet.add(fy);

                            if (!subData.functionDate) return;

                            const fDate = parseToIST(subData.functionDate);
                            if (!fDate || isNaN(fDate)) return;

                            const month = fDate.getMonth() + 1;
                            const fy = month >= 4 ? fDate.getFullYear() : fDate.getFullYear() - 1;

                            fySet.add(fy);

                        });
                    });
                });

                // 2️⃣ Convert fySet to dropdown list
                const fyList = Array.from(fySet).sort((a, b) => b - a);
                setFinancialYears(fyList);

                // 3️⃣ Select DEFAULT FY
                const currentFY = getCurrentFY();
                if (fySet.has(currentFY)) {
                    setFinancialYear(currentFY);
                } else if (fyList.length > 0) {
                    setFinancialYear(fyList[0]); // latest FY with receipts
                }

                // 4️⃣ Create bookings for table (only data grouping)
                snapshot.forEach((outerDoc) => {
                    const docData = outerDoc.data();

                    Object.entries(docData).forEach(([subId, subData]) => {
                        if (!subData.advancePayments || subData.advancePayments.length === 0) return;

                        const key = `${outerDoc.id}-${subId}`;

                        subData.advancePayments.forEach((payment) => {
                            if (!payment.amount || !payment.receiptDate) return;
                            if (payment.mode === "Cash") return;

                            const amount = Number(payment.amount);

                            if (!bookingMap.has(key)) {
                                bookingMap.set(key, {
                                    name: subData.partyName || subData.name || "Unknown",
                                    functionDate: subData.functionDate,
                                    payments: [],
                                });
                            }

                            bookingMap.get(key).payments.push({
                                mode: payment.mode,
                                amount,
                                receiptDate: payment.receiptDate,
                            });
                        });
                    });
                });

                // 5️⃣ FINAL bookings array
                const bookings = Array.from(bookingMap.values()).map((b) => ({
                    ...b,
                    amount: b.payments.reduce((sum, p) => sum + p.amount, 0),
                }));

                setData(bookings);
                setUniqueModes(Array.from(modeSet));
            }

            catch (err) {
                console.error("Error fetching prebookings:", err);
            }

            finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [getCurrentFY]);

    // ✅ Filtering logic
    const handleFilter = useCallback(() => {
        let filtered = [...data];

        // Only past functionDate
        filtered = filtered.filter((entry) => {
            // functionDate nahi hai → ALLOW (data escape mat karo)
            if (!entry.functionDate) return true;

            const fDate = parseToIST(entry.functionDate);

            // Invalid date → ALLOW
            if (!fDate || isNaN(fDate)) return true;

            // Past only
            return fDate <= today;
        });

        // Financial year filter (based on RECEIPT DATE)
        if (financialYear) {
            const fyStart = parseToIST(`${financialYear}-04-01`);
            const fyEnd = parseToIST(`${financialYear + 1}-03-31`);

            filtered = filtered.filter(entry => {
                if (!entry.functionDate) return false;

                const fDate = parseToIST(entry.functionDate);
                if (!fDate || isNaN(fDate)) return false;

                return fDate >= fyStart && fDate <= fyEnd;
            });
        }


        // From/To date filter
        if (fromDate && toDate) {
            const from = parseToIST(fromDate);
            const to = parseToIST(toDate);
            filtered = filtered.filter((entry) => {
                const fDate = parseToIST(entry.functionDate);
                return fDate >= from && fDate <= to;
            });
        }

        // Payment mode filter
        // Payment mode filter → SHOW ONLY ENTRIES HAVING THIS MODE
        if (paymentMode) {
            filtered = filtered.filter((entry) =>
                entry.payments.some((p) => p.mode === paymentMode)
            );

            // Also remove other payment modes inside same entry
            filtered = filtered
                .map(entry => {
                    const modePayments = entry.payments.filter(p => p.mode === paymentMode);
                    if (!modePayments.length) return null;

                    return {
                        ...entry,
                        payments: modePayments,
                        amount: modePayments.reduce((sum, p) => sum + p.amount, 0),
                    };
                })
                .filter(Boolean);

        }

        // Sorting
        if (sortConfig.key) {
            filtered = [...filtered].sort((a, b) => {
                const dateA = sortConfig.key === "functionDate"
                    ? parseToIST(a.functionDate)
                    : parseToIST(a.payments[0]?.receiptDate);

                const dateB = sortConfig.key === "functionDate"
                    ? parseToIST(b.functionDate)
                    : parseToIST(b.payments[0]?.receiptDate);

                return sortConfig.direction === "asc" ? dateA - dateB : dateB - dateA;
            });
        }

        setFilteredData(filtered);
    }, [data, financialYear, fromDate, toDate, paymentMode, sortConfig, today]);

    useEffect(() => {
        if (data.length > 0) handleFilter();
    }, [data, financialYear, fromDate, toDate, paymentMode, sortConfig, handleFilter]);

    // ✅ Totals
    const totalAll = filteredData.reduce((acc, curr) => acc + curr.amount, 0);
    const gst = totalAll * 0.18;

    const getTotalByMode = (mode) =>
        filteredData.reduce(
            (sum, entry) =>
                sum +
                entry.payments.filter((p) => p.mode === mode).reduce((s, p) => s + p.amount, 0),
            0
        );

    const modeTotals = uniqueModes.map((mode) => ({
        mode,
        total: getTotalByMode(mode),
    }));

    const handlePrint = () => {
        if (!filteredData.length) return;

        // Generate HTML table rows dynamically
        const rowsHTML = filteredData
            .map((entry, idx) => `
            <tr>
                <td>${filteredData.length - idx}.</td>
                <td>${entry.name}</td>
                <td>${entry.functionDate ? formatDateIST(entry.functionDate) : '-'}</td>
                <td>
                    ${entry.payments.map(p => formatDateIST(p.receiptDate)).join('<br>')}
                </td>
            <td>
                <div>
                    Amounts:
                </div>
                    ${entry.payments.map(p => "₹" + p.amount.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })).join("<br>")}
                <div>
                    Total: ₹${entry.amount.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}
                </div>
            </td>
                <td>${entry.payments.map(p => p.mode).join('<br>')}</td>
            </tr>
        `).join('');

        // Mode wise totals for print
        const modeSummaryHTML = `
    ${modeTotals
                .filter(mt => mt.total > 0)
                .map(mt => {
                    const gstForMode = mt.total * 0.18;
                    return `
                <p>
                    <strong>${mt.mode}:</strong> 
                    ₹${mt.total.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}
                    &nbsp; → &nbsp;
                    <strong>GST 18%:</strong> 
                    ₹${gstForMode.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
            `;
                })
                .join("")}
`;


        // Final summary including mode totals + total amount
        const totalsHTML = `
    ${modeSummaryHTML}
    <p style="margin-top:8px"><strong>Total Sale:</strong> ₹${totalAll.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })} (incl. GST)</p>
    <p><strong>GST @18%:</strong> ₹${gst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
`;


        // Auto-calc From–To if empty
        let from = fromDate;
        let to = toDate;

        if (!fromDate || !toDate) {
            from = `${financialYear}-04-01`;
            to = `${financialYear + 1}-03-31`;
        }

        const fromToHTML = `
    <p><strong>From:</strong> ${from} &nbsp;&nbsp; <strong>To:</strong> ${to}</p>
`;


        const printHTML = `
        <html>
        <head>
            <title>GST Summary (FY: ${financialYear}-${financialYear + 1})</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
                h2 { text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; font-size: 12px; }
                th { background-color: #eef6ff; }
                p { font-weight: bold; margin: 4px 0; }
            </style>
        </head>
        <body>
            <h2>📊 GST Summary (FY: ${financialYear}-${financialYear + 1})</h2>
          ${fromToHTML}
${totalsHTML}

            <table>
                <thead>
                    <tr>
                        <th>Sl No.</th>
                        <th>Name</th>
                        <th>Function Date</th>
                        <th>Receipt Dates</th>
                        <th>Amount</th>
                        <th>Payment Modes</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHTML}
                </tbody>
            </table>
        </body>
        </html>
    `;

        // Create hidden iframe and print
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        document.body.appendChild(iframe);

        iframe.contentDocument.open();
        iframe.contentDocument.write(printHTML);
        iframe.contentDocument.close();

        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    };

    return (
        <div className="page-scroller">
            <div className="gst-summary-wrapper">
                <div style={{ marginBottom: "70px" }}> <BackButton /> </div>

                <h2 className="gst-title">📊 GST Summary</h2>

                {/* Filters */}
                <div>

                    <div className="filter-row">

                        <div className="filter-item">
                            <label>Financial Year:</label>
                            <select
                                value={financialYear ?? ""}
                                onChange={(e) => setFinancialYear(Number(e.target.value))}
                            >
                                {financialYears.length === 0 ? (
                                    <option value="">No FY Found</option>
                                ) : (
                                    financialYears.map((y) => (
                                        <option key={y} value={y}>
                                            {y}-{y + 1}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        <div className="filter-item">
                            <label>From:</label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                            />
                        </div>

                        <div className="filter-item">
                            <label>To:</label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                            />
                        </div>

                        <div className="filter-item">
                            <label>Mode:</label>
                            <select
                                value={paymentMode}
                                onChange={(e) => setPaymentMode(e.target.value)}
                            >
                                <option value="">All</option>
                                {uniqueModes.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        </div>

                    </div>

                    <div className="filter-buttons" style={{ display: "flex", marginTop: "15px", justifyContent: "center" }}>
                        <button onClick={handlePrint}>🖨️ Print</button>
                    </div>

                </div>

                <div id="print-area">
                    {loading ? (
                        <p className="loading">Loading data...</p>
                    ) : (
                        <>
                            <div className="gst-summary">
                                <p style={{ fontWeight: "bold", color: "#006db6" }}>
                                    <strong>Total Sale:</strong> ₹{totalAll.toLocaleString("en-IN", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    })} (incl. GST)
                                </p>
                                {modeTotals
                                    .filter(mt => mt.total > 0)
                                    .map(mt => {
                                        const gstForMode = mt.total * 0.18;
                                        return (
                                            <p key={mt.mode}>
                                                <strong>{mt.mode}: </strong>
                                                ₹{mt.total.toLocaleString("en-IN", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2
                                                })}
                                                &nbsp; → &nbsp;
                                                <strong>GST 18%: </strong>
                                                ₹{gstForMode.toLocaleString("en-IN", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                            </p>
                                        );
                                    })}

                                <p style={{ fontWeight: "bold", color: "red" }}>
                                    <strong>GST @18%:</strong>{" "}
                                    ₹{gst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>

                            {filteredData.length > 0 ? (
                                <div className="leads-table-container" style={{ padding: "0px" }}>
                                    {/* Table */}
                                    <div className="table-fixed-wrapper">
                                        <table className="leads-table">
                                            <thead>
                                                <tr>
                                                    <th>
                                                        <button
                                                            style={{ backgroundColor: "transparent", padding: "0px !important", fontWeight: "800" }}
                                                            onClick={() =>
                                                                setSortConfig({
                                                                    key: "functionDate",
                                                                    direction: sortConfig.direction === "asc" ? "desc" : "asc",
                                                                })
                                                            }
                                                        >
                                                            Function Date {sortConfig.key === "functionDate" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                        </button>
                                                    </th>
                                                    <th>Sl No.</th>
                                                    <th>Name</th>
                                                    <th>Receipt Date</th>
                                                    <th>Amount</th>
                                                    <th>Payment Modes</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredData.map((entry, idx) => (
                                                    <tr key={idx}>
                                                        <td>{entry.functionDate ? formatDateIST(entry.functionDate) : "-"}</td>
                                                        <td>{filteredData.length - idx}.</td>
                                                        <td>{entry.name}</td>
                                                        <td>
                                                            {entry.payments.map((p, i) => (
                                                                <div key={i}>{p.receiptDate ? formatDateIST(p.receiptDate) : "-"}</div>
                                                            ))}
                                                        </td>
                                                        <td>
                                                            <div style={{ color: "#039f08ff" }}>
                                                                Amounts:
                                                            </div>
                                                            {entry.payments.map((p, i) => (
                                                                <div style={{ color: "#006e04ff" }} key={i}>₹{p.amount.toLocaleString("en-IN", {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2
                                                                })}</div>
                                                            ))}

                                                            {/* Total per booking */}
                                                            <div style={{
                                                                // borderTop: "1px solid #999",
                                                                fontWeight: "bold",
                                                                color: "#0057a6"
                                                            }}>
                                                                Total: ₹{entry.amount.toLocaleString("en-IN", {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2
                                                                })}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            {entry.payments.map((p, i) => (
                                                                <div key={i}>{p.mode}</div>
                                                            ))}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <p className="no-records">No records match the filters.</p>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div style={{ marginBottom: "50px" }}></div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
        </div>
    );
};

export default GSTSummary;
