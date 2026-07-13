import React, { useEffect, useState, useMemo, useRef } from 'react';
import { collection, onSnapshot, doc, getDoc, } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import './BookingLeadsTable.css';
import GSTTbody from './GSTTbody';
import { getAuth } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import BackButton from "../../components/BackButton";
import BottomNavigationBar from "../../components/BottomNavigationBar";

const getTodayIST = () => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);

    let y, m, d;
    parts.forEach(p => {
        if (p.type === "year") y = p.value;
        if (p.type === "month") m = p.value;
        if (p.type === "day") d = p.value;
    });

    return new Date(`${y}-${m}-${d}T00:00:00`);
};

const formatMoney = (value) => {
    const n = Number(value || 0);
    return n.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const getEventDateIST = (dateStr) => {
    if (!dateStr) return null;

    const [y, m, d] = dateStr.split("-").map(Number);

    return new Date(y, m - 1, d, 0, 0, 0, 0);
};

const BookingLeadsTable = () => {
    const navigate = useNavigate();
    const [leads, setLeads] = useState([]);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [searchTerm, setSearchTerm] = useState("");
    const [sortDirection, setSortDirection] = useState('asc');
    const [userPermissions, setUserPermissions] = useState({ editData: "disable", editablePrebookings: [], accessToApp: '', alwayEdit: '' });
    const [filteredLeads, setFilteredLeads] = useState(leads);
    const [availableFY, setAvailableFY] = useState([]);
    const [filterType, setFilterType] = useState("past");
    const [venueFilter, setVenueFilter] = useState("all");
    const [sortConfig, setSortConfig] = useState({ key: 'functionDate', direction: 'asc' });
    const [financialYear, setFinancialYear] = useState("");
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

    const matchDateFlexible = (dateStr, search) => {
        if (!dateStr || !search) return false;

        // Normalize search input
        const s = search.trim().toLowerCase().replace(/-/g, "/");

        // --- Convert Date to EXACT IST using Intl API ---
        const utc = new Date(dateStr);
        if (isNaN(utc)) return false;

        const parts = new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }).formatToParts(utc);

        let dd, mm, yyyy;

        parts.forEach(p => {
            if (p.type === "day") dd = p.value;
            if (p.type === "month") mm = p.value;
            if (p.type === "year") yyyy = p.value;
        });

        const yy = yyyy.slice(-2);

        const monthName = new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            month: "short"
        }).format(utc).toLowerCase();

        const monthFull = new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            month: "long"
        }).format(utc).toLowerCase();


        // All searchable IST formats
        const formats = [
            `${dd}/${mm}/${yyyy}`,
            `${dd}/${mm}/${yy}`,
            `${dd}/${mm}`,

            `${dd}/${monthName}/${yyyy}`,
            `${dd}/${monthName}/${yy}`,

            `${mm}/${yyyy}`,
            `${monthName} ${yyyy}`,
            `${monthFull} ${yyyy}`,

            `${yyyy}`,
            monthName,
            monthFull
        ];

        return formats.some(f => f.toLowerCase().includes(s));
    };

    const getCurrentFinancialYear = () => {
        const now = new Date();
        const istTime = new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
        }).formatToParts(now);

        let year = 0;
        let month = 0;

        for (const part of istTime) {
            if (part.type === "year") year = parseInt(part.value);
            if (part.type === "month") month = parseInt(part.value);
        }

        // Financial year starts in April (month 4)
        return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    };

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedLeads = useMemo(() => {
        const sorted = [...filteredLeads];
        if (sortConfig.key) {
            sorted.sort((a, b) => {
                const aVal = a[sortConfig.key] ? new Date(a[sortConfig.key]) : new Date(0);
                const bVal = b[sortConfig.key] ? new Date(b[sortConfig.key]) : new Date(0);

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sorted;
    }, [filteredLeads, sortConfig]);

    useEffect(() => {
        if (leads.length > 0) {
            const fyList = leads.map(l => {
                const d = new Date(l.functionDate);
                const y = d.getFullYear();
                const m = d.getMonth();

                return m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
            });

            const currentFY = getCurrentFinancialYear();
            const uniqueFY = [...new Set([...fyList, currentFY])].sort();

            setAvailableFY(uniqueFY);
        }
    }, [leads]);

    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;

        // Create a real-time listener
        const userRef = doc(db, "usersAccess", user.email);
        const unsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserPermissions({
                    editData: data.editData || "disable",
                    alwayEdit: data.alwayEdit || "",
                    editablePrebookings: data.editablePrebookings || [],
                    accessToApp: data.accessToApp || "",
                });
            }
        }, (err) => {
            console.error("Error fetching user permissions:", err);
        });

        // Cleanup listener on unmount
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (availableFY.length > 0 && financialYear === null) {
            setFinancialYear(getCurrentFinancialYear());
        }
    }, [availableFY, financialYear]);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "prebookings"), (querySnapshot) => {
            const allBookings = [];

            querySnapshot.docs.forEach((docSnap) => {
                const monthYear = docSnap.id;
                const bookingsMap = docSnap.data();

                Object.entries(bookingsMap || {}).forEach(([bookingId, bookingData]) => {
                    allBookings.push({
                        id: bookingId,
                        monthYear,
                        discount: 0,
                        ...bookingData,
                    });
                });
            });

            // ✅ Remove duplicates by unique id
            const uniqueBookings = Array.from(
                new Map(allBookings.map(item => [item.id, item])).values()
            );

            const today = getTodayIST();

            const upcoming = uniqueBookings.filter(
                lead => getEventDateIST(lead.functionDate) >= today
            );

            const past = uniqueBookings.filter(
                lead => getEventDateIST(lead.functionDate) < today
            );

            const sortedUpcoming = upcoming.sort((a, b) => {
                const dateA = new Date(a.functionDate);
                const dateB = new Date(b.functionDate);
                return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
            });

            const finalList = [...sortedUpcoming, ...past];

            setLeads(finalList);
            setFilteredLeads(finalList);
        }, (error) => {
            console.error("Error fetching leads:", error);
        });

        return () => unsubscribe();
    }, [sortDirection]);

    const calculateTotal = (list) => {
        return list.reduce((sum, lead) => {
            const grand = Number(lead.grandTotal) || 0;
            const disc = Number(lead.discount) || 0;
            return sum + Number(grand) + Number(disc);
        }, 0);
    };

    const baseFilteredForCounts = leads.filter((lead) => {
        // Search filter
        if (searchTerm && !Object.values(lead).some(v =>
            String(v).toLowerCase().includes(searchTerm.toLowerCase())
        )) return false;

        // FY filter
        if (financialYear) {
            const [startY, endY] = financialYear.split("-").map(Number);
            const fyStart = new Date(startY, 3, 1);
            const fyEnd = new Date(endY, 2, 31);
            const dt = new Date(lead.functionDate);
            if (dt < fyStart || dt > fyEnd) return false;
        }

        // Date range
        if (fromDate && new Date(lead.functionDate) < new Date(fromDate)) return false;
        if (toDate && new Date(lead.functionDate) > new Date(toDate)) return false;

        return true;
    });

    const today = getTodayIST();

    const upcomingLeads = baseFilteredForCounts.filter(
        lead => getEventDateIST(lead.functionDate) >= today
    );

    const pastLeads = baseFilteredForCounts.filter(
        lead => getEventDateIST(lead.functionDate) < today
    );

    const upcomingCount = upcomingLeads.length;
    const pastCount = pastLeads.length;
    const allCount = baseFilteredForCounts.length;

    const upcomingTotal = calculateTotal(upcomingLeads);
    const pastTotal = calculateTotal(pastLeads);
    const allTotal = calculateTotal(baseFilteredForCounts);

    const summaryBaseList = leads.filter((lead) => {

        // Search filter
        if (searchTerm && !Object.values(lead).some(v =>
            String(v).toLowerCase().includes(searchTerm.toLowerCase())
        )) return false;

        // FY filter
        if (financialYear) {
            const [startY, endY] = financialYear.split("-").map(Number);
            const fyStart = new Date(startY, 3, 1);
            const fyEnd = new Date(endY, 2, 31);
            const dt = new Date(lead.functionDate);
            if (dt < fyStart || dt > fyEnd) return false;
        }

        // Date range
        if (fromDate && new Date(lead.functionDate) < new Date(fromDate)) return false;
        if (toDate && new Date(lead.functionDate) > new Date(toDate)) return false;

        // Upcoming/Past
        if (filterType === "upcoming" &&
            getEventDateIST(lead.functionDate) < today
        ) return false;

        if (filterType === "past" &&
            getEventDateIST(lead.functionDate) >= today
        ) return false;

        return true;
    });

    const venueWiseSummary = {};

    const normalVenues = Object.keys(venueWiseSummary);

    const allEventsSet = new Set();
    const venueListToUse = venueFilter !== "all" ? [venueFilter] : normalVenues;

    venueListToUse.forEach((venue) => {
        Object.keys(venueWiseSummary[venue] || {}).forEach((ev) =>
            allEventsSet.add(ev)
        );
    });

    const sourceSummary = {};

    summaryBaseList.forEach((lead) => {
        const src = lead.source || "Unknown";
        const ref = lead.referredBy ? `, ${lead.referredBy}` : "";
        const key = `${src}${ref}`;
        sourceSummary[key] = (sourceSummary[key] || 0) + 1;
    });

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "usersAccess"), (querySnapshot) => {
            const mergedVenueColors = {};

            querySnapshot.forEach(docSnap => {
                const data = docSnap.data();
                const colors = data.venueTypeColors || {};
                Object.assign(mergedVenueColors, colors); // merge all users' colors
            });

            setUserPermissions(prev => ({
                ...prev,
                venueTypeColors: mergedVenueColors
            }));
        }, (err) => console.error("Error fetching usersAccess:", err));

        return () => unsubscribe();
    }, []);

    const rightRef = useRef(null);

    useEffect(() => {
        let filtered = [...leads];

        // ⭐ SUPER SEARCH FILTER
        if (searchTerm.trim() !== "") {
            const term = searchTerm.toLowerCase();

            filtered = filtered.filter(lead => {
                // 1. Check all fields (string/number)
                const plainMatch = Object.values(lead).some(val =>
                    String(val).toLowerCase().includes(term)
                );

                if (plainMatch) return true;

                // 2. Check date fields in all formats
                return (
                    matchDateFlexible(lead.functionDate, term) ||
                    matchDateFlexible(lead.enquiryDate, term)
                );
            });
        }

        // ⭐ FY Filter
        if (financialYear) {
            const [startY, endY] = financialYear.split("-").map(Number);
            const fyStart = new Date(startY, 3, 1);
            const fyEnd = new Date(endY, 2, 31);

            filtered = filtered.filter(lead => {
                const dt = new Date(lead.functionDate);
                return dt >= fyStart && dt <= fyEnd;
            });
        }

        // ⭐ Date range
        if (fromDate) {
            filtered = filtered.filter(
                lead => new Date(lead.functionDate) >= new Date(fromDate)
            );
        }
        if (toDate) {
            filtered = filtered.filter(
                lead => new Date(lead.functionDate) <= new Date(toDate)
            );
        }

        // ⭐ Upcoming / Past filter (THIS WAS MISSING)
        const today = getTodayIST();

        if (filterType === "upcoming") {
            filtered = filtered.filter(
                l => getEventDateIST(l.functionDate) >= today
            );
        }

        if (filterType === "past") {
            filtered = filtered.filter(
                l => getEventDateIST(l.functionDate) < today
            );
        }

        // ⭐ Bank Balance > 0 Filter (Hide rows with 0 bank balance)
        filtered = filtered.filter(lead => {
            const bankBalance = (lead.advancePayments || [])
                .filter(payment => payment.mode !== "Cash")
                .reduce((subSum, payment) => subSum + Number(payment.amount || 0), 0);
            return bankBalance > 0;
        });

        setFilteredLeads(filtered);

    }, [searchTerm, fromDate, toDate, financialYear, filterType, leads]);

    const gst18 = (amount) => {
        const n = Number(amount || 0);
        return n - (n / 1.18);
    };

    const bankSum = filteredLeads.reduce((sum, lead) => {
        const cashPayments = (lead.advancePayments || [])
            .filter(payment => payment.mode !== "Cash")
            .reduce((subSum, payment) => subSum + Number(payment.amount || 0), 0);
        return sum + cashPayments;
    }, 0);

    const gstBaseSum = bankSum;

    const gstAmountSum = gst18(bankSum);

    const paymentModes = Array.from(
        new Set(
            filteredLeads.flatMap(lead =>
                (lead.advancePayments || [])
                    .filter(p => p.mode !== "Cash")
                    .map(p => p.mode)
            )
        )
    );

    const modeTotals = {};

    paymentModes.forEach(mode => {
        modeTotals[mode] = filteredLeads.reduce((sum, lead) => {
            return sum + (lead.advancePayments || [])
                .filter(p => p.mode === mode)
                .reduce((s, p) => s + Number(p.amount || 0), 0);
        }, 0);
    });

    return (
        <div>
            <div><BackButton /></div>

            <div>
                <div className="leads-table-container" >

                    <div className="table-header-bar" style={{ paddingTop: '45px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1px' }}>
                        <div style={{ flex: 1, textAlign: 'center' }}> <h2 className="leads-header" style={{ margin: 0 }}>📊 GST Summary</h2> </div>
                    </div>

                    <div style={{ display: "none" }} onClick={setSortDirection}></div>

                    {/* Upcomings past filter */}
                    <div
                        style={{
                            display: "flex",
                            gap: "10px",
                            margin: "20px 0px",
                            overflowX: "auto",
                            // whiteSpace: "nowrap",
                            scrollbarWidth: "none",       // Firefox
                            msOverflowStyle: "none"        // IE/Edge
                        }}
                    >
                        {/* Hide scrollbar for Chrome */}
                        <style>
                            {`
        div::-webkit-scrollbar {
            display: none;
        }
        `}
                        </style>

                        <button
                            onClick={() => setFilterType("upcoming")}
                            style={{
                                backgroundColor: filterType === "upcoming" ? "#007BFF" : "#a8dbffff",
                                color: filterType === "upcoming" ? "#fff" : "#000",
                                borderRadius: "8px",
                                padding: "8px",
                                cursor: "pointer",
                                // whiteSpace: "nowrap"
                            }}
                        >
                            Upcoming ({upcomingCount})
                            ₹ {formatMoney(upcomingTotal)}
                        </button>

                        <button
                            onClick={() => setFilterType("past")}
                            style={{
                                backgroundColor: filterType === "past" ? "#007BFF" : "#a8dbffff",
                                color: filterType === "past" ? "#fff" : "#000",
                                borderRadius: "8px",
                                padding: "8px",
                                cursor: "pointer",
                                // whiteSpace: "nowrap"
                            }}
                        >
                            Past ({pastCount}) ₹ {formatMoney(pastTotal)}
                        </button>

                        <button
                            onClick={() => setFilterType("all")}
                            style={{
                                backgroundColor: filterType === "all" ? "#007BFF" : "#a8dbffff",
                                color: filterType === "all" ? "#fff" : "#000",
                                borderRadius: "8px",
                                padding: "8px",
                                cursor: "pointer",
                                // whiteSpace: "nowrap"
                            }}
                        >
                            All ({allCount}) ₹ {formatMoney(allTotal)}
                        </button>
                    </div>

                    {/* date filter */}
                    <div className="filters-container" style={{ margin: "20px 0px", }}>
                        <div className="date-filters">

                            <div className="filter-item">
                                <label>Date From:</label>
                                <input className="filterInput" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                            </div>

                            <div className="filter-item">
                                <label>Date To:</label>
                                <input className="filterInput" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                            </div>

                            <div className="filter-item">
                                <label>Financial Year:</label>
                                <select
                                    className="filterInput"
                                    value={financialYear}
                                    onChange={(e) => setFinancialYear(e.target.value)}
                                >
                                    <option value="">All</option>
                                    {availableFY.map(fy => (
                                        <option key={fy} value={fy}>{fy}</option>
                                    ))}
                                </select>
                            </div>

                            {/* clear btn */}
                            <button
                                className="clear-btnq"
                                onClick={() => {
                                    setFromDate('');
                                    setToDate('');
                                    setFinancialYear('');
                                    setSearchTerm('');
                                    setVenueFilter("all");
                                    setFilterType("past");
                                    setFilteredLeads(leads);
                                }}
                            >
                                Clear All
                            </button>
                        </div>
                    </div>

                    {/* table */}
                    <div className="table-fixed-wrapper" ref={rightRef}>
                        <table className="leads-table">

                            <thead>
                                <tr>
                                    {['Sl'].map(header => (<th className="sticky sticky-1" key={header}>{header}</th>))}

                                    <th onClick={() => requestSort('functionDate')} style={{ cursor: 'pointer', padding: "4px" }}>
                                        Event Date {sortConfig.key === 'functionDate' ? (sortConfig.direction === 'asc' ? "" : "") : ''}
                                    </th>

                                    {['Name'].map(header => (<th key={header}>{header}</th>))}

                                    <th onClick={() => requestSort('enquiryDate')} style={{ cursor: 'pointer' }}>
                                        Booked On {sortConfig.key === 'enquiryDate' ? (sortConfig.direction === 'asc' ? "▲" : "▼") : ''}
                                    </th>

                                    <th> <div>Applied GST</div> ₹ {formatMoney(gstBaseSum / 1.18)} </th>

                                    <th> <div>GST 18%</div>₹ {formatMoney(gstAmountSum)} </th>

                                    <th style={{ width: "fit-content" }}>
                                        <div>Bank Balance</div>
                                        <div>₹ {formatMoney(bankSum)}</div>
                                        <div style={{ fontSize: "12px", color: "#fff" }}>
                                            GST 18%: ₹ {formatMoney(gst18(bankSum))}
                                        </div>
                                    </th>

                                    {paymentModes.map(mode => (
                                        <th key={mode}>
                                            <div>{mode}</div>
                                            <div>₹ {formatMoney(modeTotals[mode] || 0)}</div>
                                            <div style={{ fontSize: "12px", color: "#fff" }}>
                                                GST 18%: ₹ {formatMoney(gst18(modeTotals[mode] || 0))}
                                            </div>
                                        </th>
                                    ))}

                                </tr>
                            </thead>

                            <GSTTbody
                                leads={sortedLeads}
                                userPermissions={userPermissions}
                                sortConfig={sortConfig}
                                paymentModes={paymentModes}
                            />
                        </table>

                        {/* Left Scroll Button */}
                        <button
                            onClick={() => rightRef.current?.scrollBy({ left: -300, behavior: "smooth" })}
                            style={{
                                position: "fixed",
                                left: "10px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                zIndex: 999,
                                background: "rgba(255, 255, 255, 0.33)",
                                border: "1px solid #c7c7c7",
                                borderRadius: "5px",
                                width: "50px",
                                height: "100px",
                                boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                                cursor: "pointer",
                                color: "black",
                            }}
                            className="scroll-btn"
                        >
                            ◀
                        </button>

                        {/* Right Scroll Button */}
                        <button
                            onClick={() => rightRef.current?.scrollBy({ left: 300, behavior: "smooth" })}
                            style={{
                                position: "fixed",
                                right: "10px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                zIndex: 999,
                                background: "rgba(255, 255, 255, 0.33)",
                                border: "1px solid #c7c7c7",
                                borderRadius: "5px",
                                width: "50px",
                                height: "100px",
                                boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                                cursor: "pointer",
                                color: "black",
                            }}
                            className="scroll-btn"
                        >
                            ▶
                        </button>

                    </div>

                    <div style={{ marginBottom: '50px' }}></div>
                </div >
            </div>

            <div style={{ marginBottom: "20px" }}></div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
        </div >
    );
};

export default BookingLeadsTable;   