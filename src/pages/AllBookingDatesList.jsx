import React, { useEffect, useState, useCallback } from "react";
import { getDocs, collection, doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useNavigate } from 'react-router-dom';
import BackButton from "../components/BackButton";
import BottomNavigationBar from "../components/BottomNavigationBar";
import styles from "../styles/AllBookingDatesList.module.css";
import { getAuth } from "firebase/auth";

const AllBookingDatesList = () => {
    const navigate = useNavigate();
    const [calendarData, setCalendarData] = useState({});
    const [venueFilter, setVenueFilter] = useState("All");
    const [venueList, setVenueList] = useState([]);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [userAppType, setUserAppType] = useState(null);

    useEffect(() => {
        const fetchUserAppType = async () => {
            const auth = getAuth();
            const user = auth.currentUser;
            if (user) {
                try {
                    const userRef = doc(db, 'usersAccess', user.email);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        setUserAppType(data.accessToApp);
                    }
                } catch (err) {
                    console.error("Error fetching user app type:", err);
                }
            }
        };
        fetchUserAppType();
    }, []);

    // Converts Firestore timestamp/string into pure IST Date object
    const toISTDate = useCallback((dateStr) => {
        const d = new Date(dateStr);
        return new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    }, []);

    const getISTKey = useCallback((dateStr) => {
        const ist = toISTDate(dateStr);
        return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(
            ist.getDate()
        ).padStart(2, "0")}`;
    }, [toISTDate]);


    const getISTDateTime = (dateStr, timeStr) => {
        if (!dateStr || !timeStr) return null;
        const combined = `${dateStr}T${timeStr}`;
        // Create a valid date in IST
        return new Date(new Date(combined).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    };

    useEffect(() => {
        const fetchData = async () => {
            let map = {};
            let allVenues = new Set();

            const snap = await getDocs(collection(db, "prebookings"));
            snap.forEach((doc) => {
                Object.values(doc.data()).forEach((item) => {
                    if (item.functionDate) {
                        const istKey = getISTKey(item.functionDate);

                        const booking = {
                            name: item.name || "",
                            mobile: item.mobile1 || "",
                            venueType: item.venueType || "",
                            functionType: item.functionType || "",
                            startTime: item.startTime || "",
                            endTime: item.finishTime || "",
                            selectedMenus: item.selectedMenus || {},
                            functionDate: item.functionDate,
                        };

                        if (!map[istKey]) map[istKey] = [];
                        map[istKey].push(booking);

                        if (booking.venueType) allVenues.add(booking.venueType);
                    }
                });
            });

            setVenueList(["All", ...Array.from(allVenues)]);
            setCalendarData(map);
        };

        fetchData();
    }, [getISTKey]);

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDayOfMonth = new Date(
        new Date(year, month, 1).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    ).getDay();

    const daysInMonth = new Date(
        new Date(year, month + 1, 0).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    ).getDate();

    const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

    const getKey = (day) => {
        const d = new Date(year, month, day);
        const ist = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(
            ist.getDate()
        ).padStart(2, "0")}`;
    };

    let calendarCells = [];

    // empty cells before 1st date
    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarCells.push({ empty: true });
    }

    // actual dates
    for (let day = 1; day <= daysInMonth; day++) {
        calendarCells.push({ day });
    }

    return (
        <div className="page-scroller">
            <div className={styles.calendarContainer}>
                <div style={{ marginBottom: '30px' }}> <BackButton />  </div>

                {/* Header */}
                <div className={styles.calHeader}>
                    <button className={styles.navBtn} onClick={prevMonth}>◀</button>
                    <h2>
                        {new Date(
                            currentMonth.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
                        ).toLocaleDateString("en-IN", {
                            month: "long",
                            year: "numeric",
                        })
                        }
                    </h2>
                    <button className={styles.navBtn} onClick={nextMonth}>▶</button>
                </div>

                <div style={{ display: "flex", justifyContent: "center", marginBottom: "15px" }}>
                    <button className={styles.viewBtn} style={{ backgroundColor: "green", height: "35px", width: "120px", fontWeight: "800" }} onClick={() => navigate('/booking')}>
                        Book Now
                    </button>
                </div>

                {/* Venue Filter */}
                <div className={styles.filterBox} style={{ display: "flex", justifyContent: "space-between" }}>
                    <label style={{ whiteSpace: "nowrap", display: "flex", alignItems: "center" }}><b>Venue Filter: </b></label>
                    <select
                        value={venueFilter}
                        onChange={(e) => setVenueFilter(e.target.value)}
                        className={styles.venueSelect}
                        style={{ width: "50vw" }}
                    >
                        {venueList.map((v, i) => (
                            <option key={i} value={v}>{v}</option>
                        ))}
                    </select>
                </div>

                {/* Weekdays */}
                <div className={styles.weekdayRow}>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                        <div key={d} className={styles.weekday}>{d}</div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div className={styles.calendarGrid}>
                    {calendarCells.map((cell, idx) => {
                        if (cell.empty) {
                            return <div key={idx} className={styles.emptyCell}></div>;
                        }

                        const day = cell.day;
                        const key = getKey(day);
                        let bookings = calendarData[key] || [];

                        if (venueFilter !== "All") {
                            bookings = bookings.filter((b) => b.venueType === venueFilter);
                        }

                        return (
                            <div
                                key={idx}
                                className={`${styles.dateBox} ${bookings.length ? styles.booked : ""
                                    }`}
                            >

                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                    <div className={styles.dateNumber}>{day}</div>
                                </div>

                                {bookings.length > 0 ? (
                                    bookings.map((b, i) => (
                                        <div key={i} className={styles.smallBooking}>
                                            <div>{b.venueType}</div>
                                            <div className={styles.time}>
                                                {getISTDateTime(b.functionDate, b.startTime).toLocaleTimeString("en-IN", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: true
                                                })}
                                                {" - "}
                                                {getISTDateTime(b.functionDate, b.endTime).toLocaleTimeString("en-IN", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: true
                                                })}
                                            </div>

                                            <div style={{ display: "flex", justifyContent: "end" }}>
                                                <button
                                                    className={styles.viewBtn}
                                                    onClick={() => setSelectedBooking(b)}
                                                >
                                                    View Details
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className={styles.noBooking}><span style={{ color: "#216a00ff", fontWeight: "800" }}> Available</span></div>
                                )}

                            </div>
                        );
                    })}
                </div>

                {/* Popup Modal */}
                {selectedBooking && (
                    <div className={styles.popupOverlay} onClick={() => setSelectedBooking(null)}>
                        <div className={styles.popupBox} onClick={(e) => e.stopPropagation()}>
                            <button className={styles.closeBtn} onClick={() => setSelectedBooking(null)}>✖</button>
                            <p><b>Name:</b> {selectedBooking.name}</p>
                            {/* <p>
                                <b>Mobile:</b>{" "}
                                <a
                                    href={`tel:${selectedBooking.mobile}`}
                                    style={{ color: "#0b0b0bff", textDecoration: "none" }}
                                >
                                    {selectedBooking.mobile}
                                </a>
                            </p> */}
                            <p><b>Venue:</b> {selectedBooking.venueType}</p>
                            <p><b>Function:</b> {selectedBooking.functionType}</p>
                            <p>
                                <b>Time:</b>{" "}
                                {getISTDateTime(selectedBooking.functionDate, selectedBooking.startTime).toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: true
                                })}
                                {" - "}
                                {getISTDateTime(selectedBooking.functionDate, selectedBooking.endTime).toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: true
                                })}
                            </p>


                            {Object.entries(selectedBooking.selectedMenus || {}).map(
                                ([menuName, menuData], m) => (
                                    <p key={m}>
                                        <b>{menuName}:</b> {menuData.noOfPlates || "-"} Plates
                                    </p>
                                )
                            )}
                        </div>
                    </div>
                )}


            </div>
            <div style={{ marginBottom: "50px" }}></div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
        </div>
    );
};

export default AllBookingDatesList;
