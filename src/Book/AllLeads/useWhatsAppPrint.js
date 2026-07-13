import { useEffect, useState } from "react";
import { doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { db } from "../../firebaseConfig";

export const useWhatsAppPrint = () => {
    const [bookedWhatsappTemplate, setBookedWhatsappTemplate] = useState("");

    useEffect(() => {
        const fetchBookedTemplate = async () => {
            try {
                const ref = doc(db, "whatsappMessages", "Booked");
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    setBookedWhatsappTemplate(snap.data().text || "");
                }
            } catch (e) {
                console.error("Booked WhatsApp template fetch failed", e);
            }
        };

        fetchBookedTemplate();
    }, []);

    const formatDate = (dateStr) => {
        if (!dateStr) return "-";

        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "-";

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();

        return `${day}/${month}/${year}`; // DD/MM/YYYY
    };

    const buildBookedWhatsappMessage = (lead) => {
        if (!bookedWhatsappTemplate) return "";

        let msg = bookedWhatsappTemplate
            .replace("{name}", lead.name || "")
            .replace(
                "{functionDate}",
                lead.functionDate ? formatDate(lead.functionDate) : "-"
            );

        // ✨ cleanup
        msg = msg
            .replace(/\s{2,}/g, " ")
            .replace(/,\s*,/g, ",")
            .replace(/^,\s*/g, "")
            .trim();

        return msg;
    };

    const openWhatsappForCustomer = (lead) => {
        if (!lead?.mobile1) return;

        const phone = lead.mobile1.replace(/\D/g, "");
        const whatsappNumber = phone.startsWith("91") ? phone : `91${phone}`;

        const text = buildBookedWhatsappMessage(lead);
        if (!text) return;

        const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
        window.open(url, "_blank");
    };

    const normalize = (t = "") => t.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "").trim();

    const findCategoryKey = (categories, optionName = "") => {
        const target = normalize(optionName);

        // Exact match
        const exact = Object.keys(categories).find(
            key => normalize(key) === target
        );
        if (exact) return exact;

        // Partial match
        const partial = Object.keys(categories).find(
            key =>
                normalize(key).includes(target) ||
                target.includes(normalize(key))
        );
        if (partial) return partial;

        // Fallback
        return Object.keys(categories)[0];
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

    const generatePrintHTML = (title, subtitle, rate, lead, matchedMenu) => {
        return `
    <html>
    <head>
    <title>${title}</title>
    
    <style>
      body {
          font-family: Calibri, Arial;
          padding: 20px;
          color: black;
      }
    
      h1, h2 {
          margin: 0;
          text-align: center;
      }
    
      .title-box {
          background: #d7f0a3;
          padding: 12px;
          border-radius: 8px;
          text-align: center;
          margin: 20px 0;
          font-size: 22px;
          font-weight: bold;
      }
    
      .category h3 {
          margin: 15px 0 5px;
      }
    
      ul { margin-top: 5px; }
    </style>
    
    </head>
    <body>
    
    
    <div class="title-box">
        ${title.toUpperCase()}
        <div style="font-size:20px; margin-top:5px">${subtitle} — ₹ ${rate}/-</div>
    </div>
    
    <p><strong>Party:</strong> ${lead.name}</p>
    <p><strong>Event:</strong> ${lead.functionType}</p>
    <p><strong>Date:</strong> ${lead.functionDate}</p>
    
    <div style="margin-top:20px">
        ${Object.entries(matchedMenu).map(([cat, items], i) => `
            <div class="category">
                <h3>${i + 1}. ${cat.toUpperCase()}</h3>
                <ul>
                    ${items.map((item, idx) => `<li>${String.fromCharCode(97 + idx)}. ${item.name}</li>`).join("")}
                </ul>
            </div>
        `).join("")}
    </div>
    
    <hr style="margin-top:30px" />
    
    
    </body>
    </html>`;
    };

    const getBreakfastHTML = async (lead) => {
        const day = lead.meals?.Day1?.Breakfast;
        if (!day) return "";

        const optionName = day.option || "";
        const selectedItems = day.selectedItems || [];
        const rate = Number(day.rate) || 0;

        const selectedNorm = selectedItems.map(i => normalize(i));

        const snap = await getDoc(doc(db, "menu", "Breakfast"));
        if (!snap.exists()) return "";

        const categories = snap.data()?.categories || {};

        const key = findCategoryKey(categories, optionName);
        const selectedCategory = categories[key] || {};

        let matchedMenu = {};

        Object.entries(selectedCategory).forEach(([cat, data]) => {
            const all = extractAllMenuItems(data);
            const matched = all.filter(item => {
                const dbName = normalize(item.name);
                return selectedNorm.some(sel => dbName.includes(sel) || sel.includes(dbName));
            });
            if (matched.length) matchedMenu[cat] = matched;
        });

        return generatePrintHTML("BREAKFAST MENU", optionName, rate, lead, matchedMenu);
    };

    const getLunchHTML = async (lead) => {
        const day = lead.meals?.Day1?.Lunch;
        if (!day) return "";

        const selectedItems = day.selectedItems || [];
        const rate = Number(day.rate) || 0;

        const selectedNorm = selectedItems.map(i => normalize(i));

        const snap = await getDoc(doc(db, "menu", "Lunch"));
        if (!snap.exists()) return "";

        const categories = snap.data()?.categories || {};

        const key = findCategoryKey(categories, "Lunch");
        const selectedCategory = categories[key] || {};

        let matchedMenu = {};

        Object.entries(selectedCategory).forEach(([cat, data]) => {
            const all = extractAllMenuItems(data);
            const matched = all.filter(item => {
                const dbName = normalize(item.name);
                return selectedNorm.some(sel => dbName.includes(sel) || sel.includes(dbName));
            });
            if (matched.length) matchedMenu[cat] = matched;
        });

        return generatePrintHTML("LUNCH MENU", "Lunch", rate, lead, matchedMenu);
    };

    const getMealsDinnerHTML = async (lead) => {
        const day = lead.meals?.Day1?.Dinner;
        if (!day) return "";

        const selectedItems = day.selectedItems || [];
        const rate = Number(day.rate) || 0;
        const optionName = day.option || "Dinner";

        const selectedNorm = selectedItems.map(i => normalize(i));

        const snap = await getDoc(doc(db, "menu", "Dinner"));
        if (!snap.exists()) return "";

        const categories = snap.data()?.categories || {};

        const key = findCategoryKey(categories, optionName);
        const selectedCategory = categories[key] || {};

        let matchedMenu = {};

        Object.entries(selectedCategory).forEach(([cat, data]) => {
            const all = extractAllMenuItems(data);
            const matched = all.filter(item => {
                const dbName = normalize(item.name);
                return selectedNorm.some(sel => dbName.includes(sel) || sel.includes(dbName));
            });
            if (matched.length) matchedMenu[cat] = matched;
        });

        return generatePrintHTML("DINNER MENU", optionName, rate, lead, matchedMenu);
    };

    const getDinnerHTML = async (lead) => {
        // const menuName = Object.keys(lead.selectedMenus || {})[0];

        const selectedMenus = lead.selectedMenus && typeof lead.selectedMenus === "object"
            ? lead.selectedMenus
            : {};

        const menuKeys = Object.keys(selectedMenus);
        const menuName = menuKeys.length > 0 ? menuKeys[0] : null;


        if (!menuName) return "";

        const rate = lead.selectedMenus[menuName].rate || 0;
        const selectedItems = lead.selectedMenus[menuName].selectedSubItems || [];

        const selectedNorm = selectedItems.map(i => normalize(i));

        const snap = await getDoc(doc(db, "menu", "Dinner"));
        if (!snap.exists()) return "";

        const categories = snap.data()?.categories || {};

        const key = findCategoryKey(categories, menuName);
        const selectedCategory = categories[key] || {};

        let matchedMenu = {};

        Object.entries(selectedCategory).forEach(([cat, data]) => {
            const all = extractAllMenuItems(data);
            const matched = all.filter(item => {
                const dbName = normalize(item.name);
                return selectedNorm.some(sel => dbName.includes(sel) || sel.includes(dbName));
            });
            if (matched.length) matchedMenu[cat] = matched;
        });

        return generatePrintHTML("DINNER MENU", menuName, rate, lead, matchedMenu);
    };

    const generateBillHTML = async (lead) => {
        let termsList = [];

        try {
            const q = query(collection(db, "usersAccess"), where("accessToApp", "==", "A"));
            const querySnap = await getDocs(q);

            querySnap.forEach(docSnap => {
                const data = docSnap.data();
                if (typeof data.termsAndConditions === "string") {
                    const arr = data.termsAndConditions
                        .split(/\s*\d+\.\s*/)
                        .filter(t => t.trim() !== "");
                    termsList.push(...arr);
                }
            });

        } catch (err) {
            console.error("Error fetching admin terms:", err);
        }

        const termsHTML = termsList.length
            ? termsList.map((t, i) => `<tr><td>${i + 1}</td><td>${t}</td></tr>`).join("")
            : `<tr><td colspan="2">No Terms & Conditions found</td></tr>`;

        // --------------------------------------------------
        // ADD ALL MISSING HELPERS + VARIABLES HERE
        // --------------------------------------------------

        // 🔹 helpers first
        const capitalizeWords = (str = "") =>
            str.replace(/\b\w/g, c => c.toUpperCase());

        // 🔹 selectedMenus FIRST
        const selectedMenus =
            lead.selectedMenus && typeof lead.selectedMenus === "object"
                ? lead.selectedMenus
                : {};

        // 🔹 menuName AFTER selectedMenus
        const menuKeys = Object.keys(selectedMenus);
        const menuName = menuKeys.length > 0 ? menuKeys[0] : null;

        // 🔹 SAFE menu values
        const menuDisplay = menuName ? capitalizeWords(menuName) : "N/A";

        // 🔹 ✅ DEFINE menuRate (THIS WAS MISSING)
        const menuRate =
            menuName && selectedMenus[menuName]
                ? Number(selectedMenus[menuName].rate || 0)
                : 0;

        const fmtDate = (d) => {
            if (!d) return 'N/A';
            const date = d?.toDate ? d.toDate() : new Date(d);
            const utc = date.getTime();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(utc + istOffset);

            const dd = String(istDate.getUTCDate()).padStart(2, '0');
            const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
            const yyyy = istDate.getUTCFullYear();
            return `${dd}-${mm}-${yyyy}`;
        };

        const fmtDateTimeIST = (d) => {
            if (!d) return 'N/A';
            const date = d?.toDate ? d.toDate() : new Date(d);

            const utc = date.getTime();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(utc + istOffset);

            const dd = String(istDate.getUTCDate()).padStart(2, '0');
            const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
            const yyyy = istDate.getUTCFullYear();

            let hh = istDate.getUTCHours();
            const min = String(istDate.getUTCMinutes()).padStart(2, '0');
            const ampm = hh >= 12 ? 'PM' : 'AM';

            hh = hh % 12 || 12;
            hh = String(hh).padStart(2, '0');

            return `${dd}-${mm}-${yyyy}, ${hh}:${min} ${ampm}`;
        };

        // 👉 Required VARIABLES
        const today = fmtDateTimeIST(new Date());
        const bookingDate = fmtDate(lead.enquiryDate);
        const funcDate = fmtDate(lead.functionDate);

        // const menuName = Object.keys(lead.selectedMenus || {})[0] || "N/A";
        const totalAdvance = (lead.advancePayments || []).reduce(
            (sum, p) => sum + (p.amount || 0),
            0
        );

        const amenitiesList = (lead.bookingAmenities || []).map((item, i) => `
    <tr>
      <td></td>
      <td>(${String.fromCharCode(97 + i)}) ${item}</td>
      <td colspan="3">Yes</td>
    </tr>`).join("");

        const customItems = (lead.customItems || []).map((item, i) => `
    <tr>
      <td></td>
      <td>(${String.fromCharCode(97 + i)}) ${item.name}</td>
      <td>${item.qty}</td>
      <td>${item.rate}</td>
      <td>₹${item.total}</td>
    </tr>`).join("");



        const printHTML = `
    <html>
    <head>
        <title>Event Booking Estimate</title>
         <style>
            body {
                font-family: 'Calibri', 'Arial', sans-serif;
                font-size: 11px;
                padding: 20px;
                padding-Top: 10px;
                color: #e10000;
            }
    
            h2 {
                text-align: center;
            }
    
            table {
                width: 100%;
                border-collapse: collapse;
            }
    
            th, td {
                border: 1px solid #e10000;
                padding: 1px 8px;
                vertical-align: top;
                font-size: 12px;
            }
    
            th {
                background-color: #eef6ff;
                font-weight: bold;
                text-align: left;
            }
    
            .highlight {
                background-color: #ffff54;
                font-weight: bold;
            }
    
            .section-header {
                background-color: #eef6ff;
                font-weight: bold;
                text-align: center;
                padding: 3px;
                border: 1px solid #e10000;
                font-size:14px
            }
    
            .terms {
                font-size: 1px;
                color: red;
            }
    
            .terms li {
                padding: 1px 0;
            }
    
            .center {
                text-align: center;
                font-weight: bold;
            }
    
            .right-text {
              text-align: right;
            }
    
            .center-text {
              text-align: center;
            }
    
        </style>
    </head>
    <body>
        <div class="section-header" style="position: relative; text-align: center;">
            Event Booking Estimate
            <span style="position: absolute; right: 10px;">Booked on: ${bookingDate}</span>
        </div>
    
        <table style="font-weight: bold">
            <tr><th>Sl</th><th>Description</th><th colspan="3">Customer Details</th></tr>
            <tr><td>1</td><td>Customer Name</td><td colspan="3">${lead.prefix || ''} ${lead.name || ' '}</td></tr>
            <tr><td>2</td><td>Contact No.</td><td colspan="3">${lead.mobile1}${lead.mobile2 ? ', ' + lead.mobile2 : ''}</td></tr>
            <tr><td>3</td><td>Mail ID</td><td colspan="3">${lead.email || ''}</td></tr>
            <tr><td>4</td><td>Type of Event</td><td class="highlight" colspan="3">${lead.functionType || ''}</td></tr>
            <tr><td>5</td><td>Date of Event</td><td colspan="3">${funcDate}</td></tr>
    <tr>
      <td>6</td>
      <td>Total No. of Guests</td>
      <td colspan="3">
        ${lead.noOfPlates || ''}
        ${lead.extraPlates > 0 ? ` + ${lead.extraPlates} Extra` : ''}
      </td>
    </tr>
            <tr><td>7</td><td>Additional Rooms @ Rs.4000/- + GST</td><td colspan="3">As per custom items</td></tr>
            <tr><td>8</td><td>Food Type</td><td colspan="3">${menuDisplay}</td></tr>
            <tr class="highlight"><td>9</td><td>Start Time: ${lead.startTime
                ? (() => {
                    let [h, m] = lead.startTime.split(":").map(Number);
                    const ampm = h >= 12 ? "PM" : "AM";
                    h = h % 12 || 12;
                    return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
                })()
                : ""
            }
            </td>
            <td colspan="3">
                Finish Time: ${lead.finishTime
                ? (() => {
                    let [h, m] = lead.finishTime.split(":").map(Number);
                    const ampm = h >= 12 ? "PM" : "AM";
                    h = h % 12 || 12;
                    return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
                })()
                : ""
            }
              </td>
            </tr>
    
            <tr><th colspan="5" class="section-header">Total Package Cost</th></tr>
            <tr class="highlight"><td>1</td><td>${lead.venueType} Booking Charge (Complimentary Details as below)</td><td colspan="3">₹ ${lead.hallCharges}</td></tr>
            ${amenitiesList || '<tr><td colspan="5">No complimentary amenities listed</td></tr>'}
    
           ${customItems
                ? `
            <tr>
              <td class="highlight">2</td>
              <td class="highlight">Facilities as Chargeable</td>
              <td class="highlight">Qty</td>
              <td class="highlight">Rate</td>
              <td class="highlight">Total</td>
            </tr>
            ${customItems}
            `
                : ''
            }
    
    
      ${lead.gstAmount ? `
      <tr>
        <td></td>
        <th className="highlight right-text">
          GST: @18% On ₹ ${lead.gstBase || 0}
        </th>
        <th className="highlight" colSpan="3">
          ₹ ${lead.gstAmount || 0}
        </th>
      </tr>
    ` : ''}
    
    
     
            ${lead.note ? `
    <tr>
      <td></td>
      <td colspan="5"><strong>Notes:</strong> ${lead.note}</td>
    </tr>
    ` : ''}
    
    <tr>
      <td class="highlight">3</td>
      <td class="highlight">Food Menu (${menuDisplay} - ₹${menuRate} x (${lead.noOfPlates || ''} + ${lead.extraPlates || '0'} Extra)) = <strong> Total: ₹${(menuRate * ((lead.noOfPlates || 0) + (lead.extraPlates || 0))).toLocaleString("en-IN")}</strong>
     </td>
      
      
            <td colSpan="3">${menuDisplay}</td>
    </tr>
    
          ${lead.meals
                ? Object.entries(lead.meals)
                    .sort(([, a], [, b]) => new Date(a.date || 0) - new Date(b.date || 0))
                    .map(([dayName, dayData]) => {
                        const dayDate = dayData.date
                            ? new Date(dayData.date).toLocaleDateString("en-GB")
                            : null;

                        const mealOrder = ["Breakfast", "Lunch", "Dinner"];

                        return Object.entries(dayData)
                            .filter(([mealName, mealInfo]) => mealName !== "date" && mealInfo && mealInfo.total)
                            .sort(([a], [b]) => mealOrder.indexOf(a) - mealOrder.indexOf(b))
                            .map(([mealName, mealInfo]) => {
                                const formatTime = (timeStr) => {
                                    if (!timeStr) return "";
                                    let [h, m] = timeStr.split(":").map(Number);
                                    const ampm = h >= 12 ? "PM" : "AM";
                                    h = h % 12 || 12;
                                    return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
                                };

                                return `
                                  <tr>
                                    <td></td>
                                    <td colspan="1">
                                      ${mealName} - ${dayDate ? `<span class="highlight">${dayDate}</span>,` : ""}
                                     ${formatTime(mealInfo.startTime)} to ${formatTime(mealInfo.endTime)}
                                    </td>
                                    <td colspan="4">
                                      (${mealInfo.option}) - 
                                      Pax: <span class="highlight">${mealInfo.pax}</span>, 
                                      Rate: ₹<span class="highlight">${mealInfo.rate}</span>
                                    </td>
                                  </tr>
                                `;
                            })
                            .join("");
                    })
                    .join("")
                : ""}
    
            
            ${lead.meals?.Lunch ? `
              <tr><td></td>
                <td><strong>Lunch:</strong>
                  <td colspan="3">
                    Start Time: <span class="highlight">${lead.meals.Lunch.startTime}</span>,
                    Finish Time: <span class="highlight">${lead.meals.Lunch.endTime}</span>,
                    Pax: <span class="highlight">${lead.meals.Lunch.pax}</span>,
                    Rate: ₹<span class="highlight">${lead.meals.Lunch.rate}</span>,
                    Total: ₹<span class="highlight">
                      ${lead.meals.Lunch.pax * lead.meals.Lunch.rate}
                    </span>
                  </td>
                </td>
              </tr>` : ''}
            
            ${lead.meals?.Dinner ? `
              <tr><td></td>
                <td><strong>Dinner:</strong>
                  <td colspan="3">
                    Start Time: <span class="highlight">${lead.meals.Dinner.startTime}</span>,
                    Finish Time: <span class="highlight">${lead.meals.Dinner.endTime}</span>,
                    Pax: <span class="highlight">${lead.meals.Dinner.pax}</span>,
                    Rate: ₹<span class="highlight">${lead.meals.Dinner.rate}</span>,
                    Total: ₹<span class="highlight">
                      ${lead.meals.Dinner.pax * lead.meals.Dinner.rate}
                    </span>
                  </td>
                </td>
              </tr>` : ''}
            
    
            ${Number(lead.discount) > 0 ? `
                <tr>
                  <td></td>
                  <th class="highlight">Discount:</th>
                  <th class="highlight" colspan="3">₹ ${lead.discount}</th>
                </tr>` : ''}
                           
            <tr> <td class="highlight"></td> <td class="highlight" style="text-align:right">Total Estimate</td><td class="highlight" colspan="3"><strong>₹${(lead.grandTotal || 0).toLocaleString()}</strong></td></tr>
    
            <tr>
      <td></td>
      <td class="right-text">Total Paid till ${today}</td>
      <td colSpan="3">
        <strong>₹${totalAdvance.toLocaleString()}</strong>
      </td>
    </tr>
    
    <tr>
      <td colSpan="2" class="highlight right-text">Balance Amount</td>
      <td class="highlight" colSpan="3">
        <strong class="highlight"> ₹${((lead.grandTotal || 0) - totalAdvance).toLocaleString()}</strong>
      </td>
    </tr>
    
        </table>
    
        <div class="section-header">Terms & Conditions</div>
        <table border="1" cellspacing="0" cellpadding="6">
          ${termsHTML}
        </table>
    
    
        <!-- Signature Section -->
        <table style="width:100%; margin-top: 20px; border: none;">
                <tr>
                  <td style="width:50%; text-align:center; border:none; vertical-align:bottom;">
                    _________________________<br>
                    Guest's Signature
                  </td>
                  <td style="width:50%; text-align:center; border:none; vertical-align:bottom;">
                   ${lead?.eventBookedByl || "Sales Team"}<br>
                  _________________________<br>
                    Authorized Signatory<br>
                  </td>
                </tr>
        </table>
        
        </body>
        </html>`;

        return printHTML;
    };

    const sendToWhatsAppPrintCombined = async ({ lead }) => {

        if (!lead) return;

        const sections = [];

        const bill = await generateBillHTML(lead);
        if (bill?.trim()) sections.push(bill);

        const breakfast = await getBreakfastHTML(lead);
        if (breakfast?.trim()) sections.push(breakfast);

        const lunch = await getLunchHTML(lead);
        if (lunch?.trim()) sections.push(lunch);

        const dinner = await getDinnerHTML(lead);
        if (dinner?.trim()) sections.push(dinner);

        const mealsDinner = await getMealsDinnerHTML(lead);
        if (mealsDinner?.trim()) sections.push(mealsDinner);

        if (sections.length === 0) {
            alert("No printable data found");
            return;
        }

        const finalHTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Booking ${lead.name}</title>
</head>
<body>
${sections.join('<div style="page-break-after:always"></div>')}
</body>
</html>`;

        const blob = new Blob([finalHTML], { type: "text/html" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `Booking_${lead.name || "Customer"}.html`;
        a.click();

        URL.revokeObjectURL(url);

        openWhatsappForCustomer(lead);
    };

    return { sendToWhatsAppPrintCombined };
};
