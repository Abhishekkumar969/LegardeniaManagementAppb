import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { runTransaction, collection, getDocs, doc, updateDoc, getDoc, setDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import '../styles/MoneyReceipt.css';
import { useNavigate } from 'react-router-dom';
import BackButton from "../components/BackButton";
import { getAuth } from "firebase/auth";
import BottomNavigationBar from "../components/BottomNavigationBar";

const MoneyReceipt = () => {
    const [search, setSearch] = useState('');
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [amount, setAmount] = useState('');
    const [amountWords, setAmountWords] = useState('');
    const [mode, setMode] = useState('');
    const [nextSlNo, setNextSlNo] = useState(null);
    const [nextRefundSlNo, setNextRefundSlNo] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [receiptType, setReceiptType] = useState('Cash');
    const [paymentFor, setPaymentFor] = useState('Advance');
    const [receiver, setReceiver] = useState('');
    const [description, setDescription] = useState("");
    const [cashTo, setCashTo] = useState("Cash");
    const [bankMode, setBankMode] = useState("RTGS/NEFT");
    const [chequeNo, setChequeNo] = useState("");
    const [activeSource, setActiveSource] = useState("prebookings");
    const navigate = useNavigate();
    const [assignedUsers, setAssignedUsers] = useState([]);
    const [userAppType, setUserAppType] = useState(null);
    const [banks, setBanks] = useState([]);
    const [previousPayments, setPreviousPayments] = useState([]);
    const [otherName, setOtherName] = useState("");
    const [otherMobile, setOtherMobile] = useState("");
    const [manualSlNo, setManualSlNo] = useState("");
    const [sortOrder, setSortOrder] = useState("desc");
    const [particularNature, setParticularNature] = useState('');
    const [customParticularNature, setCustomParticularNature] = useState('');
    const [subParticularNature, setSubParticularNature] = useState('');
    const [customSubNature, setCustomSubNature] = useState('');

    const [particularOptions, setParticularOptions] = useState({
        Debit: [],
        Credit: []
    });

    const [subNatureOptions, setSubNatureOptions] = useState([]);

    const [showNaturePopup, setShowNaturePopup] = useState(false);
    const [showSubNaturePopup, setShowSubNaturePopup] = useState(false);
    const [natureSearch, setNatureSearch] = useState('');
    const [subNatureSearch, setSubNatureSearch] = useState('');

    const sortedPayments = [...previousPayments].sort((a, b) => {
        const dateA = new Date(a.receiptDate);
        const dateB = new Date(b.receiptDate);
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    const totalAmount = previousPayments.reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0
    );

    const getParticularNatureBySource = (source, description) => {
        switch (source) {
            case "vendor":
                return "Vendor Payment";
            case "decoration":
                return "Decoration Payment";
            // case "roomBookings":
            //     return "Room Bookings Payment";
            case "others":
                return "Other Payment";

            default:
                return description || "";
        }
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

    const getISTDateString = (date = new Date()) => {
        return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    };

    const formatISTDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
    };

    const [manualDate, setManualDate] = useState(getISTDateString());

    useEffect(() => {
        const unsubscribeAssignBank = onSnapshot(doc(db, "accountant", "AssignBank"), (bankSnap) => {
            let users = [];
            if (bankSnap.exists()) {
                const bankUsers = bankSnap.data().users || [];
                users = users.concat(
                    bankUsers.map(u => ({
                        name: u.name,
                        email: u.email,
                        type: "Bank"
                    }))
                );
            }

            // Remove duplicates based on email + type
            const uniqueUsers = Object.values(
                users.reduce((acc, u) => {
                    const key = `${u.email}-${u.type}`;
                    acc[key] = u;
                    return acc;
                }, {})
            );

            setAssignedUsers(uniqueUsers);
        });

        const unsubscribeBanks = onSnapshot(doc(db, "accountant", "BankNames"), (snap) => {
            if (snap.exists()) {
                setBanks(snap.data().banks || []);
            } else {
                setBanks([]);
            }
        });

        // Cleanup on unmount
        return () => {
            unsubscribeAssignBank();
            unsubscribeBanks();
        };
    }, []);

    useEffect(() => {
        const fetchUserName = async () => {
            const user = getAuth().currentUser;
            if (user) {
                const docRef = doc(db, "usersAccess", user.email);
                const snap = await getDoc(docRef);
                if (snap.exists()) setReceiver(snap.data().name || user.email);
                else setReceiver(user.email);
            }
        };
        fetchUserName();
    }, []);

    useEffect(() => {
        if (activeSource === "others") {
            setCustomers([]);
            setSelectedCustomer(null);
            return;
        }

        const fetchCustomers = async () => {
            const source = paymentFor === "Refund" ? "cancelledBookings" : activeSource;
            const res = [];

            const colSnap = await getDocs(collection(db, source));

            colSnap.forEach(docSnap => {
                const data = docSnap.data() || {};

                Object.entries(data).forEach(([id, booking]) => {
                    // 🔥 roomBookings structure support
                    if (
                        id === "updatedAt" ||
                        typeof booking !== "object" ||
                        Array.isArray(booking)
                    ) {
                        return;
                    }

                    const primaryGuest =
                        Array.isArray(booking.guests) && booking.guests.length > 0
                            ? booking.guests[0]
                            : null;

                    const prefix =
                        source === "roomBookings"
                            ? primaryGuest?.prefix || ""
                            : booking.prefix || "";

                    const name =
                        source === "roomBookings"
                            ? primaryGuest?.name || "Room Guest"
                            : booking.customerName || booking.name || "Unknown";

                    const mobile =
                        source === "roomBookings"
                            ? primaryGuest?.mobile || "-"
                            : booking.contactNo || booking.mobile1 || "-";

                    const eventType =
                        source === "roomBookings"
                            ? "Room Booking"
                            : booking.eventType || booking.functionType || "-";

                    const eventDate =
                        source === "roomBookings"
                            ? booking.fromDate || booking.bookedOn || ""
                            : booking.date || booking.functionDate || "";

                    res.push({
                        monthDoc: docSnap.id,
                        id,
                        prefix,
                        name,
                        mobile1: mobile,
                        functionType: eventType,
                        functionDate: eventDate,
                        source,
                        gstBase: booking.gstBase || 0,
                        gstAmount: booking.gstAmount || 0,
                        grandTotal: booking.grandTotal || booking.totalAmount || 0,
                    });
                });
            });

            // ✅ DEDUPLICATE (source + id)
            const uniqueMap = new Map();

            res.forEach(c => {
                const key = `${c.source}-${c.id}`;
                if (!uniqueMap.has(key)) {
                    uniqueMap.set(key, c);
                }
            });

            setCustomers([...uniqueMap.values()]);
        };

        fetchCustomers();
    }, [paymentFor, activeSource]);

    useEffect(() => {
        if (!amount) {
            setAmountWords("");
            return;
        }

        const num = parseFloat(amount);

        if (isNaN(num)) {
            setAmountWords("");
            return;
        }

        const rupees = Math.floor(num);
        const paise = Math.round((num - rupees) * 100);

        let words = "";

        if (rupees > 0) {
            words += convertNumberToWords(rupees) + " Rupees";
        }

        if (paise > 0) {
            words += (rupees > 0 ? " and " : "") +
                convertNumberToWords(paise) + " Paise";
        }

        words += " Only";

        setAmountWords(words);
    }, [amount]);

    useEffect(() => {
        if (activeSource !== "others" && selectedCustomer && paymentFor === 'Advance' && amount && mode) {
            const gstBase = Number(selectedCustomer.gstBase || 0);
            const gstAmount = Number(selectedCustomer.gstAmount || 0);
            const grandTotal = Number(selectedCustomer.grandTotal || selectedCustomer.totalAmount || 0);

            const projectedBank = gstBase + gstAmount;
            const projectedCash = grandTotal - projectedBank;

            const receivedBank = previousPayments
                .filter(p => p.mode !== 'Cash')
                .reduce((sum, p) => sum + Number(p.amount || 0), 0);
            const receivedCash = previousPayments
                .filter(p => p.mode === 'Cash')
                .reduce((sum, p) => sum + Number(p.amount || 0), 0);

            const remainingBank = projectedBank - receivedBank;
            const remainingCash = projectedCash - receivedCash;

            const inputAmount = Number(amount || 0);

            if (mode === 'Cash' && inputAmount > remainingCash) {
                alert("Pls increase your limit to take cash payment");
                setAmount("");
            } else if (mode !== 'Cash' && mode !== '' && inputAmount > remainingBank) {
                alert("Pls increase your limit to take bank payment");
                setAmount("");
            }
        }
    }, [amount, mode, selectedCustomer, previousPayments, paymentFor, activeSource]);

    const convertNumberToWords = (num) => {
        const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six',
            'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
            'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
            'Seventeen', 'Eighteen', 'Nineteen'];

        const b = ['', '', 'Twenty', 'Thirty', 'Forty',
            'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        if (num === 0) return 'Zero';

        const numToWords = (n) => {
            if (n < 20) return a[n];
            if (n < 100)
                return b[Math.floor(n / 10)] +
                    (n % 10 ? ' ' + a[n % 10] : '');
            if (n < 1000)
                return a[Math.floor(n / 100)] +
                    ' Hundred' +
                    (n % 100 ? ' and ' + numToWords(n % 100) : '');
            if (n < 100000)
                return numToWords(Math.floor(n / 1000)) +
                    ' Thousand' +
                    (n % 1000 ? ' ' + numToWords(n % 1000) : '');
            if (n < 10000000)
                return numToWords(Math.floor(n / 100000)) +
                    ' Lakh' +
                    (n % 100000 ? ' ' + numToWords(n % 100000) : '');

            return numToWords(Math.floor(n / 10000000)) +
                ' Crore' +
                (n % 10000000 ? ' ' + numToWords(n % 10000000) : '');
        };

        return numToWords(num);
    };

    const fetchNextSlNo = useCallback(async () => {
        try {
            const counterSnap = await getDoc(doc(db, 'settings', 'slCounter'));
            const data = counterSnap.exists() ? counterSnap.data() : {};
            if (receiptType === 'Cash') setNextSlNo((data.cashMoneyReceipt || 0) + 1);
            else setNextSlNo((data.moneyReceipt || 0) + 1);
        } catch (err) { console.error(err); setNextSlNo(null); }
    }, [receiptType]);

    const fetchNextRefundSlNo = useCallback(async () => {
        try {
            const counterSnap = await getDoc(doc(db, 'settings', 'slCounter'));
            const data = counterSnap.exists() ? counterSnap.data() : {};
            setNextRefundSlNo(`R${(data.refundMoneyReceipt || 0) + 1}`);
        } catch (err) { console.error(err); setNextRefundSlNo(null); }
    }, []);

    useEffect(() => { if (selectedCustomer && paymentFor === 'Refund') fetchNextRefundSlNo(); }, [selectedCustomer, paymentFor, fetchNextRefundSlNo]);
    useEffect(() => { if (selectedCustomer && paymentFor === 'Advance') fetchNextSlNo(); }, [receiptType, selectedCustomer, fetchNextSlNo, paymentFor]);

    const handleSubmit = async () => {

        const isOverall =
            !selectedCustomer &&
            (activeSource === "vendor" ||
                activeSource === "decoration" ||
                activeSource === "roomBookings");

        if (activeSource === "others") {
            if (!particularNature) {
                alert("Please select Particular Nature");
                return;
            }

            if (particularNature === "Other" && !customParticularNature.trim()) {
                alert("Please enter Particular Nature");
                return;
            }

            if (!subParticularNature) {
                alert("Please select Sub Particular Nature");
                return;
            }

            if (subParticularNature === "Other" && !customSubNature.trim()) {
                alert("Please enter Sub Particular Nature");
                return;
            }
        }

        if (
            activeSource !== "others" &&
            !isOverall &&
            (!selectedCustomer || !amount || !mode)
        ) {
            alert('Please select customer or use Overall mode');
            return;
        }

        if (activeSource !== "others" && !selectedCustomer) {
            alert("Please select customer");
            return;
        }

        if (paymentFor === 'Advance' && mode === 'Cash' && !cashTo) {
            alert('Please select where the cash will be deposited');
            return;
        }

        if (
            activeSource !== "others" &&
            !isOverall &&
            !selectedCustomer?.id
        ) {
            alert('❌ Cannot save: Customer ID is missing.');
            return;
        }

        if (activeSource !== "others" && selectedCustomer && paymentFor === 'Advance') {
            const gstBase = Number(selectedCustomer.gstBase || 0);
            const gstAmount = Number(selectedCustomer.gstAmount || 0);
            const grandTotal = Number(selectedCustomer.grandTotal || selectedCustomer.totalAmount || 0);

            const projectedBank = gstBase + gstAmount;
            const projectedCash = grandTotal - projectedBank;

            const receivedBank = previousPayments
                .filter(p => p.mode !== 'Cash')
                .reduce((sum, p) => sum + Number(p.amount || 0), 0);
            const receivedCash = previousPayments
                .filter(p => p.mode === 'Cash')
                .reduce((sum, p) => sum + Number(p.amount || 0), 0);

            const remainingBank = projectedBank - receivedBank;
            const remainingCash = projectedCash - receivedCash;

            const inputAmount = Number(amount || 0);

            if (mode === 'Cash' && inputAmount > remainingCash) {
                alert("Pls increase your limit to take cash payment");
                return;
            } else if (mode !== 'Cash' && mode !== '' && inputAmount > remainingBank) {
                alert("Pls increase your limit to take bank payment");
                return;
            }
        }

        if (isSaving) return;

        setIsSaving(true);

        try {
            const counterRef = doc(db, 'settings', 'slCounter');
            let slNo = '';

            // --- GENERATE SL NO ---
            await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                const data = counterDoc.exists() ? counterDoc.data() : {};
                if (paymentFor === 'Refund') {
                    const current = data.refundMoneyReceipt || 0;
                    slNo = `R${current + 1}`;
                    transaction.set(counterRef, { refundMoneyReceipt: current + 1 }, { merge: true });
                } else {
                    if (receiptType === 'Cash') {
                        const current = data.cashMoneyReceipt || 0;
                        slNo = `C${current + 1}`;
                        transaction.set(counterRef, { cashMoneyReceipt: current + 1 }, { merge: true });
                    } else {
                        const current = data.moneyReceipt || 0;
                        slNo = `${current + 1}`;
                        transaction.set(counterRef, { moneyReceipt: current + 1 }, { merge: true });
                    }
                }
            });

            // --- DETERMINE MONTH DOCUMENT ---
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const d = new Date(manualDate);
            const month = monthNames[d.getMonth()];
            const year = d.getFullYear();
            const monthYear = `${month}${year}`;


            const finalParticularNature =
                activeSource === "others"
                    ? (particularNature === "Other"
                        ? customParticularNature
                        : particularNature)
                    : getParticularNatureBySource(activeSource, description);

            const finalSubNature =
                subParticularNature === "Other"
                    ? customSubNature
                    : subParticularNature;

            const newPayment = {
                addedAt: new Date(new Date(manualDate).getTime() + 5.5 * 60 * 60000).toISOString(), // IST
                receiptDate: manualDate,
                amount: Number(amount || 0),
                amountWords,
                mode,
                receiver: receiver?.trim() || "Counter",
                slNo,
                manualSlNo: manualSlNo || "",
                cashTo: mode === 'Cash' ? cashTo : '',
                bankMode: mode !== 'Cash' ? bankMode : '',
                chequeNo: (mode !== 'Cash' && bankMode === 'Cheque') ? chequeNo : '',
                description,
                myName: receiver?.trim() || "Counter",
                partyName:
                    activeSource === "others"
                        ? otherName || "Others"
                        : activeSource === "roomBookings"
                            ? `${selectedCustomer?.prefix ? selectedCustomer.prefix + " " : ""}${selectedCustomer?.name || "Room Guest"}`
                            : `${selectedCustomer?.prefix ? selectedCustomer.prefix + " " : ""}${selectedCustomer?.name || "Overall Payment"}`,

                particularNature: finalParticularNature,
                subParticularNature: finalSubNature || "",

                approval: 'Accepted',
                type: receiptType,
                mobile:
                    activeSource === "others"
                        ? otherMobile || ""
                        : selectedCustomer?.mobile1 || "",

                eventType:
                    activeSource === "roomBookings"
                        ? "Room Booking"
                        : selectedCustomer?.functionType || "",

                eventDate:
                    activeSource === "roomBookings"
                        ? selectedCustomer?.functionDate || selectedCustomer?.fromDate || ""
                        : selectedCustomer?.functionDate || "",

                paymentFor: paymentFor === 'Advance' ? 'Credit' : 'Debit'
            };

            // --- SAVE IN moneyReceipts ---
            const monthRef = doc(db, 'moneyReceipts', monthYear);
            const snap = await getDoc(monthRef);
            if (snap.exists()) {
                await updateDoc(monthRef, { [slNo]: newPayment });
            } else {
                await setDoc(monthRef, { [slNo]: newPayment }, { merge: true });
            }

            // --- UPDATE prebookings OR cancelledBookings ---
            if (paymentFor === "Advance" && activeSource !== "others") {
                // Determine the target collection name
                const collectionName = activeSource; // e.g. "vendor" or "decoration" or "prebookings"

                // Only proceed if it's one of the expected collections
                if (["prebookings", "vendor", "decoration", "roomBookings"].includes(collectionName)) {
                    if (!selectedCustomer.monthDoc) {
                        throw new Error('Month document is missing for this customer');
                    }
                    // Reference to the monthly document in the chosen collection
                    const ref = doc(db, collectionName, selectedCustomer.monthDoc);
                    const snap = await getDoc(ref);

                    const isRoom = collectionName === "roomBookings";
                    const paymentKey = isRoom ? "payments" : "advancePayments";

                    const existingData =
                        snap.exists() && snap.data()[selectedCustomer.id]
                            ? snap.data()[selectedCustomer.id]
                            : { ...selectedCustomer, [paymentKey]: [] };

                    const updatedData = {
                        ...existingData,
                        [paymentKey]: [...(existingData[paymentKey] || []), newPayment],
                    };

                    if (!isOverall) {
                        await setDoc(ref, { [selectedCustomer.id]: updatedData }, { merge: true });
                    } else {
                        console.log("✅ Overall payment for", activeSource);
                    }
                }
            } else if (paymentFor === 'Refund' && activeSource !== "others") {
                const ref = doc(db, 'cancelledBookings', selectedCustomer.id);
                const snap = await getDoc(ref);
                const existingRefunds = snap.exists() ? snap.data().refundPayments || [] : [];
                await setDoc(ref, { refundPayments: [...existingRefunds, newPayment] }, { merge: true });
            }

            // Extra Step: Save in accountant (if CashTo is selected)
            if (mode === 'Cash' && cashTo && cashTo !== "Cash") {
                try {
                    // Example: cashTo = "Abhishek-Bank" or "Abhishek-Locker"
                    const accountantRef = doc(db, "accountant", cashTo);

                    const newTransaction = {
                        slNo, // 👈 save the slNo here
                        manualSlNo: manualSlNo || "",
                        amount: parseFloat(amount),
                        approval: "approved",
                        createdAt: new Date().toISOString(),
                        date: manualDate,
                        description,
                        type: paymentFor === "Advance" ? "Credit" : "Debit",
                        receiver: receiver?.trim() || "Counter", // optional, helps update logic
                        cashTo, // optional, for reference
                    };

                    const snap = await getDoc(accountantRef);

                    if (snap.exists()) {
                        await updateDoc(accountantRef, {
                            transactions: arrayUnion(newTransaction),
                        });
                    } else {
                        await setDoc(accountantRef, {
                            slNo, // 👈 also save slNo in the accountant doc root (optional)
                            manualSlNo: manualSlNo || "",
                            name: cashTo.split("-")[0], // Abhishek
                            email: "",
                            transactions: [newTransaction],
                            type: cashTo.includes("Locker") ? "Locker" : "Bank",
                        });
                    }
                } catch (err) {
                    console.error("❌ Error saving in accountant:", err);
                    alert("❌ Error saving in accountant");
                }
            }

            navigate('/MoneyReceipts');

        } catch (err) {
            console.error('❌ Error saving receipt:', err);
            alert(`❌ Error saving receipt: ${err.message || err}`);
        } finally {
            setIsSaving(false);
            setAmount('');
            setMode('Cash');
            setSelectedCustomer(null);
            setNextSlNo(null);
            setSearch('');
            setManualSlNo("");
            setBankMode("RTGS/NEFT");
            setChequeNo("");
        }
    };

    const formatIndian = (num) => {
        if (!num) return "";

        const [integerPart, decimalPart] = num.toString().split(".");

        const last3 = integerPart.slice(-3);
        const other = integerPart.slice(0, -3);

        const formattedInteger =
            other
                ? other.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3
                : last3;

        return decimalPart !== undefined
            ? `${formattedInteger}.${decimalPart}`
            : formattedInteger;
    };

    useEffect(() => {
        if (activeSource === "others" && paymentFor === "Advance") {
            fetchNextSlNo();
        }
    }, [activeSource, paymentFor, receiptType, fetchNextSlNo]);

    useEffect(() => {
        if (activeSource === "others" && paymentFor === "Refund") {
            fetchNextRefundSlNo();
        }
    }, [activeSource, paymentFor, fetchNextRefundSlNo]);

    useEffect(() => {
        const fetchParticularNatures = async () => {
            try {
                const snap = await getDocs(collection(db, "moneyReceipts"));

                const debitSet = new Set();
                const creditSet = new Set();

                snap.forEach(docSnap => {
                    const data = docSnap.data();

                    Object.values(data).forEach(r => {
                        if (!r || !r.particularNature || !r.paymentFor) return;

                        const nature = r.particularNature.trim();
                        const type = r.paymentFor;

                        if (type === "Debit") debitSet.add(nature);
                        if (type === "Credit") creditSet.add(nature);
                    });
                });

                setParticularOptions({
                    Debit: Array.from(debitSet).sort(),
                    Credit: Array.from(creditSet).sort(),
                });

            } catch (err) {
                console.error("Error fetching Particular Nature:", err);
            }
        };

        fetchParticularNatures();
    }, []);

    useEffect(() => {
        const fetchSubNatures = async () => {
            if (!particularNature) {
                setSubNatureOptions([]);
                return;
            }

            try {
                const snap = await getDocs(collection(db, "moneyReceipts"));
                const subMap = new Map();

                snap.forEach(docSnap => {
                    const data = docSnap.data();

                    Object.values(data).forEach(r => {
                        if (
                            r.particularNature === particularNature &&
                            r.subParticularNature
                        ) {
                            const normalized = r.subParticularNature.trim().toLowerCase();
                            if (!subMap.has(normalized)) {
                                subMap.set(normalized, r.subParticularNature.trim());
                            }
                        }
                    });
                });

                setSubNatureOptions(Array.from(subMap.values()).sort());

            } catch (err) {
                console.error("Error fetching Sub Nature:", err);
            }
        };

        fetchSubNatures();
    }, [particularNature]);

    return (
        <div className="page-scroller">
            <div>
                <div style={{ marginBottom: '30px' }}><BackButton /></div>
                <div className="receipt-container">
                    <h2 className="title">🧾 Money Receipt</h2>

                    <div className="input-row">
                        <label>Payment For</label>
                        <select value={paymentFor} onChange={e => setPaymentFor(e.target.value)}>
                            <option value="Advance">Credit</option>
                            <option value="Refund">Debit</option>
                        </select>
                    </div>

                    {activeSource !== "others" && (
                        <input
                            type="text"
                            placeholder="🔍 Search by name, date, mobile, or event"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    )}

                    <div className="source-buttons"
                        style={{
                            margin: "20px 0",
                            display: "flex",
                            gap: "10px",
                            flexWrap: "wrap",          // 👈 IMPORTANT
                        }}
                    >
                        {[
                            { key: "prebookings", label: "Bookings" },
                            { key: "vendor", label: "Event Manager" },
                            { key: "decoration", label: "Decoration Manager" },
                            // { key: "roomBookings", label: "Room Bookings" },
                            { key: "others", label: "Other Receipts" },
                        ].map(({ key, label, hidden }) => (
                            <button key={key} style={{
                                backgroundColor: activeSource === key ? "#25baffff" : "#d7f2ffff",
                                borderRadius: "15px", padding: "8px 16px", color: "black", fontWeight: "600", border: "none", cursor: "pointer",
                                display: hidden ? "none" : "inline-block"
                            }} onClick={() => setActiveSource(key)}>{label}</button>
                        ))}
                    </div>

                    {(selectedCustomer || activeSource === "others") && (
                        <div className="receipt-form">
                            <div className="receipt-box">

                                <p><strong>Sl No.:</strong> {paymentFor === 'Refund' ? (nextRefundSlNo ?? 'Loading...') : (nextSlNo !== null ? (receiptType === 'Cash' ? `C${nextSlNo}` : nextSlNo) : 'Loading...')}</p>

                                <div className="input-row">
                                    <label>Manual Receipt Sl No (Hard Copy)</label>
                                    <input
                                        type="text"
                                        placeholder="Eg: H-125 / Book-2-45"
                                        value={manualSlNo}
                                        onChange={(e) => setManualSlNo(e.target.value)}
                                    />
                                </div>

                                {activeSource === "others" && (
                                    <>
                                        <div className="input-row">
                                            <label>Party Name</label>
                                            <input type="text" value={otherName} onChange={e => setOtherName(e.target.value)} />
                                        </div>

                                        <div className="input-row">
                                            <label>Mobile</label>
                                            <input type="number" value={otherMobile} onChange={e => setOtherMobile(e.target.value)} />

                                        </div>
                                    </>
                                )}

                                {activeSource !== "others" && (
                                    <>
                                        <p>
                                            <strong>{paymentFor === 'Refund' ? 'Refund to' : 'Received with thanks from'}:</strong>{" "}
                                            {activeSource === "others"
                                                ? otherName || "Others"
                                                : `${selectedCustomer?.prefix ? selectedCustomer.prefix + " " : ""}${selectedCustomer?.name || ""}`}
                                        </p>

                                        <p>
                                            <strong>Customer Mobile:</strong>{" "}
                                            {activeSource === "others"
                                                ? otherMobile || "-"
                                                : selectedCustomer?.mobile1 || "-"}
                                        </p>
                                    </>
                                )}

                                {activeSource === "others" && (
                                    <>
                                        <div className="input-row">
                                            <label>Particular Nature</label>
                                            <div
                                                onClick={() => setShowNaturePopup(true)}
                                                style={{
                                                    border: "1px solid #ccc",
                                                    padding: "10px",
                                                    borderRadius: "6px",
                                                    background: "#fff",
                                                    cursor: "pointer"
                                                }}
                                            >
                                                {particularNature || "Select / Add - Particular Nature"}
                                            </div>

                                            {particularNature === "Other" && (
                                                <input
                                                    type="text"
                                                    placeholder="Add Particular Nature"
                                                    value={customParticularNature}
                                                    onChange={e => setCustomParticularNature(e.target.value)}
                                                    style={{ marginTop: "8px" }}
                                                />
                                            )}
                                        </div>

                                        {particularNature && (
                                            <div className="input-row">
                                                <label>Sub-Particular Nature</label>

                                                <div
                                                    onClick={() => setShowSubNaturePopup(true)}
                                                    style={{
                                                        border: "1px solid #ccc",
                                                        padding: "10px",
                                                        borderRadius: "6px",
                                                        background: "#fff",
                                                        cursor: "pointer"
                                                    }}
                                                >
                                                    {subParticularNature || "Select / Add - Sub Particular Nature"}
                                                </div>

                                                {subParticularNature === "Other" && (
                                                    <input
                                                        type="text"
                                                        placeholder="Add Sub Particular Nature"
                                                        value={customSubNature}
                                                        onChange={e => setCustomSubNature(e.target.value)}
                                                        style={{ marginTop: "8px" }}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}

                                {activeSource !== "others" && selectedCustomer?.functionType && (
                                    <p><strong>Event:</strong> {selectedCustomer.functionType}</p>
                                )}

                                {activeSource !== "others" && selectedCustomer?.functionDate && (
                                    <p><strong>Event Date:</strong>
                                        {formatISTDate(selectedCustomer.functionDate)}
                                    </p>
                                )}

                                {selectedCustomer && previousPayments.length > 0 && (
                                    <div className="prev-payment-box">
                                        <h3 style={{ marginTop: "0px", marginBottom: "10px" }}>
                                            Previous Payments
                                        </h3>

                                        <div className="table-fixed-wrapper">
                                            <table className="leads-table">
                                                <thead>
                                                    <tr>
                                                        <th>Sl No</th>
                                                        <th>Manual Sl No.</th>
                                                        {/* 🔹 SORTABLE RECEIPT DATE */}
                                                        <th
                                                            style={{ cursor: "pointer" }}
                                                            onClick={() =>
                                                                setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
                                                            }
                                                        >
                                                            Receipt Date {sortOrder === "asc" ? "↑" : "↓"}
                                                        </th>
                                                        <th>Amount
                                                            <div> ₹{totalAmount.toLocaleString("en-IN")} </div>
                                                        </th>
                                                        <th>Mode</th>
                                                    </tr>
                                                </thead>

                                                <tbody>
                                                    {sortedPayments.map((p, index) => {
                                                        const color =
                                                            p.paymentFor === "Credit"
                                                                ? "green"
                                                                : p.paymentFor === "Debit"
                                                                    ? "red"
                                                                    : "#ffffff";

                                                        return (
                                                            <tr key={index}>
                                                                <td style={{ color }}>#{p.slNo || "-"}</td>
                                                                <td style={{ color }}>{p.manualSlNo || ""}</td>
                                                                <td style={{ color }}>{formatISTDate(p.receiptDate)}</td>
                                                                <td style={{ color }}>
                                                                    ₹{Number(p.amount).toLocaleString("en-IN")}
                                                                </td>
                                                                <td style={{ color }}>
                                                                    {p.mode}
                                                                    {p.bankMode ? ` (${p.bankMode}${p.chequeNo ? ` - ${p.chequeNo}` : ''})` : ''}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {activeSource !== "others" && selectedCustomer && (() => {
                                    const gstBase = Number(selectedCustomer?.gstBase || 0);
                                    const gstAmount = Number(selectedCustomer?.gstAmount || 0);
                                    const grandTotal = Number(selectedCustomer?.grandTotal || 0);

                                    const projectedBank = gstBase + gstAmount;
                                    const projectedCash = grandTotal - projectedBank;

                                    const receivedBank = previousPayments
                                        .filter(p => p.mode !== 'Cash')
                                        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
                                    const receivedCash = previousPayments
                                        .filter(p => p.mode === 'Cash')
                                        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

                                    const remainingBank = projectedBank - receivedBank;
                                    const remainingCash = projectedCash - receivedCash;

                                    return (
                                        <div className="prev-payment-box" style={{ marginTop: "20px", marginBottom: "20px" }}>
                                            <table className="leads-table" style={{ width: "100%", textAlign: "center", borderCollapse: "collapse", border: "1px solid #ddd" }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ backgroundColor: "#9dc3e6", border: "1px solid #ddd", padding: "8px", width: "33%" }}></th>
                                                        <th style={{ backgroundColor: "#2f75b5", color: "#fff", border: "1px solid #ddd", padding: "8px", width: "33%" }}>BANK</th>
                                                        <th style={{ backgroundColor: "#2f75b5", color: "#fff", border: "1px solid #ddd", padding: "8px", width: "33%" }}>CASH</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr>
                                                        <td style={{ backgroundColor: "#9dc3e6", color: "#000", textAlign: "left", border: "1px solid #ddd", padding: "8px" }}>PROJECTED</td>
                                                        <td style={{ backgroundColor: "#57d461", color: "#000", border: "1px solid #ddd", padding: "8px" }}>₹{projectedBank.toLocaleString("en-IN")}</td>
                                                        <td style={{ backgroundColor: "#57d461", color: "#000", border: "1px solid #ddd", padding: "8px" }}>₹{projectedCash.toLocaleString("en-IN")}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style={{ backgroundColor: "#9dc3e6", color: "#000", textAlign: "left", border: "1px solid #ddd", padding: "8px" }}>RECEIVED</td>
                                                        <td style={{ backgroundColor: "#9ce28b", color: "#000", border: "1px solid #ddd", padding: "8px" }}>₹{receivedBank.toLocaleString("en-IN")}</td>
                                                        <td style={{ backgroundColor: "#9ce28b", color: "#000", border: "1px solid #ddd", padding: "8px" }}>₹{receivedCash.toLocaleString("en-IN")}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style={{ backgroundColor: "#9dc3e6", color: "#000", textAlign: "left", border: "1px solid #ddd", padding: "8px" }}>REMAINING</td>
                                                        <td style={{ backgroundColor: "#cff3be", color: "#000", border: "1px solid #ddd", padding: "8px" }}>₹{remainingBank.toLocaleString("en-IN")}</td>
                                                        <td style={{ backgroundColor: "#cff3be", color: "#000", border: "1px solid #ddd", padding: "8px" }}>₹{remainingCash.toLocaleString("en-IN")}</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })()}

                                {/* Mode Selection */}
                                <div className="mode-group">
                                    <p><strong>Payment Mode:</strong> {[...banks, 'Cash'].map(m => (
                                        <button style={{ whiteSpace: 'nowrap' }} key={m} className={`mode-button ${mode === m ? 'active' : ''}`} onClick={() => { setMode(m); setReceiptType(m === 'Cash' ? 'Cash' : 'Money Receipt'); }}>{m === 'Card' ? 'Credit Card' : m}</button>
                                    ))}  </p>
                                </div>

                                {mode === 'Cash' && (
                                    <div className="input-row">
                                        <label>Cash To</label>
                                        <select value={cashTo} onChange={e => setCashTo(e.target.value)}>
                                            <option value="Cash">Cash</option>
                                            {assignedUsers.map(u => (
                                                <option key={`${u.email}-${u.type}`} value={`${u.name}-${u.type}`}>
                                                    {u.name} - ({u.type})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {mode && mode !== 'Cash' && (
                                    <>
                                        <div className="input-row">
                                            <label>Bank Mode</label>
                                            <select value={bankMode} onChange={e => setBankMode(e.target.value)}>
                                                <option value="RTGS/NEFT">RTGS/NEFT</option>
                                                <option value="Cheque">Cheque</option>
                                                <option value="Card">Card</option>
                                                <option value="UPI">UPI</option>
                                            </select>
                                        </div>
                                        {bankMode === 'Cheque' && (
                                            <div className="input-row">
                                                <label>Cheque No</label>
                                                <input
                                                    type="text"
                                                    placeholder="Enter Cheque Number"
                                                    value={chequeNo}
                                                    onChange={e => setChequeNo(e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="input-row">
                                    <label>Amount (₹)</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={formatIndian(amount)}
                                        onChange={(e) => {
                                            let raw = e.target.value.replace(/,/g, ""); // remove commas

                                            // ✅ Allow numbers + single decimal point
                                            raw = raw.replace(/[^0-9.]/g, "");

                                            // ✅ Prevent multiple decimal points
                                            const parts = raw.split(".");
                                            if (parts.length > 2) return;

                                            setAmount(raw);
                                        }}
                                    />
                                </div>

                                <p><strong>Amount in Words:</strong> {amountWords}</p>

                                <div className="input-row">
                                    <label>Description</label>
                                    <input type="text" value={description} onChange={e => setDescription(e.target.value)} />
                                </div>

                                <div className="input-row">
                                    <label>Date</label>
                                    <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} />
                                </div>

                                <div className="submit-row">
                                    <button onClick={handleSubmit} disabled={isSaving}>{isSaving ? '⏳ Saving...' : paymentFor === 'Refund' ? '💸 Save Refund' : '📝 Save'}</button>
                                </div>

                            </div>
                        </div>
                    )}

                    {activeSource !== "others" && (
                        <div className="table-fixed-wrapper">
                            <table className="leads-table">
                                <thead>
                                    <tr>
                                        <th>Sl.</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {customers
                                        .filter(c => {
                                            const searchLower = search.toLowerCase();

                                            const formattedDateDash = formatISTDate(c.functionDate); // DD-MM-YYYY
                                            const formattedDateSlash = formattedDateDash.replace(/-/g, "/"); // DD/MM/YYYY

                                            return (
                                                c.name?.toLowerCase().includes(searchLower) ||
                                                c.mobile1?.includes(search) ||
                                                c.functionType?.toLowerCase().includes(searchLower) ||
                                                formattedDateDash.includes(search) ||
                                                formattedDateSlash.includes(search)
                                            );
                                        })
                                        .map((cust, index) => (
                                            <tr
                                                key={cust.id}
                                                style={{ cursor: "pointer" }}
                                                onClick={async () => {
                                                    setSelectedCustomer(cust);

                                                    let payments = [];

                                                    if (paymentFor === "Advance" && cust.monthDoc) {
                                                        const ref = doc(db, cust.source, cust.monthDoc);
                                                        const snap = await getDoc(ref);

                                                        const paymentKey =
                                                            cust.source === "roomBookings"
                                                                ? "payments"
                                                                : "advancePayments";

                                                        if (snap.exists() && snap.data()[cust.id]?.[paymentKey]) {
                                                            payments = snap.data()[cust.id][paymentKey];
                                                        }
                                                    } else if (paymentFor === "Refund") {
                                                        const ref = doc(db, "cancelledBookings", cust.id);
                                                        const snap = await getDoc(ref);

                                                        if (snap.exists() && snap.data().refundPayments) {
                                                            payments = snap.data().refundPayments;
                                                        }
                                                    }

                                                    setPreviousPayments(payments);

                                                    if (paymentFor === "Advance") await fetchNextSlNo();
                                                }}
                                            >
                                                <td>{index + 1}</td>
                                                <td>
                                                    <div>
                                                        <span style={{ fontWeight: "800" }}>
                                                            {cust.prefix ? cust.prefix + " " : ""}{cust.name || "-"}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        Mobile: <span style={{ fontWeight: "700" }}>{cust.mobile1 || "-"}</span>
                                                    </div>
                                                    <div>
                                                        Function Date: <span style={{ fontWeight: "700" }}>{cust.functionDate
                                                            ? new Date(cust.functionDate)
                                                                .toLocaleDateString("en-GB", {
                                                                    timeZone: "Asia/Kolkata",
                                                                })
                                                                .replace(/\//g, "-")
                                                            : "Room Booking"}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        Function Type:  <span style={{ fontWeight: "700" }}> {cust.functionType || "-"} </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                </div>
            </div>

            {showNaturePopup && (
                <div style={overlayStyle}>
                    <div style={popupStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <h3>Select Particular Nature</h3>
                            <button onClick={() => setShowNaturePopup(false)} style={closeBtn}>✕</button>
                        </div>

                        <input
                            type="text"
                            placeholder="Search..."
                            value={natureSearch}
                            onChange={e => setNatureSearch(e.target.value)}
                            style={searchStyle}
                        />

                        <div style={{ maxHeight: "250px", overflowY: "auto" }}>
                            {(particularOptions[paymentFor === "Advance" ? "Credit" : "Debit"] || [])
                                .filter(p =>
                                    p.toLowerCase().includes(natureSearch.toLowerCase())
                                )
                                .map(p => (
                                    <div
                                        key={p}
                                        onClick={() => {
                                            setParticularNature(p);
                                            setCustomParticularNature("");
                                            setSubParticularNature("");
                                            setShowNaturePopup(false);
                                        }}
                                        style={itemStyle}
                                    >
                                        {p}
                                    </div>
                                ))}

                            <div
                                onClick={() => {
                                    setParticularNature("Other");
                                    setShowNaturePopup(false);
                                }}
                                style={{ ...itemStyle, fontWeight: "bold", color: "#1890ff" }}
                            >
                                + Add New
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showSubNaturePopup && (
                <div style={overlayStyle}>
                    <div style={popupStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <h3>Select Sub Nature</h3>
                            <button onClick={() => setShowSubNaturePopup(false)} style={closeBtn}>✕</button>
                        </div>

                        <input
                            type="text"
                            placeholder="Search..."
                            value={subNatureSearch}
                            onChange={e => setSubNatureSearch(e.target.value)}
                            style={searchStyle}
                        />

                        <div style={{ maxHeight: "250px", overflowY: "auto" }}>
                            {subNatureOptions
                                .filter(s =>
                                    s.toLowerCase().includes(subNatureSearch.toLowerCase())
                                )
                                .map(s => (
                                    <div
                                        key={s}
                                        onClick={() => {
                                            setSubParticularNature(s);
                                            setCustomSubNature("");
                                            setShowSubNaturePopup(false);
                                        }}
                                        style={itemStyle}
                                    >
                                        {s}
                                    </div>
                                ))}

                            <div
                                onClick={() => {
                                    setSubParticularNature("Other");
                                    setShowSubNaturePopup(false);
                                }}
                                style={{ ...itemStyle, fontWeight: "bold", color: "#1890ff" }}
                            >
                                + Add New Sub Nature
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ marginBottom: "50px" }}></div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
        </div>
    );
};

export default MoneyReceipt;


const overlayStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999
};

const popupStyle = {
    background: "#fff",
    width: "90%",
    maxWidth: "400px",
    borderRadius: "10px",
    padding: "15px",
};

const itemStyle = {
    padding: "10px",
    borderBottom: "1px solid #eee",
    cursor: "pointer"
};

const searchStyle = {
    width: "100%",
    padding: "8px",
    marginBottom: "8px",
    borderRadius: "6px",
    border: "1px solid #ccc"
};

const closeBtn = {
    background: "transparent",
    border: "none",
    fontSize: "18px",
    cursor: "pointer",
    color: "red"
};