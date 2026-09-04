import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getDoc, collection, getDocs, onSnapshot, doc, updateDoc, deleteField, arrayUnion } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import '../styles/VendorTable.css';
import BackButton from "../components/BackButton";
import { query, where } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import BottomNavigationBar from "../components/BottomNavigationBar";
import { useNavigate } from "react-router-dom";
import Pagination from '../components/Pagination';
import { printHtmlContent } from '../utils/printHelper';

const VendorTable = () => {
    const navigate = useNavigate();
    const [allBookings, setAllBookings] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOrder, setSortOrder] = useState("asc");
    const [vendorProfile, setVendorProfile] = useState(null);
    const [appUserName, setAppUserName] = useState("App User");
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

    const formatDate = (date) => {
        if (!date) return "-";
        const d = new Date(date);
        const istTime = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);

        const day = String(istTime.getUTCDate()).padStart(2, "0");
        const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
        const year = istTime.getUTCFullYear();

        let hours = istTime.getUTCHours();
        const minutes = String(istTime.getUTCMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;

        return `${day}-${month}-${year}, ${hours}:${minutes} ${ampm}`;
    };

    const convertTo12Hour = (timeStr) => {
        if (!timeStr) return "-";
        const [hours, minutes] = timeStr.split(':').map(Number);
        const istHours = (hours + 5) % 24; // add 5h 30m for IST
        const istMinutes = (minutes + 30) % 60;
        const ampm = istHours >= 12 ? "PM" : "AM";
        const hour12 = istHours % 12 || 12;
        return `${hour12}:${String(istMinutes).padStart(2, '0')} ${ampm}`;
    };

    useEffect(() => {
        const auth = getAuth();
        const currentUser = auth.currentUser;

        if (!currentUser) return; // No user logged in

        const unsubscribe = onSnapshot(collection(db, "vendor"), async (vendorMonthDocs) => {
            try {
                // ✅ Get user access info
                const q = query(collection(db, "usersAccess"), where("email", "==", currentUser.email));
                const userSnap = await getDocs(q);
                const userData = userSnap.empty ? {} : userSnap.docs[0].data();
                const hasFullAccess = userData.accessToApp === "A" || userData.accessToApp === "B";

                const droppedVendors = [];

                vendorMonthDocs.forEach((monthDoc) => {
                    const monthData = monthDoc.data().data || monthDoc.data() || {};
                    Object.entries(monthData).forEach(([key, v]) => {
                        // ✅ Only include dropped vendors
                        if (!v.dropReason) return;

                        // ✅ Apply email filter if not full access
                        if (!hasFullAccess && v.userEmail !== currentUser.email) return;

                        droppedVendors.push({
                            id: key,
                            month: monthDoc.id,
                            ...v,
                            finalDate: v.date || "-", // fallback
                        });
                    });
                });

                // Sort by date (latest first)
                droppedVendors.sort((a, b) => new Date(b.finalDate) - new Date(a.finalDate));
                setAllBookings(droppedVendors);

            } catch (err) {
                console.error("❌ Error fetching dropped vendors:", err);
            }
        });

        return () => unsubscribe(); // Cleanup on unmount
    }, []);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user && user.email) {
                try {
                    const q = query(
                        collection(db, "usersAccess"),
                        where("email", "==", user.email)
                    );
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        const userData = snapshot.docs[0].data();
                        setVendorProfile(userData); // store vendor profile info
                        setAppUserName(userData.name || user.email || "App User"); // store app user name
                        console.log("✅ Vendor profile loaded:", userData);
                        console.log("✅ App user name loaded:", userData.name);
                    } else {
                        setAppUserName(user.email); // fallback to email if not found
                        console.warn("❌ No user record found for this email");
                    }
                } catch (error) {
                    console.error("🔥 Error fetching user data:", error);
                    setAppUserName(user.email); // fallback
                }
            }
        });

        return () => unsubscribe();
    }, []);

    const toggleSort = () => {
        setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    };

    const sortedBookings = [...allBookings].sort((a, b) => {
        const dateA = new Date(a.finalDate);
        const dateB = new Date(b.finalDate);
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    const filteredBookings = sortedBookings.filter(v => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const dateStr = v.finalDate ? new Date(v.finalDate).toLocaleDateString("en-GB").replace(/\//g, "-") : "";
        return (
            v.customerName?.toLowerCase().includes(q) ||
            v.contactNo?.toLowerCase().includes(q) ||
            v.eventType?.toLowerCase().includes(q) ||
            dateStr.includes(q)
        );
    });

    const totalPages = Math.ceil(filteredBookings.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentItems = filteredBookings.slice(startIndex, startIndex + itemsPerPage);

    const handleUndoDrop = async (v) => {
        try {
            const monthKey = v.month;
            const ref = doc(db, "vendor", monthKey);

            await updateDoc(ref, {
                [`${v.id}.dropReason`]: deleteField(),
                [`${v.id}.dropAt`]: deleteField(),
            });

            setAllBookings(prev => prev.filter(item => item.id !== v.id));
        } catch (err) {
            console.error(err);
            alert("❌ Failed to restore booking.");
        }
    };

    const handleRefund = async (v) => {
        const amount = prompt("Enter refund amount:");
        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            alert("Please enter a valid refund amount.");
            return;
        }

        try {
            const monthKey = v.month;
            const ref = doc(db, "vendor", monthKey);

            await updateDoc(ref, {
                [`${v.id}.refundAmt`]: arrayUnion({
                    amount: Number(amount),
                    date: new Date().toISOString(),
                }),
            });

            // alert(`✅ Refund of ₹${amount} saved successfully!`);
        } catch (err) {
            console.error("❌ Error saving refund:", err);
            alert("Failed to save refund.");
        }
    };

    const handlePrintPayment = useCallback((receipt, adv) => {
        const firm = vendorProfile?.firmName || "Vendor Firm Name";
        const address = vendorProfile?.address || "Vendor Address";
        const contact = vendorProfile?.contactNo || "Contact Number";
        const email = vendorProfile?.email || "Email";

        const content = `
      <html>
      <head>
        <title>Receipt - #${adv.slNo}</title>
        <style>
          body { font-family: 'Calibri', sans-serif; color: #3c0000; font-size: 20px; padding: 30px 40px; }
          .main-title { text-align: center; font-size: 38px; font-weight: bold; margin-top: 5px; color: maroon; }
          .sub-header { text-align: center; font-size: 15px; margin: 1px 0; }
          .line-group { display: flex; justify-content: space-between; margin-top: 20px; }
          .section { margin: 10px 0; display: flex; gap: 8px; }
          .underline { flex-grow: 1; border-bottom: 1px dotted #000; min-width: 150px; }
          .short-underline { display: inline-block; border-bottom: 1px dotted #000; min-width: 100px; }
          .rs-combo { display: flex; align-items: center; margin-top: 30px; }
          .circle-rs { width: 60px; height: 60px; border-radius: 50%; background-color: transparent; color: #3c0000; font-size: 30px; font-weight: bold; display: flex; align-items: center; justify-content: center; }
          .amount-box { border: 1px solid maroon; padding: 6px 14px; font-weight: bold; min-width: 100px; font-size: 30px; }
          .signature { font-weight: bold; font-size: 18px; text-align: right; margin-top: 40px; }
          .italic { font-style: italic; }
          .payment-row { display: flex; justify-content: space-between; align-items: center; margin-top: 0px; }
        </style>
      </head>
      <body>
        <div style="border: 1px solid maroon; padding: 1px">
          <div style="border: 1px solid maroon; padding: 30px">
            <div class="main-title">${firm}</div>
            <div class="sub-header">${address}</div>
            <div class="sub-header">Mob: ${contact} | Email: ${email}</div>
            <div class="line-group">
              <div>No.<span>${adv.slNo}</span></div>
              <div>Date: <span class="short-underline">${formatDate(adv.date)}</span></div>
            </div>
            <div class="section italic">Received with thanks from: <div class="underline">${adv.customerName}</div></div>
            <div class="section italic"><span>Mob.:</span><div class="underline">${adv.contactNo || '-'}</div></div>
            <div class="section italic">
              for event of: <div class="underline">${adv.eventType || '-'}</div>
              <span style="margin-left:auto;">Event Date: <span class="short-underline">${formatDate(receipt.finalDate)}</span></span>
            </div>
            <div class="payment-row">
              <div class="rs-combo">
                <div class="circle-rs">₹</div>
                <div class="amount-box">${adv.amount}/-</div>
              </div>
         
              <div class="signature">
  Issued By: 
  <span style="display:flex; flex-direction:column; align-items:flex-start;">
    <!-- App user name on top -->
    <span style="font-weight:bold; font-size:14px; margin-bottom:2px;">${appUserName}</span>
    <!-- Underline for issued by -->
    <span class="short-underline">${receipt.receiverd || receipt.senderd || ''}</span>
  </span>
</div>

            </div>
          </div>
        </div>
      </body>
      </html>
    `;

        printHtmlContent(content);
    }, [vendorProfile, appUserName]);

    const rightRef = useRef(null);

    return (
        <div className="page-scroller">

            <div>
                <BackButton />
                <div style={{ marginTop: '60px' }}>
                    <div style={{ textAlign: 'center' }}><h3>📋 Dropped Vendor Bookings</h3></div>

                    <div style={{ textAlign: "center", margin: "15px 0" }}>
                        <input
                            type="text"
                            placeholder="Search by Name, Contact, Event Type, Date (dd-mm-yyyy)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: "70%",
                                padding: "8px",
                                borderRadius: "8px",
                                border: "1px solid #ccc",
                                fontSize: "14px"
                            }}
                        />
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

                    <div className="leads-table-container" style={{ padding: "0px", marginTop: "10px", paddingTop: "0px" }}>
                        <div className="table-fixed-wrapper" ref={rightRef}>
                            <table className="leads-table">
                                <thead>
                                    <tr>
                                        <th>Sl.</th>
                                        <th style={{ cursor: "pointer" }} onClick={toggleSort}>
                                            Event Date {sortOrder === "asc" ? "" : ""}
                                        </th>
                                        <th>Name</th>
                                        <th>Contact</th>
                                        <th>Event Type</th>
                                        <th>Venue Type</th>
                                        <th>Time</th>
                                        <th>Received</th>
                                        <th>Refund breakdowns</th>
                                        <th>Refund</th>
                                        <th>Drop Reason</th>
                                        {vendorProfile?.accessToApp === "C" && (
                                            <>
                                                <th>Actions</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>

                                <tbody>
                                    {currentItems.map((v, idx) => {
                                        const totalAdvance = Array.isArray(v.advance)
                                            ? v.advance.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
                                            : 0;

                                        const totalRefund = Array.isArray(v.refundAmt)
                                            ? v.refundAmt.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
                                            : 0;

                                        const refundAmt = (v.refundAmt || []).map((adv, index) => ({
                                            ...adv,
                                            customerName: v.customerName,
                                            contactNo: v.contactNo,
                                            eventType: v.typeOfEvent,
                                            bookedOn: v.bookedOn,
                                            slNo: index + 1,
                                        }));

                                        return (
                                            <tr key={v.id}
                                                style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{(filteredBookings.length ?? 0) - (startIndex ?? 0) - idx}</td>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{v.finalDate ? formatDate(v.finalDate).split(',')[0] : "-"}</td>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{v.customerName}</td>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff", }}><a href={`tel:${v.contactNo}`} style={{ color: "black", textDecoration: "none" }}>{v.contactNo}</a></td>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{v.eventType}</td>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{v.venueType || "-"}</td>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{convertTo12Hour(v.startTime)} - {convertTo12Hour(v.endTime)}</td>

                                                <td><strong>₹{totalAdvance}</strong></td>

                                                <td >
                                                    <div style={{ display: 'flex' }}>
                                                        {refundAmt.map((a, i) => (
                                                            <span
                                                                key={i}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    padding: '7px 10px',
                                                                    margin: '0px 5px',
                                                                    borderRadius: '7px',
                                                                    boxShadow: `
                  inset -2px -2px 5px rgba(119, 119, 119, 0.6)
                `,
                                                                    fontWeight: 'bold',
                                                                    transition: 'all 0.2s ease-in-out',
                                                                }}
                                                            >
                                                                <span>₹{a.amount} ({formatDate(a.date)})</span>
                                                                <button
                                                                    onClick={() => handlePrintPayment(v, a)}
                                                                    style={{
                                                                        marginLeft: '10px',
                                                                        background: '#b52e2e',
                                                                        color: '#fff',
                                                                        border: 'none',
                                                                        borderRadius: '4px',
                                                                        fontSize: '12px',
                                                                        padding: '2px 12px',
                                                                        boxShadow: '1px 1px 3px rgba(0,0,0,0.3)',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s',
                                                                    }}
                                                                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                                                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                                                                >
                                                                    Print
                                                                </button>
                                                            </span>

                                                        ))}
                                                    </div>
                                                </td>

                                                <td style={{ color: totalRefund > 0 ? "red" : "gray" }}>
                                                    <strong>₹{totalRefund}</strong>
                                                </td>
                                                <td>{v.dropReason || "-"}</td>

                                                {vendorProfile?.accessToApp === "C" && (
                                                    <>
                                                        <td>
                                                            <button
                                                                onClick={() => handleRefund(v)}
                                                                style={{
                                                                    backgroundColor: "#2196F3",
                                                                    color: "white",
                                                                    padding: "6px 10px",
                                                                    borderRadius: "6px",
                                                                    border: "none"
                                                                }}
                                                            >
                                                                💸 Refund
                                                            </button>

                                                            <button
                                                                onClick={() => handleUndoDrop(v)}
                                                                style={{
                                                                    backgroundColor: "#FF9800",
                                                                    color: "white",
                                                                    borderRadius: "6px",
                                                                    border: "none"
                                                                }}
                                                            >
                                                                ⬅️ Undo
                                                            </button>
                                                        </td>
                                                    </>
                                                )}

                                            </tr>
                                        );
                                    })}

                                    {filteredBookings.length === 0 && (
                                        <tr>
                                            <td colSpan={11} style={{ textAlign: "center", padding: "20px" }}>
                                                No dropped vendor bookings found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pagination Controls */}
                    <Pagination 
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                    />

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
                            width: "50px",
                            height: "100px",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                            cursor: "pointer",
                            color: "black",
                        }} className="scroll-btn"
                    >
                        ▶
                    </button>

                </div>
            </div>

            <div style={{ marginBottom: "50px" }}></div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
        </div>
    );
};

export default VendorTable;
