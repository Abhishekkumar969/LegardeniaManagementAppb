import React, { useEffect, useState, useCallback, useRef } from 'react';
import { collection, onSnapshot, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from '../firebaseConfig';
import '../styles/MoneyReceipts.css';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { getAuth } from "firebase/auth";
import BackButton from "../components/BackButton";
import BottomNavigationBar from "../components/BottomNavigationBar";
import Pagination from "../components/Pagination";
import { printHtmlContent } from "../utils/printHelper";

export const formatIST = (date, withTime = false) => {
  if (!date) return "";

  const options = {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  };

  if (withTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }

  return new Date(date).toLocaleString("en-GB", options);
};

export const getInitials = (name) => {
  if (!name) return "";
  return name.split(/[\s-]+/).filter(Boolean).map(word => word.charAt(0).toUpperCase()).join('');
};

const MoneyReceipts = () => {
  const navigate = useNavigate();
  const [receipts, setReceipts] = useState([]);
  const [search, setSearch] = useState('');
  const location = useLocation();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedFY, setSelectedFY] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [userAppType, setUserAppType] = useState(null);
  const [bankNames, setBankNames] = useState([]);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [sortKey, setSortKey] = useState("receiptDate");
  const [typeFilter, setTypeFilter] = useState([]);
  const [modeFilter, setModeFilter] = useState([]);
  const [creditDebitFilter, setCreditDebitFilter] = useState([]);
  const [cashToFilter, setCashToFilter] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const numberToWords = (num) => {
    const a = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
      'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
      'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (n) => {
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + ' ' + a[n % 10];
      if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred ' + inWords(n % 100);
      if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand ' + inWords(n % 1000);
      if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh ' + inWords(n % 100000);
      return inWords(Math.floor(n / 10000000)) + ' Crore ' + inWords(n % 10000000);
    };

    return num ? inWords(num).trim() + ' Only' : '';
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const fetchBankNames = async () => {
      try {
        const ref = doc(db, "accountant", "BankNames");
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();
          setBankNames(data.banks || []);
        }
      } catch (err) {
        console.error("Error fetching banks:", err);
      }
    };

    fetchBankNames();
  }, []);

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

  useEffect(() => {
    const q = collection(db, "moneyReceipts");

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let allReceipts = [];

        snapshot.docs.forEach((docSnap) => {
          const monthYear = docSnap.id; // e.g. "Sep2025"
          const data = docSnap.data();

          Object.entries(data).forEach(([receiptId, receipt]) => {
            allReceipts.push({
              id: receiptId,
              monthYear,
              ...receipt,
            });
          });
        });

        const sorted = allReceipts.sort((a, b) => {

          const aDate = a.receiptDate ? new Date(a.receiptDate).getTime() : 0;
          const bDate = b.receiptDate ? new Date(b.receiptDate).getTime() : 0;

          // 1️⃣ Date comparison first
          if (aDate !== bDate) {
            return sortOrder === "asc"
              ? aDate - bDate
              : bDate - aDate;
          }

          // 2️⃣ Extract only digits from slNo
          const extractNumber = (value) => {
            if (!value) return 0;
            const digits = value.toString().match(/\d+/g); // get all digit groups
            return digits ? parseInt(digits.join(""), 10) : 0;
          };

          const aNum = extractNumber(a.slNo);
          const bNum = extractNumber(b.slNo);

          return sortOrder === "asc"
            ? aNum - bNum
            : bNum - aNum;
        });

        setReceipts(sorted);
      },
      (error) => {
        console.error("Error fetching receipts:", error);
      }
    );

    return () => unsubscribe();
  }, [sortOrder]);

  useEffect(() => {
    if (receipts.length) {
      const years = new Set();

      receipts.forEach(r => {
        if (r.receiptDate) { // Use receiptDate instead of eventDate
          const date = new Date(r.receiptDate);
          const month = date.getMonth() + 1; // Jan = 0
          // FY calculation: April to March
          const fy = month >= 4
            ? `${date.getFullYear()}-${date.getFullYear() + 1}`
            : `${date.getFullYear() - 1}-${date.getFullYear()}`;
          years.add(fy);
        }
      });

      // Sort descending (latest FY first)
      setFinancialYears([...years].sort((a, b) => {
        const [aStart] = a.split('-').map(Number);
        const [bStart] = b.split('-').map(Number);
        return aStart - bStart;
      }));
    }
  }, [receipts]);

  const finalReceipts = React.useMemo(() => {
    let result = receipts;

    // 🔍 Search
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      result = result.filter(r => {
        const combined = `${r.customerName || ""} ${r.partyName || ""} ${r.mobile || ""} ${r.slNo || ""} ${r.type || ""} ${r.particularNature || ""} ${r.description || ""} ${r.amount || ""} ${r.receiptDate || ""}`.toLowerCase();
        return combined.includes(s);
      });
    }

    // Receipt type
    if (typeFilter.length > 0 && !typeFilter.includes('All')) {
      result = result.filter(r =>
        typeFilter.some(type =>
          (type === 'Cash' && r.type === 'Cash') ||
          (type === 'Bank' && r.type === 'Money Receipt') ||
          (type === 'Voucher' && r.type === 'Voucher') ||
          (type === 'Refund' && r.paymentFor === 'Refund') ||
          (type === 'BankCash' && (r.type === 'Cash' || r.type === 'Money Receipt'))
        )
      );
    }

    // Mode filter
    if (modeFilter.length > 0 && !modeFilter.includes('All')) {
      result = result.filter(r =>
        modeFilter.includes(r.mode)
      );
    }

    // Cash To
    if (cashToFilter.length > 0) {
      result = result.filter(r =>
        cashToFilter.includes(r.cashTo)
      );
    }

    // Date range
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo) : null;

      result = result.filter(r => {
        if (!r.receiptDate) return true;
        const d = new Date(r.receiptDate);
        return (!from || d >= from) && (!to || d <= to);
      });
    }

    // Financial year
    if (selectedFY) {
      const [start, end] = selectedFY.split('-').map(Number);
      const fyStart = new Date(start, 3, 1);
      const fyEnd = new Date(end, 2, 31, 23, 59, 59);

      result = result.filter(r => {
        if (!r.receiptDate) return true;
        const d = new Date(r.receiptDate);
        return d >= fyStart && d <= fyEnd;
      });
    }

    // Credit / Debit
    if (creditDebitFilter.length > 0 && !creditDebitFilter.includes("All")) {
      result = result.filter(r =>
        creditDebitFilter.includes(r.paymentFor)
      );
    }

    return result;
  }, [
    receipts,
    debouncedSearch,
    typeFilter,
    modeFilter,
    cashToFilter,
    dateFrom,
    dateTo,
    selectedFY,
    creditDebitFilter,
  ]);

  const cashToOptions = React.useMemo(() => {
    const set = new Set();

    receipts.forEach(r => {
      if (r.mode === "Cash" && r.cashTo) {
        set.add(r.cashTo);
      }
    });

    return Array.from(set);
  }, [receipts]);

  const formatDate = (date) => formatIST(date).replace(/\//g, "-");

  const getDisplayName = (receipt) => {
    return (receipt.customerPrefix || '') + ' ' +
      (receipt.customerName || receipt.partyName || '-');
  };

  const getReceiptRankText = useCallback((receipt) => {
    if (!receipt.mobile) return '';

    const getISTDate = (dStr) => {
      if (!dStr) return "";
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return String(dStr).trim().substring(0, 10);
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(d);
    };

    const targetDate = getISTDate(receipt.eventDate);

    const sameEventReceipts = receipts.filter(r => r.mobile === receipt.mobile && getISTDate(r.eventDate) === targetDate);

    sameEventReceipts.sort((a, b) => {
      const dateA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
      const dateB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
      return dateA - dateB;
    });

    const index = sameEventReceipts.findIndex(r => r.id === receipt.id);
    if (index === -1) return '';

    const rank = index + 1;
    if (rank === 1) return 'New(1st)';
    if (rank === 2) return '2nd';
    if (rank === 3) return '3rd';
    return `${rank}th`;
  }, [receipts]);

  const fetchVenueType = async (receipt) => {
    if (!receipt) return "";
    try {
      const mobile = receipt.mobile || "";
      const eventType = receipt.eventType || "";
      const eventDate = receipt.eventDate || "";

      const snap = await getDocs(collection(db, "prebookings"));
      let foundVenue = "";

      snap.docs.forEach(docSnap => {
        Object.values(docSnap.data()).forEach(data => {
          if (typeof data !== 'object' || !data) return;

          let m1 = String(data.mobile1 || "").replace(/\D/g, "");
          let m2 = String(data.mobile2 || "").replace(/\D/g, "");
          let mobileStr = String(mobile).replace(/\D/g, "");

          if (m1.length > 10) m1 = m1.slice(-10);
          if (m2.length > 10) m2 = m2.slice(-10);
          if (mobileStr.length > 10) mobileStr = mobileStr.slice(-10);

          const mobileMatch = (mobileStr.length >= 10 && (m1 === mobileStr || m2 === mobileStr));

          if (mobileMatch) {
            const bEvent = String(data.functionType || data.eventType || "").trim().toLowerCase();
            const rEvent = String(eventType || "").trim().toLowerCase();

            const getISTDate = (dStr) => {
              if (!dStr) return "";
              const d = new Date(dStr);
              if (isNaN(d.getTime())) return String(dStr).trim().substring(0, 10);
              return new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
              }).format(d);
            };

            const bDate = getISTDate(data.functionDate || data.eventDate);
            const rDate = getISTDate(eventDate);

            if (bEvent === rEvent && bDate === rDate) {
              if (data.venueType || data.venue) {
                foundVenue = data.venueType || data.venue;
              }
            }
          }
        });
      });
      return foundVenue || "";
    } catch (err) {
      console.error("Error fetching venue type:", err);
      return "";
    }
  };

  const handlePrint = useCallback(async (receipt) => {
    let firmName = "firmName";
    let address = "address";
    let contactNo = "contactNo";

    try {
      const q = query(collection(db, "usersAccess"), where("accessToApp", "==", "A"));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // Find the first document with accessToApp == "A"
        const data = snapshot.docs[0].data();
        firmName = data.firmName || firmName;
        address = data.address || address;
        contactNo = data.contactNo || contactNo;
      }
    } catch (err) {
      console.error("Error fetching firm info from admin user:", err);
    }

    const partyName = getDisplayName(receipt).trim();
    const venueType = await fetchVenueType(receipt);
    const eventDisplay = receipt.eventType || '-';
    // const rankText = getReceiptRankText(receipt);
    // const rankHtml = rankText ? `<div style="position: absolute; top: 10px; left: 15px; font-weight: bold; font-size: 16px; color: maroon;">${rankText}</div>` : '';

    const content = `
  <html>
  <head>
    <title>Receipt - #${receipt.slNo}</title>
    <style>
      body {
        font-family: 'Calibri', sans-serif;
        color: #070162ff;
        font-size: 20px;
        padding: 0px;
      }
      .header-title {
        text-align: center;
        font-weight: bold;
        font-size: 19px;
        color: white;
        background-color: maroon;
        padding: 5px 15px;
        width: fit-content;
        margin: 0 auto;
        border-radius: 6px;
      }
      .main-title {
        text-align: center;
        font-size: 38px;
        font-weight: bold;
        margin-top: 5px;
       color: #070162ff;;
      }
      .sub-header {
        text-align: center;
        font-size: 15px;
        margin: 1px 0;
      }
      .line-group {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
      }
      .section {
        margin: 10px 0;
        display: flex;
        gap: 8px;
      }
      .underline {
        flex-grow: 1;
        border-bottom: 1px dotted #000e3cff;
        min-width: 150px;
      }
      .short-underline {
        display: inline-block;
        border-bottom: 1px dotted #000e3cff;
        min-width: 100px;
      }

      .payment-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 30px;
      }

      .payment-table {
        border: 1px solid maroon;
        border-collapse: collapse;
        font-size: 18px;
      }
      .payment-table th {
        border: 1px solid maroon;
        padding: 2px 8px;
        text-align: center;
        min-width: 80px;
        background-color: maroon;
        color: white;
      }
      .payment-table td {
        border: 1px solid maroon;
        padding: 2px 8px;
        text-align: center;
        min-width: 80px;
      }

      .rs-combo {
        display: flex;
        align-items: center;
      }

      .circle-rs {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: transparent;
        color: #000e3cff;
        font-size: 30px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .bramount-box {
        border: 1px solid maroon;
        border: 1px solid maroon;
        padding: 1px 1px;
        font-weight: bold;
        min-width: 100px;
        font-size: 14px;
      }
      .amount-box {
        border: 1px solid maroon;
        border: 1px solid maroon;
        padding: 6px 14px;
        font-weight: bold;
        min-width: 100px;
        font-size: 30px;
      }

      .signature {
        font-weight: bold;
        font-size: 18px;
        text-align: right;
        margin-top: 20px;
      }
          .italic {
    font-style: italic;
  }
    </style>
  </head>
  <body>
   <div style="border: 1px solid maroon; padding: 1px">
    <div style="border: 1px solid maroon; padding: 30px; position: relative;">
    <div class="header-title">MONEY RECEIPT</div>
  <div class="main-title">${firmName}</div>
      <div class="sub-header">${address}</div>
      <div class="sub-header">${contactNo}</div>
      
    <div class="line-group">
      <div>No. <span>${receipt.slNo}</span></div>
      <div>Date <span class="short-underline">${formatIST(receipt.receiptDate)}</span></div>
    </div>

    <div class="section italic">Received with thanks from <div class="underline" style="color: maroon; font-weight: bold;"> <span style="font-weight: 800"> ${partyName} </span> </div></div>
    <div class="section italic "><span>Mob.:</span><div class="underline" style="color: maroon; font-weight: bold;">${receipt.mobile || '-'}</div></div>
    <div class="section italic ">a sum of Rs. <div class="underline" style="color: maroon; font-weight: bold;">₹${numberToWords(Number(receipt.amount || 0))}</div></div>
    <div class="section italic ">
      for event of <div class="underline" style="color: maroon; font-weight: bold;">${eventDisplay}  <span style="background-color: yellow;">
    ${venueType ? ` - ${venueType}` : ''}
  </span> </div>
      <span style="margin-left:auto;">Dated <span class="short-underline" style="color: maroon; font-weight: bold;">${formatIST(receipt.eventDate)}</span></span>
    </div>

    <div class="payment-row">
      <!-- LEFT PAYMENT MODE TABLE -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <table class="payment-table">
          <tr><th colspan="2">Payment Mode</th></tr>
          <tr>
            <td class="italic ">${receipt.mode === 'Cash' ? '☑️ Cash' : 'Cash'}${receipt.cashTo && receipt.cashTo.toLowerCase() !== 'cash' ? ` (${getInitials(receipt.cashTo)})` : ''}</td>
            <td className="italic">
${receipt.mode !== 'Cash' && (receipt.bankMode === 'RTGS/NEFT' || !receipt.bankMode) ? '☑️ RTGS/NEFT' : 'RTGS/NEFT'}
            </td>
          </tr>
          <tr>
            <td class="italic ">${receipt.mode !== 'Cash' && receipt.bankMode === 'Cheque' ? '☑️ Cheque' : 'Cheque'}</td>
            <td class="italic ">${receipt.mode !== 'Cash' && receipt.bankMode === 'Card' ? '☑️ Card' : 'Card'}</td>
          </tr>
          <tr>
            <td colspan="2" class="italic ">${receipt.mode !== 'Cash' && receipt.bankMode === 'UPI' ? '☑️ UPI' : 'UPI'}</td>
          </tr>
        </table>
        ${receipt.mode !== 'Cash' && receipt.bankMode === 'Cheque' && receipt.chequeNo ? `<div style="font-size: 15px; font-weight: bold; color: maroon;">Cheque No: ${receipt.chequeNo}</div>` : ''}
      </div>

      <!-- MIDDLE ₹ SYMBOL + AMOUNT IN BOX -->
      <div class="rs-combo">
       <div class="bramount-box"> <div class="amount-box">₹ ${Number(receipt.amount || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    })} </div> </div>
      </div>

      <!-- RIGHT SIGNATURE -->
      <div class="signature" style="display: flex; flex-direction: column; align-items: center; margin-top: 0px;">
        <div style="font-size: 14px; font-weight: normal; margin-bottom: 5px;">Issued By:</div>
        <div style="color: maroon;">${receipt.receiverd || receipt.senderd || 'Accounts Dept.'}</div>
      </div>
      </div>
     </div>
    </div>
  </body>
  </html>
  `;

    printHtmlContent(content);
  }, []);

  const handlePrintCash = useCallback(async (receipt) => {

    const partyName = getDisplayName(receipt).trim();

    const venueType = await fetchVenueType(receipt);
    const eventDisplay = receipt.eventType || '-';

    const rankText = getReceiptRankText(receipt);
    const rankHtml = rankText ? `<div style="position: absolute; top: 10px; left: 15px; font-weight: bold; font-size: 16px; color: maroon;">${rankText}</div>` : '';

    const content = `
  <html>
  <head>
    <title>Receipt - #${receipt.slNo}</title>
    <style>
      body {
        font-family: 'Calibri', sans-serif;
        color: #000e3cff;
        font-size: 20px;
        padding: 0px;
      }
      .header-title {
        text-align: center;
        font-weight: bold;
        font-size: 19px;
        color: white;
        background-color: maroon;
        padding: 5px 15px;
        width: fit-content;
        margin: 0 auto;
        border-radius: 6px;
      }
      .main-title {
        text-align: center;
        font-size: 38px;
        font-weight: bold;
        margin-top: 5px;
        color: maroon;
      }
      .sub-header {
        text-align: center;
        font-size: 15px;
        margin: 1px 0;
      }
      .line-group {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
      }
      .section {
        margin: 10px 0;
        display: flex;
        gap: 8px;
      }
      .underline {
        flex-grow: 1;
        border-bottom: 1px dotted #000e3cff;
        min-width: 150px;
      }
      .short-underline {
        display: inline-block;
        border-bottom: 1px dotted #000e3cff;
        min-width: 100px;
      }

      .payment-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 30px;
      }

      .payment-table {
        border: 1px solid maroon;
        border-collapse: collapse;
        font-size: 18px;
      }
      .payment-table th {
        border: 1px solid maroon;
        padding: 2px 8px;
        text-align: center;
        min-width: 80px;
        background-color: maroon;
        color: white;
      }
      .payment-table td {
        border: 1px solid maroon;
        padding: 2px 8px;
        text-align: center;
        min-width: 80px;
      }

      .rs-combo {
        display: flex;
        align-items: center;
      }

      .circle-rs {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: transparent;
        color: #000e3cff;
        font-size: 30px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .bramount-box {
        border: 1px solid maroon;
        border: 1px solid maroon;
        padding: 1px 1px;
        font-weight: bold;
        min-width: 100px;
        font-size: 14px;
      }
      .amount-box {
        border: 1px solid maroon;
        border: 1px solid maroon;
        padding: 6px 14px;
        font-weight: bold;
        min-width: 100px;
        font-size: 30px;
      }

      .signature {
        font-weight: bold;
        font-size: 18px;
        text-align: right;
        margin-top: 20px;
      }
          .italic {
    font-style: italic;
  }
    </style>
  </head>
  <body>
   <div style="border: 1px solid maroon; padding: 1px">
    <div style="border: 1px solid maroon; padding: 30px; position: relative;">
    ${rankHtml}
    <div class="header-title">MONEY RECEIPT</div>
     
    <div class="line-group">
      <div>No. <span>${receipt.slNo}</span></div>
      <div>Date <span class="short-underline">${formatIST(receipt.receiptDate)}</span></div>
    </div>

    <div class="section italic">Received with thanks from <div class="underline" style="color: maroon; font-weight: bold;"> <span style="font-weight: 800"> ${partyName} </span></div></div>
    <div class="section italic "><span>Mob.:</span><div class="underline" style="color: maroon; font-weight: bold;">${receipt.mobile || '-'}</div></div>
    <div class="section italic ">a sum of Rs. <div class="underline" style="color: maroon; font-weight: bold;">₹${numberToWords(Number(receipt.amount || 0))}</div></div>
    <div class="section italic ">
      for event of <div class="underline" style="color: maroon; font-weight: bold;">${eventDisplay}  <span style="background-color: yellow;">
    ${venueType ? ` - ${venueType}` : ''}
  </span></div>
      <span style="margin-left:auto;">Dated <span class="short-underline" style="color: maroon; font-weight: bold;">${formatIST(receipt.eventDate)}</span></span>
    </div>

    <div class="payment-row">
      <!-- LEFT PAYMENT MODE TABLE -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <table class="payment-table">
          <tr><th colspan="2">Payment Mode</th></tr>
          <tr>
            <td class="italic ">${receipt.mode === 'Cash' ? '☑️ Cash' : 'Cash'}${receipt.cashTo && receipt.cashTo.toLowerCase() !== 'cash' ? ` (${getInitials(receipt.cashTo)})` : ''}</td>
            <td className="italic">
              ${receipt.mode !== 'Cash' && (receipt.bankMode === 'RTGS/NEFT' || !receipt.bankMode) ? '☑️ RTGS/NEFT' : 'RTGS/NEFT'}
            </td>        
          </tr>
          <tr>
            <td class="italic ">${receipt.mode !== 'Cash' && receipt.bankMode === 'Cheque' ? '☑️ Cheque' : 'Cheque'}</td>
            <td class="italic ">${receipt.mode !== 'Cash' && receipt.bankMode === 'Card' ? '☑️ Card' : 'Card'}</td>
          </tr>
          <tr>
            <td colspan="2" class="italic ">${receipt.mode !== 'Cash' && receipt.bankMode === 'UPI' ? '☑️ UPI' : 'UPI'}</td>
          </tr>
        </table>
        ${receipt.mode !== 'Cash' && receipt.bankMode === 'Cheque' && receipt.chequeNo ? `<div style="font-size: 15px; font-weight: bold; color: maroon;">Cheque No: ${receipt.chequeNo}</div>` : ''}
      </div>

      <!-- MIDDLE ₹ SYMBOL + AMOUNT IN BOX -->
      <div class="rs-combo">
       <div class="bramount-box"> <div class="amount-box">₹ ${receipt.amount !== undefined && receipt.amount !== null
        ? receipt.amount.toLocaleString("en-IN")
        : "-"}</div> </div>
      </div>

      <!-- RIGHT SIGNATURE -->
      <div class="signature" style="display: flex; flex-direction: column; align-items: center; margin-top: 0px;">
        <div style="font-size: 14px; font-weight: normal; margin-bottom: 5px;">Issued By:</div>
        <div style="color: maroon;">${receipt.receiverd || receipt.senderd || 'Accounts Dept.'}</div>
      </div>
      </div>
     </div>
    </div>
  </body>
  </html>
  `;

    printHtmlContent(content);
  }, [getReceiptRankText]);

  const handlePrintOther = useCallback(async (receipt) => {

    const label = receipt.paymentFor === 'Credit' ? 'Received with thanks from' : 'Paid to';
    const partyName = getDisplayName(receipt).trim();
    const description = receipt.description || '-';
    const particularNature = receipt.particularNature || '-';
    const receiptDate = receipt.receiptDate ? formatIST(receipt.receiptDate) : '-';

    // const rankText = getReceiptRankText(receipt);
    // const rankHtml = rankText ? `<div style="position: absolute; top: 10px; left: 15px; font-weight: bold; font-size: 16px; color: maroon;">${rankText}</div>` : '';

    const content = `
<html>
  <head>
    <title>Receipt #${receipt.slNo}</title>
    <style>
      body {
        font-family: 'Calibri', sans-serif;
        color: #000e3cff;
        font-size: 20px;
        padding: 0px;
      }
      .header-title {
        text-align: center;
        font-weight: bold;
        font-size: 19px;
        color: white;
        background-color: maroon;
        padding: 5px 15px;
        width: fit-content;
        margin: 0 auto;
        border-radius: 6px;
      }
      .main-title {
        text-align: center;
        font-size: 38px;
        font-weight: bold;
        margin-top: 5px;
        color: #000e3cff;
      }
      .sub-header {
        text-align: center;
        font-size: 15px;
        margin: 1px 0;
      }
      .section {
        margin: 10px 0;
        display: flex;
        gap: 8px;
        font-size: 18px;
      }
      .underline {
        flex-grow: 1;
        border-bottom: 1px dotted #000e3cff;
        min-width: 150px;
      }
      .short-underline {
        display: inline-block;
        border-bottom: 1px dotted #000e3cff;
        min-width: 100px;
      }
      .italic {
        font-style: italic;
      }
      .payment-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 30px;
      }
      .payment-table {
        border: 1px solid maroon;
        border-collapse: collapse;
        font-size: 18px;
      }
      .payment-table th {
        border: 1px solid maroon;
        padding: 2px 8px;
        text-align: center;
        min-width: 80px;
        background-color: maroon;
        color: white;
      }
      .payment-table td {
        border: 1px solid maroon;
        padding: 2px 8px;
        text-align: center;
        min-width: 80px;
      }
      .rs-combo {
        display: flex;
        align-items: center;
      }
      .circle-rs {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: transparent;
        color: #000e3cff;
        font-size: 30px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .bramount-box {
        border: 1px solid maroon;
        padding: 1px 1px;
        font-weight: bold;
        min-width: 100px;
        font-size: 14px;
      }
      .amount-box {
        border: 1px solid maroon;
        padding: 6px 14px;
        font-weight: bold;
        min-width: 100px;
        font-size: 30px;
      }
      .signature {
        font-weight: bold;
        font-size: 18px;
        text-align: right;
        margin-top: 20px;
      }
    </style>
  </head>
  <body>
    <div style="border: 1px solid maroon; padding: 1px">
      <div style="border: 1px solid maroon; padding: 30px; position: relative;">

        <div class="header-title">VOUCHER RECEIPT</div>
      
        <div class="section">
          Sl No. <span class="short-underline" style="color: maroon; font-weight: bold;">${receipt.slNo}</span>
          <span style="margin-left:auto;">Date <span class="short-underline" style="color: maroon; font-weight: bold;">${receiptDate}</span></span>
        </div>

        <div class="section italic">${label} <div class="underline" style="color: maroon; font-weight: bold;"> <span style="font-weight: 800"> ${partyName}</span></div></div>
        <div class="section italic">Mobile No. <div class="underline" style="color: maroon; font-weight: bold;">${receipt.mobile}</div></div>
        <div class="section italic">a sum of Rs. <div class="underline" style="color: maroon; font-weight: bold;">₹${numberToWords(Number(receipt.amount || 0))}</div></div>
        <div class="section italic">Purpose/Description: <div class="underline" style="color: maroon; font-weight: bold;">${particularNature}, ${description}</div></div>

        <div class="payment-row">
          <!-- LEFT TABLE -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <table class="payment-table">
              <tr><th colspan="2">Payment Mode</th></tr>
              <tr>
                <td class="italic">${receipt.mode === 'Cash' ? '☑️ Cash' : 'Cash'}${receipt.cashTo && receipt.cashTo.toLowerCase() !== 'cash' ? ` (${getInitials(receipt.cashTo)})` : ''}</td>
                <td className="italic">
${receipt.mode !== 'Cash' && (receipt.bankMode === 'RTGS/NEFT' || !receipt.bankMode) ? '☑️ RTGS/NEFT' : 'RTGS/NEFT'}
               </td>            
            </tr>
              <tr>
                <td class="italic">${receipt.mode !== 'Cash' && receipt.bankMode === 'Cheque' ? '☑️ Cheque' : 'Cheque'}</td>
                <td class="italic">${receipt.mode !== 'Cash' && receipt.bankMode === 'Card' ? '☑️ Card' : 'Card'}</td>
              </tr>
              <tr>
                <td colspan="2" class="italic">${receipt.mode !== 'Cash' && receipt.bankMode === 'UPI' ? '☑️ UPI' : 'UPI'}</td>
              </tr>
            </table>
            ${receipt.mode !== 'Cash' && receipt.bankMode === 'Cheque' && receipt.chequeNo ? `<div style="font-size: 15px; font-weight: bold; color: maroon;">Cheque No: ${receipt.chequeNo}</div>` : ''}
          </div>

          <!-- MIDDLE ₹ SYMBOL + AMOUNT -->
          <div class="rs-combo">
            <div class="bramount-box">
              <div class="amount-box">₹ ${parseFloat(receipt.amount).toLocaleString('en-IN')}</div>
            </div>
          </div>

          <!-- RIGHT SIGNATURE -->
          <div class="signature" style="display: flex; flex-direction: column; align-items: center; margin-top: 0px;">
            <div style="font-size: 14px; font-weight: normal; margin-bottom: 5px;">Issued By:</div>
            <div style="color: maroon;">${'Accounts Dept.'}</div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>
  `;

    printHtmlContent(content);
  }, []);

  useEffect(() => {
    const receipt = location.state?.printReceipt;
    if (receipt) {
      if (bankNames.includes(receipt.mode)) {
        handlePrint(receipt);
      } else if (receipt.type === 'Other') {
        handlePrintOther(receipt);
      } else if (receipt.type === 'Cash') {
        handlePrintCash(receipt);
      } else {
        handlePrint(receipt);
      }
    }
  }, [location.state, handlePrint, handlePrintCash, handlePrintOther, bankNames]);

  const { totalCredit, totalDebit } = React.useMemo(() => {
    let credit = 0, debit = 0;
    finalReceipts.forEach(r => {
      const amt = Number(r.amount || 0);
      if (r.paymentFor === "Credit") credit += amt;
      if (r.paymentFor === "Debit") debit += amt;
    });
    return { totalCredit: credit, totalDebit: debit };
  }, [finalReceipts]);

  const balance = totalCredit - totalDebit;

  const rightRef = useRef(null);

  const getCurrentMonthAndFY = () => {
    const now = new Date();

    // Current Month
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const format = (d) => d.toISOString().split("T")[0];

    // Financial Year (India: Apr–Mar)
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const fy =
      month >= 4
        ? `${year}-${year + 1}`
        : `${year - 1}-${year}`;

    return {
      from: format(firstDay),
      to: format(lastDay),
      fy,
    };
  };

  useEffect(() => {
    const { from, to } = getCurrentMonthAndFY();

    setDateFrom(from);
    setDateTo(to);
    // setSelectedFY(fy);
  }, []);

  const toggleSelection = (value, state, setState) => {
    if (state.includes(value)) {
      setState(state.filter(v => v !== value));
    } else {
      setState([...state, value]);
    }
  };

  useEffect(() => {
    // Agar Cash mode select nahi hai
    if (!modeFilter.includes("Cash")) {
      setCashToFilter([]); // Cash To reset
    }
  }, [modeFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [finalReceipts]);

  const tableRows = React.useMemo(() => {
    const sortedReceipts = finalReceipts;
    const paginatedReceipts = sortedReceipts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return paginatedReceipts.map((r, i) => {
      const index = (currentPage - 1) * itemsPerPage + i;
      const isCredit = r.paymentFor === "Credit";
      const isDebit = r.paymentFor === "Debit";

      const displayType =
        r.type === "Money Receipt" || r.type === "Cash"
          ? "MR"
          : r.type === "Voucher"
            ? "Voucher"
            : r.type;

      return (
        <tr
          key={r.id + "_" + index}
          style={{
            backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff",
            color:
              r.approval === "Rejected"
                ? "black"
                : isCredit
                  ? "green"
                  : isDebit
                    ? "red"
                    : "black",
            fontWeight: '700'
          }}
        >
          <td style={{ fontWeight: "bold", color: 'black', backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>
            {finalReceipts.length - index}.
          </td>
          <td style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{r.receiptDate ? formatDate(r.receiptDate) : ''}</td>
          <td style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>
            {["Event Royalty", "Decoration Royalty"].includes(r.particularNature)
              ? r.particularNature
              : (r.eventType || r.particularNature)}
          </td>
          <td style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{displayType}</td>
          <td style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{r.customerName || r.partyName}</td>

          {/* Print button */}
          <td>
            <button
              onClick={() => {
                if (r.approval !== "Accepted") {
                  alert("❌ Printing not allowed — approval is not granted.");
                  return;
                }

                if (bankNames.includes(r.mode)) {
                  handlePrint(r);
                } else if (r.slNo?.toString().startsWith("C")) {
                  handlePrintCash(r);
                } else {
                  r.eventDate ? handlePrint(r) : handlePrintOther(r);
                }
              }}
              style={{
                background: r.approval === "Accepted" ? "#b52e2e" : "#88888800",
                color: "#fff",
                padding: "5px 10px",
                border: "none",
                borderRadius: "4px",
                cursor: r.approval === "Accepted" ? "pointer" : "not-allowed",
              }}
              disabled={r.approval !== "Accepted"}
            >
              Print
            </button>
          </td>

          <td style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>
            {r.mode || ""}
            {r.bankMode ? ` (${r.bankMode}${r.chequeNo ? ` - ${r.chequeNo}` : ''})` : ''}
          </td>
          <td style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{r.cashTo || ""}</td>

          <td style={{ fontWeight: "bold", backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", width: "fit-content", }}>#{r.slNo}</td>
          <td style={{ fontWeight: "bold", width: "fit-content", backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{r.manualSlNo}</td>

          <td>{r.paymentFor === "Credit" ? r.paymentFor : ""}</td>
          <td>{r.paymentFor === "Debit" ? r.paymentFor : ""}</td>
          <td>
            ₹{Number(r.amount || 0).toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </td>
          <td>{r.mobile}</td>
          <td >{r.eventDate ? formatDate(r.eventDate) : ''}</td>
          <td>{r.description ? r.description : "Advance Payment"}</td>

        </tr>
      );
    });
  }, [
    finalReceipts,
    handlePrint,
    handlePrintCash,
    handlePrintOther,
    bankNames,
    currentPage,
    itemsPerPage
  ]);

  return (
    <div className="page-scroller">
      <div className="receipts-container" style={{ margin: "0px" }}>
        <div style={{ marginBottom: '0px' }}> <BackButton /> </div>

        <div style={{ marginBottom: '10px' }}>
          <h2 className="title">Print Receipts</h2>
        </div>

        <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'right', alignItems: 'center', gap: '10px' }}>

          <div className="search-wrapper">
            <input
              type="text"
              placeholder="🔍 Search by Sl No., Type, name, mobile, event or date"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />

            {search && (
              <button
                className="clear-btn-cross"
                onClick={() => setSearch("")}
                type="button"
              >
                ✖
              </button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'right',
              alignItems: 'center',
              gap: '10px',
              whiteSpace: "nowrap"
            }}
          >
            <button
              onClick={() => navigate('/MoneyReceipt')}
              style={{
                padding: '10px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              MR
            </button>

            <button
              onClick={() => navigate('/Receipts')}
              style={{
                padding: '10px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              VR
            </button>

          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', margin: "15px 0px" }}>

          <div>
            <p style={{ fontWeight: '600', margin: "0px", marginBottom: '10px' }}>Receipt Type</p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>

              <button
                onClick={() => setTypeFilter([])}
                style={{
                  background: typeFilter.length === 0 ? '#2e6999' : '#b3b3b3',
                  color: '#fff',
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '4px'
                }}>
                All
              </button>

              <button
                onClick={() => toggleSelection('Bank', typeFilter, setTypeFilter)}
                style={{
                  background: typeFilter.includes('Bank') ? '#2e6999' : '#b3b3b3',
                  color: '#fff',
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '4px'
                }}>
                MR Bank
              </button>

              <button
                onClick={() => toggleSelection('Cash', typeFilter, setTypeFilter)}
                style={{
                  background: typeFilter.includes('Cash') ? '#2e6999' : '#b3b3b3',
                  color: '#fff',
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '4px'
                }}>
                MR Cash
              </button>

              <button
                onClick={() => toggleSelection('Refund', typeFilter, setTypeFilter)}
                style={{
                  background: typeFilter.includes('Refund') ? '#2e6999' : '#b3b3b3',
                  color: '#fff',
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '4px'
                }}>
                MR Refund
              </button>

              <button
                onClick={() => toggleSelection('Voucher', typeFilter, setTypeFilter)}
                style={{
                  background: typeFilter.includes('Voucher') ? '#2e6999' : '#b3b3b3',
                  color: '#fff',
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '4px'
                }}>
                Voucher
              </button>

            </div>
          </div>

          <div>
            <p style={{ fontWeight: '600', margin: "0px", marginBottom: '10px' }}>
              Credit / Debit
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>

              <button
                onClick={() => toggleSelection('Credit', creditDebitFilter, setCreditDebitFilter)}
                style={{
                  background: creditDebitFilter.includes('Credit') ? '#2e6999' : '#b3b3b3',
                  color: '#fff',
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '4px'
                }}
              >
                Credit
              </button>

              <button
                onClick={() => toggleSelection('Debit', creditDebitFilter, setCreditDebitFilter)}
                style={{
                  background: creditDebitFilter.includes('Debit') ? '#2e6999' : '#b3b3b3',
                  color: '#fff',
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '4px'
                }}
              >
                Debit
              </button>

            </div>
          </div>

          <div>
            <p style={{ fontWeight: '600', margin: "0px", marginBottom: '10px' }}>Payment Modes</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {/* {['All', ...bankNames, 'Cash', 'Card', 'Cheque'].map(mode => ( */}
              {[...bankNames, 'Cash'].map(mode => (

                <button
                  key={mode}
                  onClick={() => toggleSelection(mode, modeFilter, setModeFilter)}
                  style={{
                    background: modeFilter.includes(mode) ? '#2e6999' : '#b3b3b3',
                    color: '#fff',
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: '4px'
                  }}>
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {modeFilter.includes("Cash") && (
            <div>
              <p style={{ fontWeight: '600', margin: "0px", marginBottom: '10px' }}>Cash To</p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {cashToOptions.map(ct => (
                  <button
                    key={ct}
                    onClick={() => toggleSelection(ct, cashToFilter, setCashToFilter)}
                    style={{
                      background: cashToFilter.includes(ct) ? '#2e6999' : '#b3b3b3',
                      color: '#fff',
                      padding: '8px 12px',
                      border: 'none',
                      borderRadius: '4px'
                    }}
                  >
                    {ct}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* date from to  */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: "10px",
        }}>
          <div className='dateFromToFilters' style={{ display: "flex", alignItems: "center" }}>
            <label style={{ fontSize: '14px' }}>From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                fontSize: '14px',
                maxWidth: "200px"
              }}
            />
          </div>

          <div className='dateFromToFilters' style={{ display: "flex", alignItems: "center" }}>
            <label style={{ fontSize: '14px' }}>To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                fontSize: '14px',
                maxWidth: "200px"
              }}
            />
          </div>

          <div className='dateFromToFilters' style={{ display: "none", alignItems: "center" }}>
            <label style={{ fontSize: '14px' }}>Financial Year</label>
            <select
              value={selectedFY}
              onChange={(e) => setSelectedFY(e.target.value)}
              style={{ maxWidth: "200px", padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px' }}
            >
              <option value="">All</option>
              {financialYears.map(fy => (
                <option key={fy} value={fy}>{fy}</option>
              ))}
            </select>
          </div>

          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setSelectedFY('');
              }}
              style={{
                padding: '6px 12px',
                background: '#92f56b7f',
                color: '#026500',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: "700"
              }}
            >
              Show All
            </button>
          )}

        </div>

        <div className="summary-bar">
          <span style={{ color: "green" }} >Credit: <span > ₹{totalCredit.toLocaleString("en-IN")} </span> </span>
          <span style={{ color: "red" }}  >Debit: <span > ₹{totalDebit.toLocaleString("en-IN")} </span> </span>
          <span style={{ color: "black" }}  >Balance: <span > ₹{balance.toLocaleString("en-IN")} </span> </span>
        </div>

        {/* Items Per Page Controls */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '5px 10px', marginBottom: '5px', gap: '5px' }}>
          <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>Items per page:</span>
          {[25, 50, 100].map(num => (
            <button
              key={num}
              onClick={() => {
                setItemsPerPage(num);
                setCurrentPage(1);
              }}
              style={{
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #0056b3',
                background: itemsPerPage === num ? '#0056b3' : 'white',
                color: itemsPerPage === num ? 'white' : '#0056b3',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '12px'
              }}
            >
              {num}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="leads-table-container" style={{ padding: "0px" }}>
          <div className="table-fixed-wrapper" ref={rightRef}>
            <table className="leads-table">
              <thead>
                <tr>
                  <th>SL</th>
                  <th
                    style={{
                      cursor: "pointer",
                      padding: '0px 2px',
                    }}

                    onClick={() => {
                      if (sortKey === "receiptDate") {
                        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      } else {
                        setSortKey("receiptDate");
                        setSortOrder("desc");
                      }
                    }}>
                    Rcpt Date
                    <button
                      style={{
                        margin: "-1px",
                        cursor: "pointer",
                        border: "none",
                        background: "transparent",
                        padding: '0px'
                      }}
                    >
                      {sortKey === "receiptDate" ? (sortOrder === "asc" ? "" : "") : ""}
                    </button>
                  </th>
                  <th>Particular Nature</th>
                  <th>Receipt Type</th>
                  <th>Name</th>
                  <th>Print</th>
                  <th>Mode</th>
                  <th>Cash-Via</th>
                  <th>Auto Sl.No</th>
                  <th>Manual Sl.No</th>
                  <th>Credit</th>
                  <th>Debit</th>
                  <th>Amount</th>
                  <th>Mobile</th>
                  <th>Function Date</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {tableRows}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Controls */}
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(finalReceipts.length / itemsPerPage) || 1}
          onPageChange={(page) => setCurrentPage(page)}
        />

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
            width: "25px",
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
            width: "25px",
            height: "100px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            cursor: "pointer",
            color: "black",
          }} className="scroll-btn"
        >
          ▶
        </button>
      </div >

      <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
    </div>
  );
};

export default MoneyReceipts; 