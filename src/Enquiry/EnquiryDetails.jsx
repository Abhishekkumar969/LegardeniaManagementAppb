import React, { useEffect, useState, useRef, useCallback } from "react";
import { deleteField, updateDoc, doc, setDoc, collection, onSnapshot, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import "../Book/AllLeads/BookingLeadsTable.css";
import { useNavigate } from "react-router-dom";
import "../styles/FixedTable.css"
import "./EnquiryStats"
import { getAuth } from "firebase/auth";
import LogPopupCell from "../Book/AllLeads/LogPopupCell";
import Pagination from "../components/Pagination";

const EnquiryDetails = () => {
  const [enquiries, setEnquiries] = useState([]);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("enquiryDate");
  const [sortAsc, setSortAsc] = useState(false);
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [availableFY, setAvailableFY] = useState([]);
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
  const [currentUserName, setCurrentUserName] = useState("");
  const [financialYear, setFinancialYear] = useState("");
  const [filteredEnquiries, setFilteredEnquiries] = useState([]);
  const [editing, setEditing] = useState({});
  const [tempFollowUps, setTempFollowUps] = useState({});
  const [whatsappTemplate, setWhatsappTemplate] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshBtn, setShowRefreshBtn] = useState(false);
  const autoRefreshDone = useRef(false);
  const [activeHighlight, setActiveHighlight] = useState(null);
  const [activeSource, setActiveSource] = useState(null);
  const [winFilter, setWinFilter] = useState(null);

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (user) {
      setCurrentUserName(user.name || user.email || "Unknown");
    }
  }, []);

  const formatTime12Hour = (timeStr) => {
    if (!timeStr) return "";

    const [hour, minute] = timeStr.split(":");
    let h = parseInt(hour, 10);

    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12; // 0 -> 12

    return `${h}:${minute} ${ampm}`;
  };

  const matchDateFlexible = (dateStr, search) => {
    if (!dateStr || !search) return false;

    const s = search.trim().toLowerCase().replace(/-/g, "/");

    // Convert original date → exact IST components
    const utc = new Date(dateStr);
    if (isNaN(utc)) return false;

    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(utc);

    let dd = "", mm = "", yyyy = "";
    parts.forEach(p => {
      if (p.type === "day") dd = p.value;
      if (p.type === "month") mm = p.value;
      if (p.type === "year") yyyy = p.value;
    });

    const yy = yyyy.slice(-2);

    const monthShort = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short"
    }).format(utc).toLowerCase();

    const monthLong = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "long"
    }).format(utc).toLowerCase();

    // All formats searchable in IST
    const formats = [
      `${dd}/${mm}/${yyyy}`,
      `${dd}/${mm}/${yy}`,
      `${dd}/${mm}`,
      `${dd}/${monthShort}/${yyyy}`,
      `${dd}/${monthShort}/${yy}`,
      `${monthShort} ${yyyy}`,
      `${monthLong} ${yyyy}`,
      `${mm}/${yyyy}`,
      `${yyyy}`,
      monthShort,
      monthLong,
    ];

    return formats.some(f => f.toLowerCase().includes(s));
  };

  useEffect(() => {
    // Reference to the "enquiry" collection
    const enquiryCollectionRef = collection(db, "enquiry");

    // Set up real-time listener
    const unsubscribe = onSnapshot(enquiryCollectionRef, (querySnapshot) => {
      const enquiriesMap = new Map();

      querySnapshot.forEach((docSnap) => {
        const monthData = docSnap.data(); // e.g. { abc123: {...}, xyz456: {...} }

        Object.entries(monthData).forEach(([fieldId, enquiry]) => {
          enquiriesMap.set(fieldId, {
            id: fieldId,
            monthYear: docSnap.id, // e.g. "Sep2025"
            ...enquiry,
          });
        });
      });

      let allEnquiries = Array.from(enquiriesMap.values());

      // Sort by createdAt descending
      allEnquiries.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB - dateA;
      });

      setEnquiries(allEnquiries);
    }, (error) => {
      console.error("Error listening to enquiries:", error);
    });

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const ref = doc(db, "whatsappMessages", "Enquiry");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setWhatsappTemplate(snap.data().text);
        }
      } catch (e) {
        console.error("WhatsApp template fetch failed", e);
      }
    };

    fetchTemplate();
  }, []);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleWinFilter = (range) => {
    setWinFilter(range);
  };

  const sortedEnquiries = [...filteredEnquiries].sort((a, b) => {
    if (!a[sortField]) return 1;
    if (!b[sortField]) return -1;
    const dateA = new Date(a[sortField]);
    const dateB = new Date(b[sortField]);
    return sortAsc ? dateA - dateB : dateB - dateA;
  });

  // 📅 Get today's IST date (YYYY-MM-DD)
  const now = new Date();

  const istParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  let day, month, year;

  istParts.forEach(p => {
    if (p.type === "day") day = p.value;
    if (p.type === "month") month = p.value;
    if (p.type === "year") year = p.value;
  });

  const todayIST = `${year}-${month}-${day}`;

  const finalEnquiries = sortedEnquiries.filter(enq => {

    if (!activeHighlight) return true;

    const completedCount =
      Array.isArray(enq.followUpDetails)
        ? enq.followUpDetails.filter(f => f?.createdAt).length
        : 0;

    const hasTodayFollowUp =
      Array.isArray(enq.followUpDetails) &&
      enq.followUpDetails.some(f => f?.date === todayIST);

    if (activeHighlight === "today")
      return hasTodayFollowUp;

    if (activeHighlight === "completed")
      return completedCount >= 5;

    if (activeHighlight === "nofollowup")
      return completedCount === 0;

    if (activeHighlight === "all")
      return true;

    return true;
  });

  const totalPages = Math.ceil(finalEnquiries.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = finalEnquiries.slice(startIndex, startIndex + itemsPerPage);

  const buildWhatsappMessage = (enquiry) => {
    if (!whatsappTemplate) return "";

    let msg = whatsappTemplate
      .replace("{name}", enquiry.name || "")
      .replace("{functionDate}", enquiry.functionDate ? formatDate(enquiry.functionDate) : "-")
      .replace("{pax}", enquiry.pax || "")
      .replace("{functionType}", enquiry.functionType || "")
      .replace("{dayNight}", enquiry.dayNight || "");

    // 🧨 REMOVE ONLY "Guest Name" (anywhere, any greeting)
    msg = msg
      .replace(/\bguest\s+name\b/gi, "")
      .replace(/\s{2,}/g, " ")     // extra spaces
      .replace(/,\s*,/g, ",")      // double commas
      .replace(/^,\s*/g, "")       // leading comma
      .trim();

    return msg;
  };

  const handleShareMedia = async (enquiry) => {
    if (!enquiry.mobile1) {
      alert("No mobile number available to share the link.");
      return;
    }

    const message = buildWhatsappMessage(enquiry);

    if (!message.trim()) {
      alert("WhatsApp template not found");
      return;
    }


    let phone = enquiry.mobile1.trim().replace(/\D/g, "");
    if (!phone.startsWith("91")) {
      phone = phone.length === 10 ? "91" + phone : "91" + phone;
    }

    // open WhatsApp
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");

    try {
      // --- Get precise IST components using Intl (no manual offset math) ---
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(now);

      // extract parts reliably
      const map = {};
      for (const p of parts) {
        if (p.type !== "literal") map[p.type] = p.value;
      }
      // map will have: { day, month, year, hour, minute, second }

      const day = map.day;
      const month = map.month;
      const year = map.year;
      const hour = map.hour;
      const minute = map.minute;
      const second = map.second || "00";

      // Human-friendly display (DD-MM-YYYY, HH:MM:SS IST)
      const displayIST = `${day}-${month}-${year}, ${hour}:${minute}:${second} IST`;

      // ISO-like with offset +05:30 (YYYY-MM-DDTHH:MM:SS+05:30)
      const isoIST = `${year}-${month}-${day}T${hour}:${minute}:${second}+05:30`;

      // --- Determine correct month doc from enquiry.enquiryDate (unchanged) ---
      const enquiryDateObj = new Date(enquiry.enquiryDate);
      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];
      const monthYear = `${monthNames[enquiryDateObj.getMonth()]}${enquiryDateObj.getFullYear()}`;
      const monthDocRef = doc(db, "enquiry", monthYear);

      // --- Update Firestore with both forms (safe + queryable) ---
      await setDoc(
        monthDocRef,
        {
          [enquiry.fieldId]: {
            ...enquiry,
            shareMedia: {
              shareMedia: true,
              at: displayIST, // human-readable
            },
            updatedAt: serverTimestamp(),
          }
        },
        { merge: true }
      );

      console.log("✅ shareMedia updated (IST):", displayIST, isoIST);
    } catch (error) {
      console.error("❌ Failed to update shareMedia:", error);
    }
  };

  const rightRef = useRef(null);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`; // DD-MM-YYYY
  };

  useEffect(() => {
    if (enquiries.length > 0) {
      const fyList = enquiries.map(l => {
        const d = new Date(l.functionDate);
        const y = d.getFullYear();
        const m = d.getMonth();
        return m >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
      });

      const currentFY = getCurrentFinancialYear();
      const uniqueFY = [...new Set([...fyList, currentFY])].sort();
      setAvailableFY(uniqueFY);
    }
  }, [enquiries]);

  useEffect(() => {
    if (!enquiries.length) return;

    const now = new Date();

    const istParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    let day, month, year;
    istParts.forEach(p => {
      if (p.type === "day") day = p.value;
      if (p.type === "month") month = p.value;
      if (p.type === "year") year = p.value;
    });

    const todayIST = new Date(`${year}-${month}-${day}T00:00:00`);

    const hasOld = enquiries.some(enq => {
      if (!enq.functionDate) return false;
      return new Date(enq.functionDate) < todayIST;
    });

    setShowRefreshBtn(hasOld);

  }, [enquiries]);

  useEffect(() => {
    if (availableFY.length > 0 && financialYear === null) {
      setFinancialYear(getCurrentFinancialYear());
    }
  }, [availableFY, financialYear]);

  const moveLeadToDrop = (leadId, removeOriginal = false, reason = '', monthYear) => {
    try {
      const monthRef = doc(db, "enquiry", monthYear);

      // Listen to the month document in real-time
      const unsubscribe = onSnapshot(monthRef, async (monthSnap) => {
        if (!monthSnap.exists()) return;

        const monthData = monthSnap.data();
        const leadData = monthData[leadId];
        if (!leadData) return;

        // Determine monthYear for pastEnquiry based on enquiryDate
        const enquiryDateObj = new Date(leadData.enquiryDate);
        const monthNames = [
          "Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];
        const pastMonthYear = `${monthNames[enquiryDateObj.getMonth()]}${enquiryDateObj.getFullYear()}`;
        const pastRef = doc(db, "pastEnquiry", pastMonthYear);

        // Move lead to pastEnquiry
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

  const handleDropClick = async (lead) => {
    const reason = window.prompt("Enter drop reason for this lead:");
    if (!reason) return;

    if (!lead.enquiryDate) {
      alert("Lead has no enquiryDate!");
      return;
    }

    const date = new Date(lead.enquiryDate);
    if (isNaN(date)) {
      alert("Invalid enquiryDate!");
      return;
    }

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthYear = `${monthNames[date.getMonth()]}${date.getFullYear()}`;

    await moveLeadToDrop(lead.id, true, reason, monthYear);
  };

  const handleEdit = (enquiryId, index) => {
    setEditing(prev => ({
      ...prev,
      [enquiryId]: { ...prev[enquiryId], [index]: true },
    }));
  };

  const setTempFollowUp = (enquiryId, index, value) => {
    setTempFollowUps(prev => ({
      ...prev,
      [enquiryId]: {
        ...prev[enquiryId],
        [index]: { ...prev[enquiryId]?.[index], ...value },
      },
    }));
  };

  const getTempFollowUp = (enquiryId, index) => tempFollowUps[enquiryId]?.[index] || {};

  const handleDateChange = async (enquiryId, index, newData) => {
    try {
      const enquiry = enquiries.find(e => e.id === enquiryId);
      if (!enquiry) return;

      const updatedFollowUps = Array.isArray(enquiry.followUpDetails)
        ? [...enquiry.followUpDetails]
        : [];

      if (!newData.date && !newData.remark && !newData.time) {
        updatedFollowUps[index] = {};
      } else {

        const now = new Date();

        const createdAt = new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "numeric",
          month: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hour12: true
        }).format(now);

        updatedFollowUps[index] = {
          ...(updatedFollowUps[index] || {}),
          ...newData,
          createdAt: createdAt,
          by: currentUserName
        };
      }

      const monthRef = doc(db, "enquiry", enquiry.monthYear);

      await updateDoc(monthRef, {
        [`${enquiryId}.followUpDetails`]: updatedFollowUps,
      });

      console.log(`✅ Follow-up ${index + 1} updated for ${enquiry.name}`);

      // Reset edit mode after save
      setEditing(prev => ({
        ...prev,
        [enquiryId]: { ...prev[enquiryId], [index]: false },
      }));
    } catch (error) {
      console.error("❌ Error updating follow-up:", error);
    }
  };

  useEffect(() => {
    let data = [...enquiries];

    // ⭐ UNIVERSAL SEARCH (ALL FIELDS + IST DATE SEARCH)
    if (search.trim() !== "") {
      const t = search.toLowerCase();

      data = data.filter(enq => {
        // Search in ANY string/number field
        const plainMatch = Object.values(enq).some(v =>
          String(v || "").toLowerCase().includes(t)
        );

        if (plainMatch) return true;

        // Search in functionDate & enquiryDate with IST flexibility
        return (
          matchDateFlexible(enq.functionDate, t) ||
          matchDateFlexible(enq.enquiryDate, t)
        );
      });
    }

    // --- From Date ---
    if (fromDate) {
      const f = new Date(fromDate);
      data = data.filter(enq => new Date(enq.functionDate) >= f);
    }

    // --- To Date ---
    if (toDate) {
      const t = new Date(toDate);
      data = data.filter(enq => new Date(enq.functionDate) <= t);
    }

    // --- Financial Year ---
    if (financialYear) {
      const [y1, y2] = financialYear.split("-").map(Number);
      const fyStart = new Date(y1, 3, 1);  // 1 Apr
      const fyEnd = new Date(y2, 2, 31, 23, 59, 59); // 31 Mar

      data = data.filter(enq => {
        const d = new Date(enq.functionDate);
        return d >= fyStart && d <= fyEnd;
      });
    }

    // --- Sorting ---
    data.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (!valA && !valB) return 0;
      if (!valA) return 1;
      if (!valB) return -1;

      const A = new Date(valA);
      const B = new Date(valB);

      if (isNaN(A) && isNaN(B)) return 0;
      if (isNaN(A)) return 1;
      if (isNaN(B)) return -1;

      return sortAsc ? A - B : B - A;
    });

    // --- Source Filter ---
    if (activeSource) {
      data = data.filter(enq =>
        (enq.source?.trim() || "Unknown") === activeSource
      );
    }

    // --- Win Probability Filter ---
    if (winFilter) {
      const [min, max] = winFilter;

      data = data.filter(enq => {
        const prob = Number(enq.winProbability || 0);
        return prob >= min && prob <= max;
      });
    }

    setFilteredEnquiries(data);
  }, [search, fromDate, toDate, financialYear, winFilter, sortField, sortAsc, enquiries, activeSource]);

  const handleRefreshPastEnquiry = useCallback(async () => {
    try {
      setIsRefreshing(true);

      const now = new Date();

      const istParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);

      let day, month, year;
      istParts.forEach(p => {
        if (p.type === "day") day = p.value;
        if (p.type === "month") month = p.value;
        if (p.type === "year") year = p.value;
      });

      const todayIST = new Date(`${year}-${month}-${day}T00:00:00`);

      for (const enq of enquiries) {
        if (!enq.functionDate) continue;

        const eventDate = new Date(enq.functionDate);

        if (eventDate < todayIST) {

          const enquiryDateObj = new Date(enq.enquiryDate);
          const monthNames = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
          ];

          const pastMonthYear =
            `${monthNames[enquiryDateObj.getMonth()]}${enquiryDateObj.getFullYear()}`;

          const pastRef = doc(db, "pastEnquiry", pastMonthYear);
          const currentRef = doc(db, "enquiry", enq.monthYear);

          await setDoc(
            pastRef,
            {
              [enq.id]: {
                ...enq,
                autoMovedAt: serverTimestamp(),
                autoMovedReason: "Expired Enquiry"
              }
            },
            { merge: true }
          );

          await updateDoc(currentRef, {
            [enq.id]: deleteField()
          });
        }
      }

    } catch (error) {
      console.error("❌ Bulk move failed:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [enquiries]);

  useEffect(() => {
    if (showRefreshBtn && !autoRefreshDone.current) {
      autoRefreshDone.current = true;
      handleRefreshPastEnquiry();
    }
  }, [showRefreshBtn, handleRefreshPastEnquiry]);

  const totalEnquiryCount = finalEnquiries.length;

  // 🎯 Total Possible FollowUps (Each enquiry max 5)
  const totalPossibleFollowUps = totalEnquiryCount * 5;

  // ✅ Total Completed FollowUps (All enquiries combined)
  const totalCompletedFollowUps = finalEnquiries.reduce((sum, enq) => {
    if (!Array.isArray(enq.followUpDetails)) return sum;

    return sum + enq.followUpDetails.filter(f => f?.createdAt).length;
  }, 0);

  // 🎯 Today's FollowUps Count
  const todayFollowUpCount = finalEnquiries.reduce((sum, enq) => {
    if (!Array.isArray(enq.followUpDetails)) return sum;

    return sum + enq.followUpDetails.filter(f =>
      f?.date === todayIST
    ).length;

  }, 0);

  // 🎯 Fully Completed Enquiries (5/5 followups done)
  const totalFullyCompletedEnquiries = finalEnquiries.reduce((sum, enq) => {
    if (!Array.isArray(enq.followUpDetails)) return sum;

    const completedCount = enq.followUpDetails.filter(f => f?.createdAt).length;

    return completedCount >= 5 ? sum + 1 : sum;
  }, 0);

  const handleCancelEdit = (enquiryId, index) => {
    setEditing(prev => ({
      ...prev,
      [enquiryId]: {
        ...prev[enquiryId],
        [index]: false
      }
    }));

    // temp data bhi clear kar dete hain
    setTempFollowUps(prev => ({
      ...prev,
      [enquiryId]: {
        ...prev[enquiryId],
        [index]: {}
      }
    }));
  };

  // 🎯 Source Wise Count
  const sourceCounts = finalEnquiries.reduce((acc, enq) => {
    const source = enq.source?.trim() || "Unknown";

    acc[source] = (acc[source] || 0) + 1;

    return acc;
  }, {});

  const getWinProbabilityColor = (prob) => {
    const p = Number(prob || 0);

    if (p >= 100) return "#76fe76";
    if (p >= 74) return "#a1e7ff";
    if (p >= 49) return "#fdf279";
    if (p >= 24) return "#fdc279";
    if (p > 0) return "#fd7575";

    return null;
  };

  return (
    <div className="leads-table-container" >

      <h2 className="leads-header" style={{ marginTop: '45px' }}>Enquiry</h2>

      <input type="text"
        placeholder="Search by name, mobile, function type, date..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="booking-input"
        style={{
          width: "100%",
          marginBottom: "0px",
          padding: "8px",
          border: "1px solid #57a2d9",
          borderRadius: "6px",
        }}
      />

      <div style={{ display: 'flex', margin: "15px 0px", justifyContent: "end" }}>

        {showRefreshBtn && (
          <button
            onClick={handleRefreshPastEnquiry}
            disabled={isRefreshing}
            style={{
              padding: "5px 10px",
              backgroundColor: "#d98a36",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: isRefreshing ? "not-allowed" : "pointer",
              fontSize: "15px",
              marginLeft: "10px",
              opacity: isRefreshing ? 0.7 : 1
            }}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        )}

        <button
          onClick={() => navigate('/enquiryForm')}
          style={{
            padding: "5px 10px",
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '15px',
            whiteSpace: "nowrap",

          }}
        >
          Create Enquiry
        </button>

      </div>

      {/* 📊 Source Wise Stats */}
      <div style={{
        display: "flex",
        gap: "15px",
        margin: "10px 0px",
        flexWrap: "wrap"
      }}>

        {Object.entries(sourceCounts)
          .sort((a, b) => b[1] - a[1]) // 🔥 decreasing order by count
          .map(([source, count]) => {

            const isActive = activeSource === source;

            return (
              <div
                key={source}
                onClick={() =>
                  setActiveSource(prev => prev === source ? null : source)
                }
                style={{
                  ...statBoxStyle("#20ac99"),
                  cursor: "pointer",
                  transform: isActive ? "scale(1.05)" : "scale(1)",
                  transition: "0.2s ease",
                  backgroundColor: isActive ? "#0d8b7d" : "#20ac99"
                }}
              >
                {source}: <strong>{count}</strong>
              </div>
            );
          })}
      </div>

      {/* 📊 FollowUp Stats */}
      <div style={{
        display: "flex",
        gap: "20px",
        margin: "15px 0px",
        flexWrap: "wrap"
      }}>

        <div
          onClick={() => setActiveHighlight(prev => prev === "all" ? null : "all")}
          style={{
            ...statBoxStyle("#2196F3"),
            cursor: "pointer",
            transform: activeHighlight === "all" ? "scale(1.05)" : "scale(1)",
            transition: "0.2s ease"
          }}

        >
          Total Enquiry: <strong>{totalEnquiryCount}</strong>
        </div>

        <div
          onClick={() => setActiveHighlight(prev => prev === "nofollowup" ? null : "nofollowup")}
          style={{
            ...statBoxStyle("#f44336"),
            cursor: "pointer",
            transform: activeHighlight === "nofollowup" ? "scale(1.05)" : "scale(1)",
            transition: "0.2s ease"
          }}
        >
          No FollowUp: <strong>{totalPossibleFollowUps - totalCompletedFollowUps} / {totalPossibleFollowUps}</strong>
        </div>

        <div
          onClick={() => setActiveHighlight(prev => prev === "today" ? null : "today")}
          style={{
            ...statBoxStyle("#ff9800"),
            cursor: "pointer",
            transform: activeHighlight === "today" ? "scale(1.05)" : "scale(1)",
            transition: "0.2s ease"
          }}
        >
          Today FollowUp: <strong>{todayFollowUpCount}</strong>
        </div>

        <div
          onClick={() => setActiveHighlight(prev => prev === "completed" ? null : "completed")}
          style={{
            ...statBoxStyle("#4CAF50"),
            cursor: "pointer",
            transform: activeHighlight === "completed" ? "scale(1.05)" : "scale(1)",
            transition: "0.2s ease"
          }}
        >
          Fully Completed (5/5): <strong>{totalFullyCompletedEnquiries}</strong>
        </div>

      </div>

      <div className="win-prob-legend">
        <strong>🎯 Lead Win Probability :</strong>
        <ul style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap', listStyle: 'none', maxWidth: '330px', marginBottom: '0px', padding: '4px 5px', gap: '5px' }}>

          <li
            style={{ backgroundColor: '#5ca7b8ff', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer' }}
            onClick={() => setWinFilter(null)}
          >
            All
          </li>

          <li
            style={{ backgroundColor: '#5cb85c', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer' }}
            onClick={() => handleWinFilter([99, 100])}
          >
            100% - 99%
          </li>

          <li
            style={{ backgroundColor: '#a1e7ff', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer' }}
            onClick={() => handleWinFilter([76, 98])}
          >
            98% - 75%
          </li>

          <li
            style={{ backgroundColor: '#ffff30', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer' }}
            onClick={() => handleWinFilter([51, 75])}
          >
            75% - 50%
          </li>

          <li
            style={{ backgroundColor: '#f0ad4e', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer' }}
            onClick={() => handleWinFilter([26, 50])}
          >
            50% - 25%
          </li>

          <li
            style={{ backgroundColor: '#d9534f', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer' }}
            onClick={() => handleWinFilter([0, 25])}
          >
            25% - 0%
          </li>
        </ul>
      </div>

      <div className="filters-container">
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
            <select className="filterInput" value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>
              <option value="">All</option>
              {availableFY.map(fy => <option key={fy} value={fy}>{fy}</option>)}
            </select>
          </div>

          <button
            className="clear-btnq"
            onClick={() => {
              setSearch('');
              setFromDate('');
              setToDate('');
              setFinancialYear('');
              setActiveHighlight(null);
              setActiveSource(null);
              setWinFilter(null);
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

      {/* Table */}
      <div className="table-fixed-wrapper" ref={rightRef}>
        <table className="leads-table">
          <thead>
            <tr style={{ whiteSpace: "nowrap" }}>
              <th>Sl</th>

              <th onClick={() => handleSort("functionDate")} style={{ cursor: "pointer", padding: '4px' }}>
                Event Date {sortField === "functionDate" ? (sortAsc ? "" : "") : ""}
              </th>

              <th>Name</th>
              <th
                onClick={() => handleSort("enquiryDate")}
                style={{ cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Enquiry Date {sortField === "enquiryDate" ? (sortAsc ? "" : "") : ""}
              </th>
              <th>Mobile</th>
              <th>Email</th>
              <th>Pax</th>
              <th>Function Type</th>
              <th>Notes</th>
              <th>Day/Night</th>
              {/* <th>Share Media</th> */}
              <th>Edit</th>
              <th>Convert To Lead</th>
              <th>Send To Bookings</th>
              <th>Share Media</th>
              <th>Logs</th>

              {[
                'Follow Up Date 1', 'Follow Up Date 2', 'Follow Up Date 3', 'Follow Up Date 4',
                'Follow Up Date 5'
                // 'Drop',
              ].map(header => (
                <th key={header}>{header}</th>
              ))}

              <th>Source</th>
              <th>Win Probability</th>
              <th>Drop</th>
            </tr>
          </thead>

          <tbody>
            {currentItems.map((enq, index) => {

              const hasTodayFollowUp =
                Array.isArray(enq.followUpDetails) &&
                enq.followUpDetails.some(f => f?.date === todayIST);

              const completedCount =
                Array.isArray(enq.followUpDetails)
                  ? enq.followUpDetails.filter(f => f?.createdAt).length
                  : 0;

              const isFullyCompleted = completedCount >= 5;

              const winBg = getWinProbabilityColor(enq.winProbability);

              const rowBg =
                activeHighlight === "today" && hasTodayFollowUp
                  ? "#ffdaa4"
                  : activeHighlight === "completed" && isFullyCompleted
                    ? "#4CAF50"
                    : activeHighlight === "nofollowup" && completedCount === 0
                      ? "#ffc8c8"
                      : activeHighlight === "all"
                        ? "#d1eaff"
                        : winBg || (index % 2 === 0 ? "#ffffff" : "#eaf4ff");

              return (
                <tr
                  key={enq.id}
                  style={{
                    backgroundColor: rowBg,
                    transition: "0.3s ease"
                  }}
                >
                  <td style={{ backgroundColor: rowBg }}>
                    {finalEnquiries.length - startIndex - index}.
                  </td>

                  <td style={{ backgroundColor: rowBg }} >
                    <div style={{ display: "flex", flexDirection: "column" }}>

                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontSize: '15px',
                          fontWeight: "700",
                        }}
                      >{formatDate(enq.functionDate)}</span>

                      {(() => {

                        const followUps = Array.isArray(enq.followUpDetails)
                          ? enq.followUpDetails.filter(f => f?.createdAt)
                          : [];

                        const completed = followUps.length;

                        // ✅ If 5 completed → ONLY show buttons
                        if (completed >= 5) {
                          return (
                            <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                              <button
                                style={{
                                  backgroundColor: "#4CAF50",
                                  color: "white",
                                  border: "none",
                                  padding: "4px 6px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  cursor: "pointer"
                                }}
                                onClick={() => navigate("/BookingLead", { state: { enquiry: enq } })}
                              >
                                Send to Lead
                              </button>

                              <button
                                style={{
                                  backgroundColor: "#FF9800",
                                  color: "white",
                                  border: "none",
                                  padding: "4px 6px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  cursor: "pointer"
                                }}
                                onClick={() => navigate("/booking", { state: { enquiry: enq, sourceDoc: enq.monthYear } })}
                              >
                                Send to Booking
                              </button>
                            </div>
                          );
                        }

                        // ⭐ If 1–4 followups → show stars
                        if (completed > 0) {
                          return (
                            <div style={{ display: "flex", gap: "2px", marginTop: "4px" }}>
                              {[...Array(5)].map((_, i) => (
                                <span
                                  key={i}
                                  style={{
                                    color: i < completed ? "#ffb700" : "#ccc",
                                    fontSize: "16px"
                                  }}
                                >
                                  ★
                                </span>
                              ))}
                            </div>
                          );
                        }

                        // 🟢 If no followup → show NEW
                        return (
                          <span
                            style={{
                              backgroundColor: "#4CAF50",
                              color: "white",
                              fontSize: "10px",
                              padding: "2px 6px",
                              borderRadius: "10px",
                              width: "fit-content",
                              marginTop: "4px",
                              fontWeight: "600"
                            }}
                          >
                            NEW
                          </span>
                        );

                      })()}

                    </div>
                  </td>

                  <td
                    style={{
                      backgroundColor: rowBg
                    }}
                  >
                    {`${enq.prefix || ''} ${enq.name || '-'}`.trim()}
                  </td>

                  <td style={{ backgroundColor: rowBg }}>{formatDate(enq.enquiryDate)}</td>

                  <td style={{ fontWeight: '700', backgroundColor: rowBg }}>
                    {enq.mobile1 ? (
                      <a href={`tel:${enq.mobile1}`} style={{ color: '#000000', textDecoration: 'none' }}>
                        {enq.mobile1}
                      </a>
                    ) : " "}
                    <div style={{ marginTop: '5px' }}>
                      {enq.mobile2 ? (
                        <a href={`tel:${enq.mobile2}`} style={{ color: '#000000', textDecoration: 'none' }}>
                          {enq.mobile2}
                        </a>
                      ) : " "}
                    </div>
                  </td>

                  <td style={{ backgroundColor: rowBg }}>{enq.email}</td>

                  <td style={{ backgroundColor: rowBg }}>{enq.pax}</td>

                  <td style={{ backgroundColor: rowBg }}>{enq.functionType}</td>

                  <td style={{ backgroundColor: rowBg }}>{enq.note}</td>

                  <td style={{ backgroundColor: rowBg }}>{enq.dayNight}</td>

                  <td style={{ backgroundColor: rowBg }}>
                    <button
                      className="printBtnMeal"
                      onClick={() => navigate("/EnquiryForm", { state: { enquiry: enq } })}
                    >
                      <div style={{ fontSize: '21px' }} >✏️</div>
                    </button>
                  </td>

                  <td style={{ backgroundColor: rowBg }}>
                    <button
                      className="booking-btn"
                      style={{ backgroundColor: "#4CAF50", marginLeft: "5px", color: "white" }}
                      onClick={() => {
                        // 👉 only navigate, do not delete yet
                        navigate("/BookingLead", { state: { enquiry: { ...enq, enquiryDate: todayIST } } });
                      }}
                    >
                      Convert to Lead
                    </button>

                  </td>

                  <td style={{ backgroundColor: rowBg }}>
                    <button
                      className="booking-btn"
                      style={{ backgroundColor: "#FF9800", marginLeft: "5px", color: "white" }}
                      onClick={() => {
                        // 👉 only navigate, do not delete yet
                        navigate("/booking", { state: { enquiry: { ...enq, enquiryDate: todayIST }, sourceDoc: enq.monthYear } });
                      }}
                    >
                      Send to Bookings
                    </button>
                  </td>

                  <td style={{ backgroundColor: rowBg }}>
                    <div style={{ height: "max-content" }}>

                      <button
                        className="booking-btn"
                        style={{ backgroundColor: "#2196F3", color: "white" }}
                        onClick={() => handleShareMedia(enq)}
                      >
                        Share Media
                      </button>

                      <div style={{ color: enq.shareMedia?.shareMedia ? "green" : "red" }}>
                        {enq.shareMedia?.shareMedia ? (
                          <div style={{ marginTop: "5px" }}>
                            <strong>Media Shared</strong>
                            {enq.shareMedia?.at && (
                              <div style={{ color: "#555", fontSize: "12px" }}>
                                {(() => {
                                  try {
                                    const raw = enq.shareMedia.at.trim();

                                    const match = raw.match(
                                      /(\d{2})[/-](\d{2})[/-](\d{4}),?\s*(\d{2}):(\d{2}):?(\d{2})?/
                                    );

                                    if (!match) return `🕒 at ${raw}`;

                                    const [, day, month, year, hour, minute, second] = match.map(Number);

                                    const utcDate = new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30, second || 0));

                                    const options = {
                                      timeZone: "Asia/Kolkata",
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: true,
                                    };

                                    const formattedIST = new Intl.DateTimeFormat("en-IN", options).format(utcDate);

                                    return <>🕒 {formattedIST}</>;
                                  } catch (err) {
                                    console.error("IST Parse Error:", err);
                                    return `🕒 at ${enq.shareMedia.at}`;
                                  }
                                })()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginTop: "5px" }}>
                            Media Not Shared
                          </div>
                        )}
                      </div>

                    </div>
                  </td>

                  <td style={{ backgroundColor: rowBg, textAlign: "center" }}>
                    <LogPopupCell lead={enq} />
                  </td>

                  {[0, 1, 2, 3, 4].map(index => {
                    const followUp = enq.followUpDetails?.[index] || {};
                    const isActive = editing[enq.id]?.[index];

                    const prevFollowUp = enq.followUpDetails?.[index - 1];
                    const canAdd = index === 0 || prevFollowUp?.createdAt;

                    return (
                      <td
                        key={`${enq.id}-followup-${index}`}
                        style={{
                          verticalAlign: "top",
                          overflow: "hidden",
                          backgroundColor: rowBg
                        }}
                      >

                        {isActive ? (

                          /* ================= EDIT MODE ================= */
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>

                            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                              <label style={{ fontSize: "12px" }}>Next FollowUp Date:</label>
                              <input
                                type="date"
                                value={getTempFollowUp(enq.id, index).date ?? followUp.date ?? ''}
                                onChange={(e) =>
                                  setTempFollowUp(enq.id, index, { date: e.target.value })
                                }
                                style={{ flex: 1, padding: "4px", borderRadius: "4px" }}
                              />
                            </div>

                            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                              <label style={{ fontSize: "12px" }}>Next FollowUp Time:</label>
                              <input
                                type="time"
                                value={getTempFollowUp(enq.id, index).time ?? followUp.time ?? ''}
                                onChange={(e) =>
                                  setTempFollowUp(enq.id, index, { time: e.target.value })
                                }
                                style={{ flex: 1, padding: "4px", borderRadius: "4px" }}
                              />
                            </div>

                            <textarea
                              placeholder="Remark"
                              value={getTempFollowUp(enq.id, index).remark ?? followUp.remark ?? ''}
                              onChange={(e) =>
                                setTempFollowUp(enq.id, index, { remark: e.target.value })
                              }
                              style={{
                                width: "100%",
                                padding: "4px",
                                borderRadius: "4px",
                                minHeight: "60px"
                              }}
                            />

                            <div style={{ display: "flex", gap: "6px" }}>
                              <button
                                style={{
                                  backgroundColor: "#4CAF50",
                                  color: "white",
                                  border: "none",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  cursor: "pointer"
                                }}
                                onClick={() => {
                                  const update = {
                                    ...followUp,
                                    ...getTempFollowUp(enq.id, index)
                                  };
                                  handleDateChange(enq.id, index, update);
                                }}
                              >
                                Save
                              </button>

                              <button
                                style={{
                                  backgroundColor: "#f44336",
                                  color: "white",
                                  border: "none",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  cursor: "pointer"
                                }}
                                onClick={() => handleDateChange(enq.id, index, {})}
                              >
                                Clear
                              </button>

                              {/* CANCEL */}
                              <button
                                style={{
                                  backgroundColor: "#fe6663",
                                  color: "white",
                                  border: "none",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  cursor: "pointer"
                                }}
                                onClick={() => handleCancelEdit(enq.id, index)}
                              >
                                Cancel
                              </button>

                            </div>
                          </div>

                        ) : (

                          /* ================= VIEW MODE ================= */
                          <div style={{ padding: "6px" }}>

                            {followUp.date ? (
                              <>
                                <div style={{ fontSize: "13px", fontWeight: 600 }}>
                                  Next followUp: {formatDate(followUp.date)} {followUp.time && ` at ${formatTime12Hour(followUp.time)}`}
                                </div>

                                {followUp.remark && (
                                  <div style={{
                                    marginTop: "4px",
                                    fontSize: "12px",
                                    wordBreak: "break-word",
                                    whiteSpace: "normal",
                                    overflowWrap: "anywhere",
                                    maxWidth: "200px"
                                  }}>
                                    Remark: {followUp.remark}
                                  </div>
                                )}

                                {followUp.createdAt && (
                                  <div style={{ marginTop: "4px", fontSize: "11px", color: "gray" }}>
                                    From: {followUp.by}, <div> {followUp.createdAt} </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div style={{ fontSize: "12px", color: "#888" }}>
                                No FollowUp
                              </div>
                            )}

                            {/* 🔥 EDIT BUTTON */}
                            {canAdd && (
                              <div style={{ marginTop: "6px" }}>
                                <button
                                  style={{
                                    backgroundColor: "#2196F3",
                                    color: "white",
                                    border: "none",
                                    padding: "3px 6px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    cursor: "pointer"
                                  }}
                                  onClick={() => handleEdit(enq.id, index)}
                                >
                                  {followUp.date ? "Edit" : "+ Add"}
                                </button>
                              </div>
                            )}

                          </div>

                        )}

                      </td>
                    );
                  })}

                  <td style={{ backgroundColor: rowBg }}>{enq.source}
                    <div style={{ color: "gray", fontSize: "13px" }}> {enq.referredBy} </div>
                  </td>

                  <td style={{ backgroundColor: rowBg }}>{enq.winProbability}</td>

                  <td style={{ backgroundColor: rowBg }}>
                    <button
                      style={{
                        backgroundColor: "#fb4747ff",
                        color: "white",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        border: '2px solid white',
                        boxShadow: '2px 2px 4px #030303ff'
                      }}
                      onClick={() => handleDropClick(enq)}
                    >
                      Drop
                    </button>
                  </td>

                </tr>
              )
            })}
          </tbody>
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
    </div>
  );

};

export default EnquiryDetails;

const statBoxStyle = (color) => ({
  backgroundColor: color,
  color: "white",
  padding: "6px 12px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "500",
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
});
