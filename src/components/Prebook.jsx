import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import CalendarPopup from '../pages/CalendarPopup';
import { doc, collection, onSnapshot, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import BackButton from "../components/BackButton";
import BottomNavigationBar from './BottomNavigationBar';
import DailyReport from "./DailyReport";
import DuePayments from "./DuePayments";
import "../Book/AllLeads/BookingLeadsTable.css"
import {
  FaCalendarAlt, FaEnvelopeOpenText, FaRocket, FaClipboardCheck,
  FaFolderOpen, FaTrashAlt, FaReceipt, FaTicketAlt,
  FaCheckCircle, FaMoneyBillWave, FaWhatsapp, FaUtensils,
  FaChartLine, FaListAlt, FaUserShield,
  FaUserTie, FaChevronUp, FaChevronDown, FaFileInvoiceDollar, FaDatabase,
  FaUserPlus, FaUserTimes, FaFileInvoice, FaTruck, FaCalendarCheck, FaMagic, FaBoxes, FaClipboardList, FaFileSignature, FaTasks
} from "react-icons/fa";

import { FiPrinter } from "react-icons/fi";
import { IoIosLogOut } from "react-icons/io";
import { IoCloudOfflineOutline } from "react-icons/io5";

import './Prebook.css';

const Prebook = () => {
  const navigate = useNavigate();
  const [showCalendar, setShowCalendar] = useState(false);
  const [userAppType, setUserAppType] = useState(null);
  const [userName, setUserName] = useState('');
  const [vendor, setVendor] = useState(null);
  const [decoration, setDecoration] = useState(null);
  const [panelAccess, setPanelAccess] = useState({});
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [adminFirmName, setAdminFirmName] = useState('');
  const [appPower, setAppPower] = useState(true);
  const [showPowerPopup, setShowPowerPopup] = useState(false);
  const showAll = userAppType === "A";
  const [totalBookings, setTotalBookings] = useState(0);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalEnquiries, setTotalEnquiries] = useState(0);
  const [pendingDebitCount, setPendingDebitCount] = useState(0);
  const [showDuePayments, setShowDuePayments] = useState(false);

  const [editingField, setEditingField] = useState(null);

  useEffect(() => {
    const unsubEvent = onSnapshot(doc(db, "MinAmount", "Event"), (snap) => {
      if (snap.exists()) {
        setMinAmounts(prev => ({
          ...prev,
          Event: snap.data().amount?.toString() || ""
        }));
      }
    });

    const unsubDecoration = onSnapshot(doc(db, "MinAmount", "Decoration"), (snap) => {
      if (snap.exists()) {
        setMinAmounts(prev => ({
          ...prev,
          Decoration: snap.data().amount?.toString() || ""
        }));
      }
    });

    return () => {
      unsubEvent();
      unsubDecoration();
    };
  }, []);

  const [minAmounts, setMinAmounts] = useState({
    Event: "",
    Decoration: ""
  });

  const handleMinAmountChange = async (type, value) => {
    setMinAmounts(prev => ({
      ...prev,
      [type]: value
    }));

    try {
      await setDoc(doc(db, "MinAmount", type), {
        amount: Number(value),
        updatedAt: new Date()
      });
    } catch (err) {
      console.error("Error saving min amount:", err);
    }
  };

  useEffect(() => {
    const unsubscribes = [];

    // 🔹 PREBOOKINGS
    const prebookingsRef = collection(db, "prebookings");
    unsubscribes.push(
      onSnapshot(prebookingsRef, (snapshot) => {
        let count = 0;
        snapshot.forEach((docSnap) => {
          count += Object.keys(docSnap.data()).length;
        });
        setTotalBookings(count);
      })
    );

    // 🔹 ENQUIRIES
    const enquiryRef = collection(db, "enquiry");
    unsubscribes.push(
      onSnapshot(enquiryRef, (snapshot) => {
        let count = 0;
        snapshot.forEach((docSnap) => {
          count += Object.keys(docSnap.data()).length;
        });
        setTotalEnquiries(count);
      })
    );

    // 🔹 LEADS
    const bookingLeadsRef = collection(db, "bookingLeads");
    unsubscribes.push(
      onSnapshot(bookingLeadsRef, (snapshot) => {
        let count = 0;
        snapshot.forEach((docSnap) => {
          count += Object.keys(docSnap.data()).length;
        });
        setTotalLeads(count);
      })
    );

    // 🔥 CLEANUP
    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, []);

  useEffect(() => {
    const ref = doc(db, "appControl", "appStatus");

    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setAppPower(snap.data().power);
      }
    });

    return () => unsub();
  }, []);

  const togglePower = async () => {
    const ref = doc(db, "appControl", "appStatus");

    try {
      // 🔥 clear intent: FORCE OFF
      await updateDoc(ref, { power: false });

      // ⏳ DB write ke baad redirect
      setTimeout(() => {
        window.location.replace("https://nfeednews.netlify.app/");
      }, 300);

    } catch (err) {
      console.error("Power toggle failed:", err);
    }
  };

  useEffect(() => {
    const receiptsRef = collection(db, "moneyReceipts");

    const unsubscribe = onSnapshot(receiptsRef, (snapshot) => {
      let pending = 0;

      snapshot.forEach((docSnap) => {
        const docData = docSnap.data();

        // 🔥 EACH receipt is INSIDE the document
        Object.values(docData).forEach((receipt) => {
          if (
            receipt?.paymentFor?.toLowerCase() === "debit" &&
            receipt?.approval?.toLowerCase() !== "accepted"
          ) {
            pending++;
          }
        });
      });

      console.log("🔥 FINAL PENDING DEBIT =", pending);
      setPendingDebitCount(pending);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const accessCollection = collection(db, "usersAccess");
    const unsubscribe = onSnapshot(accessCollection, (snapshot) => {
      snapshot.forEach((docItem) => {
        const data = docItem.data();
        if (data.accessToApp === "A" && data.firmName) {
          setAdminFirmName(data.firmName);
        }
      });
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;
    const userRef = doc(db, 'usersAccess', user.email);
    const unsubscribe = onSnapshot(
      userRef,
      (userSnap) => {
        if (userSnap.exists()) {
          const data = userSnap.data();
          setUserAppType(data.accessToApp);
          setUserName(data.name || user.email);
          setVendor(data.accessToApp === 'C' ? data : null);
          setDecoration(data.accessToApp === 'E' ? data : null);
        } else {
          setUserName(user.email);
          setUserAppType(null);
          setVendor(null);
          setDecoration(null);
        }
      },
      (err) => console.error("Error listening to user data:", err)
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const accessCollectionRef = collection(db, 'pannelAccess');
    const unsubscribe = onSnapshot(
      accessCollectionRef,
      (accessSnap) => {
        let allAccess = {};
        accessSnap.forEach((docItem) => {
          allAccess[docItem.id] = docItem.data();
        });
        setPanelAccess(allAccess);
      },
      (err) => console.error("Error listening to panel access:", err)
    );

    return () => unsubscribe();
  }, []);

  const hasAccess = (section, item) => {
    if (userAppType === 'A') return true;
    if (!userAppType || !panelAccess[section]) return false;
    const allowed = panelAccess[section][item] || [];
    return allowed.includes(userAppType);
  };

  const auth = getAuth();
  const confirmLogout = () => {
    signOut(auth)
      .then(() => {
        console.log("User signed out");
        window.location.href = "/";
      })
      .catch((error) => {
        console.error("Error signing out:", error);
      });
  };

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      const userRef = doc(db, 'usersAccess', user.email);
      const unsubscribe = onSnapshot(
        userRef,
        (userSnap) => {
          if (userSnap.exists()) {
            const data = userSnap.data();
            setUserAppType(data.accessToApp);
          }
        },
        (err) => {
          console.error("Error listening to user app type:", err);
        }
      );
      return () => unsubscribe();
    }
  }, []);

  const useAnimatedCounter = (target, duration = 1500) => {
    const [value, setValue] = useState(0);

    useEffect(() => {
      let rafId;
      const startTime = performance.now();

      const animate = (currentTime) => {
        const progress = Math.min((currentTime - startTime) / duration, 1);
        setValue(Math.floor(progress * target));

        if (progress < 1) {
          rafId = requestAnimationFrame(animate);
        }
      };

      rafId = requestAnimationFrame(animate);

      return () => cancelAnimationFrame(rafId);
    }, [target, duration]);

    return value;
  };

  const animatedBookings = useAnimatedCounter(totalBookings);
  const animatedLeads = useAnimatedCounter(totalLeads);
  const animatedEnquiries = useAnimatedCounter(totalEnquiries);

  const metricRoutes = {
    Enquiries: "/leadstabcontainer?tab=enquiry",
    Leads: "/leadstabcontainer?tab=leads",
    Bookings: "/leadstabcontainer?tab=bookings",
  };

  const MetricCard = ({ value, label, onClick, disabled }) => {

    if (disabled) return null; // 🔥 ye line add kar

    return (
      <div
        className="metric-slide"
        onClick={onClick}
        style={{ cursor: "pointer" }}
      >
        <div className="subscription-card">
          <img
            src="/assets/BannerCalendar-removebg-preview.png"
            className="calendar-bg"
            alt=""
          />
          <div className="calendar-overlay">
            <h2>{value}</h2>
          </div>
        </div>

        <p className="metric-label">{label}</p>
      </div>
    );
  };

  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % 3);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const formatIndianNumber = (num) => {
    if (!num) return "";
    return new Intl.NumberFormat('en-IN').format(num);
  };

  return (
    <>
      <div style={{ marginBottom: '40px' }}> <BackButton />  </div>

      <div className="prebook-wrapper">

        {/* APP STYLE BANNER */}
        <div className="app-banner">
          {/* LEFT */}
          <div className="banner-left">
            <h1>
              Welcome<br />{userName}
            </h1>
          </div>

          {/* RIGHT */}
          <div className="banner-metrics">
            <div
              className="metrics-track"
              style={{ transform: `translateX(-${activeSlide * 100}%)` }}
            >

              {/* Enquiries */}
              <MetricCard
                value={animatedEnquiries}
                label="Enquiries"
                disabled={!hasAccess("Bookings", "Enquiry")}
                onClick={() => navigate(metricRoutes.Enquiries)}
              />

              {/* Leads */}
              <MetricCard
                value={animatedLeads}
                label="Leads"
                disabled={!hasAccess("Bookings", "Lead")}
                onClick={() => navigate(metricRoutes.Leads)}
              />

              {/* Bookings */}
              <MetricCard
                value={animatedBookings}
                label="Bookings"
                disabled={!hasAccess("Bookings", "Book")}
                onClick={() => navigate(metricRoutes.Bookings)}
              />

            </div>
          </div>
        </div>

        <div>

          {/* Daily Report Section */}
          {showAll || Object.keys(panelAccess.ReportSection || {}).some(item => hasAccess("ReportSection", item)) ? (
            <>
              {/* Due  */}
              {hasAccess("ReportSection", "DailyReport") && (
                <div className="service-section">
                  <h3
                    className="service-section-text"
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0px" }}
                  >
                    Daily Report
                    <button
                      onClick={() => setShowDailyReport(prev => !prev)}
                      style={{
                        margin: "auto 15px",
                        padding: "4px 10px",
                        fontSize: "15px",
                        cursor: "pointer",
                        borderRadius: "6px",
                        background: "transparent",
                        color: "#000000",
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      {showDailyReport ? <FaChevronUp /> : <FaChevronDown />}
                    </button>
                  </h3>

                  <div style={{ display: "flex", justifyContent: "center" }}>
                    {showDailyReport && <DailyReport />}
                  </div>
                </div>
              )}
            </>
          ) : null}

          {/* Due Payments Section */}
          {showAll || Object.keys(panelAccess.ReportSection || {}).some(item => hasAccess("ReportSection", item)) ? (
            <>
              {hasAccess("ReportSection", "BalanceReport") && (
                <div className="service-section">
                  <h3
                    className="service-section-text"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0px"
                    }}
                  >
                    Due Payments
                    <button
                      onClick={() => setShowDuePayments(prev => !prev)}
                      style={{
                        margin: "auto 15px",
                        padding: "4px 10px",
                        fontSize: "15px",
                        cursor: "pointer",
                        borderRadius: "6px",
                        background: "transparent",
                        color: "#000000",
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      {showDuePayments ? <FaChevronUp /> : <FaChevronDown />}
                    </button>
                  </h3>

                  <div style={{ display: "flex", justifyContent: "center" }}>
                    {showDuePayments && <DuePayments />}
                  </div>
                </div>
              )}
            </>
          ) : null}

          {/* BOOKINGS */}
          {showAll || Object.keys(panelAccess.Bookings || {}).some(item => hasAccess("Bookings", item)) ? (
            <div className="service-section">
              <h3 className="service-section-text">Bookings</h3>
              <div className="service-grid">
                {hasAccess("Bookings", "Dates") && <ServiceBox label="Booked Dates" onClick={() => navigate('/AllBookingDatesList')} icon={<FaCalendarAlt />} />}
                {hasAccess("Bookings", "Enquiry") && <ServiceBox label="Enquiry Form" onClick={() => navigate('/EnquiryForm')} icon={<FaEnvelopeOpenText />} />}
                {hasAccess("Bookings", "Lead") && <ServiceBox label="Lead Form" onClick={() => navigate('/bookingLead')} icon={<FaUserPlus />} />}
                {hasAccess("Bookings", "Book") && <ServiceBox label="Booking Form" onClick={() => navigate('/Booking')} icon={<FaClipboardCheck />} />}
                {(hasAccess("Bookings", "Lead Record") || hasAccess("Bookings", "Enquiry Record") || hasAccess("Bookings", "Book Record")) && (<ServiceBox label="Reports" onClick={() => navigate('/leadstabcontainer')} icon={<FaClipboardList />} />)}
                {(hasAccess("Bookings", "Past Enquiry") || hasAccess("Bookings", "Dropped Leads") || hasAccess("Bookings", "Cancelled Bookings")) && (<ServiceBox label="Dropped" onClick={() => navigate('/PastLeadsTabContainer')} icon={<FaUserTimes />} />)}
                {hasAccess("Bookings", "Checklist") && <ServiceBox label="Checklist" onClick={() => navigate('/EventTasks')} icon={<FaTasks />} />}
              </div>
            </div>
          ) : null}

          {/* RECEIPTS */}
          {showAll || Object.keys(panelAccess.Receipts || {}).some(item => hasAccess("Receipts", item)) ? (
            <div className="service-section">
              <h3 className="service-section-text">Receipts</h3>
              <div className="service-grid">
                {hasAccess("Receipts", "Receipt") && <ServiceBox label="Money Receipt" onClick={() => navigate('/MoneyReceipt')} icon={<FaReceipt />} />}
                {hasAccess("Receipts", "Voucher") && <ServiceBox label="Voucher Receipt" onClick={() => navigate('/Receipts')} icon={<FaTicketAlt />} />}
                {hasAccess("Receipts", "Record") && <ServiceBox label="Print Receipt" onClick={() => navigate('/MoneyReceipts')} icon={<FiPrinter />} />}
                {hasAccess("Receipts", "RecordStats") && <ServiceBox label="Receipt Report" onClick={() => navigate('/MoneyReceiptsStats')} icon={<FaFileInvoice />} />}
                {hasAccess("Receipts", "Approve") && (<ServiceBox label="Debit Approval" onClick={() => navigate('/ApprovalPage')} icon={<FaCheckCircle />} badge={pendingDebitCount} />)}
              </div>
            </div>
          ) : null}

          {/* Ledger */}
          {showAll || Object.keys(panelAccess.Ledger || {}).some(item => hasAccess("Ledger", item)) ? (
            <div className="service-section">
              <h3 className="service-section-text">Ledger</h3>
              <div className="service-grid">
                {hasAccess("Ledger", "SalaryLedger") && <ServiceBox label="Salary Ledger" onClick={() => navigate('/SalaryLedger')} icon={<FaMoneyBillWave />} />}
                {hasAccess("Ledger", "VendorLedger") && <ServiceBox label="Vendor Ledger" onClick={() => navigate('/VendorLedger')} icon={<FaTruck />} />}
              </div>
            </div>
          ) : null}

          {/* VENDOR */}
          {userAppType !== 'C' && (showAll || Object.keys(panelAccess.Vendor || {}).some(item => hasAccess("Vendor", item))
          ) ? (
            <div className="service-section">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
                <h3 className="service-section-text" style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "0px" }}>Event</h3>

                {userAppType === 'A' && (
                  <span
                    style={{ display: "flex", alignItems: "center", gap: "6px" }}
                    onDoubleClick={() => setEditingField("Event")}
                  >

                    {editingField !== "Event" ? (
                      <>
                        Min Val: {formatIndianNumber(minAmounts.Event)}
                      </>
                    ) : (
                      <>
                        Min Val:
                        <input
                          type="text"
                          autoFocus
                          value={formatIndianNumber(minAmounts.Event)}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/,/g, "");
                            if (!/^\d*$/.test(raw)) return;

                            handleMinAmountChange("Event", raw);
                          }}
                          onBlur={() => setEditingField(null)} // 👈 click outside = save
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.target.blur(); // 👈 enter = save
                          }}
                          style={{ maxWidth: "120px" }}
                        />
                      </>
                    )}

                  </span>
                )}

              </div>
              <div className="service-grid">
                {hasAccess("Vendor", "UpComing") && (
                  <ServiceBox label="UpComing" onClick={() => navigate('/VendorTable')} icon={<FaCalendarCheck />} />
                )}
                {hasAccess("Vendor", "VendorTableAll") && (
                  <ServiceBox label="All" onClick={() => navigate('/VendorTableAll')} icon={<FaListAlt />} />
                )}
                {hasAccess("Vendor", "Booked") && (
                  <ServiceBox label="Reports" onClick={() => navigate('/VendorBookedTable')} icon={<FaFileSignature />} />
                )}
                {hasAccess("Vendor", "Dropped") && (
                  <ServiceBox label="Dropped" onClick={() => navigate('/VendorDeoppedTable')} icon={<FaUserTimes />} />
                )}
              </div>
            </div>
          ) : null}

          {/* VENDOR */}
          {userAppType === 'C' && (
            <div className="service-section">
              <h3 className="service-section-text">Event Management</h3>

              <div className="service-section">
                <h3 className="service-section-text">{adminFirmName || "Loading..."}</h3>
                <div className="service-grid">
                  {vendor?.functionTypes?.length > 0 && (
                    <>
                      <ServiceBox label="UpComing" onClick={() => navigate('/VendorTable')} icon={<FaRocket />} />
                      <ServiceBox label="All" onClick={() => navigate('/VendorTableAll')} icon={<FaListAlt />} />
                      <ServiceBox label="Reports" onClick={() => navigate('/VendorBookedTable')} icon={<FaFolderOpen />} />
                      <ServiceBox label="Dropped" onClick={() => navigate('/VendorDeoppedTable')} icon={<FaTrashAlt />} F />
                    </>
                  )}
                </div>
              </div>
              <div className="service-section">
                <h3 className="service-section-text">Others</h3>
                <div className="service-grid">
                  <ServiceBox label="Form" onClick={() => navigate('/VendorOtherForm')} icon={<FaListAlt />} />
                  <ServiceBox label="Booked" onClick={() => navigate('/VendorBookedTableOthers')} icon={<FaCheckCircle />} />
                </div>
              </div>
            </div>
          )}

          {/* DECORATION */}
          {userAppType !== 'E' && (showAll || Object.keys(panelAccess.Decoration || {}).some(item => hasAccess("Decoration", item))
          ) ? (
            <div className="service-section">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
                <h3 className="service-section-text" style={{ display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "0px" }}>Decoration</h3>
                {userAppType === 'A' && (
                  <span
                    style={{ display: "flex", alignItems: "center", gap: "6px" }}
                    onDoubleClick={() => setEditingField("Decoration")}
                  >

                    {editingField !== "Decoration" ? (
                      <>
                        Min Val: {formatIndianNumber(minAmounts.Decoration)}
                      </>
                    ) : (
                      <>
                        Min Val:
                        <input
                          type="text"
                          autoFocus
                          value={formatIndianNumber(minAmounts.Decoration)}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/,/g, "");
                            if (!/^\d*$/.test(raw)) return;

                            handleMinAmountChange("Decoration", raw);
                          }}
                          onBlur={() => setEditingField(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.target.blur();
                          }}
                          style={{ maxWidth: "120px" }}
                        />
                      </>
                    )}

                  </span>
                )}
              </div>

              <div className="service-grid">
                {hasAccess("Decoration", "UpComing") && <ServiceBox label="UpComing" onClick={() => navigate('/DecorationTable')} icon={<FaMagic />} />}
                {hasAccess("Decoration", "DecorationTableAll") && <ServiceBox label="All" onClick={() => navigate('/DecorationTableAll')} icon={<FaListAlt />} />}
                {hasAccess("Decoration", "Booked") && <ServiceBox label="Reports" onClick={() => navigate('/DecorationBookedTable')} icon={<FaFileSignature />} />}
                {hasAccess("Decoration", "Dropped") && <ServiceBox label="Dropped" onClick={() => navigate('/DecorationDeoppedTable')} icon={<FaUserTimes />} />}
              </div>
            </div>
          ) : null}

          {/* DECORATION */}
          {userAppType === 'E' && (
            <div className="service-section">
              <h3 className="service-section-text">Decoration Management</h3>

              <div className="service-section">
                <h3 className="service-section-text">{adminFirmName || "Loading..."}</h3>
                <div className="service-grid">
                  {decoration?.functionTypes?.length > 0 && (
                    <>
                      <ServiceBox label="UpComing" onClick={() => navigate('/DecorationTable')} icon={<FaRocket />} />
                      <ServiceBox label="All" onClick={() => navigate('/DecorationTableAll')} icon={<FaListAlt />} />
                      <ServiceBox label="Reports" onClick={() => navigate('/DecorationBookedTable')} icon={<FaFolderOpen />} />
                      <ServiceBox label="Dropped" onClick={() => navigate('/DecorationDeoppedTable')} icon={<FaTrashAlt />} />
                    </>
                  )}
                </div>
              </div>
              <div className="service-section">
                <h3 className="service-section-text">Others</h3>
                <div className="service-grid">
                  {decoration?.functionTypes?.length > 0 && (
                    <>
                      <ServiceBox label="Form" onClick={() => navigate('/DecorationOtherForm')} icon={<FaListAlt />} />
                      <ServiceBox label="Booked" onClick={() => navigate('/DecorationBookedTableOthers')} icon={<FaCheckCircle />} />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* CATERING */}
          {showAll || Object.keys(panelAccess.Catering || {}).some(item => hasAccess("Catering", item)) ? (
            <div className="service-section">
              <h3 className="service-section-text">Catering</h3>
              <div className="service-grid">
                {hasAccess("Catering", "Assign") && <ServiceBox label="Assign" onClick={() => navigate('/CateringAssign')} icon={<FaUserTie />} />}
                {hasAccess("Catering", "Records") && <ServiceBox label="Reports" onClick={() => navigate('/CateringAssigned')} icon={<FaFolderOpen />} />}
              </div>
            </div>
          ) : null}

          {/* UTILITIES */}
          {showAll || Object.keys(panelAccess.Utilities || {}).some(item => hasAccess("Utilities", item)) ? (
            <div className="service-section">
              <h3 className="service-section-text">Utilities</h3>
              <div className="service-grid">
                {hasAccess("Utilities", "WhatsappMessage") && <ServiceBox label="Message" onClick={() => navigate('/WhatsappMessage')} icon={<FaWhatsapp />} />}
                {hasAccess("Utilities", "Menu") && <ServiceBox label="Menu" onClick={() => navigate('/MenuItems')} icon={<FaUtensils />} />}
                {hasAccess("Utilities", "All Dates") && <ServiceBox label="All Dates" onClick={() => setShowCalendar(true)} icon={<FaCalendarAlt />} />}
                {hasAccess("Utilities", "GST") && <ServiceBox label="GST" onClick={() => navigate('/GSTSummary')} icon={<FaFileInvoiceDollar />} />}
                {hasAccess("Utilities", "Inventory") && <ServiceBox label="Inventory" onClick={() => navigate('/Inventory')} icon={<FaBoxes />} />}
              </div>
            </div>
          ) : null}

          {/* SETTINGS */}
          {showAll || Object.keys(panelAccess.Settings || {}).some(item => hasAccess("Settings", item)) ? (
            <div className="service-section">
              <h3 className="service-section-text">Settings</h3>
              <div className="service-grid">
                {hasAccess("Settings", "Business") && <ServiceBox label="Business" onClick={() => navigate('/StatsPage')} icon={<FaChartLine />} />}
                {hasAccess("Settings", "Access") && <ServiceBox label="Access" onClick={() => navigate('/UserAccessPanel')} icon={<FaUserShield />} />}
                {hasAccess("Settings", "Backup") && <ServiceBox label="Backup" onClick={() => navigate('/DownloadEveryThing')} icon={<FaDatabase />} />}
              </div>
            </div>
          ) : null}

          {/* App Logout / ON-OFF */}
          <div
            className="service-grid"
            style={{
              marginTop: "15px",
              display: "flex",
              justifyContent: "space-around",
            }}
          >

            {/* APP POWER */}
            <div className="app-rectbox" onClick={() => setShowPowerPopup(true)}>

              <div className="service-label" style={{ color: "#fff", fontSize: "13px" }}>
                {appPower ? "App OFF" : "App is OFF"}
              </div>

              <div className="service-icon" style={{ color: "#125d9a", display: "flex", justifyContent: "center", alignItems: "center", margin: "4px 0px" }}>
                <IoCloudOfflineOutline size={22} />
              </div>

            </div>

            {/* LOGOUT */}
            <div className="app-rectbox" onClick={confirmLogout}>

              <div className="service-label" style={{ color: "#fff", fontSize: "13px" }}>
                Logout
              </div>

              <div className="service-icon" style={{ color: "#125d9a", display: "flex", justifyContent: "center", alignItems: "center", margin: "4px 0px" }}>
                <IoIosLogOut size={22} />
              </div>

            </div>

          </div>

        </div>

        <CalendarPopup isOpen={showCalendar} onClose={() => setShowCalendar(false)} />

      </div>

      <BottomNavigationBar navigate={navigate} userAppType={userAppType} />

      {/* POWER OFF POPUP */}
      {showPowerPopup && (
        <div
          className="popup-overlay"
          onClick={() => setShowPowerPopup(false)}
        >
          <div
            className="popup-box"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Do you really want to Power OFF this App?</h3>

            <div className="popup-btn-row">
              <button
                className="popup-no"
                onClick={() => setShowPowerPopup(false)}
              >
                No
              </button>

              <button
                className="popup-yes"
                onClick={() => {
                  togglePower();
                  setShowPowerPopup(false);
                }}
              >
                Yes
              </button>

            </div>
          </div>
        </div>
      )}

    </>
  );
};

const ServiceBox = ({ label, onClick, icon, badge }) => (
  <div
    className="service-box"
    onClick={onClick}
  >
    {/* ICON WRAPPER */}
    <div
      className="service-icon"
      style={{ position: "relative" }}   // ⭐ IMPORTANT
    >
      {icon}

      {/* 🔴 BADGE ON ICON */}
      {badge > 0 && (
        <span
          style={{
            position: "absolute",
            top: "-6px",
            right: "-6px",
            background: "#fe0000",
            color: "#fff",
            fontSize: "11px",
            fontWeight: "700",
            borderRadius: "50%",
            minWidth: "20px",
            height: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          {badge}
        </span>
      )}
    </div>

    <div className="service-label">{label}</div>
  </div>
);

export default Prebook;