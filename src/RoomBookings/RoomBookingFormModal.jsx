import React, { useMemo, useEffect } from "react";

const RoomBookingFormModal = ({
    show,
    onClose,
    rooms = [],
    bookings = [],
    form,
    setForm,
    guests = [],
    setGuests,
    onSave
}) => {


    const toDateTime = (date, time) => {
        const [y, m, d] = date.split("-").map(Number);
        const [hh = 0, mm = 0] = (time || "00:00").split(":").map(Number);
        return new Date(y, m - 1, d, hh, mm, 0);
    };

    const availableRooms = useMemo(() => {
        if (!form.fromDate || !form.toDate) return rooms;

        const newStart = toDateTime(form.fromDate, form.fromTime);
        const newEnd = toDateTime(form.toDate, form.toTime);

        return rooms.filter(room => {
            const isBlocked = bookings.some(b => {

                // ✏️ editing case → skip same booking
                if (b.id === form.id) return false;

                // room used in that booking?
                const roomUsed = b.guests?.some(g =>
                    g.rooms?.some(r => r.id === room.id)
                );
                if (!roomUsed) return false;

                const existingStart = toDateTime(b.fromDate, b.fromTime);
                const existingEnd = toDateTime(b.toDate, b.toTime);

                // 🔥 REAL overlap check (datetime)
                return newStart < existingEnd && newEnd > existingStart;
            });

            return !isBlocked;
        });

    }, [
        rooms,
        bookings,
        form.fromDate,
        form.toDate,
        form.fromTime,
        form.toTime,
        form.id
    ]);

    /* ---------------- DAYS ---------------- */

    const noOfDays = useMemo(() => {
        if (!form.fromDate || !form.toDate) return 1;

        const d1 = new Date(form.fromDate);
        const d2 = new Date(form.toDate);

        const nights = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        return Math.max(1, nights);
    }, [form.fromDate, form.toDate]);

    /* ---------------- UNIQUE ROOMS ---------------- */

    const uniqueRooms = useMemo(() => {
        const map = {};
        guests.forEach(g =>
            g.rooms?.forEach(r => {
                map[r.id] = r;
            })
        );
        return Object.values(map);
    }, [guests]);

    /* ---------------- DATE & TIME VALIDATION ---------------- */
    const isInvalidDate =
        form.fromDate &&
        form.toDate &&
        new Date(form.toDate) < new Date(form.fromDate);

    const sameDay =
        form.fromDate &&
        form.toDate &&
        form.fromDate === form.toDate;

    const isInvalidTime =
        sameDay &&
        form.fromTime &&
        form.toTime &&
        form.toTime <= form.fromTime;

    /* ---------------- GUEST COUNT ---------------- */
    const updateGuestCount = (count) => {
        const c = Number(count || 1);
        setForm({ ...form, guestCount: c });

        setGuests(prev => {
            const next = [...prev];
            if (c > prev.length) {
                for (let i = prev.length; i < c; i++) {
                    next.push({ name: "", mobile: "", aadharCard: "", rooms: [] });
                }
            } else {
                next.length = c;
            }
            return next;
        });
    };

    const roomGuestMap = useMemo(() => {
        const map = {};
        guests.forEach((g, gi) => {
            g.rooms?.forEach(r => {
                if (!map[r.id]) map[r.id] = [];
                map[r.id].push({
                    guestIndex: gi + 1,
                    name: g.name || `Guest ${gi + 1}`
                });
            });
        });
        return map;
    }, [guests]);

    useEffect(() => {
        const autoAssigned = { ...(form.roomKeyHolders || {}) };
        let changed = false;

        Object.entries(roomGuestMap).forEach(([roomId, guestsForRoom]) => {
            // ✅ Only 1 guest → auto assign
            if (guestsForRoom.length === 1) {
                const gi = guestsForRoom[0].guestIndex;

                if (autoAssigned[roomId] !== gi) {
                    autoAssigned[roomId] = gi;
                    changed = true;
                }
            }
        });

        if (changed) {
            setForm(prev => ({
                ...prev,
                roomKeyHolders: autoAssigned
            }));
        }
    }, [roomGuestMap, form.roomKeyHolders, setForm])

    /* ---------------- RATE STATE (IMPORTANT FIX) ---------------- */
    const roomRates = form.roomRates || {};

    const updateRoomRate = (roomId, rate) => {
        setForm({
            ...form,
            roomRates: {
                ...roomRates,
                [roomId]: rate   // ✅ STRING hi rahega
            }
        });
    };

    /* ---------------- TOTAL ---------------- */
    const totalBeforeDiscount =
        uniqueRooms.reduce(
            (sum, r) => sum + Number(roomRates[r.id] ?? r.rate ?? 0),
            0
        ) * noOfDays;

    const calculateGST = (rate) => {
        if (rate <= 1000) return 0;
        if (rate <= 7500) return Math.round(rate * 0.12);
        return Math.round(rate * 0.18);
    };

    const roomsSubtotal = Math.round(
        uniqueRooms.reduce((sum, r) => {
            const rate = Number(roomRates[r.id] ?? r.rate ?? 0);
            return sum + rate * noOfDays;
        }, 0)
    );

    const totalGST = uniqueRooms.reduce((sum, r) => {
        const rate = Number(roomRates[r.id] ?? r.rate ?? 0);
        const gst = calculateGST(rate) * noOfDays;
        return sum + gst;
    }, 0);

    const finalAmount = Math.round(
        totalBeforeDiscount +
        totalGST -
        Number(form.discount || 0)
    );

    /* ---------------- ROOM TOGGLE ---------------- */
    const toggleGuestRoom = (gIndex, room) => {
        const updatedGuests = [...guests];
        const guestRooms = updatedGuests[gIndex].rooms || [];
        const exists = guestRooms.some(r => r.id === room.id);

        // 👇 clone roomRates
        const updatedRoomRates = { ...(form.roomRates || {}) };

        if (exists) {
            updatedGuests[gIndex].rooms = guestRooms.filter(r => r.id !== room.id);

            delete updatedRoomRates[room.id];

            setForm(prev => {
                const kh = { ...(prev.roomKeyHolders || {}) };
                delete kh[room.id];
                return { ...prev, roomRates: updatedRoomRates, roomKeyHolders: kh };
            });
        } else {
            // ✅ add room
            updatedGuests[gIndex].rooms = [...guestRooms, room];

            // ✅ AUTO SET DEFAULT RATE (THIS WAS MISSING 🔥)
            if (updatedRoomRates[room.id] === undefined) {
                updatedRoomRates[room.id] = String(room.rate || "");
            }
        }

        setGuests(updatedGuests);
        setForm({ ...form, roomRates: updatedRoomRates });
    };

    useEffect(() => {
        if (!show) return;

        setForm(prev => ({
            ...prev,
            fromTime: prev.fromTime || "12:00",
            toTime: prev.toTime || "11:00"
        }));
    }, [show, setForm]);

    const addOneDay = (dateStr) => {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + 1);
        return d.toISOString().split("T")[0];
    };

    const roomKeyHolders = form.roomKeyHolders || {};

    const updateKeyHolder = (roomId, guestIndex) => {
        setForm({
            ...form,
            roomKeyHolders: {
                ...roomKeyHolders,
                [roomId]: guestIndex
            }
        });
    };

    if (!show) return null;
    /* ---------------- UI ---------------- */

    const bookingAmounts = {
        noOfDays,

        roomsSubtotal,        // without GST
        totalGST,

        gstBreakup: uniqueRooms.reduce((acc, r) => {
            const rate = Number(roomRates[r.id] ?? r.rate ?? 0);
            acc[r.id] = calculateGST(rate) * noOfDays;
            return acc;
        }, {}),

        rateSnapshot: uniqueRooms.reduce((acc, r) => {
            acc[r.id] = Number(roomRates[r.id] ?? r.rate ?? 0);
            return acc;
        }, {}),

        discount: Number(form.discount || 0),
        finalAmount
    };

    return (
        <div className="modal-backdrop">
            <div className="modal">

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <h3>📋 Room Booking</h3>
                    <button className="btn-danger" style={{ marginBottom: "15px" }} onClick={onClose}>✖</button>
                </div>

                {/* DATE TIME */}
                <div className="date-time-row">
                    <div className="date-time-box">
                        <label>From Date</label>
                        <input
                            type="date"
                            value={form.fromDate || ""}
                            onChange={e => {
                                const from = e.target.value;
                                setForm(prev => ({
                                    ...prev,
                                    fromDate: from,
                                    toDate: prev.toDate || addOneDay(from)
                                }));
                            }}

                        />

                        <label>From Time</label>
                        <input
                            type="time"
                            className={isInvalidTime ? "invalid-field" : ""}
                            value={form.fromTime || ""}
                            onChange={e =>
                                setForm({ ...form, fromTime: e.target.value })
                            }
                        />
                    </div>

                    <div className="date-time-box">
                        <label>To Date</label>
                        <input
                            type="date"
                            min={form.fromDate}
                            className={isInvalidDate ? "invalid-field" : ""}
                            value={form.toDate || ""}
                            onChange={e =>
                                setForm({ ...form, toDate: e.target.value })
                            }
                        />

                        <label>To Time</label>
                        <input
                            type="time"
                            className={isInvalidTime ? "invalid-field" : ""}
                            value={form.toTime || ""}
                            onChange={e =>
                                setForm({ ...form, toTime: e.target.value })
                            }
                        />
                    </div>
                </div>

                {(isInvalidDate || isInvalidTime) && (
                    <p style={{ color: "red", fontSize: "13px" }}>
                        ❌ Invalid date / time range
                    </p>
                )}

                <p><b>No. of Days:</b> {noOfDays}</p>

                {/* GUESTS */}
                <label>No. of Guests</label>
                <input
                    type="number"
                    min="1"
                    value={form.guestCount || 1}
                    onChange={e => updateGuestCount(e.target.value)}
                />

                {guests.map((g, i) => (
                    <div key={i} className="guest-box">
                        <h4>Guest {i + 1}</h4>

                        <input placeholder="Name" value={g.name}
                            onChange={e => {
                                const arr = [...guests];
                                arr[i].name = e.target.value;
                                setGuests(arr);
                            }} />

                        <input placeholder="Aadhar Card" value={g.aadharCard || ""}
                            onChange={e => {
                                const arr = [...guests];
                                arr[i].aadharCard = e.target.value;
                                setGuests(arr);
                            }} />

                        <input placeholder="Mobile" value={g.mobile || ""}
                            onChange={e => {
                                const arr = [...guests];
                                arr[i].mobile = e.target.value;
                                setGuests(arr);
                            }} />

                        <input
                            placeholder="Address"
                            value={g.address || ""}
                            onChange={e => {
                                const arr = [...guests];
                                arr[i].address = e.target.value;
                                setGuests(arr);
                            }}
                        />

                        <label>Select Rooms</label>
                        <div className="room-grid">
                            {availableRooms.map(r => {
                                const selected = g.rooms.some(x => x.id === r.id);
                                return (
                                    <div
                                        key={r.id}
                                        onClick={() => toggleGuestRoom(i, r)}
                                        className={`room-tile ${selected ? "selected" : ""}`}
                                    >
                                        <div>{r.name}</div>
                                        <small>₹{r.rate} / day</small>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {uniqueRooms.length === 0 && (
                    <p style={{ opacity: 0.6, fontSize: "13px" }}>
                        👉 Select at least one room
                    </p>
                )}

                {/* SELECTED ROOMS */}
                {uniqueRooms.length > 0 && (
                    <div className="card">
                        <div style={{ display: "flex", justifyContent: "left" }}>
                            <h4>Selected Rooms & Rates</h4>
                        </div>
                        {uniqueRooms.map(r => (
                            <div key={r.id} style={{ display: "flex", gap: "10px" }}>
                                <span style={{ flex: 1 }}>{r.name}</span>
                                <input
                                    type="number"
                                    value={roomRates[r.id] ?? ""}
                                    onChange={e => updateRoomRate(r.id, e.target.value)}
                                    placeholder="Rate"
                                />
                            </div>
                        ))}

                        <div className="rates-total">
                            <b>Rooms Total For {noOfDays} Days :</b> ₹{roomsSubtotal}
                        </div>

                        {/* ROOM → GUEST ASSIGNMENT */}
                        <div style={{ marginTop: "12px" }}>
                            <div style={{ display: "flex", justifyContent: "left" }}>
                                <h4>Room Allocation (Key Holder)</h4>
                            </div>
                            {uniqueRooms.map(r => {
                                const guestsForRoom = roomGuestMap[r.id] || [];

                                return (
                                    <div
                                        key={r.id}
                                        style={{
                                            border: "1px solid #ddd",
                                            borderRadius: "10px",
                                            padding: "10px",
                                            marginBottom: "8px",
                                            background: "#fafafa"
                                        }}
                                    >
                                        <div style={{ fontWeight: "600", marginBottom: "6px", display: "flex", justifyContent: "left" }}>
                                            🏨 Room {r.name}
                                        </div>

                                        {guestsForRoom.length === 1 ? (
                                            <div style={{ fontSize: "13px" }}>
                                                🔑 Key Holder: Guest {guestsForRoom[0].guestIndex} — {guestsForRoom[0].name}
                                            </div>
                                        ) : (
                                            <div style={{ display: "flex" }}>
                                                <label style={{ fontSize: "13px", display: "flex", whiteSpace: "nowrap", alignItems: "center" }}>Select Key Holder: </label>
                                                <select
                                                    value={roomKeyHolders[r.id] || ""}
                                                    onChange={e => updateKeyHolder(r.id, Number(e.target.value))}
                                                    style={{ width: "100%", display: "flex", whiteSpace: "nowrap", alignItems: "center" }}
                                                >
                                                    <option value="">-- Select Guest --</option>
                                                    {guestsForRoom.map(g => (
                                                        <option key={g.guestIndex} value={g.guestIndex}>
                                                            Guest : {g.guestIndex} — {g.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* STAY & DEPOSIT DETAILS */}
                <div className="card" style={{ marginTop: "15px" }}>
                    <h4>🏷 Stay & Deposit Details</h4>

                    {/* Stay Purpose */}
                    <div style={{ display: "flex", marginTop: "10px", justifyContent: "space-between" }}>
                        <label style={{ whiteSpace: "nowrap", marginRight: "10px" }}>
                            Stay Purpose:
                        </label>
                        <input
                            type="text"
                            placeholder="Business / Family / Tour / Other"
                            value={form.staypurpose || ""}
                            onChange={e =>
                                setForm({ ...form, staypurpose: e.target.value })
                            }
                            style={{ width: "50%" }}
                        />
                    </div>

                    {/* Deposit Amount */}
                    <div style={{ display: "flex", marginTop: "10px", justifyContent: "space-between" }}>
                        <label style={{ whiteSpace: "nowrap", marginRight: "10px" }}>
                            Security Deposit Amount:
                        </label>
                        <input
                            type="number"
                            placeholder="₹ Deposit Amount"
                            value={form.depositAmount || ""}
                            onChange={e =>
                                setForm({ ...form, depositAmount: e.target.value })
                            }
                            style={{ width: "50%" }}
                        />
                    </div>

                    {/* Depositor Name */}
                    <div style={{ display: "flex", marginTop: "10px", justifyContent: "space-between" }}>
                        <label style={{ whiteSpace: "nowrap", marginRight: "10px" }}>
                            Security Depositor Name:
                        </label>
                        <input
                            type="text"
                            placeholder="Name of person depositing amount"
                            value={form.depositorName || ""}
                            onChange={e =>
                                setForm({ ...form, depositorName: e.target.value })
                            }
                            style={{ width: "50%" }}
                        />
                    </div>
                </div>

                {/* GST Breakdown */}
                {uniqueRooms.length > 0 && (
                    <div className="gst-summary">
                        <h4>GST Details</h4>

                        {uniqueRooms.map(r => {
                            const rate = Number(roomRates[r.id] ?? r.rate ?? 0);
                            const gst = calculateGST(rate) * noOfDays;

                            return (
                                <div
                                    key={r.id}
                                    style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}
                                >
                                    <span>{r.name}</span>
                                    <span>₹{gst.toFixed(0)}</span>
                                </div>
                            );
                        })}

                        <div className="gst-total" style={{ justifyContent: "end" }}>
                            <b>Total GST:</b> ₹{totalGST.toFixed(0)}
                        </div>
                    </div>
                )}

                <div style={{ display: "flex", marginTop: "20px" }}>
                    <label style={{ whiteSpace: "nowrap", marginRight: "10px" }} >Discount: </label>
                    <input
                        type="number"
                        value={form.discount || ""}
                        onChange={e =>
                            setForm({ ...form, discount: e.target.value })
                        }
                    />
                </div>

                <div className="price-summary">
                    <b>Final Amount:</b> ₹{finalAmount}
                </div>

                <div style={{ marginTop: "15px", display: "flex", justifyContent: "center" }}>
                    <button
                        className="btn-success"
                        disabled={isInvalidDate || isInvalidTime}
                        onClick={() => onSave(bookingAmounts)}
                    >
                        💾 Save Booking
                    </button>
                </div>

            </div>
        </div>
    );
};

export default RoomBookingFormModal;

