import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";

export const useWhatsAppPrint = () => {
    const [leadWhatsappTemplate, setLeadWhatsappTemplate] = useState("");

    useEffect(() => {
        const fetchLeadTemplate = async () => {
            try {
                const ref = doc(db, "whatsappMessages", "Lead");
                const snap = await getDoc(ref);
                if (snap.exists()) {
                    setLeadWhatsappTemplate(snap.data().text || "");
                }
            } catch (e) {
                console.error("Lead WhatsApp template fetch failed", e);
            }
        };

        fetchLeadTemplate();
    }, []);

    const buildLeadWhatsappMessage = (lead) => {
        if (!leadWhatsappTemplate) return "";

        let msg = leadWhatsappTemplate
            .replace("{name}", lead.name || "")
            .replace(
                "{functionDate}",
                lead.functionDate ? formatDate(lead.functionDate) : "-"
            );

        // clean extra spaces / commas / blank lines
        msg = msg
            .replace(/\s{2,}/g, " ")
            .replace(/,\s*,/g, ",")
            .replace(/^,\s*/g, "")
            .trim();

        return msg;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';

        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';

        // Convert UTC → IST (add 5 hours 30 minutes)
        const utc = date.getTime() + date.getTimezoneOffset() * 60000;
        const ist = new Date(utc + 5.5 * 60 * 60 * 1000);

        const day = String(ist.getDate()).padStart(2, "0");
        const month = String(ist.getMonth() + 1).padStart(2, "0");
        const year = ist.getFullYear();

        return `${day}/${month}/${year}`; // DD-MM-YYYY
    };

    // ✅ 1️⃣ Fetch base menu rates dynamically (Dinner only)
    const fetchBaseRates = async () => {
        try {
            const dinnerRef = doc(db, "menu", "Dinner");
            const dinnerSnap = await getDoc(dinnerRef);
            if (!dinnerSnap.exists()) return {};

            const data = dinnerSnap.data();
            const categories = data.categories || {};
            const baseRates = {};

            // Loop through categories (e.g., Golden Veg, Diamond Veg, etc.)
            for (const [catName, catData] of Object.entries(categories)) {
                if (catData && typeof catData === "object") {
                    const rate = parseFloat(catData.price || catData.rate || 0);
                    if (!isNaN(rate) && rate > 0) {
                        // Normalize for matching
                        baseRates[catName.trim().toLowerCase()] = rate;
                    }
                }
            }

            console.log("✅ Firestore baseRates loaded:", baseRates);
            return baseRates;
        } catch (err) {
            console.error("❌ Error fetching menu base rates:", err);
            return {};
        }
    };

    const openWhatsappForCustomer = async (lead) => {
        try {
            if (!lead?.mobile1) return;

            const text = buildLeadWhatsappMessage(lead);
            if (!text) return;

            const phone = lead.mobile1.replace(/\D/g, "");
            const whatsappNumber = phone.startsWith("91") ? phone : `91${phone}`;

            const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
            window.open(url, "_blank");
        } catch (err) {
            console.error("WhatsApp open failed:", err);
        }
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

    const generateMealPageHTML = (title, subtitle, rate, lead, matchedMenu) => {
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

        return generateMealPageHTML("BREAKFAST MENU", optionName, rate, lead, matchedMenu);
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

        return generateMealPageHTML("LUNCH MENU", "Lunch", rate, lead, matchedMenu);

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

        return generateMealPageHTML("DINNER MENU", optionName, rate, lead, matchedMenu);
    };

    const getDinnerHTML = async (lead) => {
        const selectedMenus = lead.selectedMenus || {};
        const menuNames = Object.keys(selectedMenus);

        if (!menuNames.length) return "";

        const snap = await getDoc(doc(db, "menu", "Dinner"));
        if (!snap.exists()) return "";

        const categories = snap.data()?.categories || {};

        const pages = [];

        for (const menuName of menuNames) {
            const menuData = selectedMenus[menuName];
            if (!menuData) continue;

            const rate = Number(menuData.rate || 0);
            const selectedItems = menuData.selectedSubItems || [];

            if (!selectedItems.length) continue;

            const selectedNorm = selectedItems.map(i => normalize(i));

            const key = findCategoryKey(categories, menuName);
            const selectedCategory = categories[key] || {};

            let matchedMenu = {};

            Object.entries(selectedCategory).forEach(([cat, data]) => {
                const all = extractAllMenuItems(data);
                const matched = all.filter(item => {
                    const dbName = normalize(item.name);
                    return selectedNorm.some(
                        sel => dbName.includes(sel) || sel.includes(dbName)
                    );
                });
                if (matched.length) matchedMenu[cat] = matched;
            });

            if (Object.keys(matchedMenu).length) {
                pages.push(
                    generateMealPageHTML(
                        "DINNER MENU",
                        menuName,   // 👈 Diamond Veg / Golden Veg
                        rate,
                        lead,
                        matchedMenu
                    )
                );
            }
        }

        // 🔥 return ALL dinner menu pages
        return pages.join("");
    };

    const getEstimateHTML = async (lead) => {
        const baseRates = await fetchBaseRates(); // fetch first

        const amenitiesList = (lead.bookingAmenities || [])
            .map(item => `<li style="padding-left:40px">☑ ${item}</li>`)
            .join("");

        const selectedMenus = lead.menuSummaries || [];
        const hall = parseFloat(lead.hallCharges || 0);
        const gstPerMenu = (menu) => {
            const base = parseFloat(menu.gstBase);
            return !isNaN(base) ? (base * 0.18).toFixed(0) : '0';
        };

        // ✅ Generate menu rows with STRIKE logic fixed
        const menuRows = selectedMenus.map(menu => {
            const menuName = (menu.menuName || "").trim();
            const menuData = lead.selectedMenus?.[menuName] || {};
            const customRate = Number(menuData.rate || 0);

            // 🔍 Match base rate ignoring case + trim
            const baseRate =
                baseRates[menuName.toLowerCase()] ??
                baseRates[menuName.replace(/\s+/g, " ").trim().toLowerCase()] ??
                0;

            // ✅ Apply cut only if baseRate exists and customRate is less than baseRate
            const showStrike =
                baseRate > 0 && Math.round(customRate) < Math.round(baseRate);

            return `
      <li style="display:flex; justify-content:space-between;padding-left:40px;align-items:center;margin-bottom:4px;">
        <span style="flex:1;">• ${menuName} :</span>
        <div style="display:flex;gap:10px;flex:2;justify-content:flex-end;align-items:flex-end;">
          
          <!-- Rate Column -->
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="font-size:12px;margin-bottom:2px;">Rate</div>
            <div style="border-bottom:1px solid #000;width:100px;text-align:center;color:red;">
              ₹ ${showStrike
                    ? `<span style="text-decoration: line-through;">${baseRate.toLocaleString("en-IN")}</span>
                     <span style="font-weight:bold;">${customRate.toLocaleString("en-IN")}</span>`
                    : customRate.toLocaleString("en-IN")
                }
            </div>
          </div>

          <span>X</span>

          <!-- Pax -->
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="font-size:12px;margin-bottom:2px;">Pax</div>
            <div style="border-bottom:1px solid #000;width:80px;text-align:center;color:red;">
              ${menuData.extraPlates && Number(menuData.extraPlates) > 0
                    ? `${Number(menuData.noOfPlates || 0)} + ${Number(menuData.extraPlates)}`
                    : `${Number(menuData.noOfPlates || 0)}`
                }
            </div>
          </div>

          <span>=</span>

          <!-- Total -->
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="font-size:12px;margin-bottom:2px;">Menu Total</div>
            <div style="border-bottom:1px solid #000;width:80px;text-align:center;background-color:yellow;color:red;">
              ₹ ${Number(menu.menuTotal || 0).toLocaleString("en-IN")}
            </div>
          </div>
        </div>
      </li>`;
        }).join("");


        let grandMealTotal = 0; // ⬅️ move outside so it can be used later

        const mealRows = (lead.meals && Object.keys(lead.meals).length > 0) ? (() => {

            const rows = Object.entries(lead.meals)
                .filter(([dayName, dayData]) =>
                    Object.entries(dayData).some(
                        ([mealName, mealInfo]) => mealName !== "date" && mealInfo?.total
                    )
                )
                .sort(([a], [b]) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")))
                .map(([dayName, dayData]) => {
                    const dayDate = dayData.date
                        ? new Date(dayData.date).toLocaleDateString("en-GB")
                        : "No date";

                    return `
        <li style="margin-bottom:15px; padding-left:40px;">
          <strong>${dayName} (${dayDate})</strong>
          <div style="display:flex; flex-direction:column; margin-top:5px; gap:5px;">
            ${Object.entries(dayData)
                            .filter(([mealName]) => mealName !== "date")
                            .map(([mealName, mealInfo]) => {
                                grandMealTotal += mealInfo?.total || 0; // add to grand total
                                return `
                  <div style="display:flex; justify-content:space-between; padding-left:10px;">
                    <div style="flex:1;">${mealName} <span style="color:red"> (${mealInfo.option}) </span> </div>
                    <div style="flex:1;">Rate: <span style="border-bottom: 1px solid #000; color:red">₹${mealInfo.rate}</span> 
                      X Pax: <span style="border-bottom: 1px solid #000; color:red">${mealInfo.pax}</span>
                    </div>
                  </div>`;
                            })
                            .join("")}
          </div>
        </li>`;
                }).join("");

            // Append grand total at the end, right-aligned with background only on amount
            return rows + `
<li style="padding: 0px; text-align:right; font-weight:bold; color:red">
  <span style="background-color:yellow; padding: 2px 8px; border-radius:4px; border-bottom: 1px solid #000">
    Meal Total: ₹${grandMealTotal}
  </span>
</li>`;

        })()
            : "";

        const mealSection = mealRows && mealRows.trim()
            ? `
            <div class="section">
              <strong>3. Meal Selected</strong>
              <ul>
                ${mealRows}
              </ul>
            </div>
          `
            : '';

        const gstSectionNumber = mealSection ? 4 : 3;

        // ✅ GST section ko conditional banao
        const gstSection =
            lead.gstBase && Number(lead.gstBase) > 0
                ? `
    <div class="section">
      <div style="display: flex; justify-content: space-between;">
        <strong>${gstSectionNumber}. GST on 
          <span style="color:red"> ₹ ${Number(lead.gstBase).toLocaleString('en-IN')}</span> @18%
        </strong>
        <strong style="background-color:yellow; color:red; border-bottom: 1px solid #000">
          ₹ ${Number(lead.gstAmount || 0).toLocaleString('en-IN')}
        </strong>
      </div>
    </div>`
                : ""; // ❌ show hi mat karo agar gstBase 0 hai

        // ✅ Grand total line me +GST hata diya
        const grandTotalLines = selectedMenus.map(menu => {
            const gst = gstPerMenu(menu);
            const total = hall + Number(menu.menuTotal) + Number(gst) + grandMealTotal;

            // agar meals section hai to text me "+ Meals" add karna hai
            const mealsText = mealSection ? " + Meals" : "";

            // agar GST hai to text me "+ GST" add karna hai
            const gstText = lead.gstBase && Number(lead.gstBase) > 0 ? " + GST" : "";

            return `
    <div style="display: flex; justify-content: space-between; margin-top: 4px">
        <span><strong>Grand Total 
          <span style="font-size:14px"> ( Venue Charges + ${menu.menuName} ${gstText} ${mealsText} ) </span> :
        </strong></span>
        <div style="border-bottom: 1px solid #000; width: 180px; text-align: center; background-color:yellow; font-weight:bold; color:red">
        ₹ ${Number(total).toLocaleString('en-IN')}
        </div>
    </div>`;
        }).join("");

        // Calculate strike price HTML
        const strikePriceHTML =
            lead.strikeHallCharges &&
                lead.hallCharges &&
                Number(lead.hallCharges) < Number(lead.strikeHallCharges)
                ? `<span style="text-decoration: line-through; color: #888; margin-right: 6px;">
                 ₹${Number(lead.strikeHallCharges).toLocaleString("en-IN")}
               </span>`
                : "";

        // Venue charges section for HTML
        const venueChargesHTML = `
        <div class="section">
          <div style="display: flex; justify-content: space-between;">
            <strong>1. Venue Charges - <span style="color:red" > ${lead.venueType} </span> :</strong>
            <div style="border-bottom: 1px solid #000; text-align: center;">
              ${strikePriceHTML}<span style="color:red ; font-weight:bold; background-color:yellow" >₹${Number(lead.hallCharges || 0).toLocaleString("en-IN")}</span>
            </div>
          </div>
          <ul>${amenitiesList}</ul>
        </div>
        `;
        return `
    <div class="print-page estimate-page">

      <h2>BOOKING ESTIMATE</h2>

     <div class="border-box" style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px;">
  
  <!-- Left Column -->
  <div style="flex: 1; min-width: 250px;">
    <div class="info-row">
      <span class="label">Name:</span>
      ${lead.prefix ? lead.prefix + ' ' : ''}${lead.name || '________'}
    </div>
    <div class="info-row">
      <span class="label">Mobile:</span>
      ${lead.mobile1
                ? lead.mobile1 + (lead.mobile2 ? ', ' + lead.mobile2 : '')
                : '________'
            }
    </div>
    <div class="info-row">
      <span class="label">Function Type:</span>
      ${lead.functionType || '________'}
    </div>
  </div>

  <!-- Right Column -->
  <div style="flex: 1; min-width: 250px;">
    <div class="info-row">
      <span class="label">Nos. of Pax:</span>
      ${lead.noOfPlates || '________'}
    </div>
    <div class="info-row">
      <span class="label">Date of Function:</span>
      ${lead.functionDate
                ? formatDate(lead.functionDate)
                : '________'}
    </div>
    <div class="info-row">
      <span class="label">Date of Enquiry:</span>
      ${lead.enquiryDate ? formatDate(lead.enquiryDate) : '-'}
    </div>
  </div>

       </div>

      <div class="section">
        ${venueChargesHTML}
      </div>

      <div class="section">
        <strong>2. Food Menu Selection</strong>
        <ul>${menuRows}</ul>
      </div>

      ${mealSection || ""}

      ${gstSection || ""}

      <div class="section">${grandTotalLines}</div>

      <div class="section" style="margin-top:30px;">
        <div>${lead?.authorisedSignatoryh || "Sales Team"}</div>
        <div style="border-bottom:1px solid #000;width:200px;"></div>
        <div>Authorised Signature</div>
      </div>

    </div>
  `;
    };

    const MASTER_STYLE = `
    <style>
      @page { size: A4; }
    
    body {
      font-family: Arial;
      line-height: 1.4;
      color:#00054b;
      padding: 0px;
    }
    
    /* ✅ Sirf estimate page ke liye */
    .estimate-page {
      height: 92%;
      border: 2px solid red;
      padding: 30px;
    }

  h2 {
    text-align:center;
    color:red;
    font-weight:bold;
    text-decoration:underline;
    font-size:24px;
  }

  .section { margin-top:15px; }

  .border-box {
    border:2px solid red;
    padding:10px;
    margin-bottom:10px;
    color:red;
  }

  ul { list-style:none; padding:0; }
  li { margin-bottom:6px; }

  .print-page {
    page-break-after: always;
  }

  .print-page:last-child {
    page-break-after: auto;
  }
</style>
    `;

    const sendToWhatsAppPrintCombined = async (lead) => {
        try {
            if (!lead) return;

            const sections = [];

            const estimate = await getEstimateHTML(lead);
            if (estimate?.trim()) sections.push(estimate);

            if (lead.meals?.Day1?.Breakfast) {
                const b = await getBreakfastHTML(lead);
                if (b) sections.push(b);
            }

            if (lead.meals?.Day1?.Lunch) {
                const l = await getLunchHTML(lead);
                if (l) sections.push(l);
            }

            let dinnerHTML = "";
            if (lead.meals?.Day1?.Dinner) {
                dinnerHTML = await getMealsDinnerHTML(lead);
            } else if (lead.selectedMenus && Object.keys(lead.selectedMenus).length) {
                dinnerHTML = await getDinnerHTML(lead);
            }
            if (dinnerHTML) sections.push(dinnerHTML);

            if (!sections.length) {
                alert("No printable data found");
                return;
            }

            const finalHTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Booking_${lead.name || "Customer"}</title>
${MASTER_STYLE}
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
        } catch (err) {
            console.error("WhatsApp print failed:", err);
            alert("Failed to generate WhatsApp print");
        }
    };

    return { sendToWhatsAppPrintCombined };

};
