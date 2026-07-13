import React, { useState } from 'react';
import '../styles/LogPopupCell.css';

const DecorationLogPopupCell = ({ decoration }) => {
    const [showLogs, setShowLogs] = useState(false);

    const updateLogs = decoration
        ? Object.keys(decoration)
            .filter(k => k.startsWith('updateLog'))
            .sort((a, b) => {
                const aTime = decoration[a]?.at?.seconds || 0;
                const bTime = decoration[b]?.at?.seconds || 0;
                return bTime - aTime;
            })
        : [];

    const convertToISTDateTime = (timestampSeconds) => {
        if (!timestampSeconds) return "Unknown time";
        const d = new Date(timestampSeconds * 1000);
        const istTime = new Date(d.getTime() + 5.5 * 60 * 60 * 1000); // UTC+5:30

        const day = String(istTime.getUTCDate()).padStart(2, "0");
        const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
        const year = istTime.getUTCFullYear();

        let hours = istTime.getUTCHours();
        const minutes = String(istTime.getUTCMinutes()).padStart(2, "0");
        const seconds = String(istTime.getUTCSeconds()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;

        return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} ${ampm}`;
    };


    const renderValue = (val, fieldName) => {
        if (fieldName === 'customItems' && Array.isArray(val)) {
            return (
                <div style={{ marginTop: '6px' }}>
                    {val.map((item, i) => (
                        <div key={i} style={{ marginBottom: '4px', paddingLeft: '12px' }}>
                            • <b>{item.name}</b>
                            {item.qty !== undefined && <> Qty: {item.qty},</>}
                            {item.rate !== undefined && <> Rate: ₹{item.rate},</>}
                            {item.total !== undefined && <> Total: ₹{item.total}</>}
                        </div>
                    ))}
                </div>
            );
        }

        // Meals (nested object)
        if (fieldName === 'meals' && val && typeof val === 'object') {
            return Object.entries(val).map(([mealType, mealData]) => (
                <div key={mealType} style={{ paddingLeft: '12px', marginTop: '6px' }}>
                    🍳 <b>{mealType}</b><br />
                    {mealData.startTime && <>• Time: {mealData.startTime} - {mealData.endTime}<br /></>}
                    {mealData.pax && <>• Pax: {mealData.pax}<br /></>}
                    {mealData.rate && <>• Rate: ₹{mealData.rate}<br /></>}
                    {mealData.total && <>• Total: ₹{mealData.total}<br /></>}
                </div>
            ));
        }

        // Services (array of objects)
        if (fieldName === 'services' && Array.isArray(val)) {
            return (
                <div style={{ marginTop: '6px', paddingLeft: '12px' }}>
                    {val.map((item, i) => (
                        <div key={i} style={{ marginBottom: '4px' }}>
                            • <b>{item.name}</b> - Remarks: {item.remarks}, Total: ₹{item.total}
                        </div>
                    ))}
                </div>
            );
        }

        // Summary / address / any object
        if (val && typeof val === 'object') {
            return (
                <div style={{ marginTop: '6px', paddingLeft: '12px' }}>
                    {Object.entries(val).map(([k, v]) => (
                        <div key={k}>
                            <b>{k}:</b> {Array.isArray(v) ? `[Array]` : typeof v === 'object' ? `[Object]` : v}
                        </div>
                    ))}
                </div>
            );
        }

        // Array fallback
        if (Array.isArray(val)) {
            return <span>{val.length === 0 ? 'None' : '[Array]'}</span>;
        }

        // Primitive fallback
        return <span>"{String(val || 'None')}"</span>;
    };

    const generatePrintableValue = (val, fieldName) => {
        if (fieldName === 'customItems' && Array.isArray(val)) {
            return val.map(item =>
                `• <b>${item.name}</b>${item.qty !== undefined ? ` Qty: ${item.qty},` : ''}${item.rate !== undefined ? ` Rate: ₹${item.rate},` : ''}${item.total !== undefined ? ` Total: ₹${item.total}` : ''}`
            ).join('<br>');
        }

        if (fieldName === 'bookingAmenities' && Array.isArray(val)) {
            return val.map(item => `• ${item}`).join('<br>');
        }

        if (fieldName === 'selectedMenus' && typeof val === 'object' && val !== null) {
            return Object.entries(val).map(([menuName, data]) =>
                `🍽️ <b>${menuName}</b> - Qty: ${data.qty}, Rate: ₹${data.rate}, Total: ₹${data.total}`
            ).join('<br>');
        }

        if (fieldName === 'meals' && val?.Breakfast) {
            const bf = val.Breakfast;
            return `
          🍳 <b>Breakfast</b><br>
          • Time: ${bf.startTime} - ${bf.endTime}<br>
          • Pax: ${bf.pax}<br>
          • Rate: ₹${bf.rate}<br>
          • Total: ₹${bf.total}
        `;
        }

        if (Array.isArray(val)) return val.length === 0 ? 'None' : '[Array]';
        if (typeof val === 'object' && val !== null) return '[Object]';
        return `"${String(val || 'None')}"`;
    };

    const generatePrintHTML = ({ decoration, updateLogs }) => {
        const style = `
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, sans-serif;
          padding: 30px;
          color: #111;
        }
        h2 {
          text-align: center;
          color: #2e86de;
          margin-bottom: 30px;
        }
        .log-entry {
          border-left: 6px solid #2e86de;
          padding: 18px;
          background: #f9f9f9;
          margin-bottom: 30px;
          page-break-inside: avoid;
        }
        .log-entry-header {
          display: flex;
          justify-content: space-between;
          font-weight: bold;
          margin-bottom: 10px;
          color: #333;
        }
        .log-label {
          font-weight: 600;
          margin: 12px 0 6px;
          font-size: 15px;
        }
        .log-cols {
          display: flex;
          gap: 16px;
        }
        .log-old-col, .log-new-col {
          width: 48%;
          padding: 12px;
          border-radius: 6px;
          font-size: 14px;
          box-sizing: border-box;
        }
        .log-old-col {
          background: #ffeaea;
          color: #b51a1a;
        }
        .log-new-col {
          background: #e3ffe9;
          color: #186c3b;
        }
      </style>
    `;

        let content = `<html><head><title>Logs - ${decoration.name}</title>${style}</head><body>`;
        content += `<h2>Update Logs for ${decoration.name}</h2>`;

        if (updateLogs.length === 0) {
            content += `<p>No logs available.</p>`;
        }

        updateLogs.forEach((logKey) => {
            const log = decoration[logKey];
            if (!log?.changes) return;

            content += `
          <div class="log-entry">
            <div class="log-entry-header">
              <div>📝 ${logKey}</div>
              <div>${log.at?.seconds ? convertToISTDateTime(log.at.seconds) : 'Unknown time'}</div>
            </div>
        `;

            Object.entries(log.changes).forEach(([field, { old, new: newVal }]) => {
                const oldValHTML = generatePrintableValue(old, field);
                const newValHTML = generatePrintableValue(newVal, field);

                content += `
              <div class="log-label">${field}</div>
              <div class="log-cols">
                <div class="log-old-col">${oldValHTML}</div>
                <div class="log-new-col">${newValHTML}</div>
              </div>
            `;
            });

            content += `</div>`;
        });

        content += `</body></html>`;
        return content;
    };

    const handlePrint = () => {
        const printWindow = window.open('', '', 'width=1000,height=800');
        const content = generatePrintHTML({ decoration, updateLogs });
        printWindow.document.open();
        printWindow.document.write(content);
        printWindow.print();
    };

    return (
        <div key={`${decoration.id}-logs`} style={{ display: "flex", justifyContent: "center", width: "fit-content", alignItems: "center" }}>

            {/* <button
                onClick={() => setShowLogs(true)}
                className="log-popup-btn"
                disabled={updateLogs.length === 0} // Disable if no logs
                style={{
                    backgroundColor: updateLogs.length === 0 ? '#ccc' : '#2e86de', // Gray if disabled
                    cursor: updateLogs.length === 0 ? 'not-allowed' : 'pointer',
                    color: updateLogs.length === 0 ? '#666' : '#fff',
                }}
            >
                View Logs
            </button> */}

            {updateLogs.length > 0 && (
                <button
                    onClick={() => setShowLogs(true)}
                    className=" printBtnMeal"
                    disabled={updateLogs.length === 0}
                >
                    <img src="../../assets/logs.png" alt="Logs" style={{ width: 30, height: 30 }} />
                </button>
            )}

            {showLogs && (
                <div
                    className="log-popup-overlay"
                    onClick={(e) => {
                        if (e.target.classList.contains('log-popup-overlay')) {
                            setShowLogs(false);
                        }
                    }}
                >
                    <div className="log-popup-box">

                        <button className="log-popup-close" onClick={() => setShowLogs(false)}>✖</button>
                        <button className="log-popup-print" onClick={handlePrint}>
                            🖨️ Print Logs
                        </button>
                        <h3 className="log-popup-heading"> Update Logs for <b>{decoration.customerName}</b></h3>

                        {updateLogs.length === 0 && <p style={{ color: '#999' }}>No logs available.</p>}

                        {updateLogs.map((logKey) => {
                            const log = decoration[logKey];
                            if (!log?.changes) return null;

                            return (
                                <div className="log-entry" key={logKey}>
                                    <div>
                                        <b>Time:</b>{" "}
                                        {log.at?.seconds ? convertToISTDateTime(log.at.seconds) : ""}
                                    </div>

                                    {log.by && (
                                        <div className="log-by-info">
                                            <div>
                                                <b>By:</b>{" "}
                                                {log.by
                                                    ? `${log.by.name || ""} (${log.by.email || "No email"})`
                                                    : ""}
                                            </div>
                                        </div>
                                    )}

                                    <ul className="log-change-list">
                                        {Object.entries(log.changes || {}).map(([field, { old, new: newVal }], idx) => (
                                            <li key={idx} className="log-row">
                                                <div className="log-label">{field}</div>
                                                <div className="log-cols">
                                                    <div className="log-old-col">{renderValue(old, field)}</div>
                                                    <div className="log-arrow">→</div>
                                                    <div className="log-new-col">{renderValue(newVal, field)}</div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DecorationLogPopupCell;