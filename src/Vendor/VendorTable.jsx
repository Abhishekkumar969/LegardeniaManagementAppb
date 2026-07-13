import React, { useEffect, useState } from 'react';
import { getDoc, collection, onSnapshot, doc, updateDoc, arrayUnion, serverTimestamp, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import '../styles/VendorTable.css';
import BackButton from "../components/BackButton";
import { useNavigate } from 'react-router-dom';
import BottomNavigationBar from "../components/BottomNavigationBar";
import { getAuth } from "firebase/auth";

const VendorTable = () => {
    const [allBookings, setAllBookings] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedVendor] = useState(null);
    const [amount, setAmount] = useState("");
    const [showPopup, setShowPopup] = useState(false);
    const [sortOrder, setSortOrder] = useState("desc");
    const navigate = useNavigate();
    const [userAppType, setUserAppType] = useState(null);
    const [minEventAmount, setMinEventAmount] = useState(0);
    const [sortField, setSortField] = useState("enquiryDate");
    const [viewSettings, setViewSettings] = useState({
        EventAutoViewNumber: false
    });

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "viewSettings"), (snap) => {
            if (snap.exists()) {
                setViewSettings(snap.data());
            }
        });

        return () => unsub();
    }, []);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "MinAmount", "Event"), (snap) => {
            if (snap.exists()) {
                setMinEventAmount(snap.data().amount || 0);
            }
        });

        return () => unsub();
    }, []);

    const formatISTDate = (dateString) => {
        if (!dateString) return "-";
        const date = new Date(dateString);

        // Convert to IST (UTC+5:30)
        const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));

        const day = String(istDate.getDate()).padStart(2, '0');
        const month = String(istDate.getMonth() + 1).padStart(2, '0');
        const year = istDate.getFullYear();

        return `${day}-${month}-${year}`;
    };

    const toIST = (dateString) => {
        if (!dateString) return null;
        const date = new Date(dateString);
        // Add 5 hours 30 minutes offset
        return new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    };

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

    useEffect(() => {
        const vendorCollection = collection(db, "vendor");
        const prebookingsCollection = collection(db, "prebookings");

        const unsubscribeVendor = onSnapshot(
            vendorCollection,
            (vendorSnap) => {
                const vendors = [];
                vendorSnap.docs.forEach((monthDoc) => {
                    const monthData = monthDoc.data().data || monthDoc.data() || {};
                    Object.keys(monthData).forEach((key) => {
                        const v = monthData[key];
                        vendors.push({
                            id: key,
                            month: monthDoc.id,
                            ...v,
                            finalDate: v.date,
                        });
                    });
                });

                const vendorKeys = new Set();
                const makeKey = (name, contact, eventType, date) =>
                    `${(name || "").trim().toLowerCase()}|${(contact || "")
                        .replace(/\s+/g, "")
                        .replace(/[^\d]/g, "")}|${(eventType || "")
                            .trim()
                            .toLowerCase()}|${date ? new Date(date).toISOString().split("T")[0] : ""
                    }`;

                vendors.forEach((v) => {
                    const key = makeKey(
                        v.customerName,
                        v.contactNo,
                        v.eventType || v.typeOfEvent,
                        v.finalDate
                    );
                    vendorKeys.add(key);
                });

                const unsubscribePre = onSnapshot(
                    prebookingsCollection,
                    (preSnap) => {
                        const prebookings = [];
                        preSnap.docs.forEach((monthDoc) => {
                            const monthData = monthDoc.data().data || monthDoc.data() || {};
                            Object.keys(monthData).forEach((key) => {
                                const pre = monthData[key];
                                prebookings.push({
                                    id: key,
                                    month: monthDoc.id,
                                    ...pre,
                                });
                            });
                        });

                        // ✅ Get "today" in IST (00:00 IST)
                        const now = new Date();
                        const istOffset = 5.5 * 60 * 60 * 1000; // +5:30
                        const istNow = new Date(now.getTime() + istOffset);
                        istNow.setHours(0, 0, 0, 0);

                        // Filter prebookings not in vendors + only upcoming (IST)
                        const filteredPre = prebookings
                            .filter((pre) => {
                                const contact = [pre.mobile1, pre.mobile2].find(Boolean) || "";
                                const key = makeKey(
                                    pre.name,
                                    contact,
                                    pre.functionType,
                                    pre.functionDate
                                );

                                if (!pre.functionDate) return false;

                                // Convert functionDate to IST comparison base
                                const eventDate = new Date(pre.functionDate);
                                const eventIST = new Date(
                                    eventDate.getTime() + istOffset
                                );
                                eventIST.setHours(0, 0, 0, 0);

                                // ✅ NEW: amount filter
                                const total = Number(pre.grandTotal || 0);

                                return !vendorKeys.has(key) && eventIST >= istNow && total >= minEventAmount;
                            })
                            .map((pre) => {
                                const istFunctionDate = toIST(pre.functionDate); // Convert UTC → IST
                                const formattedISTDate = istFunctionDate ? istFunctionDate.toISOString() : pre.functionDate;

                                return {
                                    id: pre.id,
                                    customerName: pre.name,
                                    contactNo: pre.mobile1 || "",
                                    contactNo2: pre.mobile2 || "",
                                    address: pre.address || " ",
                                    eventType: pre.functionType,
                                    venueType: pre.venueType,

                                    enquiryDate: pre.enquiryDate || pre.createdAt || null, // 🔥 ADD THIS

                                    EventViewNumber: pre.EventViewNumber === true,

                                    date: formattedISTDate,       // store IST ISO string
                                    finalDate: formattedISTDate,  // used everywhere else in display/sort
                                    startTime: "16:00",
                                    endTime: "21:00",
                                    source: "Shangrila",
                                };
                            });


                        // Sort latest first
                        filteredPre.sort(
                            (a, b) => new Date(b.finalDate || 0) - new Date(a.finalDate || 0)
                        );

                        const unique = new Map();

                        filteredPre.forEach(item => {
                            const uniqueKey = (
                                (item.customerName || "").trim().toLowerCase() + "|" +
                                (item.contactNo || "").replace(/\D/g, "") + "|" +
                                (item.eventType || "").trim().toLowerCase() + "|" +
                                new Date(item.finalDate).toISOString().split("T")[0]
                            );

                            if (!unique.has(uniqueKey)) {
                                unique.set(uniqueKey, item);
                            }
                        });

                        setAllBookings(Array.from(unique.values()));

                    },
                    (error) => console.error("❌ Error fetching prebookings real-time:", error)
                );

                return () => unsubscribePre();
            },
            (error) => console.error("❌ Error fetching vendor real-time:", error)
        );

        return () => unsubscribeVendor();
    }, [minEventAmount]);

    const sortedBookings = [...allBookings].sort((a, b) => {
        const dateA = toIST(a[sortField] || 0);
        const dateB = toIST(b[sortField] || 0);

        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    const filteredBookings = sortedBookings
        .filter(v => {
            // ❌ Skip data if number not allowed
            const canViewNumber =
                viewSettings.EventAutoViewNumber === true || v.EventViewNumber === true;

            if (!canViewNumber) return false;

            // 🔍 Existing search logic
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            const dateStr = v.finalDate ? formatISTDate(v.finalDate) : "";

            return (
                v.customerName?.toLowerCase().includes(q) ||
                v.contactNo?.toLowerCase().includes(q) ||
                v.eventType?.toLowerCase().includes(q) ||
                dateStr.includes(q)
            );
        });

    const toggleSort = () => {
        setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    };

    const convertTo12Hour = (timeStr) => {
        if (!timeStr) return "-";
        const [hours, minutes] = timeStr.split(':').map(Number);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${hour12}:${String(minutes).padStart(2, '0')} ${ampm}`;
    };

    const handleSaveAmount = async () => {
        if (!selectedVendor || !amount) return;
        try {
            const vendorRef = doc(db, "vendor", selectedVendor.id);
            await updateDoc(vendorRef, {
                advance: arrayUnion({
                    amount: Number(amount),
                    date: new Date().toISOString(),
                }),
            });
            alert("Amount added successfully ✅");
            setAmount("");
            setShowPopup(false);
        } catch (error) {
            console.error("❌ Error updating vendor:", error);
        }
    };

    return (
        <div className="page-scroller">
            <div>
                <BackButton />
                <div style={{ marginTop: '60px' }}>
                    <div style={{ textAlign: 'center' }}><h3>📋 UpComings</h3></div>
                    <div style={{ textAlign: "center", margin: "15px 0" }}>
                        <input
                            type="text"
                            placeholder="Search by Name, Contact, Event Type, Date (dd-mm-yyyy)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: "70%", padding: "8px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "14px" }}
                        />
                    </div>
                    <div className="leads-table-container" style={{ padding: "0px", height: "fit-content", }}>
                        <div className="table-fixed-wrapper">
                            <table className="leads-table" style={{ height: "fit-content", maxHeight: "70vh" }}>
                                <thead>
                                    <tr>

                                        <th>Sl.</th>
                                        <th
                                            style={{ cursor: "pointer" }}
                                            onClick={() => {
                                                setSortField("finalDate");
                                                toggleSort();
                                            }}
                                        >
                                            Event Date {sortField === "finalDate" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                                        </th>
                                        <th>Name</th>
                                        <th
                                            style={{ cursor: "pointer" }}
                                            onClick={() => {
                                                setSortField("enquiryDate");
                                                toggleSort();
                                            }}
                                        >
                                            Booked On {sortField === "enquiryDate" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                                        </th>
                                        <th>Contact</th>
                                        <th>Contact 2</th>
                                        <th>Event Type</th>
                                        <th>Venue Type</th>
                                        <th>Time</th>
                                        {userAppType === 'C' && (
                                            <th>Book / Drop</th>
                                        )}
                                    </tr>
                                </thead>

                                <tbody>
                                    {filteredBookings.map((v, idx) => {
                                        return (
                                            <tr
                                                key={v.id}
                                                style={{
                                                    backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff"
                                                }}
                                            >
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>{filteredBookings.length - idx}</td>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>{formatISTDate(v.finalDate)}</td>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>{v.customerName}</td>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>{formatISTDate(v.enquiryDate)}</td>

                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>
                                                    {(viewSettings.EventAutoViewNumber === true || v.EventViewNumber === true) && (
                                                        <a
                                                            href={`tel:${v.contactNo}`}
                                                            style={{ color: "black", textDecoration: "none" }}
                                                        >
                                                            {v.contactNo}
                                                        </a>
                                                    )}
                                                </td>

                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>
                                                    {(viewSettings.EventAutoViewNumber === true || v.EventViewNumber === true) && (
                                                        <a
                                                            href={`tel:${v.contactNo2}`}
                                                            style={{ color: "black", textDecoration: "none" }}
                                                        >
                                                            {v.contactNo2}
                                                        </a>
                                                    )}
                                                </td>

                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>{v.eventType}</td>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>{v.venueType}</td>
                                                <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>{convertTo12Hour(v.startTime)} - {convertTo12Hour(v.endTime)}</td>

                                                {userAppType === 'C' && (
                                                    <td>
                                                        {/* Update / Book button */}
                                                        {!v.dropReason && (
                                                            <button
                                                                onClick={() => navigate("/Vendor", { state: { vendorData: v } })}
                                                                style={{
                                                                    backgroundColor: v.source === "vendor" ? "#4CAF50" : "#2196F3",
                                                                    color: "white",
                                                                    padding: "6px 10px",
                                                                    borderRadius: "6px",
                                                                }}
                                                            >
                                                                {v.source === "vendor" ? "✏️ Update" : "📘 Book"}
                                                            </button>
                                                        )}

                                                        {/* Drop / Book Again buttons */}
                                                        {v.dropReason ? (
                                                            // Book Again
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        const monthKey = toIST(v.finalDate).toLocaleString("en-US", {
                                                                            month: "short",
                                                                            year: "numeric",
                                                                        }).replace(" ", "");

                                                                        const ref = doc(db, "vendor", monthKey);
                                                                        await updateDoc(ref, {
                                                                            [`${v.id}.dropReason`]: deleteField(),
                                                                            [`${v.id}.dropAt`]: deleteField(),
                                                                        });

                                                                        alert("✅ Booking restored!");
                                                                    } catch (err) {
                                                                        console.error(err);
                                                                        alert("❌ Failed to restore booking.");
                                                                    }
                                                                }}
                                                                style={{
                                                                    backgroundColor: "#FF9800",
                                                                    color: "white",
                                                                    padding: "6px 10px",
                                                                    borderRadius: "6px",
                                                                    marginLeft: "5px",
                                                                }}
                                                            >
                                                                📘 Book Again
                                                            </button>
                                                        ) : (
                                                            // Drop
                                                            <button
                                                                onClick={async () => {
                                                                    const reason = prompt("Enter drop reason:");
                                                                    if (!reason) return;

                                                                    try {
                                                                        const monthKey = new Date(v.finalDate).toLocaleString("en-US", {
                                                                            month: "short",
                                                                            year: "numeric",
                                                                        }).replace(" ", ""); // e.g., "Apr2025"

                                                                        const ref = doc(db, "vendor", monthKey);

                                                                        if (v.source !== "vendor") {
                                                                            // Booking not yet in vendor, create month doc & add drop reason
                                                                            await setDoc(
                                                                                ref,
                                                                                {
                                                                                    [v.id]: {
                                                                                        ...v,
                                                                                        source: "vendor",
                                                                                        dropReason: reason,
                                                                                        createdAt: serverTimestamp(),
                                                                                    },
                                                                                },
                                                                                { merge: true }
                                                                            );
                                                                        } else {
                                                                            // Booking already exists, update drop reason inside month doc
                                                                            await updateDoc(ref, {
                                                                                [`${v.id}.dropReason`]: reason,
                                                                                [`${v.id}.dropAt`]: serverTimestamp(),
                                                                            });
                                                                        }

                                                                        // alert("✅ Drop reason saved!");
                                                                    } catch (err) {
                                                                        console.error(err);
                                                                        alert("❌ Failed to save drop reason.");
                                                                    }
                                                                }}
                                                                style={{
                                                                    backgroundColor: "#f44336",
                                                                    color: "white",
                                                                    padding: "6px 10px",
                                                                    borderRadius: "6px",
                                                                    marginLeft: "5px",
                                                                }}
                                                            >
                                                                ⛔ Drop
                                                            </button>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        )
                                    })}

                                </tbody>
                            </table>

                            {showPopup && (
                                <div className="popup-overlay">
                                    <div className="popup-box">
                                        <h3>Add Advance Amount</h3>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={amount}
                                            placeholder="Enter amount"
                                            onChange={(e) => {
                                                let val = e.target.value.replace(/[^0-9.]/g, "");
                                                if ((val.match(/\./g) || []).length > 1) val = val.slice(0, -1);
                                                setAmount(val);
                                            }}
                                        />
                                        <div className="popup-actions">
                                            <button onClick={handleSaveAmount}>Save</button>
                                            <button onClick={() => setShowPopup(false)}>Cancel</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: "50px" }}></div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
        </div>
    )
}

export default VendorTable;