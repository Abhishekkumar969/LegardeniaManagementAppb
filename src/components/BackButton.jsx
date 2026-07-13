import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { getAuth } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import './BackButton.css';

const BackButton = ({ setActiveTab }) => {
  const scrollRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const [userAppType, setUserAppType] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [panelAccess, setPanelAccess] = useState({});

  // const routeToTab = {
  //   "/": "Dashboard",
  //   "/EnquiryDetails": "EnquiryDetails",
  //   "/leads": "Leads",
  //   "/BookingTable": "Bookings",
  //   "/MoneyReceipts": "MoneyReceipts",
  //   "/Accountant": "Accountant",
  // };

  // const activeTab = location.pathname === "/" ? "Dashboard" : null;


  const containerStyle = { position: "fixed", top: 0, left: 0, width: "100vw", backgroundColor: "#d1f3fe", zIndex: 9999, padding: "3px 10px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", boxShadow: "inset -2px -2px 5px #7abfd6" };
  const fixedGroupStyle = { display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 };
  const scrollGroupStyle = { display: "flex", alignItems: "center", gap: "10px", overflowX: "auto", padding: "4px 0", whiteSpace: "nowrap", flex: 1 };
  const iconButtonStyle = { background: "#fff", borderRadius: "12px", color: "#000", cursor: "pointer", padding: "6px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", fontWeight: 700, boxShadow: "inset -0 -4px 2.2px #035571", transition: "all 0.15s ease-in-out", fontSize: "0.85rem", position: "relative" };
  const activeButtonStyle = { ...iconButtonStyle, background: "linear-gradient(270deg, #4dbce1, #048bb8)", color: "#fff" };
  const dropdownItemStyle = { padding: "8px 14px", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" };

  const isSectionActive = (sectionKey) => {
    const meta = PANEL_META[sectionKey];
    if (!meta) return false;

    return Object.values(meta.routes).some(r =>
      location.pathname.startsWith(r.path.split("?")[0])
    );
  };

  const handleToggleDropdown = (menu, e) => {
    if (openDropdown === menu) return setOpenDropdown(null);
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
    setOpenDropdown(menu);
  };

  const activateOrNavigate = (tabKey, path) => { if (setActiveTab) setActiveTab(tabKey); navigate(path); };

  useEffect(() => {
    const auth = getAuth();

    const fetchUserAndAccess = async () => {
      const user = auth.currentUser;
      if (user) {
        const userSnap = await getDoc(doc(db, 'usersAccess', user.email));
        if (userSnap.exists()) {
          setUserAppType(userSnap.data().accessToApp);
        }
      }

      // 🔥 FETCH PANEL ACCESS
      const snap = await getDocs(collection(db, "pannelAccess"));
      const data = {};
      snap.forEach(d => {
        data[d.id] = d.data(); // Bookings, Accountant, Vendor...
      });
      setPanelAccess(data);
    };

    fetchUserAndAccess();
  }, []);

  useEffect(() => {
    const handleClickOutside = e => { if (!e.target.closest(".dropdown-container")) setOpenDropdown(null); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => { if (location.pathname === "/leadstabcontainer" && setActiveTab) setActiveTab("EnquiryDetails"); }, [location.pathname, setActiveTab]);

  const renderDropdown = (menuKey, items) => openDropdown === menuKey && (
    <div style={{ position: "fixed", top: "45px", left: dropdownPos.left, background: "#fff", border: "1px solid #ccc", borderRadius: "10px", padding: "6px 0", boxShadow: "0 2px 8px rgba(0,0,0,0.25)", minWidth: "180px", zIndex: 999999 }}>
      {items.map(({ label, path }) => <div key={label} style={dropdownItemStyle} onClick={() => navigate(path)}>{label}</div>)}
    </div>
  );

  const PANEL_META = {
    /* ================= BOOKINGS ================= */
    Bookings: {
      label: "Booking",
      routes: {
        Dates: { label: "Booked Dates", path: "/AllBookingDatesList" },
        AllBookingDatesList: { label: "All Booking Dates", path: "/AllBookingDatesList" },
        Enquiry: { label: "Enquiry", path: "/EnquiryForm" },
        Lead: { label: "Lead", path: "/bookingLead" },
        Book: { label: "Book", path: "/Booking" },
        Rooms: { label: "Rooms", path: "/RoomBookings" },

        "Enquiry Record": { label: "Enquiry Record", path: "/leadstabcontainer?tab=enquiry" },
        "Lead Record": { label: "Lead Record", path: "/leadstabcontainer?tab=leads" },
        "Book Record": { label: "Book Record", path: "/leadstabcontainer?tab=bookings" },

        "Past Enquiry": { label: "Past Enquiry", path: "/PastLeadsTabContainer?tab=PastEnquiry" },
        "Dropped Leads": { label: "Dropped Leads", path: "/PastLeadsTabContainer?tab=dropped" },
        "Cancelled Bookings": { label: "Cancelled Bookings", path: "/PastLeadsTabContainer?tab=cancelled" },
      },
    },

    /* ================= RECEIPTS ================= */
    Receipts: {
      label: "Receipts",
      routes: {
        Receipt: { label: "Receipt", path: "/MoneyReceipt" },
        Voucher: { label: "Voucher", path: "/Receipts" },
        Record: { label: "Record", path: "/MoneyReceipts" },
        Approve: { label: "Receipt Approve", path: "/ApprovalPage" },
      },
    },

    /* ================= ACCOUNTS ================= */
    // Accountant: {
    //   label: "Cash flow",
    //   routes: {
    //     Cashflow: { label: "Cashflow", path: "/AccountantForm" },
    //     Record: { label: "Record", path: "/Accountant" },
    //   },
    // },

    /* ================= VENDOR ================= */
    Vendor: {
      label: "Event Management",
      routes: {
        UpComing: { label: "UpComing", path: "/VendorTable" },
        Booked: { label: "Booked", path: "/VendorBookedTable" },
        Dropped: { label: "Dropped", path: "/VendorDeoppedTable" },
      },
    },

    /* ================= DECORATION ================= */
    Decoration: {
      label: "Decoration Management",
      routes: {
        UpComing: { label: "UpComing", path: "/DecorationTable" },
        Booked: { label: "Booked", path: "/DecorationBookedTable" },
        Dropped: { label: "Dropped", path: "/DecorationDeoppedTable" },
      },
    },

    /* ================= CATERING ================= */
    Catering: {
      label: "Catering",
      routes: {
        Assign: { label: "Assign", path: "/CateringAssign" },
        Records: { label: "Records", path: "/CateringAssigned" },
      },
    },

    /* ================= UTILITIES ================= */
    Utilities: {
      label: "Utilities",
      routes: {
        Inventory: { label: "Inventory", path: "/Inventory" },
        WhatsappMessage: { label: "WhatsApp Message", path: "/WhatsappMessage" },
        Menu: { label: "Menu", path: "/MenuItems" },
        GST: { label: "GST", path: "/GSTSummary" },
      },
    },

    /* ================= SETTINGS ================= */
    Settings: {
      label: "Settings",
      routes: {
        Business: { label: "Business Stats", path: "/StatsPage" },
        Access: { label: "Access", path: "/UserAccessPanel" },
      },
    },
  };

  const buildDropdownsFromDB = () => {
    if (!userAppType) return [];

    // Admin → all
    if (userAppType === "A") {
      return Object.entries(PANEL_META).map(([key, cfg]) => ({
        key,
        label: cfg.label,
        items: Object.values(cfg.routes),
      }));
    }

    const result = [];

    Object.entries(panelAccess || {}).forEach(([section, items]) => {
      const meta = PANEL_META[section];
      if (!meta || !items) return;

      const allowedItems = Object.entries(items)
        .filter(([itemKey, roles]) =>
          Array.isArray(roles) &&
          roles.includes(userAppType) &&
          meta.routes[itemKey]
        )
        .map(([itemKey]) => meta.routes[itemKey]);

      if (allowedItems.length > 0) {
        result.push({
          key: section,
          label: meta.label,
          items: allowedItems,
        });
      }
    });

    return result;
  };

  return (
    <div style={{ ...containerStyle, flexWrap: "nowrap" }}>
      <div style={fixedGroupStyle}>
        {location.pathname !== "/" && (
          <button
            onClick={() => navigate("/")}
            style={{ ...iconButtonStyle, background: "#f9f9f9", border: "none" }}
            title="Back"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <button onClick={() => window.location.reload()} style={{ ...iconButtonStyle, background: "#f9f9f9", border: "none" }} title="Refresh"><RefreshCw size={18} /></button>
      </div>
      <div ref={scrollRef} style={scrollGroupStyle} className="scrollable-menu">

        {location.pathname !== "/" && (
          <button
            onClick={() => activateOrNavigate("Dashboard", "/")}
            style={iconButtonStyle}
          >
            Dashboard
          </button>
        )}

        {buildDropdownsFromDB().map(({ key, label, items }) => (
          <div
            key={key}
            className="dropdown-container"
            style={{ position: "relative" }}
            onClick={e => handleToggleDropdown(key, e)}
          >
            <button
              style={isSectionActive(key) ? activeButtonStyle : iconButtonStyle}
            >
              {label}
            </button>

            {renderDropdown(key, items)}
          </div>
        ))}

        <div style={{ marginRight: "80px" }}></div>
      </div>
    </div>
  );
};

export default BackButton;