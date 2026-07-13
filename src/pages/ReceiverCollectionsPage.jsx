import React, { useEffect, useState } from "react";
import { db } from "../firebaseConfig";
import { collection, getDocs, doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";
import "../styles/Ledger.css";
import BackButton from "../components/BackButton";

export default function ReceiverCollectionsPage() {
    const [receiverSummary, setReceiverSummary] = useState([]);
    const [receivedMap, setReceivedMap] = useState({});
    const [modeSummary, setModeSummary] = useState({});
    const [collecting, setCollecting] = useState(false);
    const [transferMode, setTransferMode] = useState("Cash");
    const [collectModal, setCollectModal] = useState({
        open: false,
        receiver: "",
        pending: 0,
        amount: "",
    });

    useEffect(() => {
        fetchReceivedMoney();
    }, []);

    useEffect(() => {
        const fetchLedgerData = async () => {
            try {
                // --- Money Receipts
                const ledgerSnap = await getDocs(collection(db, "moneyReceipts"));
                const summary = {};
                const modes = {};

                ledgerSnap.forEach((docSnap) => {
                    const data = docSnap.data();
                    const type = data.paymentFor?.toLowerCase();
                    let name = "";

                    if (type === "credit" || type === "advance") {
                        name = data.receiver?.trim() || data.myName?.trim();
                    } else if (type === "debit" || type === "refund") {
                        name = data.sender?.trim() || data.partyName?.trim();
                    }
                    if (!name) return;

                    if (!summary[name]) {
                        summary[name] = { credit: 0, debit: 0, entries: [] };
                    }

                    if (type === "credit" || type === "advance") {
                        summary[name].credit += Number(data.amount);
                    } else {
                        summary[name].debit += Number(data.amount);
                    }
                    summary[name].entries.push(data);

                    // mode summary
                    const mode = data.mode || "Unknown";
                    if (!modes[mode]) modes[mode] = 0;
                    if (type === "credit" || type === "advance") {
                        modes[mode] += Number(data.amount);
                    }
                });

                setReceiverSummary(Object.entries(summary));
                setModeSummary(modes);

                // --- Received Money
                const receivedSnap = await getDocs(collection(db, "receivedMoney"));
                const map = {};
                receivedSnap.forEach((docSnap) => {
                    const data = docSnap.data();
                    map[docSnap.id] = data.totalReceived || 0;
                });
                setReceivedMap(map);

            } catch (error) {
                console.error("Error fetching ledger data:", error);
            }
        };

        fetchLedgerData();
    }, []);


    const fetchReceivedMoney = async () => {
        const snapshot = await getDocs(collection(db, "receivedMoney"));
        const map = {};
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            map[docSnap.id] = data.totalReceived || 0;
        });
        setReceivedMap(map);
    };

    const confirmCollect = async () => {
        if (collecting) return;
        setCollecting(true);
        const { receiver, amount, pending } = collectModal;
        const amt = parseFloat(amount);
        if (!amt || amt <= 0 || amt > pending) {
            console.log("Enter valid amount within pending balance.");
            setCollecting(false);
            return;
        }
        try {
            setCollectModal({ open: false, receiver: "", pending: 0, amount: "" });

            // 1️⃣ Update receiver's total
            const ref = doc(db, "receivedMoney", receiver);
            const existing = await getDoc(ref);
            if (existing.exists()) {
                const current = existing.data().totalReceived || 0;
                await updateDoc(ref, {
                    totalReceived: current + amt,
                    lastUpdated: serverTimestamp(),
                });
            } else {
                await setDoc(ref, {
                    totalReceived: amt,
                    lastUpdated: serverTimestamp(),
                });
            }

            // 2️⃣ Update main Money document for the chosen mode
            const moneyRef = doc(db, "receivedMoney", "Money");
            const moneySnap = await getDoc(moneyRef);
            if (moneySnap.exists()) {
                const currentModeAmt = moneySnap.data()[transferMode] || 0;
                await updateDoc(moneyRef, {
                    [transferMode]: currentModeAmt + amt,
                    lastUpdated: serverTimestamp(),
                });
            } else {
                await setDoc(moneyRef, {
                    [transferMode]: amt,
                    lastUpdated: serverTimestamp(),
                });
            }

            console.log(`✅ Collected and transferred to ${transferMode}`);
            setTimeout(fetchReceivedMoney, 300);
        } catch (err) {
            console.error("❌ Error collecting:", err);
        }
        setCollecting(false);
    };

    return (
        <div className="ledger-container">
            <BackButton />
            <h2 className="ledger-title">Collections</h2>

            {/* Top Mode Summary */}
            <div className="table-wrapper" style={{ marginBottom: "20px", textAlign: "center" }}>
                <table style={{ margin: "0 auto" }}>
                    <thead>
                        <tr>
                            {Object.keys(modeSummary).map((mode) => (
                                <th key={mode}>{mode}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            {Object.keys(modeSummary).map((mode) => (
                                <td key={mode}>₹{modeSummary[mode].toFixed(2)}</td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Main Table */}
            <div className="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Description</th>
                            <th>Credit</th>
                            <th>Debit</th>
                            <th>Submitted</th>
                            <th>Pending</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {receiverSummary
                            .slice()
                            .sort(([nameA, dataA], [nameB, dataB]) => {
                                const pendingA = dataA.credit - (receivedMap[nameA] || 0);
                                const pendingB = dataB.credit - (receivedMap[nameB] || 0);
                                return pendingB - pendingA;
                            })
                            .map(([name, data]) => {
                                const already = receivedMap[name] || 0;
                                const pending = data.credit - already;

                                return (
                                    <tr key={name}>
                                        <td>{name}</td>
                                        <td>
                                            {(() => {
                                                const lastEntry = data.entries?.[data.entries.length - 1];
                                                if (!lastEntry) return "-";
                                                return `${lastEntry.description || lastEntry.eventType || "-"} ${lastEntry.customerName || lastEntry.partyName || "-"}`;
                                            })()}
                                        </td>
                                        <td>₹{data.credit.toFixed(2)}</td>
                                        <td>₹{data.debit.toFixed(2)}</td>
                                        <td>₹{already.toFixed(2)}</td>
                                        <td className={pending < 0 ? "pending negative" : "pending positive"}>
                                            ₹{pending.toFixed(2)}
                                        </td>
                                        <td>
                                            {pending > 0 && (
                                                <button
                                                    onClick={() =>
                                                        setCollectModal({
                                                            open: true,
                                                            receiver: name,
                                                            pending,
                                                            amount: "",
                                                        })
                                                    }
                                                    className="btn collect"
                                                >
                                                    Collect ₹{pending.toFixed(0)}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>

            {/* Collect Modal */}
            {collectModal.open && (
                <div className="custom-modal-overlay">
                    <div className="custom-modal">
                        <h3>💰 Collect from: <span>{collectModal.receiver}</span></h3>
                        <p>Pending: <strong>₹{collectModal.pending.toFixed(2)}</strong></p>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="\d*"
                            placeholder="Enter Amount"
                            value={collectModal.amount}
                            onChange={(e) =>
                                setCollectModal({ ...collectModal, amount: e.target.value.replace(/\D/g, "") })
                            }
                        />

                        {/* Transfer target mode */}
                        <select
                            value={transferMode}
                            onChange={(e) => setTransferMode(e.target.value)}
                            style={{ marginTop: "10px" }}
                        >
                            <option value="Cash">Cash</option>
                            <option value="Cheque">Cheque</option>
                            <option value="Card">Card</option>
                            <option value="Locker">Locker</option>
                            <option value="Petty Cash">Petty Cash</option>
                            <option value="SBI">SBI</option>
                            <option value="BOI">BOI</option>
                        </select>
                        <div className="modal-actions">
                            <button
                                className="btn-glow green"
                                onClick={confirmCollect}
                                disabled={collecting}
                            >
                                {collecting ? "Confirming…" : "Confirm"}
                            </button>
                            <button
                                className="btn-glow red"
                                onClick={() =>
                                    setCollectModal({ open: false, receiver: "", pending: 0, amount: "" })
                                }
                            >
                                ❌ Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
