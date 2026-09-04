import React, { useEffect, useState, useRef } from 'react';
import { collection, doc, updateDoc, onSnapshot, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import '../../../styles/BookingLeadsTable.css';
import Tbody from './DroppedTbody';
import BackButton from "../../../components/BackButton";
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import Pagination from '../../../components/Pagination';
import { printHtmlContent, getLeadPdfFileName } from '../../../utils/printHelper';

const BookingLeadsTable = () => {
    const navigate = useNavigate();
    const [leads, setLeads] = useState([]);
    const [filteredLeads, setFilteredLeads] = useState([]);
    const [editingField, setEditingField] = useState({});
    const [editing, setEditing] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [searchTerm, setSearchTerm] = useState("");
    const location = useLocation();
    const [sortField, setSortField] = useState('functionDate');
    const [sortAsc, setSortAsc] = useState(false);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [availableFY, setAvailableFY] = useState([]);
    const [financialYear, setFinancialYear] = useState('');

    const moveLeadToDrop = (leadId, removeOriginal = false, reason = '', monthYear) => {
        try {
            const monthRef = doc(db, "dropLeads", monthYear);

            // Listen to the month document in real-time
            const unsubscribe = onSnapshot(monthRef, async (monthSnap) => {
                if (!monthSnap.exists()) return;

                const monthData = monthSnap.data();
                const leadData = monthData[leadId];
                if (!leadData) return;

                // Determine monthYear for dropLeads based on enquiryDate
                const enquiryDateObj = new Date(leadData.enquiryDate);
                const monthNames = [
                    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
                ];
                const pastMonthYear = `${monthNames[enquiryDateObj.getMonth()]}${enquiryDateObj.getFullYear()}`;
                const pastRef = doc(db, "bookingLeads", pastMonthYear);

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
        const trigger = location.state?.triggerPrint;
        const storedLead = localStorage.getItem('leadToPrint');

        if (trigger && storedLead) {
            setTimeout(() => {
                localStorage.removeItem('leadToPrint');
            }, 300);
        }
    }, [location.state]);

    useEffect(() => {
        // Reference to the "dropLeads" collection
        const dropLeadsRef = collection(db, "dropLeads");

        // Real-time listener
        const unsubscribe = onSnapshot(
            dropLeadsRef,
            (querySnapshot) => {
                let allLeads = [];

                querySnapshot.forEach(docSnap => {
                    const monthData = docSnap.data(); // e.g. { abc123: {...}, xyz456: {...} }
                    const monthLeads = Object.entries(monthData).map(([id, data]) => ({
                        id,
                        ...data,
                        monthYear: docSnap.id,
                    }));
                    allLeads.push(...monthLeads);
                });

                // Sort by createdAt descending
                const sortedData = allLeads.sort((a, b) => {
                    const dateA = a.createdAt?.toDate?.() || new Date(0);
                    const dateB = b.createdAt?.toDate?.() || new Date(0);
                    return dateB - dateA;
                });

                setLeads(sortedData);
                setFilteredLeads(sortedData);
            },
            (error) => {
                console.error("Error fetching dropLeads:", error);
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
        const dateA = new Date(a[sortField]) || new Date(0);
        const dateB = new Date(b[sortField]) || new Date(0);
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

        const updatedFollowUps = [...(lead.followUpDetails || [])];
        updatedFollowUps[index] = { ...updatedFollowUps[index], ...updatedFollowUp }; // merge updates

        try {
            const leadRef = doc(db, "bookingLeads", lead.monthYear);

            // Update only followUpDetails for this lead
            await updateDoc(leadRef, {
                [`${id}.followUpDetails`]: updatedFollowUps
            });

            // Update local state
            setLeads(prev =>
                prev.map(l => l.id === id ? { ...l, followUpDetails: updatedFollowUps } : l)
            );
            setFilteredLeads(prev =>
                prev.map(l => l.id === id ? { ...l, followUpDetails: updatedFollowUps } : l)
            );

            // Close edit mode
            setEditing(prev => ({
                ...prev,
                [id]: { ...prev[id], [index]: false }
            }));
        } catch (err) {
            console.error("Failed to update follow-up:", err);
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
        const term = searchTerm.toLowerCase().replace(/\//g, "-").trim();

        const normalizeDate = (dateStr) => {
            // Firestore se aa raha mostly: YYYY-MM-DD
            // User type kar sakta: DD-MM-YYYY
            if (!dateStr) return "";

            const parts = dateStr.split("-");
            if (parts.length === 3) {
                const [y, m, d] =
                    parts[0].length === 4 ? [parts[0], parts[1], parts[2]] : [parts[2], parts[1], parts[0]];

                // Return dono format
                return [
                    `${d}-${m}-${y}`, // DD-MM-YYYY
                    `${y}-${m}-${d}`, // YYYY-MM-DD
                ];
            }
            return [dateStr];
        };

        const filtered = leads.filter((booking) => {
            return Object.entries(booking).some(([key, val]) => {
                if (typeof val === "string") {
                    const normalizedVal = val.toLowerCase().replace(/\//g, "-");

                    if (key === "functionDate") {
                        // multiple formats se check
                        const dateFormats = normalizeDate(normalizedVal);
                        return dateFormats.some((fmt) => fmt.includes(term));
                    }

                    return normalizedVal.includes(term);
                }
                return false;
            });
        });

        setFilteredLeads(filtered);
    }, [searchTerm, leads]);

    const handlePrint = (lead) => {
        const amenitiesList = (lead.bookingAmenities || [])
            .map(item => `<li style="padding-left:40px">☑ ${item}</li>`)
            .join("");

        const selectedMenus = lead.menuSummaries || [];
        const hall = parseFloat(lead.hallCharges || 0);
        const gstPerMenu = (menu) => {
            const base = parseFloat(menu.gstBase);
            return !isNaN(base) ? (base * 0.18).toFixed(0) : '0';
        };

        const baseRates = {
            "Golden Veg": 1600,
            "Diamond Veg": 1750,
            "Golden Non Veg": 1700,
            "Diamond Non Veg": 1950,
        };

        const menuRows = selectedMenus.map(menu => {
            const menuName = menu.menuName;
            const menuData = lead.selectedMenus?.[menuName] || {};
            const customRate = menuData.rate;
            const baseRate = baseRates[menuName];
            const showStrike = baseRate && Number(customRate) < Number(baseRate);

            return `
    <li style="display: flex; justify-content: space-between; padding-left: 40px; align-items: center; margin-bottom: 4px;">
        <span style="flex: 1;">• ${menuName} :</span>
        <div style="display: flex; gap: 10px; flex: 2; justify-content: flex-end; align-items: flex-end;">
            
            <!-- Rate Column -->
            <div style="display: flex; flex-direction: column; align-items: center;">
                <div style="font-size: 12px; margin-bottom: 2px;">Rate</div>
               <div style="border-bottom: 1px solid #000; width: 100px; text-align: center; color:red">
₹ ${showStrike
                    ? `<span style="text-decoration: line-through;">${Number(baseRate).toLocaleString('en-IN')}</span> 
       <span style="font-weight: bold;">${Number(customRate).toLocaleString('en-IN')}</span>`
                    : Number(customRate || 0).toLocaleString('en-IN')
                }
</div>
            </div>

            <span>X</span>

            <!-- Pax Column -->
            <div style="display: flex; flex-direction: column; align-items: center;">
                <div style="font-size: 12px; margin-bottom: 2px;">Pax</div>
               <div style="border-bottom: 1px solid #000; width: 40px; text-align: center;  color:red">
${Number(menuData.qty || 0).toLocaleString('en-IN')}
</div>
            </div>

            <span>=</span>

            <!-- Total -->
            <div style="display: flex; flex-direction: column; align-items: center;">
                <div style="font-size: 12px; margin-bottom: 2px;">Menu Total</div>
               <div style="border-bottom: 1px solid #000; width: 80px; text-align: center; background-color:yellow; color:red">
₹ ${Number(menu.menuTotal || 0).toLocaleString('en-IN')}
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
                        ? new Date(dayData.date).toLocaleDateString("en-GB")
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

        const mealSection = mealRows && mealRows.trim()
            ? `
            <div class="section">
              <strong>3. Meal Selected</strong>
              <ul>
                ${mealRows}
              </ul>
            </div>
          `
            : '';

        const gstSectionNumber = mealSection ? 4 : 3;

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

        // ✅ Grand total line me +GST hata diya
        const grandTotalLines = selectedMenus.map(menu => {
            const gst = gstPerMenu(menu);
            const total = hall + Number(menu.menuTotal) + Number(gst) + grandMealTotal;

            // agar meals section hai to text me "+ Meals" add karna hai
            const mealsText = mealSection ? " + Meals" : "";

            // agar GST hai to text me "+ GST" add karna hai
            const gstText = lead.gstBase && Number(lead.gstBase) > 0 ? " + GST" : "";

            return `
    <div style="display: flex; justify-content: space-between; margin-top: 4px">
        <span><strong>Grand Total 
          <span style="font-size:14px"> ( Venue Charges + ${menu.menuName} ${gstText} ${mealsText} ) </span> :
        </strong></span>
        <div style="border-bottom: 1px solid #000; width: 180px; text-align: center; background-color:yellow; font-weight:bold; color:red">
        ₹ ${Number(total).toLocaleString('en-IN')}
        </div>
    </div>`;
        }).join("");

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

        const pdfFileName = getLeadPdfFileName(lead, "Booking_Estimate");

        const content = `
    <html>
    <head>
        <title>${pdfFileName}</title>
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

        <div class="section">
            <strong>2. Food Menu Selection</strong>
            <ul>${menuRows}</ul>
        </div>

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

        printHtmlContent(content, pdfFileName);
    };

    const handleWinFilter = (range) => {
        let [min, max] = range; // e.g., [0, 25]
        const filtered = leads.filter(l => {
            const wp = Number(l.winProbability) || 0;
            return wp >= min && wp <= max;
        });
        setFilteredLeads(filtered);
    };

    // ✅ IST-based formatDate function (you already have this)
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

        return `${day}-${month}-${year}`; // DD-MM-YYYY
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

    const getCurrentFinancialYear = () => {
        const today = new Date();

        // Convert UTC → IST (same logic for consistency)
        const utc = today.getTime() + today.getTimezoneOffset() * 60000;
        const ist = new Date(utc + 5.5 * 60 * 60 * 1000);

        const year = ist.getFullYear();
        const month = ist.getMonth() + 1; // 1–12

        return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    };

    useEffect(() => {
        let filtered = [...leads];

        // Utility function: convert any date to IST Date object
        const toIST = (dateStr) => {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return null;

            // Convert UTC → IST (add 5h 30m)
            const utc = date.getTime() + date.getTimezoneOffset() * 60000;
            return new Date(utc + 5.5 * 60 * 60 * 1000);
        };

        // From Date filter
        if (fromDate) {
            const from = toIST(fromDate);
            filtered = filtered.filter(lead => {
                const funcDate = toIST(lead.functionDate);
                return funcDate && funcDate >= from;
            });
        }

        // To Date filter
        if (toDate) {
            const to = toIST(toDate);
            filtered = filtered.filter(lead => {
                const funcDate = toIST(lead.functionDate);
                return funcDate && funcDate <= to;
            });
        }

        // Financial Year filter
        if (financialYear && financialYear !== "") {
            const [startYear, endYear] = financialYear.split("-").map(Number);

            // Define FY boundaries in IST
            const fyStartUTC = Date.UTC(startYear, 3, 1); // April 1
            const fyEndUTC = Date.UTC(endYear, 2, 31, 23, 59, 59); // March 31
            const fyStart = toIST(fyStartUTC);
            const fyEnd = toIST(fyEndUTC);

            filtered = filtered.filter(lead => {
                const funcDate = toIST(lead.functionDate);
                return funcDate && funcDate >= fyStart && funcDate <= fyEnd;
            });
        }

        setFilteredLeads(filtered);
    }, [fromDate, toDate, financialYear, leads]);

    useEffect(() => {
        if (availableFY.length > 0 && financialYear === null) {
            setFinancialYear(getCurrentFinancialYear());
        }
    }, [availableFY, financialYear]);

    const rightRef = useRef(null);

    return (
        <div className="leads-table-container">
            <div style={{ marginBottom: '30px' }}> <BackButton />  </div>
            <div className="table-header-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, textAlign: 'center' }}> <h2 className="leads-header" style={{ margin: 0 }}>Dropped Leads</h2> </div>
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
                        borderRadius: "30px",
                        border: "1px solid #ccc",
                    }}
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '10px 0' }}>
                <button
                    onClick={() => navigate('/bookingLead')}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                    }}
                >
                    Create New Lead
                </button>
            </div>


            <div className="win-prob-legend">
                <strong>🎯 Lead Win Probability :</strong>
                <ul style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap', listStyle: 'none', maxWidth: '330px', marginBottom: '0px', padding: '4px 5px', gap: '5px' }}>

                    <li style={{ backgroundColor: '#5ca7b8ff', color: '#000000ff', width: 'fit-content', borderRadius: '6px', cursor: 'pointer', padding: '4px 5px' }} onClick={() => setFilteredLeads(leads)} >
                        All </li>

                    <li style={{ backgroundColor: '#5cb85c', color: '#000000ff', width: 'fit-content', borderRadius: '6px', cursor: 'pointer', padding: '4px 5px' }} onClick={() => handleWinFilter([76, 100])} >
                        100% - 75% </li>

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
                        <label>From:</label>
                        <input className="filterInput" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                    </div>

                    <div className="filter-item">
                        <label>To:</label>
                        <input className="filterInput" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                    </div>


                    <div className="filter-item">
                        <label>FY Year:</label>
                        <select className="filterInput" value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>
                            <option value="">All</option>
                            {availableFY.map(fy => <option key={fy} value={fy}>{fy}</option>)}
                        </select>
                    </div>

                    <button
                        className="clear-btnq"
                        onClick={() => {
                            setFromDate('');
                            setToDate('');
                            setFinancialYear('');
                            setFilteredLeads(leads);
                        }}
                    >
                        Clear
                    </button>
                </div>

            </div>

            <div style={{ position: 'relative' }}>

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

                <div
                    className="table-scroll-container"
                    id="lead-table-scroll"
                    style={{
                        overflowX: 'auto',
                        scrollBehavior: 'smooth',
                        display: 'flex', gap: '2px'
                    }}
                >

                    {/* table 2 */}
                    <div
                        ref={rightRef}   // ✅ sirf yaha rakha
                        className="table-fixed-wrapper"
                        style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}
                    >
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
                                        style={{ cursor: 'pointer', padding: '0px' }}
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
                                        'Month', 'Event', 'Day/Night', 'Venue Type', 'Contact Number',
                                        'Menu', 'Meal', 'Hall Charges', 'GST', 'Applicable GST', 'Grand Total', 'Edit', 'Logs',
                                        'Send to Bookings', 'Print', 'Extra Booking Amenities', 'Win Probability', 'Hold Up Date',
                                        'Follow Up Date 1', 'Follow Up Date 2', 'Follow Up Date 3', 'Follow Up Date 4',
                                        'Follow Up Date 5', 'Source Of Customer', "Booked By",
                                        'ReStore',
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
                                handlePrint={handlePrint} />
                        </table>
                    </div>
                </div>

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
    );
};

export default BookingLeadsTable; 