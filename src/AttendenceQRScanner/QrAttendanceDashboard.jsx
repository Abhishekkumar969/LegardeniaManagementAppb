import { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";
import styles from "./QrAttendanceDashboard.module.css";
import BackButton from "../components/BackButton";

/* ===== TODAY IST (YYYY-MM-DD) ===== */
const getTodayIST = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());

    const y = parts.find(p => p.type === "year").value;
    const m = parts.find(p => p.type === "month").value;
    const d = parts.find(p => p.type === "day").value;

    return `${y}-${m}-${d}`;
};

/* ===== TIMESTAMP → IST DATE ===== */
const getISTDateFromTimestamp = (ts) => {
    if (!ts) return null;

    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(ts.toDate());

    const y = parts.find(p => p.type === "year").value;
    const m = parts.find(p => p.type === "month").value;
    const d = parts.find(p => p.type === "day").value;

    return `${y}-${m}-${d}`;
};

const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const QrAttendanceDashboard = () => {
    const todayIST = getTodayIST();

    const [mode, setMode] = useState("today"); // today | overall
    const [selectedDate, setSelectedDate] = useState(todayIST);
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [attendanceList, setAttendanceList] = useState([]);
    const [selectedUser, setSelectedUser] = useState("");

    const uniqueUsers = Array.from(
        new Map(
            attendanceList.map((u) => [
                u.id,
                { id: u.id, name: u.name || u.email || u.id },
            ])
        ).values()
    );

    /* ===== FORMAT IST TIME ===== */
    const formatIST = (ts) => {
        if (!ts) return "-";
        return ts.toDate().toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    };

    const fetchAttendance = useCallback(() => {
        const baseDate =
            mode === "today"
                ? selectedDate
                : fromDate || selectedDate || todayIST;

        if (!baseDate) {
            setAttendanceList([]);
            return () => { };
        }

        const [year, month] = baseDate.split("-");
        const monthYear = `${monthNames[Number(month) - 1]}${year}`;

        const ref = doc(db, "attendance", monthYear);

        const unsubscribe = onSnapshot(ref, (snap) => {
            if (!snap.exists()) {
                setAttendanceList([]);
                return;
            }

            let list = Object.entries(snap.data()).map(([uid, user]) => ({
                id: uid,
                ...user,
            }));

            // TODAY MODE
            if (mode === "today") {
                list = list.filter(
                    (user) =>
                        getISTDateFromTimestamp(user.entryAt) === selectedDate
                );
            }

            // OVERALL MODE
            if (mode === "overall" && fromDate && toDate) {
                list = list.filter((user) => {
                    const d = getISTDateFromTimestamp(user.entryAt);
                    return d >= fromDate && d <= toDate;
                });
            }

            setAttendanceList(list);
        });

        return unsubscribe;
    }, [mode, selectedDate, fromDate, toDate, todayIST]);

    /* ===== LOAD ATTENDANCE ===== */
    useEffect(() => {
        const unsubscribe = fetchAttendance();
        return () => unsubscribe && unsubscribe();
    }, [fetchAttendance]);

    /* ===== SEARCH FILTER ===== */
    const filtered = selectedUser
        ? attendanceList.filter((a) => a.id === selectedUser)
        : attendanceList;

    return (
        <div className={styles.page}>

            <div className={styles.backButtonWrapper}>
                <BackButton />
            </div>

            <h2>Attendance Dashboard</h2>

            {/* ===== MODE BUTTONS ===== */}
            <div className={styles.modeButtons}>
                <button
                    className={mode === "today" ? styles.active : ""}
                    onClick={() => {
                        setMode("today");
                        setSelectedDate(todayIST);
                        setFromDate("");
                        setToDate("");
                    }}
                >
                    Today
                </button>

                <button
                    className={mode === "overall" ? styles.active : ""}
                    onClick={() => {
                        setMode("overall");
                        setSelectedDate("");
                    }}
                >
                    Overall
                </button>
            </div>

            {/* ===== CONTROLS ===== */}
            <div className={styles.controls}>
                {mode === "today" && (
                    <div className={styles.field}>
                        <label>Select Date :</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                    </div>
                )}

                {mode === "overall" && (
                    <>
                        <div className={styles.field}>
                            <label>From Date :</label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                            />
                        </div>

                        <div className={styles.field}>
                            <label>To Date :</label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                            />
                        </div>
                    </>
                )}

                <div className={styles.field}>
                    <label>User :</label>
                    <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
                        <option value="">All Users</option>
                        {uniqueUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                </div>

            </div>

            {/* ===== TABLE ===== */}
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Entry</th>
                        <th>Exit</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map((a) => (
                        <tr key={a.id}>
                            <td>{a.name || a.email || a.id}</td>
                            <td>{formatIST(a.entryAt)}</td>
                            <td>{formatIST(a.exitAt)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default QrAttendanceDashboard;
