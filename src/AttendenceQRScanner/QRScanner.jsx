import { doc, setDoc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useEffect, useState } from "react";
import { db } from "../firebaseConfig";

/* ===== IST MONTHYEAR HELPER ===== */
const getMonthYearIST = () => {
    const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        month: "short",
        year: "numeric",
    }).formatToParts(new Date());

    const month = parts.find(p => p.type === "month").value;
    const year = parts.find(p => p.type === "year").value;

    return `${month}${year}`;
};

const MarkAttendance = () => {
    const [status, setStatus] = useState("loading");
    // loading | checkin | checkout | done

    const user = getAuth().currentUser;

    useEffect(() => {
        const checkStatus = async () => {
            if (!user) return;

            const monthYear = getMonthYearIST();
            const ref = doc(db, "attendance", monthYear);
            const snap = await getDoc(ref);

            if (!snap.exists() || !snap.data()?.[user.uid]?.entryAt) {
                setStatus("checkin");
                return;
            }

            if (snap.data()?.[user.uid]?.entryAt && !snap.data()?.[user.uid]?.exitAt) {
                setStatus("checkout");
                return;
            }

            setStatus("done");
        };

        checkStatus();
    }, [user]);

    /* ===== CHECK-IN ===== */
    const handleCheckIn = async () => {
        if (!user) return alert("Please login first");

        const monthYear = getMonthYearIST();
        const ref = doc(db, "attendance", monthYear);

        const accessSnap = await getDoc(doc(db, "usersAccess", user.email));
        const name = accessSnap.exists()
            ? accessSnap.data().name
            : user.displayName || "User";

        await setDoc(
            ref,
            {
                [user.uid]: {
                    name,
                    email: user.email,
                    entryAt: serverTimestamp(),
                    exitAt: null,
                },
            },
            { merge: true }
        );

        setStatus("checkout");
        alert("Check-In successful ✅");
    };

    /* ===== CHECK-OUT ===== */
    const handleCheckOut = async () => {
        const monthYear = getMonthYearIST();
        const ref = doc(db, "attendance", monthYear);

        await updateDoc(ref, {
            [`${user.uid}.exitAt`]: serverTimestamp(),
        });

        setStatus("done");
        alert("Check-Out successful 👋");
    };

    /* ===== UI ===== */
    return (
        <div style={{ textAlign: "center", marginTop: 50 }}>
            <h2>Attendance</h2>

            {status === "loading" && <p>Checking status...</p>}

            {status === "checkin" && (
                <button
                    onClick={handleCheckIn}
                    style={{ padding: "14px 28px", fontSize: 18 }}
                >
                    ✅ Check-In
                </button>
            )}

            {status === "checkout" && (
                <button
                    onClick={handleCheckOut}
                    style={{
                        padding: "14px 28px",
                        fontSize: 18,
                        background: "#e74c3c",
                        color: "#fff",
                    }}
                >
                    🚪 Check-Out
                </button>
            )}

            {status === "done" && (
                <p style={{ color: "green", fontWeight: "bold" }}>
                    ✔ Attendance completed for today
                </p>
            )}
        </div>
    );
};

export default MarkAttendance;
