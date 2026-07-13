import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import '../styles/Calendar.css';
import { db } from '../firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';

const toISTDate = (dateInput) => {
    if (!dateInput) return new Date();
    let date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    return new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
};

const parseToDate = (val) => {
    if (!val) return new Date();
    if (val instanceof Date) return toISTDate(val);
    if (typeof val === "string") {
        const [y, m, d] = val.split("-").map(Number);
        return toISTDate(new Date(y, m - 1, d));
    }
    return toISTDate(new Date());
};

const CalendarInput = ({
    isOpen,
    onClose,
    onDateSelect,
    injectedEvents = {},
    selectedDate,
    currentVenueType,
}) => {
    const [date, setDate] = useState(parseToDate(selectedDate));
    const [events, setEvents] = useState({});
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");

    const toDateKey = (d) => {
        if (!(d instanceof Date)) d = parseToDate(d);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    };


    useEffect(() => {
        if (selectedDate) {
            setDate(parseToDate(selectedDate)); // always Date object inside
        }
    }, [selectedDate]);

    useEffect(() => {
        if (!isOpen) return;

        const fetchEvents = async () => {
            try {
                const prebookingsSnapshot = await getDocs(collection(db, 'prebookings'));
                const eventDates = {};

                // ✅ PREBOOKINGS
                prebookingsSnapshot.forEach((doc) => {
                    const fields = doc.data();
                    Object.values(fields).forEach((item) => {
                        if (item.functionDate) {
                            const key = item.functionDate; // already in yyyy-mm-dd
                            const type = item.functionType || 'Event';
                            const venueType = item.venueType || 'Event';

                            if (!eventDates[key]) eventDates[key] = [];

                            eventDates[key].push({
                                label: `${type} In ${venueType}`,
                                venueType: venueType,
                            });
                        }
                    });
                });

                // merge injectedEvents
                const merged = { ...eventDates };
                Object.entries(injectedEvents || {}).forEach(([dateKey, arr]) => {
                    if (!Array.isArray(arr)) return;
                    if (!merged[dateKey]) merged[dateKey] = [];
                    merged[dateKey] = [...merged[dateKey], ...arr];
                });
                setEvents(merged);

            } catch (error) {
                console.error('Error fetching events:', error);
            }
        };

        fetchEvents();
    }, [isOpen, injectedEvents]);

    const tileClassName = ({ date: tileDate }) => {
        const key = toDateKey(tileDate);
        const eventsForDay = events[key];

        if (!eventsForDay || eventsForDay.length === 0) return 'no-event';

        // Helper to always get label
        const getLabel = (e) => (typeof e === "string" ? e : e.label || "");
        const getVenue = (e) => (typeof e === "string" ? null : e.venueType || null);

        // Existing logic
        if (eventsForDay.some(e => getLabel(e).startsWith('[Hold]'))) {
            return 'hold-date'; // orange
        }
        if (eventsForDay.some(e => getLabel(e).startsWith('[Enquiry]'))) {
            return 'enquiry-date'; // green
        }

        // ✅ NEW: conflict for same venueType → red
        if (currentVenueType && eventsForDay.some(e => getVenue(e) === currentVenueType)) {
            return 'conflict-date'; // 🔴 we will style this red
        }

        // Default: some event but not conflicting
        return 'has-event'; // blue
    };

    const handleDateClick = (clickedDate) => {
        const key = toDateKey(clickedDate); // yyyy-mm-dd
        setDate(clickedDate); // ✅ Date object
        setSelectedEvent(events[key] || null);

        if (onDateSelect) {
            onDateSelect(key); // ✅ string for parent
        }
    };

    const handleSearch = (value) => {
        setSearchTerm(value);

        if (!value.trim()) return;

        // Normalize separators: replace "/" or "." with "-"
        const normalized = value.replace(/[/.]/g, "-").trim();

        // Try to detect and handle month names too (optional improvement)
        const monthNames = {
            jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
            jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
        };

        let d, m, y;

        // Case 1: if it looks like "5-2-2026" or "05-02-2026"
        if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(normalized)) {
            [d, m, y] = normalized.split("-").map(Number);
        }
        // Case 2: if month name like "5 Feb 2026" or "5-Feb-26"
        else if (/(\d{1,2})\s*[- ]?\s*([A-Za-z]+)\s*[- ]?\s*(\d{2,4})/.test(normalized)) {
            const match = normalized.match(/(\d{1,2})\s*[- ]?\s*([A-Za-z]+)\s*[- ]?\s*(\d{2,4})/);
            d = parseInt(match[1]);
            m = monthNames[match[2].substring(0, 3).toLowerCase()] || 0;
            y = parseInt(match[3]);
        }

        // Fix 2-digit year (like 26 → 2026)
        if (y < 100) y += 2000;

        // Validate and proceed
        if (!isNaN(d) && !isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
            const searchDate = new Date(y, m - 1, d);
            const key = toDateKey(searchDate);

            setDate(searchDate); // moves calendar
            setSelectedEvent(events[key] || []);

            // ✅ force react-calendar to update focus (important!)
            document.querySelector(".react-calendar__navigation__label button")?.click();
        }
    };

    if (!isOpen) return null;

    return (
        <div style={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="calendar-title">
            <div style={styles.modal}>
                <button
                    onClick={onClose}
                    style={styles.closeBtn}
                    aria-label="Close calendar"
                    title="Close"
                >
                    ✖
                </button>

                {/* 🔎 Search Box */}
                <div style={{ textAlign: "center", marginBottom: 15 }}>
                    <input
                        type="text"
                        placeholder="Search date (e.g., 17-08-2025)"
                        value={searchTerm}
                        onChange={(e) => handleSearch(e.target.value)}
                        style={{
                            padding: "6px 10px",
                            width: "80%",
                            maxWidth: "300px",
                            borderRadius: "5px",
                        }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Calendar
                        onChange={setDate}
                        value={date}
                        tileClassName={tileClassName}
                        onClickDay={handleDateClick}
                        prev2Label={null}
                        next2Label={null}
                    />
                </div>

                {selectedEvent && selectedEvent.length > 0 ? (
                    <div style={{ ...styles.eventList, margin: "0px", padding: "0px" }}>
                        {selectedEvent.map((ev, i) => {
                            const label = typeof ev === "string" ? ev : ev.label || "";
                            return (
                                <div key={i} style={{ ...styles.eventItem, margin: "0px", padding: "0px" }}>
                                    <p>{label}</p>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ ...styles.noEvent, margin: "0px" }}>
                        <p></p>
                    </div>
                )}
                <div style={{ margin: "0px" }}>
                    <p style={{ margin: "0px", color: "red" }}>Red = Booked For Selected Venue</p>
                    <p style={{ margin: "0px", color: "green" }}>Green = Booked For Other Venue</p>
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999,
    },
    modal: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 10,
        width: '90%',
        maxWidth: 600,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
        position: 'relative',
    },
    closeBtn: {
        position: 'absolute',
        top: 10,
        right: 10,
        background: 'transparent',
        border: 'none',
        fontSize: 18,
        color: 'red',
        cursor: 'pointer',
    },
    eventList: {
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    eventItem: {
        color: '#333',
        fontSize: 18,
    },
    eventDate: {
        fontSize: 18,
        marginBottom: 5,
    },
    noEvent: {
        marginTop: 20,
        textAlign: 'center',
        color: '#555',
    },
};

export default CalendarInput;
