import React, { useEffect, useState } from 'react';
import { collection, getDocs, deleteDoc, doc, updateDoc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import '../styles/UserAccessTable.css';
import BackButton from "../components/BackButton";
import Modal from 'react-modal';
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import BottomNavigationBar from "../components/BottomNavigationBar";

Modal.setAppElement('#root');

const UserAccessPanel = () => {
    const navigate = useNavigate();
    const [approvedUsers, setApprovedUsers] = useState([]);
    const [accessRequests, setAccessRequests] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadingRequests, setLoadingRequests] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [prebookings, setPrebookings] = useState([]);
    const [selectedPrebookingIds, setSelectedPrebookingIds] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [users, setUsers] = useState([]);
    const [showBankAssign, setShowBankAssign] = useState(false);
    const [selectedBankUsers, setSelectedBankUsers] = useState([]);
    const [showLockerAssign, setShowLockerAssign] = useState(false);
    const [selectedLockerUsers, setSelectedLockerUsers] = useState([]);
    const [userAppType, setUserAppType] = useState(null);
    const [showAddBankModal, setShowAddBankModal] = useState(false);
    const [bankNames, setBankNames] = useState([""]);
    const [showAccessModal, setShowAccessModal] = useState(false);
    const [selectedSection, setSelectedSection] = useState("");
    const [selectedItem, setSelectedItem] = useState("");
    const [selectedAccess, setSelectedAccess] = useState([]);
    const [allAccess, setAllAccess] = useState([]);
    const [accessCounts, setAccessCounts] = useState({});
    const [bookingAccessRoles, setBookingAccessRoles] = useState({ bookRecord: [] });
    const [panelAccessData, setPanelAccessData] = useState({});

    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;

        // --- Live subscriptions array for cleanup ---
        const unsubscribers = [];

        try {
            /** 🔸 1. Listen to accountant documents (BankNames, AssignBank, AssignLocker) */
            const accountantRefs = [
                doc(db, "accountant", "BankNames"),
                doc(db, "accountant", "AssignBank"),
                doc(db, "accountant", "AssignLocker"),
            ];

            accountantRefs.forEach((ref, index) => {
                const unsub = onSnapshot(ref, (snap) => {
                    if (!snap.exists()) return;
                    const data = snap.data();
                    if (index === 0) setBankNames(data.banks || []);
                    if (index === 1) setSelectedBankUsers(data.users || []);
                    if (index === 2) setSelectedLockerUsers(data.users || []);
                });
                unsubscribers.push(unsub);
            });

            /** 🔸 2. Listen to all usersAccess (auto-updates approved + allAccess + userAppType) */
            const unsubUsers = onSnapshot(collection(db, "usersAccess"), (snap) => {
                const allUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                const nonAdminUsers = allUsers.filter((u) => u.accessToApp !== "A");

                setUsers(nonAdminUsers);
                setApprovedUsers(nonAdminUsers.filter((u) => u.accessToApp && u.accessToApp !== "A"));
                setLoadingUsers(false);

                // Current logged-in user’s app type
                if (user) {
                    const currentUser = allUsers.find((u) => u.id === user.email);
                    if (currentUser) setUserAppType(currentUser.accessToApp);
                }

                // Unique accessToApp values
                const accessArr = allUsers
                    .map((u) => u.accessToApp || [])
                    .flat()
                    .filter(Boolean);
                setAllAccess([...new Set(accessArr)]);
            });
            unsubscribers.push(unsubUsers);

            /** 🔸 3. Listen to pending access requests */
            const unsubRequests = onSnapshot(collection(db, "accessRequests"), (snap) => {
                const requestsData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

                setAccessRequests(prev => {
                    const localMap = {};
                    prev.forEach(r => {
                        localMap[r.email] = r.currentApp;
                    });

                    return requestsData.map(r => ({
                        ...r,
                        currentApp: localMap[r.email] || r.currentApp || "G",
                    }));
                });

                setLoadingRequests(false);
            });

            unsubscribers.push(unsubRequests);

            /** 🔸 4. Listen to panelAccess for live access counts */
            const unsubPanel = onSnapshot(collection(db, "pannelAccess"), (snap) => {
                const counts = {};
                const fullData = {};

                snap.forEach((docSnap) => {
                    const data = docSnap.data();
                    fullData[docSnap.id] = data;

                    if (docSnap.id === "Bookings") {
                        setBookingAccessRoles({
                            book: data.Book || [],
                            bookRecord: data["Book Record"] || [],
                        });
                    }

                    Object.entries(data).forEach(([key, value]) => {
                        counts[`${docSnap.id}-${key}`] = Array.isArray(value) ? value.length : 0;
                    });
                });

                setPanelAccessData(fullData);   // 🔥 REQUIRED
                setAccessCounts(counts);
            });
            unsubscribers.push(unsubPanel);

        } catch (err) {
            console.error("❌ Real-time subscription error:", err);
        }

        return () => unsubscribers.forEach((unsub) => unsub && unsub());
    }, []);

    const canShowBookedAutoEdit = (accessToApp) => {
        return (
            bookingAccessRoles.bookRecord.includes(accessToApp)
        );
    };

    const handleAddBankClick = () => setShowAddBankModal(true);
    const addBankInput = () => setBankNames(prev => [...prev, ""]);
    const updateBankName = (index, value) =>
        setBankNames(prev => prev.map((b, i) => (i === index ? value : b)));

    const saveBanks = async () => {
        try {
            const filteredBanks = bankNames.filter(b => b.trim());
            if (!filteredBanks.length) return alert("Add at least one bank name!");
            await setDoc(doc(db, "accountant", "BankNames"), {
                banks: filteredBanks,
                updatedAt: new Date().toISOString(),
            });
            setShowAddBankModal(false);
            alert("✅ Banks saved!");
        } catch (err) {
            console.error(err);
            alert("❌ Error saving banks");
        }
    };

    const openEditPopup = async (user) => {
        setSelectedUser(user);
        setShowEditModal(true);

        const snapshot = await getDocs(collection(db, 'prebookings'));
        const allPrebookings = [];

        snapshot.forEach((docSnap) => {
            const monthId = docSnap.id;
            const monthData = docSnap.data();
            Object.entries(monthData).forEach(([bookingId, bookingData]) => {
                allPrebookings.push({ id: bookingId, monthId, ...bookingData });
            });
        });

        setPrebookings(allPrebookings);
        setSelectedPrebookingIds(user.editablePrebookings || []);
    };

    useEffect(() => {
        const interval = setInterval(async () => {
            const now = new Date();

            for (const user of approvedUsers) {
                if (user.editData === "enable" && user.editExpiry) {
                    const expiry = new Date(user.editExpiry);

                    // If expiry time has passed
                    if (now >= expiry) {
                        try {
                            const userRef = doc(db, "usersAccess", user.email);
                            await updateDoc(userRef, {
                                editablePrebookings: [],
                                editData: "disable",
                                editExpiry: null,
                            });

                            setApprovedUsers(prev =>
                                prev.map(u =>
                                    u.email === user.email
                                        ? { ...u, editablePrebookings: [], editData: "disable", editExpiry: null }
                                        : u
                                )
                            );

                            console.log(`⏰ Auto-disabled edit access for ${user.email}`);
                        } catch (err) {
                            console.error("❌ Error auto-disabling edit access:", err);
                        }
                    }
                }
            }
        }, 10 * 60 * 1000); // ✅ check every 10 minutes

        return () => clearInterval(interval);
    }, [approvedUsers]);

    const saveEditPermissions = async () => {
        try {
            const userRef = doc(db, 'usersAccess', selectedUser.email);

            const now = new Date();
            const minutes = selectedUser.editMinutes || 10;

            // Set expiry timestamp in ISO format
            const expiryTime = new Date(now.getTime() + minutes * 60 * 1000);

            await updateDoc(userRef, {
                editablePrebookings: selectedPrebookingIds,
                editData: "enable",
                editExpiry: expiryTime.toISOString(), // <-- new field
            });

            setApprovedUsers(prev =>
                prev.map(user =>
                    user.email === selectedUser.email
                        ? { ...user, editablePrebookings: selectedPrebookingIds, editData: "enable", editExpiry: expiryTime.toISOString() }
                        : user
                )
            );

            setShowEditModal(false);
        } catch (err) {
            console.error(err);
            alert("Error saving permissions.");
        }
    };

    const toggleAccess = async (email, currentAccess) => {
        try {
            const newAccess = currentAccess === "enable" ? "disable" : "enable";
            await updateDoc(doc(db, "usersAccess", email), { access: newAccess });
            setApprovedUsers(prev =>
                prev.map(u =>
                    u.email === email ? { ...u, access: newAccess } : u
                )
            );
        } catch (err) {
            console.error(err);
            alert("Error toggling access.");
        }
    };

    const handleApprove = async (request) => {
        try {
            // Get current UTC time
            const now = new Date();

            // Convert to IST (UTC + 5:30)
            const istOffset = 5.5 * 60; // minutes
            const istTime = new Date(now.getTime() + istOffset * 60 * 1000).toISOString();

            // Save user access with IST timestamp
            await setDoc(doc(db, 'usersAccess', request.email), {
                name: request.name,
                email: request.email,
                accessToApp: request.currentApp,
                access: "enable",
                editData: "disable",
                approvedAt: istTime,
            });

            // Delete request from accessRequests
            await deleteDoc(doc(db, 'accessRequests', request.email));

            // Update state
            setAccessRequests(prev => prev.filter(r => r.email !== request.email));
            setApprovedUsers(prev => [
                ...prev,
                {
                    name: request.name,
                    email: request.email,
                    accessToApp: request.currentApp,
                    access: "enable",
                    editData: "disable",
                    approvedAt: istTime,
                },
            ]);
        } catch (err) {
            console.error(err);
            alert("Error approving request.");
        }
    };

    const handleReject = async (request) => {
        try {
            await deleteDoc(doc(db, 'accessRequests', request.email));
            setAccessRequests(prev => prev.filter(r => r.email !== request.email));
            alert(`❌ Rejected request from ${request.name}`);
        } catch (err) {
            console.error(err);
            alert("Error rejecting request.");
        }
    };

    const openAccessModal = async (section, item) => {
        setSelectedSection(section);
        setSelectedItem(item);

        const docRef = doc(db, "pannelAccess", section);
        const docSnap = await getDoc(docRef);
        setSelectedAccess(docSnap.exists() ? docSnap.data()[item] || [] : []);
        setShowAccessModal(true);
    };

    const saveSelectedAccess = async () => {
        try {
            const docRef = doc(db, "pannelAccess", selectedSection);
            const docSnap = await getDoc(docRef);
            const currentData = docSnap.exists() ? docSnap.data() : {};

            await setDoc(
                docRef,
                { ...currentData, [selectedItem]: selectedAccess },
                { merge: true }
            );

            setAccessCounts(prev => ({
                ...prev,
                [`${selectedSection}-${selectedItem}`]: selectedAccess.length,
            }));

            setShowAccessModal(false);
            setSelectedAccess([]);
        } catch (err) {
            console.error("Error saving access:", err);
            alert("❌ Error saving access");
        }
    };

    const getTextColor = (hex) => {
        const c = hex.substring(1);
        const rgb = parseInt(c, 16);
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        return luminance > 180 ? "#000000" : "#ffffff";
    };

    const accessSections = {
        ReportSection: [
            { label: "Daily Report", key: "DailyReport", color: "#f668eeff", textColor: getTextColor("#e33adb") },
            { label: "Balance Report", key: "BalanceReport", color: "#f668eeff", textColor: getTextColor("#e33adb") },
        ],
        Bookings: [
            { label: "Booked Dates", key: "Dates", color: "#fbc169ff", textColor: getTextColor("#ff7b00ff") },
            // { label: "AllBookingDatesList", key: "AllBookingDatesList", color: "#fbc169ff", textColor: getTextColor("#ff7b00ff") },
            { label: "Enquiry", key: "Enquiry", color: "#fbc169ff", textColor: getTextColor("#ff9900") },
            { label: "Lead", key: "Lead", color: "#fbc169ff", textColor: getTextColor("#ff6600") },
            { label: "Book", key: "Book", color: "#fbc169ff", textColor: getTextColor("#ffcc66") },
            // { label: "Rooms", key: "Rooms", color: "#fbc169ff", textColor: getTextColor("#ffcc66") },
            { label: "Checklist", key: "Checklist", color: "#fbc169ff", textColor: getTextColor("#ffcc66") },
            { label: "Enquiry Record", key: "Enquiry Record", color: "#fbc169ff", textColor: getTextColor("#ffb84d") },
            { label: "Lead Record", key: "Lead Record", color: "#fbc169ff", textColor: getTextColor("#ffe6b3") },
            { label: "Book Record", key: "Book Record", color: "#fbc169ff", textColor: getTextColor("#fff2cc") },
            { label: "Past Enquiry", key: "Past Enquiry", color: "#fbc169ff", textColor: getTextColor("#fff9e6") },
            { label: "Dropped Leads", key: "Dropped Leads", color: "#fbc169ff", textColor: getTextColor("#fff9e6") },
            { label: "Cancelled Bookings", key: "Cancelled Bookings", color: "#fbc169ff", textColor: getTextColor("#fff9e6") },
            { label: "Checklist", key: "Checklist", color: "#fbc169ff", textColor: getTextColor("#fff9e6") },
        ],
        Receipts: [
            { label: "Receipt", key: "Receipt", color: "#f49fd1", textColor: getTextColor("#e33adb") },
            { label: "Voucher", key: "Voucher", color: "#f49fd1", textColor: getTextColor("#f062c0") },
            { label: "Record", key: "Record", color: "#f49fd1", textColor: getTextColor("#f49fd1") },
            { label: "Record Stats", key: "RecordStats", color: "#f49fd1", textColor: getTextColor("#f49fd1") },
            { label: "Receipt Approve", key: "Approve", color: "#f49fd1", textColor: getTextColor("#f7c3e0") },
        ],
        Ledger: [
            { label: "Salary Ledger", key: "SalaryLedger", color: "#a9f67fff", textColor: getTextColor("#49ab10") },
            { label: "Vendor Ledger", key: "VendorLedger", color: "#a9f67fff", textColor: getTextColor("#7acc4d") },
        ],
        Utilities: [
            { label: "Whatsapp Message", key: "WhatsappMessage", color: "#80cfd6", textColor: getTextColor("#0393a7") },
            { label: "Menu", key: "Menu", color: "#80cfd6", textColor: getTextColor("#0393a7") },
            { label: "All Dates", key: "All Dates", color: "#80cfd6", textColor: getTextColor("#4db8bf") },
            { label: "GST", key: "GST", color: "#80cfd6", textColor: getTextColor("#80cfd6") },
            { label: "Inventory", key: "Inventory", color: "#80cfd6", textColor: getTextColor("#80cfd6") },
        ],
        Vendor: [
            { label: "UpComing", key: "UpComing", color: "#ff8383ff", textColor: getTextColor("#e33a6d") },
            { label: "Booked", key: "Booked", color: "#ff8383ff", textColor: getTextColor("#e36190") },
            { label: "Dropped", key: "Dropped", color: "#ff8383ff", textColor: getTextColor("#e88fb5") },
        ],
        Decoration: [
            { label: "UpComings", key: "UpComing", color: "#b473e3", textColor: getTextColor("#e33adb") },
            { label: "Booked", key: "Booked", color: "#b473e3", textColor: getTextColor("#8f3ae3") },
            { label: "Dropped", key: "Dropped", color: "#b473e3", textColor: getTextColor("#b473e3") },
        ],
        Catering: [
            { label: "Assign", key: "Assign", color: "#83d2d1ff", textColor: getTextColor("#e33adb") },
            { label: "Records", key: "Records", color: "#83d2d1ff", textColor: getTextColor("#8f3ae3") },
        ],
        Settings: [
            { label: "Business Stats", key: "Business", color: "#fba472ff", textColor: getTextColor("#e33adb") },
            { label: "Access", key: "Access", color: "#fba472ff", textColor: getTextColor("#8f3ae3") },
            { label: "Data Backup", key: "Backup", color: "#fba472ff", textColor: getTextColor("#8f3ae3") },
        ],
    };

    const roleNames = {
        B: "📊 Manager",
        C: "📦 Event Manager",
        D: "🤝 Partner",
        E: "🎉 Decoration Manager",
        F: "💰 Accountant",
        G: "👩‍💻 User",
        H: "📞 Enquiry Executive",
        O: "🏛️ Official",
        I: "👩‍💻 Accounts Manager"
    };

    const UserAccessBtns = {
        padding: "16px",
        color: "white",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontWeight: "bold",
        boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        transition: "0.3s",
        marginBottom: "10px",
        marginRight: '10px'
    };

    const updateUserRole = async (email, newRole) => {
        try {
            await updateDoc(doc(db, "usersAccess", email), {
                accessToApp: newRole,
                updatedAt: new Date().toISOString(),
            });

            setApprovedUsers(prev =>
                prev.map(u =>
                    u.email === email ? { ...u, accessToApp: newRole } : u
                )
            );
        } catch (err) {
            console.error("Error updating role:", err);
            alert("❌ Role update failed");
        }
    };

    const updateRequestedRole = (email, newRole) => {
        setAccessRequests(prev =>
            prev.map(r =>
                r.email === email
                    ? { ...r, currentApp: newRole }
                    : r
            )
        );
    };

    const getRoleWiseAccess = () => {
        const roleMap = {};

        Object.entries(panelAccessData || {}).forEach(([section, items]) => {
            Object.entries(items || {}).forEach(([itemKey, roles]) => {
                roles.forEach(role => {
                    if (!roleMap[role]) roleMap[role] = [];
                    roleMap[role].push({
                        section,
                        itemKey
                    });
                });
            });
        });

        return roleMap;
    };

    const MiniList = ({ items, renderItem }) => (
        <div
            style={{
                marginTop: "8px",
                background: "#ffffff",
                borderRadius: "6px",
                padding: "6px",
                fontSize: "12px",
                color: "#000",
            }}
        >
            {items.length > 0 ? (
                <ol style={{ margin: "4px 0 0", paddingLeft: "16px" }}>
                    {items.map(renderItem)}
                </ol>
            ) : (
                <div style={{ fontStyle: "italic", color: "#666" }}>
                    No data
                </div>
            )}
        </div>
    );

    return (
        <div className="page-scroller">
            <div className="access-panel-wrapper">
                <div> <BackButton />  </div>

                <div className="assign-container access-requests">
                    <h2 className="assign-title">🧑‍💼 Access Requests</h2>
                    {loadingRequests ? (
                        <p>Loading requests...</p>
                    ) : accessRequests.length === 0 ? (
                        <p style={{ display: "flex", justifyContent: "center" }}>No Access Requests Available.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="assign-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>App Requested</th>
                                        <th>Requested At</th>
                                        <th>Approve</th>
                                        <th>Email</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {accessRequests.map((r, i) => (
                                        <tr key={i}>
                                            <td>{r.name}</td>
                                            <td>
                                                <select
                                                    value={r.currentApp || "G"}
                                                    onChange={(e) =>
                                                        updateRequestedRole(r.email, e.target.value)
                                                    }
                                                    style={{
                                                        padding: "6px",
                                                        borderRadius: "6px",
                                                        border: "1px solid #ccc",
                                                        fontWeight: "bold",
                                                        cursor: "pointer",
                                                        background: "#f8f8f8"
                                                    }}
                                                >
                                                    {Object.entries(roleNames).map(([key, label]) => (
                                                        <option key={key} value={key}>
                                                            {label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>

                                            <td>
                                                {new Date(r.requestedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}{" "}
                                                {new Date(r.requestedAt).toLocaleTimeString("en-IN", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: true,
                                                    timeZone: "Asia/Kolkata",
                                                })}
                                            </td>

                                            <td className="button-group">
                                                <div>
                                                    <button
                                                        className="button approve"
                                                        onClick={() => handleApprove(r)}
                                                    >
                                                        Approve
                                                    </button>
                                                </div>
                                                <div style={{ display: 'none' }}>
                                                    <button
                                                        className="button reject"
                                                        onClick={() => handleReject(r)}
                                                    >
                                                        ❌
                                                    </button>
                                                </div>
                                            </td>
                                            <td>{r.email}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="assign-container approved-users">
                    <h2 className="assign-title">✅ Approved Users</h2>
                    {loadingUsers ? (
                        <p>Loading approved users...</p>
                    ) : approvedUsers.length === 0 ? (
                        <p>No approved users found.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="assign-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>App Role</th>
                                        <th>Always Edit Booked</th>
                                        <th>Timer Edit Booked</th>
                                        <th>Id Premission</th>
                                        <th>Email</th>
                                        <th>Approved At</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {approvedUsers.map((u, i) => (
                                        <tr key={i}>
                                            <td style={{ color: "black", fontSize: "15px", fontWeight: "700" }}>{u.name}</td>

                                            <td>
                                                <div style={{ display: "flex", justifyContent: "center" }}>
                                                    <select
                                                        value={u.accessToApp}
                                                        onChange={(e) => updateUserRole(u.email, e.target.value)}
                                                        style={{
                                                            padding: "6px",
                                                            borderRadius: "6px",
                                                            border: "1px solid #ccc",
                                                            fontWeight: "bold",
                                                            cursor: "pointer",
                                                            background: "#f8f8f8",
                                                            width: "230px"
                                                        }}
                                                    >
                                                        {Object.entries(roleNames).map(([key, label]) => (
                                                            <option key={key} value={key}>
                                                                {label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </td>

                                            {/* 🔹 Always Edit Toggle Column */}
                                            <td>
                                                {canShowBookedAutoEdit(u.accessToApp) ? (
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            padding: "4px 0",
                                                        }}
                                                    >
                                                        <div
                                                            onClick={async () => {
                                                                try {
                                                                    const newStatus = u.alwayEdit === "On" ? "Off" : "On";
                                                                    const userRef = doc(db, "usersAccess", u.email);
                                                                    await updateDoc(userRef, { alwayEdit: newStatus });
                                                                    setApprovedUsers(prev =>
                                                                        prev.map(user =>
                                                                            user.email === u.email
                                                                                ? { ...user, alwayEdit: newStatus }
                                                                                : user
                                                                        )
                                                                    );
                                                                } catch (err) {
                                                                    console.error("Error updating always edit:", err);
                                                                }
                                                            }}
                                                            style={{
                                                                position: "relative",
                                                                width: "60px",
                                                                height: "30px",
                                                                backgroundColor: u.alwayEdit === "On" ? "#4CAF50" : "#ccc",
                                                                borderRadius: "30px",
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    position: "absolute",
                                                                    top: "3px",
                                                                    left: u.alwayEdit === "On" ? "32px" : "3px",
                                                                    width: "24px",
                                                                    height: "24px",
                                                                    backgroundColor: "#fff",
                                                                    borderRadius: "50%",
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </td>

                                            <td>
                                                {canShowBookedAutoEdit(u.accessToApp) ? (
                                                    u.editData === "enable" ? (
                                                        <button
                                                            style={{ width: '100%' }}
                                                            className="button edit-enabled"
                                                            onClick={async () => {
                                                                try {
                                                                    const userRef = doc(db, "usersAccess", u.email);

                                                                    await updateDoc(userRef, {
                                                                        editablePrebookings: [],
                                                                        editData: "disable",
                                                                        editExpiry: null,
                                                                    });

                                                                    setApprovedUsers(prev =>
                                                                        prev.map(user =>
                                                                            user.email === u.email
                                                                                ? {
                                                                                    ...user,
                                                                                    editablePrebookings: [],
                                                                                    editData: "disable",
                                                                                    editExpiry: null
                                                                                }
                                                                                : user
                                                                        )
                                                                    );
                                                                } catch (err) {
                                                                    console.error(err);
                                                                    alert("Error disabling edit access.");
                                                                }
                                                            }}
                                                        >
                                                            <span style={{ color: "#000000ff" }}>Editing Enabled</span>

                                                            {u.editExpiry && (
                                                                <div style={{ marginTop: '5px', color: "#040404ff" }}>
                                                                    Edit Expiry:
                                                                    {new Date(u.editExpiry).toLocaleTimeString("en-IN", {
                                                                        hour: "2-digit",
                                                                        minute: "2-digit",
                                                                        hour12: true,
                                                                        timeZone: "Asia/Kolkata",
                                                                    })}
                                                                </div>
                                                            )}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            style={{ width: '100%' }}
                                                            className="button edit-data"
                                                            onClick={() => openEditPopup(u)}
                                                        >
                                                            Grant Access
                                                        </button>
                                                    )
                                                ) : null}
                                            </td>

                                            <td>
                                                <div style={{ display: "flex", justifyContent: "center" }}>
                                                    <button
                                                        className={`button ${u.access === "enable" ? "enable" : "disable"}`}
                                                        onClick={() => toggleAccess(u.email, u.access)}
                                                    >
                                                        {u.access === "enable" ? "Enabled" : "Disabled"}
                                                    </button>
                                                </div>
                                            </td>

                                            <td style={{ color: "black", fontSize: "15px", fontWeight: "700" }}>{u.email}</td>

                                            <td style={{ color: "black", fontSize: "15px", fontWeight: "700" }}>
                                                {new Date(u.approvedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}{" "}
                                                , {new Date(u.approvedAt).toLocaleTimeString("en-IN", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: true,
                                                    timeZone: "Asia/Kolkata",
                                                })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <Modal
                    isOpen={showEditModal}
                    onRequestClose={() => setShowEditModal(false)}
                    contentLabel="Edit Access Modal"
                    className="modal"
                    overlayClassName="overlay"
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: "10px",
                        }}
                    >
                        <div style={{
                            width: 'fit-content',
                        }}>
                            <button style={{
                                width: 'fit-content',
                                borderRadius: '1200px'
                            }}
                                onClick={() => setShowEditModal(false)}>X
                            </button>
                        </div>
                    </div>

                    <h2>Grant Edit Access For:
                        <div>Name: <span style={{ color: "#03c0b9ff" }}>{selectedUser?.name}</span>, Email: <span style={{ color: "#03c0b9ff" }}> {selectedUser?.email} </span> </div>
                    </h2>

                    {/* Search Input */}
                    <input
                        type="text"
                        placeholder="Search by name, event, mobile..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value.toLowerCase())}
                        style={{
                            width: "100%",
                            padding: "8px",
                            marginBottom: "12px",
                            border: "1px solid #ccc",
                            borderRadius: "4px",
                        }}
                    />

                    <div style={{ marginBottom: "12px", display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>

                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <label>
                                <span> Timer: </span>
                                <select
                                    value={selectedUser?.editMinutes || 10} // default 10
                                    onChange={(e) =>
                                        setSelectedUser(prev => ({ ...prev, editMinutes: parseInt(e.target.value) }))
                                    }
                                    style={{ width: '80px', marginLeft: '5px', padding: '4px' }}
                                >
                                    {Array.from({ length: 12 }, (_, i) => (i + 1) * 10).map((minutes) => (
                                        <option key={minutes} value={minutes}>
                                            {minutes} min
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>


                        {/* Select / Unselect Button */}
                        <button
                            style={{ padding: "6px 12px" }}
                            onClick={() => {
                                const filteredIds = prebookings
                                    .filter((p) => {
                                        const name = p.name?.toLowerCase() || "";
                                        const mobile1 = p.mobile1 || "";
                                        const event = p.functionType?.toLowerCase() || "";
                                        return (
                                            name.includes(searchTerm) ||
                                            event.includes(searchTerm) ||
                                            mobile1.includes(searchTerm)
                                        );
                                    })
                                    .map((p) => p.id);

                                const allSelected = filteredIds.every((id) =>
                                    selectedPrebookingIds.includes(id)
                                );

                                setSelectedPrebookingIds((prev) =>
                                    allSelected
                                        ? prev.filter((id) => !filteredIds.includes(id)) // unselect all filtered
                                        : [...new Set([...prev, ...filteredIds])] // select all filtered
                                );
                            }}
                        >
                            {(() => {
                                const filteredIds = prebookings
                                    .filter((p) => {
                                        const name = p.name?.toLowerCase() || "";
                                        const mobile1 = p.mobile1 || "";
                                        const event = p.functionType?.toLowerCase() || "";
                                        return (
                                            name.includes(searchTerm) ||
                                            event.includes(searchTerm) ||
                                            mobile1.includes(searchTerm)
                                        );
                                    })
                                    .map((p) => p.id);

                                const allSelected = filteredIds.every((id) =>
                                    selectedPrebookingIds.includes(id)
                                );

                                return allSelected ? "Unselect All (Filtered)" : "Select All (Filtered)";
                            })()}
                        </button>

                    </div>


                    {/* Prebookings List */}
                    <div
                        style={{
                            maxHeight: "25vh",
                            overflowY: "auto",
                            border: "1px solid #ccc",
                            padding: "10px",
                            borderRadius: "6px",
                        }}
                    >
                        {prebookings
                            .filter((p) => {
                                const name = p.name?.toLowerCase() || "";
                                const mobile1 = p.mobile1 || "";
                                const event = p.functionType?.toLowerCase() || "";
                                return (
                                    name.includes(searchTerm) ||
                                    event.includes(searchTerm) ||
                                    mobile1.includes(searchTerm)
                                );
                            })
                            .map((p) => (
                                <div key={p.id} style={{ marginBottom: "6px" }}>
                                    <label style={{ cursor: "pointer" }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedPrebookingIds.includes(p.id)}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setSelectedPrebookingIds((prev) =>
                                                    checked
                                                        ? [...prev, p.id]
                                                        : prev.filter((id) => id !== p.id)
                                                );
                                            }}
                                        />
                                        {" "}
                                        <strong>{p.name || "No Name"}</strong> ({p.mobile1 || "N/A"}) –{" "}
                                        {p.functionType || "No Event"}
                                    </label>
                                </div>
                            ))}
                    </div>

                    {/* Actions */}
                    <div
                        style={{
                            marginTop: "20px",
                            display: "flex",
                            justifyContent: "center",
                            gap: "10px",

                        }}
                    >
                        <button style={{ backgroundColor: 'green', width: '100%' }} onClick={saveEditPermissions}>Save Access</button>
                    </div>

                </Modal>

                <div className="assign-container access-requests">
                    <h2 className="assign-title">🎯 Assign</h2>

                    <div
                        style={{
                            marginTop: "20px",
                            display: "flex",
                            justifyContent: "center",
                            gap: "16px",
                            flexWrap: "wrap",
                        }}
                    >
                        {/* 🏦 Add Banks */}
                        <button
                            onClick={handleAddBankClick}
                            style={{
                                padding: "16px",
                                background: "#ffaa7cff",
                                color: "black",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                width: "260px",
                                textAlign: "left",
                                fontSize: "15px",
                                fontWeight: "800"
                            }}
                        >
                            ➕ Add Banks

                            <MiniList
                                items={bankNames.filter(b => b.trim())}
                                renderItem={(b, i) => <li key={i}>{b}</li>}
                            />
                        </button>

                        {/* 🏦 Assign Bank */}
                        <button
                            onClick={() => {
                                setShowBankAssign(!showBankAssign);
                                setShowLockerAssign(false);
                            }}
                            style={{
                                padding: "16px",
                                background: "#87c1ffff",
                                color: "black",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                width: "260px",
                                textAlign: "left",
                                fontSize: "15px",
                                fontWeight: "800"
                            }}
                        >
                            🏦 Assign Bank

                            <MiniList
                                items={selectedBankUsers}
                                renderItem={(u, i) => (
                                    <li key={i}>
                                        {u.name} – {roleNames[u.accessToApp]}
                                    </li>
                                )}
                            />
                        </button>

                        {/* 🔐 Assign Locker */}
                        <button
                            onClick={() => {
                                setShowLockerAssign(!showLockerAssign);
                                setShowBankAssign(false);
                            }}
                            style={{
                                padding: "16px",
                                background: "#f97cf9ff",
                                color: "black",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                width: "260px",
                                textAlign: "left",
                                fontSize: "15px",
                                fontWeight: "800"
                            }}
                        >
                            🔐 Assign Locker

                            <MiniList
                                items={selectedLockerUsers}
                                renderItem={(u, i) => (
                                    <li key={i}>
                                        {u.name} – {roleNames[u.accessToApp]}
                                    </li>
                                )}
                            />
                        </button>
                    </div>
                </div>

                <Modal
                    isOpen={showAddBankModal}
                    onRequestClose={() => setShowAddBankModal(false)}
                    contentLabel="Add Banks Modal"
                    className="modal"
                    overlayClassName="overlay"
                >
                    <h2>Add Bank Names</h2>

                    {bankNames.map((name, idx) => (
                        <div key={idx} style={{ marginBottom: "8px", display: "flex", gap: "8px" }}>
                            <input
                                type="text"
                                value={name}
                                placeholder={`Bank Name ${idx + 1}`}
                                onChange={(e) => updateBankName(idx, e.target.value)}
                                style={{ flex: 1, padding: "6px" }}
                            />
                        </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "right", gap: "10px" }}>
                        <button onClick={addBankInput} style={{ marginBottom: "10px", backgroundColor: '#3f8acbff' }}>Add Another</button>
                    </div>

                    <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
                        <button onClick={saveBanks} style={{ backgroundColor: 'green', color: 'white' }}>Save Banks</button>
                        <button onClick={() => setShowAddBankModal(false)} style={{ backgroundColor: 'gray', color: 'white' }}>Cancel</button>
                    </div>
                </Modal>

                {showBankAssign && (
                    <div className="assign-container bank-assign">
                        <button
                            onClick={() => setShowBankAssign(false)}
                            className="close-btn"
                        >
                            ✕
                        </button>
                        <h3 className="assign-title">Assign - Bank</h3>

                        <div className="table-responsive">
                            <table className="assign-table">
                                <thead>
                                    <tr>
                                        <th>Assign</th>
                                        <th>Name</th>
                                        <th>Access</th>
                                        <th>Email</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u.id}>
                                            <td className="center">
                                                <input
                                                    type="checkbox"
                                                    value={u.id}
                                                    checked={selectedBankUsers.some((user) => user.id === u.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedBankUsers((prev) => [...prev, u]);
                                                        else setSelectedBankUsers((prev) => prev.filter((user) => user.id !== u.id));
                                                    }}
                                                    className="custom-checkbox bank-checkbox"
                                                />
                                            </td>
                                            <td>{u.name}</td>
                                            <td>{roleNames[u.accessToApp] || u.accessToApp}</td>
                                            <td>{u.email}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="btn-container">
                            <button
                                onClick={async () => {
                                    try {
                                        await setDoc(doc(db, "accountant", "AssignBank"), {
                                            type: "Bank",
                                            users: selectedBankUsers.map((u) => ({
                                                id: u.id,
                                                name: u.name,
                                                email: u.email,
                                                accessToApp: u.accessToApp,
                                            })),
                                            updatedAt: new Date().toISOString(),
                                        });
                                        setShowBankAssign(false);
                                    } catch (err) {
                                        console.error(err);
                                        alert("Error saving bank assignment ❌");
                                    }
                                }}
                                className="save-btn"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                )}

                {showLockerAssign && (
                    <div className="assign-container locker-assign">
                        <button onClick={() => setShowLockerAssign(false)} className="close-btn">✕</button>
                        <h3 className="assign-title">Assign - Locker</h3>

                        <div className="table-responsive">
                            <table className="assign-table">
                                <thead>
                                    <tr>
                                        <th >Assign</th>
                                        <th >Name</th>
                                        <th >Access</th>
                                        <th >Email</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.id}>
                                            <td className="center">
                                                <input
                                                    type="checkbox"
                                                    value={u.id}
                                                    checked={selectedLockerUsers.some(user => user.id === u.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedLockerUsers(prev => [...prev, u]);
                                                        else setSelectedLockerUsers(prev => prev.filter(user => user.id !== u.id));
                                                    }}
                                                    className="custom-checkbox locker-checkbox"
                                                    onMouseOver={e => e.currentTarget.style.transform = "scale(1.2)"}  // hover effect
                                                    onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
                                                />
                                            </td>
                                            <td>{u.name}</td>
                                            <td>
                                                {roleNames[u.accessToApp] || u.accessToApp}
                                            </td>
                                            <td>{u.email}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="btn-container">
                            <button
                                onClick={async () => {
                                    try {
                                        await setDoc(doc(db, "accountant", "AssignLocker"), {
                                            type: "Locker",
                                            users: selectedLockerUsers.map(u => ({ id: u.id, name: u.name, email: u.email, accessToApp: u.accessToApp })),
                                            updatedAt: new Date().toISOString(),
                                        });
                                        setShowLockerAssign(false);
                                    } catch (err) {
                                        console.error(err);
                                        alert("Error saving locker assignment ❌");
                                    }
                                }}
                                className="save-btn"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                )}

                {/* 🧩 Icon Wise Access */}
                <div className="assign-container access-requests" >
                    <h2 className="assign-title">🧩 Icon Wise Access</h2>

                    {Object.entries(accessSections).map(([sectionName, items]) => (
                        <div key={sectionName} className="assign-container access-requests"
                            style={{
                                marginTop: "20px",
                                border: 'none',
                                boxShadow: "inset 3px 3px 20px #d8dff7ff, 2px 2px 2px #858484ff",
                                width: "auto"
                            }}
                        >
                            <h2 className="assign-title"
                                style={{ fontWeight: "800", fontSize: "20px", color: "black" }}
                            >{sectionName}</h2>

                            <div
                                style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "12px",
                                    alignItems: "flex-start", // ✅ YAHI LINE IMPORTANT HAI
                                    justifyContent: "center",
                                }}
                            >

                                {items.map(item => (
                                    <button
                                        key={item.key}
                                        onClick={() => openAccessModal(sectionName, item.key)}
                                        style={{
                                            ...UserAccessBtns,
                                            background: item.color,
                                            color: item.textColor || "black",
                                            position: "relative",
                                            minWidth: "240px",
                                            textAlign: "left",
                                        }}
                                    >
                                        {/* 🔹 Title */}
                                        <div style={{ fontWeight: "800", fontSize: "15px", color: "black" }}>
                                            {item.label}
                                        </div>

                                        {/* 🔹 Assigned roles */}
                                        <div
                                            style={{
                                                fontWeight: "800",
                                                marginTop: "6px",
                                                fontSize: "13px",
                                                opacity: 0.9,
                                                lineHeight: "1.6",
                                                color: "black",
                                                backgroundColor: "#ffffff",
                                                padding: "6px",
                                                borderRadius: "4px",
                                            }}
                                        >
                                            {panelAccessData?.[sectionName]?.[item.key]?.length > 0 ? (
                                                <ol style={{ margin: 0, paddingLeft: "18px" }}>
                                                    {panelAccessData[sectionName][item.key].map((r, index) => (
                                                        <li key={r} style={{ listStyleType: "decimal" }}>
                                                            {roleNames[r]}
                                                        </li>
                                                    ))}
                                                </ol>
                                            ) : (
                                                <span style={{ fontStyle: "italic", color: "#666" }}>
                                                    No access assigned
                                                </span>
                                            )}
                                        </div>

                                        {/* 🔹 Count badge */}
                                        {accessCounts[`${sectionName}-${item.key}`] > 0 && (
                                            <span
                                                style={{
                                                    position: "absolute",
                                                    top: "-6px",
                                                    right: "-6px",
                                                    backgroundColor: "#1384b8ff",
                                                    color: "white",
                                                    borderRadius: "50%",
                                                    fontSize: "12px",
                                                    padding: "4px 7px",
                                                    fontWeight: "bold",
                                                    boxShadow: "0 0 4px rgba(0,0,0,0.3)"
                                                }}
                                            >
                                                {accessCounts[`${sectionName}-${item.key}`]}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}

                    <Modal
                        isOpen={showAccessModal}
                        onRequestClose={() => setShowAccessModal(false)}
                        style={{
                            overlay: { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000 },
                            content: {
                                top: '50%',
                                left: '50%',
                                right: 'auto',
                                bottom: 'auto',
                                marginRight: '-50%',
                                transform: 'translate(-50%, -50%)',
                                width: '320px',
                                maxHeight: '80vh',
                                padding: '10px',
                                borderRadius: '12px',
                                boxShadow: '5px 5px 10px rgba(0, 0, 0, 1)',
                                overflowY: 'auto',
                                maxWidth: '320px',
                            }
                        }}
                    >
                        <h2 style={{ marginBottom: '10px' }}>
                            Select Access for
                            <div style={{ color: 'red' }}> {selectedItem}</div>
                        </h2>

                        {/* 🔘 Select All Button */}
                        <div style={{ textAlign: 'right', marginBottom: '10px' }}>
                            <button
                                onClick={() => {
                                    if (selectedAccess.length === allAccess.filter(acc => acc !== "A").length) {
                                        // unselect all
                                        setSelectedAccess([]);
                                    } else {
                                        // select all except Admin
                                        setSelectedAccess(allAccess.filter(acc => acc !== "A"));
                                    }
                                }}
                                style={{
                                    padding: '6px 12px',
                                    backgroundColor: selectedAccess.length === allAccess.filter(acc => acc !== "A").length
                                        ? '#f44336'
                                        : '#2196F3',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 'bold'
                                }}
                            >
                                {selectedAccess.length === allAccess.filter(acc => acc !== "A").length
                                    ? 'Unselect All'
                                    : 'Select All'}
                            </button>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            {allAccess
                                .filter(acc => acc !== "A") // exclude Admin
                                .map((acc, idx) => (
                                    <div key={idx} style={{ marginBottom: '8px' }}>
                                        <label style={{ cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                value={acc}
                                                checked={selectedAccess.includes(acc)}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setSelectedAccess(prev =>
                                                        prev.includes(val)
                                                            ? prev.filter(a => a !== val)
                                                            : [...prev, val]
                                                    );
                                                }}
                                                style={{ marginRight: '8px' }}
                                            />
                                            {roleNames[acc] || acc} {/* Show role name instead of code */}
                                        </label>
                                    </div>
                                ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                style={{
                                    padding: '10px 15px',
                                    backgroundColor: '#4CAF50',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                                onClick={saveSelectedAccess}
                            >
                                Save
                            </button>
                            <button
                                style={{
                                    padding: '10px 15px',
                                    backgroundColor: '#f44336',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                                onClick={() => setShowAccessModal(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </Modal>
                </div>

                {/* 🧩 Role Wise Access */}
                <div className="assign-container access-requests">
                    <h2 className="assign-title">🧩 Role Wise Access</h2>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                            gap: "20px",
                            marginTop: "16px",
                        }}
                    >
                        {Object.entries(getRoleWiseAccess()).map(([role, accessList]) => {
                            // 🔹 group by section
                            const grouped = accessList.reduce((acc, cur) => {
                                if (!acc[cur.section]) acc[cur.section] = [];
                                acc[cur.section].push(cur.itemKey);
                                return acc;
                            }, {});

                            return (
                                <div
                                    key={role}
                                    style={{
                                        background: "#ffffff",
                                        borderRadius: "12px",
                                        padding: "14px",
                                        boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                                        borderTop: "6px solid #4f46e5",
                                    }}
                                >
                                    {/* 🔹 Role Header */}
                                    <div
                                        style={{
                                            fontSize: "20px",
                                            fontWeight: "700",
                                            marginBottom: "12px",
                                            color: "#080808ff",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                            justifyContent: "center"
                                        }}
                                    >
                                        {roleNames[role]}
                                    </div>

                                    {/* 🔹 Section wise access */}
                                    {Object.entries(grouped).map(([section, items]) => (
                                        <div key={section} style={{ marginBottom: "12px" }}>
                                            <div
                                                style={{
                                                    fontSize: "15px",
                                                    fontWeight: "800",
                                                    color: "#7a0303ff",
                                                    marginBottom: "6px",
                                                }}
                                            >
                                                {section}
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexWrap: "wrap",
                                                    gap: "6px",
                                                }}
                                            >
                                                {items.map((item, i) => (
                                                    <span
                                                        key={i}
                                                        style={{
                                                            fontSize: "12px",
                                                            padding: "5px 10px",
                                                            borderRadius: "999px",
                                                            background: "#eef2ff",
                                                            color: "#090178ff",
                                                            fontWeight: "700",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {item}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>

            <div style={{ marginBottom: "50px" }}></div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
        </div>
    );
};

export default UserAccessPanel;
