import React, { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";
import "../styles/RoomsAllBookingDatesList.css";

/* =======================
   IST SAFE HELPERS
======================= */

// YYYY-MM-DD → Date (IST safe)
const parseISTDate = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
};

// Date → YYYY-MM-DD
const formatDateKey = (dateObj) =>
    `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(
        dateObj.getDate()
    ).padStart(2, "0")}`;

// Month → 4 bucket IDs
const getMonthBuckets = (year, month) => {
    const mm = String(month + 1).padStart(2, "0");
    return [
        `01${mm}${year}`,
        `09${mm}${year}`,
        `17${mm}${year}`,
        `25${mm}${year}`
    ];
};

const RoomBookingDates = ({ onDateSelect }) => {
    const [calendarData, setCalendarData] = useState({});
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);

    /* =======================
       🔥 REALTIME BOOKINGS
    ======================= */

    useEffect(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const bucketIds = getMonthBuckets(year, month);

        const unsubscribes = [];

        bucketIds.forEach(bucketId => {
            const ref = doc(db, "roomBookings", bucketId);

            const unsub = onSnapshot(ref, snap => {
                if (!snap.exists()) return;

                const map = {};

                Object.entries(snap.data())
                    .filter(([k]) => k !== "updatedAt" && k !== "bucket")
                    .forEach(([, booking]) => {
                        if (!booking.fromDate || !booking.toDate) return;

                        const start = parseISTDate(booking.fromDate);
                        const end = parseISTDate(booking.toDate);

                        // 🔥 HOTEL RULE → checkout day EXCLUDED
                        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)
                        ) { const key = formatDateKey(d); map[key] = true; }
                    });

                setCalendarData(prev => ({ ...prev, ...map }));
            });

            unsubscribes.push(unsub);
        });

        return () => unsubscribes.forEach(u => u());
    }, [currentMonth]);

    /* =======================
       CALENDAR LOGIC
    ======================= */

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

    const getKey = (day) =>
        formatDateKey(new Date(year, month, day));

    const cells = [];
    for (let i = 0; i < firstDayOfMonth; i++) cells.push({ empty: true });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

    const today = new Date();
    const todayKey = formatDateKey(
        new Date(today.getFullYear(), today.getMonth(), today.getDate())
    );

    /* =======================
       UI
    ======================= */

    return (
        <div className="calendar-container card" style={{ maxWidth: "600px" }}>
            {/* Header */}
            <div className="cal-header">
                <button className="nav-btn" onClick={prevMonth}>◀</button>
                <h2>
                    {new Date(year, month).toLocaleDateString("en-IN", {
                        month: "long",
                        year: "numeric"
                    })}
                </h2>
                <button className="nav-btn" onClick={nextMonth}>▶</button>
            </div>

            {/* Weekdays */}
            <div className="weekday-row">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                    <div key={d} className="weekday">{d}</div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="calendar-grid">
                {cells.map((c, i) => {
                    if (c.empty) return <div key={i} className="empty-cell" />;

                    const key = getKey(c.day);
                    const isBooked = !!calendarData[key];
                    const isToday = key === todayKey;
                    const isSelected = key === selectedDate;

                    return (
                        <div
                            key={i}
                            className={[
                                "date-box",
                                isBooked ? "booked" : "available",
                                isToday ? "today" : "",
                                isSelected ? "selected" : ""
                            ].join(" ")}
                            onClick={() => {
                                setSelectedDate(key);
                                onDateSelect?.(key);
                            }}
                        >
                            <div className="date-number">{c.day}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default RoomBookingDates;
