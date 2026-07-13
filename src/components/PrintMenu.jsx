import React, { useEffect, useState } from "react";
import { db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
// import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "../styles/DailyReport.css";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DuePayments() {
    const [previousFilter, setPreviousFilter] = useState("1");
    const [upcomingFilter, setUpcomingFilter] = useState("1");

    const [pastDues, setPastDues] = useState([]);
    const [upcomingDues, setUpcomingDues] = useState([]);
    const [pastSortAsc, setPastSortAsc] = useState(false);   // default desc
    const [upcomingSortAsc, setUpcomingSortAsc] = useState(true); // default asc


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

    const calculateDue = (lead) => {
        const total = Number(lead.grandTotal || 0) + Number(lead.discount || 0);
        const adv = (lead.advancePayments || []).reduce((sum, a) => sum + Number(a.amount || 0), 0);
        const refund = (lead.refundPayments || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
        return total - adv + refund;
    };

    useEffect(() => {
        const fetchAll = async () => {
            let allLeads = [];

            let pointer = new Date();
            for (let i = 0; i < 24; i++) {
                const key = `${monthNames[pointer.getMonth()]}${pointer.getFullYear()}`;
                const snap = await getDoc(doc(db, "prebookings", key));

                if (snap.exists()) {
                    Object.entries(snap.data()).forEach(([id, lead]) => {
                        if (!lead || !lead.functionDate) return;

                        allLeads.push({
                            ...lead,
                            id,
                        });
                    });
                }

                pointer.setMonth(pointer.getMonth() - 1);
            }

            const today = new Date(
                new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
            );

            const past = [];
            const upcoming = [];

            allLeads.forEach((lead) => {
                const funcDate = new Date(
                    new Date(lead.functionDate).toLocaleString("en-US", {
                        timeZone: "Asia/Kolkata",
                    })
                );

                const due = calculateDue(lead);

                if (due <= 10) return;

                if (funcDate < today) past.push({ ...lead, due });
                else upcoming.push({ ...lead, due });
            });

            setPastDues(past);
            setUpcomingDues(upcoming);
        };

        fetchAll();
    }, []);

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

    const totalUpcoming = filteredUpcoming.reduce((a, b) => a + b.due, 0);

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

        // SORT HERE
        list.sort((a, b) => {
            const da = new Date(a.functionDate);
            const db = new Date(b.functionDate);
            return pastSortAsc ? da - db : db - da;  // 🔥 toggle ASC/DESC
        });

        return list;
    })();

    const totalPast = filteredPast.reduce((a, b) => a + b.due, 0);

    const totalPastDiscount = filteredPast.reduce(
        (sum, l) => sum + Number(l.discount || 0),
        0
    );

    const totalUpcomingDiscount = filteredUpcoming.reduce(
        (sum, l) => sum + Number(l.discount || 0),
        0
    );

    return (
        <div
            style={{
                backgroundColor: "#ffe5d0",
                boxShadow: "inset -8px -8px 8px #fcd6b8",
                marginTop: "30px",
                paddingBottom: "20px",
            }}
            className="service-section"
        >

            {/* ===================== PAST DUES TABLE ====================== */}
            <div
                style={{
                    margin: "0px -15px",
                    marginTop: "20px",
                    background: "#fff3cd7e",
                    borderRadius: "8px",
                    border: "1px solid #9c278b3d",
                    padding: "5px"
                }}
            >
                <h3 className="service-section-text" >⏳ Previous Dues</h3>

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

                <table className="responsive-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Mobile</th>
                            <th>Function Type</th>
                            <th
                                style={{ cursor: "pointer" }}
                                onClick={() => setPastSortAsc(!pastSortAsc)}
                            >
                                Date {pastSortAsc ? "↑" : "↓"}
                            </th>

                            <th>Due:
                                <div style={{ fontWeight: "800" }}>
                                    ₹{Math.floor(totalPast).toLocaleString("en-IN")}
                                </div>
                            </th>
                            <th>Grand Total:
                                <div style={{ fontWeight: "800" }}>
                                    ₹{Math.floor(
                                        pastDues.reduce((sum, l) => sum + Number(l.grandTotal || 0), 0)
                                    ).toLocaleString("en-IN")}
                                </div>
                            </th>
                            <th>
                                Discount:
                                <div style={{ fontWeight: "800" }}>
                                    ₹{Math.floor(totalPastDiscount).toLocaleString("en-IN")}
                                </div>
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {filteredPast.map((l) => (
                            <tr key={l.id}>
                                <td>{l.name}</td>
                                <td>
                                    {l.mobile1 && (
                                        <span
                                            style={{ cursor: "pointer", fontWeight: "600" }}
                                            onClick={() => (window.location.href = `tel:${l.mobile1}`)}
                                        >
                                            {l.mobile1}
                                        </span>
                                    )}

                                    {l.mobile2 && (
                                        <>
                                            <span style={{ margin: "0 4px" }}> , </span>
                                            <span
                                                style={{ cursor: "pointer", fontWeight: "600" }}
                                                onClick={() => (window.location.href = `tel:${l.mobile2}`)}
                                            >
                                                {l.mobile2}
                                            </span>
                                        </>
                                    )}
                                </td>

                                <td>{l.functionType}</td>

                                <td>{formatDateIST(l.functionDate)}</td>
                                <td style={{ color: "red", fontWeight: 700 }}>
                                    ₹{l.due.toLocaleString("en-IN")}
                                </td>
                                <td>₹{l.grandTotal.toLocaleString("en-IN")}</td>
                                <td>₹{l.discount.toLocaleString("en-IN")}</td>


                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <br />
            <hr />

            {/* ===================== UPCOMING DUES TABLE ====================== */}
            <div
                style={{
                    margin: "0px -15px",
                    marginTop: "20px",
                    background: "#fff3cd7e",
                    borderRadius: "8px",
                    border: "1px solid #9c278b3d", padding: "5px"
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

                <table className="responsive-table">

                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Mobile</th>
                            <th>Function Type</th>
                            <th
                                style={{ cursor: "pointer" }}
                                onClick={() => setUpcomingSortAsc(!upcomingSortAsc)}
                            >
                                Date {upcomingSortAsc ? "↑" : "↓"}
                            </th>

                            <th>Due:
                                <div style={{ fontWeight: "800" }}>
                                    ₹{Math.floor(totalUpcoming).toLocaleString("en-IN")}
                                </div>
                            </th>

                            <th>Grand Total:
                                <div style={{ fontWeight: "800" }}>
                                    ₹{Math.floor(
                                        filteredUpcoming.reduce((sum, l) => sum + Number(l.grandTotal || 0), 0)
                                    ).toLocaleString("en-IN")}
                                </div>
                            </th>

                            <th>
                                Discount:
                                <div style={{ fontWeight: "800" }}>
                                    ₹{Math.floor(totalUpcomingDiscount).toLocaleString("en-IN")}
                                </div>
                            </th>
                        </tr>
                    </thead>

                    <tbody>

                        {filteredUpcoming.map((l) => (
                            <tr key={l.id}>
                                <td>{l.name}</td>
                                <td>
                                    {l.mobile1 && (
                                        <span
                                            style={{ cursor: "pointer", fontWeight: "600" }}
                                            onClick={() => (window.location.href = `tel:${l.mobile1}`)}
                                        >
                                            {l.mobile1}
                                        </span>
                                    )}

                                    {l.mobile2 && (
                                        <>
                                            <span style={{ margin: "0 4px" }}> , </span>
                                            <span
                                                style={{ cursor: "pointer", fontWeight: "600" }}
                                                onClick={() => (window.location.href = `tel:${l.mobile2}`)}
                                            >
                                                {l.mobile2}
                                            </span>
                                        </>
                                    )}
                                </td>
                                <td>{l.functionType}</td>
                                <td>{formatDateIST(l.functionDate)}</td>
                                <td style={{ color: "green", fontWeight: 700 }}>
                                    ₹{l.due.toLocaleString("en-IN")}
                                </td>

                                <td>₹{l.grandTotal.toLocaleString("en-IN")}</td>
                                <td>₹{l.discount.toLocaleString("en-IN")}</td>

                            </tr>
                        ))}


                    </tbody>
                </table>
            </div>

        </div>
    );
}
