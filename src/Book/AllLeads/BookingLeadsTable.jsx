import React, { useEffect, useState, useMemo, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteField, getDoc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import './BookingLeadsTable.css';
import Tbody from './Tbody';
import { getAuth } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import Pagination from '../../components/Pagination';

const BookingLeadsTable = () => {
    const navigate = useNavigate();
    const [leads, setLeads] = useState([]);
    const [editingField, setEditingField] = useState({});
    const [editing, setEditing] = useState({});
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortDirection, setSortDirection] = useState('asc');
    const [userPermissions, setUserPermissions] = useState({ editData: "disable", editablePrebookings: [], accessToApp: '', alwayEdit: '' });
    const [filteredLeads, setFilteredLeads] = useState(leads);
    const [availableFY, setAvailableFY] = useState([]);
    const [filterType, setFilterType] = useState("upcoming");
    const [venueFilter, setVenueFilter] = useState("all");
    const [sortConfig, setSortConfig] = useState({ key: 'functionDate', direction: 'asc' });
    const [financialYear, setFinancialYear] = useState("");
    const [expenseModalOpen, setExpenseModalOpen] = useState(false);
    const [selectedLeadId, setSelectedLeadId] = useState(null);
    const [eventExpenses, setEventExpenses] = useState([]);
    const [eventFilter, setEventFilter] = useState("all");
    const [sourceFilter, setSourceFilter] = useState("all");
    const [printMenuData, setPrintMenuData] = useState(null);
    const isMobile = window.innerWidth <= 2868;
    const [ShowVenueTypeTable, setShowVenueTypeTable] = useState(!isMobile);
    const [ShowSummaryTable, setShowSummaryTable] = useState(!isMobile);
    const [showSourceTable, setShowSourceTable] = useState(!isMobile);
    const [showDateFilter, setShowDateFilter] = useState(!isMobile);
    const [multipleBookingFilter, setMultipleBookingFilter] = useState(null);
    const isUpdatingRef = useRef(false);
    const [eventAutoToggle, setEventAutoToggle] = useState(false);
    const [decorAutoToggle, setDecorAutoToggle] = useState(false);
    const [viewSettings, setViewSettings] = useState({
        EventAutoViewNumber: false,
        DecorationAutoViewNumber: false
    });

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "viewSettings"), (docSnap) => {
            if (docSnap.exists()) {
                setViewSettings(docSnap.data());
            }
        });

        return () => unsub();
    }, []);

    const getISTDateOnly = (date = new Date()) => {
        const parts = new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(date);

        let y, m, d;
        parts.forEach(p => {
            if (p.type === "year") y = p.value;
            if (p.type === "month") m = p.value;
            if (p.type === "day") d = p.value;
        });

        // IST midnight date (00:00)
        return new Date(`${y}-${m}-${d}T00:00:00`);
    };

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
        // Get the current time in Asia/Kolkata timezone accurately
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

    const closeExpenseModal = () => {
        setSelectedLeadId(null);
        setExpenseModalOpen(false);
    };

    const fetchAdminEventExpenses = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "usersAccess"));
            let adminExpenses = [];
            querySnapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (data.accessToApp === "A" && Array.isArray(data.eventExpenses)) {
                    adminExpenses = data.eventExpenses;
                }
            });
            return adminExpenses;
        } catch (err) {
            console.error("Error fetching admin event expenses:", err);
            return [];
        }
    };

    const openExpenseModal = async (leadId) => {
        setSelectedLeadId(leadId);

        try {
            const lead = leads.find(l => l.id === leadId);
            if (!lead) return;

            const monthYear = lead.monthYear || formatMonthYear(lead.functionDate);
            const leadRef = doc(db, "prebookings", monthYear);
            const leadSnap = await getDoc(leadRef);

            let expensesToLoad = [];

            // ✅ Step 1: Check if prebookings already have eventExpenses
            if (leadSnap.exists()) {
                const data = leadSnap.data();
                const leadData = data[leadId];
                if (leadData && Array.isArray(leadData.eventExpenses) && leadData.eventExpenses.length > 0) {
                    expensesToLoad = leadData.eventExpenses;
                    console.log("Loaded eventExpenses from prebookings");
                }
            }

            // ✅ Step 2: If no eventExpenses found in prebookings → fetch from admin
            if (expensesToLoad.length === 0) {
                const adminExpenses = await fetchAdminEventExpenses();
                if (adminExpenses.length > 0) {
                    expensesToLoad = adminExpenses.map(exp => ({
                        item: exp.item || "",
                        rate: exp.rate || ""
                    }));
                    console.log("Loaded default eventExpenses from usersAccess");
                } else {
                    expensesToLoad = [{ item: "", rate: "" }];
                    console.log("No eventExpenses found in admin");
                }
            }

            setEventExpenses(expensesToLoad);
            setExpenseModalOpen(true);

        } catch (err) {
            console.error("Error opening expense modal:", err);
        }
    };

    const saveExpense = async () => {
        if (!selectedLeadId) return;
        try {
            const lead = leads.find(l => l.id === selectedLeadId);
            if (!lead) return;

            const monthYear = lead.monthYear || formatMonthYear(lead.functionDate);
            const leadRef = doc(db, "prebookings", monthYear);

            // ✅ Save the eventExpenses array back to Firestore
            await updateDoc(leadRef, {
                [`${selectedLeadId}.eventExpenses`]: eventExpenses
            });

            closeExpenseModal();
            console.log("Event expenses saved successfully!");
        } catch (err) {
            console.error("Error saving event expenses:", err);
        }
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

    const totalPages = Math.ceil(sortedLeads.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentItems = sortedLeads.slice(startIndex, startIndex + itemsPerPage);

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

    const moveLeadToDrop = (leadId, removeOriginal = false, reason = '', monthYear) => {
        try {
            const monthRef = doc(db, "prebookings", monthYear);

            // Listen to the month document in real-time
            const unsubscribe = onSnapshot(monthRef, async (monthSnap) => {
                if (!monthSnap.exists()) return;

                const monthData = monthSnap.data();
                const leadData = monthData[leadId];
                if (!leadData) return;

                // Determine monthYear for bookingLeads based on enquiryDate
                const enquiryDateObj = new Date(leadData.enquiryDate);
                const monthNames = [
                    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
                ];
                const pastMonthYear = `${monthNames[enquiryDateObj.getMonth()]}${enquiryDateObj.getFullYear()}`;
                const pastRef = doc(db, "cancelledBookings", pastMonthYear);

                // Move lead to cancelledBookings
                await setDoc(
                    pastRef,
                    {
                        [leadId]: {
                            ...leadData,
                            droppedAt: new Date(),
                            dropReason: reason || "No reason provided"
                        }
                    },
                    { merge: true }
                );

                // Optionally remove original lead
                if (removeOriginal) {
                    await updateDoc(monthRef, { [leadId]: deleteField() });
                }

                // Unsubscribe after operation to avoid repeated triggers
                unsubscribe();
            });

        } catch (error) {
            console.error("Error moving lead to pastEnquiry:", error);
        }
    };

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "prebookings"), (querySnapshot) => {

            if (isUpdatingRef.current) return;

            const allBookings = []; // ✅ always start clean on each snapshot

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

            const today = getISTDateOnly();

            const upcoming = uniqueBookings.filter(
                (lead) => new Date(lead.functionDate) >= today
            );
            const past = uniqueBookings.filter(
                (lead) => new Date(lead.functionDate) < today
            );

            const sortedUpcoming = upcoming.sort((a, b) => {
                const dateA = new Date(a.functionDate);
                const dateB = new Date(b.functionDate);
                return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
            });

            const finalList = [...sortedUpcoming, ...past];

            setLeads(prev => {
                const map = new Map(prev.map(item => [item.id, item]));

                finalList.forEach(item => {
                    const existing = map.get(item.id);

                    map.set(item.id, {
                        ...existing,   // keep UI state
                        ...item        // update firestore data
                    });
                });

                return Array.from(map.values());
            });

            setFilteredLeads(prev => {
                const map = new Map(prev.map(item => [item.id, item]));

                finalList.forEach(item => {
                    const existing = map.get(item.id);

                    map.set(item.id, {
                        ...existing,
                        ...item
                    });
                });

                return Array.from(map.values());
            });

        }, (error) => {
            console.error("Error fetching leads:", error);
        });

        return () => unsubscribe();
    }, [sortDirection]);

    const calculateTotal = (list) => {
        return list.reduce((sum, lead) => {
            const grand = Number(lead.grandTotal) || 0;
            const disc = Number(lead.discount) || 0;
            return sum + (grand + disc);
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

        // Venue
        if (venueFilter !== "all" && lead.venueType !== venueFilter) return false;

        // ⭐ Source Filter
        if (sourceFilter !== "all") {
            const src = lead.source || "Unknown";
            const ref = lead.referredBy ? `, ${lead.referredBy}` : "";
            const combined = `${src}${ref}`.trim();
            if (combined !== sourceFilter) return false;
        }

        // Event
        if (eventFilter !== "all") {
            const events = Array.isArray(lead.functionType) ? lead.functionType : [lead.functionType];
            if (!events.includes(eventFilter)) return false;
        }

        // Date range
        if (fromDate && new Date(lead.functionDate) < new Date(fromDate)) return false;
        if (toDate && new Date(lead.functionDate) > new Date(toDate)) return false;

        return true;
    });

    const today = getISTDateOnly();

    const upcomingLeads = baseFilteredForCounts.filter(
        l => new Date(l.functionDate) >= today
    );

    const pastLeads = baseFilteredForCounts.filter(
        l => new Date(l.functionDate) < today
    );

    const upcomingCount = upcomingLeads.length;
    const pastCount = pastLeads.length;
    const allCount = baseFilteredForCounts.length;

    const upcomingTotal = calculateTotal(upcomingLeads);
    const pastTotal = calculateTotal(pastLeads);
    const allTotal = calculateTotal(baseFilteredForCounts);

    const formatMoney = (value) => {
        const n = Number(value || 0);
        return n.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const updateLead = async (leadId, updates, oldMonthYear) => {
        try {
            let newMonthYear = oldMonthYear;

            if (updates.enquiryDate) {
                const newDate = new Date(updates.enquiryDate);
                const month = newDate.toLocaleString("default", { month: "short" });
                const year = newDate.getFullYear();
                newMonthYear = `${month}${year}`;
            }

            // If monthYear changes
            if (newMonthYear !== oldMonthYear) {
                // Delete from old doc
                const oldRef = doc(db, "prebookings", oldMonthYear);
                try {
                    await updateDoc(oldRef, { [leadId]: deleteField() });
                } catch (e) {
                    console.warn("Failed to delete from old month doc", e);
                }

                // Add to new doc
                const newRef = doc(db, "prebookings", newMonthYear);
                await setDoc(newRef, {
                    [leadId]: {
                        ...updates,
                        updatedAt: new Date(),
                    },
                }, { merge: true });

            } else {
                // Same monthYear → use updateDoc for nested fields
                const ref = doc(db, "prebookings", oldMonthYear);

                await updateDoc(ref, {
                    [`${leadId}.updatedAt`]: new Date(),
                    ...Object.fromEntries(
                        Object.entries(updates).map(([key, val]) => [`${leadId}.${key}`, val])
                    )
                });
            }

            console.log("Lead updated successfully");
        } catch (error) {
            console.error("Error updating lead:", error);
        }
    };

    const handleNoteChange = (leadId, note) => {
        const leadToUpdate = leads.find(l => l.id === leadId);
        updateLead(leadId, { 'meals.note': note }, leadToUpdate?.monthYear);
    };

    const handleFieldChange = async (id, field, value) => {
        const leadToUpdate = leads.find(l => l.id === id);
        const oldMonthYear = leadToUpdate?.monthYear;
        // Optimistically update local state
        setLeads(prev => prev.map(lead =>
            lead.id === id ? { ...lead, [field]: value } : lead
        ));
        setFilteredLeads(prev => prev.map(lead =>
            lead.id === id ? { ...lead, [field]: value } : lead
        ));

        setEditingField(prev => ({
            ...prev,
            [id]: { ...prev[id], [field]: false }
        }));

        try {
            await updateLead(id, { [field]: value }, oldMonthYear);
        } catch (err) {
            console.error("Firestore update failed:", err);
            // Rollback if needed
            setLeads(prev => prev.map(lead =>
                lead.id === id ? { ...lead, [field]: lead[field] } : lead
            ));
            setFilteredLeads(prev => prev.map(lead =>
                lead.id === id ? { ...lead, [field]: lead[field] } : lead
            ));
        }
    };

    const handleDateChange = (id, index, date) => {
        const lead = leads.find(l => l.id === id);
        const updatedDates = [...(lead.followUpDates || [])];
        updatedDates[index] = date;
        updateLead(id, { followUpDates: updatedDates }, lead?.monthYear);
        setEditing(prev => ({ ...prev, [id]: { ...prev[id], [index]: false } }));
    };

    const startEdit = (leadId, field) => {
        setEditingField(prev => {
            if (!leadId || !field) return {}; // exit edit mode
            return {
                ...prev,
                [leadId]: { ...(prev[leadId] || {}), [field]: true }
            };
        });
    };

    const handleEdit = (id, index) => setEditing(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [index]: true } }));
    const isEditing = (id, field) => editingField[id]?.[field];

    // /* ----------------- Print Section Starts ----------------- */

    const formatTime12Hour = (timeStr) => {
        if (!timeStr) return "";

        let [h, m] = timeStr.split(":").map(Number);

        // ✅ 00:00 → 12:00 AM
        if (h === 0 && m === 0) {
            return "12:00 AM";
        }

        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;

        return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
    };

    const fmt = (v) =>
        Number(v || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    const sendToPrint = async (lead) => {

        let termsList = [];

        try {
            const q = query(
                collection(db, "usersAccess"),
                where("accessToApp", "==", "A")
            );

            const querySnap = await getDocs(q);

            querySnap.forEach(docSnap => {
                const data = docSnap.data();
                if (typeof data.termsAndConditions === "string") {
                    const arr = data.termsAndConditions
                        .split(/\s*\d+\.\s*/)
                        .filter(t => t.trim() !== "");
                    termsList.push(...arr);  // merge all admins T&C
                }
            });

        } catch (err) {
            console.error("Error fetching admin terms:", err);
        }


        const termsHTML = termsList.length
            ? termsList.map((t, i) => `<tr><td>${i + 1}</td><td>${t}</td></tr>`).join("")
            : `<tr><td colspan="2">No Terms & Conditions found</td></tr>`;


        // 🔹 helpers first
        const capitalizeWords = (str = "") =>
            str.replace(/\b\w/g, c => c.toUpperCase());

        // 🔹 selectedMenus FIRST
        const selectedMenus =
            lead.selectedMenus && typeof lead.selectedMenus === "object"
                ? lead.selectedMenus
                : {};

        // 🔹 menuName AFTER selectedMenus
        const menuKeys = Object.keys(selectedMenus);
        const menuName = menuKeys.length > 0 ? menuKeys[0] : null;

        // 🔹 SAFE menu values
        const menuDisplay = menuName ? capitalizeWords(menuName) : "N/A";

        const menuRate =
            menuName && selectedMenus[menuName]
                ? Number(selectedMenus[menuName].rate || 0)
                : 0;

        const totalPlates =
            Number(lead.noOfPlates || 0) + Number(lead.extraPlates || 0);

        const foodTotal = menuRate * totalPlates;

        const fmtDate = (d) => {
            if (!d) return 'N/A';
            const date = d?.toDate ? d.toDate() : new Date(d); // Firestore Timestamp or Date/String

            // Convert UTC to IST (+5:30)
            const utc = date.getTime();
            const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 mins in ms
            const istDate = new Date(utc + istOffset);

            const dd = String(istDate.getUTCDate()).padStart(2, '0');
            const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
            const yyyy = istDate.getUTCFullYear();

            return `${dd}-${mm}-${yyyy}`;
        };

        // format date function (dd-mm-yyyy hh:mm:ss, UTC)
        const fmtDateTimeIST = (d) => {
            if (!d) return 'N/A';
            const date = d?.toDate ? d.toDate() : new Date(d); // Firestore Timestamp or Date/String

            // Convert UTC time to IST (UTC + 5:30)
            const utc = date.getTime();
            const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in ms
            const istDate = new Date(utc + istOffset);

            const dd = String(istDate.getUTCDate()).padStart(2, '0');
            const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
            const yyyy = istDate.getUTCFullYear();

            let hh = istDate.getUTCHours();
            const min = String(istDate.getUTCMinutes()).padStart(2, '0');
            const ampm = hh >= 12 ? 'PM' : 'AM';
            hh = hh % 12 || 12; // convert 0 -> 12
            hh = String(hh).padStart(2, '0');

            return `${dd}-${mm}-${yyyy}, ${hh}:${min} ${ampm}`;
        };

        // aaj ka date+time (IST)
        const today = fmtDateTimeIST(new Date());

        // pehle sum nikal lo
        const totalAdvance = (lead.advancePayments || []).reduce(
            (sum, payment) => sum + (payment.amount || 0),
            0
        );

        const bookingDate = fmtDate(lead.enquiryDate);
        const funcDate = fmtDate(lead.functionDate);
        // const menuName = Object.keys(lead.selectedMenus || {})[0] || 'N/A';

        const amenitiesList = (lead.bookingAmenities || []).map((item, i) => `
        <tr>
            <td></td>
            <td>(${String.fromCharCode(97 + i)}) ${item}</td>
            <td colspan="3">Yes</td>
        </tr>`).join('');

        const customItems = (lead.customItems || []).map((item, i) => `
        <tr>
            <td></td>
            <td>(${String.fromCharCode(97 + i)}) ${item.name}</td>
            <td>${item.qty}</td>
            <td>${fmt(item.rate)}</td>
            <td>₹${fmt(item.total)}</td>
        </tr>`).join('');

        const customMenuCharges = (lead.customMenuCharges || []).map((item, i) => `
        <tr>
            <td></td>
            <td>(${String.fromCharCode(97 + i)}) ${item.name}</td>
            <td>${item.qty}</td>
            <td>${fmt(item.rate)}</td>
            <td>₹${fmt(item.total)}</td>
        </tr>`).join('');



        const advanceHTML =
            totalAdvance > 0
                ? `
                      <tr>
                        <td></td>
                        <td class="right-text">Total Paid till ${today}</td>
                        <td colspan="3">
                          <strong>₹${fmt(totalAdvance)}</strong>
                        </td>
                      </tr>
                
                      <tr>
                        <td colspan="2" class="highlight right-text">Balance Amount</td>
                        <td class="highlight" colspan="3">
                          <strong class="highlight">
                            ₹${fmt((lead.grandTotal || 0) - totalAdvance)}
                          </strong>
                        </td>
                      </tr>
                `
                : "";

        const hasCustomItems = (lead.customItems || []).length > 0;
        const hasCustomMenuCharges = (lead.customMenuCharges || []).length > 0;
        const foodMenuSlNo = hasCustomItems ? 3 : 2;

        const printHTML = `
<html>
<head>
    <title>Event Booking Estimate</title>
     <style>
        body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 11px;
            padding: 20px;
            padding-Top: 10px;
            color: #e10000;
        }

        h2 {
            text-align: center;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            border: 1px solid #e10000;
            padding: 1px 8px;
            vertical-align: top;
            font-size: 12px;
        }

        th {
            background-color: #eef6ff;
            font-weight: bold;
            text-align: left;
        }

        .highlight {
            background-color: #ffff54;
            font-weight: bold;
        }

        .section-header {
            background-color: #eef6ff;
            font-weight: bold;
            text-align: center;
            padding: 3px;
            border: 1px solid #e10000;
            font-size:14px
        }

        .terms {
            font-size: 1px;
            color: red;
        }

        .terms li {
            padding: 1px 0;
        }

        .center {
            text-align: center;
            font-weight: bold;
        }

        .right-text {
          text-align: right;
        }

        .center-text {
          text-align: center;
        }

    </style>
</head>
<body>
    <div class="section-header" style="position: relative; text-align: center;">
    <span style="position: absolute; left: 10px;">Booked on: ${bookingDate}</span>
        Event Booking Estimate
        <span style="position: absolute; right: 10px;">Date of Event: ${funcDate}</span>
    </div>

    <table style="font-weight: bold">
        <tr><th>Sl</th><th>Description</th><th colspan="3">Customer Details</th></tr>
        <tr><td>1</td><td>Customer Name</td><td colspan="3">${lead.prefix || ''} ${lead.name || ' '}</td></tr>
        <tr><td>2</td><td>Contact No.</td><td colspan="3">${lead.mobile1}${lead.mobile2 ? ', ' + lead.mobile2 : ''}</td></tr>
        <tr><td>3</td><td>Mail ID</td><td colspan="3">${lead.email || ''}</td></tr>
        <tr><td>4</td><td>Type of Event</td><td class="highlight" colspan="3">${lead.functionType || ''}</td></tr>
        <tr><td>5</td><td>Type of Venue</td><td class="highlight" colspan="3">${lead.venueType}</td></tr>
        <tr><td>6</td><td>Date of Event</td><td colspan="3">${funcDate}</td></tr>

        <tr>
          <td>7</td>
          <td>Total No. of Guests</td>
          <td colspan="3">
            ${lead.noOfPlates || ''}
            ${lead.extraPlates > 0 ? ` + ${lead.extraPlates} Extra` : ''}
          </td>
        </tr>

        <tr><td>8</td><td>Additional Rooms @ Rs.4000/- + GST</td><td colspan="3">As per custom items</td></tr>
        <tr><td>9</td><td>Food Type</td><td colspan="3">${menuDisplay}</td></tr>
        
        <tr class="highlight"><td>10</td>
            <td>
                    Start Time: ${formatTime12Hour(lead.startTime)}
            </td>
            <td colspan="3">
                    Finish Time: ${formatTime12Hour(lead.finishTime)}
            </td>
        </tr>

        <tr><th colspan="5" class="section-header">Total Package Cost</th></tr>
        <tr class="highlight"><td>1</td><td>${lead.venueType} Booking Charge (Complimentary Details as below)</td><td colspan="3">₹ ${fmt(lead.hallCharges)}</td></tr>
        ${amenitiesList || '<tr><td colspan="5">No complimentary amenities listed</td></tr>'}

       ${customItems
                ? `
        <tr>
          <td class="highlight">2</td>
          <td class="highlight">Facilities as Chargeable</td>
          <td class="highlight">Qty</td>
          <td class="highlight">Rate</td>
          <td class="highlight">Total</td>
        </tr>
        ${customItems}
        `
                : ''
            }

 


           ${hasCustomMenuCharges
                ? `
<tr>
  <td class="highlight"></td>
  <td class="highlight">Menu Additional Charges</td>
  <td class="highlight">Qty</td>
  <td class="highlight">Rate</td>
  <td class="highlight">Total</td>
</tr>
${customMenuCharges}
`
                : ''
            }

            

<tr>
  <td class="highlight">${foodMenuSlNo}</td>
  <td class="highlight">Food Menu (₹${fmt(menuRate)} x (${lead.noOfPlates || 0} + ${lead.extraPlates || 0} Extra))
  
</strong>
 </td>
  
  
        <td colSpan="3">₹${fmt(foodTotal)}</td>
</tr>



      ${lead.meals
                ? Object.entries(lead.meals)
                    .sort(([, a], [, b]) => new Date(a.date || 0) - new Date(b.date || 0))
                    .map(([dayName, dayData]) => {

                        const dayDate = dayData.date || null; // ✅ FIX

                        const mealOrder = ["Breakfast", "Lunch", "Dinner"];

                        return Object.entries(dayData)
                            .filter(([mealName, mealInfo]) => mealName !== "date" && mealInfo && mealInfo.total)
                            .sort(([a], [b]) => mealOrder.indexOf(a) - mealOrder.indexOf(b))
                            .map(([mealName, mealInfo]) => {

                                const formatTime = (timeStr) => {
                                    if (!timeStr) return "";
                                    let [h, m] = timeStr.split(":").map(Number);
                                    const ampm = h >= 12 ? "PM" : "AM";
                                    h = h % 12 || 12;
                                    return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
                                };

                                const fmtDate = (d) => {
                                    if (!d) return "N/A";

                                    // If already YYYY-MM-DD
                                    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
                                        const [yyyy, mm, dd] = d.split("-");
                                        return `${dd}-${mm}-${yyyy}`; // ✅ DD-MM-YYYY
                                    }

                                    // Fallback (Date / Timestamp)
                                    const date = d?.toDate ? d.toDate() : new Date(d);
                                    if (isNaN(date)) return "N/A";

                                    const dd = String(date.getDate()).padStart(2, "0");
                                    const mm = String(date.getMonth() + 1).padStart(2, "0");
                                    const yyyy = date.getFullYear();

                                    return `${dd}-${mm}-${yyyy}`;
                                };

                                return `
              <tr>
                <td></td>
                <td colspan="1">
                  ${mealName} -
                  ${dayDate ? `<span class="highlight">${fmtDate(dayDate)}</span>,` : ""}
                  ${formatTime(mealInfo.startTime)} to ${formatTime(mealInfo.endTime)}
                </td>
                <td colspan="4">
                  (${mealInfo.option}) -
                  Pax: <span class="highlight">${mealInfo.pax}</span>,
                  Rate: ₹<span class="highlight">${fmt(mealInfo.rate)}</span>
                </td>
              </tr>
            `;
                            })
                            .join("");
                    })
                    .join("")
                : ""}


        
        ${lead.meals?.Lunch ? `
          <tr><td></td>
            <td><strong>Lunch:</strong>
              <td colspan="3">
                Start Time: <span class="highlight">${lead.meals.Lunch.startTime}</span>,
                Finish Time: <span class="highlight">${lead.meals.Lunch.endTime}</span>,
                Pax: <span class="highlight">${lead.meals.Lunch.pax}</span>,
                Rate: ₹<span class="highlight">${lead.meals.Lunch.rate}</span>,
                Total: ₹<span class="highlight">
                  ${fmt(lead.meals.Lunch.pax * lead.meals.Lunch.rate)}
                </span>
              </td>
            </td>
          </tr>` : ''}
        
        ${lead.meals?.Dinner ? `
          <tr><td></td>
            <td><strong>Dinner:</strong>
              <td colspan="3">
                Start Time: <span class="highlight">${lead.meals.Dinner.startTime}</span>,
                Finish Time: <span class="highlight">${lead.meals.Dinner.endTime}</span>,
                Pax: <span class="highlight">${lead.meals.Dinner.pax}</span>,
                Rate: ₹<span class="highlight">${lead.meals.Dinner.rate}</span>,
                Total: ₹<span class="highlight">
                  ${lead.meals.Dinner.pax * lead.meals.Dinner.rate}
                </span>
              </td>
            </td>
          </tr>` : ''}
        

        ${Number(lead.discount) > 0 ? `
            <tr>
              <td></td>
              <th class="highlight">Discount:</th>
              <th class="highlight" colspan="3">₹ ${fmt(lead.discount)}</th>
            </tr>` : ''}
            
            ${lead.note ? `
            <tr>
            <td></td>
            <td colspan="5"><strong>Notes:</strong> ${lead.note}</td>
            </tr>
            ` : ''}
            
  ${lead.gstAmount ? `
  <tr>
    <td></td>
    <th className="highlight right-text">
      GST: @18% On ₹ ${fmt(lead.gstBase)}
    </th>
    <th className="highlight" colSpan="3">
      ₹ ${fmt(lead.gstAmount)}
    </th>
  </tr>
` : ''}
 

        <tr> <td class="highlight"></td> <td class="highlight" style="text-align:right">Total Estimate</td><td class="highlight" colspan="3"><strong>₹${fmt(lead.grandTotal)}</strong></td></tr>

        ${advanceHTML}

    </table>

    <div class="section-header">Terms & Conditions</div>
    <table border="1" cellspacing="0" cellpadding="6">
      ${termsHTML}
    </table>

    <!-- Signature Section -->
    <table style="width:100%; margin-top: 20px; border: none;">
            <tr>
              <td style="width:50%; text-align:center; border:none; vertical-align:bottom;">
                _________________________<br>
                Guest's Signature
              </td>
              <td style="width:50%; text-align:center; border:none; vertical-align:bottom;">
               ${lead?.eventBookedByl || "Sales Team"}<br>
              _________________________<br>
                Authorized Signatory<br>
              </td>
            </tr>
    </table>
    
    </body>
    </html>`;

        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        document.body.appendChild(iframe);

        iframe.contentDocument.open();
        iframe.contentDocument.write(printHTML);
        iframe.contentDocument.close();

        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    };

    const getCateringAmount = async (lead) => {
        try {
            // Step 1: Get all docs under "catering"
            const cateringColRef = collection(db, "catering");
            const cateringSnap = await getDocs(cateringColRef);

            if (cateringSnap.empty) {
                console.log("⚠️ No documents inside 'catering' collection");
                return [];
            }

            // Step 2: Use the first document (whatever its name is)
            const firstDoc = cateringSnap.docs[0];
            const cateringMap = firstDoc.data();

            // Step 3: Access your lead ID key
            const cateringData = cateringMap[lead.id];

            if (!cateringData) {
                console.log("⚠️ No catering data found for lead:", lead.id);
                return [];
            }

            console.log("✅ Catering fetched for lead:", lead.id, cateringData);
            return [cateringData];
        } catch (error) {
            console.error("❌ Error fetching catering:", error);
            return [];
        }
    };

    const getVendorRoyalties = async (lead) => {
        try {
            const collections = ["vendor", "decoration"];
            const royalties = [];

            for (const col of collections) {
                const colRef = collection(db, col);
                const snap = await getDocs(colRef);

                if (snap.empty) continue;

                const firstDoc = snap.docs[0];
                const dataMap = firstDoc.data();
                const leadData = dataMap[lead.id];

                if (!leadData) continue;

                // Sum royaltyAmount from all services
                const totalRoyalty = (leadData.services || []).reduce(
                    (sum, srv) => sum + (Number(srv.royaltyAmount) || 0),
                    0
                );

                if (totalRoyalty > 0) {
                    royalties.push({
                        from: col === "vendor" ? "Vendor" : "Decoration",
                        totalRoyalty,
                    });
                }
            }

            console.log("✅ Grouped royalties:", royalties);
            return royalties;
        } catch (error) {
            console.error("❌ Error fetching royalties:", error);
            return [];
        }
    };

    const sendToPrintPayment = async (lead) => {

        const fmtDateIST = (dateString) => {
            if (!dateString) return 'N/A';
            try {
                const date = new Date(dateString);
                return date.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    timeZone: 'Asia/Kolkata'
                });
            } catch {
                return 'N/A';
            }
        };

        // --- Payment Rows from advancePayments ---
        const paymentRows = (lead.advancePayments || []).map((p, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${fmtDateIST(p.addedAt || p.receiptDate)}</td>
            <td>${p.slNo || ''}</td>
            <td>${p.mode || ''}</td>
            <td style="text-align: right;">₹${fmt(p.amount)}</td>
            <td>${p.description || ''}</td>
        </tr>
        `).join('');

        const totalReceived = (lead.advancePayments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        // --- Define key monetary values early ---
        const hallCharges = Number(lead.hallCharges || 0);
        const gst = Number(lead.gstAmount || 0);
        const grandTotal = Number(lead.grandTotal || 0);
        const discount = Number(lead.discount || 0);

        // --- FETCH CATERING DATA ---
        const caterings = await getCateringAmount(lead);
        let cateringExpenseRows = [];

        if (caterings && caterings.length > 0) {
            cateringExpenseRows = caterings.map((c) => {
                const assignedMenus = c.assignedMenus || {};
                let grandTotalc = 0;
                for (const [, menu] of Object.entries(assignedMenus)) {
                    const qty = Number(menu.qty || 0);
                    const extQty = Number(menu.extQty || 0);
                    const rate = Number(menu.rate || 0);
                    const total = (qty + extQty) * rate;
                    grandTotalc += total;
                }
                return {
                    item: c.CateringAssignName || "Unnamed Catering",
                    rate: grandTotalc || 0
                };
            });
        }

        // --- FETCH EVENT EXPENSES ---
        let eventExpenses = [];

        try {
            const monthYear = lead.monthYear || (() => {
                const d = new Date(lead.functionDate);
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                return `${monthNames[d.getMonth()]}${d.getFullYear()}`;
            })();

            const prebookingRef = doc(db, "prebookings", monthYear);
            const prebookingSnap = await getDoc(prebookingRef);

            if (prebookingSnap.exists()) {
                const monthData = prebookingSnap.data();
                const leadData = monthData[lead.id];
                if (leadData && Array.isArray(leadData.eventExpenses) && leadData.eventExpenses.length > 0) {
                    eventExpenses = leadData.eventExpenses;
                    console.log("✅ Using eventExpenses from prebookings:", monthYear);
                }
            }

            if (eventExpenses.length === 0) {
                const accessQuery = query(collection(db, "usersAccess"), where("accessToApp", "==", "A"));
                const accessSnap = await getDocs(accessQuery);
                if (!accessSnap.empty) {
                    const firstAdmin = accessSnap.docs[0].data();
                    if (Array.isArray(firstAdmin.eventExpenses)) {
                        eventExpenses = firstAdmin.eventExpenses;
                        console.log("✅ Using eventExpenses from usersAccess");
                    }
                }
            }
        } catch (err) {
            console.error("Error fetching eventExpenses:", err);
        }

        // --- MERGE EXPENSES + CATERING + GST ---
        const gstExpenseRow = gst > 0 ? [{ item: "GST", rate: gst }] : [];
        const allExpenses = [...eventExpenses, ...cateringExpenseRows, ...gstExpenseRow];

        const vendorRows = (allExpenses || []).map(
            (exp, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${exp.item || ""}</td>
                <td style="text-align: right;">₹${fmt(exp.rate)}</td>
            </tr>
        `
        ).join("");

        // --- FETCH VENDOR ROYALTIES ---
        const royalties = await getVendorRoyalties(lead);

        // Make sure no undefined numbers break printing
        const royaltyRows = (royalties || [])
            .map((r, i) => {
                const amount = Number(r.totalRoyalty || 0);
                return `
            <tr>
                <td>${i + 1}</td>
                <td>${r.from}</td>
                <td style="text-align:right;">₹${Number(amount || 0).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}</td>
            </tr>
            `;
            })
            .join("");

        const totalRoyalty = (royalties || []).reduce(
            (sum, r) => sum + (Number(r.totalRoyalty) || 0),
            0
        );

        // --- Calculate Meal Totals ---
        const getMealTotal = (mealType) => {
            let total = 0;
            const dayMeals = lead.meals || {};
            for (const dayKey of Object.keys(dayMeals)) {
                const meal = dayMeals[dayKey][mealType];
                if (meal && meal.total) total += Number(meal.total);
            }
            return total;
        };

        const breakfastLunch = getMealTotal("Breakfast") + getMealTotal("Lunch");
        const panCounter = Number(lead.panCounter || 0);

        // --- Dinner Calculation ---
        const selectedMenus = lead.selectedMenus || {};
        let noOfPlates = 0, extraPlates = 0, dinnerRate = 0, dinnerTotal = 0;
        const firstMenuKey = Object.keys(selectedMenus)[0];
        if (firstMenuKey) {
            const dinnerMenu = selectedMenus[firstMenuKey];
            noOfPlates = Number(dinnerMenu.noOfPlates || 0);
            extraPlates = Number(dinnerMenu.extraPlates || 0);
            dinnerRate = Number(dinnerMenu.rate || 0);
            dinnerTotal = (noOfPlates + extraPlates) * dinnerRate;
        }

        // --- Custom Items ---
        const selectedCustomItems = (lead.customItems || []).filter(item => item.selected && Number(item.total) > 0);
        const customItemsRows = selectedCustomItems.map(item => {
            let shortName = /jaimala/i.test(item.name || "") ? "Jaimala" : (item.name || "");
            return `
            <tr>
                <td>${shortName}</td>
                <td>${item.qty || ""}</td>
                <td>${fmt(item.rate)}</td>
                <td>${fmt(item.total)}</td>
            </tr>
        `;
        }).join("");

        // --- Payment Calculation Rows ---
        let paymentCalculationRows = "";
        const addRow = (label, value, qty = "", rate = "") => {
            if (Number(value) > 0) {
                paymentCalculationRows += `
                <tr>
                    <td>${label}</td>
                    <td>${qty}</td>
                    <td>${rate}</td>
                    <td style="text-align: right;">₹${fmt(value)}</td>
                </tr>
            `;
            }
        };

        addRow("Hall Charges & Others", hallCharges);
        addRow("GST", gst);
        addRow("Breakfast & Lunch", breakfastLunch);
        addRow("Pan Counter", panCounter);
        if (dinnerTotal > 0)
            addRow(
                "Dinner",
                dinnerTotal,
                `${noOfPlates} + ${extraPlates}`,
                fmt(dinnerRate)
            );

        paymentCalculationRows += customItemsRows;

        // --- Totals ---
        const outstandingAmount = grandTotal - totalReceived;
        const netExp = (allExpenses || []).reduce((sum, exp) => sum + (Number(exp.rate) || 0), 0);
        const totalBusiness = grandTotal - netExp + totalRoyalty;

        // --- HTML ---
        const printHTML = `
            <html>
            <head>
                <title>Total Payment Settlement - ${lead.eventDate}</title>
                <style>
                    body { font-family: Calibri, Arial, sans-serif; font-size: 15px; padding: 7px; margin: 0; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
                    th, td { border: 1px solid #000; padding: 3px 6px; text-align: left; vertical-align: top; font-size: 14px }
                    th { background-color: #f4f4f4; text-align: center; }
                    .section { background-color: #ffec8b; font-weight: bold; padding: 5px; }
                    .highlight-red { background-color: #ff5050; color: white; font-weight: bold; text-align: center; }
                    .highlight-green { background-color: #ccffcc; font-weight: bold; text-align: center; }
                    @media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                </style>
            </head>
            <body>
        
                <table>
                    <tr><td colspan="2" class="section" style="text-align:center;">Total Payment Settlement</td></tr>
                    <tr><td>Customer Name</td><td> ${lead.prefix || ''} ${lead.name || ''}</td></tr>
                    <tr><td>Contact No.</td><td>${lead.mobile1 || ''}</td></tr>
                    <tr><td>Event Type</td><td>${lead.functionType || ''}</td></tr>
                    <tr><td>Event Date</td><td>${fmtDateIST(lead.functionDate)}</td></tr>
                    <tr><td>Food Menu</td><td>${Object.keys(lead.selectedMenus || {}).join(', ')}</td></tr>
                </table>
        
                <table>
                    <tr><td colspan="7" class="section" style="text-align:center;">Payment Details</td></tr>
                    <tr><th>Sl</th><th>Payment Date</th><th>Receipt No.</th><th>Payment Mode</th><th>Amount</th><th>Remark</th></tr>
                    ${paymentRows}
                </table>
        
                <table style="float:left; width:100%;">
                    <tr><td colspan="4" class="section" style="text-align:center;">Payment Calculation</td></tr>
                    <tr><th>Particulars</th><th>Qty</th><th>Rate</th><th>Total</th></tr>${paymentCalculationRows}
                    <tr><td colspan="3" class="section">Total</td><td class="section" style="text-align:right;">${fmt(grandTotal + discount)}</td></tr>
                    <tr><td colspan="3">Discount</td><td style="text-align:right;">₹${fmt(discount)}</td></tr>
                    <tr><td colspan="3" class="section">Grand Total</td><td class="section" style="text-align:right;">${fmt(grandTotal)}</td></tr>
                    <tr><td colspan="3">Received Amount</td><td style="text-align:right;">${fmt(totalReceived)}</td></tr>
                    <tr class="highlight-red"><td colspan="3">Outstanding Amount</td><td style="text-align:right;">₹${fmt(outstandingAmount)}</td></tr>
                </table>

                <table style="width:49.5%; float:left;">
                    <tr><td colspan="3" class="section" style="text-align:center;">List of Expenses</td></tr>
                    <tr><th>Sl</th><th>Particulars </th><th>Amount</th></tr>
                    ${vendorRows}
                    <tr><td colspan="2" class="section">Net Expense</td><td class="section" style="text-align:right;">${fmt(netExp)}</td></tr>
                </table>

                <table style="width:49.5%; float:right;">
                    <tr><td colspan="3" class="section" style="text-align:center;">List of Royalties</td></tr>
                    <tr><th>Sl</th><th>From</th><th>Amount</th></tr>
                    ${royaltyRows || '<tr><td colspan="3" style="text-align:center;">No Royalties Found</td></tr>'}
                    <tr>
                        <td colspan="2" class="section">Total Royalty</td>
                        <td class="section" style="text-align:right;">${fmt(totalRoyalty)}</td>
                    </tr>
                </table>
                
                <div style="clear:both; margin-top:15px; text-align:right;">
                    <b>Total Business from event ( Grand Total + Total Royalty - Net Expense ) :</b> <b style="color:green;">₹${fmt(totalBusiness)}</b> <br>
                </div>

            </body>
            </html>`;

        // --- Print Logic ---
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        document.body.appendChild(iframe);

        iframe.contentDocument.open();
        iframe.contentDocument.write(printHTML);
        iframe.contentDocument.close();
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    };

    const normalize = (t = "") => t.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "").trim();

    const findCategoryKey = (categories, optionName = "") => {
        const target = normalize(optionName);

        // Exact match
        const exact = Object.keys(categories).find(
            key => normalize(key) === target
        );
        if (exact) return exact;

        // Partial match
        const partial = Object.keys(categories).find(
            key =>
                normalize(key).includes(target) ||
                target.includes(normalize(key))
        );
        if (partial) return partial;

        // Fallback
        return Object.keys(categories)[0];
    };

    const extractAllMenuItems = (obj) => {
        let res = [];
        if (!obj || typeof obj !== "object") return res;

        if (Array.isArray(obj.menuItems)) res.push(...obj.menuItems);

        Object.values(obj).forEach(v => {
            if (v && typeof v === "object") {
                res.push(...extractAllMenuItems(v));
            }
        });

        return res;
    };

    const generatePrintHTML = (title, subtitle, rate, lead, matchedMenu) => {
        return `
<html>
<head>
<title>${title}</title>

<style>
  body {
      font-family: Calibri, Arial;
      padding: 20px;
      color: black;
  }

  h1, h2 {
      margin: 0;
      text-align: center;
  }

  .title-box {
      background: #d7f0a3;
      padding: 12px;
      border-radius: 8px;
      text-align: center;
      margin: 20px 0;
      font-size: 22px;
      font-weight: bold;
  }

  .category h3 {
      margin: 15px 0 5px;
  }

  ul { margin-top: 5px; }
</style>

</head>
<body>


<div class="title-box">
    ${title.toUpperCase()}
    <div style="font-size:20px; margin-top:5px">${subtitle} — ₹ ${rate}/-</div>
</div>

<p><strong>Party:</strong> ${lead.name}</p>
<p><strong>Event:</strong> ${lead.functionType}</p>
<p><strong>Date:</strong> ${lead.functionDate}</p>

<div style="margin-top:20px">
    ${Object.entries(matchedMenu).map(([cat, items], i) => `
        <div class="category">
            <h3>${i + 1}. ${cat.toUpperCase()}</h3>
            <ul>
                ${items.map((item, idx) => `<li>${String.fromCharCode(97 + idx)}. ${item.name}</li>`).join("")}
            </ul>
        </div>
    `).join("")}
</div>

<hr style="margin-top:30px" />


</body>
</html>`;
    };

    const getBreakfastHTML = async (lead) => {
        const day = lead.meals?.Day1?.Breakfast;
        if (!day) return "";

        const optionName = day.option || "";
        const selectedItems = day.selectedItems || [];
        const rate = Number(day.rate) || 0;

        const selectedNorm = selectedItems.map(i => normalize(i));

        const snap = await getDoc(doc(db, "menu", "Breakfast"));
        if (!snap.exists()) return "";

        const categories = snap.data()?.categories || {};

        const key = findCategoryKey(categories, optionName);
        const selectedCategory = categories[key] || {};

        let matchedMenu = {};
        let matchedNames = new Set();

        // 🔹 First: Match with DB categories
        Object.entries(selectedCategory).forEach(([cat, data]) => {
            const all = extractAllMenuItems(data);

            const matched = all.filter(item => {
                const dbName = normalize(item.name);

                const isMatch = selectedNorm.some(sel => {
                    const ok = dbName.includes(sel) || sel.includes(dbName);
                    if (ok) matchedNames.add(sel);
                    return ok;
                });

                return isMatch;
            });

            if (matched.length) matchedMenu[cat] = matched;
        });

        // 🔹 Second: Find Unmatched Items
        const unmatched = selectedItems
            .filter(item => !matchedNames.has(normalize(item)))
            .map(name => ({ name }));

        if (unmatched.length) {
            matchedMenu["Other"] = unmatched;
        }

        return generatePrintHTML("BREAKFAST MENU", optionName, rate, lead, matchedMenu);
    };

    const getLunchHTML = async (lead) => {
        const day = lead.meals?.Day1?.Lunch;
        if (!day) return "";

        const selectedItems = day.selectedItems || [];
        const rate = Number(day.rate) || 0;

        const selectedNorm = selectedItems.map(i => normalize(i));

        const snap = await getDoc(doc(db, "menu", "Lunch"));
        if (!snap.exists()) return "";

        const categories = snap.data()?.categories || {};

        const key = findCategoryKey(categories, "Lunch");
        const selectedCategory = categories[key] || {};

        let matchedMenu = {};
        let matchedNames = new Set();

        // 🔹 First: Match with DB categories
        Object.entries(selectedCategory).forEach(([cat, data]) => {
            const all = extractAllMenuItems(data);

            const matched = all.filter(item => {
                const dbName = normalize(item.name);

                const isMatch = selectedNorm.some(sel => {
                    const ok = dbName.includes(sel) || sel.includes(dbName);
                    if (ok) matchedNames.add(sel);
                    return ok;
                });

                return isMatch;
            });

            if (matched.length) matchedMenu[cat] = matched;
        });

        // 🔹 Second: Find Unmatched Items
        const unmatched = selectedItems
            .filter(item => !matchedNames.has(normalize(item)))
            .map(name => ({ name }));

        if (unmatched.length) {
            matchedMenu["Other"] = unmatched;
        }

        return generatePrintHTML("LUNCH MENU", "Lunch", rate, lead, matchedMenu);
    };

    const getMealsDinnerHTML = async (lead) => {
        const day = lead.meals?.Day1?.Dinner;
        if (!day) return "";

        const selectedItems = day.selectedItems || [];
        const rate = Number(day.rate) || 0;
        const optionName = day.option || "Dinner";

        const selectedNorm = selectedItems.map(i => normalize(i));

        const snap = await getDoc(doc(db, "menu", "Dinner"));
        if (!snap.exists()) return "";

        const categories = snap.data()?.categories || {};

        const key = findCategoryKey(categories, optionName);
        const selectedCategory = categories[key] || {};

        let matchedMenu = {};
        let matchedNames = new Set();

        // 🔹 First: Match with DB categories
        Object.entries(selectedCategory).forEach(([cat, data]) => {
            const all = extractAllMenuItems(data);

            const matched = all.filter(item => {
                const dbName = normalize(item.name);

                const isMatch = selectedNorm.some(sel => {
                    const ok = dbName.includes(sel) || sel.includes(dbName);
                    if (ok) matchedNames.add(sel);
                    return ok;
                });

                return isMatch;
            });

            if (matched.length) matchedMenu[cat] = matched;
        });

        // 🔹 Second: Find Unmatched Items
        const unmatched = selectedItems
            .filter(item => !matchedNames.has(normalize(item)))
            .map(name => ({ name }));

        if (unmatched.length) {
            matchedMenu["Other"] = unmatched;
        }

        return generatePrintHTML("DINNER MENU", optionName, rate, lead, matchedMenu);
    };

    const getDinnerHTML = async (lead) => {
        // const menuName = Object.keys(lead.selectedMenus || {})[0];

        const selectedMenus = lead.selectedMenus && typeof lead.selectedMenus === "object"
            ? lead.selectedMenus
            : {};

        const menuKeys = Object.keys(selectedMenus);
        const menuName = menuKeys.length > 0 ? menuKeys[0] : null;


        if (!menuName) return "";

        const rate = lead.selectedMenus[menuName].rate || 0;
        const selectedItems = lead.selectedMenus[menuName].selectedSubItems || [];

        const selectedNorm = selectedItems.map(i => normalize(i));

        const snap = await getDoc(doc(db, "menu", "Dinner"));
        if (!snap.exists()) return "";

        const categories = snap.data()?.categories || {};

        const key = findCategoryKey(categories, menuName);
        const selectedCategory = categories[key] || {};

        let matchedMenu = {};
        let matchedNames = new Set();

        // 🔹 First: Match with DB categories
        Object.entries(selectedCategory).forEach(([cat, data]) => {
            const all = extractAllMenuItems(data);

            const matched = all.filter(item => {
                const dbName = normalize(item.name);

                const isMatch = selectedNorm.some(sel => {
                    const ok = dbName.includes(sel) || sel.includes(dbName);
                    if (ok) matchedNames.add(sel);
                    return ok;
                });

                return isMatch;
            });

            if (matched.length) matchedMenu[cat] = matched;
        });

        // 🔹 Second: Find Unmatched Items
        const unmatched = selectedItems
            .filter(item => !matchedNames.has(normalize(item)))
            .map(name => ({ name }));

        if (unmatched.length) {
            matchedMenu["Other"] = unmatched;
        }

        return generatePrintHTML("DINNER MENU", menuName, rate, lead, matchedMenu);
    };

    const sendToPrintAllMeals = async (lead) => {
        const breakfastHTML = await getBreakfastHTML(lead);
        const lunchHTML = await getLunchHTML(lead);

        // ⭐ NEW: Check if meals.Day1.Dinner exists
        let dinnerHTML = "";

        if (lead.meals?.Day1?.Dinner) {
            dinnerHTML = await getMealsDinnerHTML(lead);
        } else {
            dinnerHTML = await getDinnerHTML(lead); // fallback
        }


        // Build section list
        const sections = [];

        if (breakfastHTML?.trim()) sections.push(breakfastHTML);
        if (lunchHTML?.trim()) sections.push(lunchHTML);
        if (dinnerHTML?.trim()) sections.push(dinnerHTML);

        if (sections.length === 0) {
            alert("No Breakfast, Lunch, or Dinner menus found!");
            return;
        }

        const finalHTML = `
        <html><body>
        ${sections
                .map((html, i) =>
                    i === sections.length - 1
                        ? html
                        : `${html}<div style="page-break-after: always;"></div>`
                )
                .join("")}
        </body></html>
    `;

        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);

        iframe.contentDocument.open();
        iframe.contentDocument.write(finalHTML);
        iframe.contentDocument.close();

        iframe.contentWindow.print();
    };

    // /* ----------------- Print Section Ends ----------------- */

    const specialVenues = ["Luxury Rooms", "Rooms", "Cottage", "Water Park"];

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

        // Venue filter
        if (venueFilter !== "all" && lead.venueType !== venueFilter) return false;

        // Event filter ⭐⭐⭐ (THE FIX)
        if (eventFilter !== "all") {
            const events = Array.isArray(lead.functionType)
                ? lead.functionType
                : [lead.functionType];

            if (!events.includes(eventFilter)) return false;
        }

        // Date range
        if (fromDate && new Date(lead.functionDate) < new Date(fromDate)) return false;
        if (toDate && new Date(lead.functionDate) > new Date(toDate)) return false;

        // Upcoming/Past
        if (filterType === "upcoming" && new Date(lead.functionDate) < today) return false;
        if (filterType === "past" && new Date(lead.functionDate) >= today) return false;

        return true;
    });

    const summaryNormal = summaryBaseList.filter(
        (lead) => !specialVenues.includes(lead.venueType)
    );

    const summarySpecial = summaryBaseList.filter(
        (lead) => specialVenues.includes(lead.venueType)
    );

    const venueWiseSummary = {};

    summaryNormal.forEach((lead) => {
        const venue = lead.venueType || "Unknown Venue";
        const events = Array.isArray(lead.functionType)
            ? lead.functionType
            : [lead.functionType];

        if (!venueWiseSummary[venue]) venueWiseSummary[venue] = {};

        events.forEach((ev) => {
            if (!ev) return;
            venueWiseSummary[venue][ev] =
                (venueWiseSummary[venue][ev] || 0) + 1;
        });
    });

    const normalVenues = Object.keys(venueWiseSummary);

    const specialSummary = {};
    summarySpecial.forEach((lead) => {
        const venue = lead.venueType;
        specialSummary[venue] = (specialSummary[venue] || 0) + 1;
    });

    const totalOthers = Object.values(specialSummary).reduce((a, b) => a + b, 0);

    const allEventsSet = new Set();
    const venueListToUse = venueFilter !== "all" ? [venueFilter] : normalVenues;

    venueListToUse.forEach((venue) => {
        Object.keys(venueWiseSummary[venue] || {}).forEach((ev) =>
            allEventsSet.add(ev)
        );
    });

    const allEvents = [...allEventsSet];
    const sourceSummary = {};

    summaryBaseList.forEach((lead) => {
        const src = lead.source || "Unknown";
        const ref = lead.referredBy ? `, ${lead.referredBy}` : "";
        const key = `${src}${ref}`;
        sourceSummary[key] = (sourceSummary[key] || 0) + 1;
    });

    const formatMonthYear = (dateStr) => {
        if (!dateStr) return "Unknown";
        const d = new Date(dateStr);
        const month = d.toLocaleString("default", { month: "short" });
        const year = d.getFullYear();
        return `${month}${year}`;
    };

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "usersAccess"), (querySnapshot) => {

            // const isUpdatingRef = useRef(false);

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

        // ⭐ Venue
        if (venueFilter !== "all") {
            filtered = filtered.filter(l => l.venueType === venueFilter);
        }

        // 🟩 ⭐⭐⭐ SOURCE FILTER ⭐⭐⭐
        if (sourceFilter !== "all") {
            filtered = filtered.filter((l) => {
                const src = l.source || "Unknown";
                const ref = l.referredBy ? `, ${l.referredBy}` : "";
                const combined = `${src}${ref}`.trim();
                return combined === sourceFilter;
            });
        }


        // ⭐ Event filter
        if (eventFilter !== "all") {
            filtered = filtered.filter(l => {
                const events = Array.isArray(l.functionType)
                    ? l.functionType
                    : [l.functionType];
                return events.includes(eventFilter);
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

        // ⭐ Upcoming / Past filter (FIXED)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (filterType === "upcoming") {
            filtered = filtered.filter(l => {
                const functionDateIST = getISTDateOnly(new Date(l.functionDate));
                return functionDateIST >= today;
            });
        }

        if (filterType === "past") {
            filtered = filtered.filter(l => {
                const functionDateIST = getISTDateOnly(new Date(l.functionDate));
                return functionDateIST < today;
            });
        }

        // 🔥 MULTIPLE BOOKING FILTER
        if (multipleBookingFilter) {
            filtered = leads.filter(l => {
                const mobile = String(l.mobile1 || "")
                    .replace(/\D/g, "")
                    .slice(-10);

                return mobile === multipleBookingFilter;
            });
        }

        setFilteredLeads(filtered);

    }, [searchTerm, fromDate, toDate, financialYear, venueFilter, filterType, eventFilter, leads, sourceFilter, multipleBookingFilter]);

    useEffect(() => {
        if (filterType === "past") {
            setSortConfig({ key: "functionDate", direction: "desc" });
        } else if (filterType === "upcoming") {
            setSortConfig({ key: "functionDate", direction: "asc" });
        }
    }, [filterType]);

    const grandTotalSum = filteredLeads.reduce((sum, lead) => {
        const grand = Number(lead.grandTotal || 0);
        const disc = Number(lead.discount || 0);
        return sum + (grand + disc);   // FINAL GRAND TOTAL
    }, 0);
    const allAdvancePayments = filteredLeads.flatMap(lead => lead.advancePayments || []);
    const advanceSum = allAdvancePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const discountSum = filteredLeads.reduce((sum, lead) => sum + Number(lead.discount || 0), 0);

    const commissionSum = filteredLeads.reduce((sum, lead) => sum + Number(lead.commission || 0), 0);

    const cashSum = filteredLeads.reduce((sum, lead) => {
        const cashPayments = (lead.advancePayments || [])
            .filter(payment => payment.mode === "Cash")
            .reduce((subSum, payment) => subSum + Number(payment.amount || 0), 0);
        return sum + cashPayments;
    }, 0);

    const bankSum = filteredLeads.reduce((sum, lead) => {
        const cashPayments = (lead.advancePayments || [])
            .filter(payment => payment.mode !== "Cash")
            .reduce((subSum, payment) => subSum + Number(payment.amount || 0), 0);
        return sum + cashPayments;
    }, 0);

    const remainingSum = grandTotalSum - advanceSum - discountSum;

    const gstBaseSum = filteredLeads.reduce((sum, lead) => {
        return sum + Number(lead.gstBase || 0);
    }, 0);

    const gstAmountSum = filteredLeads.reduce((sum, lead) => {
        return sum + Number(lead.gstAmount || 0);
    }, 0);

    const sendToRating = async (lead) => {
        try {
            if (!lead?.mobile1) {
                alert("Customer mobile number not found");
                return;
            }

            // ✅ Fetch Google Rating message
            const msgRef = doc(db, "whatsappMessages", "Google Rating");
            const msgSnap = await getDoc(msgRef);

            if (!msgSnap.exists()) {
                alert("Google Rating message not found");
                return;
            }

            const { text } = msgSnap.data();
            if (!text) {
                alert("Rating message text empty");
                return;
            }

            // ✅ Clean mobile number (India)
            const phone = lead.mobile1.replace(/\D/g, "");
            const whatsappNumber = phone.startsWith("91") ? phone : `91${phone}`;

            // ✅ Encode message
            const encodedMsg = encodeURIComponent(text);

            // ✅ Open WhatsApp
            const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMsg}`;
            window.open(whatsappUrl, "_blank");

        } catch (err) {
            console.error("Error sending rating message:", err);
            alert("Failed to send rating message");
        }
    };

    /* 🔥 DUPLICATE MOBILE SET */
    const duplicateMobileSet = useMemo(() => {
        const grouped = leads.reduce((acc, lead) => {
            const mobileKey = (lead.mobile1 || "").replace(/\D/g, "");
            if (!mobileKey) return acc;

            if (!acc[mobileKey]) acc[mobileKey] = [];
            acc[mobileKey].push(lead);

            return acc;
        }, {});

        return new Set(
            Object.entries(grouped)
                .filter(([mobile, group]) => group.length > 1)
                .map(([mobile]) => mobile)
        );
    }, [leads]);

    const handleMultipleBookingClick = (mobile) => {
        if (!mobile) return;

        const cleanMobile = String(mobile)
            .replace(/\D/g, "")
            .slice(-10); // ✅ last 10 digit safe match

        setMultipleBookingFilter(cleanMobile);
    };

    const handleToggleView = async (lead, type, value) => {
        const field = type === "Event" ? "EventViewNumber" : "DecorationViewNumber";

        isUpdatingRef.current = true; // 🔥 start block

        setLeads(prev =>
            prev.map(l =>
                l.id === lead.id ? { ...l, [field]: value } : l
            )
        );

        try {
            await updateLead(lead.id, { [field]: value }, lead.monthYear);
        } catch (err) {
            console.error(err);
        }
    };

    const handleAutoToggle = async (type, value) => {
        const field =
            type === "Event"
                ? "EventAutoViewNumber"
                : "DecorationAutoViewNumber";

        isUpdatingRef.current = true;

        try {
            await setDoc(
                doc(db, "settings", "viewSettings"),
                {
                    [field]: value
                },
                { merge: true }
            );

            if (type === "Event") setEventAutoToggle(value);
            else setDecorAutoToggle(value);

        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div>

            <div className="leads-table-container" >

                <div className="table-header-bar" style={{ paddingTop: '45px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1px' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}> <h2 className="leads-header" style={{ margin: 0 }}>💒 Bookings</h2> </div>
                </div>

                {/* search bar */}
                <div>
                    <input
                        type="text"
                        placeholder="Search by name, Event or phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            padding: "0.5rem 1rem",
                            marginTop: "1rem",
                            width: "100%",
                            borderRadius: "8px",
                            border: "1px solid #57a2d9ff",
                        }}
                    />
                </div>

                {/* Create New Booking */}
                <div style={{ whiteSpace: "nowrap", display: "flex", justifyContent: "end", marginTop: "20px" }}>
                    <button
                        onClick={() => navigate('/booking')}
                        style={{
                            padding: "5px 10px",
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontSize: '15px',
                            whiteSpace: "nowrap"
                        }}
                    >
                        Create Booking
                    </button>
                </div>

                <div style={{ display: "none" }} onClick={setSortDirection}></div>

                {/* FILTER BTNS */}
                <div
                    style={{
                        marginBottom: "10px",
                        width: "fit-content",
                        borderRadius: "8px",
                    }}
                >
                    {/* Filter Buttons */}
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>🎯 Filters :</div>

                    <div
                        style={{
                            display: "flex",
                            overflowX: "auto",
                            whiteSpace: "nowrap",
                            gap: "5px",
                            scrollbarWidth: "thin",
                            WebkitOverflowScrolling: "touch",
                        }}
                    >
                        {/* Venue Type Filter */}
                        <button
                            style={{
                                padding: "5px 10px",
                                fontSize: "15px",
                                cursor: "pointer",
                                borderRadius: "6px",
                                border: "1px solid #ccc",
                                background: ShowVenueTypeTable ? "#eb4d42ff" : "#0fa714ff",
                                color: "#fff",
                                whiteSpace: "nowrap"
                            }}
                            onClick={() => setShowVenueTypeTable(prev => !prev)}
                        >
                            {ShowVenueTypeTable ? "Venue ↑" : "Venue"}
                        </button>

                        {/* Event Summary Table Filter */}
                        <button
                            onClick={() => setShowSummaryTable(prev => !prev)}
                            style={{
                                padding: "5px 10px",
                                fontSize: "15px",
                                cursor: "pointer",
                                borderRadius: "6px",
                                border: "1px solid #ccc",
                                background: ShowSummaryTable ? "#eb4d42ff" : "#0fa714ff",
                                color: "#fff",
                                whiteSpace: "nowrap"
                            }}
                        >
                            {ShowSummaryTable ? "Event ↑" : "Event"}
                        </button>

                        {/* Source Filter Button */}
                        <button
                            onClick={() => setShowSourceTable(prev => !prev)}
                            style={{
                                padding: "5px 10px",
                                fontSize: "15px",
                                cursor: "pointer",
                                borderRadius: "6px",
                                border: "1px solid #ccc",
                                background: showSourceTable ? "#eb4d42ff" : "#0fa714ff",
                                color: "#fff",
                                whiteSpace: "nowrap"
                            }}
                        >
                            {showSourceTable ? "Source ↑" : "Source"}
                        </button>

                        {/* Show Date Button */}
                        <button
                            onClick={() => setShowDateFilter(prev => !prev)}
                            style={{
                                padding: "5px 10px",
                                fontSize: "15px",
                                cursor: "pointer",
                                borderRadius: "6px",
                                border: "1px solid #ccc",
                                background: showDateFilter ? "#eb4d42ff" : "#0fa714ff",
                                color: "#fff",
                                whiteSpace: "nowrap"
                            }}
                        >
                            {showDateFilter ? "Date ↑" : "Date"}
                        </button>
                    </div>
                </div>

                {/* Venue Type Legend, Event Summary Table, Source Table, Date Filter */}
                <div style={{ margin: "20px 0px", display: 'flex', justifyContent: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>

                    {/* Venue Type Legend */}
                    {ShowVenueTypeTable && (
                        <div className='event-summary-container'>

                            <div style={{ textAlign: 'left' }} className="win-prob-legend">
                                <ul style={{ display: 'inline-block', listStyle: 'none', padding: 0, margin: 0 }}>
                                    {/* <li style={{ fontWeight: 'bold', marginBottom: '8px' }}>🎯 Venue Type :</li> */}

                                    {[...Object.keys(userPermissions.venueTypeColors || {})]
                                        .sort((a, b) => b.localeCompare(a))   // DESCENDING ORDER
                                        .concat("All Venues")
                                        .map((type) => {

                                            const isAll = type === "All Venues";
                                            const currentColor = !isAll
                                                ? userPermissions.venueTypeColors[type] || "#007BFF"
                                                : "#afc9ddff";

                                            return (
                                                <li
                                                    key={type}
                                                    onClick={() => {
                                                        setVenueFilter(isAll ? "all" : type);
                                                        setEventFilter("all");   // ⭐ reset event filter on venue change
                                                    }}
                                                    style={{
                                                        cursor: "pointer",
                                                        padding: "5px 12px",
                                                        borderRadius: "6px",
                                                        marginBottom: "6px",
                                                        backgroundColor:
                                                            venueFilter === (isAll ? "all" : type) ? currentColor : "#f0f0f0",
                                                        color: venueFilter === (isAll ? "all" : type) ? "#000000ff" : "#000",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "8px",
                                                        fontSize: "0.9rem",
                                                    }}
                                                >
                                                    {!isAll && (
                                                        <span
                                                            className="legend-box"
                                                            style={{
                                                                display: "inline-block",
                                                                width: "12px",
                                                                height: "12px",
                                                                backgroundColor: currentColor,
                                                                borderRadius: "3px",
                                                            }}
                                                        />
                                                    )}
                                                    {type}
                                                </li>
                                            );
                                        })}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Event Summary Table */}
                    {ShowSummaryTable && (
                        <div className='event-summary-container'
                            style={{
                                overflowY: "auto",      // 👈 vertical scroll
                                overflowX: "hidden",
                                border: "1px solid #ddd",
                                padding: "8px",
                                borderRadius: "6px",
                                background: "#fff"
                            }}
                        >
                            <>
                                {/* Venues below */}
                                {(venueFilter === "all" || !specialVenues.includes(venueFilter)) && (
                                    <div style={{ display: 'flex' }}>

                                        {/* left table */}
                                        <table className="event-left-table" style={{ width: "fit-content" }}>
                                            <thead>
                                                <tr>
                                                    <th>Event</th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                {allEvents.map((event) => (
                                                    <tr
                                                        key={event}
                                                        onClick={() => {
                                                            setEventFilter(event);
                                                            // setVenueFilter("all");  // ⭐ reset venue when selecting event
                                                        }}
                                                        style={{
                                                            cursor: "pointer",
                                                            backgroundColor: eventFilter === event ? "#d4ebff" : "white",
                                                            fontWeight: eventFilter === event ? "bold" : "normal"
                                                        }}
                                                    >
                                                        <td>{event}</td>
                                                    </tr>
                                                ))}

                                                <tr
                                                    className="total-row"
                                                    style={{
                                                        cursor: "pointer",
                                                        backgroundColor: eventFilter === "all" ? "#c0ffc0" : "white",
                                                        fontWeight: eventFilter === "all" ? "bold" : "normal"
                                                    }}
                                                    onClick={() => setEventFilter("all")}
                                                >
                                                    <td>TOTAL EVENTS</td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        {/* right table */}
                                        <div className="right-table-scroll">
                                            <table className="right-table" style={{ width: "fit-content" }}>
                                                <thead>
                                                    <tr>
                                                        {/* Normal venues only */}
                                                        {normalVenues
                                                            .filter(v => venueFilter === "all" || v === venueFilter)
                                                            .map((venue) => (
                                                                <th style={{ cursor: "pointer", border: "1px solid #ccc", padding: "6px", fontWeight: "bold", textAlign: "center" }} key={venue}>{venue}</th>
                                                            ))
                                                        }

                                                        {/* TOTAL */}
                                                        {venueFilter === "all" && (
                                                            <th style={{ border: '1px solid #ccc', padding: '6px', textAlign: 'center' }}>
                                                                TOTAL
                                                            </th>
                                                        )}
                                                    </tr>
                                                </thead>

                                                <tbody>
                                                    {allEvents.map((event) => {

                                                        const rowTotal = normalVenues.reduce(
                                                            (sum, venue) => sum + (venueWiseSummary[venue]?.[event] || 0),
                                                            0
                                                        );

                                                        return (
                                                            <tr
                                                                key={event}
                                                                onClick={() => setEventFilter(event)}
                                                                style={{
                                                                    backgroundColor: eventFilter === event ? "#fff3cd" : "white",
                                                                    fontWeight: eventFilter === event ? "bold" : "normal",

                                                                }}
                                                            >
                                                                {normalVenues
                                                                    .filter(v => venueFilter === "all" || v === venueFilter)
                                                                    .map((venue) => (
                                                                        <td style={{ border: "1px solid #ccc", padding: "6px", fontWeight: "bold", textAlign: "center" }} key={venue + event}>
                                                                            {venueWiseSummary[venue]?.[event] || "-"}
                                                                        </td>
                                                                    ))}


                                                                {venueFilter === "all" && (
                                                                    <td style={{ border: "1px solid #ccc", padding: "6px", fontWeight: "bold", textAlign: "center" }}>
                                                                        {rowTotal}
                                                                    </td>
                                                                )}

                                                            </tr>
                                                        );
                                                    })}

                                                    {/* Grand Total */}
                                                    <tr>
                                                        {/* Normal venue totals */}
                                                        {normalVenues
                                                            .filter(v => venueFilter === "all" || v === venueFilter)
                                                            .map((venue) => {
                                                                const venueTotal = Object.values(venueWiseSummary[venue] || {}).reduce((s, c) => s + c, 0);
                                                                return (
                                                                    <td key={venue + "total"}>
                                                                        {venueTotal}
                                                                    </td>
                                                                );
                                                            })}

                                                        {/* Grand total */}
                                                        {venueFilter === "all" && (
                                                            <td style={{ border: '1px solid #ccc', padding: '6px', fontWeight: 'bold', color: 'red', textAlign: 'center' }}>
                                                                {
                                                                    normalVenues.reduce(
                                                                        (sum, venue) =>
                                                                            sum + Object.values(venueWiseSummary[venue] || {}).reduce((s, c) => s + c, 0),
                                                                        0
                                                                    )
                                                                }
                                                            </td>
                                                        )}
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Special venues only below */}
                                {(venueFilter === "all" || specialVenues.includes(venueFilter)) && (
                                    <div style={{ marginTop: "10px", fontSize: "15px", fontWeight: "bold" }}>
                                        <table
                                            style={{
                                                borderCollapse: "collapse",
                                                marginTop: "15px",
                                                width: "100%",
                                                fontSize: "15px",
                                            }}
                                        >
                                            <tbody>
                                                {Object.keys(specialSummary).map((venue) => {
                                                    const count = specialSummary[venue];

                                                    if (count === 0) return null;

                                                    return (
                                                        <tr
                                                            key={venue}
                                                            onClick={() => {
                                                                setVenueFilter(venue);
                                                                // setEventFilter("all");   // ⭐ reset event filter when selecting special venue
                                                            }}

                                                            style={{
                                                                cursor: "pointer",
                                                                backgroundColor: venueFilter === venue ? "#d4ebff" : "white",
                                                                fontWeight: venueFilter === venue ? "bold" : "normal",
                                                            }}
                                                        >
                                                            <td style={{ border: "1px solid #ccc", padding: "6px", textAlign: "left" }}>
                                                                {venue}
                                                            </td>

                                                            <td style={{ border: "1px solid #ccc", padding: "6px", textAlign: "center" }}>
                                                                {count}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}

                                                {/* Reset row */}
                                                <tr
                                                    onClick={() => setVenueFilter("all")}
                                                    style={{
                                                        cursor: "pointer",
                                                        backgroundColor: venueFilter === "all" ? "#c0ffc0" : "white",
                                                        fontWeight: venueFilter === "all" ? "bold" : "normal",
                                                    }}
                                                >
                                                    <td style={{ border: "1px solid #ccc", padding: "6px", textAlign: "left" }}>
                                                        TOTAL OTHERS
                                                    </td>

                                                    <td style={{ border: "1px solid #ccc", padding: "6px", textAlign: "center" }}>
                                                        {totalOthers}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        </div>
                    )}

                    {/* Source Table */}
                    {showSourceTable && (
                        <div className='event-summary-container'>

                            <table
                                style={{
                                    borderCollapse: "collapse",
                                    width: "fit-content",
                                    fontSize: "15px"
                                }}
                            >
                                <thead>
                                    <tr>
                                        <th style={{ border: "1px solid #ccc", padding: "6px" }}>Source</th>
                                        <th style={{ border: "1px solid #ccc", padding: "6px" }}>Count</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {Object.keys(sourceSummary).map((src) => (
                                        <tr
                                            key={src}
                                            onClick={() => setSourceFilter(src.trim())}
                                            style={{
                                                cursor: "pointer",
                                                backgroundColor: sourceFilter === src.trim() ? "#d4ebff" : "white",
                                                fontWeight: sourceFilter === src.trim() ? "bold" : "normal"
                                            }}
                                        >
                                            <td style={{ border: "1px solid #ccc", padding: "6px", textAlign: "left" }}>{src}</td>
                                            <td style={{ border: "1px solid #ccc", padding: "6px", textAlign: "center" }}>
                                                {sourceSummary[src]}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* TOTAL */}
                                    <tr
                                        onClick={() => setSourceFilter("all")}
                                        style={{
                                            cursor: "pointer",
                                            backgroundColor: sourceFilter === "all" ? "#c0ffc0" : "white",
                                            fontWeight: sourceFilter === "all" ? "bold" : "normal"
                                        }}
                                    >
                                        <td style={{ border: "1px solid #ccc", padding: "6px" }}>TOTAL</td>
                                        <td style={{ border: "1px solid #ccc", padding: "6px", textAlign: "center" }}>
                                            {Object.values(sourceSummary).reduce((a, b) => a + b, 0)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

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
                        Upcoming ({upcomingCount}) {formatMoney(upcomingTotal)}
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
                        Past ({pastCount}) {formatMoney(pastTotal)}
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
                        All ({allCount}) {formatMoney(allTotal)}
                    </button>
                </div>

                {/* date filter */}
                <div className="filters-container" style={{ margin: "20px 0px", }}>
                    <div className="date-filters">

                        {showDateFilter && (
                            <>
                                <div className="filter-item">
                                    <label>Date From:</label>
                                    <input className="filterInput" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                                </div>

                                <div className="filter-item">
                                    <label>Date To:</label>
                                    <input className="filterInput" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                                </div>
                            </>
                        )}

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
                                setEventFilter("all");
                                setFilterType("upcoming");
                                setFilteredLeads(leads);
                                setSourceFilter('all');
                            }}
                        >
                            Clear All
                        </button>

                        {multipleBookingFilter && (
                            <div style={{ display: "flex", justifyContent: "center" }}>
                                <div
                                    onClick={() => setMultipleBookingFilter(null)}
                                    style={{
                                        marginTop: "5px",
                                        padding: "3px 10px",
                                        background: "#ffe4e4",
                                        borderRadius: "8px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "10px",
                                        fontWeight: "600",
                                        width: "fit-content"
                                    }}
                                >
                                    Multiple Bookings
                                    <span
                                        style={{
                                            cursor: "pointer",
                                            background: "red",
                                            color: "#fff",
                                            padding: "2px 8px",
                                            borderRadius: "20%",
                                            fontWeight: "bold"
                                        }}
                                    >
                                        ✕
                                    </span>
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* Items Per Page Controls */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '5px 10px', marginBottom: '5px', gap: '5px' }}>
                    <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>Items per page:</span>
                    {[25, 50, 100].map(num => (
                        <button
                            key={num}
                            onClick={() => {
                                setItemsPerPage(num);
                                setCurrentPage(1);
                            }}
                            style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                border: '1px solid #0056b3',
                                background: itemsPerPage === num ? '#0056b3' : 'white',
                                color: itemsPerPage === num ? 'white' : '#0056b3',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '12px'
                            }}
                        >
                            {num}
                        </button>
                    ))}
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

                                {['Prints', 'Month', 'Venue type', 'Event', 'Day/Night', 'Start Time',
                                    'Finish Time', 'Contact Number', 'Hall Charges'
                                ].map(header => (
                                    <th key={header}>{header}</th>
                                ))}

                                <th>
                                    <div>Applied GST</div>
                                    <hr style={{ margin: "4px 5px" }} />
                                    {formatMoney(gstBaseSum)}
                                </th>

                                <th>
                                    <div>GST</div>
                                    <hr style={{ margin: "4px 5px" }} />
                                    {formatMoney(gstAmountSum)}
                                </th>

                                {['Menu', 'Meals'
                                ].map(header => (
                                    <th key={header}>{header}</th>
                                ))}

                                <th>Sub Total
                                    <hr style={{ margin: "4px 5px" }} />
                                    <div>(Menu + Meal)</div>
                                </th>

                                <td style={{ backgroundColor: '#04ff42', color: 'black', fontSize: '14px', fontWeight: '800' }}>
                                    <div style={{ textAlign: "center" }}>Grand Total</div>
                                    <hr style={{ margin: "4px 5px" }} />
                                    {formatMoney(grandTotalSum)}
                                </td>

                                <th>
                                    <div>Cash Balance</div>
                                    <hr style={{ margin: "4px 5px" }} />
                                    {formatMoney(cashSum)}
                                </th>

                                <th>
                                    <div>Bank Balance</div>
                                    <hr style={{ margin: "4px 5px" }} />
                                    {formatMoney(bankSum)}
                                </th>

                                <th>
                                    <div>(Cash + Bank) Balance</div>
                                    <hr style={{ margin: "4px 5px" }} />
                                    {formatMoney(advanceSum)}
                                </th>

                                <th>
                                    <div>Discount</div>
                                    <hr style={{ margin: "4px 5px" }} />
                                    {formatMoney(discountSum)}
                                </th>

                                <td style={{ color: 'black', backgroundColor: '#ff7272ff', fontSize: '14px', fontWeight: '800', textAlign: "center" }}>
                                    <div>Remaining Balance</div>
                                    <hr style={{ margin: "4px 5px" }} />
                                    {formatMoney(remainingSum)}
                                </td>

                                {(userPermissions.accessToApp === "A" || userPermissions.accessToApp === "B") && (
                                    <>
                                        <th>
                                            View On Event
                                            <hr style={{ margin: "4px 5px" }} />
                                            <div style={{ display: "flex", justifyContent: "center" }}>
                                                <label>View All<label className="switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={eventAutoToggle === true}
                                                        onChange={(e) => handleAutoToggle("Event", e.target.checked)}
                                                    />
                                                    <span className="slider round"></span>
                                                </label> </label>

                                            </div>
                                        </th>

                                        <th>
                                            View On Decoration
                                            <hr style={{ margin: "4px 5px" }} />
                                            <div style={{ display: "flex", justifyContent: "center" }}>
                                                <label>View All<label className="switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={decorAutoToggle === true}
                                                        onChange={(e) => handleAutoToggle("Decoration", e.target.checked)}
                                                    />
                                                    <span className="slider round"></span>
                                                </label>
                                                </label>
                                            </div>
                                        </th>
                                    </>
                                )}

                                {['Source', 'Edit', 'Logs'
                                ].map(header => (
                                    <th style={{ textAlign: "center" }} key={header}>{header}</th>
                                ))}

                                {['Add Expense', 'Print Settlement', '⭐Rating', 'Note...',
                                    'Total Refund', 'Chargeable Items', 'Custom Menu Items',
                                    'Complimentary Items', ' Event Booked By'

                                ].map(header => (
                                    <th key={header}>{header}</th>
                                ))}

                                <th>
                                    <div>Commission</div>
                                    <hr style={{ margin: "4px 5px" }} />
                                    {formatMoney(commissionSum)}
                                </th>

                                {['Drop'].map(header => (
                                    <th key={header}>{header}</th>
                                ))}
                            </tr>
                        </thead>

                        <Tbody
                            leads={currentItems}
                            totalItems={sortedLeads.length}
                            startIndex={startIndex}
                            setLeads={setLeads}
                            isEditing={isEditing}
                            editing={editing}
                            handleFieldChange={handleFieldChange}
                            handleEdit={handleEdit}
                            handleNoteChange={handleNoteChange}
                            handleDateChange={handleDateChange}
                            startEdit={startEdit}
                            moveLeadToDrop={moveLeadToDrop}
                            sendToPrint={sendToPrint}
                            sendToPrintPayment={sendToPrintPayment}
                            userPermissions={userPermissions}
                            sortConfig={sortConfig}
                            requestSort={requestSort}
                            alwayEdit={userPermissions.alwayEdit}
                            openExpenseModal={openExpenseModal}
                            sendToPrintAllMeals={sendToPrintAllMeals}
                            sendToRating={sendToRating}
                            duplicateMobileSet={duplicateMobileSet}
                            handleMultipleBookingClick={handleMultipleBookingClick}
                            handleToggleView={handleToggleView}
                            viewSettings={viewSettings}
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
                            width: "25px",
                            height: "100px",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                            cursor: "pointer",
                            color: "black",
                        }} className="scroll-btn"
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
                            width: "25px",
                            height: "100px",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                            cursor: "pointer",
                            color: "black",
                        }} className="scroll-btn"
                    >
                        ▶
                    </button>

                </div>

                {/* Pagination Controls */}
                <Pagination 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />

                <div style={{ marginBottom: '50px' }}></div>
            </div >

            {expenseModalOpen && (
                <div className="expense-modal">
                    <div className="expense-modal-content">
                        <h3>💰 Add Event Expenses</h3>
                        <div className="expense-list">
                            {eventExpenses.map((exp, i) => (
                                <div key={i} className="expense-item">

                                    <div className="input-group">
                                        <label>Item</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Decoration"
                                            value={exp?.item || ""}
                                            onChange={(e) => {
                                                const updated = [...eventExpenses];
                                                updated[i].item = e.target.value;
                                                setEventExpenses(updated);
                                            }}
                                        />
                                    </div>

                                    <div className="input-group">
                                        <label>Rate</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 5000"
                                            value={exp?.rate || ""}
                                            onWheel={(e) => e.target.blur()}
                                            onChange={(e) => {
                                                const updated = [...eventExpenses];
                                                updated[i].rate = e.target.value;
                                                setEventExpenses(updated);
                                            }}
                                        />
                                    </div>

                                    <button
                                        className="remove-btn"
                                        onClick={() => {
                                            const updated = eventExpenses.filter((_, idx) => idx !== i);
                                            setEventExpenses(updated);
                                        }}
                                    >
                                        x
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            className="add-row-btn"
                            onClick={() => setEventExpenses([...eventExpenses, { item: "", rate: "" }])}
                        >
                            + Add Item
                        </button>

                        <div className="expense-modal-buttons">
                            <button className="save-btn" onClick={saveExpense}>Save</button>
                            <button className="save-btn" onClick={closeExpenseModal}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {printMenuData && (
                <div className="print-menu-overlay"
                    style={{
                        position: "fixed",
                        top: 0, left: 0, width: "100vw", height: "100vh",
                        background: "rgba(0,0,0,0.4)",
                        display: "flex", justifyContent: "center", alignItems: "center",
                        zIndex: 99999
                    }}
                >
                    <div style={{
                        background: "#fff",
                        padding: "20px",
                        borderRadius: "10px",
                        width: "80%",
                        maxHeight: "90vh",
                        overflowY: "auto",
                        position: "relative"
                    }}>
                        <button
                            onClick={() => setPrintMenuData(null)}
                            style={{
                                position: "absolute", top: "10px", right: "10px",
                                background: "red", color: "#fff",
                                border: "none", padding: "6px 12px",
                                borderRadius: "6px", cursor: "pointer"
                            }}
                        >
                            Close
                        </button>

                        {/* <PrintMenu lead={printMenuData} /> */}
                    </div>
                </div>
            )}

        </div >
    );
};

export default BookingLeadsTable; 