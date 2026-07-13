import React, { useEffect, useState, useRef } from "react";
import { doc, collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import '../styles//DailyReport.css';
import { RefreshCw } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function DailyReport() {
    const [report, setReport] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showCalendar, setShowCalendar] = useState(false);
    const calendarRef = useRef(null);
    const [showLockerDetails, setShowLockerDetails] = useState(false);
    const [dateSortOrder, setDateSortOrder] = useState("desc");
    const [loanTransactions, setLoanTransactions] = useState([]);
    const [showLoanDetails, setShowLoanDetails] = useState(false);
    const [showLoanPartnerDetails, setShowLoanPartnerDetails] = useState(false);
    const [showPdfOptions, setShowPdfOptions] = useState(false);
    const [includeLockerPdf, setIncludeLockerPdf] = useState(false);
    const [includeLoanPdf, setIncludeLoanPdf] = useState(false);
    const [loanPartnerTransactions, setLoanPartnerTransactions] = useState([]);
    const [includeLoanPartnerPdf, setIncludeLoanPartnerPdf] = useState(false);

    const [lockerReport, setLockerReport] = useState({
        opening: 0,
        today: 0,
        closing: 0,
        names: []
    });

    const getParty = (trx) => {
        const val =
            trx.subNature?.trim().toLowerCase() ||
            trx.name?.trim().toLowerCase();

        if (!val) return null;

        // ❌ remove garbage
        if (["rtgs payment", "profit settlement"].includes(val)) return null;

        return val;
    };

    const formatDate = (dateInput) => {
        if (!dateInput) return "";

        // If already DD-MM-YYYY
        if (typeof dateInput === "string" && dateInput.includes("-") && dateInput.split("-")[0].length !== 4) {
            const [d, m, y] = dateInput.split("-");
            return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }

        // If already YYYY-MM-DD
        if (typeof dateInput === "string" && dateInput.includes("-") && dateInput.split("-")[0].length === 4) {
            return dateInput.trim();
        }

        const date = new Date(dateInput);
        if (isNaN(date)) return "";

        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(date);

        const y = parts.find((p) => p.type === "year").value;
        const m = parts.find((p) => p.type === "month").value;
        const d = parts.find((p) => p.type === "day").value;

        return `${y}-${m}-${d}`;
    };

    const formatDateIST = (dateInput) => {
        if (!dateInput) return "";

        // If already DD-MM-YYYY
        if (typeof dateInput === "string" && dateInput.includes("-") && dateInput.split("-")[0].length !== 4) {
            const [d, m, y] = dateInput.split("-");
            return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
        }

        // If already YYYY-MM-DD
        if (typeof dateInput === "string" && dateInput.includes("-") && dateInput.split("-")[0].length === 4) {
            const [y, m, d] = dateInput.split("-");
            return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
        }

        const date = new Date(dateInput);
        if (isNaN(date)) return "-";

        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(date);

        const y = parts.find((p) => p.type === "year").value;
        const m = parts.find((p) => p.type === "month").value;
        const d = parts.find((p) => p.type === "day").value;

        return `${d}-${m}-${y}`;
    };

    const normalizeCashName = (name = "") => {
        const clean = name.trim().toLowerCase();

        if (
            ["cash", "cash-cash", "cashcash", "cash cash", "cash-", "cash--", "Cash"]
                .includes(clean)
        ) {
            return "Cash In Hand";
        }

        return name;
    };

    useEffect(() => {
        let unsubscribers = [];

        function mergeCash(obj = {}) {
            let merged = {};
            Object.keys(obj).forEach((key) => {
                if (!key) return;
                const clean = String(key).trim().toLowerCase();
                const newKey = [
                    "cash",
                    "cash-cash",
                    "cashcash",
                    "cash cash",
                    "cash-",
                    "cash--",
                    "cash"
                ].includes(clean)
                    ? "Cash In Hand"
                    : key;

                merged[newKey] = (merged[newKey] || 0) + (Number(obj[key]) || 0);
            });
            return merged;
        }

        const formattedDate = formatDate(selectedDate);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        const last24Keys = [];
        let pointer = new Date(selectedDate);

        for (let i = 0; i < 120; i++) {
            const key = `${monthNames[pointer.getMonth()]}${pointer.getFullYear()}`;
            last24Keys.push(key);
            pointer.setMonth(pointer.getMonth() - 1);
        }

        // ✅ हर month key ka latest snapshot yaha store hoga
        const monthCache = new Map();

        const recomputeAll = () => {
            let openingBankBalances = {};
            let openingCashBalances = {};
            let bankCreditToday = {};
            let bankDebitToday = {};
            let cashCreditToday = {};
            let cashDebitToday = {};
            let totalCreditsToday = 0;
            let totalDebitsToday = 0;

            const lockerMap = new Map();
            const loanMap = new Map();
            const partnerLoanMap = new Map();

            monthCache.forEach((monthData) => {
                Object.entries(monthData || {}).forEach(([id, trx]) => {
                    if (!trx || typeof trx !== "object") return;
                    if (String(trx.approval || "").trim() !== "Accepted") return;

                    const amt = Number(String(trx.amount || 0).replace(/,/g, "")) || 0;
                    const type = String(trx.paymentFor || "").trim().toLowerCase();
                    const isCredit = type === "credit";
                    const nature = String(trx.particularNature || "").trim().toLowerCase();
                    const receiptDate = formatDate(trx.receiptDate);

                    const row = {
                        id,
                        slNo: trx.slNo || id,
                        receiptDate,
                        name: trx.partyName?.trim() || "",
                        subNature: trx.subParticularNature?.trim() || trx.partyName?.trim() || "",
                        amount: amt,
                        type: trx.paymentFor || " ",
                        mode: trx.mode || " ",
                    };

                    if (nature === "locker") {
                        lockerMap.set(row.slNo, row);
                    }

                    if (nature === "loans & advance") {
                        loanMap.set(row.slNo, row);
                    }

                    if (nature === "loans & advance (partners)") {
                        partnerLoanMap.set(row.slNo, row);
                    }

                    // OPENING
                    if (receiptDate < formattedDate) {
                        const signed = isCredit ? amt : -amt;

                        if (trx.mode && trx.mode !== "Cash") {
                            openingBankBalances[trx.mode] =
                                (openingBankBalances[trx.mode] || 0) + signed;
                        }

                        if (
                            trx.mode === "Cash" &&
                            trx.cashTo &&
                            !["pettyCash", "lockerBalance"].includes(trx.cashTo)
                        ) {
                            const cashKey = normalizeCashName(trx.cashTo);
                            openingCashBalances[cashKey] =
                                (openingCashBalances[cashKey] || 0) + signed;
                        }
                    }

                    // TODAY
                    if (receiptDate === formattedDate) {
                        if (trx.mode && trx.mode !== "Cash") {
                            if (isCredit) {
                                bankCreditToday[trx.mode] =
                                    (bankCreditToday[trx.mode] || 0) + amt;
                            } else {
                                bankDebitToday[trx.mode] =
                                    (bankDebitToday[trx.mode] || 0) + amt;
                            }
                        }

                        if (
                            trx.mode === "Cash" &&
                            trx.cashTo &&
                            !["pettyCash", "lockerBalance"].includes(trx.cashTo)
                        ) {
                            const cashKey = normalizeCashName(trx.cashTo);

                            if (isCredit) {
                                cashCreditToday[cashKey] =
                                    (cashCreditToday[cashKey] || 0) + amt;
                            } else {
                                cashDebitToday[cashKey] =
                                    (cashDebitToday[cashKey] || 0) + amt;
                            }
                        }

                        if (isCredit) totalCreditsToday += amt;
                        else totalDebitsToday += amt;
                    }
                });
            });

            const mergedOpeningCash = mergeCash(openingCashBalances);

            const finalBankBalances = {};
            Object.keys({ ...openingBankBalances, ...bankCreditToday, ...bankDebitToday }).forEach((bank) => {
                finalBankBalances[bank] =
                    (openingBankBalances[bank] || 0) +
                    (bankCreditToday[bank] || 0) -
                    (bankDebitToday[bank] || 0);
            });

            const finalCashBalances = {};
            Object.keys({ ...mergedOpeningCash, ...cashCreditToday, ...cashDebitToday }).forEach((cash) => {
                finalCashBalances[cash] =
                    (mergedOpeningCash[cash] || 0) +
                    (cashCreditToday[cash] || 0) -
                    (cashDebitToday[cash] || 0);
            });

            const computeRunningBalances = (transactions, defaultKey = "Unknown") => {

                const balances = {};

                const sorted = [...transactions]
                    .filter(trx => {
                        const sub = trx.subNature?.trim().toLowerCase();

                        // ❌ ignore empty & garbage
                        return sub && !["", "rtgs payment", "profit settlement"].includes(sub);
                    })
                    .sort((a, b) => new Date(a.receiptDate || 0) - new Date(b.receiptDate || 0));

                const results = sorted
                    .map(trx => {
                        const key = getParty(trx);
                        if (!key) return null;

                        const amt = Number(trx.amount || 0);
                        const isCredit = trx.type?.toLowerCase() === "credit";

                        const opening = balances[key] || 0;
                        const credit = isCredit ? amt : 0;
                        const debit = isCredit ? 0 : amt;
                        const total = opening + credit - debit;

                        balances[key] = total;

                        return { ...trx, opening, credit, debit, total };
                    })
                    .filter(Boolean);

                return results.sort((a, b) => new Date(b.receiptDate || 0) - new Date(a.receiptDate || 0));
            };

            const lockerTransactions = computeRunningBalances(Array.from(lockerMap.values()), "Locker");
            const finalLoanTransactions = computeRunningBalances(Array.from(loanMap.values()), "General");
            const finalLoanPartnerTransactions = computeRunningBalances(Array.from(partnerLoanMap.values()), "Partner");

            // --- 🔥 ROBUST SUMMARY CALCULATION ---
            const calculateSummary = (transactions, defaultLabel) => {
                const summary = {};
                transactions.forEach(trx => {
                    const raw = trx.subNature || trx.name || defaultLabel;
                    const key = raw.toLowerCase();
                    const amt = Number(trx.amount || 0);
                    const isCredit = trx.type?.toLowerCase() === "credit";

                    if (!summary[key]) {
                        summary[key] = { label: raw, opening: 0, credit: 0, debit: 0, closing: 0 };
                    }

                    if (trx.receiptDate < formattedDate) {
                        summary[key].opening += isCredit ? amt : -amt;
                    } else if (trx.receiptDate === formattedDate) {
                        if (isCredit) summary[key].credit += amt;
                        else summary[key].debit += amt;
                    }
                });

                return Object.values(summary)
                    .map(item => ({ ...item, closing: item.opening + item.credit - item.debit }))
                    .sort((a, b) => b.closing - a.closing);
            };

            const lockerSum = calculateSummary(lockerTransactions, "Locker");
            const loanSum = calculateSummary(finalLoanTransactions, "General");
            const loanPartnerSum = calculateSummary(finalLoanPartnerTransactions, "Partner");

            setLoanTransactions(finalLoanTransactions);
            setLoanPartnerTransactions(finalLoanPartnerTransactions);

            setReport({
                date: formattedDate,
                openingBankBalances,
                openingCashBalances: mergedOpeningCash,
                bankCreditToday,
                bankDebitToday,
                cashCreditToday,
                cashDebitToday,
                finalBankBalances,
                finalCashBalances,
                lockerTransactions,
                lockerNameSummary: lockerSum,
                loanNameSummary: loanSum,
                loanPartnerSummary: loanPartnerSum,
                totalBusiness: totalCreditsToday - totalDebitsToday,
            });
        };

        last24Keys.forEach((key) => {
            const unsub = onSnapshot(doc(db, "moneyReceipts", key), (snap) => {
                if (!snap.exists()) return;

                monthCache.set(key, snap.data());
                recomputeAll();
            });

            unsubscribers.push(unsub);
        });

        /* 🔥 LOCKER REALTIME */
        const unsubLocker = onSnapshot(collection(db, "accountant"), (snap) => {
            let opening = 0;
            let today = 0;
            const names = new Set();

            snap.forEach((docSnap) => {
                if (!docSnap.id.toLowerCase().includes("-locker")) return;

                const lockerName = docSnap.id.split("-Locker")[0];
                names.add(lockerName);

                const { transactions = [] } = docSnap.data();

                transactions.forEach((txn) => {
                    if (!txn || txn.approval !== "approved") return;

                    const amt = Number(txn.amount) || 0;
                    const signed = txn.type === "Credit" ? amt : -amt;

                    const txnDate = formatDate(txn.date);

                    if (txnDate < formattedDate) opening += signed;
                    if (txnDate === formattedDate) today += signed;
                });
            });

            setLockerReport({
                opening,
                today,
                closing: opening + today,
                names: Array.from(names),
            });
        });

        unsubscribers.push(unsubLocker);

        return () => unsubscribers.forEach((u) => u());
    }, [selectedDate]);

    useEffect(() => {
        const close = (e) => {
            if (calendarRef.current && !calendarRef.current.contains(e.target))
                setShowCalendar(false);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, []);

    if (!report) {
        return (
            <div
                className="service-section"
                style={{
                    marginTop: "0px",
                    padding: "0px",
                    textAlign: "center",
                    fontSize: "5px",
                    fontWeight: "700",
                    background: "transparent",
                    boxShadow: "none",
                }}
            >
                <span className="loading-spinner"><RefreshCw size={25} /></span>
            </div>
        );
    }

    const lockerNameSummary = report.lockerNameSummary || [];
    const loanNameSummary = report.loanNameSummary || [];
    const loanPartnerSummary = report.loanPartnerSummary || [];

    const totalOpening = Object.values(report.openingBankBalances || {}).reduce((a, b) => a + b, 0);
    const totalFinal = Object.values(report.finalBankBalances || {}).reduce((a, b) => a + b, 0);
    const totalBankCredit = Object.values(report.bankCreditToday || {}).reduce((a, b) => a + b, 0);
    const totalBankDebit = Object.values(report.bankDebitToday || {}).reduce((a, b) => a + b, 0);
    const totalCashCredit = Object.values(report.cashCreditToday || {}).reduce((a, b) => a + b, 0);
    const totalCashDebit = Object.values(report.cashDebitToday || {}).reduce((a, b) => a + b, 0);
    const grandCredit = totalBankCredit + totalCashCredit + (lockerReport.today > 0 ? lockerReport.today : 0);
    const grandDebit = totalBankDebit + totalCashDebit + (lockerReport.today < 0 ? Math.abs(lockerReport.today) : 0);
    const grandTotalOpening = totalOpening + Object.values(report.openingCashBalances || {}).reduce((a, b) => a + b, 0);
    const grandTotalFinal = totalFinal + Object.values(report.finalCashBalances || {}).reduce((a, b) => a + b, 0);
    const lockerCredit = lockerReport.today > 0 ? lockerReport.today : 0;
    const lockerDebit = lockerReport.today < 0 ? Math.abs(lockerReport.today) : 0;
    const sortedLockerTransactions = [...(report.lockerTransactions || [])].sort(
        (a, b) => {
            const dateA = new Date(a.receiptDate);
            const dateB = new Date(b.receiptDate);

            return dateSortOrder === "asc"
                ? dateA - dateB
                : dateB - dateA;
        }
    );

    const handleDownloadPDF = () => {
        const doc = new jsPDF("l", "pt");

        // 🔥 FIX DIGIT SPACING ISSUE
        doc.setFont("helvetica", "normal");
        doc.setCharSpace(0);

        const money = (v) => {
            const n = Math.round(Number(v || 0));
            return `Rs. ${n.toLocaleString("en-IN")}`;
        };

        /* ===== COLORS ===== */
        const BLUE = [55, 116, 168];
        const TOTAL_BG = [214, 245, 255];

        const safeKeys = (obj) => Object.keys(obj || {});

        /* ===== TITLE ===== */
        doc.setFontSize(18);
        doc.text("Daily Financial Report", 40, 35);

        doc.setFontSize(11);
        doc.text(`Date: ${formatDateIST(report.date)}`, 40, 55);

        let startY = 80;

        const tableCommon = {
            theme: "grid",
            styles: {
                fontSize: 10,
                halign: "right",
                cellPadding: { left: 6, right: 6 },
                overflow: "hidden",
            },
            headStyles: {
                fillColor: BLUE,
                textColor: 255,
                halign: "center",
                fontStyle: "bold",
            },
            columnStyles: {
                0: { halign: "left" },
            },
            didParseCell: (data) => {
                const val = String(data.cell.raw || "");

                if (data.row.raw?.[0] === "TOTAL") {
                    data.cell.styles.fillColor = TOTAL_BG;
                    data.cell.styles.fontStyle = "bold";
                }

                if (val.includes("-")) {
                    data.cell.styles.textColor = [255, 0, 0];
                }
            },
        };

        /* ================= BANK STATEMENT ================= */
        doc.setFontSize(14);
        doc.text("Bank Statement", 40, startY);
        startY += 10;

        autoTable(doc, {
            startY,
            head: [["Bank", "Opening", "Credit", "Debit", "Total"]],
            body: [
                ...safeKeys(report.finalBankBalances).map(bank => ([
                    bank,
                    money(report.openingBankBalances?.[bank] || 0),
                    money(report.bankCreditToday?.[bank] || 0),
                    money(report.bankDebitToday?.[bank] || 0),
                    money(report.finalBankBalances?.[bank] || 0),
                ])),
                [
                    "TOTAL",
                    money(totalOpening),
                    money(totalBankCredit),
                    money(totalBankDebit),
                    money(totalFinal),
                ]
            ],
            ...tableCommon,
            theme: "grid",
            styles: { fontSize: 11, halign: "left" },
            headStyles: tableCommon.headStyles,
            columnStyles: tableCommon.columnStyles,
        });

        startY = doc.lastAutoTable.finalY + 30;

        /* ================= CASH STATEMENT ================= */
        doc.setFontSize(14);
        doc.text("Cash Statement", 40, startY);
        startY += 10;

        const totalCashOpening =
            Object.values(report.openingCashBalances || {}).reduce((a, b) => a + b, 0) +
            (lockerReport?.opening || 0);

        const totalCashCreditFinal =
            Object.values(report.cashCreditToday || {}).reduce((a, b) => a + b, 0) +
            (lockerReport?.today > 0 ? lockerReport.today : 0);

        const totalCashDebitFinal =
            Object.values(report.cashDebitToday || {}).reduce((a, b) => a + b, 0) +
            (lockerReport?.today < 0 ? Math.abs(lockerReport.today) : 0);

        const totalCashClosing =
            Object.values(report.finalCashBalances || {}).reduce((a, b) => a + b, 0) +
            (lockerReport?.closing || 0);

        autoTable(doc, {
            startY,
            head: [["Cash", "Opening", "Credit", "Debit", "Total"]],
            body: [
                ...safeKeys(report.finalCashBalances).map(cash => ([
                    cash,
                    money(report.openingCashBalances?.[cash] || 0),
                    money(report.cashCreditToday?.[cash] || 0),
                    money(report.cashDebitToday?.[cash] || 0),
                    money(report.finalCashBalances?.[cash] || 0),
                ])),
                [
                    "TOTAL",
                    money(totalCashOpening),
                    money(totalCashCreditFinal),
                    money(totalCashDebitFinal),
                    money(totalCashClosing),
                ]
            ],
            ...tableCommon,
            didParseCell: (data) => {
                const rowTitle = data.row.raw?.[0];
                const val = String(data.cell.raw || "");

                if (rowTitle === "TOTAL") {
                    data.cell.styles.fillColor = TOTAL_BG;
                    data.cell.styles.fontStyle = "bold";
                }

                if (val.includes("-")) {
                    data.cell.styles.textColor = [0, 0, 0];
                }
            },
            theme: "grid",
            styles: { fontSize: 11, halign: "left" },
            headStyles: tableCommon.headStyles,
            columnStyles: tableCommon.columnStyles,
        });

        startY = doc.lastAutoTable.finalY + 30;

        /* ================= FINAL TOTAL ================= */
        doc.setFontSize(14);
        doc.text("Final Bank + Cash Total", 40, startY);
        startY += 10;

        autoTable(doc, {
            startY,
            head: [["Type", "Opening", "Credit", "Debit", "Total"]],
            body: [[
                "Bank + Cash",
                money(grandTotalOpening),
                money(grandCredit),
                money(grandDebit),
                money(grandTotalFinal),
            ]],
            theme: "grid",
            styles: { fontSize: 11, halign: "left" },
            headStyles: tableCommon.headStyles,
            columnStyles: tableCommon.columnStyles,
        });












        /* ================= LOCKER SECTION ================= */
        startY = doc.lastAutoTable.finalY + 30;

        if (report.lockerTransactions?.length > 0) {

            doc.setFontSize(14);
            doc.text("Locker Entries", 40, startY);
            startY += 10;

            if (includeLockerPdf) {

                // 🔹 DETAILS TABLE WITH RUNNING BALANCE
                const balances = {};
                const runningData = [...sortedLockerTransactions].sort((a, b) => new Date(a.receiptDate) - new Date(b.receiptDate)).map(trx => {
                    const key = (trx.subNature || "Unknown").trim().toLowerCase();
                    const amt = Number(trx.amount || 0);
                    const isCredit = trx.type?.toLowerCase() === "credit";
                    const opening = balances[key] || 0;
                    const credit = isCredit ? amt : 0;
                    const debit = isCredit ? 0 : amt;
                    const total = opening + credit - debit;
                    balances[key] = total;
                    return { ...trx, opening, credit, debit, total };
                }).sort((a, b) => new Date(b.receiptDate) - new Date(a.receiptDate));

                // 🔹 SUMMARY TABLE
                autoTable(doc, {
                    startY,
                    head: [["Name", "Opening", "Credit", "Debit", "Total"]],
                    body: [
                        ...lockerNameSummary.map(item => ([
                            item.label,
                            money(item.opening),
                            money(item.credit),
                            money(item.debit),
                            money(item.closing)
                        ])),
                        [
                            "TOTAL",
                            money(lockerNameSummary.reduce((s, d) => s + d.opening, 0)),
                            money(lockerNameSummary.reduce((s, d) => s + d.credit, 0)),
                            money(lockerNameSummary.reduce((s, d) => s + d.debit, 0)),
                            money(lockerNameSummary.reduce((s, d) => s + d.closing, 0)),
                        ]
                    ],
                    theme: "grid",
                    styles: { fontSize: 11, halign: "center", borderBottom: "1px sold black" },
                });

                startY = doc.lastAutoTable.finalY + 20;

                doc.setFontSize(14);
                doc.text("Locker Entries Summary", 40, startY);
                startY += 10;

                autoTable(doc, {
                    startY,
                    head: [["Sl", "Date", "Name", "Credit", "Debit",]],
                    body: runningData.map((trx, i) => ([
                        runningData.length - i,
                        formatDateIST(trx.receiptDate),
                        trx.subNature || trx.name || "No Name",

                        money(trx.credit),
                        money(trx.debit)
                    ])),
                    theme: "grid",
                    styles: { fontSize: 11, halign: "left", borderBottom: "1px sold black" },
                });

            } else {

                // 🔹 SUMMARY TABLE
                autoTable(doc, {
                    startY,
                    head: [["Name", "Opening", "Credit", "Debit", "Total"]],
                    body: [
                        ...lockerNameSummary.map(item => ([
                            item.label,
                            money(item.opening),
                            money(item.credit),
                            money(item.debit),
                            money(item.closing)
                        ])),
                        [
                            "TOTAL",
                            money(lockerNameSummary.reduce((s, d) => s + d.opening, 0)),
                            money(lockerNameSummary.reduce((s, d) => s + d.credit, 0)),
                            money(lockerNameSummary.reduce((s, d) => s + d.debit, 0)),
                            money(lockerNameSummary.reduce((s, d) => s + d.closing, 0)),
                        ]
                    ],
                    theme: "grid",
                    styles: { fontSize: 11, halign: "center", borderBottom: "1px sold black" },
                });
            }

            startY = doc.lastAutoTable.finalY + 30;
        }












        /* ================= LOANS SECTION (Partner) ================= */
        startY = doc.lastAutoTable.finalY + 30;

        if (loanPartnerTransactions?.length > 0) {

            doc.setFontSize(14);
            doc.text("Loans & Advance (Partners)", 40, startY);
            startY += 10;

            if (includeLoanPartnerPdf) {

                const balances = {};
                const runningData = [...loanPartnerTransactions].sort((a, b) => new Date(a.receiptDate) - new Date(b.receiptDate)).map(trx => {
                    const key = (trx.subNature || "Partner").trim().toLowerCase();
                    const amt = Number(trx.amount || 0);
                    const isCredit = trx.type?.toLowerCase() === "credit";
                    const opening = balances[key] || 0;
                    const credit = isCredit ? amt : 0;
                    const debit = isCredit ? 0 : amt;
                    const total = opening + credit - debit;
                    balances[key] = total;
                    return { ...trx, opening, credit, debit, total };
                }).sort((a, b) => new Date(b.receiptDate) - new Date(a.receiptDate));

                autoTable(doc, {
                    startY,
                    head: [["Name", "Opening", "Credit", "Debit", "Total"]],
                    body: [
                        ...loanPartnerSummary.map(item => ([
                            item.label,
                            money(item.opening),
                            money(item.credit),
                            money(item.debit),
                            money(item.closing)
                        ])),
                        [
                            "TOTAL",
                            money(loanPartnerSummary.reduce((s, d) => s + d.opening, 0)),
                            money(loanPartnerSummary.reduce((s, d) => s + d.credit, 0)),
                            money(loanPartnerSummary.reduce((s, d) => s + d.debit, 0)),
                            money(loanPartnerSummary.reduce((s, d) => s + d.closing, 0)),
                        ]
                    ],
                    theme: "grid",
                    styles: { fontSize: 11, halign: "left" },
                });

                startY = doc.lastAutoTable.finalY + 20;

                doc.setFontSize(14);
                doc.text("Loans & Advance (Partners) Summary", 40, startY);
                startY += 10;

                autoTable(doc, {
                    startY,
                    head: [["Sl", "Date", "Name", "Credit", "Debit"]],
                    body: runningData.map((trx, i) => ([
                        runningData.length - i,
                        formatDateIST(trx.receiptDate),
                        trx.subNature || trx.name || "No Name",

                        money(trx.credit),
                        money(trx.debit)
                    ])),
                    theme: "grid",
                    styles: { fontSize: 11, halign: "left", borderBottom: "1px sold black" },
                });

            } else {

                autoTable(doc, {
                    startY,
                    head: [["Name", "Opening", "Credit", "Debit", "Total"]],
                    body: [
                        ...loanPartnerSummary.map(item => ([
                            item.label,
                            money(item.opening),
                            money(item.credit),
                            money(item.debit),
                            money(item.closing)
                        ])),
                        [
                            "TOTAL",
                            money(loanPartnerSummary.reduce((s, d) => s + d.opening, 0)),
                            money(loanPartnerSummary.reduce((s, d) => s + d.credit, 0)),
                            money(loanPartnerSummary.reduce((s, d) => s + d.debit, 0)),
                            money(loanPartnerSummary.reduce((s, d) => s + d.closing, 0)),
                        ]
                    ],
                    theme: "grid",
                    styles: { fontSize: 11, halign: "left" },
                });
            }

            startY = doc.lastAutoTable.finalY + 30;
        }

















        /* ================= LOANS SECTION ================= */
        startY = doc.lastAutoTable.finalY + 30;

        if (loanTransactions?.length > 0) {

            doc.setFontSize(14);
            doc.text("Loans & Advance", 40, startY);
            startY += 10;

            if (includeLoanPdf) {

                // 🔹 DETAILS TABLE WITH RUNNING BALANCE
                const balances = {};
                const runningData = [...loanTransactions].sort((a, b) => new Date(a.receiptDate) - new Date(b.receiptDate)).map(trx => {
                    const key = (trx.subNature || "General").trim().toLowerCase();
                    const amt = Number(trx.amount || 0);
                    const isCredit = trx.type?.toLowerCase() === "credit";
                    const opening = balances[key] || 0;
                    const credit = isCredit ? amt : 0;
                    const debit = isCredit ? 0 : amt;
                    const total = opening + credit - debit;
                    balances[key] = total;
                    return { ...trx, opening, credit, debit, total };
                }).sort((a, b) => new Date(b.receiptDate) - new Date(a.receiptDate));

                // 🔹 SUMMARY TABLE
                autoTable(doc, {
                    startY,
                    head: [["Name", "Opening", "Credit", "Debit", "Total"]],
                    body: [
                        ...loanNameSummary.map(item => ([
                            item.label,
                            money(item.opening),
                            money(item.credit),
                            money(item.debit),
                            money(item.closing)
                        ])),
                        [
                            "TOTAL",
                            money(loanNameSummary.reduce((s, d) => s + d.opening, 0)),
                            money(loanNameSummary.reduce((s, d) => s + d.credit, 0)),
                            money(loanNameSummary.reduce((s, d) => s + d.debit, 0)),
                            money(loanNameSummary.reduce((s, d) => s + d.closing, 0)),
                        ]
                    ],
                    theme: "grid",
                    styles: { fontSize: 11, halign: "left" },
                });

                startY = doc.lastAutoTable.finalY + 20;

                doc.setFontSize(14);
                doc.text("Loans & Advance Summary", 40, startY);
                startY += 10;

                autoTable(doc, {
                    startY,
                    head: [["Sl", "Date", "Name", "Credit", "Debit",]],
                    body: runningData.map((trx, i) => ([
                        runningData.length - i,
                        formatDateIST(trx.receiptDate),
                        trx.subNature || trx.name || "No Name",

                        money(trx.credit),
                        money(trx.debit)
                    ])),
                    theme: "grid",
                    styles: { fontSize: 11, halign: "left", borderBottom: "1px sold black" },
                });

            } else {

                // 🔹 SUMMARY TABLE
                autoTable(doc, {
                    startY,
                    head: [["Name", "Opening", "Credit", "Debit", "Total"]],
                    body: [
                        ...loanNameSummary.map(item => ([
                            item.label,
                            money(item.opening),
                            money(item.credit),
                            money(item.debit),
                            money(item.closing)
                        ])),
                        [
                            "TOTAL",
                            money(loanNameSummary.reduce((s, d) => s + d.opening, 0)),
                            money(loanNameSummary.reduce((s, d) => s + d.credit, 0)),
                            money(loanNameSummary.reduce((s, d) => s + d.debit, 0)),
                            money(loanNameSummary.reduce((s, d) => s + d.closing, 0)),
                        ]
                    ],
                    theme: "grid",
                    styles: { fontSize: 11, halign: "left" },
                });
            }

            startY = doc.lastAutoTable.finalY + 30;
        }

        /* ===== SAVE ===== */
        const safeDate = String(report.date).replaceAll("/", "-");
        doc.save(`Daily_Report_${safeDate}.pdf`);
    };

    return (
        <div
            style={{
                backgroundColor: "transparent",
                marginTop: "0px",
                height: "fit-content",
                width: "100%",
                maxWidth: "900px"
            }}
        >

            <div
                style={{
                    position: "relative",
                    margin: "0px -14px",
                    marginTop: "20px",
                    background: "transparent",
                    borderRadius: "0px",
                    borderTop: "1px solid #279c983d",
                    padding: "0px",
                    height: "fit-content",
                    paddingTop: "15px",
                    display: "none"
                }}

                ref={calendarRef}>
                <button
                    onClick={() => setShowCalendar(!showCalendar)}
                    style={{
                        position: "absolute",
                        right: 10,
                        background: "transparent",
                        fontSize: 20,
                        borderRadius: 6,
                        cursor: "pointer",
                        padding: "0px"
                    }}
                >
                    📅
                </button>

                {showCalendar && (
                    <div
                        style={{
                            position: "absolute",
                            top: 40,
                            right: 0,
                            zIndex: 1000,
                            background: "#fff",
                            padding: 5,
                            borderRadius: 8,
                            border: "1px solid #ccc",
                        }}
                    >
                        <Calendar
                            value={selectedDate}
                            onChange={(d) => {
                                setSelectedDate(d);
                                setShowCalendar(false);
                            }}
                            prev2Label={null}
                            next2Label={null}
                        />
                    </div>
                )}
            </div>

            <div style={{ marginTop: "30px" }} > <h3 className="service-section-text" style={{ marginBottom: "0px" }}>Date: {formatDateIST(report.date)}</h3> </div>
            <hr />

            {/* ===================== Bank Statement =================  */}
            <div
                style={{
                    margin: "0px -14px",
                    marginTop: "0px",
                    background: "transparent",
                    borderRadius: "0px",
                    padding: "0px",
                    height: "fit-content",
                    paddingTop: "1px",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0px 15px", marginTop: "0px", marginBottom: "15px", alignItems: "center" }}>
                    <h3 className="service-section-text">🏦 Bank Statement </h3>

                    <div style={{ position: "relative" }}>
                        <button
                            onClick={() => setShowPdfOptions(prev => !prev)}
                            style={{
                                padding: "8px 14px",
                                background: "#3cc8c3",
                                color: "#fff",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                            }}
                        >
                            ⬇ PDF
                        </button>

                        {showPdfOptions && (
                            <div style={{
                                position: "absolute",
                                right: 0,
                                top: "40px",
                                background: "white",
                                border: "1px solid #ddd",
                                padding: "12px",
                                borderRadius: "8px",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                                zIndex: 999
                            }}>

                                <div style={{ marginBottom: "8px", whiteSpace: "nowrap" }}>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={includeLockerPdf}
                                            onChange={() => setIncludeLockerPdf(p => !p)}
                                        />
                                        {" "}Locker Details
                                    </label>
                                </div>

                                <div style={{ marginBottom: "8px", whiteSpace: "nowrap" }}>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={includeLoanPartnerPdf}
                                            onChange={() => setIncludeLoanPartnerPdf(p => !p)}
                                        />
                                        {" "}Loans & Advance Details (Partner)
                                    </label>
                                </div>

                                <div style={{ marginBottom: "8px", whiteSpace: "nowrap" }}>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={includeLoanPdf}
                                            onChange={() => setIncludeLoanPdf(p => !p)}
                                        />
                                        {" "}Loans & Advance Details
                                    </label>
                                </div>

                                <button
                                    onClick={() => {
                                        handleDownloadPDF();
                                        setShowPdfOptions(false);
                                    }}
                                    style={{
                                        marginTop: "8px",
                                        width: "100%",
                                        background: "#337dac",
                                        color: "white",
                                        padding: "6px",
                                        border: "none",
                                        borderRadius: "6px",
                                        cursor: "pointer"
                                    }}
                                >
                                    Generate PDF
                                </button>

                            </div>
                        )}
                    </div>

                </div>

                <div className="leads-table-container" style={{ padding: "0px", height: "fit-content", }}>
                    <div className="table-fixed-wrapper">
                        <table className="leads-table" style={{ height: "fit-content", maxHeight: "70vh" }}>
                            <thead>
                                <tr>
                                    <th>Sl.</th>
                                    <th>Bank</th>
                                    <th>Opening</th>
                                    <th>Credit</th>
                                    <th>Debit</th>
                                    <th>Total</th>
                                </tr>
                            </thead>

                            <tbody>
                                {Object.keys({
                                    ...report.openingBankBalances,
                                    ...report.finalBankBalances
                                }).map((bank, index) => (
                                    <tr key={bank}>
                                        <td style={{ backgroundColor: "white" }}>{index + 1}</td>
                                        <td style={{ backgroundColor: "white", textAlign: "left" }} data-label="Bank Name">{bank}</td>
                                        <td style={{ backgroundColor: "white" }} data-label="Opening">₹{(report.openingBankBalances[bank] || 0).toLocaleString("en-IN")}</td>
                                        {/* TODAY COLOR LOGIC */}
                                        <td style={{ backgroundColor: "white", color: "green" }}>
                                            ₹{(report.bankCreditToday[bank] || 0).toLocaleString("en-IN")}
                                        </td>

                                        <td style={{ backgroundColor: "white", color: "red" }}>
                                            ₹{(report.bankDebitToday[bank] || 0).toLocaleString("en-IN")}
                                        </td>


                                        {/* FINAL COLOR LOGIC */}
                                        <td
                                            data-label="Final"
                                            style={{
                                                color: "black",
                                                backgroundColor: "white"
                                            }}
                                        >
                                            ₹{(
                                                (report.openingBankBalances[bank] || 0) +
                                                (report.bankCreditToday[bank] || 0) -
                                                (report.bankDebitToday[bank] || 0)
                                            ).toLocaleString("en-IN")}
                                        </td>

                                    </tr>
                                ))}

                                <tr style={{ background: "#d5f3ff" }}>

                                    <td style={{ backgroundColor: "#d5f3ff" }}></td>

                                    <td style={{ backgroundColor: "#d5f3ff" }}><b>TOTAL</b></td>

                                    <td style={{ backgroundColor: "#d5f3ff" }}>
                                        ₹{totalOpening.toLocaleString("en-IN")}
                                    </td>

                                    <td style={{ backgroundColor: "#d5f3ff", color: "green" }}>
                                        ₹{totalBankCredit.toLocaleString("en-IN")}
                                    </td>

                                    <td style={{ backgroundColor: "#d5f3ff", color: "red" }}>
                                        ₹{totalBankDebit.toLocaleString("en-IN")}
                                    </td>

                                    <td style={{ backgroundColor: "#d5f3ff" }}>
                                        ₹{totalFinal.toLocaleString("en-IN")}
                                    </td>
                                </tr>

                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <hr />

            {/* ===================== Cash Statement =================  */}
            <div
                style={{
                    margin: "0px -14px",
                    marginTop: "0px",
                    background: "transparent",
                    borderRadius: "0px",
                    padding: "0px",
                    height: "fit-content",
                    paddingTop: "5px"
                }}            >
                <h3 className="service-section-text">💵 Cash Statement</h3>

                <div className="leads-table-container" style={{ padding: "0px", height: "fit-content", }}>
                    <div className="table-fixed-wrapper">
                        <table className="leads-table" style={{ height: "fit-content", maxHeight: "70vh" }}>
                            <thead>
                                <tr>
                                    <th>Sl.</th>
                                    <th>Cash</th>
                                    <th>Opening</th>
                                    <th>Credit</th>
                                    <th>Debit</th>
                                    <th>Total</th>
                                </tr>
                            </thead>

                            <tbody>
                                {(() => {

                                    let sl = 1;

                                    return (
                                        <>

                                            {/* Locker row */}
                                            <tr style={{ background: "#f0e6ff", display: "none" }}>

                                                <td style={{ backgroundColor: "white" }}>
                                                    {sl++}
                                                </td>

                                                <td style={{ background: "#f0e6ff" }}>
                                                    {lockerReport.names.length
                                                        ? lockerReport.names.join(" + ")
                                                        : "Locker"} - Locker
                                                </td>

                                                <td style={{ background: "#f0e6ff" }}>
                                                    ₹{lockerReport.opening.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{ background: "#f0e6ff", color: "green" }}>
                                                    ₹{lockerCredit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{ background: "#f0e6ff", color: "red" }}>
                                                    ₹{lockerDebit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{ background: "#f0e6ff" }}>
                                                    ₹{lockerReport.closing.toLocaleString("en-IN")}
                                                </td>
                                            </tr>

                                            {/* Cash-> Bank */}
                                            {Object.keys({
                                                ...report.openingCashBalances,
                                                ...report.finalCashBalances
                                            }).map((cash) => (
                                                < tr key={cash} >
                                                    {/* Cash Account */}

                                                    <td style={{ backgroundColor: "white" }}>
                                                        {sl++}
                                                    </td>

                                                    <td style={{ backgroundColor: "white", textAlign: "left" }} data-label="Cash Account">
                                                        {cash}
                                                    </td>

                                                    <td style={{ backgroundColor: "white" }} data-label="Opening">₹{(report.openingCashBalances[cash] || 0).toLocaleString("en-IN")}</td>

                                                    {/* TODAY COLOR LOGIC */}
                                                    < td style={{ color: "green" }}>
                                                        ₹{(report.cashCreditToday[cash] || 0).toLocaleString("en-IN")}
                                                    </td>

                                                    <td style={{ color: "red" }}>
                                                        ₹{(report.cashDebitToday[cash] || 0).toLocaleString("en-IN")}
                                                    </td>

                                                    {/* FINAL COLOR LOGIC */}
                                                    <td
                                                        data-label="Final"
                                                        style={{
                                                            color: "black",
                                                            backgroundColor: "white"
                                                        }}
                                                    >
                                                        ₹{(
                                                            (report.openingCashBalances[cash] || 0) +
                                                            (report.cashCreditToday[cash] || 0) -
                                                            (report.cashDebitToday[cash] || 0)
                                                        ).toLocaleString("en-IN")}
                                                    </td>
                                                </tr>
                                            ))}

                                            {/* 🔢 PRE-CALCULATED TOTALS */}
                                            {(() => {
                                                const openingCashTotal =
                                                    Object.values(report.openingCashBalances).reduce((a, b) => a + b, 0) +
                                                    lockerReport.opening;

                                                const finalCashTotal =
                                                    Object.values(report.finalCashBalances).reduce((a, b) => a + b, 0) +
                                                    lockerReport.closing;

                                                return (
                                                    <tr style={{ background: "#d5f3ff" }}>

                                                        <td style={{ backgroundColor: "#d5f3ff" }}></td>

                                                        <td style={{ background: "#d5f3ff" }}><b>TOTAL CASH</b></td>

                                                        <td style={{ background: "#d5f3ff" }}>
                                                            ₹{openingCashTotal.toLocaleString("en-IN")}
                                                        </td>

                                                        <td style={{ background: "#d5f3ff", color: "green" }}>
                                                            ₹{(totalCashCredit + lockerCredit).toLocaleString("en-IN")}
                                                        </td>

                                                        <td style={{ background: "#d5f3ff", color: "red" }}>
                                                            ₹{(totalCashDebit + lockerDebit).toLocaleString("en-IN")}
                                                        </td>

                                                        <td style={{ background: "#d5f3ff" }}>
                                                            ₹{finalCashTotal.toLocaleString("en-IN")}
                                                        </td>
                                                    </tr>
                                                );
                                            })()}
                                        </>
                                    );

                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div >

            <hr />

            {/* =============== Final Bank + Cash Total ==============  */}
            <div
                style={{
                    margin: "0px -14px",
                    marginTop: "0px",
                    background: "transparent",
                    borderRadius: "0px",
                    padding: "0px",
                    height: "fit-content",
                    paddingTop: "5px"
                }}
            >
                <h3 className="service-section-text">🏁 Final Bank + Cash Total</h3>

                <div className="leads-table-container" style={{ padding: "0px", height: "fit-content", }}>
                    <div className="table-fixed-wrapper">
                        <table className="leads-table" style={{ height: "fit-content", maxHeight: "70vh" }}>
                            <thead>
                                <tr>
                                    <th>Sl.</th>
                                    <th>Type</th>
                                    <th>Opening</th>
                                    <th>Credit</th>
                                    <th>Debit</th>
                                    <th>Total</th>
                                </tr>
                            </thead>

                            <tbody>
                                {(() => {
                                    let sl = 1;
                                    return (
                                        <>
                                            <tr>
                                                <td style={{ backgroundColor: "white" }}>
                                                    {sl++}
                                                </td>
                                                <td style={{ backgroundColor: "white" }}>Bank + Cash</td>
                                                <td style={{ backgroundColor: "white" }}>₹{grandTotalOpening.toLocaleString("en-IN")}</td>

                                                <td style={{ color: "green", backgroundColor: "white" }}>
                                                    ₹{grandCredit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{ color: "red", backgroundColor: "white" }}>
                                                    ₹{grandDebit.toLocaleString("en-IN")}
                                                </td>

                                                <td
                                                    style={{
                                                        color: "black",
                                                        backgroundColor: "white"
                                                    }}
                                                >
                                                    ₹{grandTotalFinal.toLocaleString("en-IN")}
                                                </td>
                                            </tr>
                                        </>
                                    );
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: "30px" }}> </div>

            <hr />
            <hr />

            <div style={{ marginBottom: "20px" }}> </div>

            {/* =============== LOCKER (MoneyReceipts) ================ */}
            {report.lockerTransactions?.length > 0 && (

                <div style={{ margin: "0px -14px", }}>

                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>
                            <h3 className="service-section-text">🔐 Locker Entries</h3>
                        </div>

                        <div>
                            <button
                                onClick={() => setShowLockerDetails(prev => !prev)}
                                style={{
                                    padding: "6px 12px",
                                    background: "#337dac",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontWeight: 600
                                }}
                            >
                                {showLockerDetails ? "Hide Details ▲" : "View Details ▼"}
                            </button>
                        </div>
                    </div>

                    <div className="leads-table-container" style={{ margin: "0px", padding: "0px" }}>
                        <div className="table-fixed-wrapper">
                            <table className="leads-table">
                                <thead>
                                    <tr style={{ background: "#337dac", color: "white" }}>
                                        <th>Sl.</th>
                                        <th>Name</th>
                                        <th>Opening</th>
                                        <th>Credit</th>
                                        <th>Debit</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {lockerNameSummary.map((data, index) => {

                                        const net = data.closing;

                                        return (
                                            <tr key={data.label + index}
                                                style={{
                                                    borderBottom: "1px solid #ddd",
                                                    background: data.closing < 0 ? "#fff5f5" : "white"
                                                }}
                                            >
                                                <td style={{ backgroundColor: "white" }}>
                                                    {index + 1}
                                                </td>

                                                <td style={{ padding: 8, textAlign: "left", backgroundColor: "white" }}>
                                                    {data.label}
                                                </td>

                                                <td style={{ padding: 8, textAlign: "left", backgroundColor: "white" }}>
                                                    ₹{data.opening.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    padding: 8,
                                                    textAlign: "left",
                                                    color: "green",
                                                    fontWeight: 600
                                                }}>
                                                    ₹{data.credit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    padding: 8,
                                                    textAlign: "left",
                                                    color: "red",
                                                    fontWeight: 600
                                                }}>
                                                    ₹{data.debit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    padding: 8,
                                                    textAlign: "left",
                                                    fontWeight: 700,
                                                    color: net >= 0 ? "green" : "red"
                                                }}>
                                                    ₹{net.toLocaleString("en-IN")}
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {/* TOTAL ROW */}
                                    <tr style={{ background: "#d5f3ff", fontWeight: 700 }}>
                                        <td style={{ background: "#d5f3ff" }} ></td>

                                        <td style={{ background: "#d5f3ff" }}>TOTAL</td>

                                        <td style={{ background: "#d5f3ff" }}>
                                            ₹{lockerNameSummary
                                                .reduce((sum, d) => sum + d.opening, 0)
                                                .toLocaleString("en-IN")}
                                        </td>

                                        <td style={{ color: "green", background: "#d5f3ff" }}>
                                            ₹{lockerNameSummary
                                                .reduce((sum, d) => sum + d.credit, 0)
                                                .toLocaleString("en-IN")}
                                        </td>

                                        <td style={{ color: "red" }}>
                                            ₹{lockerNameSummary
                                                .reduce((sum, d) => sum + d.debit, 0)
                                                .toLocaleString("en-IN")}
                                        </td>

                                        <td>
                                            ₹{lockerNameSummary
                                                .reduce((sum, d) => sum + d.opening + d.credit - d.debit, 0)
                                                .toLocaleString("en-IN")}
                                        </td>
                                    </tr>

                                </tbody>
                            </table>
                        </div>
                    </div>

                    {showLockerDetails && (
                        <div className="leads-table-container" style={{ margin: "0px", marginTop: "15px", padding: "0px" }}>
                            <div className="table-fixed-wrapper">
                                <table className="leads-table">

                                    <thead>
                                        <tr>
                                            <th>Sl.</th>
                                            <th
                                                style={{ cursor: "pointer", userSelect: "none" }}
                                                onClick={() =>
                                                    setDateSortOrder(prev => (prev === "asc" ? "desc" : "asc"))
                                                }
                                            >
                                                Receipt Date {dateSortOrder === "asc" ? "▲" : "▼"}
                                            </th>
                                            <th>Name</th>
                                            <th>Credit</th>
                                            <th>Debit</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {sortedLockerTransactions.map((trx, index) => (
                                            <tr key={index}>

                                                <td style={{ backgroundColor: "white", fontWeight: 600 }}>
                                                    {sortedLockerTransactions.length - index}
                                                </td>

                                                <td style={{ background: "white" }}>
                                                    {trx.receiptDate ? formatDateIST(trx.receiptDate) : "-"}
                                                </td>

                                                <td style={{ background: "white" }}>{trx.subNature || trx.name || "No Name"}</td>

                                                <td
                                                    style={{
                                                        background: "white",
                                                        color: "green",
                                                        fontWeight: 600
                                                    }}
                                                >
                                                    ₹{trx.credit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    background: "white",
                                                    color: "red",
                                                    fontWeight: 600
                                                }}>
                                                    ₹{trx.debit.toLocaleString("en-IN")}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                </div>
            )}
            <hr />

            {/* ================= LOANS & ADVANCE (Partners) ================= */}
            {loanPartnerSummary?.length > 0 && (

                <div style={{ margin: "0px -14px" }}>

                    {/* HEADER WITH TOGGLE */}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>
                            <h3 className="service-section-text">💰 Loans & Advance (Partners)</h3>
                        </div>

                        <div>
                            <button
                                onClick={() => setShowLoanPartnerDetails(prev => !prev)}
                                style={{
                                    padding: "6px 12px",
                                    background: "#337dac",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontWeight: 600
                                }}
                            >
                                {showLoanPartnerDetails ? "Hide Details ▲" : "View Details ▼"}
                            </button>
                        </div>
                    </div>

                    {/* SUMMARY TABLE */}
                    <div className="leads-table-container" style={{ margin: "0px", padding: "0px" }}>
                        <div className="table-fixed-wrapper">
                            <table className="leads-table">

                                <thead>
                                    <tr style={{ background: "#337dac", color: "white" }}>
                                        <th>Sl.</th>
                                        <th>Name</th>
                                        <th>Opening</th>
                                        <th>Credit</th>
                                        <th>Debit</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {loanPartnerSummary.map((data, index) => {

                                        const net = data.closing;

                                        return (
                                            <tr key={data.label + index}
                                                style={{
                                                    borderBottom: "1px solid #ddd",
                                                    background: data.closing < 0 ? "#fff5f5" : "white"
                                                }}
                                            >
                                                <td style={{ backgroundColor: "white" }}>
                                                    {index + 1}
                                                </td>

                                                <td style={{ padding: 8, textAlign: "left", backgroundColor: "white" }}>
                                                    {data.label}
                                                </td>

                                                <td style={{ padding: 8, textAlign: "left", backgroundColor: "white" }}>
                                                    ₹{data.opening.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    padding: 8,
                                                    textAlign: "left",
                                                    color: "green",
                                                    fontWeight: 600,
                                                    backgroundColor: "white"
                                                }}>
                                                    ₹{data.credit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    padding: 8,
                                                    textAlign: "left",
                                                    color: "red",
                                                    fontWeight: 600,
                                                    backgroundColor: "white"
                                                }}>
                                                    ₹{data.debit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    padding: 8,
                                                    textAlign: "left",
                                                    fontWeight: 700,
                                                    color: net >= 0 ? "green" : "red"
                                                }}>
                                                    ₹{net.toLocaleString("en-IN")}
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {/* TOTAL ROW */}
                                    <tr style={{ background: "#d5f3ff", fontWeight: 700 }}>

                                        <td style={{ background: "#d5f3ff" }}></td>

                                        <td style={{ background: "#d5f3ff" }}>TOTAL</td>

                                        <td style={{ background: "#d5f3ff" }}>
                                            ₹{loanPartnerSummary
                                                .reduce((sum, d) => sum + d.opening, 0)
                                                .toLocaleString("en-IN")}
                                        </td>

                                        <td style={{ color: "green", background: "#d5f3ff" }}>
                                            ₹{loanPartnerSummary
                                                .reduce((sum, d) => sum + d.credit, 0)
                                                .toLocaleString("en-IN")}
                                        </td>

                                        <td style={{ color: "red", background: "#d5f3ff" }}>
                                            ₹{loanPartnerSummary
                                                .reduce((sum, d) => sum + d.debit, 0)
                                                .toLocaleString("en-IN")}
                                        </td>

                                        <td>
                                            ₹{loanPartnerSummary
                                                .reduce((sum, d) => sum + d.opening + d.credit - d.debit, 0)
                                                .toLocaleString("en-IN")}
                                        </td>
                                    </tr>

                                </tbody>

                            </table>
                        </div>
                    </div>

                    {/* DETAILS TABLE (Like Locker) */}
                    {showLoanPartnerDetails && (
                        <div className="leads-table-container" style={{ margin: "0px", marginTop: "15px", padding: "0px" }}>
                            <div className="table-fixed-wrapper">
                                <table className="leads-table">

                                    <thead>
                                        <tr>
                                            <th>Sl.</th>
                                            <th>Receipt Date</th>
                                            <th>Name</th>
                                            <th>Credit</th>
                                            <th>Debit</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {loanPartnerTransactions.map((trx, index) => (
                                            <tr key={index}>

                                                <td style={{ backgroundColor: "white", fontWeight: 600 }}>
                                                    {loanPartnerTransactions.length - index}
                                                </td>

                                                <td style={{ background: "white" }}>
                                                    {trx.receiptDate ? formatDateIST(trx.receiptDate) : "-"}
                                                </td>

                                                <td style={{ background: "white" }}>{trx.subNature || trx.name || "No Name"}</td>

                                                <td
                                                    style={{
                                                        background: "white",
                                                        color: "green",
                                                        fontWeight: 600
                                                    }}
                                                >
                                                    ₹{trx.credit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    background: "white",
                                                    color: "red",
                                                    fontWeight: 600
                                                }}>
                                                    ₹{trx.debit.toLocaleString("en-IN")}
                                                </td>

                                            </tr>
                                        ))}
                                    </tbody>

                                </table>
                            </div>
                        </div>
                    )}

                </div>
            )}
            <hr />

            {/* ================= LOANS & ADVANCE ================= */}
            {loanTransactions?.length > 0 && (

                <div style={{ margin: "0px -14px" }}>

                    {/* HEADER WITH TOGGLE */}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>
                            <h3 className="service-section-text">💰 Loans & Advance</h3>
                        </div>

                        <div>
                            <button
                                onClick={() => setShowLoanDetails(prev => !prev)}
                                style={{
                                    padding: "6px 12px",
                                    background: "#337dac",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontWeight: 600
                                }}
                            >
                                {showLoanDetails ? "Hide Details ▲" : "View Details ▼"}
                            </button>
                        </div>
                    </div>

                    {/* SUMMARY TABLE */}
                    <div className="leads-table-container" style={{ margin: "0px", padding: "0px" }}>
                        <div className="table-fixed-wrapper">
                            <table className="leads-table">

                                <thead>
                                    <tr style={{ background: "#337dac", color: "white" }}>
                                        <th>Sl.</th>
                                        <th>Name</th>
                                        <th>Opening</th>
                                        <th>Credit</th>
                                        <th>Debit</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {loanNameSummary.map((data, index) => {

                                        const net = data.closing;

                                        return (
                                            <tr key={data.label + index}
                                                style={{
                                                    borderBottom: "1px solid #ddd",
                                                    background: data.closing < 0 ? "#fff5f5" : "white"
                                                }}
                                            >
                                                <td style={{ backgroundColor: "white" }}>
                                                    {index + 1}
                                                </td>

                                                <td style={{ padding: 8, textAlign: "left", backgroundColor: "white" }}>
                                                    {data.label}
                                                </td>

                                                <td style={{ padding: 8, textAlign: "left", backgroundColor: "white" }}>
                                                    ₹{data.opening.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    padding: 8,
                                                    textAlign: "left",
                                                    color: "green",
                                                    fontWeight: 600,
                                                    backgroundColor: "white"
                                                }}>
                                                    ₹{data.credit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    padding: 8,
                                                    textAlign: "left",
                                                    color: "red",
                                                    fontWeight: 600,
                                                    backgroundColor: "white"
                                                }}>
                                                    ₹{data.debit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    padding: 8,
                                                    textAlign: "left",
                                                    fontWeight: 700,
                                                    color: net >= 0 ? "green" : "red"
                                                }}>
                                                    ₹{net.toLocaleString("en-IN")}
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {/* TOTAL ROW */}
                                    <tr style={{ background: "#d5f3ff", fontWeight: 700 }}>

                                        <td style={{ background: "#d5f3ff" }}></td>

                                        <td style={{ background: "#d5f3ff" }}>TOTAL</td>

                                        <td style={{ background: "#d5f3ff" }}>
                                            ₹{loanNameSummary
                                                .reduce((sum, d) => sum + d.opening, 0)
                                                .toLocaleString("en-IN")}
                                        </td>

                                        <td style={{ color: "green", background: "#d5f3ff" }}>
                                            ₹{loanNameSummary
                                                .reduce((sum, d) => sum + d.credit, 0)
                                                .toLocaleString("en-IN")}
                                        </td>

                                        <td style={{ color: "red", background: "#d5f3ff" }}>
                                            ₹{loanNameSummary
                                                .reduce((sum, d) => sum + d.debit, 0)
                                                .toLocaleString("en-IN")}
                                        </td>

                                        <td>
                                            ₹{loanNameSummary
                                                .reduce((sum, d) => sum + d.opening + d.credit - d.debit, 0)
                                                .toLocaleString("en-IN")}
                                        </td>
                                    </tr>

                                </tbody>

                            </table>
                        </div>
                    </div>

                    {/* DETAILS TABLE (Like Locker) */}
                    {showLoanDetails && (
                        <div className="leads-table-container" style={{ margin: "0px", marginTop: "15px", padding: "0px" }}>
                            <div className="table-fixed-wrapper">
                                <table className="leads-table">

                                    <thead>
                                        <tr>
                                            <th>Sl.</th>
                                            <th>Receipt Date</th>
                                            <th>Name</th>
                                            <th>Credit</th>
                                            <th>Debit</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {loanTransactions.map((trx, index) => (
                                            <tr key={index}>

                                                <td style={{ backgroundColor: "white", fontWeight: 600 }}>
                                                    {loanTransactions.length - index}
                                                </td>

                                                <td style={{ background: "white" }}>
                                                    {trx.receiptDate ? formatDateIST(trx.receiptDate) : "-"}
                                                </td>

                                                <td style={{ background: "white" }}>{trx.subNature || trx.name || "No Name"}</td>

                                                <td
                                                    style={{
                                                        background: "white",
                                                        color: "green",
                                                        fontWeight: 600
                                                    }}
                                                >
                                                    ₹{trx.credit.toLocaleString("en-IN")}
                                                </td>

                                                <td style={{
                                                    background: "white",
                                                    color: "red",
                                                    fontWeight: 600
                                                }}>
                                                    ₹{trx.debit.toLocaleString("en-IN")}
                                                </td>

                                            </tr>
                                        ))}
                                    </tbody>

                                </table>
                            </div>
                        </div>
                    )}

                </div>
            )}

        </div>
    );
}
