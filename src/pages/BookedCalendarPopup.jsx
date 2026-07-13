import React, { useEffect, useState } from "react";
import { getDocs, collection } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "../styles/LiveAvailability.css";

const AllBookingDatesPopup = ({ isOpen, onClose }) => {
    const [calendarData, setCalendarData] = useState({});
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedBooking, setSelectedBooking] = useState([]);

    const [venueFilter, setVenueFilter] = useState("All");    // ⭐ Venue Filter State
    const [venueList, setVenueList] = useState([]);          // ⭐ Unique Venue Names

    const formatISTDate = (dateStr) => {
        if (!dateStr) return "";
        const utc = new Date(dateStr);
        const ist = new Date(utc.getTime() + 5.5 * 60 * 60 * 1000);

        return ist.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    };

    // 🔥 Convert Firestore date → IST yyyy-mm-dd
    const convertToIST = (dateStr) => {
        if (!dateStr) return null;
        const utc = new Date(dateStr);
        const ist = new Date(utc.getTime() + 5.5 * 60 * 60 * 1000);

        return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(
            2, "0"
        )}-${String(ist.getDate()).padStart(2, "0")}`;
    };

    // 🔥 Fetch Only BOOKED Data
    useEffect(() => {
        if (!isOpen) return;

        const fetchData = async () => {
            let map = {};
            let allVenues = new Set();

            const add = (istDateKey, bookingObj) => {
                const key = istDateKey;
                if (!map[key]) map[key] = [];
                map[key].push(bookingObj);
            };

            const snap = await getDocs(collection(db, "prebookings"));
            snap.forEach((doc) => {
                Object.values(doc.data()).forEach((item) => {
                    if (item.functionDate) {
                        const istKey = convertToIST(item.functionDate);

                        const booking = {
                            name: item.name || "",
                            mobile: item.mobile1 || "",
                            venueType: item.venueType || "",
                            functionType: item.functionType || "",
                            startTime: item.startTime || "",
                            endTime: item.finishTime || "",
                            functionDate: item.functionDate || "",
                            selectedMenus: item.selectedMenus || {},
                        };

                        add(istKey, booking);

                        if (booking.venueType) {
                            allVenues.add(booking.venueType);
                        }
                    }
                });
            });

            setVenueList(["All", ...Array.from(allVenues)]);
            setCalendarData(map);
        };

        fetchData();
    }, [isOpen]);

    if (!isOpen) return null;

    // ⭐ Calendar Logic
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const today = new Date();

    const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

    const getCalendarKey = (day) => {
        return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    };

    return (
        <div className="overlay">

            <div
                className="popup-container"
                onClick={(e) => e.stopPropagation()}
            >

                {/* ==========================
                   HEADER + VENUE FILTER
                =========================== */}
                <div style={{
                    display: 'flex',
                    justifyContent: "end"
                }}>
                    {/* CLOSE BUTTON */}
                    <button onClick={onClose} className="close-btnCalendar">X</button>
                </div>

                {/* Month Navigation */}
                <div style={{
                    display: 'flex',
                    justifyContent: "space-between",
                    alignItems: "center"
                }}>
                    <button onClick={prevMonth} className="nav-btn">
                        <ChevronLeft size={18} />
                    </button>
                    <h3>
                        {currentMonth.toLocaleDateString("en-IN", {
                            month: "long",
                            year: "numeric",
                        })}
                    </h3>
                    <button onClick={nextMonth} className="nav-btn">
                        <ChevronRight size={18} />
                    </button>
                </div>



                {/* ⭐ VENUE FILTER DROPDOWN */}
                <div style={{ marginBottom: "15px" }}>
                    <label>⭐ VENUE FILTER</label>
                    <select
                        value={venueFilter}
                        onChange={(e) => setVenueFilter(e.target.value)}
                        style={{
                            padding: "8px 12px",
                            fontSize: "15px",
                            borderRadius: "8px",
                            border: "1px solid gray",
                            width: "100%"
                        }}
                    >
                        {venueList.map((v, i) => (
                            <option key={i} value={v}>{v}</option>
                        ))}
                    </select>
                </div>

                {/* ==========================
                   CALENDAR GRID
                =========================== */}
                <div className="calendar-grid">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="day-name">{day}</div>
                    ))}

                    {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="day empty"></div>
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, idx) => {
                        const day = idx + 1;
                        const key = getCalendarKey(day);

                        let bookings = calendarData[key] || [];

                        // 🔥 Apply Venue Filter
                        if (venueFilter !== "All") {
                            bookings = bookings.filter(b => b.venueType === venueFilter);
                        }

                        const isBooked = bookings.length > 0;
                        const date = new Date(year, month, day);
                        const isToday = date.toDateString() === today.toDateString();

                        return (
                            <div
                                key={idx}
                                className={`day ${isToday ? "today" : ""} ${isBooked ? "booked" : "free"}`}
                                onClick={() => isBooked && setSelectedBooking(bookings)}
                            >
                                <div style={{ fontWeight: 700 }}>{day}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SMALL DETAILS POPUP */}
            {selectedBooking.length > 0 && (
                <div className="small-popup-overlay" onClick={() => setSelectedBooking([])}>
                    <div className="small-popup" onClick={(e) => e.stopPropagation()}>

                        <div style={{ display: "flex", justifyContent: "end" }}>
                            <button
                                onClick={() => setSelectedBooking([])}
                                style={{
                                    background: "red",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "8px",
                                    width: "28px",
                                    height: "28px",
                                    cursor: "pointer",
                                    fontWeight: "bold",
                                    fontSize: "20px",
                                    padding: "0px",
                                    position: "absolute",
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {selectedBooking.map((b, idx) => (
                            <div
                                key={idx}
                                style={{
                                    borderBottom: "1px solid #ccc",
                                    paddingBottom: "10px",
                                    marginBottom: "10px",
                                }}
                            >
                                <p style={{ fontSize: "16px", color: "red" }}>
                                    <b>Function Date:</b> {formatISTDate(b.functionDate)}
                                </p>

                                <p><b>Name:</b> {b.name}</p>

                                <p>
                                    <b>Mobile:</b>{" "}
                                    <a
                                        href={`tel:${b.mobile}`}
                                        style={{ color: "#020652ff", fontWeight: "500", textDecoration: "none" }}
                                    >
                                        {b.mobile}
                                    </a>
                                </p>

                                <p><b>Venue:</b> {b.venueType}</p>
                                <p><b>Function:</b> {b.functionType}</p>
                                <p><b>Start Time:</b> {b.startTime}, <b>Finish Time:</b> {b.endTime}</p>

                                {/* Food Data */}
                                {b.selectedMenus &&
                                    Object.entries(b.selectedMenus).map(([menuName, menuData], i) => (
                                        <p key={i}><b>Food:</b> {menuName}, <b>Pax:</b> {menuData.noOfPlates || "-"}</p>
                                    ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AllBookingDatesPopup;