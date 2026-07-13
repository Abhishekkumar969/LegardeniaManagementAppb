import React, { useEffect, useState, useCallback, useRef } from 'react';
import { collection, doc, getDoc, updateDoc, onSnapshot, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import '../../styles/BookingLeadsTable.css';
import Tbody from './Tbody';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { getAuth } from "firebase/auth";
import Pagination from '../../components/Pagination';

const BookingLeadsTable = () => {
    const navigate = useNavigate();
    const [leads, setLeads] = useState([]);
    const [filteredLeads, setFilteredLeads] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [editingField, setEditingField] = useState({});
    const [editing, setEditing] = useState({});
    const [searchTerm, setSearchTerm] = useState("");
    const location = useLocation();
    const [sortField, setSortField] = useState('enquiryDate');
    const [sortAsc, setSortAsc] = useState(false);
    const [availableFY, setAvailableFY] = useState([]);
    const [tempFollowUps, setTempFollowUps] = useState({});
    const [currentUserName, setCurrentUserName] = useState("");

    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;

        if (user) {
            setCurrentUserName(user.displayName || user.email || "Unknown");
        }
    }, []);

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

    const formatTime12Hour = (timeStr) => {
        if (!timeStr) return "";

        const [hour, minute] = timeStr.split(":");
        let h = parseInt(hour, 10);

        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12;
        h = h ? h : 12; // 0 -> 12

        return `${h}:${minute} ${ampm}`;
    };

    const handleCancelEdit = (leadId, index) => {
        setEditing(prev => ({
            ...prev,
            [leadId]: {
                ...prev[leadId],
                [index]: false
            }
        }));

        setTempFollowUps(prev => {
            const updated = { ...prev };
            delete updated[`${leadId}_${index}`];
            return updated;
        });
    };

    const [financialYear, setFinancialYear] = useState("");
    const hasPrinted = useRef(false);
    const hasSentWhatsApp = useRef(false);
    const [filters, setFilters] = useState({
        search: "",
        from: "",
        to: "",
        fy: "",
        winRange: null,
    });
    const { from, to, fy } = filters;
    const [printMenuData, setPrintMenuData] = useState(null);

    const moveLeadToDrop = (leadId, removeOriginal = false, reason = '', monthYear) => {
        try {
            const monthRef = doc(db, "bookingLeads", monthYear);

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
                const pastRef = doc(db, "dropLeads", pastMonthYear);

                // Move lead to dropLeads
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
        // Reference to the "bookingLeads" collection
        const bookingLeadsRef = collection(db, "bookingLeads");

        // Real-time listener
        const unsubscribe = onSnapshot(
            bookingLeadsRef,
            (querySnapshot) => {
                const leadsMap = new Map();

                querySnapshot.forEach(docSnap => {
                    const monthData = docSnap.data(); // e.g. { abc123: {...}, xyz456: {...} }
                    Object.entries(monthData).forEach(([id, data]) => {
                        leadsMap.set(id, {
                            id,
                            ...data,
                            monthYear: docSnap.id,
                        });
                    });
                });
                
                let allLeads = Array.from(leadsMap.values());

                // Sort by createdAt descending
                const sortedData = allLeads.sort((a, b) => {
                    const dateA = a.enquiryDate ? new Date(a.enquiryDate) : new Date(0);
                    const dateB = b.enquiryDate ? new Date(b.enquiryDate) : new Date(0);
                    return dateB - dateA; // descending (latest first)
                });

                setLeads(sortedData);
                setFilteredLeads(sortedData);
            },
            (error) => {
                console.error("Error fetching bookingLeads:", error);
            }
        );

        // Cleanup listener on unmount
        return () => unsubscribe();
    }, []);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortAsc(!sortAsc); // toggle ascending/descending
        } else {
            setSortField(field);
            setSortAsc(true); // new field default ascending
        }
    };

    const sortedLeads = [...filteredLeads].sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (!valA && !valB) return 0;
        if (!valA) return 1;
        if (!valB) return -1;

        const dateA = new Date(valA);
        const dateB = new Date(valB);
        
        if (isNaN(dateA) && isNaN(dateB)) return 0;
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;

        return sortAsc ? dateA - dateB : dateB - dateA;
    });

    const totalPages = Math.ceil(sortedLeads.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentItems = sortedLeads.slice(startIndex, startIndex + itemsPerPage);

    const handleFieldChange = async (id, field, value) => {
        const lead = leads.find(l => l.id === id);
        if (!lead) return;

        const oldMonthYear = lead.monthYear;
        let newMonthYear = oldMonthYear;

        // Update monthYear if enquiryDate or functionDate changes
        if (field === "enquiryDate" || field === "functionDate") {
            const date = new Date(value);
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            // Match your Firestore doc names (e.g., "Sep2025")
            newMonthYear = `${monthNames[date.getMonth()]}${date.getFullYear()}`;
        }

        const updatedLead = { ...lead, [field]: value, monthYear: newMonthYear };

        // Update local state immediately
        setLeads(prev => prev.map(l => l.id === id ? updatedLead : l));
        setFilteredLeads(prev => prev.map(l => l.id === id ? updatedLead : l));

        console.log("Updating lead:", id);
        console.log("Old Month:", oldMonthYear, "New Month:", newMonthYear);

        try {
            const newMonthRef = doc(db, "bookingLeads", newMonthYear);
            const oldMonthRef = doc(db, "bookingLeads", oldMonthYear);

            if (oldMonthYear === newMonthYear) {
                console.log("Same month, just updating lead in Firestore");
                await updateDoc(newMonthRef, { [id]: updatedLead });
            } else {
                console.log("Different month, moving lead in Firestore");

                // 1️⃣ Write to new month
                await setDoc(newMonthRef, { [id]: updatedLead }, { merge: true });
                console.log("Lead written to new month:", newMonthYear);

                // 2️⃣ Delete from old month
                try {
                    await updateDoc(oldMonthRef, { [id]: deleteField() });
                    console.log("Lead deleted from old month:", oldMonthYear);
                } catch (err) {
                    console.warn(`Could not delete from old month (${oldMonthYear}):`, err);
                }
            }
        } catch (err) {
            console.error("Firestore update failed:", err);
        }

        // Close edit mode
        setEditingField(prev => ({
            ...prev,
            [id]: { ...(prev[id] || {}), [field]: false }
        }));
    };

    const handleDateChange = async (id, index, updatedFollowUp) => {
        const lead = leads.find(l => l.id === id);
        if (!lead) return;

        // ⏰ Get today's IST date
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST offset from UTC
        const istDate = new Date(now.getTime() + istOffset);
        const istFormatted = istDate.toISOString().slice(0, 10); // YYYY-MM-DD

        const updatedFollowUps = [...(lead.followUpDetails || [])];

        // Merge new data + auto "on" field
        const createdAt = new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        }).format(now);

        updatedFollowUps[index] = {
            ...updatedFollowUps[index],
            ...updatedFollowUp,
            on: istFormatted,
            createdAt: createdAt,
            by: currentUserName
        };

        try {
            const leadRef = doc(db, "bookingLeads", lead.monthYear);

            // Update Firestore with the new follow-up array
            await updateDoc(leadRef, {
                [`${id}.followUpDetails`]: updatedFollowUps,
            });

            // Update local state for immediate UI refresh
            setLeads(prev =>
                prev.map(l => (l.id === id ? { ...l, followUpDetails: updatedFollowUps } : l))
            );
            setFilteredLeads(prev =>
                prev.map(l => (l.id === id ? { ...l, followUpDetails: updatedFollowUps } : l))
            );

            // Close edit mode after save
            setEditing(prev => ({
                ...prev,
                [id]: { ...prev[id], [index]: false },
            }));

            console.log(`✅ Follow-up ${index + 1} updated for ${lead.customerName} (on: ${istFormatted})`);
        } catch (err) {
            console.error("❌ Failed to update follow-up:", err);
        }
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

    useEffect(() => {
        if (!searchTerm) {
            setFilteredLeads(leads);
            return;
        }

        const normalize = (str) =>
            str
                .toString()
                .trim()
                .toLowerCase()
                .replace(/[-.]/g, "/")
                .replace(/\b0+(\d)/g, "$1"); // remove leading zeros for flexible matching

        const searchNorm = normalize(searchTerm);

        const filtered = leads.filter((booking) => {
            return Object.entries(booking).some(([key, val]) => {
                if (typeof val !== "string") return false;
                const normalizedVal = normalize(val);

                // 🔍 handle functionDate & enquiryDate flexibly
                if (key === "functionDate" || key === "enquiryDate") {
                    const dateStr = val.trim();
                    const parts = dateStr.split(/[-/]/).map(Number);
                    let dateObj;

                    if (parts[0] > 1000) {
                        // YYYY-MM-DD
                        dateObj = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
                    } else {
                        // DD-MM-YYYY or DD/MM/YYYY
                        dateObj = new Date(parts[2] || new Date().getFullYear(), (parts[1] || 1) - 1, parts[0] || 1);
                    }

                    if (isNaN(dateObj)) return false;

                    const d = dateObj.getDate();
                    const m = dateObj.getMonth() + 1;
                    const y = dateObj.getFullYear();

                    // ✅ Compare both padded & unpadded
                    const formats = [
                        `${d}/${m}/${y}`,
                        `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`,
                    ];

                    return formats.some((fmt) => normalize(fmt).includes(searchNorm));
                }

                // Normal text fields
                return normalizedVal.includes(searchNorm);
            });
        });

        setFilteredLeads(filtered);
    }, [searchTerm, leads]);

    const applyFilters = useCallback(() => {
        let data = [...leads];

        // Convert date to IST
        const toIST = (d) => {
            if (!d) return null;
            const dt = new Date(d);
            const utc = dt.getTime() + dt.getTimezoneOffset() * 60000;
            return new Date(utc + 5.5 * 60 * 60 * 1000);
        };

        // 1️⃣ SEARCH FILTER
        if (filters.search.trim() !== "") {
            const term = filters.search.toLowerCase();
            data = data.filter(l =>
                Object.values(l).some(v =>
                    String(v).toLowerCase().includes(term)
                )
            );
        }

        // 2️⃣ FROM–TO DATE FILTER
        if (filters.from) {
            const f = toIST(filters.from);
            data = data.filter(l => toIST(l.functionDate) >= f);
        }

        if (filters.to) {
            const t = toIST(filters.to);
            data = data.filter(l => toIST(l.functionDate) <= t);
        }

        // 3️⃣ FINANCIAL YEAR FILTER
        if (filters.fy !== "") {
            const [y1, y2] = filters.fy.split("-").map(Number);
            const fyStart = toIST(`${y1}-04-01`);
            const fyEnd = toIST(`${y2}-03-31`);
            data = data.filter(l => {
                const fd = toIST(l.functionDate);
                return fd >= fyStart && fd <= fyEnd;
            });
        }

        // 4️⃣ WIN PROBABILITY FILTER
        if (filters.winRange) {
            const [min, max] = filters.winRange;
            data = data.filter(l => {
                const wp = Number(l.winProbability || 0);
                return wp >= min && wp <= max;
            });
        }

        // FINAL RESULT
        setFilteredLeads(data);

    }, [filters, leads]);

    useEffect(() => {
        applyFilters();
    }, [applyFilters]);

    const fetchBaseRates = async () => {
        try {
            const dinnerRef = doc(db, "menu", "Dinner");
            const dinnerSnap = await getDoc(dinnerRef);
            if (!dinnerSnap.exists()) return {};

            const data = dinnerSnap.data();
            const categories = data.categories || {};
            const baseRates = {};

            // Loop through categories (e.g., Golden Veg, Diamond Veg, etc.)
            for (const [catName, catData] of Object.entries(categories)) {
                if (catData && typeof catData === "object") {
                    const rate = parseFloat(catData.price || catData.rate || 0);
                    if (!isNaN(rate) && rate > 0) {
                        // Normalize for matching
                        baseRates[catName.trim().toLowerCase()] = rate;
                    }
                }
            }

            console.log("✅ Firestore baseRates loaded:", baseRates);
            return baseRates;
        } catch (err) {
            console.error("❌ Error fetching menu base rates:", err);
            return {};
        }
    };

    // /* ----------------- Print Section Starts ----------------- */

    const handlePrint = useCallback(async (lead) => {
        const baseRates = await fetchBaseRates();

        const amenitiesList = (lead.bookingAmenities || [])
            .map(item => `<li style="padding-left:40px">☑ ${item}</li>`)
            .join("");

        const selectedMenus = (lead.menuSummaries || []).filter(menu => {
            const name = (menu.menuName || "").trim().toLowerCase();
            return name !== "meal only" && name !== "venue only";
        });

        // ✅ Generate menu rows with STRIKE logic fixed
        const menuRows = selectedMenus.map(menu => {
            const menuNameRaw = (menu.menuName || "").trim();

            const menuName = menuNameRaw
                .toLowerCase()
                .split(" ")
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ");

            const normalize = (str) =>
                str?.toLowerCase().replace(/\s+/g, " ").trim();

            const menuData = Object.entries(lead.selectedMenus || {}).find(
                ([key]) => normalize(key) === normalize(menuName)
            )?.[1] || {};

            const customRate = Number(menuData.rate || 0);

            // 🔍 Match base rate ignoring case + trim
            const baseRate =
                baseRates[menuName.toLowerCase()] ??
                baseRates[menuName.replace(/\s+/g, " ").trim().toLowerCase()] ??
                0;

            // ✅ Apply cut only if baseRate exists and customRate is less than baseRate
            const showStrike =
                baseRate > 0 && Math.round(customRate) < Math.round(baseRate);

            return `
      <li style="display:flex;justify-content:space-between;padding-left:40px;align-items:center;margin-bottom:4px;">
        <span style="flex:1;">• ${menuName} :</span>
        <div style="display:flex;gap:10px;flex:2;justify-content:flex-end;align-items:flex-end;">
          
          <!-- Rate Column -->
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="font-size:12px;margin-bottom:2px;">Rate</div>
            <div style="border-bottom:1px solid #000;width:100px;text-align:center;color:red;">
              ₹ ${showStrike
                    ? `<span style="text-decoration: line-through;">${baseRate.toLocaleString("en-IN")}</span>
                     <span style="font-weight:bold;">${customRate.toLocaleString("en-IN")}</span>`
                    : customRate.toLocaleString("en-IN")
                }
            </div>
          </div>

          <span>X</span>

          <!-- Pax -->
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="font-size:12px;margin-bottom:2px; font-weight:bold;">Pax</div>
            <div style="border-bottom:1px solid #000; width:80px; text-align:center; color:red; font-weight:bold;">
              ${menuData.extraPlates && Number(menuData.extraPlates) > 0
                    ? `${Number(menuData.noOfPlates || 0)} + ${Number(menuData.extraPlates)}`
                    : `${Number(menuData.noOfPlates || 0)}`
                }
            </div>
          </div>

          <span>=</span>

          <!-- Total -->
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="font-size:12px;margin-bottom:2px;">Menu Total</div>
            <div style="border-bottom:1px solid #000;width:80px;text-align:center;background-color:yellow;color:red; white-space:nowrap">
              ₹ ${Number(menu.menuTotal || 0).toLocaleString("en-IN")}
            </div>
          </div>
        </div>
      </li>`;
        }).join("");

        let grandMealTotal = 0; // ⬅️ move outside so it can be used later

        const mealRows = (lead.meals && Object.keys(lead.meals).length > 0) ? (() => {

            const rows = Object.entries(lead.meals)
                .filter(([dayName, dayData]) =>
                    Object.entries(dayData).some(
                        ([mealName, mealInfo]) => mealName !== "date" && mealInfo?.total
                    )
                )
                .sort(([a], [b]) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")))
                .map(([dayName, dayData]) => {
                    const dayDate = dayData.date
                        ? formatDate(dayData.date)
                        : "No date";

                    return `
        <li style="margin-bottom:15px; padding-left:40px;">
          <strong>${dayName} (${dayDate})</strong>
          <div style="display:flex; flex-direction:column; margin-top:5px; gap:5px;">
            ${Object.entries(dayData)
                            .filter(([mealName]) => mealName !== "date")
                            .map(([mealName, mealInfo]) => {
                                grandMealTotal += mealInfo?.total || 0; // add to grand total
                                return `
                  <div style="display:flex; justify-content:space-between; padding-left:10px;">
                    <div style="flex:1;">${mealName} <span style="color:red"> (${mealInfo.option}) </span> </div>
                    <div style="flex:1;">Rate: <span style="border-bottom: 1px solid #000; color:red">₹${mealInfo.rate}</span> 
                      X Pax: <span style="border-bottom: 1px solid #000; color:red">${mealInfo.pax}</span>
                    </div>
                  </div>`;
                            })
                            .join("")}
          </div>
        </li>`;
                }).join("");

            // Append grand total at the end, right-aligned with background only on amount
            return rows + `
<li style="padding: 0px; text-align:right; font-weight:bold; color:red">
  <span style="background-color:yellow; padding: 2px 8px; border-radius:4px; border-bottom: 1px solid #000">
    Meal Total: ₹${grandMealTotal}
  </span>
</li>`;

        })()
            : "";

        const hasMenu = selectedMenus && selectedMenus.length > 0;

        const hasMeal = lead.meals && Object.values(lead.meals).some(day =>
            Object.entries(day || {}).some(
                ([key, val]) =>
                    key !== "date" &&
                    val &&
                    typeof val === "object" &&
                    Number(val.total) > 0
            )
        );

        const hall = parseFloat(lead.hallCharges || 0);

        const mealSection = hasMeal
            ? `
            <div class="section">
              <strong>${hasMenu ? 3 : 2}. Meal Selected</strong>
              <ul>
                ${mealRows}
              </ul>
            </div>
          `
            : '';

        let gstSectionNumber = 2;

        if (hasMenu) gstSectionNumber++;
        if (hasMeal) gstSectionNumber++;


        // ✅ GST section ko conditional banao
        const gstSection =
            lead.gstBase && Number(lead.gstBase) > 0
                ? `
    <div class="section">
      <div style="display: flex; justify-content: space-between;">
        <strong>${gstSectionNumber}. GST on 
          <span style="color:red"> ₹ ${Number(lead.gstBase).toLocaleString('en-IN')}</span> @18%
        </strong>
        <strong style="background-color:yellow; color:red; border-bottom: 1px solid #000">
          ₹ ${Number(lead.gstAmount || 0).toLocaleString('en-IN')}
        </strong>
      </div>
    </div>`
                : ""; // ❌ show hi mat karo agar gstBase 0 hai     

        const grandTotalLines = hasMenu
            ? selectedMenus.map((menu, index) => {

                const gst = Number(lead.gstAmount || 0);

                const total =
                    hall +
                    Number(menu.menuTotal || 0) +
                    grandMealTotal +
                    gst;

                const mealsText = hasMeal ? " + Meals" : "";
                const gstText = gst > 0 ? " + GST" : "";

                return `
<div style="display: flex; justify-content: space-between; margin-top: 4px">
  <span>
    <strong>
      Grand Total 
      <span style="font-size:14px">
      ( Venue Charges + ${(menu.menuName || "")
                        .toLowerCase()
                        .split(" ")
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(" ")
                    }${mealsText}${gstText} )
      </span> :
    </strong>
  </span>

  <div style="border-bottom: 1px solid #000; width: 200px; text-align: center; background-color:yellow; font-weight:bold; color:red">
    ₹ ${Number(total).toLocaleString('en-IN')}
  </div>
</div>`;
            }).join("")
            : `
<div style="display: flex; justify-content: space-between; margin-top: 4px">
  <span><strong>Grand Total 
    <span style="font-size:14px">
      ( Venue Charges ${hasMeal ? "+ Meals" : ""} ${lead.gstAmount ? "+ GST" : ""} )
    </span> :
  </strong></span>

  <div style="border-bottom: 1px solid #000; width: 200px; text-align: center; background-color:yellow; font-weight:bold; color:red">
    ₹ ${(hall + grandMealTotal + Number(lead.gstAmount || 0)).toLocaleString('en-IN')}
  </div>
</div>`;

        // Calculate strike price HTML
        const strikePriceHTML =
            lead.strikeHallCharges &&
                lead.hallCharges &&
                Number(lead.hallCharges) < Number(lead.strikeHallCharges)
                ? `<span style="text-decoration: line-through; color: #888; margin-right: 6px;">
                 ₹${Number(lead.strikeHallCharges).toLocaleString("en-IN")}
               </span>`
                : "";

        // Venue charges section for HTML
        const venueChargesHTML = `
        <div class="section">
          <div style="display: flex; justify-content: space-between;">
            <strong>1. Venue Charges - <span style="color:red" > ${lead.venueType} </span> :</strong>
            <div style="border-bottom: 1px solid #000; text-align: center;">
              ${strikePriceHTML}<span style="color:red ; font-weight:bold; background-color:yellow" >₹${Number(lead.hallCharges || 0).toLocaleString("en-IN")}</span>
            </div>
          </div>
          <ul>${amenitiesList}</ul>
        </div>
        `;

        const foodMenuSection = hasMenu ? `
    <div class="section">
        <strong>2. Food Menu Selection</strong>
        <ul>${menuRows}</ul>
    </div>
` : "";

        const content = `
    <html>
    <head>
        <title>Booking Estimate_${lead.functionDate ? new Date(lead.functionDate).toLocaleDateString('en-GB').split('/').join('-') : ''}</title>
        <style>
            body { font-family: Arial; padding: 30px; line-height: 1.4; border: 2px solid red; color:#00054b }
            h2 { text-align: center; color: red; font-weight: bold; text-decoration: underline; font-size: 24px; }
            .section { margin-top: 15px; }
            .border-box {
                border: 2px solid red;
                padding: 10px;
                margin-bottom: 10px;
                margin-top: 5px;
                color: red;
            }
            }
            .info-row {
                display: flex;
                justify-content: space-between;
                margin: 5px 15px;
            }
            .label { font-weight: bold; }
            ul { list-style: none; padding: 0; }
            li { margin-bottom: 6px; }
        </style>
    </head>
    <body>
        <h2>BOOKING ESTIMATE</h2>

<div class="border-box" style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px;">
  
  <!-- Left Column -->
  <div style="flex: 1; min-width: 250px;">
    <div class="info-row">
      <span class="label">Name:</span>
      ${lead.prefix ? lead.prefix + ' ' : ''}${lead.name || '________'}
    </div>
    <div class="info-row">
      <span class="label">Mobile:</span>
      ${lead.mobile1
                ? lead.mobile1 + (lead.mobile2 ? ', ' + lead.mobile2 : '')
                : '________'
            }
    </div>
    <div class="info-row">
      <span class="label">Function Type:</span>
      ${lead.functionType || '________'}
    </div>
  </div>

  <!-- Right Column -->
  <div style="flex: 1; min-width: 250px;">
    <div class="info-row">
      <span class="label">Nos. of Pax:</span>
      ${lead.noOfPlates || '________'}
    </div>
    <div class="info-row">
      <span class="label">Date of Function:</span>
      ${lead.functionDate
                ? formatDate(lead.functionDate)
                : '________'}
    </div>
    <div class="info-row">
      <span class="label">Date of Enquiry:</span>
      ${lead.enquiryDate ? formatDate(lead.enquiryDate) : '-'}
    </div>
  </div>

       </div>

        <div class="section">
            <div style="display: flex; justify-content: space-between;">             
            </div>
            <ul>${venueChargesHTML}</ul>
        </div>

       ${foodMenuSection}
 
        ${mealSection}

        ${gstSection}

        <div class="section" style="margin-top: 20px;">
            ${grandTotalLines}
        </div>

        <div class="section" style="margin-top: 30px;">
            <div>${lead?.authorisedSignatoryh || "Sales Team"}</div>
            <div style="border-bottom: 1px solid #000; width: 200px; margin-bottom: 5px;"></div>
            <div>Authorised Signature</div>
        </div>
        
    </body>
    </html>
    `;

        // ✅ hidden iframe banaya
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        document.body.appendChild(iframe);

        // iframe ke andar HTML inject
        iframe.contentDocument.open();
        iframe.contentDocument.write(content);
        iframe.contentDocument.close();

        // print kar do
        iframe.contentWindow.focus();
        iframe.contentWindow.print();

        // cleanup
        // setTimeout(() => document.body.removeChild(iframe), 1000);

    }, []);

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

        Object.entries(selectedCategory).forEach(([cat, data]) => {
            const all = extractAllMenuItems(data);
            const matched = all.filter(item => {
                const dbName = normalize(item.name);
                return selectedNorm.some(sel => dbName.includes(sel) || sel.includes(dbName));
            });
            if (matched.length) matchedMenu[cat] = matched;
        });

        return generateMealPageHTML("BREAKFAST MENU", optionName, rate, lead, matchedMenu);
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

        Object.entries(selectedCategory).forEach(([cat, data]) => {
            const all = extractAllMenuItems(data);
            const matched = all.filter(item => {
                const dbName = normalize(item.name);
                return selectedNorm.some(sel => dbName.includes(sel) || sel.includes(dbName));
            });
            if (matched.length) matchedMenu[cat] = matched;
        });

        return generateMealPageHTML("LUNCH MENU", "Lunch", rate, lead, matchedMenu);

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

        Object.entries(selectedCategory).forEach(([cat, data]) => {
            const all = extractAllMenuItems(data);
            const matched = all.filter(item => {
                const dbName = normalize(item.name);
                return selectedNorm.some(sel => dbName.includes(sel) || sel.includes(dbName));
            });
            if (matched.length) matchedMenu[cat] = matched;
        });

        return generateMealPageHTML("DINNER MENU", optionName, rate, lead, matchedMenu);
    };

    const getDinnerHTML = async (lead) => {
        const selectedMenus = lead.selectedMenus || {};
        const menuNames = Object.keys(selectedMenus);

        if (!menuNames.length) return "";

        const snap = await getDoc(doc(db, "menu", "Dinner"));
        if (!snap.exists()) return "";

        const categories = snap.data()?.categories || {};

        const pages = [];

        for (const menuName of menuNames) {
            const menuData = selectedMenus[menuName];
            if (!menuData) continue;

            const rate = Number(menuData.rate || 0);
            const selectedItems = menuData.selectedSubItems || [];

            if (!selectedItems.length) continue;

            const selectedNorm = selectedItems.map(i => normalize(i));

            const key = findCategoryKey(categories, menuName);
            const selectedCategory = categories[key] || {};

            let matchedMenu = {};

            Object.entries(selectedCategory).forEach(([cat, data]) => {
                const all = extractAllMenuItems(data);
                const matched = all.filter(item => {
                    const dbName = normalize(item.name);
                    return selectedNorm.some(
                        sel => dbName.includes(sel) || sel.includes(dbName)
                    );
                });
                if (matched.length) matchedMenu[cat] = matched;
            });

            if (Object.keys(matchedMenu).length) {
                pages.push(
                    generateMealPageHTML(
                        "DINNER MENU",
                        menuName,   // 👈 Diamond Veg / Golden Veg
                        rate,
                        lead,
                        matchedMenu
                    )
                );
            }
        }

        // 🔥 return ALL dinner menu pages
        return pages.join("");
    };

    const sendToPrintAllMeals = async (lead) => {
        const pages = [];

        const b = await getBreakfastHTML(lead);
        const l = await getLunchHTML(lead);
        const d = lead.meals?.Day1?.Dinner
            ? await getMealsDinnerHTML(lead)
            : await getDinnerHTML(lead);

        [b, l, d].forEach(p => p && pages.push(p));

        const html = `
    <html>
      <head>${MASTER_STYLE}</head>
      <body>${pages.join("")}</body>
    </html>
  `;

        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);

        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        iframe.contentWindow.print();
    };

    const MASTER_STYLE = `
    <style>
      @page { size: A4; }
    
    body {
      font-family: Arial;
      line-height: 1.4;
      color:#00054b;
      padding: 0px;
    }
    
    /* ✅ Sirf estimate page ke liye */
    .estimate-page {
      height: 92%;
      border: 2px solid red;
      padding: 30px;
    }

  h2 {
    text-align:center;
    color:red;
    font-weight:bold;
    text-decoration:underline;
    font-size:24px;
  }

  .section { margin-top:15px; }

  .border-box {
    border:2px solid red;
    padding:10px;
    margin-bottom:10px;
    color:red;
  }

  ul { list-style:none; padding:0; }
  li { margin-bottom:6px; }

  .print-page {
    page-break-after: always;
  }

  .print-page:last-child {
    page-break-after: auto;
  }
</style>
    `;

    const generateMealPageHTML = (title, subtitle, rate, lead, matchedMenu) => {
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

    // /* ----------------- Print Section Ends ----------------- */

    useEffect(() => {
        if (location.state?.triggerPrint && !hasPrinted.current) {
            const savedLead = localStorage.getItem("leadToPrint");

            if (savedLead) {
                const lead = JSON.parse(savedLead);
                handlePrint(lead); // print immediately
                hasPrinted.current = true; // mark as printed
            }

            window.history.replaceState({}, document.title);
        }
    }, [location.state, handlePrint]);

    const handleWhatsApp = useCallback((lead) => {
        if (!lead || !lead.mobile1) {
            alert("No mobile number found for WhatsApp!");
            return;
        }

        const amenitiesList = (lead.bookingAmenities || []).join(", ");
        const selectedMenus = (lead.menuSummaries || []).map(m => `${m.menuName}: ₹${m.menuTotal}`).join("\n");
        const hallCharges = lead.hallCharges ? `Venue Charges: ₹${lead.hallCharges}` : "";
        const gst = lead.gstBase && Number(lead.gstBase) > 0 ? `GST: ₹${lead.gstAmount}` : "";
        const mealsText = lead.meals ? "Meals selected" : "";

        // Construct message text (URL-encoded)
        const message = encodeURIComponent(`
Booking Estimate for ${lead.prefix || ""} ${lead.name || ""}:
${hallCharges}
${selectedMenus ? "Menu Selection:\n" + selectedMenus : ""}
${mealsText ? mealsText : ""}
Amenities: ${amenitiesList}
${gst ? gst : ""}
Grand Total: ₹${lead.grandTotal || 0}
    `);

        // Mobile number (without spaces or symbols)
        const mobile = lead.mobile1.replace(/\D/g, "");
        const whatsappURL = `https://wa.me/${mobile}?text=${message}`;

        window.open(whatsappURL, "_blank");
    }, []);

    useEffect(() => {
        if (location.state?.triggerWhatsApp && !hasSentWhatsApp.current) {
            const savedLead = localStorage.getItem("leadToPrint"); // same storage
            if (savedLead) {
                const lead = JSON.parse(savedLead);
                handleWhatsApp(lead);
                hasSentWhatsApp.current = true; // prevent repeat
            }
            window.history.replaceState({}, document.title);
        }
    }, [location.state, handleWhatsApp]);

    const handleWinFilter = (range) => {
        let [min, max] = range; // e.g., [0, 25]
        const filtered = leads.filter(l => {
            const wp = Number(l.winProbability) || 0;
            return wp >= min && wp <= max;
        });
        setFilteredLeads(filtered);
    };

    const rightRef = useRef(null);

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';

        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';

        // Convert UTC → IST (add 5 hours 30 minutes)
        const utc = date.getTime() + date.getTimezoneOffset() * 60000;
        const ist = new Date(utc + 5.5 * 60 * 60 * 1000);

        const day = String(ist.getDate()).padStart(2, "0");
        const month = String(ist.getMonth() + 1).padStart(2, "0");
        const year = ist.getFullYear();

        return `${day}/${month}/${year}`; // DD-MM-YYYY
    };

    useEffect(() => {
        if (leads.length > 0) {
            const fyList = leads.map(l => {
                if (!l.functionDate) return null;

                const date = new Date(l.functionDate);

                // Convert to IST (using same logic as formatDate)
                const utc = date.getTime() + date.getTimezoneOffset() * 60000;
                const ist = new Date(utc + 5.5 * 60 * 60 * 1000);

                const y = ist.getFullYear();
                const m = ist.getMonth(); // 0 = Jan, 3 = Apr

                return m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
            }).filter(Boolean);

            const currentFY = getCurrentFinancialYear();
            const uniqueFY = [...new Set([...fyList, currentFY])].sort();
            setAvailableFY(uniqueFY);
        }
    }, [leads]);

    useEffect(() => {
        if (availableFY.length > 0 && financialYear === null) {
            setFinancialYear(getCurrentFinancialYear());
        }
    }, [availableFY, financialYear]);

    useEffect(() => {
        if (!from || !to) return;

        // Prevent infinite loop — only update when FY is empty
        if (fy) return;

        const d = new Date(from);
        const m = d.getMonth();
        const y = d.getFullYear();

        const newFY = m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;

        setFilters(f => ({ ...f, fy: newFY }));
    }, [from, to, fy]);

    const handleRefreshPastBookingLeads = async () => {
        try {

            // --- Get today's IST start time ---
            const now = new Date();

            const parts = new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).formatToParts(now);

            let day, month, year;
            parts.forEach(p => {
                if (p.type === "day") day = p.value;
                if (p.type === "month") month = p.value;
                if (p.type === "year") year = p.value;
            });

            const todayIST = new Date(`${year}-${month}-${day}T00:00:00`);

            for (const lead of leads) {
                if (!lead.functionDate) continue;

                const eventDate = new Date(lead.functionDate);

                if (eventDate < todayIST) {
                    const enquiryDateObj = new Date(lead.enquiryDate);

                    const monthNames = [
                        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
                    ];

                    const pastMonthYear =
                        `${monthNames[enquiryDateObj.getMonth()]}${enquiryDateObj.getFullYear()}`;

                    const pastRef = doc(db, "dropLeads", pastMonthYear);
                    const currentRef = doc(db, "bookingLeads", lead.monthYear);

                    // Move to pastBookingLeads
                    await setDoc(
                        pastRef,
                        {
                            [lead.id]: {
                                ...lead,
                                autoMovedAt: new Date(),
                                autoMovedReason: "Event Completed"
                            }
                        },
                        { merge: true }
                    );

                    // Delete from bookingLeads
                    await updateDoc(currentRef, {
                        [lead.id]: deleteField()
                    });

                }
            }

        } catch (error) {
            console.error("❌ Bulk move failed:", error);
        }
    };

    return (
        <>
            <div className="leads-table-container">

                <div className="table-header-bar" style={{ marginTop: '45px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}> <h2 className="leads-header" style={{ margin: 0 }}>📋 Leads</h2> </div>
                </div>

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

                <div style={{ whiteSpace: "nowrap", display: "flex", justifyContent: "end", marginTop: "20px", gap: "15px" }}>
                    <button
                        onClick={handleRefreshPastBookingLeads}
                        style={{
                            padding: "5px 10px",
                            backgroundColor: "#d98a36",
                            color: "white",
                            border: "none",
                            borderRadius: "5px",
                            cursor: "pointer",
                            fontSize: "15px",
                            whiteSpace: "nowrap",
                            marginLeft: "10px"
                        }}
                    >
                        Refresh
                    </button>

                    <button
                        onClick={() => navigate('/bookingLead')}
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
                        Create Lead
                    </button>
                </div>

                <div className="win-prob-legend">
                    <strong>🎯 Lead Win Probability :</strong>
                    <ul style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap', listStyle: 'none', maxWidth: '330px', marginBottom: '0px', padding: '4px 5px', gap: '5px' }}>

                        <li style={{ backgroundColor: '#5ca7b8ff', color: '#000000ff', width: 'fit-content', borderRadius: '6px', cursor: 'pointer', padding: '4px 5px' }} onClick={() => setFilteredLeads(leads)} >
                            All </li>

                        <li style={{ backgroundColor: '#4caf50', color: '#000000ff', width: 'fit-content', borderRadius: '6px', cursor: 'pointer', padding: '4px 5px' }} onClick={() => handleWinFilter([99, 100])} >
                            100% - 99% </li>

                        <li style={{ backgroundColor: '#00bfff', color: '#000000ff', width: 'fit-content', borderRadius: '6px', cursor: 'pointer', padding: '4px 5px' }} onClick={() => handleWinFilter([76, 98])} >
                            98% - 75% </li>

                        <li style={{ backgroundColor: '#ffff30', color: '#000000ff', width: 'fit-content', borderRadius: '6px', cursor: 'pointer', padding: '4px 5px' }} onClick={() => handleWinFilter([51, 75])} >
                            75% - 50%
                        </li>

                        <li style={{ backgroundColor: '#f0ad4e', color: '#000000ff', width: 'fit-content', borderRadius: '6px', cursor: 'pointer', padding: '4px 5px' }} onClick={() => handleWinFilter([26, 50])} >
                            50% - 25%
                        </li>

                        <li style={{ backgroundColor: '#d9534f', color: '#000000ff', width: 'fit-content', borderRadius: '6px', cursor: 'pointer', padding: '4px 5px' }} onClick={() => handleWinFilter([0, 25])} >
                            25% - 0%
                        </li>
                    </ul>
                </div>

                <div className="filters-container">
                    <div className="date-filters">
                        <div className="filter-item">
                            <label>Date From:</label>
                            <input className="filterInput" type="date" value={filters.from} onChange={(e) => setFilters(f => ({ ...f, from: e.target.value }))} />
                        </div>

                        <div className="filter-item">
                            <label>Date To:</label>
                            <input className="filterInput" type="date" value={filters.to} onChange={(e) => setFilters(f => ({ ...f, to: e.target.value }))} />
                        </div>

                        <div className="filter-item">
                            <label>Financial Year:</label>
                            <select className="filterInput" value={filters.fy} onChange={(e) => setFilters(f => ({ ...f, fy: e.target.value }))}>
                                <option value="">All</option>
                                {availableFY.map(fy => <option key={fy} value={fy}>{fy}</option>)}
                            </select>
                        </div>

                        <button
                            className="clear-btnq"
                            onClick={() => {
                                setFilters({
                                    search: "",
                                    from: "",
                                    to: "",
                                    fy: "",
                                    winRange: null,
                                    searchTerm: "",
                                });

                            }}
                        >
                            Clear
                        </button>
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

                <div className="table-fixed-wrapper" ref={rightRef}>
                    <table className="leads-table">
                        <thead>
                            <tr style={{ whiteSpace: 'nowrap' }}>
                                {[
                                    'Sl',
                                ].map(header => (
                                    <th key={header}>{header}</th>
                                ))}

                                <th
                                    onClick={() => handleSort('functionDate')}
                                    style={{ cursor: 'pointer', padding: '4px' }}
                                >
                                    Event Date {sortField === 'functionDate' ? (sortAsc ? '' : '') : ''}
                                </th>

                                {[
                                    'Name'
                                ].map(header => (
                                    <th key={header}>{header}</th>
                                ))}

                                <th onClick={() => handleSort('enquiryDate')} style={{ cursor: 'pointer' }}>
                                    Enquiry Date {sortField === 'enquiryDate' ? (sortAsc ? '' : '') : ''}
                                </th>

                                {[
                                    'Print', 'Month', 'Event', 'Day/Night', 'Venue Type', 'Contact Number',
                                    'Menu', 'Meal', 'Hall Charges', 'GST', 'Applicable GST', 'Grand Total', 'Edit', 'Logs',
                                    'Send to Bookings', 'Extra Booking Amenities', 'Notes', 'Win Probability', 'Hold Up Date',
                                    'Follow Up Date 1', 'Follow Up Date 2', 'Follow Up Date 3', 'Follow Up Date 4',
                                    'Follow Up Date 5', 'Follow Up Date 6', 'Follow Up Date 7', 'Follow Up Date 8', 'Follow Up Date 9', 'Follow Up Date 10',
                                    'Source Of Customer', "Booked By",
                                    'Drop'
                                ].map(header => (
                                    <th key={header}>{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <Tbody
                            leads={currentItems}
                            totalItems={sortedLeads.length}
                            startIndex={startIndex}
                            isEditing={isEditing}
                            editing={editing}
                            handleFieldChange={handleFieldChange}
                            handleEdit={handleEdit}
                            handleDateChange={handleDateChange}
                            startEdit={startEdit}
                            moveLeadToDrop={moveLeadToDrop}
                            handlePrint={handlePrint}
                            sendToPrintAllMeals={sendToPrintAllMeals}
                            // sendToPrintCombined={sendToPrintCombined}
                            handleCancelEdit={handleCancelEdit}
                            formatTime12Hour={formatTime12Hour}
                            tempFollowUps={tempFollowUps}
                            setTempFollowUps={setTempFollowUps}
                        />
                    </table>

                    {/* </div> */}

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
            </div>

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
        </>
    );
};

export default BookingLeadsTable;   