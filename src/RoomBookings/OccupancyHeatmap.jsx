import React, { useMemo } from "react";

/* ---------- IST SAFE DATE ---------- */
const parseISTDate = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
};

/* ---------- DATE RANGE CHECK ---------- */
const isDateInRange = (selected, from, to) => {
    const s = parseISTDate(selected);
    const f = parseISTDate(from);
    const t = parseISTDate(to);

    // checkout INCLUDED
    return s >= f && s <= t;
};

const OccupancyHeatmap = ({ rooms = [], bookings = [], selectedDate }) => {

    const occupancyMap = useMemo(() => {
        const map = {};

        rooms.forEach(r => {
            map[r.id] = false;
        });

        bookings.forEach(b => {
            if (!isDateInRange(selectedDate, b.fromDate, b.toDate)) return;

            b.guests?.forEach(g =>
                g.rooms?.forEach(r => {
                    map[r.id] = true;
                })
            );
        });

        return map;
    }, [rooms, bookings, selectedDate]);

    const formatDDMMYYYY = (dateStr) => {
        if (!dateStr) return "-";
        const [y, m, d] = dateStr.split("-");
        return `${d}-${m}-${y}`;
    };

    return (
        <div className="card">
            <h3>🗓️ Availability: {formatDDMMYYYY(selectedDate)}</h3>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: "10px"
                }}
            >
                {rooms.map(r => {
                    const booked = occupancyMap[r.id];

                    return (
                        <div
                            key={r.id}
                            style={{
                                padding: "12px",
                                borderRadius: "6px",
                                textAlign: "center",
                                background: booked ? "#ffcccc" : "#ccffcc",
                                fontWeight: "bold"
                            }}
                        >
                            {r.name}
                            <div style={{ fontSize: "12px" }}>
                                {booked ? "Booked" : "Available"}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default OccupancyHeatmap;          
