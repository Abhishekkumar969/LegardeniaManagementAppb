// DownloadDeletePopup.jsx
import React, { useState } from "react";
import { db } from "../firebaseConfig";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import * as XLSX from "xlsx";

const DownloadDeletePopup = ({ isOpen, onClose }) => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [financialYear, setFinancialYear] = useState("");
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);

  const collectionsList = [
    "bookingLeads",
    "cancelledBookings",
    "moneyReceipts",
    "prebookings",
  ];

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toISOString().split("T")[0];
  };

  // Auto-fill dates based on financial year
  const handleFinancialYearChange = (value) => {
    setFinancialYear(value);
    if (value && /^\d{4}$/.test(value)) {
      setFromDate(`${value}-04-01`);
      setToDate(`${parseInt(value) + 1}-03-31`);
    }
  };

  // Fetch and filter data
  const fetchData = async () => {
    if (!fromDate || !toDate) {
      alert("Please select both From and To dates");
      return;
    }
    setLoading(true);
    let results = [];

    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);

    for (const col of collectionsList) {
      const snap = await getDocs(collection(db, col));
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const dateFields = [
          data.functionDate,
          data.holdDate,
          data.createdAt,
          data.date,
          data.receiptDate,
        ].filter(Boolean);

        const match = dateFields.some((df) => {
          const d = new Date(df);
          return d >= from && d <= to;
        });

        if (match) {
          results.push({
            ...data,
            __id: docSnap.id,
            __collection: col,
          });
        }
      });
    }
    setFilteredData(results);
    setLoading(false);

    if (results.length === 0) {
      alert("No data found for the selected range.");
    }
  };

  // Export to Excel
  const exportToExcel = () => {
    if (filteredData.length === 0) return;

    const cleanData = filteredData.map((item) => {
      const dateField =
        item.functionDate ||
        item.holdDate ||
        item.createdAt ||
        item.date ||
        item.receiptDate;

      return {
        Collection: item.__collection,
        DocumentID: item.__id,
        Date: formatDate(dateField),
        ...item,
      };
    });

    const exportData = cleanData.map(({ __collection, __id, ...rest }) => rest);
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, `FilteredData_${fromDate}_to_${toDate}.xlsx`);
  };

  // Delete filtered data
  const deleteFilteredData = async () => {
    if (filteredData.length === 0) return;
    if (!window.confirm("Are you sure you want to delete the filtered data?"))
      return;

    setLoading(true);
    for (const item of filteredData) {
      await deleteDoc(doc(db, item.__collection, item.__id));
    }
    setFilteredData([]);
    setLoading(false);
    alert("Filtered data deleted successfully");
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="overlay">
        <div className="popup-container">
          {/* Header */}
          <div className="header">
            <h3 style={{ margin: 0, flex: 1, textAlign: "center" }}>
              📂 Download / Delete Data
            </h3>
            <button onClick={onClose} className="close-btn">
              X
            </button>
          </div>

          {/* Date & Year Filter */}
          <div className="filter-row">
            <div>
              <label>From: </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <label>To: </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div>
              <label>FY: </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d*"
                placeholder="e.g. 2024"
                value={financialYear}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  handleFinancialYearChange(val);
                }}
              />
            </div>

            <button
              className="filter-btn"
              onClick={fetchData}
              disabled={loading}
            >
              {loading ? "Loading..." : "Filter"}
            </button>
          </div>

          {/* Status */}
          {filteredData.length > 0 && (
            <p style={{ color: "green", fontWeight: "bold" }}>
              ✅ {filteredData.length} records ready.
            </p>
          )}

          {/* Footer */}
          <div className="footer-btns">
            <button
              onClick={exportToExcel}
              disabled={filteredData.length === 0}
              className="action-btn"
            >
              Export to Excel
            </button>
            <button
              onClick={deleteFilteredData}
              disabled={filteredData.length === 0}
              className="action-btn delete-btn"
            >
              Delete Filtered Data
            </button>
          </div>
        </div>
      </div>

      {/* Styles */}
      <style>{`
        .overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .popup-container {
          background-color: white;
          padding: 20px;
          border-radius: 10px;
          width: 95%;
          max-width: 550px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .header {
          display: flex;
          justify-content: space-between;
          width: 100%;
          margin-bottom: 10px;
        }
        .filter-row {
          display: flex;
          gap: 8px;
          margin-bottom: 15px;
          align-items: flex-end;
          flex-wrap: wrap;
        }
        .filter-btn {
          padding: 8px 14px;
          border: none;
          border-radius: 5px;
          background: linear-gradient(90deg, #4facfe, #00f2fe);
          color: white;
          cursor: pointer;
          font-weight: bold;
          transition: 0.2s;
        }
        .filter-btn:hover {
          transform: scale(1.05);
        }
        .footer-btns {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }
        .action-btn {
          padding: 8px 14px;
          border: none;
          border-radius: 5px;
          background-color: #58bfff;
          color: white;
          cursor: pointer;
          font-weight: bold;
          transition: 0.2s;
        }
        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .delete-btn {
          background-color: red;
        }
        .close-btn {
          background: transparent;
          border: none;
          font-size: 18px;
          color: red;
          cursor: pointer;
        }
      `}</style>
    </>
  );
};

export default DownloadDeletePopup;
