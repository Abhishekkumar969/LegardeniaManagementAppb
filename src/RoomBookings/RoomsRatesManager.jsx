import React, { useState } from "react";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

/* =======================
   IST SAFE DATE HELPERS
======================= */
const parseISTDate = (str) => {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
};

const RoomsRatesManager = ({ rooms = [], setRooms, bookings = [], selectedDate }) => {
    const [editingId, setEditingId] = useState(null);
    const [temp, setTemp] = useState({ name: "", rate: "" });

    /* =======================
       ROOM USAGE CHECKS
    ======================= */

    // ❌ Delete disable → if room EVER used
    const isRoomUsedEver = (roomId) =>
        bookings.some(b =>
            b.guests?.some(g =>
                g.rooms?.some(r => r.id === roomId)
            )
        );

    // 🔒 Edit disable → if room booked on selectedDate
    const isRoomBookedToday = (roomId) => {
        if (!selectedDate) return false;

        const s = parseISTDate(selectedDate);

        return bookings.some(b => {
            const f = parseISTDate(b.fromDate);
            const t = parseISTDate(b.toDate);

            return (
                s >= f &&
                s < t && // 🔥 checkout day excluded
                b.guests?.some(g =>
                    g.rooms?.some(r => r.id === roomId)
                )
            );
        });
    };

    /* =======================
       EDIT HANDLERS
    ======================= */
    const startEdit = (room) => {
        setEditingId(room.id);
        setTemp({
            name: room.name,
            rate: room.rate ?? ""
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setTemp({ name: "", rate: "" });
    };

    /* =======================
       SAVE ROOM EDIT
    ======================= */
    const saveEdit = async (roomId) => {
        const ref = doc(db, "rooms", "allRooms");
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const updatedRooms = (snap.data().rooms || []).map(r =>
            r.id === roomId
                ? { ...r, name: temp.name, rate: Number(temp.rate || 0) }
                : r
        );

        await setDoc(ref, { rooms: updatedRooms }, { merge: true });

        // 🔥 instant UI update (snapshot bhi karega)
        setRooms(updatedRooms);
        cancelEdit();
    };

    /* =======================
       DELETE ROOM
    ======================= */
    const deleteRoom = async (roomId) => {
        if (!window.confirm("⚠️ Permanently delete this room?")) return;

        const ref = doc(db, "rooms", "allRooms");
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const updatedRooms = (snap.data().rooms || []).filter(
            r => r.id !== roomId
        );

        await setDoc(ref, { rooms: updatedRooms }, { merge: true });
        setRooms(updatedRooms);
    };

    /* =======================
       UI
    ======================= */
    return (
        <div className="card rooms-manager-card">
            <h3>Rooms & Rates ({rooms.length})</h3>

            <div className="rooms-grid">
                {rooms.map(room => {
                    const editing = editingId === room.id;
                    const usedEver = isRoomUsedEver(room.id);
                    const bookedToday = isRoomBookedToday(room.id);

                    return (
                        <div
                            key={room.id}
                            className={`room-card ${bookedToday ? "booked" : ""}`}
                        >
                            {!editing ? (
                                <>
                                    <div className="room-title">
                                        🏨 Room No: {room.name}
                                    </div>

                                    <div className="room-rate">
                                        💰 Daily Rate: ₹{room.rate || 0}
                                    </div>

                                    <div className={`room-status ${bookedToday ? "booked" : "available"}`}>
                                        {bookedToday ? "🔒 Booked Today" : "Available"}
                                    </div>

                                    <div className="room-actions">
                                        <button
                                            className="btn-primary"
                                            disabled={bookedToday}
                                            onClick={() => startEdit(room)}
                                        >
                                            ✏️ Edit
                                        </button>

                                        <button
                                            className="btn-danger"
                                            disabled={usedEver}
                                            onClick={() => deleteRoom(room.id)}
                                        >
                                            🗑 Delete
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="room-edit">
                                    <label>Room No.</label>
                                    <input
                                        value={temp.name}
                                        onChange={e =>
                                            setTemp({ ...temp, name: e.target.value })
                                        }
                                    />

                                    <label>Daily Rate</label>
                                    <input
                                        type="number"
                                        value={temp.rate}
                                        onChange={e =>
                                            setTemp({ ...temp, rate: e.target.value })
                                        }
                                    />

                                    <div className="room-actions">
                                        <button
                                            className="btn-success"
                                            onClick={() => saveEdit(room.id)}
                                        >
                                            💾 Save
                                        </button>

                                        <button
                                            className="btn-danger"
                                            onClick={cancelEdit}
                                        >
                                            ✖ Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default RoomsRatesManager;
