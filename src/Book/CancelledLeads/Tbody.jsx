import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import LogPopupCell from './LogPopupCell';

const Tbody = ({ leads, totalItems, startIndex, isEditing, handleFieldChange, startEdit, sendToPrintCombined, sendToPrintPayment, moveLeadToDrop, sendToPrint, userPermissions, sortConfig, openExpenseModal, sendToPrintAllMeals }) => {
    const [localValue, setLocalValue] = useState({});
    const navigate = useNavigate();
    const [selectedAdvances, setSelectedAdvances] = useState(null);

    const handleLocalChange = (leadId, field, value) => {
        setLocalValue(prev => ({
            ...prev,
            [leadId]: {
                ...prev[leadId],
                [field]: value
            }
        }));
    };

    const canEdit = (leadId) => {
        if (["A"].includes(userPermissions.accessToApp)) {
            return true;
        }

        if (userPermissions.alwayEdit === "On") {
            return true;
        }

        return (
            userPermissions.editData === "enable" &&
            userPermissions.editablePrebookings.includes(leadId)
        );
    };

    const getLocalValue = (leadId, field, fallback) => {
        return localValue[leadId]?.[field] !== undefined ? localValue[leadId][field] : fallback;
    };

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

    const sendToBookings = (lead) => {
        const updatedLead = { ...lead };

        if (localValue[lead.id]) {
            Object.entries(localValue[lead.id]).forEach(([key, value]) => {
                updatedLead[key] = value;
            });
        }

        updatedLead.customItems = lead.customItems || [];
        updatedLead.meals = lead.meals || {};
        updatedLead.selectedMenus = lead.selectedMenus || {};
        updatedLead.advancePayments = lead.advancePayments || [];
        updatedLead.bookingAmenities = lead.bookingAmenities || [];

        navigate('/booking', { state: { leadToEdit: updatedLead } });
    };

    const formatTimeToAMPM = (time24) => {
        const [hour, minute] = time24.split(':').map(Number);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 === 0 ? 12 : hour % 12;
        return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
    };

    const formatAmount = (amount) => {
        if (!amount && amount !== 0) return '-';
        return Math.trunc(Number(amount)).toLocaleString('en-IN');
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const [year, month, day] = dateStr.split('-');
        return `${day}-${month}-${year}`;
    };

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

    const parseFormattedDate = (formattedDate) => {
        const [day, month, year] = formattedDate.split("-");
        return new Date(`${year}-${month}-${day}`); // valid JS date
    };

    return (
        <>
            <tbody>
                {sortedLeads.map((lead, index) => (
                    <tr
                        key={lead.id}
                        style={{
                            whiteSpace: "nowrap",
                            backgroundColor: userPermissions.venueTypeColors?.[lead.venueType] || "white",
                            transition: "all 0.3s ease",
                        }}
                    >

                        <td className="sticky sticky-1" style={{ backgroundColor: userPermissions.venueTypeColors?.[lead.venueType] || "white", fontWeight: 'bold' }}>{(totalItems ?? leads.length) - (startIndex ?? 0) - index}.</td>

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
                                    color: "red",
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
                                {isEditing(lead.id, field) ? (
                                    <input
                                        key={`${lead.id}-${field}-input`} // ✅ force unmount/remount on field change
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
                                            ? new Date(lead[field]).toLocaleDateString('en-GB')
                                            : (lead[field] ?? '-')
                                )}
                            </td>
                        ))}

                        {['enquiryDate'].map((field, index) => (
                            <td
                                style={{
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    fontWeight: '700',
                                    padding: '0px 2px 0px 5px',
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

                        {['functionDate'].map((field) => (
                            <>
                                {field === 'functionDate' && (
                                    <td style={{ backgroundColor: userPermissions.venueTypeColors?.[lead.venueType] || "white" }} key={field + "-month"}>
                                        {lead.functionDate ? (
                                            parseFormattedDate(formatDate(lead.functionDate))
                                                .toLocaleString("default", { month: "long" })
                                        ) : (
                                            "-"
                                        )}
                                    </td>
                                )}
                            </>
                        ))}

                        {['venueType'].map((field, index) => (
                            <td
                                style={{
                                    whiteSpace: 'nowrap',
                                    maxWidth: '180rem',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}
                                key={`${lead.id}-${field}`}
                            >
                                {isEditing(lead.id, field) ? (
                                    <input
                                        key={`${lead.id}-${field}-input`} // ✅ force unmount/remount on field change
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
                                    field.includes('Date') && lead[field]
                                        ? new Date(lead[field]).toLocaleDateString('en-GB') // 🔁 Format to DD-MM-YYYY
                                        : (
                                            (lead[field] === 'Lawn' || lead[field] === 'Back Lawn')
                                                ? 'Pool Side'
                                                : (lead[field] ?? '-')
                                        )
                                )}
                            </td>
                        ))}

                        {['functionType', 'dayNight'].map((field, index) => (
                            <td
                                style={{
                                    whiteSpace: 'nowrap',
                                    maxWidth: '180rem',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}
                                key={`${lead.id}-${field}`}
                            >
                                {isEditing(lead.id, field) ? (
                                    <input
                                        key={`${lead.id}-${field}-input`} // ✅ force unmount/remount on field change
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
                                    field.includes('Date') && lead[field]
                                        ? new Date(lead[field]).toLocaleDateString('en-GB') // 🔁 Format to DD-MM-YYYY
                                        : (lead[field] ?? '')
                                )}
                            </td>
                        ))}

                        <td key={`${lead.id}-startTime`}>
                            {lead.startTime ? formatTimeToAMPM(lead.startTime) : '-'}
                        </td>

                        <td key={`${lead.id}-finishTime`}>
                            {lead.finishTime ? formatTimeToAMPM(lead.finishTime) : '-'}
                        </td>

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
                                                fontSize: "14px",
                                                fontWeight: "700",

                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                            }}
                                            className="printBtnMeal"
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
                                                    fontWeight: '700',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    margin: '3px 0px',
                                                    fontSize: "14px",
                                                }}
                                                className="printBtnMeal"
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

                        {['hallCharges', 'gstBase', 'gstAmount'].map(field => (
                            <td key={`${lead.id}-${field}`}>
                                ₹{isEditing(lead.id, field) ? (
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
                                    lead[field] !== undefined && lead[field] !== null
                                        ? Math.floor(Number(lead[field])).toLocaleString('en-IN')
                                        : '-'
                                )}
                            </td>
                        ))}

                        <td key={`${lead.id}-menu-details`} style={{ verticalAlign: "center" }}>
                            {lead.selectedMenus && (
                                <div style={{ width: "100%", marginTop: "4px" }}>

                                    {/* HEADER ROW */}
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 70px 70px 90px ",
                                            background: "#2e6999",
                                            color: "white",
                                            fontWeight: "700",
                                            // border: "2px solid #000",
                                            padding: "4px 0",
                                            textAlign: "center",
                                            fontSize: "13px",
                                        }}
                                    >
                                        <div style={{ borderRight: "2px solid white" }} >Menu Name</div>
                                        <div style={{ borderRight: "2px solid white" }} >Rate</div>
                                        <div style={{ borderRight: "2px solid white" }} >PAX</div>
                                        <div  >Extra Plates</div>
                                        {/* <div>Menu Items</div> */}
                                    </div>

                                    {/* DATA ROWS */}
                                    {Object.entries(lead.selectedMenus).map(([menuName, menuData], idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "1fr 70px 70px 90px ",
                                                backgroundColor: "#bce1ffff",
                                                // border: "2px solid #000",
                                                borderTop: "none",
                                                padding: "4px 0",
                                                textAlign: "center",
                                                fontSize: "13px",
                                            }}
                                        >
                                            <div style={{ borderRight: "2px solid white" }} >{menuName}</div>
                                            <div style={{ borderRight: "2px solid white" }} >₹{menuData.rate}</div>
                                            <div style={{ borderRight: "2px solid white" }} >{menuData.noOfPlates}</div>
                                            <div >{menuData.extraPlates}</div>
                                            <div style={{ borderRight: "2px solid white" }}>
                                                {(!menuData.selectedSubItems || menuData.selectedSubItems.length === 0) && (
                                                    <div style={{ borderRight: "2px solid white" }}>
                                                        <span style={{
                                                            color: "red",
                                                            fontWeight: "700",
                                                            fontSize: "12px"
                                                        }}>
                                                            No menu items selected
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
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
                                                    background: "#fff",
                                                }}
                                            >
                                                {/* DAY HEADER */}
                                                <div
                                                    style={{
                                                        background: "#2e6999",
                                                        color: "white",
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
                                                        gridTemplateColumns: "90px 1fr 140px 70px 90px 80px",
                                                        background: "#62b2f4",
                                                        color: "white",
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
                                                    <div >Rate</div>
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
                                                                    backgroundColor: "#bce1ff",
                                                                    borderTop: "2px solid #ffffffff",
                                                                }}
                                                            >
                                                                <div style={{ borderRight: "2px solid white" }}>
                                                                    {mealName}
                                                                </div>

                                                                <div style={{ borderRight: "2px solid white" }}>
                                                                    {mealInfo.option || "-"}
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

                                                                <div style={{ borderRight: "2px solid white" }}>
                                                                    {(!mealInfo.selectedItems || mealInfo.selectedItems.length === 0) && (
                                                                        <div style={{ borderRight: "2px solid white" }}>
                                                                            <span style={{
                                                                                color: "red",
                                                                                fontWeight: "700",
                                                                                fontSize: "12px"
                                                                            }}>
                                                                                No menu items selected
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                            </div>
                                        );
                                    })}
                        </td>

                        <td key={`${lead.id}-subtotal`}>
                            {lead.selectedMenus || lead.meals
                                ? (() => {
                                    // ---- Menu Total ----
                                    const menuTotal = lead.selectedMenus
                                        ? Object.values(lead.selectedMenus).reduce((sum, menu) => {
                                            const plates = Number(menu.noOfPlates || 0) + Number(menu.extraPlates || 0);
                                            const rate = Number(menu.rate || 0);
                                            return sum + plates * rate;
                                        }, 0)
                                        : 0;

                                    // ---- Meals Total ----
                                    const mealsTotal = lead.meals
                                        ? Object.values(lead.meals).reduce((sum, dayData) => {
                                            return (
                                                sum +
                                                Object.entries(dayData)
                                                    .filter(([mealName]) => mealName !== "date")
                                                    .reduce((daySum, [, mealInfo]) => {
                                                        const plates = Number(mealInfo.pax || 0) + Number(mealInfo.extraPlates || 0);
                                                        const rate = Number(mealInfo.rate || 0);
                                                        return daySum + plates * rate;
                                                    }, 0)
                                            );
                                        }, 0)
                                        : 0;

                                    const total = menuTotal + mealsTotal;
                                    return total.toLocaleString("en-IN", { style: "currency", currency: "INR" });
                                })()
                                : ""}
                        </td>

                        {['grandTotal'].map(field => {
                            const total = Number(lead.grandTotal) || 0;
                            const discount = Number(lead.discount) || 0;
                            const finalTotal = total + discount; // 👈 add discount directly to total

                            return (
                                <td
                                    key={`${lead.id}-${field}`}
                                    style={{
                                        backgroundColor: '#04ff42ff',
                                        fontWeight: '800',
                                    }}
                                >
                                    ₹
                                    {isEditing(lead.id, field) ? (
                                        <input
                                            key={`${lead.id}-${field}-input`}
                                            type="number"
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
                                        Math.floor(finalTotal).toLocaleString('en-IN')
                                    )}
                                </td>
                            );
                        })}

                        <td>
                            ₹{(
                                lead.advancePayments
                                    ?.filter(adv => adv.mode === "Cash")
                                    .reduce((sum, adv) => sum + Number(adv.amount || 0), 0) || 0
                            ).toLocaleString("en-IN")}
                        </td>

                        <td>
                            ₹{(
                                lead.advancePayments
                                    ?.filter(adv => adv.mode !== "Cash")
                                    .reduce((sum, adv) => sum + Number(adv.amount || 0), 0) || 0
                            ).toLocaleString("en-IN")}
                        </td>

                        < td >
                            <div style={{ fontWeight: "800" }}>
                                ₹{lead.advancePayments?.reduce((sum, adv) => sum + Number(adv.amount || 0), 0) || 0}
                            </div>
                            <div>
                                <button
                                    className="printBtnMeal"
                                    style={{
                                        padding: "4px 8px", cursor: "pointer",
                                        background: "#008979ff",
                                        fontSize: "12px", color: "white", fontWeight: "800"
                                    }}
                                    onClick={() => setSelectedAdvances(lead.advancePayments || [])}
                                >
                                    View Details
                                </button>
                            </div>
                        </td>

                        {['discount'].map(field => (
                            <td key={`${lead.id}-${field}`} >
                                ₹{isEditing(lead.id, field) ? (
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
                                    lead[field] !== undefined && lead[field] !== null
                                        ? Math.floor(Number(lead[field])).toLocaleString('en-IN')
                                        : '0'
                                )}
                            </td>
                        ))}

                        <td style={{ color: 'black', backgroundColor: '#ff7272ff' }}>
                            ₹{Math.floor(
                                (Number(lead.grandTotal) || 0) -
                                (lead.advancePayments?.reduce((sum, adv) => sum + Number(adv.amount || 0), 0) || 0) +
                                (lead.refundPayments?.reduce((sum, adv) => sum + Number(adv.amount || 0), 0) || 0)
                            ).toLocaleString('en-IN')}
                        </td>

                        {['source'].map(field => (
                            <td key={`${lead.id}-${field}`}
                                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '9000px' }}
                            >
                                <div>
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
                                                backgroundColor: 'transparent',
                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                            }}
                                        />
                                    ) : (
                                        lead[field] ?? '-'
                                    )}
                                </div>

                                {lead.source?.toLowerCase() === 'reference' && (
                                    <div style={{ marginTop: '6px' }} onClick={(e) => {
                                        e.stopPropagation();
                                        startEdit(lead.id, 'referredBy');
                                    }}>
                                        <small style={{ color: '#555' }}>
                                            By: <strong>{lead.referredBy || '—'}</strong>
                                        </small>
                                    </div>
                                )}
                            </td>
                        ))}

                        <td style={{ display: 'none' }} key={`${lead.id}-delete`}>
                            <button
                                onClick={() => moveLeadToDrop(lead.id, true)}
                                style={{ backgroundColor: "#e74c3c", color: "#fff", border: "none", padding: "10px 15px", cursor: "pointer" }} >  Cancel
                            </button>
                        </td>

                        {/* edit buttons */}
                        <td>
                            {canEdit(lead.id) ? (
                                <button onClick={() => sendToBookings(lead)} className="printBtnMeal">
                                    <div style={{ fontSize: '21px' }} >✏️</div>
                                </button>) : (
                                ''
                            )}
                        </td>

                        {/* print buttons */}
                        <td>
                            <div style={{ display: "flex", gap: "6px" }}>

                                <button onClick={() => sendToPrint(lead)} className="printBtnMeal">
                                    🖨️
                                </button>

                                <button onClick={() => sendToPrintAllMeals(lead)} className="printBtnMeal">
                                    🍽
                                </button>

                                <button onClick={() => sendToPrintCombined(lead)} className="printBtnMeal">
                                    🖨️🍽
                                </button>

                            </div>
                        </td>

                        <td>
                            <LogPopupCell lead={lead} />
                        </td>

                        <td>
                            <button
                                onClick={() => openExpenseModal(lead.id)}
                                className="btn-add-expense printBtnMeal"
                                style={{
                                    backgroundColor: "red",
                                    borderRadius: "4px",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    fontSize: "14px",
                                    padding: "4px 10px",
                                    color: "white"
                                }}
                            >
                                <div>Add Expense</div>
                            </button>

                        </td>

                        <td>
                            {(() => {
                                // Convert functionDate to IST
                                const funcDate = new Date(
                                    new Date(lead.functionDate).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
                                );

                                // Get today's date in IST
                                const today = new Date(
                                    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
                                );

                                // Next day after functionDate in IST
                                const nextDay = new Date(funcDate);
                                nextDay.setDate(funcDate.getDate() + 1);

                                // Show button if today is same as or after nextDay (in IST)
                                const showButton = today >= nextDay;

                                return showButton ? (
                                    <button className='printBtnMeal' style={{ backgroundColor: "orange", fontSize: "12px", padding: "4px 8px", fontWeight: "800", color: "black" }} onClick={() => sendToPrintPayment(lead)}>Print Settlement</button>
                                ) : null;
                            })()}
                        </td>

                        {['note'].map(field => (
                            <td key={`${lead.id}-${field}`}
                                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '9000px' }}
                            >
                                <div>
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
                                                backgroundColor: 'transparent',
                                                border: '1px solid #ccc',
                                                borderRadius: '4px',
                                            }}
                                        />
                                    ) : (
                                        lead[field] ?? '-'
                                    )}
                                </div>
                            </td>
                        ))}

                        <td
                            style={{
                                fontWeight: "bold",
                                color:
                                    (lead.advancePayments?.reduce((sum, a) => sum + Number(a.amount || 0), 0) -
                                        (lead.refundPayments?.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0)) === 0
                                        ? "green"
                                        : "black",
                            }}
                        >
                            ₹{(
                                lead.refundPayments?.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0
                            ).toLocaleString("en-IN")}
                        </td>

                        <td style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '9000px' }} >
                            {Array.isArray(lead.customItems)
                                ? lead.customItems
                                    .filter(item => item.selected)
                                    .map((item, index) => (
                                        <div key={index}>
                                            {item.name}- @ ₹{item.rate} × {item.qty} = ₹{item.total}
                                        </div>
                                    ))
                                : '-'}
                        </td>

                        <td style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '9000px' }} >
                            {Array.isArray(lead.customMenuCharges)
                                ? lead.customMenuCharges
                                    .filter(item => item.selected)
                                    .map((item, index) => (
                                        <div key={index}>
                                            {item.name}- @ ₹{item.rate} × {item.qty} = ₹{item.total}
                                        </div>
                                    ))
                                : ' '}
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

                        {['eventBookedBy'].map((field, index) => (
                            <td
                                style={{
                                    whiteSpace: 'nowrap',
                                    maxWidth: '180rem',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}
                                key={`${lead.id}-${field}`}
                            >
                                {isEditing(lead.id, field) ? (
                                    <input
                                        key={`${lead.id}-${field}-input`} // ✅ force unmount/remount on field change
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
                                    field.includes('Date') && lead[field]
                                        ? new Date(lead[field]).toLocaleDateString('en-GB') // 🔁 Format to DD-MM-YYYY
                                        : (
                                            (lead[field] === 'Lawn' || lead[field] === 'Back Lawn')
                                                ? 'Pool Side'
                                                : (lead[field] ?? ' ')
                                        )
                                )}
                            </td>
                        ))}

                        {['commission'].map(field => (
                            <td key={`${lead.id}-${field}`} >
                                ₹{isEditing(lead.id, field) ? (
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
                                    lead[field] !== undefined && lead[field] !== null
                                        ? Math.floor(Number(lead[field])).toLocaleString('en-IN')
                                        : '0'
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
                                    fontSize: "14px",
                                    fontWeight: "700"
                                    // boxShadow: '2px 2px 4px #030303ff'
                                }}
                                className="printBtnMeal"
                                onClick={() => handleDropClick(lead)}
                            >
                                Restore
                            </button>
                        </td>

                        {/* <td>{lead.id}</td> */}

                    </tr >
                ))}

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
                                        ₹{formatAmount(adv.amount)}
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



