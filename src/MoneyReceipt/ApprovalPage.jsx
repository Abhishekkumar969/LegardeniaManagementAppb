import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebaseConfig";
import { collection, updateDoc, doc, onSnapshot, getDocs, getDoc } from "firebase/firestore";
import BackButton from "../components/BackButton";
import { getAuth } from "firebase/auth";
import { useNavigate } from 'react-router-dom';
import BottomNavigationBar from "../components/BottomNavigationBar";

export default function ApprovalPage() {
    const navigate = useNavigate();
    const [receipts, setReceipts] = useState([]);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
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

    // 🔹 Fetch all pending receipts
    useEffect(() => {
        const monthsRef = collection(db, "moneyReceipts");

        const unsubscribe = onSnapshot(monthsRef, (monthsSnap) => {
            let allReceipts = [];

            monthsSnap.forEach((monthDoc) => {
                const monthData = monthDoc.data(); // receipts as map
                Object.entries(monthData).forEach(([receiptId, receipt]) => {
                    if (receipt.approval === "No") {
                        allReceipts.push({
                            mapId: receiptId, // Firestore map key
                            ...receipt,
                            month: monthDoc.id, // e.g. "Sep2025"
                        });
                    }
                });
            });

            // Sort by createdAt desc safely
            allReceipts.sort(
                (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
            );

            setReceipts(allReceipts);
            setMessage(
                allReceipts.length === 0 ? "✅ All receipts are approved." : ""
            );
        });

        return () => unsubscribe();
    }, []);

    // 🔹 Get current approver's name
    const getApproverName = async () => {
        const auth = getAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) return "Unknown";

        try {
            const usersRef = collection(db, "usersAccess");
            const snap = await getDocs(usersRef);
            let approver = "Unknown";
            snap.forEach((docSnap) => {
                if (
                    docSnap.data().email?.toLowerCase() ===
                    currentUser.email.toLowerCase()
                ) {
                    approver = docSnap.data().name || "Unknown";
                }
            });
            return approver;
        } catch (err) {
            console.error("Error fetching approver name:", err);
            return "Unknown";
        }
    };

    // ✅ Approve single receipt
    const approveReceipt = async (month, mapId) => {
        setLoading(true);
        try {
            const approvedByName = await getApproverName();
            const monthRef = doc(db, "moneyReceipts", month);

            // Get current month data
            const monthSnap = await getDoc(monthRef);
            if (!monthSnap.exists()) throw new Error("Month document not found");

            const monthData = monthSnap.data();

            // Update only the specific receipt
            if (monthData[mapId]) {
                await updateDoc(monthRef, {
                    [mapId]: {
                        ...monthData[mapId],
                        approval: "Accepted",
                        approvedBy: approvedByName,
                    },
                });
            }
        } catch (error) {
            console.error("Error updating approval:", error);
            alert("⚠ Error updating approval.");
        } finally {
            setLoading(false);
        }
    };

    // ✅ Approve all receipts
    const approveAllReceipts = async () => {
        if (receipts.length === 0) return;
        setLoading(true);
        try {
            const approvedByName = await getApproverName();

            // Group by month
            const grouped = receipts.reduce((acc, r) => {
                if (!acc[r.month]) acc[r.month] = [];
                acc[r.month].push(r.mapId);
                return acc;
            }, {});

            for (const [month, ids] of Object.entries(grouped)) {
                const monthRef = doc(db, "moneyReceipts", month);
                const monthSnap = await getDoc(monthRef);
                if (!monthSnap.exists()) continue;

                const monthData = monthSnap.data();
                const updatedMonthData = { ...monthData };

                ids.forEach((mapId) => {
                    if (updatedMonthData[mapId]) {
                        updatedMonthData[mapId] = {
                            ...updatedMonthData[mapId],
                            approval: "Accepted",
                            approvedBy: approvedByName,
                        };
                    }
                });

                await updateDoc(monthRef, updatedMonthData);
            }
        } catch (error) {
            console.error("Error approving all:", error);
            alert("⚠ Error approving all receipts.");
        } finally {
            setLoading(false);
        }
    };

    // 🔹 Format date in IST
    const formatDate = (date) => {
        if (!date) return "-";
        const d = new Date(date);
        // Convert to IST
        const istDate = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
        return istDate.toISOString().split("T")[0].split("-").reverse().join("-"); // DD-MM-YYYY
    };

    const scrollRef = useRef(null);
    const scrollInterval = useRef(null);

    const startScroll = (direction) => {
        if (scrollRef.current) {
            const step = direction === 'left' ? -100 : 100;
            scrollInterval.current = setInterval(() => {
                scrollRef.current.scrollBy({ left: step, behavior: 'auto' });
            }, 70);
        }
    };

    const stopScroll = () => {
        clearInterval(scrollInterval.current);
    };

    return (
        <div className="page-scroller">
            <div style={{ maxWidth: "95%", margin: "0 auto", padding: "10px" }}>
                <div style={{ marginBottom: "60px" }}>
                    <BackButton />
                </div>

                <h3 style={{ textAlign: "center", marginBottom: "15px", fontSize: "24px" }}>
                    📜 Pending Approvals
                </h3>

                {message && (
                    <p style={{ textAlign: "center", color: "blue", fontSize: "13px" }}>
                        {message}
                    </p>
                )}

                {receipts.length > 0 && (
                    <div style={{ textAlign: "center", marginBottom: "15px" }}>
                        <button
                            onClick={approveAllReceipts}
                            disabled={loading}
                            style={{
                                background: "#5bbf0a",
                                color: "#ffffffcc",
                                padding: "12px 20px",
                                border: "none",
                                borderRadius: "6px",
                                cursor: loading ? "not-allowed" : "pointer",
                                fontSize: "20px",
                                fontWeight: "800"
                            }}
                        >
                            {loading ? "Approving..." : "✅ Approve All"}
                        </button>
                    </div>
                )}

                {receipts.length > 0 && (
                    <div className="table-scroll-container"
                        id="lead-table-scroll"
                        ref={scrollRef} style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr
                                    style={{
                                        border: "1px solid #ccc",
                                        padding: "8px 6px",
                                        background: "#31b3ff",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>SL.</th>
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>Auto SL. No</th>
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>Manual SL. No</th>
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>Party Name</th>
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>Amount</th>
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>Mode</th>
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>Cash</th>
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>Debit</th>
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>Date-Time</th>
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>Particular</th>
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>Description</th>
                                    <th style={{ fontWeight: "800", border: '2px solid #ffffff' }}>Approve</th>
                                </tr>
                            </thead>
                            <tbody>
                                {receipts.map((r, index) => (
                                    <tr key={`${r.month}-${r.mapId}`} style={{ whiteSpace: "nowrap" }}>
                                        <td style={{ color: "red", fontWeight: "500", border: '2px solid #43a3e8' }}>{receipts.length - index}</td>
                                        <td style={{ color: "red", fontWeight: "500", border: '2px solid #43a3e8' }}>{r.slNo || "-"}</td>
                                        <td style={{ color: "red", fontWeight: "500", border: '2px solid #43a3e8' }}>{r.manualSlNo || "-"}</td>
                                        <td style={{ color: "red", fontWeight: "500", border: '2px solid #43a3e8' }}>{r.customerName || r.partyName || "-"}</td>
                                        <td style={{ color: "red", fontWeight: "500", border: '2px solid #43a3e8' }}>₹{r.amount || 0} </td>
                                        <td style={{ color: "red", fontWeight: "500", border: '2px solid #43a3e8' }}>{r.mode || "-"} </td>
                                        <td style={{ color: "red", fontWeight: "500", border: '2px solid #43a3e8' }}>{r.cashTo} </td>
                                        <td style={{ color: "red", fontWeight: "500", border: '2px solid #43a3e8' }}>{r.paymentFor === "Debit" ? "Debit" : " "} </td>
                                        <td style={{ color: "red", fontWeight: "500", border: '2px solid #43a3e8' }}>
                                            <span>{formatDate(r.createdAt)}</span>
                                            <br />
                                            {r.createdAt && (
                                                <span style={{ fontSize: "0.85em", color: "#ff0000" }}>
                                                    {new Date(r.createdAt).toLocaleTimeString("en-IN", {
                                                        timeZone: "Asia/Kolkata",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                        hour12: true,
                                                    })}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ color: "red", border: '2px solid #8e8e8eff' }}>{r.particularNature || "-"}</td>
                                        <td style={{ color: "red", border: '2px solid #8e8e8eff' }}>{r.description || "-"}</td>
                                        <td style={{ border: '2px solid #8e8e8eff', padding: "0px", margin: "0px" }}>
                                            <button
                                                onClick={() => approveReceipt(r.month, r.mapId)}
                                                disabled={loading}
                                                style={{
                                                    background: "#5bbf0a20",
                                                    color: "#fff",
                                                    padding: "0px",
                                                    margin: "0px",
                                                    fontSize: "40px",
                                                    border: "none",
                                                    borderRadius: "4px",
                                                    cursor: loading ? "not-allowed" : "pointer",
                                                }}
                                            >
                                                ✅
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div style={{ marginBottom: "50px" }}></div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />

            {/* Left Scroll Button */}
            <button
                onMouseEnter={() => startScroll('left')}
                onMouseLeave={stopScroll}
                style={{
                    position: "fixed",
                    left: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 999,
                    background: "rgba(255, 255, 255, 0.33)",
                    border: "1px solid #ccc",
                    borderRadius: "5px",
                    width: "20px",
                    height: "80px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                    cursor: "pointer",
                    color: "black",
                }} className="scroll-btn"
            >
                ◀
            </button>

            {/* Right Scroll Button */}
            <button
                onMouseEnter={() => startScroll('right')}
                onMouseLeave={stopScroll}
                style={{
                    position: "fixed",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 999,
                    background: "rgba(255, 255, 255, 0.33)",
                    border: "1px solid #ccc",
                    borderRadius: "5px",
                    width: "20px",
                    height: "80px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                    cursor: "pointer",
                    color: "black",
                }} className="scroll-btn"
            >
                ▶
            </button>
        </div>
    );
}
