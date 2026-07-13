import React, { useEffect, useState, useRef } from "react";
import { db } from "../firebaseConfig";
import { doc, onSnapshot, collection } from "firebase/firestore";
import "react-calendar/dist/Calendar.css";
import "../styles/DailyReport.css";
import { RefreshCw } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DuePayments() {
    const [previousFilter, setPreviousFilter] = useState("1");
    const [upcomingFilter, setUpcomingFilter] = useState("1");
    const [pastDues, setPastDues] = useState([]);
    const [upcomingDues, setUpcomingDues] = useState([]);
    const [pastSortAsc, setPastSortAsc] = useState(false);
    const [upcomingSortAsc, setUpcomingSortAsc] = useState(true);
    const [waTemplates, setWaTemplates] = useState({});
    const [loading, setLoading] = useState(true);
    const snapshotCountRef = useRef(0);
    const [selectedAdvances, setSelectedAdvances] = useState(null);

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return "-";

        return Number(value).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, "whatsappMessages"),
            (snap) => {
                const data = {};
                snap.docs.forEach(d => {
                    data[d.id] = d.data().text || "";
                });
                setWaTemplates(data);
            }
        );
        return () => unsub();
    }, []);

    const calculatePaid = (lead) => {
        const advance = (lead.advancePayments || []).reduce(
            (sum, a) => sum + Number(a.amount || 0),
            0
        );

        const refund = (lead.refundPayments || []).reduce(
            (sum, r) => sum + Number(r.amount || 0),
            0
        );

        return Math.max(advance - refund, 0);
    };

    const applyTemplate = (template, lead) => {
        if (!template) return "";

        return template
            .replace(/{name}/gi, lead.name || "")
            .replace(/{functionDate}/gi, formatDateIST(lead.functionDate))
            .replace(/{dueAmount}/gi, Math.round(lead.due || 0).toLocaleString("en-IN"))
            .replace(/{grandTotal}/gi, lead.grandTotal?.toLocaleString("en-IN") || "0")
            .replace(/{functionType}/gi, lead.functionType || "")
            .replace(/{venueType}/gi, lead.venueType || "");
    };

    const sendWhatsApp = (mobile, template, lead) => {
        if (!mobile || !template) {
            alert("Mobile number ya message missing");
            return;
        }

        const finalMessage = applyTemplate(template, lead);
        const cleanNumber = mobile.replace(/\D/g, "");

        window.open(
            `https://wa.me/91${cleanNumber}?text=${encodeURIComponent(finalMessage)}`,
            "_blank"
        );
    };

    const formatDateIST = (dateStr) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: "Asia/Kolkata",
        });
    };

    const calculateRemaining = (lead) => {
        const grandTotal = Number(lead.grandTotal || 0);

        const advance = (lead.advancePayments || []).reduce(
            (sum, a) => sum + Number(a.amount || 0),
            0
        );

        const refund = (lead.refundPayments || []).reduce(
            (sum, r) => sum + Number(r.amount || 0),
            0
        );

        // 🔥 DISCOUNT REMOVE from dues calculation
        const remaining = grandTotal - advance + refund;

        return remaining; // negative allowed
    };

    useEffect(() => {
        let unsubscribers = [];
        setLoading(true);

        const today = new Date(
            new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
        );
        today.setHours(0, 0, 0, 0);

        let allLeadsMap = {};
        let pointer = new Date();

        snapshotCountRef.current = 0;
        const TOTAL_MONTHS = 24;

        for (let i = 0; i < TOTAL_MONTHS; i++) {
            const key = `${monthNames[pointer.getMonth()]}${pointer.getFullYear()}`;

            const unsub = onSnapshot(doc(db, "prebookings", key), (snap) => {
                snapshotCountRef.current += 1;

                if (snap.exists()) {
                    Object.entries(snap.data()).forEach(([id, lead]) => {
                        if (!lead || !lead.functionDate) return;

                        const remaining = calculateRemaining(lead);

                        if (remaining === 0) {
                            delete allLeadsMap[id];
                            return;
                        }

                        const funcDate = new Date(
                            new Date(lead.functionDate).toLocaleString("en-US", {
                                timeZone: "Asia/Kolkata",
                            })
                        );
                        funcDate.setHours(0, 0, 0, 0); // 🔥 remove time

                        allLeadsMap[id] = {
                            ...lead,
                            id,
                            due: remaining,
                            __isPast: funcDate < today,
                        };
                    });
                }

                // rebuild lists
                const past = [];
                const upcoming = [];

                Object.values(allLeadsMap).forEach((l) => {
                    if (l.__isPast) past.push(l);
                    else upcoming.push(l);
                });

                setPastDues(past);
                setUpcomingDues(upcoming);

                // 🔥 stop loading only after first full cycle
                if (snapshotCountRef.current >= TOTAL_MONTHS) {
                    setLoading(false);
                }
            });

            unsubscribers.push(unsub);
            pointer.setMonth(pointer.getMonth() - 1);
        }

        return () => unsubscribers.forEach((u) => u());
    }, []);


    const allDues = [...pastDues, ...upcomingDues];

    const groupedByMobile = allDues.reduce((acc, lead) => {
        if (!lead) return acc;

        const mobileKey = (
            lead.mobile1 ||
            lead.mobile2 ||
            ""
        ).replace(/\D/g, "");

        if (!mobileKey) return acc;

        if (!acc[mobileKey]) acc[mobileKey] = [];
        acc[mobileKey].push(lead);

        return acc;
    }, {});

    /* 🔥 DUPLICATE MOBILE WITH ALL DUE ZERO */
    const zeroDueDuplicateMobileSet = new Set(
        Object.entries(groupedByMobile)
            .filter(([mobile, group]) => {

                if (group.length <= 1) return false;

                const totalDue = group.reduce(
                    (sum, l) => sum + Number(l.due || 0),
                    0
                );

                return Math.round(totalDue) === 0;
            })
            .map(([mobile]) => mobile)
    );

    const filteredUpcoming = (() => {
        let list =
            upcomingFilter === "ALL"
                ? [...upcomingDues]
                : upcomingDues.filter((l) => {
                    const months = Number(upcomingFilter);
                    const limitDate = new Date();
                    limitDate.setMonth(limitDate.getMonth() + months);
                    const fd = new Date(l.functionDate);
                    return fd <= limitDate;
                });

        // SORT HERE
        list.sort((a, b) => {
            const da = new Date(a.functionDate);
            const db = new Date(b.functionDate);
            return upcomingSortAsc ? da - db : db - da; // 🔥 toggle ASC/DESC
        });

        return list;
    })();

    const filteredPast = (() => {
        let list =
            previousFilter === "ALL"
                ? [...pastDues]
                : pastDues.filter((l) => {
                    const months = Number(previousFilter);
                    const limitDate = new Date();
                    limitDate.setMonth(limitDate.getMonth() - months);
                    const fd = new Date(l.functionDate);
                    return fd >= limitDate;
                });

        // 🔥 HIDE IF DUE = 0
        list = list.filter(l => Number(l.due) !== 0);

        // SORT HERE
        list.sort((a, b) => {
            const da = new Date(a.functionDate);
            const db = new Date(b.functionDate);
            return pastSortAsc ? da - db : db - da;  // 🔥 toggle ASC/DESC
        });

        return list;
    })();

    const visiblePast = filteredPast.filter(l => {
        const mobileKey = (l.mobile1 || "").replace(/\D/g, "");

        const isZeroDuplicate = zeroDueDuplicateMobileSet.has(mobileKey);

        return !isZeroDuplicate && Math.round(Number(l.due || 0)) !== 0;
    });

    if (loading) {
        return (
            <div
                className="service-section"
                style={{
                    marginTop: "0px",
                    padding: "0px",
                    textAlign: "center",
                    fontSize: "0px",
                    fontWeight: "700",
                    background: "transparent",
                    boxShadow: "none",
                }}
            >
                <span className="loading-spinner"><RefreshCw size={25} /></span>
            </div>
        );
    }

    const formatAmount = (amount) => {
        if (!amount && amount !== 0) return '-';
        return Math.trunc(Number(amount)).toLocaleString('en-IN');
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const [year, month, day] = dateStr.split('-');
        return `${day}-${month}-${year}`;
    };

    const getDateRangeText = (type) => {
        const today = new Date(
            new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
        );

        const format = (d) =>
            d.toLocaleDateString("en-GB", {
                timeZone: "Asia/Kolkata",
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            }).replace(/\//g, "-");

        if (type === "past") {
            if (previousFilter === "ALL") {
                return `Till ${format(today)}`;
            }

            const months = Number(previousFilter);
            const from = new Date(today);
            from.setMonth(from.getMonth() - months);

            return `${format(from)} to ${format(today)}`;
        }

        if (type === "upcoming") {
            if (upcomingFilter === "ALL") {
                return `From ${format(today)} onwards`;
            }

            const months = Number(upcomingFilter);
            const to = new Date(today);
            to.setMonth(to.getMonth() + months);

            return `${format(today)} to ${format(to)}`;
        }
    };

    const calculateBankReceived = (lead) => {
        return (lead.advancePayments || [])
            .filter(adv => adv.mode && adv.mode !== "Cash")
            .reduce((sum, adv) => sum + Number(adv.amount || 0), 0);
    };

    // 🔥 TOTALS
    const totalPastDue = visiblePast.reduce(
        (sum, l) => sum + Number(l.due || 0),
        0
    );

    const totalUpcomingDue = filteredUpcoming
        .filter(l => {
            const mobileKey = (l.mobile1 || "").replace(/\D/g, "");
            const isZeroDuplicate = zeroDueDuplicateMobileSet.has(mobileKey);

            return !isZeroDuplicate && Number(l.due) !== 0;
        })
        .reduce((sum, l) => sum + Number(l.due || 0), 0);

    /* ================= MULTIPLE BOOKINGS MERGE ================= */

    let mergedMultiple = [];

    Object.entries(groupedByMobile).forEach(([mobile, mobileGroup]) => {

        if (mobileGroup.length <= 1) return;

        const totalSale = mobileGroup.reduce(
            (sum, l) => sum + Number(l.grandTotal || 0),
            0
        );

        const totalReceived = mobileGroup.reduce(
            (sum, l) => sum + calculatePaid(l),
            0
        );

        const totalDue = mobileGroup.reduce(
            (sum, l) => sum + Number(l.due || 0),
            0
        );

        mergedMultiple.push({
            name: mobileGroup[0].name || "-", // display only
            mobile,
            totalBookings: mobileGroup.length,
            totalSale,
            totalReceived,
            totalDue,
            bookings: mobileGroup.sort(
                (a, b) =>
                    new Date(a.functionDate) -
                    new Date(b.functionDate)
            )
        });

    });

    /* 🔥 SHOW ONLY MULTIPLE */
    mergedMultiple = mergedMultiple.filter(
        client =>
            client.totalBookings > 1 &&
            Math.round(Number(client.totalDue)) !== 0
    );

    const duplicateMobileSet = new Set(
        Object.entries(groupedByMobile)
            .filter(([mobile, group]) => group.length > 1)
            .map(([mobile]) => mobile)
    );

    const handleDownloadPDF = () => {

        const doc = new jsPDF("l", "pt");
        let startY = 40;

        const money = (val) =>
            Number(val || 0).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            });

        const now = new Date().toLocaleString("en-GB", {
            timeZone: "Asia/Kolkata"
        });

        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("Due Payments Report", 40, startY);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Generated On: ${now}`, 40, startY + 15);

        startY += 40;

        const pastTotals = visiblePast.reduce((acc, l) => {
            acc.totalSale += Number(l.grandTotal || 0);
            acc.received += Number(calculatePaid(l) || 0);
            acc.gst += Number(l.gstBase || 0) + Number(l.gstAmount || 0);
            acc.bank += Number(calculateBankReceived(l) || 0);
            acc.discount += Number(l.discount || 0);
            acc.due += Number(l.due || 0);
            return acc;
        }, {
            totalSale: 0,
            received: 0,
            gst: 0,
            bank: 0,
            discount: 0,
            due: 0
        });

        /* ================= PAST DUES ================= */

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Previous Dues", 40, startY);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Date Range: ${getDateRangeText("past")}`, 40, startY + 12);

        startY += 25;

        const pastBody = visiblePast.map((l, index) => {
            const gstTotal =
                Number(l.gstBase || 0) +
                Number(l.gstAmount || 0);

            const bank = calculateBankReceived(l);

            return [
                visiblePast.length - index,
                formatDateIST(l.functionDate),
                l.name,
                l.mobile1 || "",
                l.functionType,
                l.venueType,
                money(l.grandTotal),
                money(calculatePaid(l)),
                money(gstTotal),
                money(bank),
                money(l.discount),
                money(l.due)
            ];
        });

        autoTable(doc, {
            head: [[
                "Sl",
                "Event Date",
                "Name",
                "Mobile",
                "Function Type",
                "Venue Type",
                "Total Sale",
                "Received",
                "Applied + GST",
                "Total Bank",
                "Discount",
                "Dues"
            ]],
            foot: [[
                "",
                "TOTAL",
                "",
                "",
                "",
                "",
                money(pastTotals.totalSale),
                money(pastTotals.received),
                money(pastTotals.gst),
                money(pastTotals.bank),
                money(pastTotals.discount),
                money(pastTotals.due)
            ]],
            footStyles: {
                fillColor: [255, 243, 205],
                textColor: 0,
                fontStyle: "bold"
            },
            body: pastBody,
            startY,
            styles: {
                fontSize: 7,
                lineColor: [0, 0, 0],   // ✅ DARK BORDER
                lineWidth: 0.8
            },
            headStyles: { fillColor: [220, 53, 69], textColor: 255 },
            theme: "grid"
        });

        startY = doc.lastAutoTable.finalY + 40;

        /* ================= UPCOMING DUES ================= */

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Upcoming Dues", 40, startY);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Date Range: ${getDateRangeText("upcoming")}`, 40, startY + 12);

        startY += 25;

        const upcomingFiltered = filteredUpcoming.filter(l => {
            const mobileKey = (l.mobile1 || "").replace(/\D/g, "");
            const isZeroDuplicate = zeroDueDuplicateMobileSet.has(mobileKey);
            return !isZeroDuplicate && Number(l.due) !== 0;
        });

        const upcomingTotals = upcomingFiltered.reduce((acc, l) => {
            acc.totalSale += Number(l.grandTotal || 0);
            acc.received += Number(calculatePaid(l) || 0);
            acc.gst += Number(l.gstBase || 0) + Number(l.gstAmount || 0);
            acc.bank += Number(calculateBankReceived(l) || 0);
            acc.discount += Number(l.discount || 0);
            acc.due += Number(l.due || 0);
            return acc;
        }, {
            totalSale: 0,
            received: 0,
            gst: 0,
            bank: 0,
            discount: 0,
            due: 0
        });

        const upcomingBody = upcomingFiltered.map((l, index) => {
            const gstTotal =
                Number(l.gstBase || 0) +
                Number(l.gstAmount || 0);

            const bank = calculateBankReceived(l);

            return [
                upcomingFiltered.length - index,
                formatDateIST(l.functionDate),
                l.name,
                l.mobile1 || "",
                l.functionType,
                l.venueType,
                money(l.grandTotal),
                money(calculatePaid(l)),
                money(gstTotal),
                money(bank),
                money(l.discount),
                money(l.due)
            ];
        });

        autoTable(doc, {
            head: [[
                "Sl",
                "Event Date",
                "Name",
                "Mobile",
                "Function Type",
                "Venue Type",
                "Total Sale",
                "Received",
                "Applied + GST",
                "Total Bank",
                "Discount",
                "Remaining"
            ]],
            foot: [[
                "",
                "TOTAL",
                "",
                "",
                "",
                "",
                money(upcomingTotals.totalSale),
                money(upcomingTotals.received),
                money(upcomingTotals.gst),
                money(upcomingTotals.bank),
                money(upcomingTotals.discount),
                money(upcomingTotals.due)
            ]],
            footStyles: {
                fillColor: [220, 255, 220],
                textColor: 0,
                fontStyle: "bold"
            },
            body: upcomingBody,
            startY,
            styles: {
                fontSize: 7,
                lineColor: [0, 0, 0],   // ✅ DARK BORDER
                lineWidth: 0.8
            },
            headStyles: { fillColor: [40, 167, 69], textColor: 255 },
            theme: "grid"
        });

        startY = doc.lastAutoTable.finalY + 40;

        /* ================= MULTIPLE BOOKINGS ================= */

        if (mergedMultiple.length > 0) {

            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("Multiple Booking Clients", 40, startY);

            startY += 20;

            const multipleTotals = mergedMultiple.reduce((acc, c) => {
                acc.totalSale += Number(c.totalSale || 0);
                acc.received += Number(c.totalReceived || 0);
                acc.due += Number(c.totalDue || 0);
                return acc;
            }, {
                totalSale: 0,
                received: 0,
                due: 0
            });

            const multipleBody = mergedMultiple.map((client, index) => [
                index + 1,

                (client.bookings || [])
                    .map(b =>
                        `${formatDateIST(b.functionDate)} (${b.functionType || "-"} - ${b.venueType || "-"})`
                    )
                    .join(", "),

                client.name,
                client.mobile,
                money(client.totalSale),
                money(client.totalReceived),
                money(client.totalDue)
            ]);

            autoTable(doc, {
                head: [[
                    "Sl",
                    "Event Date ( Function - Venue )",
                    "Name",
                    "Mobile",
                    "Total Sale",
                    "Total Received",
                    "Total Due"
                ]],
                foot: [[
                    "",
                    "TOTAL",
                    "",
                    "",
                    money(multipleTotals.totalSale),
                    money(multipleTotals.received),
                    money(multipleTotals.due)
                ]],
                footStyles: {
                    fillColor: [210, 235, 255],
                    textColor: 0,
                    fontStyle: "bold"
                },
                body: multipleBody,
                startY,
                styles: {
                    fontSize: 7,
                    lineColor: [0, 0, 0],   // ✅ DARK BORDER
                    lineWidth: 0.8
                },
                headStyles: { fillColor: [9, 112, 171], textColor: 255 },
                theme: "grid"
            });
        }

        doc.save(`Due_Payments_${Date.now()}.pdf`);
    };

    return (
        <div
            className="service-section"
            style={{
                backgroundColor: "transparent",
                boxShadow: "none",
                marginTop: "0px",
                paddingBottom: "0px",
                height: "fit-content",
                padding: "0px",
            }}
        >
            {/* ===================== PAST DUES TABLE ====================== */}
            <div
                style={{
                    margin: "0px -14px",
                    marginTop: "20px",
                    background: "transparent",
                    borderRadius: "0px",
                    borderTop: "1px solid #279c983d",
                    padding: "0px",
                    height: "fit-content",
                    paddingTop: "15px"
                }}
            >

                <div style={{ display: "flex", justifyContent: "space-between", padding: "0px 25px" }}>
                    <div>
                        <h3 className="service-section-text" >⏳ Previous Dues</h3>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
                        <button
                            onClick={handleDownloadPDF}
                            style={{
                                padding: "8px 14px",
                                backgroundColor: "#3cc8c3",
                                color: "#fff",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontWeight: "600"
                            }}
                        >
                            ⬇ PDF
                        </button>
                    </div>
                </div>

                {/* ===================== PAST DUES FILTER ====================== */}
                <div style={{ marginTop: "10px", marginBottom: "20px", display: "flex", padding: "0px 5px" }}>
                    <label style={{ fontSize: "16px", fontWeight: "700", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                        Filter Previous:
                    </label>

                    <select
                        value={previousFilter}
                        onChange={(e) => setPreviousFilter(e.target.value)}
                        style={{
                            marginLeft: "10px",
                            padding: "6px",
                            borderRadius: "6px",
                            border: "1px solid #555",
                            maxWidth: "180px",
                            backgroundColor: "transparent"
                        }}
                        className="filterSelect"
                    >
                        <option value="1">Previous 1 Month</option>
                        <option value="3">Previous 3 Months</option>
                        <option value="6">Previous 6 Months</option>
                        <option value="12">Previous 12 Months</option>
                        <option value="ALL">All</option>
                    </select>
                </div>

                <div className="leads-table-container" style={{ padding: "0px" }}>
                    <div className="table-fixed-wrapper">
                        <table className="leads-table">
                            <thead>
                                <tr>
                                    <th>Sl.</th>
                                    <th
                                        style={{ cursor: "pointer" }}
                                        onClick={() => setPastSortAsc(!pastSortAsc)}
                                    >
                                        Event Date {pastSortAsc ? "" : ""}
                                    </th>
                                    <th>Name</th>
                                    <th>Mobile</th>
                                    <th>Function Type</th>
                                    <th>Venue Type</th>
                                    <th>Total Sale</th>
                                    <th>Total Received</th>
                                    <th>Applied + GST</th>
                                    <th>Total Bank</th>
                                    <th>Discount</th>
                                    <th>Dues
                                        <div>
                                            ₹{formatCurrency(totalPastDue)}
                                        </div>
                                    </th>
                                    <th>WhatsApp</th>
                                </tr>
                            </thead>

                            <tbody>
                                {visiblePast.map((l, index2) => (
                                    <tr key={l.id}>
                                        <td style={{ backgroundColor: "white", fontWeight: 600 }}>
                                            {visiblePast.length - index2}
                                        </td>
                                        <td style={{ backgroundColor: "white" }}>{formatDateIST(l.functionDate)}</td>
                                        {/* ✅ PERFECT Sl No. */}
                                        <td style={{
                                            backgroundColor: "white",
                                            fontWeight: duplicateMobileSet.has((l.mobile1 || "").replace(/\D/g, "")) ? 700 : 400
                                        }}>
                                            {l.name}
                                            {duplicateMobileSet.has((l.mobile1 || "").replace(/\D/g, "")) && (
                                                <span
                                                    style={{
                                                        marginLeft: 8,
                                                        padding: "4px 10px",
                                                        fontSize: "11px",
                                                        fontWeight: 700,
                                                        borderRadius: "20px",
                                                        background: "#009890",
                                                        color: "#fff",
                                                        letterSpacing: "0.5px",
                                                        boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                                                        display: "inline-block",
                                                    }}
                                                >
                                                    Multiple Bookings
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ backgroundColor: "white" }}>
                                            {l.mobile1 && (
                                                <span
                                                    style={{ cursor: "pointer", fontWeight: "600" }}
                                                    onClick={() => (window.location.href = `tel:${l.mobile1}`)}
                                                >
                                                    {l.mobile1}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ backgroundColor: "white" }}>{l.functionType}</td>

                                        <td style={{ backgroundColor: "white" }}>{l.venueType}</td>

                                        <td style={{ backgroundColor: "white", textAlign: "right" }}>₹{formatCurrency(l.grandTotal)}</td>
                                        <td style={{ backgroundColor: "white", color: "green", fontWeight: 700, textAlign: "right" }}>₹{formatCurrency(calculatePaid(l))}</td>

                                        <td style={{ backgroundColor: "white", textAlign: "right" }}>
                                            ₹{formatCurrency(
                                                Number(l.gstBase || 0) +
                                                Number(l.gstAmount || 0)
                                            )}
                                        </td>

                                        <td style={{ textAlign: "right" }}>
                                            ₹{formatCurrency(calculateBankReceived(l))}
                                        </td>

                                        <td style={{ backgroundColor: "white", textAlign: "right" }}>₹{formatCurrency(l.discount)}</td>

                                        <td style={{ backgroundColor: "white", color: "red", fontWeight: 700, textAlign: "right" }}>
                                            ₹{formatCurrency(l.due)}
                                        </td>

                                        <td style={{ backgroundColor: "white" }}>
                                            <div style={{ display: "flex", justifyContent: "center" }}>
                                                <button
                                                    style={{ backgroundColor: "#2bad36ff" }}
                                                    className="WhatsAppBtn"
                                                    onClick={() =>
                                                        sendWhatsApp(
                                                            l.mobile1,
                                                            waTemplates["Back Balance Amount Request"],
                                                            l
                                                        )
                                                    }
                                                >
                                                    WhatsApp
                                                </button>
                                            </div>
                                        </td>

                                    </tr>
                                ))}
                            </tbody>

                            {selectedAdvances && (
                                <div style={{
                                    position: "fixed",
                                    top: 0, left: 0, right: 0, bottom: 0,
                                    background: "rgba(0,0,0,0.4)",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    zIndex: 1000,
                                    backdropFilter: "blur(6px)"
                                }}>
                                    <div style={{
                                        background: "linear-gradient(135deg, #ffffffcc, #f0f0f0dd)",
                                        padding: "25px",
                                        borderRadius: "16px",
                                        minWidth: "250px",
                                        maxHeight: "70vh",
                                        overflowY: "auto",
                                        boxShadow: "0 10px 30px rgba(0,0,0,0.25), inset 0 2px 8px rgba(255,255,255,0.6)",
                                        transform: "scale(1)",
                                        animation: "popupFadeIn 0.3s ease-out"
                                    }}>
                                        <h3 style={{
                                            marginBottom: "15px",
                                            fontSize: "1.4rem",
                                            fontWeight: "bold",
                                            color: "#333",
                                            textAlign: "center",
                                            textShadow: "1px 1px 2px rgba(0,0,0,0.15)"
                                        }}>
                                            💰 Payment Received
                                        </h3>

                                        {selectedAdvances.length > 0 ? (
                                            selectedAdvances.map((adv, idx) => (
                                                <div key={idx} style={{
                                                    marginBottom: "12px",
                                                    padding: "10px 14px",
                                                    display: 'flex',
                                                    borderRadius: "10px",
                                                    background: "linear-gradient(135deg,#fdfdfd,#f5f5f5)",
                                                    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                                                    transition: "transform 0.2s",
                                                }}>
                                                    <strong style={{ fontSize: "1.1rem", color: "#222" }}>
                                                        ₹{formatAmount(adv.amount)}
                                                    </strong>
                                                    <span style={{ color: "#000000ff" }}>- via {adv.mode}  -</span>
                                                    <br />
                                                    <span style={{ color: "#000000ff", fontWeight: '600' }}>
                                                        {formatDate(adv.receiptDate)}
                                                    </span>
                                                </div>
                                            ))
                                        ) : (
                                            <p style={{ textAlign: "center", color: "#666" }}>No Payment Received </p>
                                        )}

                                        <button
                                            style={{
                                                marginTop: "15px",
                                                padding: "8px 18px",
                                                borderRadius: "8px",
                                                border: "none",
                                                background: "linear-gradient(135deg, #cb1111ff, #fc25c3ff)",
                                                color: "white",
                                                fontWeight: "bold",
                                                cursor: "pointer",
                                                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                                                transition: "all 0.2s",
                                            }}
                                            onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"}
                                            onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
                                            onClick={() => setSelectedAdvances(null)}
                                        >
                                            Close
                                        </button>
                                    </div>

                                    {/* Animation style */}
                                    <style>
                                        {`
                @keyframes popupFadeIn {
                    from {
                        opacity: 0;
                        transform: scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
            `}
                                    </style>
                                </div>
                            )}

                        </table>
                    </div>
                </div>

            </div>

            {/* ===================== UPCOMING DUES TABLE ====================== */}
            <div
                style={{
                    margin: "0px -14px",
                    marginTop: "20px",
                    background: "transparent",
                    borderRadius: "0px",
                    borderTop: "3px dotted #047470",
                    padding: "0px",
                    height: "fit-content",
                    paddingTop: "15px"
                }}
            >
                <h3 className="service-section-text" >📅 Upcoming Dues</h3>

                {/* ===================== UPCOMING FILTER ====================== */}
                <div style={{ marginTop: "10px", marginBottom: "20px", display: "flex" }}>
                    <label style={{ fontSize: "16px", fontWeight: "700", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                        Filter Upcoming:
                    </label>

                    <select
                        value={upcomingFilter}
                        onChange={(e) => setUpcomingFilter(e.target.value)}
                        style={{
                            marginLeft: "10px",
                            padding: "6px",
                            borderRadius: "6px",
                            border: "1px solid #555",
                            maxWidth: "150px",
                            backgroundColor: "transparent"
                        }}
                        className="filterSelect"
                    >
                        <option value="1">Next 1 Month</option>
                        <option value="3">Next 3 Months</option>
                        <option value="6">Next 6 Months</option>
                        <option value="12">Next 12 Months</option>
                        <option value="ALL">All</option>
                    </select>
                </div>

                <div className="leads-table-container" style={{ padding: "0px" }}>
                    <div className="table-fixed-wrapper">
                        <table className="leads-table">
                            <thead>
                                <tr>
                                    <th>Sl.</th>
                                    <th
                                        style={{ cursor: "pointer" }}
                                        onClick={() => setUpcomingSortAsc(!upcomingSortAsc)}
                                    >
                                        Event Date {upcomingSortAsc ? "" : ""}
                                    </th>
                                    <th>Name</th>
                                    <th>Mobile</th>
                                    <th>Function Type</th>
                                    <th>Venue Type</th>
                                    <th>Total Sale</th>
                                    <th>Total Received</th>
                                    <th>Applied + GST</th>
                                    <th>Total Bank</th>
                                    <th>Discount</th>
                                    <th>Remaining
                                        <div>
                                            ₹{formatCurrency(totalUpcomingDue)}
                                        </div>
                                    </th>
                                    <th>WhatsApp</th>
                                </tr>
                            </thead>

                            <tbody>
                                {filteredUpcoming
                                    .filter(l => {
                                        const mobileKey = (l.mobile1 || "").replace(/\D/g, "");
                                        return (
                                            !zeroDueDuplicateMobileSet.has(mobileKey) &&
                                            Math.round(Number(l.due || 0)) !== 0
                                        );
                                    })
                                    .map((l, index) => (
                                        <tr key={l.id}>
                                            {/* ✅ FIXED Sl No. */}
                                            <td style={{ fontWeight: 600, backgroundColor: "white" }}>
                                                {filteredUpcoming.length - index}
                                            </td>

                                            <td style={{ backgroundColor: "white" }}>{formatDateIST(l.functionDate)}</td>

                                            <td style={{
                                                backgroundColor: "white",
                                                fontWeight: duplicateMobileSet.has((l.mobile1 || "").replace(/\D/g, "")) ? 700 : 400
                                            }}>
                                                {l.name}
                                                {duplicateMobileSet.has((l.mobile1 || "").replace(/\D/g, "")) && (
                                                    <span
                                                        style={{
                                                            marginLeft: 8,
                                                            padding: "4px 10px",
                                                            fontSize: "11px",
                                                            fontWeight: 700,
                                                            borderRadius: "20px",
                                                            background: "#009890",
                                                            color: "#fff",
                                                            letterSpacing: "0.5px",
                                                            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                                                            display: "inline-block",
                                                        }}
                                                    >
                                                        Multiple Bookings
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ backgroundColor: "white" }}>
                                                {l.mobile1 && (
                                                    <span
                                                        style={{ cursor: "pointer", fontWeight: "600" }}
                                                        onClick={() => (window.location.href = `tel:${l.mobile1}`)}
                                                    >
                                                        {l.mobile1}
                                                    </span>
                                                )}
                                                <div>
                                                    {l.mobile2 && (
                                                        <>
                                                            <span
                                                                style={{ cursor: "pointer", fontWeight: "600" }}
                                                                onClick={() => (window.location.href = `tel:${l.mobile2}`)}
                                                            > {l.mobile2}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </td>

                                            <td style={{ backgroundColor: "white" }}>{l.functionType}</td>

                                            <td style={{ backgroundColor: "white" }}>{l.venueType}</td>

                                            <td style={{ backgroundColor: "white", textAlign: "right" }}>₹{formatCurrency(l.grandTotal)}</td>
                                            <td style={{ backgroundColor: "white", color: "green", fontWeight: 700, textAlign: "right" }}>
                                                ₹{formatCurrency(calculatePaid(l))}
                                            </td>

                                            <td style={{ backgroundColor: "white", textAlign: "right" }}>
                                                ₹{formatCurrency(
                                                    Number(l.gstBase || 0) +
                                                    Number(l.gstAmount || 0)
                                                )}
                                            </td>

                                            <td style={{ textAlign: "right" }}>
                                                ₹{formatCurrency(calculateBankReceived(l))}
                                            </td>

                                            <td style={{ backgroundColor: "white", textAlign: "right" }}>₹{formatCurrency(l.discount)}</td>

                                            <td style={{ backgroundColor: "white", color: "red", fontWeight: 700, textAlign: "right" }}>
                                                ₹{formatCurrency(l.due)}
                                            </td>

                                            <td style={{ backgroundColor: "white" }}>
                                                <div style={{ display: "flex", justifyContent: "center" }}>
                                                    <button
                                                        style={{ backgroundColor: "#2bad36ff" }}
                                                        onClick={() =>
                                                            sendWhatsApp(
                                                                l.mobile1,
                                                                waTemplates["Advance Amount Request"],
                                                                l
                                                            )
                                                        }
                                                    >
                                                        WhatsApp
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ================= MULTIPLE BOOKINGS TABLE ================= */}
            {mergedMultiple.length > 0 && (
                <div
                    style={{
                        margin: "0px -14px",
                        marginTop: "30px",
                        borderTop: "3px dotted #ff9800",
                        paddingTop: "20px"
                    }}
                >
                    <h3 className="service-section-text">
                        🔁 Multiple Booking Clients
                    </h3>

                    <div className="leads-table-container">
                        <div className="table-fixed-wrapper">
                            <table className="leads-table">
                                <thead>
                                    <tr>
                                        <th style={{ background: "#0970ab", textAlign: "center", zIndex: "99" }}>Sl.</th>
                                        <th style={{ background: "#0970ab", textAlign: "center", zIndex: "99" }}>Name</th>
                                        <th>Mobile</th>
                                        <th>Total Sale</th>
                                        <th>Total Received</th>
                                        <th>Discount</th>
                                        <th>Total Due</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {mergedMultiple.map((client, i) => (
                                        <React.Fragment key={i}>

                                            {/* MAIN SUMMARY ROW */}
                                            <tr
                                                style={{
                                                    background: "yellow",
                                                    fontWeight: 700
                                                }}
                                            >
                                                <td style={{ background: "yellow", textAlign: "center" }}>
                                                    {i + 1}.
                                                </td>

                                                <td style={{ background: "yellow" }}>{client.name}</td>

                                                <td style={{ background: "yellow", color: "red", fontWeight: "bold" }}>
                                                    <span
                                                        style={{ cursor: "pointer" }}
                                                        onClick={() =>
                                                            (window.location.href = `tel:${client.mobile}`)
                                                        }
                                                    >
                                                        {client.mobile}
                                                    </span>
                                                </td>

                                                <td style={{ textAlign: "right", background: "yellow" }}>
                                                    ₹{formatCurrency(client.totalSale)}
                                                </td>

                                                <td
                                                    style={{
                                                        textAlign: "right",
                                                        color: "green",
                                                        background: "yellow"
                                                    }}
                                                >
                                                    ₹{formatCurrency(client.totalReceived)}
                                                </td>

                                                <td style={{ textAlign: "right", background: "yellow" }}>

                                                </td>

                                                <td
                                                    style={{
                                                        textAlign: "right",
                                                        color: client.totalDue > 0 ? "red" : "green",
                                                        background: "yellow"
                                                    }}
                                                >
                                                    ₹{formatCurrency(client.totalDue)}
                                                </td>
                                            </tr>

                                            {/* DETAIL ROWS */}
                                            {client.bookings.map((b, idx) => (
                                                <tr key={idx}>
                                                    <td style={{ textAlign: "center", color: "#777", backgroundColor: "white", fontWeight: "bold" }}>
                                                        ({String.fromCharCode(65 + idx)})
                                                    </td>

                                                    <td style={{ paddingLeft: "20px", backgroundColor: "white" }}>
                                                        {formatDateIST(b.functionDate)} – {b.functionType} - {b.venueType}
                                                    </td>

                                                    <td style={{ backgroundColor: "white" }}></td>

                                                    <td style={{ textAlign: "right", backgroundColor: "white" }}>
                                                        ₹{formatCurrency(b.grandTotal)}
                                                    </td>

                                                    <td style={{ textAlign: "right", color: "green", backgroundColor: "white" }}>
                                                        ₹{formatCurrency(calculatePaid(b))}
                                                    </td>

                                                    <td style={{ textAlign: "right", backgroundColor: "white" }}>
                                                        ₹{formatCurrency(b.discount)}
                                                    </td>

                                                    <td style={{ textAlign: "right", color: "red", backgroundColor: "white" }}>
                                                        ₹{formatCurrency(b.due)}
                                                    </td>
                                                </tr>
                                            ))}

                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            )}

        </div>
    );
}