import React, { useState, useMemo } from 'react';

const Tbody = ({ leads, userPermissions, sortConfig, paymentModes }) => {
    const [selectedAdvances, setSelectedAdvances] = useState(null);

    const sortedLeads = useMemo(() => {
        const sorted = [...leads];
        if (sortConfig.key) {
            sorted.sort((a, b) => {
                const aVal = a[sortConfig.key] ? new Date(a[sortConfig.key]) : new Date(0);
                const bVal = b[sortConfig.key] ? new Date(b[sortConfig.key]) : new Date(0);

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sorted;
    }, [leads, sortConfig]);

    const formatAmount = (amount) => {
        if (amount === null || amount === undefined || isNaN(amount)) return '-';
        return Number(amount).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const [year, month, day] = dateStr.split('-');
        return `${day}-${month}-${year}`;
    };

    return (
        <>
            <tbody>
                {sortedLeads.map((lead, index) => {
                    const nonCashAdvances =
                        lead.advancePayments?.filter(adv => adv.mode !== "Cash") || [];

                    const nonCashTotal = nonCashAdvances.reduce(
                        (sum, adv) => sum + Number(adv.amount || 0),
                        0
                    );

                    return (
                        <tr
                            key={lead.id}
                            style={{
                                whiteSpace: "nowrap",
                                backgroundColor:
                                    userPermissions.venueTypeColors?.[lead.venueType] || "white",
                                transition: "all 0.3s ease",
                            }}
                        >
                            <td className="sticky sticky-1" style={{
                                fontWeight: 'bold', backgroundColor: userPermissions.venueTypeColors?.[lead.venueType] || "white",
                            }}>{leads.length - index}.</td>

                            {['functionDate'].map((field) => (
                                <td
                                    key={`${lead.id}-${field}`}
                                    style={{
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        fontWeight: '700',
                                        padding: '0px 2px 0px 5px',
                                        fontSize: '14px',
                                        color: "black",
                                        backgroundColor: userPermissions.venueTypeColors?.[lead.venueType] || "white",

                                    }}
                                >
                                    <>
                                        {lead[field] ? formatDate(lead[field]) : '-'}

                                        {lead.meals &&
                                            (() => {
                                                const funcDate = lead[field] ? formatDate(lead[field]) : null;

                                                const uniqueMealDates = [
                                                    ...new Set(
                                                        Object.values(lead.meals)
                                                            .filter(dayData => dayData?.date)
                                                            .map(dayData => formatDate(dayData.date))
                                                    ),
                                                ];

                                                return uniqueMealDates
                                                    .filter(d => d !== funcDate)
                                                    .map((d, i) => (
                                                        <div
                                                            key={i}
                                                            style={{
                                                                color: "brown",
                                                                marginTop: "2px",
                                                            }}
                                                        >
                                                            {d}
                                                        </div>
                                                    ));
                                            })()
                                        }

                                    </>
                                </td>
                            ))}

                            {['name'].map((field, index) => (
                                <td
                                    style={{
                                        whiteSpace: 'nowrap',
                                        maxWidth: '180rem',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        backgroundColor: userPermissions.venueTypeColors?.[lead.venueType] || "white",

                                    }}
                                    key={`${lead.id}-${field}`}
                                >
                                    {`${lead.prefix || ''} ${lead.name || '-'}`.trim()}
                                </td>
                            ))}

                            {['enquiryDate'].map((field) => (
                                <td
                                    style={{
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        fontSize: '13px',
                                        backgroundColor: userPermissions.venueTypeColors?.[lead.venueType] || "white",
                                    }}
                                    key={`${lead.id}-${field}`}
                                >
                                    <>
                                        {field.includes('Date') ? formatDate(lead[field]) : (lead[field] ?? '-')}

                                    </>
                                </td>
                            ))}

                            <td key={`${lead.id}-gstBase`} style={{ backgroundColor: userPermissions.venueTypeColors?.[lead.venueType] || "white", }}>
                                ₹{Math.floor(nonCashTotal / 1.18).toLocaleString('en-IN')}
                            </td>
                            <td key={`${lead.id}-gstAmount`} style={{ backgroundColor: userPermissions.venueTypeColors?.[lead.venueType] || "white", }}>
                                ₹{Math.floor(nonCashTotal - (nonCashTotal / 1.18)).toLocaleString('en-IN')}
                            </td>

                            {['grandTotal'].map(field => {
                                const total = Number(lead.grandTotal) || 0;
                                const discount = Number(lead.discount) || 0;
                                const finalTotal = total + discount;

                                return (
                                    <td
                                        key={`${lead.id}-${field}`}
                                        style={{
                                            backgroundColor: '#04ff42ff',
                                            fontWeight: '800',
                                            display: "none"
                                        }}
                                    >
                                        ₹{Math.floor(finalTotal).toLocaleString('en-IN')}
                                    </td>
                                );
                            })}

                            <td>
                                <div style={{ display: "flex", justifyContent: "space-around" }}>
                                    <span
                                        className={nonCashTotal === 0 ? "hide-amount" : ""}
                                        style={{ fontWeight: "800" }}
                                    >
                                        ₹{nonCashTotal.toLocaleString("en-IN")}
                                    </span>

                                    <span>
                                        {nonCashTotal > 0 && (
                                            <button
                                                className="printBtnMeal"
                                                style={{
                                                    padding: "4px 8px",
                                                    cursor: "pointer",
                                                    background: "#008979ff",
                                                    fontSize: "12px",
                                                    color: "white",
                                                    fontWeight: "800"
                                                }}
                                                onClick={() => setSelectedAdvances(nonCashAdvances)}
                                            >
                                                View Details
                                            </button>
                                        )}
                                    </span>
                                </div>
                            </td>

                            {paymentModes.map(mode => {
                                const modePayments =
                                    (lead.advancePayments || []).filter(p => p.mode === mode);

                                const modeTotal = modePayments.reduce(
                                    (s, p) => s + Number(p.amount || 0),
                                    0
                                );

                                return (
                                    <td key={mode} style={{ whiteSpace: "nowrap" }}>
                                        {modeTotal > 0 && (
                                            <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center" }}>
                                                <span style={{ fontWeight: "800" }}>
                                                    ₹{modeTotal.toLocaleString("en-IN")}
                                                </span>

                                                <button
                                                    className="printBtnMeal"
                                                    style={{
                                                        padding: "6px",
                                                        cursor: "pointer",
                                                        background: "#008979ff",
                                                        fontSize: "11px",
                                                        color: "white",
                                                        fontWeight: "700"
                                                    }}
                                                    onClick={() => setSelectedAdvances(modePayments)}
                                                >
                                                    View
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                );
                            })}

                        </tr>
                    )
                })}
            </tbody >

            {selectedAdvances && (
                <div style={{
                    position: "fixed",
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.4)",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    zIndex: 1000,
                    backdropFilter: "blur(6px)"
                }}>
                    <div style={{
                        background: "linear-gradient(135deg, #ffffffcc, #f0f0f0dd)",
                        padding: "25px",
                        borderRadius: "16px",
                        minWidth: "250px",
                        maxHeight: "70vh",
                        overflowY: "auto",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.25), inset 0 2px 8px rgba(255,255,255,0.6)",
                        transform: "scale(1)",
                        animation: "popupFadeIn 0.3s ease-out"
                    }}>
                        <h3 style={{
                            marginBottom: "15px",
                            fontSize: "1.4rem",
                            fontWeight: "bold",
                            color: "#333",
                            textAlign: "center",
                            textShadow: "1px 1px 2px rgba(0,0,0,0.15)"
                        }}>
                            💰 Payment Received
                        </h3>

                        {selectedAdvances.length > 0 ? (
                            selectedAdvances.map((adv, idx) => (
                                <div key={idx} style={{
                                    marginBottom: "12px",
                                    padding: "10px 14px",
                                    display: 'flex',
                                    borderRadius: "10px",
                                    background: "linear-gradient(135deg,#fdfdfd,#f5f5f5)",
                                    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                                    transition: "transform 0.2s",
                                }}>
                                    <strong style={{ fontSize: "1.1rem", color: "#222" }}>
                                        ₹ {formatAmount(adv.amount)}
                                    </strong>
                                    <span style={{ color: "#000000ff" }}>- via {adv.mode}  -</span>
                                    <br />
                                    <span style={{ color: "#000000ff", fontWeight: '600' }}>
                                        {formatDate(adv.receiptDate)}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p style={{ textAlign: "center", color: "#666" }}>No Payment Received </p>
                        )}

                        <button
                            style={{
                                marginTop: "15px",
                                padding: "8px 18px",
                                borderRadius: "8px",
                                border: "none",
                                background: "linear-gradient(135deg, #cb1111ff, #fc25c3ff)",
                                color: "white",
                                fontWeight: "bold",
                                cursor: "pointer",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                                transition: "all 0.2s",
                            }}
                            onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"}
                            onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
                            onClick={() => setSelectedAdvances(null)}
                        >
                            Close
                        </button>
                    </div>

                    {/* Animation style */}
                    <style>
                        {`
                @keyframes popupFadeIn {
                    from {
                        opacity: 0;
                        transform: scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
            `}
                    </style>
                </div>
            )}
        </>

    );
};

export default Tbody;