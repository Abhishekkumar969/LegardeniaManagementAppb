import React, { useEffect, useState, useRef } from "react";
import { db } from "../firebaseConfig";
import { collection, onSnapshot, serverTimestamp, doc, setDoc, getDoc } from "firebase/firestore";
import "../styles/VendorTable.css";
import BackButton from "../components/BackButton";

const CateringAssign = () => {
  const [caterings, setCaterings] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [popupBooking, setPopupBooking] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [moneyReceipts, setMoneyReceipts] = useState([]);
  const [showSubitems, setShowSubitems] = useState(null);

  const convertToISTDate = (dateStr) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    // Use toLocaleString with IST timezone
    const options = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" };
    return d.toLocaleDateString("en-GB", options); // returns dd-mm-yyyy
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "catering"), (snap) => {
      let allBookings = [];
      snap.docs.forEach(docSnap => {
        console.log("Month doc:", docSnap.id, docSnap.data()); // <-- check
        const monthData = docSnap.data();
        Object.entries(monthData).forEach(([bookingId, bookingData]) => {
          console.log("Booking:", bookingId, bookingData); // <-- check
          allBookings.push({
            id: bookingId,
            monthYear: docSnap.id,
            ...bookingData
          });
        });
      });
      setCaterings(allBookings);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "moneyReceipts"), (snap) => {
      let allReceipts = [];

      snap.docs.forEach(docSnap => {
        const monthData = docSnap.data(); // nested map: receiptId -> receiptData
        Object.entries(monthData).forEach(([receiptId, receiptData]) => {
          allReceipts.push({
            id: receiptId,
            monthYear: docSnap.id,
            ...receiptData
          });
        });
      });

      setMoneyReceipts(allReceipts);
    });

    return () => unsub();
  }, []);

  const handleInputChange = (bookingId, menuKey, field, value) => {
    setAssignments((prev) => {
      const current = prev[bookingId]?.[menuKey] || popupBooking.assignedMenus?.[menuKey] || popupBooking.customMenuCharges?.[menuKey] || {};
      return {
        ...prev,
        [bookingId]: {
          ...prev[bookingId],
          [menuKey]: {
            ...current,
            [field]: value,
          },
        },
      };
    });
  };

  const handleAssign = async (booking) => {
    try {
      const bookingAssign = assignments[booking.id] || {};

      // Assigned Menus
      const assignedMenus = {};
      Object.entries(booking.assignedMenus || {}).forEach(([menuKey, menuVal]) => {
        const assigned = bookingAssign[menuKey] || {};
        assignedMenus[menuKey] = {
          qty: assigned.qty ?? menuVal.qty ?? 0,
          extQty: assigned.extQty ?? menuVal.extQty ?? 0,
          rate: assigned.rate ?? menuVal.rate ?? 0,
        };
      });

      // Custom Menus
      const customMenuCharges = {};
      Object.entries(booking.customMenuCharges || {}).forEach(([menuKey, menuVal]) => {
        const assigned = bookingAssign[menuKey] || {};
        customMenuCharges[menuKey] = {
          qty: assigned.qty ?? menuVal.qty ?? 0,
          extQty: assigned.extQty ?? menuVal.extQty ?? 0,
          rate: assigned.rate ?? menuVal.rate ?? 0,
        };
      });

      // Meals
      const meals = {};
      Object.entries(booking.meals || {}).forEach(([dayName, dayMeals]) => {
        if (dayName === "No. of days" || dayName === "note") return;

        meals[dayName] = { ...dayMeals }; // keep date

        Object.entries(dayMeals)
          .filter(([mealName]) => mealName !== "date")
          .forEach(([mealName, mealDetails]) => {
            const assignedMeal = bookingAssign[`${dayName}-${mealName}`] || {};
            meals[dayName][mealName] = {
              ...mealDetails,
              pax: assignedMeal.qty ?? mealDetails.pax ?? 0,
              extQty: assignedMeal.extQty ?? mealDetails.extQty ?? 0,
              rate: assignedMeal.rate ?? mealDetails.rate ?? 0,
              total: ((assignedMeal.qty ?? mealDetails.pax ?? 0) + (assignedMeal.extQty ?? mealDetails.extQty ?? 0)) * (assignedMeal.rate ?? mealDetails.rate ?? 0),
            };
          });
      });

      await setDoc(
        doc(db, "catering", booking.monthYear), // month document
        {
          [booking.id]: {
            name: booking.name || "",
            eventDate: booking.eventDate || booking.functionDate || "",
            CateringAssignName: bookingAssign.CateringAssignName ?? booking.CateringAssignName ?? "",
            CateringAssignNumber: bookingAssign.CateringAssignNumber ?? booking.CateringAssignNumber ?? "",
            assignedMenus,
            customMenuCharges,
            meals,
            updatedAt: serverTimestamp(),
          }
        },
        { merge: true } // merge important hai
      );


      setPopupBooking(null);
    } catch (err) {
      console.error("Error assigning catering:", err);
      alert("❌ Failed to assign catering!");
    }
  };

  const filteredBookings = caterings.filter((booking) => {
    const nameMatch = booking.CateringAssignName?.toLowerCase().includes(searchTerm.toLowerCase());

    const formattedDate = booking.eventDate
      ? new Date(booking.eventDate).toLocaleDateString("en-GB")
      : "";

    const formattedDateDashed = formattedDate.replace(/\//g, "-");

    const dateMatch =
      formattedDate.includes(searchTerm) || formattedDateDashed.includes(searchTerm);

    return nameMatch || dateMatch;
  });

  const sortedBookings = [...filteredBookings].sort((a, b) => {
    const dateA = new Date(a.eventDate || 0);
    const dateB = new Date(b.eventDate || 0);
    return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
  });

  function calculateTotalPayOut(data) {
    if (!data) return 0;

    let total = 0;

    if (data.assignedMenus) {
      Object.values(data.assignedMenus).forEach(menu => {
        const qty = Number(menu.qty || 0);
        const ext = Number(menu.extQty || 0);
        const rate = Number(menu.rate || 0);
        total += (qty + ext) * rate;
      });
    }

    if (data.customMenuCharges) {
      Object.values(data.customMenuCharges).forEach(menu => {
        const qty = Number(menu.qty || 0);
        const ext = Number(menu.extQty || 0);
        const rate = Number(menu.rate || 0);
        total += (qty + ext) * rate;
      });
    }

    if (data.meals) {
      Object.values(data.meals).forEach(dayMeals => {
        Object.entries(dayMeals)
          .filter(([mealName]) => mealName !== "date")
          .forEach(([mealName, mealDetails]) => {
            const pax = Number(mealDetails.pax || 0);
            const ext = Number(mealDetails.extQty || 0);
            const rate = Number(mealDetails.rate || 0);
            total += (pax + ext) * rate;
          });
      });
    }

    return total;
  }

  function calculatePaidAmount(cateringName) {
    if (!cateringName) return 0;

    return moneyReceipts
      .filter(
        (receipt) =>
          receipt.particularNature &&
          receipt.particularNature.trim().toLowerCase() ===
          cateringName.trim().toLowerCase()
      )
      .reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
  }

  const groupedBookings = sortedBookings.reduce((acc, booking) => {
    const nameKey = booking.CateringAssignName
      ? booking.CateringAssignName.trim().toLowerCase()
      : "No Catering Assigned";

    if (!acc[nameKey]) {
      acc[nameKey] = {
        name: booking.CateringAssignName || "No Catering Assigned",
        number: booking.CateringAssignNumber || "",
        bookings: []
      };
    }

    acc[nameKey].bookings.push(booking);
    return acc;
  }, {});

  const normalize = (t = "") =>
    t.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "").trim();

  const findCategoryKey = (categories, optionName = "") => {
    const target = normalize(optionName);

    const exact = Object.keys(categories).find(
      key => normalize(key) === target
    );
    if (exact) return exact;

    const partial = Object.keys(categories).find(
      key =>
        normalize(key).includes(target) ||
        target.includes(normalize(key))
    );
    if (partial) return partial;

    return Object.keys(categories)[0];
  };

  const getCategorizedMenuItems = async (booking) => {
    const result = {};
    const mealTypes = ["Breakfast", "Lunch", "Dinner"];

    // 🔥 Cache menu docs (only 3 reads max)
    const menuCache = {};

    for (const type of mealTypes) {
      const snap = await getDoc(doc(db, "menu", type));
      if (snap.exists()) {
        menuCache[type] = snap.data()?.categories || {};
      }
    }

    const processItems = (mealType, selectedItems, categoryKey) => {
      if (!selectedItems?.length) return;

      const categories = menuCache[mealType];
      if (!categories) return;

      const selectedNorm = selectedItems.map(i => normalize(i));
      const key = findCategoryKey(categories, categoryKey);
      const selectedCategory = categories[key] || {};

      const matchedNames = new Set();

      Object.entries(selectedCategory).forEach(([cat, data]) => {
        const all = extractAllMenuItems(data);

        const matched = all.filter(item => {
          const dbName = normalize(item.name);
          return selectedNorm.some(sel =>
            dbName.includes(sel) || sel.includes(dbName)
          );
        });

        if (matched.length) {
          if (!result[mealType]) result[mealType] = {};
          if (!result[mealType][cat]) result[mealType][cat] = [];

          matched.forEach(m => {
            const name = m.name;
            if (!result[mealType][cat].includes(name)) {
              result[mealType][cat].push(name);
            }
            matchedNames.add(normalize(name));
          });
        }
      });

      // 🔥 Handle unmatched
      selectedItems.forEach(item => {
        if (!matchedNames.has(normalize(item))) {
          if (!result[mealType]) result[mealType] = {};
          if (!result[mealType]["Other"]) result[mealType]["Other"] = [];

          if (!result[mealType]["Other"].includes(item)) {
            result[mealType]["Other"].push(item);
          }
        }
      });
    };

    // 1️⃣ AssignedMenus (Dinner)
    if (booking.assignedMenus) {
      Object.entries(booking.assignedMenus).forEach(([menuName, menuData]) => {
        processItems(
          "Dinner",
          menuData.selectedSubItems || [],
          menuName
        );
      });
    }

    // 2️⃣ Meals (Breakfast / Lunch / Dinner)
    if (booking.meals) {
      Object.values(booking.meals).forEach(dayMeals => {
        mealTypes.forEach(mealType => {
          if (!dayMeals[mealType]) return;

          const mealData = dayMeals[mealType];

          processItems(
            mealType,
            mealData.selectedItems || [],
            mealData.option || mealType
          );
        });
      });
    }

    return result;
  };

  const extractAllMenuItems = (obj) => {
    let res = [];
    if (!obj || typeof obj !== "object") return res;

    if (Array.isArray(obj.menuItems)) res.push(...obj.menuItems);

    Object.values(obj).forEach(v => {
      if (v && typeof v === "object") {
        res.push(...extractAllMenuItems(v));
      }
    });

    return res;
  };

  const printBooking = async (booking, group) => {

    const categorizedItems = await getCategorizedMenuItems(booking);

    // Check empty sections
    const hasMenus = booking.assignedMenus && Object.keys(booking.assignedMenus).length > 0;
    const hasCustom = booking.customMenuCharges && Object.keys(booking.customMenuCharges).length > 0;
    const hasMeals = booking.meals && Object.keys(booking.meals).some(d => d !== "No. of days" && d !== "note");

    // Collect all menu items
    // const menuItemsList = hasMenus
    //   ? Object.values(booking.assignedMenus)
    //     .flatMap((m) => m.selectedSubItems || [])
    //   : [];

    // Collect all meal items
    const mealItemsGrouped = {};

    if (hasMeals) {
      Object.entries(booking.meals).forEach(([day, dayMeals]) => {
        if (day === "No. of days" || day === "note") return;

        Object.entries(dayMeals).forEach(([meal, detail]) => {
          if (meal === "date") return;

          if (!mealItemsGrouped[meal]) mealItemsGrouped[meal] = [];

          if (detail.selectedItems && Array.isArray(detail.selectedItems)) {
            detail.selectedItems.forEach((item) => {
              if (!mealItemsGrouped[meal].includes(item)) {
                mealItemsGrouped[meal].push(item);
              }
            });
          }
        });
      });
    }



    const html = `
  <html>
    <head>
      <title>Print – ${booking.venueType}</title>
      <style>
        body { 
          font-family: 'Segoe UI', Arial; 
          padding: 10px; 
          background: #f7f7f7;
        }
        .wrapper {
          background: white;
          padding: 10px;
          border-radius: 12px;
          max-width: 900px;
          margin: auto;
          box-shadow: 0 0 10px rgba(0,0,0,0.15);
        }
        h1 {
          text-align: center;
          font-size: 28px;
          margin-bottom: 25px;
          color: #333;
        }
        .section-title {
          font-size: 20px;
          margin: 25px 0 10px;
          padding-bottom: 5px;
          border-bottom: 2px solid #ddd;
          color: #222;
        }
        .details-box {
          background: #fafafa;
          padding: 10px 15px;
          border-radius: 8px;
          border: 1px solid #eee;
          line-height: 1.6;
        }
        table {
          width: 100%; 
          border-collapse: collapse; 
          margin-top: 10px; 
          margin-bottom: 20px;
        }
        th {
          background: #41dad5ff;
          padding: 10px;
          border: 1px solid #ddd;
          font-size: 14px;
        }
        td {
          padding: 8px;
          border: 1px solid #e3e3e3;
          font-size: 13px;
        }
        .total-box {
          background: #fff8cc;
          padding: 12px;
          border-left: 4px solid #e6b800;
          font-size: 18px;
          font-weight: bold;
          margin-top: 25px;
        }
        .footer {
          margin-top: 30px;
          text-align: center;
          font-size: 12px;
          color: #777;
        }
      </style>
    </head>

    <body>
      <div class="wrapper">

        <h1>🍽 Catering Print Summary</h1>

        <div class="details-box">
          <b>Event Date:</b> ${convertToISTDate(booking.eventDate)} <br/>
          <b>Venue:</b> ${booking.venueType} <br/>
          <b>Function:</b> ${booking.functionType} <br/>
          <b>Catering Partner:</b> ${group.name} <br/>
          <b>Assigned Date:</b> ${convertToISTDate(booking.bookedOn)} <br/>

        </div>

        ${hasMenus ? `
        <div class="section-title">Menus</div>
        <table>
          <tr><th>Menu</th><th>Pax</th><th>Extra</th><th>Rate</th></tr>
          ${Object.entries(booking.assignedMenus).map(([key, val]) => `
            <tr>
              <td>${key}</td>
              <td>${val.qty}</td>
              <td>${val.extQty}</td>
              <td>₹${val.rate}</td>
            </tr>
          `).join("")}
        </table>
        ` : ""}

        ${hasCustom ? `
        <div class="section-title">Custom Items</div>
        <table>
          <tr><th>Item</th><th>Pax</th><th>Extra</th><th>Rate</th></tr>
          ${Object.entries(booking.customMenuCharges).map(([key, val]) => `
            <tr>
              <td>${key}</td>
              <td>${val.qty}</td>
              <td>${val.extQty}</td>
              <td>₹${val.rate}</td>
            </tr>
          `).join("")}
        </table>
        ` : ""}

        ${hasMeals ? `
        <div class="section-title">Meals</div>
        <table>
          <tr><th>Day</th><th>Meal</th><th>Option</th><th>Pax</th><th>Extra</th><th>Rate</th></tr>
          ${Object.entries(booking.meals).map(([day, dayMeals]) => {
      if (day === "No. of days" || day === "note") return "";
      return Object.entries(dayMeals).map(([meal, detail]) => {
        if (meal === "date") return "";
        return `
                <tr>
                  <td>${day} (${convertToISTDate(dayMeals.date)})</td>
                  <td>${meal}</td>
                  <td>${detail.option}</td>
                  <td>${detail.pax}</td>
                  <td>${detail.extQty}</td>
                  <td>₹${detail.rate}</td>
                </tr>
              `;
      }).join("");
    }).join("")}
        </table>
        ` : ""}

${Object.keys(categorizedItems).length > 0 ? `
<div style="margin-top:25px;padding:15px;background:#fff7e1;border-left:5px solid #ffb300;border-radius:8px;">

  <div style="font-size:20px;font-weight:700;margin-bottom:15px;color:#b37500;">
    🍽 Detailed Menu Items
  </div>

  ${Object.entries(categorizedItems).map(([mealType, categories]) => `
    
    <div style="margin-bottom:20px;">
      <div style="font-size:18px;font-weight:600;margin-bottom:8px;">
        ${mealType}
      </div>

      ${Object.entries(categories).map(([cat, items], i) => `
        <div style="margin-bottom:12px;">
          <b>${i + 1}. ${cat}</b>
          <div style="background:#fff;padding:8px;border:1px solid #f0d9a6;border-radius:6px;">
            ${items.map((item, idx) =>
      `${String.fromCharCode(97 + idx)}. ${item}`
    ).join("<br/>")}
          </div>
        </div>
      `).join("")}
    </div>

  `).join("")}

</div>
` : ""}

        <div class="total-box">
        Total Amount: ₹${calculateTotalPayOut(booking).toLocaleString("en-IN")}
        </div>


      </div>
    </body>
  </html>
  `;

    const newWindow = window.open("", "_blank");
    newWindow.document.write(html);
    newWindow.document.close();
    newWindow.print();
  };

  const tableRefs = useRef([]);

  return (
    <div className="page-scroller">
      <div className="vendor-table-container" style={{ padding: "40px 20px" }}>
        <BackButton />
        <h2>Catering Assignment</h2>

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

        <div style={{ paddingBottom: "50px" }}>
          {Object.values(groupedBookings).map((group, gIdx) => {
            // ✅ Calculate total for this catering group
            const groupTotal = group.bookings.reduce((sum, booking) => {
              return sum + calculateTotalPayOut(booking);
            }, 0);
            return (
              <div key={gIdx} className="catering-table-wrapper" style={{ marginBottom: "50px" }}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "15px", // spacing between items
                    marginBottom: "20px",
                  }}
                >
                  <h3
                    style={{
                      fontWeight: "bold",
                      color: "black",
                      margin: 0,
                      flex: "1 1 100%", // full width on small screens
                    }}
                  >
                    {group.name}{" "}
                    {group.number && (
                      <a
                        href={`tel:${group.number}`}
                        style={{ marginLeft: "10px", color: "darkblue", textDecoration: "none" }}
                      >
                        {group.number}
                      </a>
                    )}
                  </h3>

                  <span style={{ fontWeight: "bold", fontSize: "16px" }}>
                    Total: ₹{groupTotal.toLocaleString("en-IN")}
                  </span>
                  <span style={{ fontWeight: "bold", fontSize: "16px" }}>
                    Paid: ₹{calculatePaidAmount(group.name).toLocaleString("en-IN")}
                  </span>
                  <span style={{ fontWeight: "bold", fontSize: "16px" }}>
                    Remaining: ₹{(groupTotal - calculatePaidAmount(group.name)).toLocaleString("en-IN")}
                  </span>
                </div>

                <div
                  ref={el => tableRefs.current[gIdx] = el}
                  style={{
                    overflowX: "auto",
                    whiteSpace: "nowrap",
                  }}
                >
                  <table id={`table-${gIdx}`} className="main-vendor-table">
                    <thead>
                      <tr>
                        <th colSpan={4}></th>
                        <th colSpan={5} style={{ textAlign: "center", backgroundColor: 'orange' }}>Menus</th>
                        <th colSpan={4} style={{ textAlign: "center", backgroundColor: 'gray' }}>Add On Items</th>
                        <th colSpan={6} style={{ textAlign: "center", backgroundColor: '#ff6f88' }}>Meals</th>
                        <th colSpan={4} ></th>
                      </tr>
                    </thead>

                    <thead>
                      <tr>
                        <th>Sl</th>
                        <th onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")} style={{ cursor: "pointer" }} > Event Date {sortOrder === "asc" ? "⬆" : "⬇"} </th>

                        <th>Venue Name</th>
                        <th>Function Type</th>

                        <th style={{ textAlign: "center", backgroundColor: 'orange' }}>Menu Name</th>
                        <th style={{ textAlign: "center", backgroundColor: 'orange' }}>Pax Ordered</th>
                        <th style={{ textAlign: "center", backgroundColor: 'orange' }}>Extra Plate</th>
                        <th style={{ textAlign: "center", backgroundColor: 'orange' }}>Rate</th>
                        <th style={{ textAlign: "center", backgroundColor: 'orange' }}>Items</th>


                        <th style={{ textAlign: "center", backgroundColor: 'gray' }}>Name</th>
                        <th style={{ textAlign: "center", backgroundColor: 'gray' }}>Pax Ordered</th>
                        <th style={{ textAlign: "center", backgroundColor: 'gray' }}>Extra Plate</th>
                        <th style={{ textAlign: "center", backgroundColor: 'gray' }}>Rate</th>


                        <th style={{ textAlign: "center", backgroundColor: '#ff6f88' }}>Name</th>
                        <th style={{ textAlign: "center", backgroundColor: '#ff6f88' }}>Option</th>
                        <th style={{ textAlign: "center", backgroundColor: '#ff6f88' }}>Pax Ordered</th>
                        <th style={{ textAlign: "center", backgroundColor: '#ff6f88' }}>Extra Plate</th>
                        <th style={{ textAlign: "center", backgroundColor: '#ff6f88' }}>Rate</th>
                        <th style={{ textAlign: "center", backgroundColor: '#ff6f88' }}>Items</th>

                        <th style={{ textAlign: "center", backgroundColor: '#35b5c1ff' }}>Print</th>
                        <th style={{ textAlign: "center", backgroundColor: '#3ec135ff' }}>Total Amount</th>
                        <th>Update</th>
                      </tr>

                    </thead>

                    <tbody>
                      {group.bookings.map((booking, idx) => (
                        <tr key={booking.id} >
                          <td>{group.bookings.length - idx}</td>
                          <td>
                            {booking.eventDate
                              ? convertToISTDate(booking.eventDate)
                              : ""}
                          </td>
                          <td>{booking.venueType}</td>
                          <td>{booking.functionType}</td>

                          {/* Menus */}
                          <td>
                            {booking.assignedMenus
                              ? Object.entries(booking.assignedMenus).map(([menuKey], i) => (
                                <div key={i}><b>{menuKey}</b></div>
                              ))
                              : "No menus"}
                          </td>

                          {/* Pax */}
                          <td>
                            {booking.assignedMenus
                              ? Object.entries(booking.assignedMenus).map(([_, menuVal], i) => (
                                <div key={i}>{menuVal.qty}</div>
                              ))
                              : "No menus"}
                          </td>

                          {/* Extra Plate */}
                          <td>
                            {booking.assignedMenus
                              ? Object.entries(booking.assignedMenus).map(([_, menuVal], i) => (
                                <div key={i}>{menuVal.extQty}</div>
                              ))
                              : "No menus"}
                          </td>

                          {/* Rate */}
                          <td>
                            {booking.assignedMenus
                              ? Object.entries(booking.assignedMenus).map(([_, menuVal], i) => (
                                <div key={i}>{menuVal.rate}</div>
                              ))
                              : "No menus"}
                          </td>

                          {/* Items */}
                          <td>
                            {booking.assignedMenus
                              ? Object.entries(booking.assignedMenus).map(([menuKey, menuVal], i) => (
                                <div key={i}>
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
                                </div>
                              ))
                              : "No menus"}
                          </td>

                          {/* customMenuCharges menu name */}
                          <td>
                            {booking.customMenuCharges
                              ? Object.entries(booking.customMenuCharges).map(([menuKey, _], i) => (
                                <div key={i}>{menuKey}</div>
                              ))
                              : "No menus"}
                          </td>

                          {/* customMenuCharges qty */}
                          <td>
                            {booking.customMenuCharges
                              ? Object.entries(booking.customMenuCharges).map(([_, menuVal], i) => (
                                <div key={i}>{menuVal.qty}</div>
                              ))
                              : "No menus"}
                          </td>

                          {/* customMenuCharges extQty */}
                          <td>
                            {booking.customMenuCharges
                              ? Object.entries(booking.customMenuCharges).map(([_, menuVal], i) => (
                                <div key={i}>{menuVal.extQty}</div>
                              ))
                              : "No menus"}
                          </td>

                          {/* customMenuCharges rate */}
                          <td>
                            {booking.customMenuCharges
                              ? Object.entries(booking.customMenuCharges).map(([_, menuVal], i) => (
                                <div key={i}>{menuVal.rate}</div>
                              ))
                              : "No menus"}
                          </td>

                          {/* Meals name */}
                          <td>
                            {booking.meals ? (
                              Object.entries(booking.meals).map(([day, dayMeals]) => {
                                if (day === "No. of days") return null;

                                return (
                                  <div key={day} style={{ marginBottom: "10px" }}>
                                    <strong style={{ borderBottom: "1px dashed red" }}>
                                      {day} ({convertToISTDate(dayMeals.date)})
                                    </strong>

                                    {Object.entries(dayMeals).map(([mealName, mealDetails]) => {
                                      if (mealName === "date") return null;

                                      // ✅ Function to format HH:mm → 12hr AM/PM
                                      const formatTime = (timeStr) => {
                                        if (!timeStr) return "";
                                        const [hours, minutes] = timeStr.split(":");
                                        const d = new Date();
                                        d.setHours(hours, minutes);
                                        return d.toLocaleTimeString("en-US", {
                                          hour: "numeric",
                                          minute: "2-digit",
                                          hour12: true,
                                        });
                                      };

                                      return (
                                        <div key={mealName} style={{ paddingLeft: "10px" }}>
                                          <b style={{ color: "red" }}>{mealName}</b>{" "}
                                          <span style={{ color: "black", fontSize: "12px" }}>
                                            ({formatTime(mealDetails.startTime)} - {formatTime(mealDetails.endTime)})
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })
                            ) : (
                              "No meals"
                            )}
                          </td>

                          <td>
                            {booking.meals ? (
                              Object.entries(booking.meals).map(([day, dayMeals]) => {
                                if (day === "No. of days") return null;
                                return (
                                  <div key={day} style={{ marginBottom: "10px" }}>
                                    <strong style={{ color: 'transparent' }}> - </strong>
                                    {Object.entries(dayMeals).map(([mealName, mealDetails]) => {
                                      if (mealName === "date") return null;
                                      return (
                                        <div key={mealName} style={{ paddingLeft: "10px" }}>
                                          <b>{mealDetails.option}</b>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })
                            ) : (
                              "No meals"
                            )}
                          </td>

                          <td>
                            {booking.meals ? (
                              Object.entries(booking.meals).map(([day, dayMeals]) => {
                                if (day === "No. of days") return null;
                                return (
                                  <div key={day} style={{ marginBottom: "10px" }}>
                                    <strong style={{ color: 'transparent' }}> - </strong>
                                    {Object.entries(dayMeals).map(([mealName, mealDetails]) => {
                                      if (mealName === "date") return null;
                                      return (
                                        <div key={mealName} style={{ paddingLeft: "10px" }}>
                                          Pax: {mealDetails.pax}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })
                            ) : (
                              "No meals"
                            )}
                          </td>

                          <td>
                            {booking.meals ? (
                              Object.entries(booking.meals).map(([day, dayMeals]) => {
                                if (day === "No. of days") return null;
                                return (
                                  <div key={day} style={{ marginBottom: "10px" }}>
                                    <strong style={{ color: 'transparent' }}> - </strong>
                                    {Object.entries(dayMeals).map(([mealName, mealDetails]) => {
                                      if (mealName === "date") return null;
                                      return (
                                        <div key={mealName} style={{ paddingLeft: "10px" }}>
                                          {mealDetails.extQty}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })
                            ) : (
                              "No meals"
                            )}
                          </td>

                          <td>
                            {booking.meals ? (
                              Object.entries(booking.meals).map(([day, dayMeals]) => {
                                if (day === "No. of days") return null;
                                return (
                                  <div key={day} style={{ marginBottom: "10px" }}>
                                    <strong style={{ color: 'transparent' }}> - </strong>

                                    {Object.entries(dayMeals).map(([mealName, mealDetails]) => {
                                      if (mealName === "date") return null;
                                      return (
                                        <div key={mealName} style={{ paddingLeft: "10px" }}>

                                          {mealDetails.rate}    {/* {" "}
                                <b style={{ color: "green" }}>
                                  Total: ₹{mealDetails.total}
                                </b> */}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })
                            ) : (
                              "No meals"
                            )}
                          </td>


                          {/* Meals Items */}
                          <td>
                            {booking.meals ? (
                              Object.entries(booking.meals).map(([day, dayMeals]) => {
                                if (day === "No. of days" || day === "note") return null;

                                return (
                                  <div key={day} style={{ marginBottom: "10px" }}>
                                    <strong style={{ borderBottom: "1px dashed #999" }}>
                                      {day}
                                    </strong>

                                    {Object.entries(dayMeals).map(([mealName, mealDetails]) => {
                                      if (mealName === "date") return null;

                                      const items = mealDetails.selectedItems || [];

                                      return (
                                        <div key={mealName} style={{ paddingLeft: "10px" }}>
                                          <button
                                            className="subitems-btn"
                                            onClick={() =>
                                              setShowSubitems({
                                                menuName: `${day} - ${mealName}`,
                                                items: items,
                                              })
                                            }
                                          >
                                            ({items.length} Items)
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })
                            ) : (
                              "No meals"
                            )}
                          </td>

                          {/* Print */}
                          <td style={{ textAlign: "center", backgroundColor: '#35b5c1ff' }}>
                            <button
                              onClick={() => printBooking(booking, group)}
                              style={{
                                padding: "4px 10px",
                                fontSize: "12px",
                                background: "black",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer"
                              }}
                            >
                              Print
                            </button>
                          </td>

                          {/* Total */}
                          <td style={{ textAlign: "center", backgroundColor: '#3ec135ff', fontWeight: 'bold', fontSize: '16px' }}>₹ {calculateTotalPayOut(booking).toLocaleString("en-IN")}</td>

                          {/* Action */}
                          <td>
                            <button
                              onClick={() => {
                                setAssignments((prev) => ({
                                  ...prev,
                                  [booking.id]: booking.assignedMenus || {},
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
            )
          })}
        </div>

        {popupBooking && (
          <div className="modal-overlay" onClick={() => setPopupBooking(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2 className="modal-title">🍽 Assign Catering</h2>

              {/* Name & Number */}
              <div className="menus-container">
                <h3>Catering Details :</h3>
                <div className="field">
                  <label>Name</label>
                  <input
                    type="text"
                    value={assignments[popupBooking.id]?.CateringAssignName ?? popupBooking.CateringAssignName ?? ""}
                    onChange={(e) =>
                      setAssignments((prev) => ({
                        ...prev,
                        [popupBooking.id]: {
                          ...prev[popupBooking.id],
                          CateringAssignName: e.target.value
                        }
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Number</label>
                  <input
                    type="text"
                    value={assignments[popupBooking.id]?.CateringAssignNumber ?? popupBooking.CateringAssignNumber ?? ""}
                    onChange={(e) =>
                      setAssignments((prev) => ({
                        ...prev,
                        [popupBooking.id]: {
                          ...prev[popupBooking.id],
                          CateringAssignNumber: e.target.value
                        }
                      }))
                    }
                  />
                </div>
              </div>

              {/* Assigned Menus */}
              {popupBooking.assignedMenus && Object.keys(popupBooking.assignedMenus).length > 0 && (
                <div className="menus-container" >
                  <h3>Assigned Menus</h3>
                  {Object.entries(popupBooking.assignedMenus).map(([menuKey, menuVal], i) => {
                    const assigned = assignments[popupBooking.id]?.[menuKey] || menuVal || {};
                    return (
                      <div key={`assigned-${i}`} className="menu-block">
                        <h4 className="menu-name">{menuKey}</h4>
                        <div className="menu-fields">
                          <div className="field">
                            <label>Pax</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={assigned.qty || ""}
                              onChange={(e) =>
                                handleInputChange(
                                  popupBooking.id,
                                  menuKey,
                                  "qty",
                                  e.target.value.replace(/[^0-9]/g, "")
                                )
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Extra Plates</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={assigned.extQty || ""}
                              onChange={(e) =>
                                handleInputChange(
                                  popupBooking.id,
                                  menuKey,
                                  "extQty",
                                  e.target.value.replace(/[^0-9]/g, "")
                                )
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Rate (₹)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={assigned.rate || ""}
                              onChange={(e) => {
                                let val = e.target.value.replace(/[^0-9.]/g, "");
                                if ((val.match(/\./g) || []).length > 1) val = val.slice(0, -1);
                                handleInputChange(popupBooking.id, menuKey, "rate", val);
                              }}
                            />
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

              {/* Custom Menus */}
              {popupBooking.customMenuCharges && Object.keys(popupBooking.customMenuCharges).length > 0 && (
                <div className="menus-container">
                  <h3>Custom Menus</h3>
                  {Object.entries(popupBooking.customMenuCharges).map(([menuKey, menuVal], j) => {
                    const assigned = assignments[popupBooking.id]?.[menuKey] || menuVal || {};
                    return (
                      <div key={`custom-${j}`} className="menu-block">
                        <h4 className="menu-name">{menuKey}</h4>
                        <div className="menu-fields">
                          <div className="field">
                            <label>Pax</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={assigned.qty || ""}
                              onChange={(e) =>
                                handleInputChange(popupBooking.id, menuKey, "qty", e.target.value.replace(/[^0-9]/g, ""))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Extra Plates</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={assigned.extQty || ""}
                              onChange={(e) =>
                                handleInputChange(popupBooking.id, menuKey, "extQty", e.target.value.replace(/[^0-9]/g, ""))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Rate (₹)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={assigned.rate || ""}
                              onChange={(e) => {
                                let val = e.target.value.replace(/[^0-9.]/g, "");
                                if ((val.match(/\./g) || []).length > 1) val = val.slice(0, -1);
                                handleInputChange(popupBooking.id, menuKey, "rate", val);
                              }}
                            />
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

              {popupBooking.meals && Object.keys(popupBooking.meals).length > 0 && (
                <div className="menus-container">
                  <h3>Meals</h3>

                  {Object.entries(popupBooking.meals)
                    .filter(([key]) => key !== "No. of days" && key !== "note")
                    .map(([dayName, dayMeals], dayIdx) => (
                      <div key={dayIdx} className="menu-block">
                        <h4>
                          {dayName} (
                          {dayMeals.date
                            ? new Date(dayMeals.date).toLocaleDateString("en-GB")
                            : ""}
                          )
                        </h4>

                        {/* Meals for that day */}
                        {Object.entries(dayMeals)
                          .filter(([mealName]) => mealName !== "date")
                          .map(([mealName, mealDetails], mealIdx) => {
                            const assigned =
                              assignments[popupBooking.id]?.[`${dayName}-${mealName}`] || {};

                            return (
                              <div
                                key={mealIdx}
                                className="menu-fields"
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "10px",
                                  marginBottom: "15px",
                                  border: "1px solid #ddd",
                                  borderRadius: "5px",
                                  backgroundColor: "#f9f9f9",
                                  padding: "10px",
                                }}
                              >
                                {/* Meal Name and Option */}
                                <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
                                  {mealName} | Option: {mealDetails.option}
                                </div>

                                {/* Pax / Extra Plates / Rate in one row */}
                                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                  <div style={{ flex: "1 1 120px", minWidth: "120px" }}>
                                    <label>Pax</label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={assigned.qty ?? mealDetails.pax ?? ""}
                                      onChange={(e) =>
                                        handleInputChange(
                                          popupBooking.id,
                                          `${dayName}-${mealName}`,
                                          "qty",
                                          e.target.value.replace(/[^0-9]/g, "")
                                        )
                                      }
                                      style={{ width: "100%", padding: "5px" }}
                                    />
                                  </div>

                                  <div style={{ flex: "1 1 120px", minWidth: "120px" }}>
                                    <label>Extra Plates</label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={assigned.extQty ?? ""}
                                      onChange={(e) =>
                                        handleInputChange(
                                          popupBooking.id,
                                          `${dayName}-${mealName}`,
                                          "extQty",
                                          e.target.value.replace(/[^0-9]/g, "")
                                        )
                                      }
                                      style={{ width: "100%", padding: "5px" }}
                                    />
                                  </div>

                                  <div style={{ flex: "1 1 120px", minWidth: "120px" }}>
                                    <label>Rate (₹)</label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={assigned.rate ?? mealDetails.rate ?? ""}
                                      onChange={(e) => {
                                        let val = e.target.value.replace(/[^0-9.]/g, "");
                                        if ((val.match(/\./g) || []).length > 1) val = val.slice(0, -1);
                                        handleInputChange(
                                          popupBooking.id,
                                          `${dayName}-${mealName}`,
                                          "rate",
                                          val
                                        );
                                      }}
                                      style={{ width: "100%", padding: "5px" }}
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

              {/* If nothing */}
              {!(
                (popupBooking.assignedMenus && Object.keys(popupBooking.assignedMenus).length > 0) ||
                (popupBooking.customMenuCharges && Object.keys(popupBooking.customMenuCharges).length > 0)
              ) && <p className="no-menus">No menus available</p>}

              <div className="modal-actions">
                <button className="btn save" onClick={() => handleAssign(popupBooking)}>
                  {(popupBooking.assignedMenus && Object.keys(popupBooking.assignedMenus).length > 0) ||
                    (popupBooking.customMenuCharges && Object.keys(popupBooking.customMenuCharges).length > 0)
                    ? "🔄 Update"
                    : "💾 Save"}
                </button>
                <button className="btn cancel" onClick={() => setPopupBooking(null)}>
                  ❌ Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showSubitems && (
          <div className="subitems-popup-overlay" onClick={() => setShowSubitems(null)}>
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

              <button className="close-btn" onClick={() => setShowSubitems(null)}>
                Close
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default CateringAssign;
