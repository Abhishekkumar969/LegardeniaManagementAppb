import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebaseConfig";
import {
    collection,
    query,
    orderBy,
    getDocs,
} from "firebase/firestore";
import "../styles/Ledger.css";
import BackButton from "../components/BackButton";

export default function Ledger() {
    const [entries, setEntries] = useState([]);
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const creditRef = useRef();
    const debitRef = useRef();
    const fullRef = useRef();

    useEffect(() => {
        const fetchMoneyReceipts = async () => {
            const q = query(collection(db, "moneyReceipts"), orderBy("receiptDate", "desc"));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setEntries(data);
        };

        fetchMoneyReceipts();
    }, []);

    const handlePrint = (ref) => {
        const printContents = ref.current.innerHTML;
        const popup = window.open("", "_blank", "width=800,height=600");
        popup.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Ledger Report</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              color: #333;
            }
            h2 {
              text-align: center;
              margin-bottom: 1rem;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 1rem;
            }
            th, td {
              border: 1px solid #555;
              padding: 8px 12px;
              text-align: left;
            }
            th {
              background-color: #2c3e50;
              color: #ecf0f1;
            }
            tr:nth-child(even) {
              background-color: #f4f6f8;
            }
            button, th:last-child, td:last-child {
              display: none !important;
            }
          </style>
        </head>
        <body>
          <h2>Ledger Report</h2>
          ${printContents}
        </body>
      </html>
    `);
        popup.document.close();
        popup.focus();
        popup.print();
    };

    const filteredEntries = entries.filter((entry) => {
        const entryDate = new Date(entry.receiptDate);
        const from = fromDate ? new Date(fromDate) : null;
        const to = toDate ? new Date(toDate) : null;
        if (from && entryDate < from) return false;
        if (to && entryDate > to) return false;
        return true;
    });

    const totalCredit = filteredEntries
        .filter((e) => ["credit", "advance"].includes(e.paymentFor?.toLowerCase()))
        .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalDebit = filteredEntries
        .filter((e) => ["debit", "refund"].includes(e.paymentFor?.toLowerCase()))
        .reduce((sum, e) => sum + Number(e.amount), 0);

    const balance = totalCredit - totalDebit;

    return (
        <div className="ledger-container">
            <BackButton />
            <h2>Ledger Tracker</h2>

            {/* Filter */}
            <div className="container-margin">
                <div className="filter-section">
                    <h3>Filter by Date</h3>
                    <div className="filter-group">
                        <label>From <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
                        <label>To <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
                    </div>
                    <button className="clear-btn" onClick={() => { setFromDate(""); setToDate(""); }}>Clear</button>
                </div>
            </div>

            {/* Tables */}
            <div className="container-margin" ref={fullRef}>
                {/* Credit Table */}
                <div className="ledger-table" ref={creditRef}>
                    <h3>Credit Entries <button onClick={() => handlePrint(creditRef)} className="btn print-btn">Print Credit</button></h3>
                    <table>
                        <thead>
                            <tr><th>Description</th><th>Amount</th><th>Mode</th><th>Receiver</th><th>Date</th></tr>
                        </thead>
                        <tbody>
                            {filteredEntries
                                .filter((e) => ["credit", "advance"].includes(e.paymentFor?.toLowerCase()))
                                .map((entry) => (
                                    <tr key={entry.id}>
                                        <td>{`${entry.description || entry.eventType} ${entry.customerName || entry.partyName || "-"}`}</td>
                                        <td>₹{entry.amount}</td>
                                        <td>{entry.mode}</td>
                                        <td>{entry.receiver || entry.myName}</td>
                                        <td>{entry.receiptDate}</td>
                                    </tr>
                                ))}

                        </tbody>
                    </table>
                </div>

                {/* Debit Table */}
                <div className="ledger-table" ref={debitRef}>
                    <h3>Debit Entries <button onClick={() => handlePrint(debitRef)} className="btn print-btn">Print Debit</button></h3>
                    <table>
                        <thead>
                            <tr><th>Description</th><th>Amount</th><th>Mode</th><th>Sender</th><th>Date</th></tr>
                        </thead>
                        <tbody>
                            {filteredEntries
                                .filter((e) => ["debit", "refund"].includes(e.paymentFor?.toLowerCase()))
                                .map((entry) => (
                                    <tr key={entry.id}>
                                        <td>{`${entry.description || entry.eventType} ${entry.customerName || entry.partyName || "-"}`}</td>
                                        <td>₹{entry.amount}</td>
                                        <td>{entry.mode}</td>
                                        <td>{entry.fromMoney || entry.partyName || entry.sender}</td>
                                        <td>{entry.receiptDate}</td>
                                    </tr>
                                ))}

                        </tbody>
                    </table>
                </div>
            </div>

            {/* Summary */}
            <div className="container-margin stats">
                <div className="card income">Total Credit: ₹{totalCredit}</div>
                <div className="card cost">Total Debit: ₹{totalDebit}</div>
                <div className="card profit">Balance: ₹{balance}</div>
            </div>

            <div style={{ textAlign: "center" }}>
                <button onClick={() => handlePrint(fullRef)} className="btn print-btn">Print Full Report</button>
            </div>
        </div>
    );
}
