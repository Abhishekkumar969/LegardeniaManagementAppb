import React, { useMemo } from "react";

/* ---------- IST SAFE DATE ---------- */
const parseISTDate = (dateStr) => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
};

const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const [y, m, d] = dateStr.split("-");
    return `${d}-${m}-${y}`;
};

/* ---------- DAYS (checkout excluded) ---------- */
const calcDays = (from, to) => {
    if (!from || !to) return 1;
    const d1 = parseISTDate(from);
    const d2 = parseISTDate(to);
    return Math.max(
        1,
        Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
    );
};

const RoomRevenueDashboard = ({
    rooms = [],
    bookings = [],
    selectedDate   // 👈 pass this
}) => {

    const { revenueMap, totalRevenue } = useMemo(() => {
        const map = {};
        let total = 0;

        rooms.forEach(r => {
            map[r.id] = 0;
        });

        bookings.forEach(b => {
            if (!b.fromDate || !b.toDate) return;

            const days = calcDays(b.fromDate, b.toDate);
            const roomRates = b.roomRates || {};

            const roomIds = new Set();
            b.guests?.forEach(g =>
                g.rooms?.forEach(r => roomIds.add(r.id))
            );

            roomIds.forEach(roomId => {
                const rate = Number(roomRates[roomId] || 0);
                const amount = rate * days;
                map[roomId] += amount;
                total += amount;
            });
        });

        return { revenueMap: map, totalRevenue: total };
    }, [rooms, bookings]);

    return (
        <div className="card" style={{ marginTop: "20px" }}>
            <h3 style={{ marginBottom: "4px" }}>
                📊 Room-wise Revenue: {formatDate(selectedDate)}
            </h3>

            {rooms.length === 0 ? (
                <p style={{ opacity: 0.6 }}>No rooms found</p>
            ) : (
                <>
                    {rooms.map(r => (
                        <div
                            key={r.id}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "8px 0",
                                borderBottom: "2px solid #edededee"
                            }}
                        >
                            <span>{r.name}</span>
                            <b>₹{(revenueMap[r.id] || 0).toLocaleString("en-IN")}</b>
                        </div>
                    ))}

                    {/* TOTAL */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            paddingTop: "10px",
                            marginTop: "8px",
                            borderTop: "2px dashed #bfbebeff",
                            fontWeight: "bold"
                        }}
                    >
                        <span>Total</span>
                        <span>₹{totalRevenue.toLocaleString("en-IN")}</span>
                    </div>
                </>
            )}
        </div>
    );
};

export default RoomRevenueDashboard;
