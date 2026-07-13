import React, { useEffect, useState } from "react";
import { getDocs, collection } from "firebase/firestore";
import { db } from "../firebaseConfig";

const AllBookingDatesPopup = ({ isOpen, onClose }) => {
  const [mergedDates, setMergedDates] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("desc"); // 🔽 default

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    if (isNaN(date)) return "-";

    const options = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    };
    return new Intl.DateTimeFormat("en-GB", options).format(date);
  };

  useEffect(() => {
    const fetchDates = async () => {
      let allDatesMap = {};

      const addToMap = (dateStr, type, extra = {}) => {
        if (!dateStr) return;
        const formatted = formatDate(dateStr);
        if (!allDatesMap[formatted]) {
          allDatesMap[formatted] = {
            enquiry: null,
            hold: null,
            bookingHold: null,
            booked: null,
          };
        }
        allDatesMap[formatted][type] = { ...extra, rawDate: dateStr };
      };

      // -------- prebookings ----------
      const preSnap = await getDocs(collection(db, "prebookings"));
      preSnap.forEach((doc) => {
        const fields = doc.data();
        Object.values(fields).forEach((item) => {
          if (item.functionDate) {
            addToMap(item.functionDate, "booked", {
              venueType: item.venueType || "",
            });
          }
        });
      });

      // -------- bookingLeads ----------
      const leadsSnap = await getDocs(collection(db, "bookingLeads"));
      leadsSnap.forEach((doc) => {
        const fields = doc.data();
        Object.values(fields).forEach((item) => {
          if (item.functionDate) {
            addToMap(item.functionDate, "hold", {
              venueType: item.venueType || "",
              winProbability: item.winProbability || "",
            });
          }
          if (item.holdDate) {
            addToMap(item.holdDate, "bookingHold", {
              venueType: item.venueType || "",
              winProbability: item.winProbability || "",
            });
          }
        });
      });

      // -------- enquiry ----------
      const enquiriesSnap = await getDocs(collection(db, "enquiry"));
      enquiriesSnap.forEach((doc) => {
        const fields = doc.data();
        Object.values(fields).forEach((item) => {
          if (item.enquiryDate) {
            addToMap(item.enquiryDate, "enquiry", {
              venueType: item.venueType || "",
            });
          }
        });
      });

      // convert to array and sort (latest first)
      const merged = Object.keys(allDatesMap)
        .map((dateStr) => ({
          date: dateStr,
          ...allDatesMap[dateStr],
        }))
        .sort((a, b) => {
          const [da, ma, ya] = a.date.split("/").map(Number);
          const [db, mb, yb] = b.date.split("/").map(Number);
          return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
        });

      setMergedDates(merged);
    };

    if (isOpen) fetchDates();
  }, [isOpen]);

  if (!isOpen) return null;

  const getFilteredData = () => {
    let filtered = [...mergedDates];

    // 🔍 Live search
    if (searchTerm) {
      const normalize = (str) =>
        str
          .toString()
          .replace(/[^0-9/.-]/g, "")
          .trim()
          .toLowerCase();

      const searchNorm = normalize(searchTerm);
      filtered = filtered.filter((row) =>
        normalize(row.date).includes(searchNorm)
      );
    }

    // 🔽 / 🔼 Sorting
    filtered.sort((a, b) => {
      const [da, ma, ya] = a.date.split("/").map(Number);
      const [db, mb, yb] = b.date.split("/").map(Number);
      return sortOrder === "desc"
        ? new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da)
        : new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
    });

    return filtered;
  };

  return (
    <>
      <div className="overlay">
        <div className="popup-container">
          <div className="leads-table-container">
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px",
              }}
            >
              <div style={{ flex: 1, textAlign: "center" }}>
                <h3 className="popup-heading" style={{ margin: 0 }}>
                  📅 All Booking Dates
                </h3>
              </div>
              <div style={{ right: "20px" }}>
                <button
                  onClick={onClose}
                  style={{ color: "red", backgroundColor: "transparent" }}
                >
                  X
                </button>
              </div>
            </div>

            {/* Search + Sort */}
            <div
              style={{
                marginBottom: "10px",
                textAlign: "center",
                display: "flex",
                justifyContent: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <input
                type="text"
                placeholder="Search date (e.g., 07/08/2025)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  padding: "6px 10px",
                  width: "60%",
                  maxWidth: "280px",
                  borderRadius: "5px",
                  border: "1px solid #ccc",
                }}
              />

              {/* 🔽 / 🔼 Sort Button */}
              <button
                onClick={() =>
                  setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
                }
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#1a9cff",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                {sortOrder === "desc" ? "🔽 Desc" : "🔼 Asc"}
              </button>
            </div>

            {/* Table */}
            <div className="table-fixed-wrapper">
              <table className="leads-table">
                <thead>
                  <tr>
                    <td style={{ backgroundColor: '#cd49de71', textAlign: "left" }}>Booked</td>
                    <td style={{ backgroundColor: '#ee1e1e68' }}>Enquiry</td>
                    <td style={{ backgroundColor: '#34d23466' }}>Lead</td>
                    <td style={{ backgroundColor: '#099aaa6e' }}>Lead Hold</td>
                  </tr>
                </thead>
                <tbody>
                  {getFilteredData().map((row, index) => (
                    <tr key={index}>
                      <td
                        style={{ backgroundColor: '#cd49de71', textAlign: "left", color: "black" }}
                      >
                        {row.booked ? formatDate(row.booked.rawDate) : ""}
                        <div style={{ fontSize: "12px", }}>
                          {row.booked ? (row.booked.venueType) : ""}
                        </div>
                      </td>

                      <td
                        style={{ backgroundColor: '#ee1e1e72' }}
                      >
                        {row.enquiry ? formatDate(row.enquiry.rawDate) : ""}
                      </td>

                      <td
                        style={{ backgroundColor: '#34d2347a' }}
                      >
                        {row.hold ? (
                          <>
                            {formatDate(row.hold.rawDate)}
                            {row.hold?.winProbability && (
                              <div>{row.hold.winProbability}% prob</div>
                            )}
                          </>
                        ) : (
                          ""
                        )}
                      </td>

                      <td
                        style={{ backgroundColor: '#099aaa6e' }}
                      >
                        {row.bookingHold ? (
                          <>
                            {formatDate(row.bookingHold.rawDate)}
                            {row.bookingHold?.winProbability && (
                              <div>({row.bookingHold.winProbability}% prob)</div>
                            )}
                          </>
                        ) : (
                          ""
                        )}
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

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
          border-radius: 10px;
          width: 100%;
          max-width: 1000px;
          max-height: 100vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .scrollable-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .scrollable-table thead {
          background: linear-gradient(to bottom, #58bfff, #1a9cff);
          position: sticky;
          top: 0;
          z-index: 2;
          border-bottom: 2px solid #0d75cc;     
        }
        
        .scrollable-table th,
        .scrollable-table td {
          padding: 5px;
          border: 2px solid #fafafaff;
          text-align: center;
          word-break: break-word;
          font-weight:600;
          color:black;
          box-shadow: 
              inset 2px 2px 8px rgba(255, 255, 255, 0.6),  
              inset -2px -2px 8px rgba(0, 0, 0, 0.25),    
              6px 6px 12px rgba(0, 0, 0, 0.4); 
          }

        .table-scroll-wrapper {
          width: 100%;
          max-height: 70vh;
          overflow-x: auto;
          overflow-y: auto;
          scrollbar-width: thin;
        }
           
      `}</style>
    </>
  );
};

export default AllBookingDatesPopup;
