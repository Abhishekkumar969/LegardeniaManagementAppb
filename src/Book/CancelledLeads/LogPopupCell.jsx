import React, { useState } from "react";
import "../../styles/LogPopupCell.css";

const LogPopupCell = ({ lead }) => {
    const [showLogs, setShowLogs] = useState(false);

    const parseTime = (t) => {
        if (!t) return 0;
        if (t.seconds) return t.seconds * 1000; // Firestore Timestamp
        if (typeof t === "string") return new Date(t).getTime(); // ISO String
        return 0;
    };

    const updateLogs = Object.keys(lead)
        .filter((k) => k.startsWith("updateLog"))
        .sort((a, b) => parseTime(lead[b]?.at) - parseTime(lead[a]?.at));

    const formatTimestamp = (t) => {
        if (!t) return "Unknown";
        if (t.seconds) return new Date(t.seconds * 1000).toLocaleString("en-GB");
        if (typeof t === "string") return new Date(t).toLocaleString("en-GB");
        return "Unknown";
    };

    const formatDate = (iso) => formatTimestamp(iso);

    const renderValue = (val, fieldName) => {
        if (fieldName === "updatedAt") return <span>{formatDate(val)}</span>;

        if (fieldName === "customItems" && Array.isArray(val)) {
            return (
                <div style={{ marginTop: "6px" }}>
                    {val.map((item, i) => (
                        <div key={i} style={{ marginBottom: "4px", paddingLeft: "12px" }}>
                            • <b>{item.name}</b>
                            {item.qty !== undefined && <> Qty: {item.qty},</>}
                            {item.rate !== undefined && <> Rate: ₹{item.rate},</>}
                            {item.total !== undefined && <> Total: ₹{item.total}</>}
                        </div>
                    ))}
                </div>
            );
        }

        if (fieldName === "bookingAmenities" && Array.isArray(val)) {
            return (
                <div style={{ marginTop: "6px" }}>
                    {val.map((item, i) => (
                        <div key={i} style={{ marginBottom: "4px", paddingLeft: "12px" }}>
                            • {item}
                        </div>
                    ))}
                </div>
            );
        }

        if (fieldName === "selectedMenus" && typeof val === "object" && val !== null) {
            return (
                <div style={{ marginTop: "6px", paddingLeft: "12px" }}>
                    {Object.entries(val).map(([menuName, data], i) => (
                        <div key={i} style={{ marginBottom: "4px" }}>
                            🍽️ <b>{menuName}</b> - Qty: {data.qty}, Rate: ₹{data.rate}, Total: ₹{data.total}
                        </div>
                    ))}
                </div>
            );
        }

        if (fieldName === "meals" && val?.Breakfast) {
            const bf = val.Breakfast;
            return (
                <div className="meal-block" style={{ paddingLeft: "12px", marginTop: "6px" }}>
                    🍳 <b>Breakfast</b><br />
                    • Time: {bf.startTime} - {bf.endTime}<br />
                    • Pax: {bf.pax}<br />
                    • Rate: ₹{bf.rate}<br />
                    • Total: ₹{bf.total}
                </div>
            );
        }

        if (Array.isArray(val)) return <span>{val.length === 0 ? "None" : "[Array]"}</span>;
        if (typeof val === "object" && val !== null) return <span>[Object]</span>;

        return <span>"{String(val || "None")}"</span>;
    };

    const generatePrintableValue = (val, fieldName) => {
        if (fieldName === "customItems" && Array.isArray(val)) {
            return val
                .map(
                    (item) =>
                        `• <b>${item.name}</b>${item.qty !== undefined ? ` Qty: ${item.qty},` : ""
                        }${item.rate !== undefined ? ` Rate: ₹${item.rate},` : ""}${item.total !== undefined ? ` Total: ₹${item.total}` : ""
                        }`
                )
                .join("<br>");
        }

        if (fieldName === "bookingAmenities" && Array.isArray(val)) {
            return val.map((item) => `• ${item}`).join("<br>");
        }

        if (fieldName === "selectedMenus" && typeof val === "object" && val !== null) {
            return Object.entries(val)
                .map(
                    ([menuName, data]) =>
                        `🍽️ <b>${menuName}</b> - Qty: ${data.qty}, Rate: ₹${data.rate}, Total: ₹${data.total}`
                )
                .join("<br>");
        }

        if (fieldName === "meals" && val?.Breakfast) {
            const bf = val.Breakfast;
            return `
                🍳 <b>Breakfast</b><br>
                • Time: ${bf.startTime} - ${bf.endTime}<br>
                • Pax: ${bf.pax}<br>
                • Rate: ₹${bf.rate}<br>
                • Total: ₹${bf.total}
            `;
        }

        if (Array.isArray(val)) return val.length === 0 ? "None" : "[Array]";
        if (typeof val === "object" && val !== null) return "[Object]";

        return `"${String(val || "None")}"`;
    };

    const generatePrintHTML = ({ lead, updateLogs }) => {
        const style = `
            <style>
                body { font-family: 'Segoe UI', Tahoma; padding: 30px; color: #111; }
                h2 { text-align: center; color: #2e86de; margin-bottom: 30px; }
                .log-entry { border-left: 6px solid #2e86de; padding: 18px; background: #f9f9f9; margin-bottom: 30px; }
                .log-entry-header { display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 10px; }
                .log-label { font-weight: 600; margin: 12px 0 6px; }
                .log-cols { display: flex; gap: 16px; }
                .log-old-col { width: 48%; background: #ffeaea; padding: 12px; border-radius: 6px; }
                .log-new-col { width: 48%; background: #e3ffe9; padding: 12px; border-radius: 6px; }
            </style>
        `;

        let content = `<html><head>${style}</head><body>`;
        content += `<h2>Update Logs for ${lead.name}</h2>`;

        updateLogs.forEach((logKey) => {
            const log = lead[logKey];
            if (!log?.changes) return;

            content += `
                <div class="log-entry">
                    <div class="log-entry-header">
                        <div>📝 ${logKey}</div>
                        <div>${formatTimestamp(log.at)}</div>
                    </div>
            `;

            Object.entries(log.changes).forEach(([field, { old, new: newVal }]) => {
                content += `
                    <div class="log-label">${field}</div>
                    <div class="log-cols">
                        <div class="log-old-col">${generatePrintableValue(old, field)}</div>
                        <div class="log-new-col">${generatePrintableValue(newVal, field)}</div>
                    </div>
                `;
            });

            content += `</div>`;
        });

        return content + "</body></html>";
    };

    const handlePrint = () => {
        const printWindow = window.open("", "", "width=1000,height=800");
        printWindow.document.write(generatePrintHTML({ lead, updateLogs }));
        printWindow.print();
    };

    return (
        <>
            <div key={`${lead.id}-logs`} style={{ display: "flex", justifyContent: "center", width: "fit-content", alignItems:"center" }}>
                {updateLogs.length > 0 && (
                    <button
                        onClick={() => setShowLogs(true)}
                        className=" printBtnMeal"
                    >
                        <img src="../../assets/logs.png" alt="Logs" style={{ width: 30, height: 30 }} />
                    </button>
                )}

            </div>
            {showLogs && (
                <div

                    className="log-popup-overlay"
                    onClick={(e) =>
                        e.target.classList.contains("log-popup-overlay") && setShowLogs(false)
                    }
                >
                    <div className="log-popup-box">
                        <button className="log-popup-close" onClick={() => setShowLogs(false)}>
                            ✖
                        </button>

                        <button className="log-popup-print" onClick={handlePrint}>
                            🖨️ Print Logs
                        </button>

                        <h3 className="log-popup-heading">
                            Update Logs for <b>{lead.name}</b>
                        </h3>

                        {updateLogs.map((logKey) => {
                            const log = lead[logKey];
                            if (!log?.changes) return null;

                            return (
                                <div className="log-entry" key={logKey}>
                                    <div className="log-entry-header">
                                        <div>📝 {logKey}</div>
                                        <div>{formatTimestamp(log.at)}</div>
                                    </div>

                                    {log.by && (
                                        <div className="log-by-info">
                                            <strong>By:</strong> {log.by.name} ({log.by.email})
                                        </div>
                                    )}

                                    <ul className="log-change-list">
                                        {Object.entries(log.changes).map(
                                            ([field, { old, new: newVal }], idx) => (
                                                <li key={idx} className="log-row">
                                                    <div className="log-label">{field}</div>
                                                    <div className="log-cols">
                                                        <div className="log-old-col">
                                                            {renderValue(old, field)}
                                                        </div>
                                                        <div className="log-arrow">→</div>
                                                        <div className="log-new-col">
                                                            {renderValue(newVal, field)}
                                                        </div>
                                                    </div>
                                                </li>
                                            )
                                        )}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
};

export default LogPopupCell;
