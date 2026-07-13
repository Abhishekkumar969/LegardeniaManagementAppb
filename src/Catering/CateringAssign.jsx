import React, { useEffect, useState, useRef } from "react";
import { db } from "../firebaseConfig";
import { getDoc, collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import "../styles/VendorTable.css";
import BackButton from "../components/BackButton";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import BottomNavigationBar from "../components/BottomNavigationBar";

const CateringAssign = () => {
    const [prebookings, setPrebookings] = useState([]);
    const [assignments, setAssignments] = useState({});
    const [popupBooking, setPopupBooking] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortOrder, setSortOrder] = useState("asc");
    const navigate = useNavigate();
    const [userAppType, setUserAppType] = useState(null);
    const [showSubitems, setShowSubitems] = useState(null);

    useEffect(() => {
        const fetchUserAppType = async () => {
            const auth = getAuth();
            const user = auth.currentUser;
            if (user) {
                try {
                    const userRef = doc(db, 'usersAccess', user.email);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        setUserAppType(data.accessToApp);
                    }
                } catch (err) {
                    console.error("Error fetching user app type:", err);
                }
            }
        };
        fetchUserAppType();
    }, []);

    const convertToISTDate = (dateStr) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        // Use toLocaleString with IST timezone
        const options = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" };
        return d.toLocaleDateString("en-GB", options); // returns dd-mm-yyyy
    };

    const convertToIST12Hour = (timeStr) => {
        if (!timeStr) return "-";
        const [hours, minutes] = timeStr.split(":").map(Number);
        let istHours = (hours + 5) % 24;
        let istMinutes = minutes + 30;
        if (istMinutes >= 60) {
            istMinutes -= 60;
            istHours = (istHours + 1) % 24;
        }
        const ampm = istHours >= 12 ? "PM" : "AM";
        const hour12 = istHours % 12 || 12;
        return `${hour12}:${String(istMinutes).padStart(2, "0")} ${ampm}`;
    };

    useEffect(() => {
        const prebookingsCollection = collection(db, "prebookings");
        const cateringCollection = collection(db, "catering");

        // Prebookings listener
        const unsubPrebookings = onSnapshot(prebookingsCollection, async (monthSnap) => {
            const allPrebookings = [];

            for (const monthDoc of monthSnap.docs) {
                const monthData = monthDoc.data().data || monthDoc.data() || {};
                Object.keys(monthData).forEach((docId) => {
                    allPrebookings.push({
                        id: docId,
                        month: monthDoc.id,
                        ...monthData[docId],
                        assignedMenus: {}, // will populate from catering later
                    });
                });
            }

            // 🔥 DEDUPE FIX
            const unique = new Map();

            allPrebookings.forEach(item => {
                const uniqueKey =
                    (item.name || "").trim().toLowerCase() + "|" +
                    (item.mobile1 || item.mobile2 || "").replace(/\D/g, "") + "|" +
                    (item.functionType || "").trim().toLowerCase() + "|" +
                    new Date(item.functionDate).toISOString().split("T")[0];

                if (!unique.has(uniqueKey)) {
                    unique.set(uniqueKey, item);
                }
            });

            setPrebookings(Array.from(unique.values()));

        });

        // Catering listener
        const unsubCatering = onSnapshot(cateringCollection, async (monthSnap) => {
            const cateringData = {};

            for (const monthDoc of monthSnap.docs) {
                const monthData = monthDoc.data().data || monthDoc.data() || {};
                Object.keys(monthData).forEach((docId) => {
                    cateringData[docId] = monthData[docId]; // we only care about assignedMenus
                });
            }

            // Update assignedMenus in prebookings
            setPrebookings((prev) =>
                prev.map((booking) => ({
                    ...booking,
                    assignedMenus: cateringData[booking.id]?.assignedMenus || {},
                }))
            );
        });

        return () => {
            unsubPrebookings();
            unsubCatering();
        };
    }, []);

    const handleInputChange = (bookingId, menuKey, field, value) => {
        setAssignments((prev) => ({
            ...prev,
            [bookingId]: {
                ...prev[bookingId],
                [menuKey]: {
                    ...prev[bookingId]?.[menuKey],
                    [field]: value,
                },
            },
        }));
    };

    const handleAssign = async (booking) => {
        try {
            const bookingAssign = assignments[booking.id] || {};

            // 1️⃣ Assigned Menus
            const assignedMenus = {};
            Object.entries(booking.selectedMenus || {}).forEach(([menuKey, menuVal]) => {
                const assigned = bookingAssign[menuKey] || {};
                assignedMenus[menuKey] = {
                    qty: assigned.qty ?? menuVal.noOfPlates ?? 0,
                    extQty: assigned.extQty ?? menuVal.extraPlates ?? 0,
                    rate: assigned.rate ?? menuVal.rate ?? 0,
                    selectedSubItems: menuVal.selectedSubItems || [], // ✅ add this
                };
            });

            // 2️⃣ Custom Menu Charges
            const customMenuCharges = {};
            (booking.customMenuCharges || []).forEach((menu, i) => {
                const assigned = bookingAssign[`custom-${i}`] || {};
                customMenuCharges[menu.name] = {
                    qty: assigned.qty ?? menu.qty ?? 0,
                    extQty: assigned.extQty ?? menu.extQty ?? 0,
                    rate: assigned.rate ?? menu.rate ?? 0,
                    selectedSubItems: menu.selectedSubItems || [], // ✅ add this

                };
            });

            // 3️⃣ Meals per day
            const mealsData = {};
            Object.entries(booking.meals || {}).forEach(([day, dayMeals]) => {
                if (day === "No. of days") return;
                mealsData[day] = {};
                Object.entries(dayMeals).forEach(([mealName, mealDetails]) => {
                    if (mealName === "date") {
                        mealsData[day].date = mealDetails;
                    } else {
                        const assigned = bookingAssign[`${day}-${mealName}`] || {};
                        mealsData[day][mealName] = {
                            option: mealDetails.option ?? "",
                            pax: assigned.qty ?? mealDetails.pax ?? 0,
                            extQty: assigned.extQty ?? mealDetails.extQty ?? 0,
                            rate: assigned.rate ?? mealDetails.rate ?? 0,
                            startTime: mealDetails.startTime ?? "",
                            endTime: mealDetails.endTime ?? "",
                            total: mealDetails.total ?? 0,
                            selectedItems: mealDetails.selectedItems ? [...new Set(mealDetails.selectedItems)] : [],

                        };
                    }
                });
            });

            // 4️⃣ Determine document ID (month-year with short month)
            const bookedOnValue =
                bookingAssign?.general?.bookedOn ||
                booking.bookedOn ||
                new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0]; // IST

            const [year, monthNum] = bookedOnValue.split("-"); // monthNum = "04"
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const monthShort = monthNames[parseInt(monthNum, 10) - 1]; // "Apr"

            const docId = `${monthShort}${year}`; // e.g., "Apr2025"


            // 5️⃣ Firestore reference
            const docRef = doc(db, "catering", docId);

            // 6️⃣ Set booking data under `data` map
            await setDoc(
                docRef,
                {
                    [booking.id]:
                    {
                        functionType: booking.functionType || "",
                        venueType: booking.venueType || "",
                        assignedMenus,
                        customMenuCharges,
                        meals: mealsData,
                        eventDate: booking.functionDate || "",
                        name: booking.name || "",
                        bookedOn: bookedOnValue,
                        CateringAssignName:
                            bookingAssign?.general?.CateringAssignName || booking.CateringAssignName || "",
                        CateringAssignNumber:
                            bookingAssign?.general?.CateringAssignNumber || booking.CateringAssignNumber || "",
                        updatedAt: new Date(Date.now() + 5.5 * 60 * 60 * 1000), // IST timestamp
                    },
                },
                { merge: true } // Important: merge so we don’t overwrite other bookings
            );

            navigate("/cateringAssigned");
            setPopupBooking(null);
        } catch (err) {
            console.error("Error assigning catering:", err);
            alert("❌ Failed to assign catering!");
        }
    };

    const filteredBookings = prebookings
        .filter(
            (booking) =>
                !booking.assignedMenus || Object.keys(booking.assignedMenus).length === 0
        )
        .filter(booking => {
            const hasSelected =
                booking.selectedMenus &&
                Object.keys(booking.selectedMenus).length > 0;

            const hasCustom =
                Array.isArray(booking.customMenuCharges) &&
                booking.customMenuCharges.length > 0;

            const hasMeals =
                booking.meals &&
                Object.keys(booking.meals)
                    .filter(key => key !== "No. of days" && key !== "note")
                    .length > 0;

            return hasSelected || hasCustom || hasMeals;
        })
        .filter((booking) => {
            const nameMatch = booking.name?.toLowerCase().includes(searchTerm.toLowerCase());
            const formattedDate = convertToISTDate(booking.functionDate);
            const formattedDateDashed = formattedDate.replace(/\//g, "-");
            const dateMatch =
                formattedDate.includes(searchTerm) || formattedDateDashed.includes(searchTerm);
            return nameMatch || dateMatch;
        });

    const sortedBookings = [...filteredBookings].sort((a, b) => {
        const dateA = new Date(a.functionDate || 0);
        const dateB = new Date(b.functionDate || 0);
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    const rightRef = useRef(null);

    return (
        <div className="page-scroller">
            <div className="leads-table-container">
                <BackButton />
                <h2 style={{ marginTop: "50px" }} >Catering Assignment</h2>

                <div style={{ marginBottom: "20px", textAlign: "center" }}>
                    <input
                        type="text"
                        placeholder="Search by name or date (25-12-2025)"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            padding: "8px 12px",
                            width: "300px",
                            borderRadius: "6px",
                            border: "1px solid #ccc",
                        }}
                    />
                </div>

                {/* Table */}
                <div className="leads-table-container" style={{ padding: "0px", marginTop: "10px", paddingTop: "0px" }}>
                    <div className="table-fixed-wrapper" ref={rightRef}>
                        <table className="leads-table">

                            <thead>
                                <tr style={{backgroundColor:"#3c77a7"}}>
                                    <th>Sl.</th>
                                    <th
                                        onClick={() =>
                                            setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                                        }
                                        style={{ cursor: "pointer" }}
                                    >
                                        Event Date {sortOrder === "asc" ? "" : ""}
                                    </th>
                                    <th>Name</th>
                                    <th>Selected Menus</th>
                                    <th style={{ width: "0px", borderLeft: "none", borderRight: "none",backgroundColor:"transparent" }}></th>
                                    <th style={{ borderLeft: "none" }}>Custom Menu</th>
                                    <th>Meal</th>
                                    <th>Action</th>
                                </tr>
                            </thead>

                            <tbody>
                                {sortedBookings.map((booking, idx) => (
                                    <tr
                                        key={booking.id}
                                        style={{
                                            backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff"
                                        }}
                                    >
                                        <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>{sortedBookings.length - idx}</td>
                                        <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}> {booking.functionDate
                                            ? convertToISTDate(booking.functionDate)
                                            : ""}
                                        </td>
                                        <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>{booking.name}</td>
                                        <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>
                                            {booking.selectedMenus &&
                                                Object.keys(booking.selectedMenus).length > 0 &&
                                                Object.entries(booking.selectedMenus).map(
                                                    ([menuKey, menuVal], i) => (
                                                        <div key={i}>
                                                            <b>{menuKey}</b> | Qty: {menuVal.noOfPlates} | Rate: ₹{menuVal.rate}
                                                        </div>
                                                    ))}
                                        </td>
                                        <td style={{ width: "0px", borderLeft: "none", borderRight: "none" }}></td>
                                        <td style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#eaf4ff", borderLeft: "none" }}>
                                            {booking.customMenuCharges &&
                                                booking.customMenuCharges.length > 0 ? (
                                                booking.customMenuCharges.map((menuVal, i) => (
                                                    <div key={i}>
                                                        <b>{menuVal.name}</b> | Qty: {menuVal.qty} | Rate:
                                                        ₹{menuVal.rate}
                                                    </div>
                                                ))
                                            ) : (
                                                ""
                                            )}
                                        </td>

                                        <td>
                                            {booking.meals &&
                                                Object.keys(booking.meals)
                                                    .filter(key => key !== "No. of days" && key !== "note")
                                                    .length > 0 && (
                                                    <>
                                                        {Object.entries(booking.meals).map(([day, dayMeals]) => {
                                                            if (day === "No. of days") return null;

                                                            return (
                                                                <div key={day} style={{ marginBottom: "10px" }}>

                                                                    <strong style={{ borderBottom: '1px dashed red', marginBottom: '5px' }}>
                                                                        {day} (
                                                                        {(() => {
                                                                            const d = new Date(dayMeals.date);
                                                                            const day = String(d.getDate()).padStart(2, '0');
                                                                            const month = String(d.getMonth() + 1).padStart(2, '0');
                                                                            const year = d.getFullYear();
                                                                            return `${day}-${month}-${year}`;
                                                                        })()}
                                                                        ):
                                                                    </strong>

                                                                    {Object.entries(dayMeals).map(([mealName, mealDetails]) => {
                                                                        if (mealName === "date") return null;
                                                                        return (
                                                                            <div key={mealName} style={{ paddingLeft: "10px" }}>
                                                                                <b style={{ color: 'red' }} >{mealName}</b> | <b> {mealDetails.option} </b> | Pax: <b> {mealDetails.pax} </b>
                                                                                | Rate: <b> ₹{mealDetails.rate} </b> | Start: <b>{convertToIST12Hour(mealDetails.startTime)}</b> | End: <b>{convertToIST12Hour(mealDetails.endTime)}</b> |
                                                                                <b style={{ color: 'green' }} >  Total: ₹{mealDetails.total} </b>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            );
                                                        })}
                                                    </>
                                                )}
                                        </td>

                                        <td>
                                            <button
                                                onClick={() => {
                                                    setAssignments((prev) => ({
                                                        ...prev,
                                                        [booking.id]: {
                                                            general: {
                                                                bookedOn: booking.bookedOn ||
                                                                    new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0],
                                                                CateringAssignName: booking.CateringAssignName || "",
                                                                CateringAssignNumber: booking.CateringAssignNumber || "",
                                                            },
                                                            ...booking.assignedMenus, // keep menu assignments
                                                        },
                                                    }));

                                                    setPopupBooking(booking);
                                                }}
                                                className={`assign-btn ${booking.assignedMenus &&
                                                    Object.keys(booking.assignedMenus).length > 0
                                                    ? "update-btn"
                                                    : "new-assign-btn"
                                                    }`}
                                            >
                                                {booking.assignedMenus &&
                                                    Object.keys(booking.assignedMenus).length > 0
                                                    ? "Update"
                                                    : "Assign"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>

                        </table>
                    </div>
                </div>

                {/* Left Scroll Button */}
                <button
                    onClick={() => rightRef.current?.scrollBy({ left: -300, behavior: "smooth" })}
                    style={{
                        position: "fixed",
                        left: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        zIndex: 999,
                        background: "rgba(255, 255, 255, 0.33)",
                        border: "1px solid #c7c7c7",
                        borderRadius: "5px",
                        width: "50px",
                        height: "100px",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                        cursor: "pointer",
                        color: "black",
                    }} className="scroll-btn"
                >
                    ◀
                </button>

                {/* Right Scroll Button */}
                <button
                    onClick={() => rightRef.current?.scrollBy({ left: 300, behavior: "smooth" })}
                    style={{
                        position: "fixed",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        zIndex: 999,
                        background: "rgba(255, 255, 255, 0.33)",
                        border: "1px solid #c7c7c7",
                        borderRadius: "5px",
                        width: "50px",
                        height: "100px",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                        cursor: "pointer",
                        color: "black",
                    }} className="scroll-btn"
                >
                    ▶
                </button>

                {/* Modal */}
                {popupBooking && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            {/* ✅ Booked On (IST) */}
                            <div style={{ marginBottom: "15px" }}>
                                <div >
                                    <label style={{ marginRight: "8px", fontWeight: "bold", whiteSpace: 'nowrap' }}>Assign On:</label>
                                    <input
                                        type="date"
                                        value={assignments[popupBooking.id]?.general?.bookedOn || new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0]}
                                        onChange={(e) =>
                                            handleInputChange(popupBooking.id, "general", "bookedOn", e.target.value)
                                        }
                                    />
                                </div>
                            </div>

                            {/* ✅ Name + Number */}
                            <div className="menu-block">
                                <h2 className="modal-title">🍽 Assign Catering</h2>
                                <div className="menu-fields">
                                    <div className="field">
                                        <label>Name</label>
                                        <input
                                            type="text"
                                            value={
                                                assignments[popupBooking.id]?.general
                                                    ?.CateringAssignName ||
                                                popupBooking.CateringAssignName ||
                                                ""
                                            }
                                            onChange={(e) =>
                                                handleInputChange(
                                                    popupBooking.id,
                                                    "general",
                                                    "CateringAssignName",
                                                    e.target.value
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="field">
                                        <label>Number</label>
                                        <input
                                            type="number"
                                            value={
                                                assignments[popupBooking.id]?.general
                                                    ?.CateringAssignNumber ||
                                                popupBooking.CateringAssignNumber ||
                                                ""
                                            }
                                            onChange={(e) =>
                                                handleInputChange(
                                                    popupBooking.id,
                                                    "general",
                                                    "CateringAssignNumber",
                                                    e.target.value
                                                )
                                            }
                                            onWheel={(e) => e.target.blur()}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Selected Menus */}
                            {popupBooking.selectedMenus && Object.keys(popupBooking.selectedMenus).length > 0 && (
                                <div className="menus-container">
                                    {showSubitems && (
                                        <div className="subitems-popup-overlay" onClick={() => setShowSubitems(null)}>
                                            <div
                                                className="subitems-popup"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <h3>{showSubitems.menuName}</h3>
                                                <ul>
                                                    {showSubitems.items.map((item, i) => (
                                                        <li key={i}>{item}</li>
                                                    ))}
                                                </ul>
                                                <button className="close-btn" onClick={() => setShowSubitems(null)}>
                                                    Close
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {Object.entries(popupBooking.selectedMenus).map(
                                        ([menuKey, menuVal]) => {
                                            const assigned =
                                                assignments[popupBooking.id]?.[menuKey] || {};
                                            return (
                                                <div key={menuKey} className="menu-block">
                                                    <h3>Selected Menus</h3>
                                                    <h4 className="menu-name">
                                                        {menuKey}
                                                        {menuVal.selectedSubItems && menuVal.selectedSubItems.length > 0 && (
                                                            <button
                                                                className="subitems-btn"
                                                                onClick={() =>
                                                                    setShowSubitems({
                                                                        menuName: menuKey,
                                                                        items: menuVal.selectedSubItems,
                                                                    })
                                                                }
                                                            >
                                                                {menuVal.selectedSubItems.length} Items
                                                            </button>
                                                        )}
                                                    </h4>

                                                    <div className="menu-fields">
                                                        <div className="field">
                                                            <label>Pax</label>
                                                            <input
                                                                type="number"
                                                                value={assigned.qty ?? menuVal.noOfPlates ?? ""}
                                                                onChange={(e) =>
                                                                    handleInputChange(
                                                                        popupBooking.id,
                                                                        menuKey,
                                                                        "qty",
                                                                        e.target.value === ""
                                                                            ? ""
                                                                            : Number(e.target.value)
                                                                    )
                                                                }
                                                                onWheel={(e) => e.target.blur()}
                                                            />
                                                        </div>
                                                        <div className="field">
                                                            <label>Extra Plates</label>
                                                            <input
                                                                type="number"
                                                                value={assigned.extQty ?? menuVal.extraPlates ?? ""}
                                                                onChange={(e) =>
                                                                    handleInputChange(
                                                                        popupBooking.id,
                                                                        menuKey,
                                                                        "extQty",
                                                                        e.target.value === ""
                                                                            ? ""
                                                                            : Number(e.target.value)
                                                                    )
                                                                }
                                                                onWheel={(e) => e.target.blur()} // ✅ prevent scroll
                                                            />
                                                        </div>
                                                        <div className="field">
                                                            <label>Rate (₹)</label>
                                                            <input
                                                                type="number"
                                                                value={assigned.rate ?? menuVal.rate ?? ""}
                                                                onChange={(e) =>
                                                                    handleInputChange(
                                                                        popupBooking.id,
                                                                        menuKey,
                                                                        "rate",
                                                                        e.target.value === ""
                                                                            ? ""
                                                                            : Number(e.target.value)
                                                                    )
                                                                }
                                                                onWheel={(e) => e.target.blur()} // ✅ prevent scroll
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                    )}
                                </div>
                            )}

                            {/* ✅ Custom Menus */}
                            {popupBooking.customMenuCharges && popupBooking.customMenuCharges.length > 0 && (
                                <div className="menus-container">


                                    {popupBooking.customMenuCharges.map((menuVal, i) => {
                                        const assigned =
                                            assignments[popupBooking.id]?.[`custom-${i}`] || {};
                                        return (
                                            <div key={`custom-${i}`} className="menu-block">
                                                <h3>Custom Menus</h3>
                                                <h4 className="menu-name">{menuVal.name} </h4>
                                                <div className="menu-fields">
                                                    <div className="field">
                                                        <label>Pax</label>
                                                        <input
                                                            type="number"
                                                            value={assigned.qty ?? menuVal.qty ?? ""}
                                                            onChange={(e) =>
                                                                handleInputChange(
                                                                    popupBooking.id,
                                                                    `custom-${i}`,
                                                                    "qty",
                                                                    e.target.value === ""
                                                                        ? ""
                                                                        : Number(e.target.value)
                                                                )
                                                            }
                                                            onWheel={(e) => e.target.blur()} // ✅ prevent scroll
                                                        />
                                                    </div>
                                                    <div className="field">
                                                        <label>Extra Plates</label>
                                                        <input
                                                            type="number"
                                                            value={assigned.extQty ?? ""}
                                                            onChange={(e) =>
                                                                handleInputChange(
                                                                    popupBooking.id,
                                                                    `custom-${i}`,
                                                                    "extQty",
                                                                    e.target.value === ""
                                                                        ? ""
                                                                        : Number(e.target.value)
                                                                )
                                                            }
                                                            onWheel={(e) => e.target.blur()} // ✅ prevent scroll
                                                        />
                                                    </div>
                                                    <div className="field">
                                                        <label>Rate (₹)</label>
                                                        <input
                                                            type="number"
                                                            value={assigned.rate ?? menuVal.rate ?? ""}
                                                            onChange={(e) =>
                                                                handleInputChange(
                                                                    popupBooking.id,
                                                                    `custom-${i}`,
                                                                    "rate",
                                                                    e.target.value === ""
                                                                        ? ""
                                                                        : Number(e.target.value)
                                                                )
                                                            }
                                                            onWheel={(e) => e.target.blur()} // ✅ prevent scroll
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* ✅ Custom Meals */}
                            {popupBooking.meals && Object.keys(popupBooking.meals).length > 0 && (
                                <div className="menus-container">
                                    {/* ✅ Only one popup */}
                                    {showSubitems && (
                                        <div
                                            className="subitems-popup-overlay"
                                            onClick={() => setShowSubitems(null)}
                                        >
                                            <div
                                                className="subitems-popup"
                                                onClick={(e) => e.stopPropagation()} // prevent closing when clicking inside
                                            >
                                                <h3>{showSubitems.menuName}</h3>
                                                <ul>
                                                    {showSubitems.items.map((item, i) => (
                                                        <li key={i}>{item}</li>
                                                    ))}
                                                </ul>

                                                <button
                                                    className="close-btn"
                                                    onClick={() => setShowSubitems(null)}
                                                >
                                                    Close
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {Object.entries(popupBooking.meals)
                                        .filter(([key]) => key !== "No. of days" && key !== "note")
                                        .map(([dayName, dayMeals], dayIdx) => (
                                            <div key={dayIdx} className="menu-block">
                                                <h3>Meals</h3>
                                                <h4>
                                                    {dayName} ({dayMeals.date ? convertToISTDate(dayMeals.date) : ""})
                                                </h4>

                                                {/* Meals for that day */}
                                                {Object.entries(dayMeals)
                                                    .filter(([mealName]) => mealName !== "date")
                                                    // sort in fixed order Breakfast → Lunch → Dinner
                                                    .sort(([a], [b]) => {
                                                        const order = ["Breakfast", "Lunch", "Dinner"];
                                                        return order.indexOf(a) - order.indexOf(b);
                                                    })
                                                    .map(([mealName, mealDetails], mealIdx) => {

                                                        const assigned =
                                                            assignments[popupBooking.id]?.[`${dayName}-${mealName}`] || {};

                                                        return (
                                                            <div
                                                                key={mealIdx}
                                                                className="menu-fields"
                                                                style={{
                                                                    display: "flex",
                                                                    flexWrap: "wrap",
                                                                    gap: "15px",
                                                                    marginBottom: "15px",
                                                                    borderRadius: "5px",
                                                                    backgroundColor: "#f9f9f9",
                                                                    padding: "10px",
                                                                    alignItems: "flex-start",
                                                                }}
                                                            >
                                                                {/* Meal Name + Subitems button inline */}
                                                                <div
                                                                    style={{
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        justifyContent: "space-between",
                                                                        flex: "1 1 100%",
                                                                        marginBottom: "10px",
                                                                    }}
                                                                >
                                                                    <div>
                                                                        <strong>{mealName}</strong> | Option: {mealDetails.option}
                                                                    </div>

                                                                    {/* ✅ Use selectedItems here */}
                                                                    {mealDetails.selectedItems && mealDetails.selectedItems.length > 0 && (
                                                                        <button
                                                                            className="subitems-btn"
                                                                            onClick={() =>
                                                                                setShowSubitems({
                                                                                    menuName: mealName,
                                                                                    items: [...new Set(mealDetails.selectedItems || [])]
                                                                                })
                                                                            }
                                                                        >
                                                                            {mealDetails.selectedItems.length} Items
                                                                        </button>
                                                                    )}

                                                                </div>

                                                                {/* Inputs: Pax, Extra Plates, Rate */}
                                                                <div
                                                                    style={{
                                                                        display: "flex",
                                                                        flex: "1 1 100%",
                                                                        gap: "10px",
                                                                        flexWrap: "wrap",
                                                                    }}
                                                                >
                                                                    <div style={{ flex: "1 1 120px", minWidth: "120px" }}>
                                                                        <label>Pax</label>
                                                                        <input
                                                                            type="number"
                                                                            value={assigned.qty ?? mealDetails.pax ?? ""}
                                                                            onChange={(e) =>
                                                                                handleInputChange(
                                                                                    popupBooking.id,
                                                                                    `${dayName}-${mealName}`,
                                                                                    "qty",
                                                                                    e.target.value === "" ? "" : Number(e.target.value)
                                                                                )
                                                                            }
                                                                            style={{ width: "100%", padding: "5px" }}
                                                                            onWheel={(e) => e.target.blur()} // prevent scroll
                                                                        />
                                                                    </div>

                                                                    <div style={{ flex: "1 1 120px", minWidth: "120px" }}>
                                                                        <label>Extra Plates</label>
                                                                        <input
                                                                            type="number"
                                                                            value={assigned.extQty ?? mealDetails.extQty ?? ""}
                                                                            onChange={(e) =>
                                                                                handleInputChange(
                                                                                    popupBooking.id,
                                                                                    `${dayName}-${mealName}`,
                                                                                    "extQty",
                                                                                    e.target.value === "" ? "" : Number(e.target.value)
                                                                                )
                                                                            }
                                                                            style={{ width: "100%", padding: "5px" }}
                                                                            onWheel={(e) => e.target.blur()}
                                                                        />
                                                                    </div>

                                                                    <div style={{ flex: "1 1 120px", minWidth: "120px" }}>
                                                                        <label>Rate (₹)</label>
                                                                        <input
                                                                            type="number"
                                                                            value={assigned.rate ?? mealDetails.rate ?? ""}
                                                                            onChange={(e) =>
                                                                                handleInputChange(
                                                                                    popupBooking.id,
                                                                                    `${dayName}-${mealName}`,
                                                                                    "rate",
                                                                                    e.target.value === "" ? "" : Number(e.target.value)
                                                                                )
                                                                            }
                                                                            style={{ width: "100%", padding: "5px" }}
                                                                            onWheel={(e) => e.target.blur()}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        ))}
                                </div>
                            )}

                            <div className="modal-actions">
                                <button
                                    className="btn save"
                                    onClick={() => handleAssign(popupBooking)}
                                >
                                    {popupBooking.assignedMenus &&
                                        Object.keys(popupBooking.assignedMenus).length > 0
                                        ? "🔄 Update"
                                        : "💾 Save"}
                                </button>
                                <button
                                    className="btn cancel"
                                    onClick={() => setPopupBooking(null)}
                                >
                                    ❌ Cancel
                                </button>
                            </div>

                        </div>
                    </div>
                )}

            </div>

            <div style={{ marginBottom: "50px" }}></div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
        </div>
    );
};

export default CateringAssign;
