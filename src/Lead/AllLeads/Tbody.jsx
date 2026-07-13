import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LogPopupCell from "../../Book/AllLeads/LogPopupCell";

const Tbody = ({ leads, totalItems, startIndex, isEditing, editing, handleFieldChange, handleEdit, handleDateChange, startEdit, moveLeadToDrop, handlePrint, sendToPrintAllMeals, sendToPrintCombined, handleCancelEdit, formatTime12Hour, tempFollowUps, setTempFollowUps }) => {
    const [localValue, setLocalValue] = useState({});
    const [printPopup, setPrintPopup] = useState({
        open: false,
        lead: null
    });

    const handleDropClick = async (lead) => {
        const reason = window.prompt("Enter drop reason for this lead:");
        if (!reason) return;

        if (!lead.enquiryDate) {
            alert("Lead has no enquiryDate!");
            return;
        }

        const date = new Date(lead.enquiryDate);
        if (isNaN(date)) {
            alert("Invalid enquiryDate!");
            return;
        }

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthYear = `${monthNames[date.getMonth()]}${date.getFullYear()}`;

        await moveLeadToDrop(lead.id, true, reason, monthYear);
    };

    const getTempFollowUp = (leadId, index) => {
        return tempFollowUps[`${leadId}_${index}`] || {};
    };

    const setTempFollowUp = (leadId, index, data) => {
        setTempFollowUps(prev => ({
            ...prev,
            [`${leadId}_${index}`]: {
                ...prev[`${leadId}_${index}`],
                ...data
            }
        }));
    };

    const handleLocalChange = (leadId, field, value) => {
        setLocalValue(prev => ({
            ...prev,
            [leadId]: {
                ...prev[leadId],
                [field]: value
            }
        }));
    };

    const getLocalValue = (leadId, field, fallback) => {
        return localValue[leadId]?.[field] !== undefined ? localValue[leadId][field] : fallback;
    };

    const handleBlur = (leadId, field) => {
        const value = localValue[leadId]?.[field];
        if (value !== undefined) {
            handleFieldChange(leadId, field, value);
            setLocalValue(prev => {
                const updated = { ...prev };
                if (updated[leadId]) {
                    delete updated[leadId][field];
                    if (Object.keys(updated[leadId]).length === 0) {
                        delete updated[leadId];
                    }
                }
                return updated;
            });
        }
    };

    const getColumnColorClass = (value) => {
        const prob = parseFloat(value);
        if (isNaN(prob)) return '';
        if (prob < 25) return 'low-prob';
        if (prob < 50) return 'medium-prob';
        if (prob < 75) return 'high-prob';
        if (prob < 95) return 'very-high-prob';
        if (prob <= 100) return 'very-very-high-prob';
        return 'very-Very-very-high-prob';
    };

    const navigate = useNavigate();

    const sendToBookings = (lead) => {
        const istParts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(new Date());

        let day, month, year;
        istParts.forEach(p => {
            if (p.type === "day") day = p.value;
            if (p.type === "month") month = p.value;
            if (p.type === "year") year = p.value;
        });

        const todayIST = `${year}-${month}-${day}`;

        navigate('/booking', {
            state: {
                from: "bookingLeads",
                leadToEdit: { ...lead, enquiryDate: todayIST },
                sourceDoc: lead.monthYear  // pass the monthYear too
            }
        });
    };

    const sendToUpdate = (lead) => {
        navigate('/bookinglead', {
            state: {
                leadToEdit: lead,
                isUpdateMode: true
            }
        });
    };

    const formatDate = (date) => {
        if (!date) return "-";
        const d = new Date(date);

        const utc = d.getTime() + d.getTimezoneOffset() * 60000;
        const ist = new Date(utc + 5.5 * 60 * 60 * 1000); // Add 5 hours 30 mins

        const day = String(ist.getDate()).padStart(2, "0");
        const month = String(ist.getMonth() + 1).padStart(2, "0");
        const year = ist.getFullYear();

        return `${day}-${month}-${year}`; // DD-MM-YYYY
    };

    return (
        <>
            <tbody>
                {leads.map((lead, index) => (
                    <tr key={lead.id}
                        className={getColumnColorClass(lead.winProbability)}
                    >

                        <td className={getColumnColorClass(lead.winProbability)} style={{ fontWeight: 'bold' }}>{(totalItems ?? leads.length) - (startIndex ?? 0) - index}.</td>

                        <td className={getColumnColorClass(lead.winProbability)}
                            style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontSize: '15px',
                                fontWeight: "700",
                            }}
                        >
                            {lead.functionDate ? formatDate(lead.functionDate) : ''}
                        </td>

                        <td className={getColumnColorClass(lead.winProbability)} style={{ fontWeight: 'bold' }}>{`${lead.prefix || ''} ${lead.name || '-'}`.trim()}</td>

                        {/* {['name'].map((field) => (
                            <td className={getColumnColorClass(lead.winProbability)}
                                key={`${lead.id}-${field}`}
                            >
                                {isEditing(lead.id, field) ? (
                                    <input
                                        key={`${lead.id}-${field}-input`} // ✅ force remount
                                        type={field.includes('Date') ? 'date' : 'text'}
                                        value={getLocalValue(lead.id, field, lead[field] || '')}
                                        onChange={(e) => handleLocalChange(lead.id, field, e.target.value)}
                                        onBlur={() => {
                                            handleBlur(lead.id, field);
                                            setTimeout(() => startEdit(null, null), 0); // ✅ exit edit mode
                                        }}
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            padding: '7px',
                                            fontSize: 'inherit',
                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                        }}
                                        autoFocus
                                    />
                                ) : (
                                    field === 'name'
                                        ? `${lead.prefix || ''} ${lead.name || '-'}`.trim()
                                        : field.includes('Date') && lead[field]
                                            ? formatDate(lead[field]) // 🔁 Format to DD-MM-YYYY
                                            : (lead[field] ?? '-')
                                )}
                            </td>
                        ))} */}

                        <td className={getColumnColorClass(lead.winProbability)}> {lead.enquiryDate ? formatDate(lead.enquiryDate) : '-'} </td>

                        <td className={getColumnColorClass(lead.winProbability)}>
                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                                <button
                                    onClick={() => setPrintPopup({ open: true, lead })}
                                    className="printBtnMeal"
                                >
                                    🖨️
                                </button>
                            </div>
                        </td>

                        <td className={getColumnColorClass(lead.winProbability)}>
                            {lead.functionDate
                                ? (() => {
                                    const date = new Date(lead.functionDate);
                                    if (isNaN(date)) return '';
                                    const monthNames = [
                                        "January", "February", "March", "April", "May", "June",
                                        "July", "August", "September", "October", "November", "December"
                                    ];
                                    return monthNames[date.getMonth()]; // getMonth() gives 0-based index
                                })()
                                : ''
                            }
                        </td>

                        {['functionType', 'dayNight', 'venueType'].map(field => (
                            <td key={`${lead.id}-${field}`}>
                                {isEditing(lead.id, field) ? (
                                    <input
                                        type={typeof lead[field] === 'number' ? 'number' : 'text'}
                                        value={getLocalValue(lead.id, field, lead[field] || '')}
                                        onChange={(e) => handleLocalChange(lead.id, field, e.target.value)}
                                        onBlur={() => handleBlur(lead.id, field)}
                                        autoFocus
                                        style={{
                                            whiteSpace: 'nowrap',
                                            maxWidth: '180rem',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}
                                    />
                                ) : (
                                    <div
                                        style={{
                                            whiteSpace: 'nowrap',
                                            maxWidth: '180rem',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}
                                    >
                                        {lead[field] ?? '-'}
                                    </div>
                                )}
                            </td>
                        ))}

                        <td key={`${lead.id}-mobiles`}>
                            {isEditing(lead.id, 'mobile') ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {['mobile1', 'mobile2'].map((field) => (
                                        <input
                                            key={`${lead.id}-${field}-input`}
                                            type="text"
                                            value={getLocalValue(lead.id, field, lead[field] || '')}
                                            onChange={(e) => handleLocalChange(lead.id, field, e.target.value)}
                                            onBlur={() => handleBlur(lead.id, field)}
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                padding: '4px',
                                                fontSize: 'inherit',

                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                            }}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {['mobile1', 'mobile2'].map((field, idx) => (
                                        lead[field] ? (
                                            <span
                                                key={`${lead.id}-${field}`}
                                                onClick={() => {
                                                    const confirmed = window.confirm(
                                                        `📞 Call ${lead.name || 'this person'} (${lead.functionType || 'Unknown Role'})?`
                                                    );
                                                    if (confirmed) {
                                                        window.location.href = `tel:${lead[field]}`;
                                                    }
                                                }}
                                                style={{
                                                    color: 'black',
                                                    textDecoration: 'none',
                                                    cursor: 'pointer',
                                                    fontWeight: 'bold',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    margin: '3px 0px'
                                                }}
                                            >
                                                <span role="img" aria-label="call"></span> {lead[field]}
                                            </span>
                                        ) : (
                                            <span key={`${lead.id}-${field}`}></span>
                                        )
                                    ))}
                                </div>
                            )}
                        </td>

                        <td key={`${lead.id}-menu-details`} style={{ verticalAlign: "center" }}>
                            {lead.selectedMenus && Object.keys(lead.selectedMenus).length > 0 && (
                                <div style={{ width: "100%", marginTop: "4px" }}>

                                    {/* HEADER ROW */}
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 70px 70px 90px ",
                                            background: "#ffffffb9",
                                            color: "black",
                                            fontWeight: "700",
                                            padding: "4px 0",
                                            textAlign: "center",
                                            fontSize: "13px",
                                            border: "2px solid white"
                                        }}
                                    >
                                        <div style={{ borderRight: "2px solid white" }} >Menu Name</div>
                                        <div style={{ borderRight: "2px solid white" }} >Rate</div>
                                        <div style={{ borderRight: "2px solid white" }} >PAX</div>
                                        <div>Extra Plates</div>
                                    </div>

                                    {/* DATA ROWS */}
                                    {Object.entries(lead.selectedMenus).map(([menuName, menuData], idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "1fr 70px 70px 90px ",
                                                backgroundColor: "#bcbcbd5e",
                                                padding: "4px 0",
                                                textAlign: "center",
                                                fontSize: "13px",
                                                border: "2px solid white"
                                            }}
                                        >
                                            <div style={{ borderRight: "2px solid white" }}>
                                                {menuName
                                                    ?.toLowerCase()
                                                    .split(" ")
                                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                                    .join(" ")}
                                            </div>

                                            <div style={{ borderRight: "2px solid white" }} >₹{menuData.rate}</div>
                                            <div style={{ borderRight: "2px solid white" }} >{menuData.noOfPlates}</div>
                                            <div >{menuData.extraPlates}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </td>

                        <td key={`${lead.id}-meals`} style={{ verticalAlign: "center" }}>
                            {lead.meals &&
                                Object.entries(lead.meals)
                                    .filter(([_, dayData]) =>
                                        Object.entries(dayData).some(
                                            ([mealName, mealInfo]) => mealName !== "date" && mealInfo?.total
                                        )
                                    )
                                    .sort(([a], [b]) => parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10))
                                    .map(([dayName, dayData], dayIdx) => {
                                        const mealOrder = ["Breakfast", "Lunch", "Dinner"];

                                        return (
                                            <div
                                                key={dayIdx}
                                                style={{
                                                    width: "100%",
                                                    marginTop: "6px",
                                                    borderRadius: "4px",
                                                    overflow: "hidden",
                                                    whiteSpace: "nowrap",
                                                    background: "#ffffff05",
                                                    border: "2px solid white"
                                                }}
                                            >
                                                {/* DAY HEADER */}
                                                <div
                                                    style={{
                                                        background: "#ffffff",
                                                        color: "black",
                                                        padding: "6px",
                                                        fontWeight: "700",
                                                        textAlign: "center",
                                                        fontSize: "13px",
                                                    }}
                                                >
                                                    {dayName} ({dayData.date ? formatDate(dayData.date) : "No date"})
                                                </div>

                                                {/* COLUMN HEADER */}
                                                <div
                                                    style={{
                                                        display: "grid",
                                                        gridTemplateColumns: "90px 1fr 140px 70px 90px 80px ",
                                                        background: "#ffffffb9",
                                                        color: "black",
                                                        fontWeight: "700",
                                                        textAlign: "center",
                                                        padding: "4px 0",
                                                        fontSize: "12px",
                                                    }}
                                                >
                                                    <div style={{ borderRight: "2px solid white" }}>Meal</div>
                                                    <div style={{ borderRight: "2px solid white" }}>Option</div>
                                                    <div style={{ borderRight: "2px solid white" }}>Time</div>
                                                    <div style={{ borderRight: "2px solid white" }}>PAX</div>
                                                    <div style={{ borderRight: "2px solid white" }}>Extra</div>
                                                    <div>Rate</div>
                                                    {/* <div>Items</div> */}
                                                </div>

                                                {/* ROWS */}
                                                {Object.entries(dayData)
                                                    .filter(([mealName]) => mealName !== "date")
                                                    .sort(([mealA], [mealB]) => {
                                                        const idxA = mealOrder.indexOf(mealA);
                                                        const idxB = mealOrder.indexOf(mealB);
                                                        if (idxA === -1 && idxB === -1) return mealA.localeCompare(mealB);
                                                        if (idxA === -1) return 1;
                                                        if (idxB === -1) return -1;
                                                        return idxA - idxB;
                                                    })
                                                    .map(([mealName, mealInfo], idx) => {
                                                        const formatTime = (t) => {
                                                            if (!t) return "";
                                                            let [h, m] = t.split(":").map(Number);
                                                            const ampm = h >= 12 ? "PM" : "AM";
                                                            h = h % 12 || 12;
                                                            return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
                                                        };

                                                        return (
                                                            <div
                                                                key={idx}
                                                                style={{
                                                                    display: "grid",
                                                                    gridTemplateColumns: "90px 1fr 140px 70px 90px 80px ",
                                                                    textAlign: "center",
                                                                    padding: "4px 0",
                                                                    fontSize: "13px",
                                                                    backgroundColor: "#bcbcbd5e",
                                                                    borderTop: "2px solid #ffffffff",
                                                                }}
                                                            >
                                                                <div style={{ borderRight: "2px solid white" }}>
                                                                    {mealName
                                                                        ?.toLowerCase()
                                                                        .split(" ")
                                                                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                                                        .join(" ")}
                                                                </div>

                                                                <div style={{ borderRight: "2px solid white" }}>
                                                                    {(mealInfo.option || "-")
                                                                        .toLowerCase()
                                                                        .split(" ")
                                                                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                                                        .join(" ")}
                                                                </div>

                                                                <div style={{ borderRight: "2px solid white" }}>
                                                                    {formatTime(mealInfo.startTime)} -{" "}
                                                                    {formatTime(mealInfo.endTime)}
                                                                </div>

                                                                <div style={{ borderRight: "2px solid white" }}>
                                                                    {mealInfo.pax}
                                                                </div>

                                                                <div style={{ borderRight: "2px solid white" }}>
                                                                    {mealInfo.extraPlates || "0"}
                                                                </div>

                                                                <div>
                                                                    ₹{mealInfo.rate}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        );
                                    })}
                        </td>

                        {['hallCharges', 'gstAmount', 'gstBase'].map(field => (
                            <td key={`${lead.id}-${field}`} >
                                ₹{lead[field] ?? '-'}
                            </td>
                        ))}

                        <td key={`${lead.id}-menu-grandTotal`}
                            style={{
                                whiteSpace: 'nowrap',
                                maxWidth: '150rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                            title={JSON.stringify(lead.menuSummaries)}
                        >
                            {Array.isArray(lead.menuSummaries)
                                ? lead.menuSummaries
                                    .map((summary) =>
                                        `₹${summary.grandTotal}`
                                    )
                                    .join(', ')
                                : '-'}
                        </td>

                        {/* edit buttons */}
                        <td>
                            <button
                                onClick={() => sendToUpdate(lead)}
                                className="printBtnMeal"
                            >
                                <div style={{ fontSize: '21px' }} >✏️</div>
                            </button>
                        </td>

                        {/* logs btn */}
                        <td style={{ textAlign: "center" }}>
                            <LogPopupCell lead={lead} />
                        </td>

                        {/* book btn */}
                        <td>
                            <button onClick={() => sendToBookings(lead)}
                                className="btn-add-expense printBtnMeal"
                                style={{
                                    backgroundColor: "green",
                                    borderRadius: "4px",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    fontSize: "14px",
                                    padding: "10px 15px",
                                    color: "white",
                                    margin: "0px auto"
                                }}
                            >
                                <div>Book Now</div>
                            </button>
                        </td>

                        <td key={`${lead.id}-bookingAmenities`}
                            title={Array.isArray(lead.bookingAmenities) ? lead.bookingAmenities.join(', ') : ''}
                            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '9000px' }}
                        >
                            {isEditing(lead.id, 'bookingAmenities') ? (
                                <input
                                    key={`${lead.id}-bookingAmenities-input`}
                                    type="text"
                                    value={Array.isArray(getLocalValue(lead.id, 'bookingAmenities', lead.bookingAmenities))
                                        ? getLocalValue(lead.id, 'bookingAmenities', lead.bookingAmenities).join(', ')
                                        : ''}
                                    onChange={(e) =>
                                        handleLocalChange(
                                            lead.id,
                                            'bookingAmenities',
                                            e.target.value.split(',').map(item => item.trim())
                                        )
                                    }
                                    onBlur={() => handleBlur(lead.id, 'bookingAmenities')}
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        padding: '4px',
                                        fontSize: 'inherit',

                                        border: '1px solid #ccc',
                                        borderRadius: '4px',
                                    }}
                                />
                            ) : (
                                Array.isArray(lead.bookingAmenities) ? lead.bookingAmenities.join(', ') : '-'
                            )}
                        </td>

                        {['note', 'winProbability'].map(field => (
                            <td key={`${lead.id}-${field}`} onClick={() => startEdit(lead.id, field)}>
                                {isEditing(lead.id, field) ? (
                                    <input
                                        key={`${lead.id}-${field}-input`}
                                        type="text"
                                        value={getLocalValue(lead.id, field, lead[field] || '')}
                                        onChange={(e) => handleLocalChange(lead.id, field, e.target.value)}
                                        onBlur={() => handleBlur(lead.id, field)}
                                        autoFocus
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            padding: '4px',
                                            fontSize: 'inherit',

                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                        }}
                                    />
                                ) : (
                                    <div>{lead[field] ?? ''}</div>
                                )}
                            </td>
                        ))}

                        <td key={`${lead.id}-holdDate`} onClick={() => startEdit(lead.id, 'holdDate')}>
                            {isEditing(lead.id, 'holdDate') ? (
                                <input
                                    key={`${lead.id}-holdDate-input`}
                                    type="date"
                                    value={getLocalValue(lead.id, 'holdDate', lead.holdDate || '')}
                                    onChange={(e) => handleLocalChange(lead.id, 'holdDate', e.target.value)}
                                    onBlur={() => handleBlur(lead.id, 'holdDate')}
                                    autoFocus
                                    style={{ width: '100%', boxSizing: 'border-box', padding: '4px', fontSize: 'inherit', border: '1px solid #ccc', borderRadius: '4px', }}
                                />
                            ) : (
                                lead.holdDate
                                    ? formatDate(lead.holdDate)
                                    : ''
                            )}
                        </td>

                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(index => {
                            const followUp = lead.followUpDetails?.[index] || {};
                            const isActive = editing[lead.id]?.[index];

                            const prevFollowUp = lead.followUpDetails?.[index - 1];
                            const canAdd = index === 0 || prevFollowUp?.date;

                            return (
                                <td
                                    key={`${lead.id}-followup-${index}`}
                                    style={{
                                        verticalAlign: "top",
                                        overflow: "hidden",
                                    }}
                                >

                                    {isActive ? (

                                        /* ================= EDIT MODE ================= */
                                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>

                                            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                                <label style={{ fontSize: "12px" }}>Next followUp Date:</label>
                                                <input
                                                    type="date"
                                                    value={getTempFollowUp(lead.id, index).date ?? followUp.date ?? ''}
                                                    onChange={(e) =>
                                                        setTempFollowUp(lead.id, index, { date: e.target.value })
                                                    }
                                                    style={{ flex: 1, padding: "4px", borderRadius: "4px" }}
                                                />
                                            </div>

                                            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                                <label style={{ fontSize: "12px" }}>Next followUp Time:</label>
                                                <input
                                                    type="time"
                                                    value={getTempFollowUp(lead.id, index).time ?? followUp.time ?? ''}
                                                    onChange={(e) =>
                                                        setTempFollowUp(lead.id, index, { time: e.target.value })
                                                    }
                                                    style={{ flex: 1, padding: "4px", borderRadius: "4px" }}
                                                />
                                            </div>

                                            <textarea
                                                placeholder="Remark"
                                                value={getTempFollowUp(lead.id, index).remark ?? followUp.remark ?? ''}
                                                onChange={(e) =>
                                                    setTempFollowUp(lead.id, index, { remark: e.target.value })
                                                }
                                                style={{
                                                    width: "100%",
                                                    padding: "4px",
                                                    borderRadius: "4px",
                                                    minHeight: "60px"
                                                }}
                                            />

                                            <div style={{ display: "flex", gap: "6px" }}>
                                                <button
                                                    style={{
                                                        backgroundColor: "#4CAF50",
                                                        color: "white",
                                                        border: "none",
                                                        padding: "4px 8px",
                                                        borderRadius: "4px",
                                                        cursor: "pointer"
                                                    }}
                                                    onClick={() => {
                                                        const update = {
                                                            ...followUp,
                                                            ...getTempFollowUp(lead.id, index)
                                                        };
                                                        handleDateChange(lead.id, index, update);
                                                    }}
                                                >
                                                    Save
                                                </button>

                                                <button
                                                    style={{
                                                        backgroundColor: "#f44336",
                                                        color: "white",
                                                        border: "none",
                                                        padding: "4px 8px",
                                                        borderRadius: "4px",
                                                        cursor: "pointer"
                                                    }}
                                                    onClick={() => handleDateChange(lead.id, index, {})}
                                                >
                                                    Clear
                                                </button>

                                                {/* CANCEL */}
                                                <button
                                                    style={{
                                                        backgroundColor: "#fe6663",
                                                        color: "white",
                                                        border: "none",
                                                        padding: "4px 8px",
                                                        borderRadius: "4px",
                                                        cursor: "pointer"
                                                    }}
                                                    onClick={() => handleCancelEdit(lead.id, index)}
                                                >
                                                    Cancel
                                                </button>

                                            </div>
                                        </div>

                                    ) : (

                                        /* ================= VIEW MODE ================= */
                                        <div style={{ padding: "6px" }}>

                                            {followUp.date ? (
                                                <>
                                                    <div style={{ fontSize: "13px", fontWeight: 600 }}>
                                                        Next followUp: {formatDate(followUp.date)} {followUp.time && ` at ${formatTime12Hour(followUp.time)}`}
                                                    </div>

                                                    {followUp.remark && (
                                                        <div style={{
                                                            marginTop: "4px",
                                                            fontSize: "12px",
                                                            wordBreak: "break-word",
                                                            whiteSpace: "normal",
                                                            overflowWrap: "anywhere",
                                                            maxWidth: "200px"
                                                        }}>
                                                            Remark: {followUp.remark}
                                                        </div>
                                                    )}

                                                    {followUp.createdAt && (
                                                        <div style={{
                                                            marginTop: "4px",
                                                            fontSize: "11px",
                                                            color: "gray"
                                                        }}>
                                                            On: {followUp.by}, {followUp.createdAt}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div style={{ fontSize: "12px", color: "#888" }}>
                                                    No FollowUp
                                                </div>
                                            )}

                                            {/* 🔥 EDIT BUTTON */}
                                            {canAdd && (
                                                <div style={{ marginTop: "6px" }}>
                                                    <button
                                                        style={{
                                                            backgroundColor: "#2196F3",
                                                            color: "white",
                                                            border: "none",
                                                            padding: "3px 6px",
                                                            borderRadius: "4px",
                                                            fontSize: "11px",
                                                            cursor: "pointer"
                                                        }}
                                                        onClick={() => handleEdit(lead.id, index)}
                                                    >
                                                        {followUp.date ? "Edit" : "+ Add"}
                                                    </button>
                                                </div>
                                            )}

                                        </div>

                                    )}

                                </td>
                            );
                        })}

                        {['source',].map(field => (
                            <td key={`${lead.id}-${field}`} >
                                {isEditing(lead.id, field) ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <input
                                            key={`${lead.id}-${field}-input`}
                                            type="text"
                                            placeholder="Source"
                                            value={getLocalValue(lead.id, field, lead[field] || '')}
                                            onChange={(e) => handleLocalChange(lead.id, field, e.target.value)}
                                            onBlur={() => handleBlur(lead.id, field)}
                                            autoFocus
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                padding: '4px',
                                                fontSize: 'inherit',

                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                            }}
                                        />
                                        <input
                                            key={`${lead.id}-referredBy-input`}
                                            type="text"
                                            placeholder="Reference (Optional)"
                                            value={getLocalValue(lead.id, 'referredBy', lead.referredBy || '')}
                                            onChange={(e) => handleLocalChange(lead.id, 'referredBy', e.target.value)}
                                            onBlur={() => handleBlur(lead.id, 'referredBy')}
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                padding: '4px',
                                                fontSize: 'inherit',

                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <div>{lead[field] ?? '-'}</div>
                                        {lead.referredBy && (
                                            <div style={{ fontSize: '0.85em', color: '#888' }}>
                                                • Reference: {lead.referredBy}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </td>
                        ))}

                        {['authorisedSignatory'].map(field => (
                            <td key={`${lead.id}-${field}`} >
                                {isEditing(lead.id, field) ? (
                                    <input
                                        key={`${lead.id}-${field}-input`}
                                        type={typeof lead[field] === 'number' ? 'number' : 'text'}
                                        value={getLocalValue(lead.id, field, lead[field] || '')}
                                        onChange={(e) => handleLocalChange(lead.id, field, e.target.value)}
                                        onBlur={() => handleBlur(lead.id, field)}
                                        autoFocus
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            padding: '4px',
                                            fontSize: 'inherit',

                                            border: '1px solid #ccc',
                                            borderRadius: '4px',
                                        }}
                                    />
                                ) : (
                                    lead[field] ?? '-'
                                )}
                            </td>
                        ))}

                        {/* Drop Button */}
                        <td>
                            <button
                                style={{
                                    backgroundColor: "#fb4747ff",
                                    color: "white",
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    border: '2px solid white',
                                    boxShadow: '2px 2px 4px #030303ff'
                                }}
                                onClick={() => handleDropClick(lead)}
                            >
                                Drop
                            </button>
                        </td>

                    </tr>
                ))}
            </tbody>

            {printPopup.open && (
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setPrintPopup({ open: false, lead: null });
                        }
                    }}
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "rgba(0,0,0,0.5)",
                        backdropFilter: "blur(4px)",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 9999,
                        animation: "fadeIn 0.2s ease"
                    }}
                >
                    {/* MODAL */}
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: "#ffffff",
                            padding: "22px",
                            borderRadius: "14px",
                            width: "280px",
                            textAlign: "center",
                            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                            animation: "scaleIn 0.2s ease"
                        }}
                    >

                        <div style={{ display: "flex", justifyContent: "space-between" }}>

                            <div></div>

                            {/* HEADER */}
                            <div style={{
                                fontSize: "18px",
                                fontWeight: "600",
                                marginBottom: "15px"
                            }}>
                                🖨️ Print Options
                            </div>

                            {/* CANCEL */}
                            <div>
                                <button
                                    onClick={() => setPrintPopup({ open: false, lead: null })}
                                    style={{
                                        padding: "6px 10px",
                                        borderRadius: "80px",
                                        border: "none",
                                        background: "#f44336",
                                        color: "#fff",
                                        fontWeight: "500",
                                        cursor: "pointer",
                                        transition: "0.2s"
                                    }}
                                >
                                    X
                                </button>
                            </div>
                        </div>

                        {/* DIVIDER */}
                        <div style={{
                            margin: "10px 0",
                            height: "1px",
                            background: "#eee"
                        }} />

                        {/* OPTIONS */}
                        <div style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px"
                        }}>

                            <button
                                onClick={() => {
                                    handlePrint(printPopup.lead);
                                    setPrintPopup({ open: false, lead: null });
                                }}
                                style={btnStyle("#4CAF50")}
                            >
                                🖨️ BOOKING ESTIMATE
                            </button>

                            <button
                                onClick={() => {
                                    sendToPrintAllMeals(printPopup.lead);
                                    setPrintPopup({ open: false, lead: null });
                                }}
                                style={btnStyle("#FF9800")}
                            >
                                🍽 MENU
                            </button>

                        </div>

                    </div>
                </div>
            )}

        </>
    );
};

export default Tbody;

const btnStyle = (bg) => ({
    padding: "10px",
    borderRadius: "10px",
    border: "none",
    background: bg,
    color: "#fff",
    fontWeight: "500",
    cursor: "pointer",
    transition: "0.2s"
});