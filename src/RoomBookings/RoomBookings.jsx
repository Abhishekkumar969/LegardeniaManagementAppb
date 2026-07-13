import React, { useEffect, useState } from "react";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";

import RoomBookingFormModal from "./RoomBookingFormModal";
import RoomBookingDates from "./RoomBookingDates";
import BookedRoomsTable from "./BookedRoomsTable";
import AllBookedRoomsTable from "./AllBookedRoomsTable";
import RoomsRatesManager from "./RoomsRatesManager";
import OccupancyHeatmap from "./OccupancyHeatmap";
import BackButton from "../components/BackButton";
import "../styles/RoomBookings.css";

/* ===============================
   🔥 BUCKET HELPERS
================================ */

const getBucketDocId = (dateStr) => {
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  if (day <= 8) return `01${month}${year}`;
  if (day <= 16) return `09${month}${year}`;
  if (day <= 24) return `17${month}${year}`;
  return `25${month}${year}`;
};

const getMonthBuckets = (dateStr) => {
  const d = new Date(dateStr);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return [
    `01${month}${year}`,
    `09${month}${year}`,
    `17${month}${year}`,
    `25${month}${year}`
  ];
};

const parseISTDate = (str) => {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/* ===============================
   COMPONENT
================================ */

const RoomBookings = () => {

  /* ---------- STATES ---------- */

  const todayIST = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [rooms, setRooms] = useState([]);
  const [bucketBookings, setBucketBookings] = useState({});
  const [selectedDate, setSelectedDate] = useState(todayIST());
  const [bookings, setBookings] = useState([]);
  const [allBookings, setAllBookings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showAddRooms, setShowAddRooms] = useState(false);
  const [roomCount, setRoomCount] = useState("");
  const [roomNames, setRoomNames] = useState([]);
  const saveRooms = async () => {
    const ref = doc(db, "rooms", "allRooms");

    const newRooms = roomNames
      .filter(Boolean)
      .map(name => ({
        id: name,
        name,
        rate: 3000,
        createdAt: new Date()
      }));

    await setDoc(
      ref,
      { rooms: [...rooms, ...newRooms] },
      { merge: true }
    );

    setRoomNames([]);
    setRoomCount("");
    setShowAddRooms(false);
  };

  const [guests, setGuests] = useState([{ name: "", mobile: "", aadharCard: "", address: "", rooms: [] }]);

  const [form, setForm] = useState({
    fromDate: "",
    toDate: "",
    fromTime: "",
    toTime: "",
    discount: "",
    guestCount: 1,
    roomRates: {},
    roomKeyHolders: {},

    staypurpose: "",
    depositAmount: "",
    depositorName: ""
  });

  useEffect(() => {
    const ref = doc(db, "rooms", "allRooms");
    const unsub = onSnapshot(ref, snap => {
      setRooms(snap.exists() ? snap.data().rooms || [] : []);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const buckets = getMonthBuckets(selectedDate);
    const unsubscribes = [];

    buckets.forEach(bucketId => {
      const ref = doc(db, "roomBookings", bucketId);

      const unsub = onSnapshot(ref, snap => {
        setBucketBookings(prev => ({
          ...prev,
          [bucketId]: snap.exists() ? snap.data() : {}
        }));
      });

      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach(u => u());
  }, [selectedDate]);

  useEffect(() => {
    const s = parseISTDate(selectedDate);

    const all = Object.values(bucketBookings)
      .flatMap(docData =>
        Object.entries(docData)
          .filter(([k]) => k !== "updatedAt" && k !== "bucket")
          .map(([, v]) => v)
      );

    setAllBookings(all);

    const filtered = all.filter(b => {
      const f = parseISTDate(b.fromDate);
      const t = parseISTDate(b.toDate);
      return s >= f && s <= t;
    });

    setBookings(filtered);
  }, [bucketBookings, selectedDate]);

  const saveBooking = async (amounts) => {
    const bucketId = getBucketDocId(form.fromDate);
    const bookingId = editingId || crypto.randomUUID();

    const payload = {
      id: bookingId,
      bookedOn: form.fromDate,
      ...form,
      guests,

      amounts: {
        noOfDays: amounts.noOfDays,
        roomsSubtotal: amounts.roomsSubtotal,
        totalGST: amounts.totalGST,
        gstBreakup: amounts.gstBreakup,
        rateSnapshot: amounts.rateSnapshot,
        discount: amounts.discount,
        finalAmount: amounts.finalAmount
      },

      updatedAt: new Date(),
      ...(editingId ? {} : { createdAt: new Date() })
    };

    await setDoc(
      doc(db, "roomBookings", bucketId),
      { [bookingId]: payload, updatedAt: new Date() },
      { merge: true }
    );

    setShowForm(false);
    setEditingId(null);
  };

  const editBooking = (b) => {
    setForm({
      id: b.id,
      fromDate: b.fromDate,
      toDate: b.toDate,
      fromTime: b.fromTime || "12:00",
      toTime: b.toTime || "11:00",
      discount: b.amounts?.discount || "",
      guestCount: b.guestCount || 1,
      roomRates: b.amounts?.rateSnapshot || {},
      roomKeyHolders: b.roomKeyHolders || {},

      staypurpose: b.staypurpose || "",
      depositAmount: b.depositAmount || "",
      depositorName: b.depositorName || ""
    });

    setGuests(b.guests || []);
    setEditingId(b.id);
    setShowForm(true);
  };

  const formatDate = (d) => {
    if (!d) return "-";
    const [y, m, day] = d.split("-");
    return `${day}-${m}-${y}`;
  };

  const formatTime = (t) => {
    if (!t) return "-";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  const generatePrintHTML = (r) => {
    const checkInDate = formatDate(r.rawBooking.fromDate);
    const checkInTime = formatTime(r.rawBooking.fromTime);
    const checkOutDate = formatDate(r.rawBooking.toDate);
    const checkOutTime = formatTime(r.rawBooking.toTime);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Room Booking Receipt</title>
        <style>
          body {
            font-family: "Segoe UI", Arial, sans-serif;
            padding: 30px;
            color: #222;
          }
      
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
      
          .hotel-name {
            font-size: 22px;
            font-weight: bold;
          }
      
          .receipt-title {
            text-align: center;
            font-size: 20px;
            margin: 20px 0 10px;
            font-weight: 600;
          }
      
          .meta {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            font-size: 14px;
          }
      
          .meta div {
            width: 48%;
          }
      
          .section {
            margin-top: 22px;
          }
      
          h4 {
            margin-bottom: 8px;
            border-bottom: 1px solid #ccc;
            padding-bottom: 4px;
          }
      
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
      
          th, td {
            border: 1px solid #ccc;
            padding: 8px;
            font-size: 14px;
          }
      
          th {
            background: #fec164ff;
            text-align: left;
          }
      
          .right {
            text-align: right;
          }
      
          .total-row td {
            font-weight: bold;
            font-size: 15px;
          }
      
          .guests div {
            margin-bottom: 4px;
            font-size: 14px;
          }
      
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 13px;
            border-top: 1px dashed #aaa;
            padding-top: 10px;
          }
      
          .small {
            font-size: 12px;
            color: #555;
          }
        </style>
      </head>

      <body>
      
        <!-- HEADER -->
        <div class="header">
          <div class="hotel-name"></div>
          <div class="small">
            Receipt Date: ${new Date().toLocaleDateString("en-IN")}
          </div>
        </div>
      
        <div class="receipt-title">Room Booking Receipt</div>
        
        <!-- GUESTS -->
        <div class="section">
          <h4>Guest Details</h4>
          <div class="guests">
            ${r.guests.map((g, i) => `
              <div>
                ${i + 1}. <b>${g.name || "Guest"}</b>
                ${g.mobile ? ` – ${g.mobile}` : ""}
              </div>
            `).join("")}
          </div>
        </div>
        
      <br/>
      
        <!-- BOOKING META -->
        <div class="meta">
          <div>
            <b>Check-In:</b><br/>
              ${checkInDate} <br/>
              ${checkInTime}
          </div>

          <div>
            <b>Check-Out:</b><br/>
             ${checkOutDate}<br/>
             ${checkOutTime}
          </div>
        </div>
      
        <div class="meta" style="margin-top:8px">
          <div>
            <b>No. of Days:</b> ${r.days}
          </div>
          <div>
            <b>Total Rooms:</b> ${r.rooms.length}
          </div>
        </div>
      
        <!-- ROOMS -->
      <div class="section">
        <h4>Room Charges</h4>
        <table>
          <tr>
            <th>Room No.</th>
            <th>Rate / Day</th>
            <th>Days</th>
            <th class="right">Amount</th>
            <th class="right">GST</th>
          </tr>
      
          ${r.rooms.map(room => {
      const rate = Number(r.rawBooking.roomRates?.[room.id] || room.rate || 0);
      const days = r.days;
      const amount = rate * days;

      const gstPerDay =
        rate <= 1000 ? 0 :
          rate <= 7500 ? Math.round(rate * 0.12) :
            Math.round(rate * 0.18);

      const gstAmount = gstPerDay * days;

      return `
              <tr>
                <td>${room.name}</td>
                <td>₹${rate.toLocaleString("en-IN")}</td>
                <td>${days}</td>
                <td class="right">₹${amount.toLocaleString("en-IN")}</td>
                <td class="right">₹${gstAmount.toLocaleString("en-IN")}</td>
              </tr>
            `;
    }).join("")}
      
          <!-- TOTAL ROOMS -->
          <tr class="total-row">
            <td colspan="4" class="left">Rooms Total</td>
            <td class="right">
              ₹${Number(r.rawBooking?.amounts?.roomsSubtotal || 0).toLocaleString("en-IN")}
            </td>
          </tr>
      
          <!-- GST TOTAL -->
          <tr class="total-row">
            <td colspan="4" class="left">Total GST</td>
            <td class="right">
              ₹${Number(r.rawBooking?.amounts?.totalGST || 0).toLocaleString("en-IN")}
            </td>
          </tr>
      
          ${Number(r.rawBooking?.amounts?.discount || 0) > 0
        ? `
              <tr class="total-row">
                <td colspan="4" class="left">Discount</td>
                <td class="right">
                 ₹${Number(r.rawBooking.amounts.discount).toLocaleString("en-IN")}
                </td>
              </tr>
              `
        : ""
      }
      
          <!-- FINAL PAYMENT -->
          <tr class="total-row">
            <td colspan="4" class="left">Final Payment</td>
            <td class="right">
              ₹${Number(r.rawBooking?.amounts?.finalAmount || 0).toLocaleString("en-IN")}
            </td>
          </tr>
        </table>
      </div>


        <!-- FOOTER -->
        <div class="footer">
          <div>Thank you for staying with us 🙏</div>
          <div class="small">
            This is a computer-generated receipt and does not require a signature.
          </div>
        </div>

</body>
</html>
`;
  };

  const handlePrint = (row) => {
    const html = generatePrintHTML(row);

    // remove old iframe if any
    const oldIframe = document.getElementById("print-iframe");
    if (oldIframe) oldIframe.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "print-iframe";
    iframe.style.position = "fixed";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";

    document.body.appendChild(iframe);

    const iframeWindow = iframe.contentWindow;
    const doc = iframeWindow.document;

    doc.open();
    doc.write(html);
    doc.close();

    iframeWindow.focus();
    iframeWindow.print();

    // ✅ proper cleanup — NO setTimeout
    iframeWindow.onafterprint = () => {
      iframe.remove();
    };
  };

  useEffect(() => {
    const esc = (e) => {
      if (e.key === "Escape") setShowAddRooms(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  return (
    <div className="page-scroller">
      <div className="room-bookings">

        <div style={{ marginBottom: "60px" }}>
          <BackButton />
        </div>

        <h2>🏨 Room Management</h2>

        <div style={{ display: "flex", justifyContent: "end", marginBottom: "20px" }}>
          <button className="btn-primary" onClick={() => setShowAddRooms(true)}>
            + Add Rooms
          </button>
        </div>

        {showAddRooms && (
          <div
            className="modal-backdrop"
            onClick={() => setShowAddRooms(false)}   // 👈 backdrop click close
          >
            <div
              className="modal"
              onClick={(e) => e.stopPropagation()} // 👈 modal click se close na ho
            >
              {/* HEADER */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>Create Rooms</h3>
                <button
                  style={{ width: "35px", height: "35px" }}
                  className="btn-danger"
                  onClick={() => setShowAddRooms(false)}
                >
                  ✖
                </button>
              </div>

              {/* BODY */}
              <input
                type="number"
                placeholder="No. of rooms"
                value={roomCount}
                onChange={e => {
                  const count = Number(e.target.value || 0);
                  setRoomCount(count);
                  setRoomNames(Array.from({ length: count }, () => ""));
                }}
              />

              {roomNames.map((r, i) => (
                <input
                  key={i}
                  placeholder={`Room ${i + 1}`}
                  value={r}
                  onChange={e => {
                    const arr = [...roomNames];
                    arr[i] = e.target.value;
                    setRoomNames(arr);
                  }}
                />
              ))}

              {/* FOOTER */}
              <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
                <button className="btn-success" style={{ backgroundColor: "green", height: "35px" }} onClick={saveRooms}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        <RoomsRatesManager
          rooms={rooms}
          setRooms={setRooms}
          bookings={bookings}
          selectedDate={selectedDate}
        />

        <div className="DateOccupancy">

          <RoomBookingDates onDateSelect={setSelectedDate} />

          <OccupancyHeatmap
            rooms={rooms}
            bookings={bookings}
            selectedDate={selectedDate}
          />
        </div>

        <div className="card" style={{ padding: "0px" }}>
          <button
            className="btn-primary"
            onClick={() => {
              setForm({
                fromDate: selectedDate,
                toDate: selectedDate,
                fromTime: "12:00",
                toTime: "11:00",
                discount: "",
                guestCount: 1,
                roomRates: {},
                roomKeyHolders: {},

                // 🔥 reset these
                staypurpose: "",
                depositAmount: "",
                depositorName: ""
              });
              setGuests([{ name: "", mobile: "", aadhar: "", rooms: [] }]);
              setEditingId(null);
              setShowForm(true);
            }}
            style={{ width: "100%", height: "100%", padding: "20px" }}
          >
            + New Booking
          </button>
        </div>

        <RoomBookingFormModal
          show={showForm}
          onClose={() => setShowForm(false)}
          rooms={rooms}
          bookings={allBookings}
          form={form}
          setForm={setForm}
          guests={guests}
          setGuests={setGuests}
          onSave={saveBooking}
        />

        <BookedRoomsTable
          bookings={bookings}
          selectedDate={selectedDate}
          onEdit={editBooking}
          handlePrint={handlePrint}
        />

        <AllBookedRoomsTable
          bookings={allBookings}
          onEdit={editBooking}
          handlePrint={handlePrint}
        />

      </div>
    </div>
  );
};

export default RoomBookings;