import React, { useMemo, useState } from "react";

/* =======================
   IST SAFE HELPERS
======================= */
const parseISTDate = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
};

const formatDate = (d) => {
    if (!d) return "-";
    const [y, m, day] = d.split("-");
    return `${day}-${m}-${y}`;
};

const formatTime = (t) => {
    if (!t) return "-";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
};

/* =======================
   COMPONENT
======================= */
const AllBookedRoomsTable = ({
    bookings = [],
    selectedDate,
    onEdit,
    loading = false,
    isFetching = false,
    handlePrint
}) => {
    const [sortBy, setSortBy] = useState("fromDate");
    const [sortOrder, setSortOrder] = useState("desc");

    const rows = useMemo(() => {
        const mapped = bookings.map(b => {
            const amounts = b.amounts || {};

            const payments = Array.isArray(b.payments) ? b.payments : [];

            const totalPaid = payments.reduce(
                (sum, p) => sum + Number(p.amount || 0),
                0
            );

            const remainingAmount = Math.max(
                0,
                (amounts.finalAmount ?? 0) - totalPaid
            );

            const days = amounts.noOfDays ?? 1;
            const roomsSubtotal = amounts.roomsSubtotal ?? 0;
            const totalGST = amounts.totalGST ?? 0;
            const discount = amounts.discount ?? 0;
            const finalAmount = amounts.finalAmount ?? 0;

            const keyHolders = b.roomKeyHolders || {};

            const roomsMap = {};
            b.guests?.forEach(g =>
                g.rooms?.forEach(r => {
                    roomsMap[r.id] = r;
                })
            );

            return {
                id: b.id,
                fromDateObj: parseISTDate(b.fromDate),
                toDateObj: parseISTDate(b.toDate),

                guests: b.guests || [],
                rooms: Object.values(roomsMap),
                keyHolders,

                days,
                roomsSubtotal,
                totalGST,
                discount,
                finalAmount,

                totalPaid,
                remainingAmount,

                isCheckoutToday: selectedDate === b.toDate,
                rawBooking: b
            };
        });

        // 🔥 SORT LOGIC
        mapped.sort((a, b) => {
            const valA = sortBy === "fromDate" ? a.fromDateObj : a.toDateObj;
            const valB = sortBy === "fromDate" ? b.fromDateObj : b.toDateObj;

            return sortOrder === "asc" ? valA - valB : valB - valA;
        });

        return mapped;
    }, [bookings, sortBy, sortOrder, selectedDate]);

    return (
        <div className="card leads-table-container" style={{ padding: "0px" }}>
            <h3>📋 All Room Bookings</h3>

            <div className="table-fixed-wrapper" style={{ maxHeight: "75vh" }}>
                <table className="leads-table">
                    <thead>
                        <tr>
                            <th>Sl.</th>

                            <th
                                style={{ cursor: "pointer" }}
                                onClick={() => {
                                    if (sortBy === "fromDate") {
                                        setSortOrder(o => (o === "asc" ? "desc" : "asc"));
                                    } else {
                                        setSortBy("fromDate");
                                        setSortOrder("desc");
                                    }
                                }}
                            >
                                Check-In {sortBy === "fromDate" && (sortOrder === "asc" ? "▲" : "▼")}
                            </th>

                            <th
                                style={{ cursor: "pointer" }}
                                onClick={() => {
                                    if (sortBy === "toDate") {
                                        setSortOrder(o => (o === "asc" ? "desc" : "asc"));
                                    } else {
                                        setSortBy("toDate");
                                        setSortOrder("desc");
                                    }
                                }}
                            >
                                Check-Out {sortBy === "toDate" && (sortOrder === "asc" ? "▲" : "▼")}
                            </th>

                            <th>Rooms</th>
                            <th>Guests</th>
                            <th>Mobiles</th>
                            <th>Key Holders</th>
                            <th>Days</th>
                            <th>Subtotal</th>
                            <th>GST</th>
                            <th>Discount</th>
                            <th>Total Sale</th>
                            <th>Total Paid</th>
                            <th>Remaining</th>
                            <th>Print</th>
                            <th>Update</th>
                        </tr>
                    </thead>

                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan="14" style={{ textAlign: "center", padding: "20px" }}>
                                    ⏳ Loading bookings...
                                </td>
                            </tr>
                        )}

                        {!loading && isFetching && (
                            <tr>
                                <td colSpan="14" style={{ textAlign: "center", opacity: 0.6 }}>
                                    Updating…
                                </td>
                            </tr>
                        )}

                        {!loading && !isFetching && rows.map((r, i) => (
                            <tr key={r.id}>
                                <td style={{ backgroundColor: "white" }}>{i + 1}</td>

                                <td style={{ backgroundColor: "white" }}>
                                    <b>{formatDate(r.rawBooking.fromDate)}</b>
                                    <div style={{ fontSize: "12px" }}>
                                        {formatTime(r.rawBooking.fromTime)}
                                    </div>
                                </td>

                                <td style={{ backgroundColor: "white" }}>
                                    <b>{formatDate(r.rawBooking.toDate)}</b>
                                    <div style={{ fontSize: "12px" }}>
                                        {formatTime(r.rawBooking.toTime)}
                                    </div>

                                    {r.isCheckoutToday && (
                                        <div style={{ fontSize: "11px", color: "red", fontWeight: 600 }}>
                                            Checkout: {formatDate(selectedDate)}

                                            {r.isCheckoutDay && r.remainingAmount > 0 && (
                                                <div style={{ fontSize: "11px", color: "red", fontWeight: 700 }}>
                                                    Pending ₹{r.remainingAmount}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </td>

                                <td>
                                    {r.rooms.map(room => (
                                        <div key={room.id}>{room.name}</div>
                                    ))}
                                </td>

                                <td>
                                    {r.guests.map((g, gi) => (
                                        <div key={gi}>{g.name || `Guest ${gi + 1}`}</div>
                                    ))}
                                </td>

                                <td>
                                    {r.guests.map((g, gi) => (
                                        <div key={gi}>
                                            {g.mobile ? (
                                                <a
                                                    href={`tel:${g.mobile}`}
                                                    style={{
                                                        color: "#0f8eb9",
                                                        textDecoration: "none",
                                                        fontWeight: 600
                                                    }}
                                                >
                                                    📞 {g.mobile}
                                                </a>
                                            ) : (
                                                "-"
                                            )}
                                        </div>
                                    ))}
                                </td>

                                <td>
                                    {r.rooms.map(room => {
                                        const gi = r.keyHolders?.[room.id];
                                        const guest = r.guests?.[gi - 1];
                                        return (
                                            <div key={room.id} style={{ color: "green", fontWeight: 600 }}>
                                                🔑 {room.name}: {guest?.name || "-"}
                                            </div>
                                        );
                                    })}
                                </td>

                                <td>{r.days}</td>

                                <td>₹{r.roomsSubtotal.toLocaleString("en-IN")}</td>
                                <td>₹{r.totalGST.toLocaleString("en-IN")}</td>
                                <td>₹{r.discount.toLocaleString("en-IN")}</td>


                                <td style={{ fontWeight: 700, color: "#0f8eb9" }}>
                                    ₹{r.finalAmount.toLocaleString("en-IN")}
                                </td>

                                <td style={{ fontWeight: 600, color: "green" }}>
                                    ₹{r.totalPaid.toLocaleString("en-IN")}
                                </td>

                                <td style={{ fontWeight: 700, color: r.remainingAmount > 0 ? "red" : "green" }}>
                                    ₹{r.remainingAmount.toLocaleString("en-IN")}
                                </td>

                                <td>
                                    <button className="btn-success" onClick={() => handlePrint(r)}>
                                        🖨 Print
                                    </button>
                                </td>

                                <td>
                                    <button className="btn-primary" onClick={() => onEdit?.(r.rawBooking)}>
                                        ✏️ Update
                                    </button>
                                </td>
                            </tr>
                        ))}

                        {!loading && !isFetching && rows.length === 0 && (
                            <tr>
                                <td colSpan="14" style={{ textAlign: "center", opacity: 0.6 }}>
                                    No bookings found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AllBookedRoomsTable;
