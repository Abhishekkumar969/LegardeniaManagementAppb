import React, { useState } from 'react';
import '../styles/LogPopupCell.css';

const VendorLogPopupCell = ({ vendor }) => {
    const [showLogs, setShowLogs] = useState(false);

    const formatToIST = (dateVal) => {
        if (!dateVal) return "-";

        let d;
        if (dateVal.seconds) {
            // Firestore timestamp
            d = new Date(dateVal.seconds * 1000);
        } else if (typeof dateVal === "string") {
            // Custom string like "13/10/2025, 8:39:17 pm"
            const [datePart, timePart] = dateVal.split(", ");
            if (!datePart || !timePart) return dateVal;
            const [day, month, year] = datePart.split("/").map(Number);
            let [hours, minutes, seconds] = timePart.split(/[: ]/).slice(0, 3).map(Number);
            const ampm = timePart.slice(-2).toLowerCase();
            if (ampm === "pm" && hours < 12) hours += 12;
            if (ampm === "am" && hours === 12) hours = 0;
            d = new Date(year, month - 1, day, hours, minutes, seconds);
        } else {
            d = new Date(dateVal);
        }

        // Convert to IST (UTC +5:30)
        const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);

        return ist.toLocaleString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        });
    };

    const updateLogs = vendor
        ? Object.keys(vendor)
            .filter(k => k.startsWith('updateLog'))
            .sort((a, b) => {
                const aTime = new Date(vendor[a]?.at?.seconds ? vendor[a].at.seconds * 1000 : vendor[a]?.at).getTime();
                const bTime = new Date(vendor[b]?.at?.seconds ? vendor[b].at.seconds * 1000 : vendor[b]?.at).getTime();
                return bTime - aTime;
            })
        : [];

    const renderValue = (val, fieldName) => {
        if (!val) return <span>None</span>;

        const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

        // Format dates to IST
        if (fieldName === "updatedAt" || fieldName === "at") {
            return formatToIST(val);
        }

        // Services
        if (fieldName === "services" && isObject(val)) {
            return (
                <div style={{ marginTop: "6px", paddingLeft: "12px" }}>
                    {["old", "new"].map((type) =>
                        val[type]?.length > 0 ? (
                            <div key={type} style={{ marginBottom: "6px" }}>
                                <b>{type.toUpperCase()}:</b>
                                {val[type].map((item, i) => (
                                    <div key={i} style={{ paddingLeft: "12px", marginBottom: "2px" }}>
                                        • <b>{item.name}</b>
                                        {item.qty !== undefined && <> Qty: {item.qty},</>}
                                        {item.rate !== undefined && <> Rate: ₹{item.rate},</>}
                                        {item.royaltyAmount !== undefined && <> Royalty: ₹{item.royaltyAmount},</>}
                                        {item.royaltyPercent !== undefined && <> %: {item.royaltyPercent},</>}
                                        {item.total !== undefined && <> Total: ₹{item.total}</>}
                                    </div>
                                ))}
                            </div>
                        ) : null
                    )}
                </div>
            );
        }

        // Summary
        if (fieldName === "summary" && isObject(val)) {
            return (
                <div style={{ marginTop: "6px", paddingLeft: "12px" }}>
                    {["old", "new"].map((type) =>
                        isObject(val[type]) ? (
                            <div key={type} style={{ marginBottom: "6px" }}>
                                <b>{type.toUpperCase()}:</b>
                                {Object.entries(val[type])
                                    .filter(([k]) => k !== "updatedAt")
                                    .map(([k, v]) => (
                                        <div key={k} style={{ paddingLeft: "12px" }}>
                                            • <b>{k}:</b> {v}
                                        </div>
                                    ))}
                            </div>
                        ) : null
                    )}
                </div>
            );
        }

        // Arrays
        if (Array.isArray(val)) {
            return val.length ? (
                <div style={{ marginTop: "6px", paddingLeft: "12px" }}>
                    {val.map((item, i) =>
                        isObject(item) ? (
                            Object.entries(item)
                                .filter(([k]) => k !== "updatedAt")
                                .map(([k, v]) => (
                                    <div key={k}>
                                        <b>{k}:</b> {String(v ?? "None")}
                                    </div>
                                ))
                        ) : (
                            <div key={i}>{String(item ?? "None")}</div>
                        )
                    )}
                </div>
            ) : (
                <span>None</span>
            );
        }

        // Generic objects
        if (isObject(val)) {
            return (
                <div style={{ marginTop: "6px", paddingLeft: "12px" }}>
                    {Object.entries(val)
                        .filter(([k]) => k !== "updatedAt")
                        .map(([k, v]) => (
                            <div key={k}>
                                <b>{k}:</b> {Array.isArray(v) ? `[Array]` : isObject(v) ? `[Object]` : v}
                            </div>
                        ))}
                </div>
            );
        }

        // Primitive fallback
        return <span>{String(val)}</span>;
    };

    return (
        <div key={`${vendor.id}-logs`} style={{ display: "flex", justifyContent: "center", width: "fit-content", alignItems: "center" }}>

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
                        <h3 className="log-popup-heading"> Update Logs for <b>{vendor.customerName}</b></h3>

                        {updateLogs.length === 0 && <p style={{ color: '#999' }}>No logs available.</p>}

                        {updateLogs.map((logKey) => {
                            const log = vendor[logKey];
                            if (!log?.changes) return null;

                            return (
                                <div className="log-entry" key={logKey}>
                                    <div>
                                        <b>Time:</b> {formatToIST(log.at)}
                                    </div>
                                    {log.by && (
                                        <div className="log-by-info">
                                            <div>
                                                <b>By:</b>{" "}
                                                {log.by ? `${log.by.name || "Unknown User"} (${log.by.email || "No email"})` : "Unknown User"}
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

export default VendorLogPopupCell;
