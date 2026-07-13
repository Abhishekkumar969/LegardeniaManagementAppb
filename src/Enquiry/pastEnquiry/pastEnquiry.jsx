import React, { useEffect, useState, useRef } from "react";
import { updateDoc, deleteField, doc, setDoc, collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import "../../Book/AllLeads/BookingLeadsTable.css";
import { useNavigate } from "react-router-dom";
import BackButton from "../../components/BackButton";
import Pagination from "../../components/Pagination";

const PastEnquiry = () => {
  const [enquiries, setEnquiries] = useState([]);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("functionDate");
  const [sortAsc, setSortAsc] = useState(false);
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [availableFY, setAvailableFY] = useState([]);
  const [financialYear, setFinancialYear] = useState('');
  const [filteredEnquiries, setFilteredEnquiries] = useState([]);
  const [activeHighlight, setActiveHighlight] = useState(null);
  const [activeSource, setActiveSource] = useState(null);
  const [winFilter, setWinFilter] = useState(null);

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

  useEffect(() => {
    // Reference to the "pastEnquiry" collection
    const pastEnquiryRef = collection(db, "pastEnquiry");

    // Real-time listener
    const unsubscribe = onSnapshot(
      pastEnquiryRef,
      (querySnapshot) => {
        let allEnquiries = [];

        querySnapshot.forEach((docSnap) => {
          const monthData = docSnap.data(); // e.g. { abc123: {...}, xyz456: {...} }

          Object.entries(monthData).forEach(([fieldId, enquiry]) => {
            allEnquiries.push({
              id: fieldId,
              monthYear: docSnap.id, // e.g. "Sep2025"
              ...enquiry,
            });
          });
        });

        // Sort by createdAt descending
        allEnquiries.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB - dateA;
        });

        setEnquiries(allEnquiries);
      },
      (error) => {
        console.error("Error listening to past enquiries:", error);
      }
    );

    // Cleanup on unmount
    return () => unsubscribe();
  }, []);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
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
      const A = new Date(a[sortField]);
      const B = new Date(b[sortField]);
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

  const rightRef = useRef(null);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${day}-${month}-${year}`; // DD-MM-YYYY
  };

  const formatDateTimeIST = (timestamp) => {
    if (!timestamp) return "-";

    let date;

    if (timestamp?.toDate) {
      date = timestamp.toDate();
    } else {
      date = new Date(timestamp);
    }

    if (isNaN(date.getTime())) return "-";

    // Convert UTC → IST
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 5.5 * 60 * 60 * 1000);

    const day = String(ist.getDate()).padStart(2, "0");
    const month = String(ist.getMonth() + 1).padStart(2, "0");
    const year = ist.getFullYear();

    let hours = ist.getHours();
    const minutes = String(ist.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    return `${day}-${month}-${year} ${hours}:${minutes} ${ampm}`;
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
    let filtered = [...enquiries]; // was leads

    // From Date filter
    if (fromDate) {
      filtered = filtered.filter(lead =>
        lead.functionDate && new Date(lead.functionDate) >= new Date(fromDate)
      );
    }

    // To Date filter
    if (toDate) {
      filtered = filtered.filter(lead =>
        lead.functionDate && new Date(lead.functionDate) <= new Date(toDate)
      );
    }

    // Financial Year filter
    if (financialYear && financialYear !== "") {
      const [startYear, endYear] = financialYear.split("-").map(Number);
      const fyStart = new Date(Date.UTC(startYear, 3, 1));
      const fyEnd = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59));

      filtered = filtered.filter(lead => {
        const date = new Date(lead.functionDate);
        return date >= fyStart && date <= fyEnd;
      });
    }

    setFilteredEnquiries(filtered); // was setFilteredLeads
  }, [fromDate, toDate, financialYear, enquiries]);

  useEffect(() => {
    if (availableFY.length > 0 && financialYear === null) {
      setFinancialYear(getCurrentFinancialYear());
    }
  }, [availableFY, financialYear]);

  const sortedEnquiries = [...filteredEnquiries].sort((a, b) => {
    if (!a[sortField]) return 1;
    if (!b[sortField]) return -1;
    const dateA = new Date(a[sortField]);
    const dateB = new Date(b[sortField]);
    return sortAsc ? dateA - dateB : dateB - dateA;
  });

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

  const moveLeadTounDrop = (leadId, removeOriginal = false, reason = '', monthYear) => {
    try {
      const monthRef = doc(db, "pastEnquiry", monthYear);

      // Real-time listener on the pastEnquiry document
      const unsubscribe = onSnapshot(monthRef, async (monthSnap) => {
        if (!monthSnap.exists()) return;

        const monthData = monthSnap.data();
        const leadData = monthData[leadId];
        if (!leadData) return;

        // Determine monthYear for the target 'enquiry' collection
        const enquiryDateObj = new Date(leadData.enquiryDate);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const targetMonthYear = `${monthNames[enquiryDateObj.getMonth()]}${enquiryDateObj.getFullYear()}`;
        const targetRef = doc(db, "enquiry", targetMonthYear);

        // Move lead to 'enquiry'
        await setDoc(
          targetRef,
          {
            [leadId]: {
              ...leadData,
              droppedAt: new Date(),
              dropReason: reason || "No reason provided"
            }
          },
          { merge: true }
        );

        // Optionally remove original from pastEnquiry
        if (removeOriginal) {
          await updateDoc(monthRef, { [leadId]: deleteField() });
        }

        // Unsubscribe after moving to avoid repeated triggers
        unsubscribe();
      });

    } catch (error) {
      console.error("Error moving lead to enquiry:", error);
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

    await moveLeadTounDrop(lead.id, true, reason, monthYear);
  };

  // 🎯 Fully Completed Enquiries (5/5 followups done)
  const totalFullyCompletedEnquiries = finalEnquiries.reduce((sum, enq) => {
    if (!Array.isArray(enq.followUpDetails)) return sum;

    const completedCount = enq.followUpDetails.filter(f => f?.createdAt).length;

    return completedCount >= 5 ? sum + 1 : sum;
  }, 0);

  const handleWinFilter = (range) => {
    setWinFilter(range);
  };

  // 🎯 Source Wise Count
  const sourceCounts = finalEnquiries.reduce((acc, enq) => {
    const source = enq.source?.trim() || "Unknown";

    acc[source] = (acc[source] || 0) + 1;

    return acc;
  }, {});

  const getWinProbabilityColor = (prob) => {
    const p = Number(prob || 0);

    if (p >= 76) return "#76fe76";
    if (p >= 51) return "#fdf279";
    if (p >= 26) return "#fdc279";
    if (p > 0) return "#fd7575";

    return null;
  };

  return (
    <div className="leads-table-container">
      <div style={{ marginBottom: '30px' }}> <BackButton />  </div>

      <h2 className="leads-header">Dropped Enquiries</h2>

      <input type="text"
        placeholder="Search by name, mobile, function type, date..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="booking-input"
        style={{
          width: "100%",
          marginBottom: "15px",
          padding: "8px",
          border: "1px solid #57a2d9",
          borderRadius: "6px",
        }}
      />

      <div style={{ display: 'flex', margin: "15px 0px", justifyContent: "end" }}>

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
            onClick={() => handleWinFilter([76, 100])}
          >
            100% - 75%
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

      <div style={{ display: 'flex', gap: '2px' }}>

        {/* Right Table */}
        <div className="table-fixed-wrapper" ref={rightRef}>
          <table className="leads-table">
            <thead>
              <tr style={{ whiteSpace: "nowrap" }}>
                <th>Sl.</th>
                <th onClick={() => handleSort("functionDate")} style={{ cursor: "pointer", padding: '0px' }}>
                  Event Date {sortField === "functionDate" ? (sortAsc ? "" : "") : ""}
                </th>
                <th>Name</th>
                <th>Booked On</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>Pax</th>
                <th>Function Type</th>
                <th>Day/Night</th>
                <th>Share Media</th>
                <th>Actions</th>

                <th>Source</th>
                <th>Win Probability</th>

                <th>ReSotre</th>
              </tr>
            </thead>

            <tbody style={{ whiteSpace: "nowrap" }}>
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
                  <tr key={enq.id}>
                    <td style={{ backgroundColor: rowBg }}>{finalEnquiries.length - startIndex - index}.</td>
                    <td style={{ backgroundColor: rowBg }}>{formatDate(enq.functionDate)}</td>
                    <td style={{ backgroundColor: rowBg }}>{enq.name}</td>
                    <td style={{ backgroundColor: rowBg }}>{formatDate(enq.enquiryDate)}</td>
                    <td style={{ backgroundColor: rowBg }}>
                      {enq.mobile1 ? (
                        <a href={`tel:${enq.mobile1}`} style={{ color: 'black', textDecoration: 'none' }}>
                          {enq.mobile1}
                        </a>
                      ) : " "} {`, `}
                      <span style={{ marginTop: '5px' }}>
                        {enq.mobile2 ? (
                          <a href={`tel:${enq.mobile2}`} style={{ color: 'black', textDecoration: 'none' }}>
                            {enq.mobile2}
                          </a>
                        ) : " "}
                      </span>
                    </td>
                    <td style={{ backgroundColor: rowBg }}>{enq.email}</td>
                    <td style={{ backgroundColor: rowBg }}>{enq.pax}</td>
                    <td style={{ backgroundColor: rowBg }}>{enq.functionType}</td>
                    <td style={{ backgroundColor: rowBg }}>{enq.dayNight}</td>
                    <td style={{ color: enq.shareMedia ? "green" : "red", backgroundColor: rowBg }}>
                      {enq.shareMedia ? "Shared" : "Not Shared"}
                    </td>
                    <td style={{ backgroundColor: rowBg }}>
                      <button
                        className="booking-btn"
                        onClick={() => navigate("/EnquiryForm", { state: enq })}
                      >
                        Edit
                      </button>
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

                    <td style={{ backgroundColor: rowBg }}>{enq.source}
                      <div style={{ color: "gray", fontSize: "13px" }}> {enq.referredBy} </div>
                    </td>

                    <td style={{ backgroundColor: rowBg }}>{enq.winProbability}</td>

                    <td style={{ minWidth: "180px", backgroundColor: rowBg }}>

                      {/* Drop Reason Display */}
                      {(enq.dropReason || enq.autoMovedReason) && (
                        <div style={{ marginBottom: "6px" }}>
                          <div style={{
                            fontWeight: "800",
                            color: "#000000",
                            fontSize: "13px"
                          }}>
                            Drop Reason: <span style={{ color: "red" }}> {enq.dropReason || enq.autoMovedReason} </span>
                          </div>

                          <div style={{
                            fontWeight: "800",
                            fontSize: "11px",
                            color: "#020202"
                          }}>
                            Dropped At: <span style={{ color: "red" }}> {formatDateTimeIST(enq.droppedAt || enq.autoMovedAt)} </span>
                          </div>
                        </div>
                      )}

                      {/* Button */}
                      <div style={{ display: "flex", justifyContent: "end" }}>
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
                          ReStore
                        </button>
                      </div>
                    </td>

                  </tr>
                )
              })}

            </tbody>
          </table>
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

    </div>
  );
};

export default PastEnquiry;

const statBoxStyle = (color) => ({
  backgroundColor: color,
  color: "white",
  padding: "6px 12px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "500",
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
});