import React, { useEffect, useState, useCallback, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc, getDoc, getDocs, deleteField, runTransaction, query, where } from "firebase/firestore";
import { db } from '../firebaseConfig';
import '../styles/MoneyReceipts.css';
import { useNavigate, useLocation } from 'react-router-dom';

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { getAuth } from "firebase/auth";
import BackButton from "../components/BackButton";
import BottomNavigationBar from "../components/BottomNavigationBar";
import LogPopupCell from '../Book/AllLeads/LogPopupCell';
import Pagination from "../components/Pagination";
import { printHtmlContent } from "../utils/printHelper";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const location = useLocation();


  const [receipts, setReceipts] = useState([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFY, setSelectedFY] = useState("");
  const [sortKey, setSortKey] = useState("receiptDate");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showPopup, setShowPopup] = useState(false);
  const [newAmount, setNewAmount] = useState(0);
  const [newDescription, setNewDescription] = useState("");
  const [newDate, setNewDate] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [userAppType, setUserAppType] = useState(null);
  const [bankNames, setBankNames] = useState([]);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [newCashTo, setNewCashTo] = useState("");
  const [newManualSlNo, setNewManualSlNo] = useState("");
  const [newParticularNature, setNewParticularNature] = useState("");
  const [newMode, setNewMode] = useState("");
  const [newBankMode, setNewBankMode] = useState("RTGS/NEFT");
  const [newChequeNo, setNewChequeNo] = useState("");
  const [particularOptions, setParticularOptions] = useState([]);
  const [showNaturePopup, setShowNaturePopup] = useState(false);
  const [natureSearch, setNatureSearch] = useState("");
  const [customNature, setCustomNature] = useState("");
  const [typeFilter, setTypeFilter] = useState([]);
  const [modeFilter, setModeFilter] = useState([]);
  const [creditDebitFilter, setCreditDebitFilter] = useState([]);
  const [cashToFilter, setCashToFilter] = useState([]);
  const [showPDFPopup, setShowPDFPopup] = useState(false);
  const [pdfTypes, setPdfTypes] = useState([]);
  const [showGroupPopup, setShowGroupPopup] = useState(false);
  const [oldGroupName, setOldGroupName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newPaymentFor, setNewPaymentFor] = useState("");
  const [subParticularOptions, setSubParticularOptions] = useState([]);
  const [newSubParticular, setNewSubParticular] = useState("");
  const [customSubParticular, setCustomSubParticular] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [groupFilter, setGroupFilter] = useState([]);
  const [subGroupFilter, setSubGroupFilter] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

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

  const numberToWords = (num) => {
    const a = [
      "", "One", "Two", "Three", "Four", "Five", "Six",
      "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
      "Thirteen", "Fourteen", "Fifteen", "Sixteen",
      "Seventeen", "Eighteen", "Nineteen"
    ];
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const inWords = (n) => {
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + " " + a[n % 10];
      if (n < 1000) return a[Math.floor(n / 100)] + " Hundred " + inWords(n % 100);
      if (n < 100000) return inWords(Math.floor(n / 1000)) + " Thousand " + inWords(n % 1000);
      if (n < 10000000) return inWords(Math.floor(n / 100000)) + " Lakh " + inWords(n % 100000);
      return inWords(Math.floor(n / 10000000)) + " Crore " + inWords(n % 10000000);
    };

    return inWords(num) + " Only";
  };

  const togglePDFType = (type) => {
    if (pdfTypes.includes(type)) {
      setPdfTypes(pdfTypes.filter(t => t !== type));
    } else {
      setPdfTypes([...pdfTypes, type]);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const getReceiptLabel = (r) => {
    if (
      (r.type === "Money Receipt" || r.type === "Cash") &&
      r.mode !== "Cash" &&
      r.paymentFor === "Debit"
    ) return "Bank Debit";

    if (r.type === "Money Receipt" || r.type === "Cash") return "MR";
    if (r.type === "Voucher") return "Voucher";

    return r.type;
  };

  const toggleSelection = (value, state, setState) => {
    if (state.includes(value)) {
      setState(state.filter(v => v !== value));
    } else {
      setState([...state, value]);
    }
  };

  useEffect(() => {
    const fetchParticularNatures = async () => {
      try {
        const snap = await getDocs(collection(db, "moneyReceipts"));
        const set = new Set();

        snap.forEach(docSnap => {
          const data = docSnap.data();

          Object.entries(data).forEach(([key, r]) => {

            // 🚫 Skip logs / meta
            if (
              !r ||
              typeof r !== "object" ||
              Array.isArray(r) ||
              !r.slNo ||              // 🔥 MUST be a receipt
              !r.amount ||
              !r.receiptDate
            ) return;

            if (
              typeof r.particularNature === "string" &&
              r.particularNature.trim().length > 0
            ) {
              set.add(r.particularNature.trim());
            }
          });
        });

        setParticularOptions(Array.from(set).sort());
      } catch (e) {
        console.error("Error fetching particular nature", e);
      }
    };

    fetchParticularNatures();
  }, []);

  const filteredNatureOptions = React.useMemo(() => {
    const q = natureSearch.toLowerCase();
    return particularOptions.filter(p =>
      p.toLowerCase().includes(q)
    );
  }, [natureSearch, particularOptions]);

  const toISTDate = (dateStr) => {
    if (!dateStr) return null;

    if (typeof dateStr === "string" && dateStr.length === 10 && dateStr.includes("-")) {
      const [y, m, d] = dateStr.split('-');
      return new Date(Number(y), Number(m) - 1, Number(d));
    }

    const d = new Date(dateStr);
    return new Date(d.getTime() + (330 * 60000)); // Roughly add 5.30 hours if needed, but standard Date is usually enough.
  };

  const getISTDateTime = () => {
    return new Date().toLocaleString("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

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
  }, [sortKey, sortOrder]);

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

  const getFinancialYear = (dateStr) => {
    const date = toISTDate(dateStr);
    if (!date) return null;

    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    return month >= 4
      ? `${year.toString().slice(2)}-${(year + 1).toString().slice(2)}`
      : `${(year - 1).toString().slice(2)}-${year.toString().slice(2)}`;
  };

  const cashToOptions = React.useMemo(() => {
    const set = new Set();

    receipts.forEach(r => {
      if (r.mode === "Cash" && r.cashTo) {
        set.add(r.cashTo);
      }
    });

    return ["All", ...Array.from(set)];
  }, [receipts]);

  const filteredReceipts = React.useMemo(() => {

    let result = receipts;

    // 🔍 SEARCH (Debounced)
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      result = result.filter(r => {
        const combined = `${r.customerName || ""} ${r.partyName || ""} ${r.mobile || ""} ${r.slNo || ""} ${r.type || ""} ${r.particularNature || ""} ${r.description || ""} ${r.amount || ""} ${r.receiptDate || ""}`.toLowerCase();
        return combined.includes(s);
      });
    }

    // 🧾 RECEIPT TYPE
    if (typeFilter.length > 0) {
      result = result.filter(r =>
        typeFilter.some(filterType => {

          const type = (r.type || "").toLowerCase();
          const mode = (r.mode || "").toLowerCase();
          const paymentFor = (r.paymentFor || "").toLowerCase();

          // MR CASH
          if (filterType === "Cash") {
            return type.includes("cash") && mode === "cash";
          }

          // MR BANK
          if (filterType === "Bank") {
            return type.includes("money") && mode !== "cash";
          }

          // MR REFUND (Debit side MR only)
          if (filterType === "Refund") {
            return type.includes("money") && paymentFor === "debit";
          }

          // VOUCHER
          if (filterType === "Voucher") {
            return type.includes("voucher");
          }
          return false;
        })
      );
    }

    // 💰 CREDIT / DEBIT
    if (creditDebitFilter.length > 0) {
      result = result.filter(r =>
        creditDebitFilter.includes(r.paymentFor)
      );
    }

    // 🏦 MODE
    if (modeFilter.length > 0) {
      result = result.filter(r =>
        modeFilter.includes(r.mode)
      );
    }

    // 💵 CASH TO (only when mode = Cash)
    if (cashToFilter.length > 0) {
      result = result.filter(r =>
        r.mode === "Cash" &&
        cashToFilter.includes(r.cashTo)
      );
    }

    // 📅 DATE RANGE
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo) : null;

      result = result.filter(r => {
        if (!r.receiptDate) return true;
        const d = new Date(r.receiptDate);
        return (!from || d >= from) && (!to || d <= to);
      });
    }

    // 📆 FINANCIAL YEAR
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

    return result;

  }, [
    receipts,
    debouncedSearch,
    typeFilter,
    creditDebitFilter,
    modeFilter,
    cashToFilter,
    dateFrom,
    dateTo,
    selectedFY
  ]);

  const groupedData = {};

  filteredReceipts.forEach(receipt => {
    if (!receipt.receiptDate) return;

    const date = toISTDate(receipt.receiptDate);
    if (!date) return;

    const month = date.getMonth() + 1;
    const fy = getFinancialYear(receipt.receiptDate);

    const key = `${fy}-${month}`;

    if (!groupedData[key]) {
      groupedData[key] = {
        fy,
        month,
        credit: 0,
        debit: 0,
      };
    }

    if (receipt.paymentFor === 'Credit') {
      groupedData[key].credit += Number(receipt.amount || 0);
    } else if (receipt.paymentFor === 'Debit') {
      groupedData[key].debit += Number(receipt.amount || 0);
    }
  });

  const finalReceipts = React.useMemo(() => {
    return filteredReceipts.filter(r => {

      // 🔹 1️⃣ Particular Filter
      if (groupFilter.length > 0) {
        const eventType = (r.eventType || "").trim().toLowerCase();
        const particular = (r.particularNature || "").trim().toLowerCase();

        const match = groupFilter.some(g =>
          eventType === g || particular === g
        );

        if (!match) return false;
      }

      if (subGroupFilter.length > 0) {
        const sub = (r.subParticularNature || "").trim().toLowerCase();

        if (!subGroupFilter.includes(sub)) return false;
      }

      return true;
    });
  }, [filteredReceipts, groupFilter, subGroupFilter]);

  const formatDate = (date) => {
    if (!date) return "-";

    const d = new Date(date);

    return d.toLocaleDateString("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).replace(/\//g, "-"); // DD-MM-YYYY
  };

  const handleImportReceipts = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);

      // ✅ Only keep rows where type === "Voucher"
      const filteredRows = data.filter(r => (r.type || "").trim().toLowerCase() === "voucher");

      const batchUpdates = {};

      for (let row of filteredRows) {
        let jsDate = null;

        // Convert receiptDate
        try {
          if (row.receiptDate) {
            if (typeof row.receiptDate === "number") {
              jsDate = new Date((row.receiptDate - 25569) * 86400 * 1000);
            } else if (typeof row.receiptDate === "string") {
              let parts;
              if (row.receiptDate.includes("-")) parts = row.receiptDate.split("-");
              else if (row.receiptDate.includes("/")) parts = row.receiptDate.split("/");

              if (parts && parts.length === 3) {
                let [first, second, third] = parts;

                if (parseInt(first) > 31) {
                  jsDate = new Date(`${first}-${second}-${third}`);
                } else {
                  let day = first, month = second, year = third;
                  if (parseInt(year) < 100) year = "20" + year;
                  jsDate = new Date(`${year}-${month}-${day}`);
                }
              }
            }
            if (jsDate && isNaN(jsDate)) jsDate = null;
          }
        } catch {
          jsDate = null;
        }

        const monthYear = jsDate
          ? jsDate.toLocaleString("en-US", { month: "short", year: "numeric" }).replace(" ", "")
          : "UnknownMonth";

        const receiptId = crypto.randomUUID();

        const receiptData = {
          id: receiptId,
          ...row,
          receiptDate: jsDate ? jsDate.toISOString().split("T")[0] : null,
          mobile: row.mobile ? row.mobile.toString() : "",
          type: row.type || "Unknown",
          createdAt: new Date().toISOString(),
        };

        if (!batchUpdates[monthYear]) batchUpdates[monthYear] = {};
        batchUpdates[monthYear][receiptId] = receiptData;
      }

      // Firestore updates
      for (const [monthYear, receiptsMap] of Object.entries(batchUpdates)) {
        const docRef = doc(db, "moneyReceipts", monthYear);
        try {
          await updateDoc(docRef, receiptsMap);
        } catch (err) {
          if (err.code === "not-found") {
            await setDoc(docRef, receiptsMap);
          } else console.error(err);
        }
      }

      alert(`✅ Import completed! Total Voucher rows imported: ${filteredRows.length}`);
    };

    reader.readAsBinaryString(file);
  };

  useEffect(() => {
    const { from, to } = getCurrentMonthAndFY();

    setDateFrom(from);
    setDateTo(to);  // 🔥 YE PROBLEM HAI
  }, []);

  const handleExportReceipts = async () => {
    try {
      const receiptsCollection = collection(db, "moneyReceipts");
      const snapshot = await getDocs(receiptsCollection);

      let allReceipts = [];

      snapshot.forEach((docSnap) => {
        const monthYear = docSnap.id;
        const receiptsMap = docSnap.data();

        Object.values(receiptsMap).forEach((receipt) => {
          allReceipts.push({
            ...receipt,
            monthYear,
          });
        });
      });

      if (allReceipts.length === 0) {
        alert("⚠️ No receipts found for export.");
        return;
      }

      // Convert receipts array → worksheet
      const worksheet = XLSX.utils.json_to_sheet(allReceipts);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Receipts");

      // Generate Excel file and trigger download
      const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      saveAs(new Blob([wbout], { type: "application/octet-stream" }), "moneyReceipts.xlsx");

      alert(`✅ Export completed! Total receipts exported: ${allReceipts.length}`);
    } catch (error) {
      console.error("Export failed:", error);
      alert("❌ Export failed. Check console for details.");
    }
  };

  const totalCredit = finalReceipts.filter(r => r.paymentFor === "Credit").reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const totalDebit = finalReceipts.filter(r => r.paymentFor === "Debit").reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const balance = totalCredit - totalDebit;

  const handleUpdateReceipt = async (updatedReceipt) => {
    try {
      const {
        id,
        monthYear,
        slNo,
        amount,
        receiptDate,
        description,
        cashTo,
        mode,
        bankMode,
        chequeNo,
        manualSlNo,
        particularNature,
        paymentFor,
        subParticularNature,
        customerName,
        mobile,
        eventDate,
      } = updatedReceipt;

      /* ===============================
         1️⃣ LOAD OLD RECEIPT
      =============================== */
      const receiptRef = doc(db, "moneyReceipts", monthYear);
      const snap = await getDoc(receiptRef);

      if (!snap.exists() || !snap.data()[id]) {
        alert("❌ Receipt not found");
        return;
      }

      const oldReceipt = snap.data()[id];

      /* ===============================
         2️⃣ BUILD CHANGE LOG
      =============================== */
      const changes = {};

      if (oldReceipt.amount !== amount)
        changes.amount = { old: oldReceipt.amount, new: amount };

      if (oldReceipt.receiptDate !== receiptDate)
        changes.receiptDate = { old: oldReceipt.receiptDate, new: receiptDate };

      if ((oldReceipt.manualSlNo || "") !== (manualSlNo || "")) {
        changes.manualSlNo = {
          old: oldReceipt.manualSlNo || "",
          new: manualSlNo || "",
        };
      }

      if ((oldReceipt.customerName || "") !== (customerName || "")) {
        changes.customerName = {
          old: oldReceipt.customerName || "",
          new: customerName || "",
        };
      }

      if ((oldReceipt.mobile || "") !== (mobile || "")) {
        changes.mobile = {
          old: oldReceipt.mobile || "",
          new: mobile || "",
        };
      }

      if ((oldReceipt.eventDate || "") !== (eventDate || "")) {
        changes.eventDate = {
          old: oldReceipt.eventDate || "",
          new: eventDate || "",
        };
      }

      if ((oldReceipt.subParticularNature || "") !== (subParticularNature || "")) {
        changes.subParticularNature = {
          old: oldReceipt.subParticularNature || "",
          new: subParticularNature || "",
        };
      }

      if (oldReceipt.paymentFor !== paymentFor)
        changes.paymentFor = { old: oldReceipt.paymentFor, new: paymentFor };

      if ((oldReceipt.particularNature || "") !== (particularNature || "")) {
        changes.particularNature = {
          old: oldReceipt.particularNature || "",
          new: particularNature || "",
        };
      }

      if ((oldReceipt.description || "") !== (description || ""))
        changes.description = {
          old: oldReceipt.description || "",
          new: description || "",
        };

      if ((oldReceipt.cashTo || "") !== (cashTo || ""))
        changes.cashTo = {
          old: oldReceipt.cashTo || "",
          new: cashTo || "",
        };

      if ((oldReceipt.mode || "") !== (mode || ""))
        changes.mode = {
          old: oldReceipt.mode || "",
          new: mode || "",
        };

      if ((oldReceipt.bankMode || "") !== (bankMode || ""))
        changes.bankMode = {
          old: oldReceipt.bankMode || "",
          new: bankMode || "",
        };

      if ((oldReceipt.chequeNo || "") !== (chequeNo || ""))
        changes.chequeNo = {
          old: oldReceipt.chequeNo || "",
          new: chequeNo || "",
        };

      /* ===============================
         3️⃣ NEXT updateLog NUMBER
      =============================== */
      const existingLogs = Object.keys(oldReceipt).filter(k =>
        k.startsWith("updateLog")
      );
      const nextLogKey = `updateLog${existingLogs.length + 1}`;

      /* ===============================
         4️⃣ EDITOR INFO
      =============================== */
      const authUser = getAuth().currentUser;
      const editor = {
        email: authUser?.email || "unknown",
        at: new Date().toISOString(),
      };

      /* ===============================
         4.5️⃣ UPDATE SL COUNTER IF MODE CHANGED
      =============================== */
      if (mode !== undefined && oldReceipt.mode !== mode) {
        try {
          const counterRef = doc(db, 'settings', 'slCounter');
          await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            if (counterDoc.exists()) {
              const data = counterDoc.data();

              const getCounterField = (m, type, payFor) => {
                if (payFor === 'Refund') return 'refundMoneyReceipt';
                if (type === 'Voucher') return 'otherMoneyReceipt';
                if (m === 'Cash') return 'cashMoneyReceipt';
                return 'moneyReceipt';
              };

              const oldField = getCounterField(oldReceipt.mode, oldReceipt.type, oldReceipt.paymentFor);
              const newField = getCounterField(mode, oldReceipt.type, paymentFor !== undefined ? paymentFor : oldReceipt.paymentFor);

              if (oldField !== newField) {
                const oldVal = data[oldField] || 0;
                const newVal = data[newField] || 0;
                transaction.update(counterRef, {
                  [oldField]: Math.max(0, oldVal - 1),
                  [newField]: newVal + 1
                });
              }
            }
          });
          console.log("✅ slCounter updated due to mode change");
        } catch (counterErr) {
          console.error("Error updating slCounter:", counterErr);
        }
      }

      /* ===============================
         5️⃣ UPDATE moneyReceipts + LOG
      =============================== */
      await updateDoc(receiptRef, {
        [`${id}.amount`]: amount,
        [`${id}.receiptDate`]: receiptDate,
        [`${id}.amountWords`]: numberToWords(Number(amount)),
        ...(customerName !== undefined && { [`${id}.customerName`]: customerName }),
        ...(mobile !== undefined && { [`${id}.mobile`]: mobile }),
        ...(eventDate !== undefined && { [`${id}.eventDate`]: eventDate }),
        ...(description !== undefined && { [`${id}.description`]: description }),
        ...(cashTo !== undefined && { [`${id}.cashTo`]: cashTo }),
        ...(mode !== undefined && { [`${id}.mode`]: mode }),
        ...(bankMode !== undefined && { [`${id}.bankMode`]: bankMode }),
        ...(chequeNo !== undefined && { [`${id}.chequeNo`]: chequeNo }),
        ...(manualSlNo !== undefined && { [`${id}.manualSlNo`]: manualSlNo }),
        ...(particularNature !== undefined && { [`${id}.particularNature`]: particularNature }),
        ...(paymentFor !== undefined && { [`${id}.paymentFor`]: paymentFor }),
        ...(subParticularNature !== undefined && subParticularNature !== null && { [`${id}.subParticularNature`]: subParticularNature }),
        ...(Object.keys(changes).length > 0 && {
          [`${id}.${nextLogKey}`]: {
            by: editor,
            changes,
          },
        }),
      });

      console.log("✅ moneyReceipts updated with log");

      /* ===============================
         6️⃣ FIND SOURCE (prebookings / vendor / decoration)
      =============================== */
      const collections = ["prebookings", "vendor", "decoration", "roomBookings"];

      let found = null;

      for (const col of collections) {
        const snapCol = await getDocs(collection(db, col));

        for (const docSnap of snapCol.docs) {
          const docId = docSnap.id;
          const data = docSnap.data();

          for (const [bookingId, bookingData] of Object.entries(data)) {

            // ❌ skip meta fields
            if (
              bookingId === "updatedAt" ||
              typeof bookingData !== "object" ||
              Array.isArray(bookingData)
            ) continue;

            // 🔥 Decide correct payment array
            const paymentsArray =
              col === "roomBookings"
                ? bookingData?.payments
                : bookingData?.advancePayments;

            if (!Array.isArray(paymentsArray)) continue;

            const idx = paymentsArray.findIndex(
              p => String(p.slNo) === String(slNo)
            );

            if (idx !== -1) {
              found = {
                col,
                docId,
                bookingId,
                paymentsArray,
                idx,
              };
              break;
            }
          }
          if (found) break;
        }
        if (found) break;
      }

      /* ===============================
         7️⃣ UPDATE SOURCE ADVANCE PAYMENT
      =============================== */
      if (found) {
        const { col, docId, bookingId, paymentsArray, idx } = found;

        paymentsArray[idx] = {
          ...paymentsArray[idx],
          amount,
          receiptDate,
          paymentFor,
          customerName,
          mobile,
          eventDate,
          ...(description !== undefined && { description }),
          ...(cashTo !== undefined && { cashTo }),
          ...(mode !== undefined && { mode }),
          ...(bankMode !== undefined && { bankMode }),
          ...(chequeNo !== undefined && { chequeNo }),
          ...(manualSlNo !== undefined && { manualSlNo }),
          ...(particularNature !== undefined && { particularNature }),
          ...(subParticularNature !== undefined && { subParticularNature }),

          updatedAt: new Date().toISOString(),
        };

        const fieldName =
          col === "roomBookings" ? "payments" : "advancePayments";

        await updateDoc(doc(db, col, docId), {
          [`${bookingId}.${fieldName}`]: paymentsArray,
        });

        console.log(`✅ ${col} payment updated`);
      }

    } catch (err) {
      console.error("❌ Update failed:", err);
      alert("❌ Receipt update failed");
    }
  };

  const openPopup = (receipt) => {
    setSelectedReceipt({
      ...receipt,
      source:
        receipt.source ??
        (receipt.particularNature === "Event Royalty"
          ? "vendor"
          : receipt.particularNature === "Decoration Royalty"
            ? "decoration"
            : "prebookings"),
    });
    setNewAmount(receipt.amount ?? 0);
    setNewDescription(receipt.description ?? "");
    setNewDate(receipt.receiptDate ?? "");
    setNewCashTo(receipt.cashTo ?? "");
    setNewManualSlNo(receipt.manualSlNo ?? "");
    setNewParticularNature(receipt.particularNature ?? "");
    setNewMode(receipt.mode ?? "");
    setNewBankMode(receipt.bankMode || "RTGS/NEFT");
    setNewChequeNo(receipt.chequeNo || "");
    setNewPaymentFor(receipt.paymentFor || "");
    setShowPopup(true);
    setNewSubParticular(receipt.subParticularNature || "");
    setCustomSubParticular("");
    setNewCustomerName(receipt.customerName || receipt.partyName || "");
    setNewMobile(receipt.mobile || "");
    setNewEventDate(receipt.eventDate || "");
  };

  const handleSave = async () => {
    if (!selectedReceipt) return;

    const effectiveMode = newMode || selectedReceipt.mode;

    if (effectiveMode === "Cash" && !newCashTo) {
      alert("⚠️ Cash mode selected — please select Cash To");
      return;
    }

    try {
      setIsSaving(true); // 🔥 Start loading

      const payload = {
        ...selectedReceipt,
        customerName: newCustomerName,
        mobile: newMobile,
        eventDate: newEventDate,
        bookingId: selectedReceipt.bookingId || null,
        source: selectedReceipt.source || "prebookings",
        amount: Number(newAmount),
        description: newDescription,
        receiptDate: newDate || selectedReceipt.receiptDate,
        mode: newMode || selectedReceipt.mode || null,
        bankMode: (newMode || selectedReceipt.mode) !== "Cash" ? newBankMode : "",
        chequeNo: ((newMode || selectedReceipt.mode) !== "Cash" && newBankMode === "Cheque") ? newChequeNo : "",
        paymentFor: newPaymentFor || selectedReceipt.paymentFor,
        cashTo:
          (newMode || selectedReceipt.mode) === "Cash"
            ? newCashTo || null
            : null,
        manualSlNo: newManualSlNo || null,

        // 👇 YEH ADD KAR
        amountWords: numberToWords(Number(newAmount)),


        particularNature: (
          newParticularNature || customNature || selectedReceipt.particularNature || ""
        ).trim(),

        subParticularNature: (
          customSubParticular ||
          newSubParticular ||
          selectedReceipt.subParticularNature ||
          ""
        ).trim() || null,

      };

      await handleUpdateReceipt(payload);

      setShowPopup(false);

    } catch (err) {
      console.error(err);
      alert("❌ Save failed");
    } finally {
      setIsSaving(false); // 🔥 Stop loading
    }
  };

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

  const canEditReceipt = (receiptDate, userAppType) => {

    if (userAppType === "A" || userAppType === "B") return true;

    if (!receiptDate) return false;

    const receiptTime = new Date(receiptDate).getTime();
    const now = Date.now();

    const SIX_HRS = 12 * 60 * 60 * 1000;

    return now - receiptTime <= SIX_HRS;
  };

  const handleDeleteReceipt = async (receipt) => {
    if (!window.confirm("❌ Are you sure you want to DELETE this receipt?")) return;

    try {
      const { id, monthYear, slNo } = receipt;

      /* ===============================
         1️⃣ DELETE FROM moneyReceipts
      =============================== */
      const receiptRef = doc(db, "moneyReceipts", monthYear);

      await updateDoc(receiptRef, {
        [id]: deleteField(),
      });

      console.log("✅ Deleted from moneyReceipts");

      /* ===============================
         2️⃣ DELETE FROM SOURCE COLLECTION
      =============================== */
      const collections = ["prebookings", "vendor", "decoration", "roomBookings"];

      for (const col of collections) {
        const snapCol = await getDocs(collection(db, col));

        for (const docSnap of snapCol.docs) {
          const docId = docSnap.id;
          const data = docSnap.data();

          for (const [bookingId, bookingData] of Object.entries(data)) {

            if (
              bookingId === "updatedAt" ||
              typeof bookingData !== "object" ||
              Array.isArray(bookingData)
            ) continue;

            const paymentsField =
              col === "roomBookings" ? "payments" : "advancePayments";

            const arr = bookingData?.[paymentsField];
            if (!Array.isArray(arr)) continue;

            const newArr = arr.filter(p => String(p.slNo) !== String(slNo));

            if (newArr.length !== arr.length) {
              await updateDoc(doc(db, col, docId), {
                [`${bookingId}.${paymentsField}`]: newArr,
              });

              console.log(`✅ Deleted from ${col}`);
              return;
            }
          }
        }
      }

    } catch (err) {
      console.error("❌ Delete failed:", err);
      alert("❌ Failed to delete receipt");
    }
  };

  const handleVerifyReceipt = async (receipt) => {
    try {
      const { id, monthYear, verified } = receipt;

      const receiptRef = doc(db, "moneyReceipts", monthYear);

      await updateDoc(receiptRef, {
        [`${id}.verified`]: !verified,
        [`${id}.verifiedAt`]: new Date().toISOString(),
        [`${id}.verifiedBy`]: getAuth().currentUser?.email || "unknown",
      });

      console.log("✅ Verification updated");
    } catch (err) {
      console.error("❌ Verification failed:", err);
      alert("Verification failed");
    }
  };

  const buildExcelData = (type) => {

    const formatAmount = (val) =>
      Number(val || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const grouped = {};

    finalReceipts.forEach(r => {
      const key =
        ["Event Royalty", "Decoration Royalty"].includes(r.particularNature)
          ? r.particularNature
          : (r.eventType || r.particularNature || "Others");

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });

    // SUMMARY
    if (type === "summary") {

      const rows = [];
      rows.push(["Sl", "Particular Nature", "Credit (INR)", "Debit (INR)"]);

      // 🔥 Pehle sort karenge (Credit balance > 0 upar)
      const sortedEntries = Object.entries(grouped).sort(([titleA, dataA], [titleB, dataB]) => {

        const calcBalance = (data) => {
          let credit = 0;
          let debit = 0;
          data.forEach(r => {
            const amt = Number(r.amount || 0);
            if (r.paymentFor === "Credit") credit += amt;
            if (r.paymentFor === "Debit") debit += amt;
          });
          return credit - debit;
        };

        return calcBalance(dataB) - calcBalance(dataA); // Descending
      });

      sortedEntries.forEach(([title, data], index) => {

        let credit = 0;
        let debit = 0;

        data.forEach(r => {
          const amt = Number(r.amount || 0);
          if (r.paymentFor === "Credit") credit += amt;
          if (r.paymentFor === "Debit") debit += amt;
        });

        rows.push([
          index + 1,
          title,
          credit ? formatAmount(credit) : "",
          debit ? formatAmount(debit) : ""
        ]);
      });

      return rows;
    }

    // DETAILS → just return grouped data
    if (type === "details") {
      return grouped;
    }

    // OVERALL
    if (type === "overall") {
      const rows = [];
      rows.push([
        "Sl",
        "Receipt Date",
        "Particular Nature",
        "Receipt Type",
        "Name",
        "Auto Sl",
        "Manual Sl",
        "Description",
        "Mobile",
        "Credit",
        "Debit",
      ]);

      finalReceipts.forEach((r, i) => {
        rows.push([
          i + 1,
          r.receiptDate ? formatDate(r.receiptDate) : "",
          r.eventType || r.particularNature || "",
          getReceiptLabel(r),
          r.customerName || r.partyName || "",
          r.slNo || "",
          r.manualSlNo || "",
          r.description || "",
          r.mobile || "",
          r.paymentFor === "Credit" ? formatAmount(r.amount) : "",
          r.paymentFor === "Debit" ? formatAmount(r.amount) : "",
        ]);
      });

      return rows;
    }

  };

  const formatFilterDate = (dateStr) => {
    if (!dateStr) return "";

    const d = new Date(dateStr);

    return d.toLocaleDateString("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).replace(/\//g, "-"); // 🔥 converts to DD-MM-YYYY
  };

  const handleDownloadPDF = () => {

    if (pdfTypes.length === 0) {
      alert("⚠️ Select at least one section");
      return;
    }

    const doc = new jsPDF("l", "pt");
    let startY = 40;

    const formatAmount = (val) =>

      Number(val || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    // ===============================
    // 🔹 OVERALL TOTALS
    // ===============================

    const overallCredit = finalReceipts
      .filter(r => r.paymentFor === "Credit")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const overallDebit = finalReceipts
      .filter(r => r.paymentFor === "Debit")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const overallBalance = overallCredit - overallDebit;

    // ===============================
    // 🔹 FILTER DESCRIPTION
    // ===============================

    let filtersUsed = [];

    if (dateFrom || dateTo)
      filtersUsed.push(
        `Date: ${dateFrom ? formatFilterDate(dateFrom) : "Start"} to ${dateTo ? formatFilterDate(dateTo) : "End"
        }`
      );

    if (selectedFY)
      filtersUsed.push(`FY: ${selectedFY}`);

    if (typeFilter.length)
      filtersUsed.push(`Type: ${typeFilter.join(", ")}`);

    if (creditDebitFilter.length)
      filtersUsed.push(`Credit/Debit: ${creditDebitFilter.join(", ")}`);

    if (modeFilter.length)
      filtersUsed.push(`Mode: ${modeFilter.join(", ")}`);

    if (cashToFilter.length)
      filtersUsed.push(`Cash To: ${cashToFilter.join(", ")}`);

    if (groupFilter !== "All")
      filtersUsed.push(`Group: ${groupFilter}`);

    if (debouncedSearch)
      filtersUsed.push(`Search: "${debouncedSearch}"`);

    const filterText = filtersUsed.length ? filtersUsed.join(" | ") : "No Filters Applied";

    // 🔹 SUMMARY TOTALS (Filtered Particular Nature)

    let totalCredit = 0;
    let totalDebit = 0;

    finalReceipts.forEach(r => {
      const amt = Number(r.amount || 0);
      if (r.paymentFor === "Credit") totalCredit += amt;
      if (r.paymentFor === "Debit") totalDebit += amt;
    });

    // ===============================
    // 🔹 HEADER
    // ===============================

    doc.setFontSize(18);
    doc.setTextColor(100);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");

    const pageWidth = doc.internal.pageSize.getWidth();

    doc.text(
      `Generated On: ${getISTDateTime()}`,
      pageWidth / 2,
      startY,
      { align: "center" }
    );

    startY += 30;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(200, 0, 0);
    doc.text("Receipts Report", 40, startY);
    startY += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(`Filters: ${filterText}`, 40, startY + 15);
    startY += 20;

    doc.setTextColor(0, 0, 0);
    startY += 20;

    // ===============================
    // 🔹 OPENING BALANCE (FIXED VERSION)
    // ===============================

    const getFilterMatch = (r, isBefore = false) => {
      if (!r.receiptDate) return false;
      const d = toISTDate(r.receiptDate);
      if (!d) return false;

      if (isBefore) {
        if (!dateFrom) return false;
        if (d >= toISTDate(dateFrom)) return false;
      }

      // 🔍 SEARCH
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        const searchable =
          `${r.customerName} ${r.partyName} ${r.mobile} ${r.slNo} ${r.type} ${r.particularNature} ${r.description}`.toLowerCase();
        if (!searchable.includes(s)) return false;
      }

      // 🧾 TYPE FILTER
      if (typeFilter.length > 0) {
        const match = typeFilter.some(filterType => {
          const type = (r.type || "").toLowerCase();
          const mode = (r.mode || "").toLowerCase();
          const paymentFor = (r.paymentFor || "").toLowerCase();
          if (filterType === "Cash") return type.includes("cash") && mode === "cash";
          if (filterType === "Bank") return type.includes("money") && mode !== "cash";
          if (filterType === "Refund") return type.includes("money") && paymentFor === "debit";
          if (filterType === "Voucher") return type.includes("voucher");
          return false;
        });
        if (!match) return false;
      }

      // 💰 CREDIT / DEBIT
      if (creditDebitFilter.length > 0) {
        if (!creditDebitFilter.includes(r.paymentFor)) return false;
      }

      // 🏦 MODE
      if (modeFilter.length > 0) {
        if (!modeFilter.includes(r.mode)) return false;
      }

      // 💵 CASH TO
      if (cashToFilter.length > 0) {
        if (!(r.mode === "Cash" && cashToFilter.includes(r.cashTo))) return false;
      }

      // 📆 FINANCIAL YEAR
      if (selectedFY) {
        const [start, end] = selectedFY.split('-').map(Number);
        const fyStart = new Date(start, 3, 1);
        const fyEnd = new Date(end, 2, 31, 23, 59, 59);
        if (d < fyStart || d > fyEnd) return false;
      }

      // 🎯 GROUP FILTER
      if (groupFilter.length > 0) {
        const eventType = (r.eventType || "").trim().toLowerCase();
        const particular = (r.particularNature || "").trim().toLowerCase();
        const match = groupFilter.some(g => eventType === g || particular === g);
        if (!match) return false;
      }

      // 🔹 SUB GROUP FILTER
      if (subGroupFilter.length > 0) {
        const sub = (r.subParticularNature || "").trim().toLowerCase();
        if (!subGroupFilter.includes(sub)) return false;
      }

      return true;
    };

    const receiptsBefore = dateFrom ? receipts.filter(r => getFilterMatch(r, true)) : [];

    const openingCredit = receiptsBefore
      .filter(r => r.paymentFor === "Credit")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const openingDebit = receiptsBefore
      .filter(r => r.paymentFor === "Debit")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const openingBalance = openingCredit - openingDebit;

    const computeRunningData = (list, initialOpening) => {
      const sorted = [...list].sort((a, b) => new Date(a.receiptDate || 0) - new Date(b.receiptDate || 0));
      let currentBalance = initialOpening;
      const results = sorted.map(r => {
        const amt = Number(r.amount || 0);
        const isCredit = r.paymentFor === "Credit";
        const opening = currentBalance;
        const credit = isCredit ? amt : 0;
        const debit = isCredit ? 0 : amt;
        currentBalance = opening + credit - debit;
        return { ...r, opening, credit, debit, total: currentBalance };
      });
      return results.sort((a, b) => new Date(b.receiptDate || 0) - new Date(a.receiptDate || 0));
    };

    const closingBalance = openingBalance + overallBalance;

    autoTable(doc, {
      head: [[
        `${dateFrom ? formatFilterDate(dateFrom) : "Start"} - Opening (INR)`,
        "Credit (INR)",
        "Debit (INR)",
        `${dateTo ? formatFilterDate(dateTo) : "End"} - Total (INR)`
      ]],

      body: [[
        formatAmount(openingBalance),
        formatAmount(overallCredit),
        formatAmount(overallDebit),
        formatAmount(closingBalance)
      ]],
      startY,
      styles: {
        halign: "center",
        fontSize: 12,
        cellPadding: 8,
        fontStyle: "bold"
      },
      headStyles: {
        fillColor: [46, 105, 153],
        textColor: 255
      },
      didParseCell: function (data) {
        if (data.section === "body") {
          if (overallCredit > overallDebit) {
            data.cell.styles.textColor = [0, 140, 0];
            data.cell.styles.fillColor = [235, 255, 235];
          }
          else if (overallDebit > overallCredit) {
            data.cell.styles.textColor = [200, 0, 0];
            data.cell.styles.fillColor = [255, 235, 235];
          }
          else {
            data.cell.styles.textColor = [0, 0, 0];
            data.cell.styles.fillColor = [255, 255, 255];
          }
        }
      },
      theme: "grid"
    });

    startY = doc.lastAutoTable.finalY + 25;

    // =========================================================
    // 🔥 LOOP SECTIONS (summary / details / overall)
    // =========================================================

    pdfTypes.forEach((type, index) => {

      if (index !== 0) {
        doc.addPage();
        startY = 40;
      }

      // ===============================
      // 🔹 SUMMARY SECTION
      // ===============================

      if (type === "summary") {

        doc.setFontSize(14);
        doc.text("PARTICULAR  NATURES", 40, startY);
        startY += 20;

        // 🔹 TOP SUMMARY STRIP (Like Image)

        autoTable(doc, {
          head: [["Opening (INR)", "Credit (INR)", "Debit (INR)", "Total (INR)"]],
          body: [[
            formatAmount(openingBalance),
            formatAmount(totalCredit),
            formatAmount(totalDebit),
            formatAmount(openingBalance + totalCredit - totalDebit)
          ]],
          startY,
          styles: {
            halign: "center",
            fontSize: 12,
            cellPadding: 10,
            fontStyle: "bold"
          },
          headStyles: {
            fillColor: [220, 220, 220],
            textColor: 0
          },
          didParseCell: function (data) {

            if (data.section === "body") {

              if (totalCredit > totalDebit) {
                data.cell.styles.textColor = [0, 140, 0];
                data.cell.styles.fillColor = [235, 255, 235];
              }
              else if (totalDebit > totalCredit) {
                data.cell.styles.textColor = [200, 0, 0];
                data.cell.styles.fillColor = [255, 235, 235];
              }
              else {
                data.cell.styles.textColor = [0, 0, 0];
                data.cell.styles.fillColor = [255, 255, 255];
              }
            }
          },
          theme: "grid"
        });
        const tableWidth = doc.internal.pageSize.getWidth() - 80;
        const tableHeight = doc.lastAutoTable.finalY - startY + 12;

        doc.setDrawColor(180);
        doc.setFillColor(230, 230, 230);

        // Rounded rectangle
        doc.roundedRect(
          40,                    // X
          startY,            // Y
          tableWidth,            // Width
          tableHeight,           // Height
          8,                     // Radius X
          8,                     // Radius Y
          "S"                    // Stroke
        );

        startY = doc.lastAutoTable.finalY;

        const groupedForSummary = {};
        finalReceipts.forEach(r => {
          const title = ["Event Royalty", "Decoration Royalty"].includes(r.particularNature)
            ? r.particularNature
            : (r.eventType || r.particularNature || "Others");
          if (!groupedForSummary[title]) groupedForSummary[title] = [];
          groupedForSummary[title].push(r);
        });

        const summaryRows = Object.entries(groupedForSummary).map(([title, data]) => {
          const groupOpening = receiptsBefore.filter(r => {
            const rTitle = ["Event Royalty", "Decoration Royalty"].includes(r.particularNature)
              ? r.particularNature
              : (r.eventType || r.particularNature || "Others");
            return rTitle === title;
          }).reduce((sum, r) => {
            const amt = Number(r.amount || 0);
            return r.paymentFor === "Credit" ? sum + amt : sum - amt;
          }, 0);

          const groupCredit = data.filter(r => r.paymentFor === "Credit").reduce((sum, r) => sum + Number(r.amount || 0), 0);
          const groupDebit = data.filter(r => r.paymentFor === "Debit").reduce((sum, r) => sum + Number(r.amount || 0), 0);
          const groupTotal = groupOpening + groupCredit - groupDebit;

          return { title, opening: groupOpening, credit: groupCredit, debit: groupDebit, total: groupTotal };
        }).sort((a, b) => b.total - a.total);

        const summaryBody = summaryRows.map((row, i) => [
          i + 1,
          row.title,
          formatAmount(row.opening),
          formatAmount(row.credit),
          formatAmount(row.debit),
          formatAmount(row.total)
        ]);

        autoTable(doc, {
          head: [["Sl", "Particular Nature", "Opening", "Credit", "Debit", "Total"]],
          body: summaryBody,
          startY,
          styles: { fontSize: 9 },
          headStyles: {
            fillColor: [46, 105, 153],
            textColor: 255
          },
          didParseCell: function (data) {
            if (data.section === "body") {
              const creditRaw = data.row.raw[3];
              const debitRaw = data.row.raw[4];
              const credit = Number((creditRaw || "0").toString().replace(/,/g, ""));
              const debit = Number((debitRaw || "0").toString().replace(/,/g, ""));

              if (credit > debit) {
                data.cell.styles.textColor = [0, 140, 0];
                data.cell.styles.fillColor = [235, 255, 235];
              }
              else if (debit > credit) {
                data.cell.styles.textColor = [200, 0, 0];
                data.cell.styles.fillColor = [255, 235, 235];
              }
              else {
                data.cell.styles.textColor = [0, 0, 0];
                data.cell.styles.fillColor = [255, 255, 255];
              }
            }
          },
          theme: "grid"
        });

        startY = doc.lastAutoTable.finalY + 20;
        return;
      }

      // ===============================
      // 🔹 DETAILS SECTION
      // ===============================

      if (type === "details") {

        const grouped = buildExcelData("details");

        Object.entries(grouped).forEach(([title, data]) => {

          if (startY > 500) {
            doc.addPage();
            startY = 40;
          }

          // 🔹 Section Title
          doc.setFontSize(13);
          doc.setTextColor(0, 0, 0);
          doc.text(title.toUpperCase(), 40, startY);
          startY += 15;

          // 🔹 Calculate Totals
          const groupCredit = data
            .filter(r => r.paymentFor === "Credit")
            .reduce((sum, r) => sum + Number(r.amount || 0), 0);

          const groupDebit = data
            .filter(r => r.paymentFor === "Debit")
            .reduce((sum, r) => sum + Number(r.amount || 0), 0);

          const groupBalance = groupCredit - groupDebit;

          // 🔹 Calculate Group Opening Balance
          const groupOpeningBalance = receiptsBefore.filter(r => {
            const rTitle = ["Event Royalty", "Decoration Royalty"].includes(r.particularNature)
              ? r.particularNature
              : (r.eventType || r.particularNature || "Others");
            return rTitle === title;
          }).reduce((sum, r) => {
            const amt = Number(r.amount || 0);
            return r.paymentFor === "Credit" ? sum + amt : sum - amt;
          }, 0);

          const groupClosingBalance = groupOpeningBalance + groupBalance;

          // 🔹 Beautiful Summary Table (Bordered)
          autoTable(doc, {
            head: [["Opening (INR)", "Credit (INR)", "Debit (INR)", "Total (INR)"]],
            body: [[
              formatAmount(groupOpeningBalance),
              formatAmount(groupCredit),
              formatAmount(groupDebit),
              formatAmount(groupClosingBalance)
            ]],
            startY,
            styles: {
              halign: "center",
              fontSize: 10,
              cellPadding: 6
            },
            headStyles: {
              fillColor: [230, 230, 230],
              textColor: 0,
              fontStyle: "bold"
            },
            didParseCell: function (data) {
              if (data.section === "body") {
                if (groupCredit > groupDebit) {
                  data.cell.styles.textColor = [0, 140, 0];
                  data.cell.styles.fillColor = [235, 255, 235];
                }
                else if (groupDebit > groupCredit) {
                  data.cell.styles.textColor = [200, 0, 0];
                  data.cell.styles.fillColor = [255, 235, 235];
                }
                else {
                  data.cell.styles.textColor = [0, 0, 0];
                  data.cell.styles.fillColor = [255, 255, 255];
                }
              }
            },
            theme: "grid"
          });

          const tableWidth = doc.internal.pageSize.getWidth() - 80;
          const tableHeight = doc.lastAutoTable.finalY - startY + 12;

          doc.setDrawColor(180);
          doc.setFillColor(230, 230, 230);

          // Rounded rectangle
          doc.roundedRect(
            40,                    // X
            startY,            // Y
            tableWidth,            // Width
            tableHeight,           // Height
            8,                     // Radius X
            8,                     // Radius Y
            "S"                    // Stroke
          );

          startY = doc.lastAutoTable.finalY;

          // 🔹 Main Detail Table (Running Balance)
          const runningData = computeRunningData(data, groupOpeningBalance);

          const body = runningData.map((r, i) => [
            runningData.length - i,
            r.receiptDate ? formatDate(r.receiptDate) : "",
            r.customerName || r.partyName || "",
            r.slNo || "",
            r.manualSlNo || "",
            r.description || "",
            formatAmount(r.opening),
            formatAmount(r.credit),
            formatAmount(r.debit),
            formatAmount(r.total),
          ]);

          autoTable(doc, {
            head: [[
              "Sl",
              "Date",
              "Name",
              "Auto Sl",
              "Manual Sl",
              "Description",
              "Opening",
              "Credit",
              "Debit",
              "Total",
            ]],
            body,
            startY,
            styles: { fontSize: 8 },
            headStyles: {
              fillColor: [46, 105, 153],
              textColor: 255
            },
            didParseCell: function (data) {
              if (data.section === "body") {
                const creditRaw = data.row.raw[7];
                const debitRaw = data.row.raw[8];
                const credit = Number((creditRaw || "0").toString().replace(/,/g, ""));
                const debit = Number((debitRaw || "0").toString().replace(/,/g, ""));

                if (credit > debit) {
                  data.cell.styles.textColor = [0, 140, 0];
                  data.cell.styles.fillColor = [235, 255, 235];
                }
                else if (debit > credit) {
                  data.cell.styles.textColor = [200, 0, 0];
                  data.cell.styles.fillColor = [255, 235, 235];
                }
                else {
                  data.cell.styles.textColor = [0, 0, 0];
                  data.cell.styles.fillColor = [255, 255, 255];
                }
              }
            },
            theme: "grid"
          });

          startY = doc.lastAutoTable.finalY + 20;

          // 🔥 DOTTED LINE
          const pageWidth = doc.internal.pageSize.getWidth();

          doc.setDrawColor(160);
          doc.setLineWidth(0.8);
          doc.setLineDashPattern([3, 3], 0);

          doc.line(
            40,
            startY,
            pageWidth - 40,
            startY
          );

          doc.setLineDashPattern([], 0);

          startY += 20; // spacing after line

        });

        return;
      }

      // ===============================
      // 🔹 OVERALL SECTION
      // ===============================

      if (type === "overall") {

        if (startY > 500) {
          doc.addPage();
          startY = 40;
        }

        doc.setFontSize(14);
        doc.text("OVERALL REPORT", 40, startY);
        startY += 15;

        // 🔹 Summary Box Table
        autoTable(doc, {
          head: [[
            `${dateFrom ? formatFilterDate(dateFrom) : "Start"} - Opening (INR)`,
            "Credit (INR)",
            "Debit (INR)",
            `${dateTo ? formatFilterDate(dateTo) : "End"} - Total (INR)`
          ]],

          body: [[
            formatAmount(openingBalance),
            formatAmount(overallCredit),
            formatAmount(overallDebit),
            formatAmount(closingBalance)
          ]],
          startY,
          styles: {
            halign: "center",
            fontSize: 12,
            cellPadding: 8,
            fontStyle: "bold"
          },
          headStyles: {
            fillColor: [230, 230, 230],
            textColor: 0,
            fontStyle: "bold"
          },
          didParseCell: function (data) {

            if (data.section === "body") {

              if (overallCredit > overallDebit) {
                data.cell.styles.textColor = [0, 140, 0];
                data.cell.styles.fillColor = [235, 255, 235];
              }
              else if (overallDebit > overallCredit) {
                data.cell.styles.textColor = [200, 0, 0];
                data.cell.styles.fillColor = [255, 235, 235];
              }
              else {
                data.cell.styles.textColor = [0, 0, 0];
                data.cell.styles.fillColor = [255, 255, 255];
              }
            }
          },
          theme: "grid"
        });

        startY = doc.lastAutoTable.finalY + 0;

        // 🔹 Main Table (Running Balance)
        const overallRunningData = computeRunningData(finalReceipts, openingBalance);

        const overallBody = overallRunningData.map((r, i) => [
          overallRunningData.length - i,
          r.receiptDate ? formatDate(r.receiptDate) : "",
          r.eventType || r.particularNature || "",
          r.customerName || r.partyName || "",
          r.slNo || "",
          r.manualSlNo || "",
          r.description || "",
          formatAmount(r.opening),
          formatAmount(r.credit),
          formatAmount(r.debit),
          formatAmount(r.total),
        ]);

        autoTable(doc, {
          head: [[
            "Sl",
            "Date",
            "Particular Nature",
            "Name",
            "Auto Sl",
            "Manual Sl",
            "Description",
            "Opening",
            "Credit",
            "Debit",
            "Total",
          ]],
          body: overallBody,
          startY,
          styles: { fontSize: 8 },
          headStyles: {
            fillColor: [46, 105, 153],
            textColor: 255
          },
          didParseCell: function (data) {
            if (data.section === "body") {
              const creditRaw = data.row.raw[8];
              const debitRaw = data.row.raw[9];
              const credit = Number((creditRaw || "0").toString().replace(/,/g, ""));
              const debit = Number((debitRaw || "0").toString().replace(/,/g, ""));

              if (credit > debit) {
                data.cell.styles.textColor = [0, 140, 0];
                data.cell.styles.fillColor = [235, 255, 235];
              }
              else if (debit > credit) {
                data.cell.styles.textColor = [200, 0, 0];
                data.cell.styles.fillColor = [255, 235, 235];
              }
              else {
                data.cell.styles.textColor = [0, 0, 0];
                data.cell.styles.fillColor = [255, 255, 255];
              }
            }
          },
          theme: "grid"
        });

        startY = doc.lastAutoTable.finalY + 30;
      }

    });

    doc.save(`Money_Receipts_${Date.now()}.pdf`);
  };

  const openGroupEditPopup = (name) => {
    setOldGroupName(name);
    setNewGroupName(name);
    setShowGroupPopup(true);
  };

  const handleBulkGroupUpdate = async () => {
    if (!newGroupName.trim()) {
      alert("Enter valid name");
      return;
    }

    try {
      const snapshot = await getDocs(collection(db, "moneyReceipts"));

      for (const docSnap of snapshot.docs) {

        const monthYear = docSnap.id;
        const data = docSnap.data();
        const updates = {};

        Object.entries(data).forEach(([receiptId, receipt]) => {

          if (!receipt || typeof receipt !== "object") return;

          const eventType = (receipt.eventType || "").trim();
          const particular = (receipt.particularNature || "").trim();
          const subParticular = (receipt.subParticularNature || "").trim();

          if (eventType.toLowerCase() === oldGroupName.toLowerCase()) {
            updates[`${receiptId}.eventType`] = newGroupName;
          }

          if (particular.toLowerCase() === oldGroupName.toLowerCase()) {
            updates[`${receiptId}.particularNature`] = newGroupName;
          }

          if (subParticular.toLowerCase() === oldGroupName.toLowerCase()) {
            updates[`${receiptId}.subParticularNature`] = newGroupName;
          }

        });

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, "moneyReceipts", monthYear), updates);
        }
      }

      alert("✅ Group updated everywhere!");
      setShowGroupPopup(false);

    } catch (err) {
      console.error(err);
      alert("❌ Update failed");
    }
  };

  useEffect(() => {

    if (!newParticularNature) {
      setSubParticularOptions([]);
      return;
    }

    const set = new Set();

    receipts.forEach(r => {

      if (
        r.particularNature?.trim().toLowerCase() ===
        newParticularNature.trim().toLowerCase()
      ) {
        if (r.subParticularNature) {
          set.add(r.subParticularNature.trim());
        }
      }

    });

    setSubParticularOptions(Array.from(set).sort());

  }, [newParticularNature, receipts]);

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
            fontWeight: '600'
          }}
        >
          <td style={{ fontWeight: '600', color: 'black', backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>
            {finalReceipts.length - index}.
          </td>

          <td style={{ fontWeight: '600', backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>
            {r.receiptDate ? (
              <>
                <div>{formatDate(r.receiptDate)}</div>
              </>
            ) : ''}
          </td>

          <td style={{ fontWeight: '600', backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>
            {["Event Royalty", "Decoration Royalty"].includes(r.particularNature)
              ? r.particularNature
              : (r.eventType || r.particularNature)}
          </td>

          <td style={{ fontWeight: '600', backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>
            {r.subParticularNature}
          </td>

          <td style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", padding: "5px" }}>
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

            <button
              onClick={() => openPopup(r)}
              disabled={!canEditReceipt(r.receiptDate, userAppType)}
              style={{
                background: canEditReceipt(r.receiptDate, userAppType)
                  ? "#2e86de"
                  : "#ccc",
                color: "#fff",
                padding: "5px 10px",
                border: "none",
                borderRadius: "4px",
                cursor: canEditReceipt(r.receiptDate, userAppType)
                  ? "pointer"
                  : "not-allowed",
                opacity: canEditReceipt(r.receiptDate, userAppType) ? 1 : 0.6
              }}
            >
              Edit
            </button>
          </td>

          <td style={{ fontWeight: '600', backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>
            {(
              (r.type === "Money Receipt" || r.type === "Cash") &&
              r.mode !== "Cash" &&
              r.paymentFor === "Debit"
            )
              ? "Bank Debit"
              : r.type === "Money Receipt"
                ? "MR"
                : r.type === "Cash"
                  ? "MR"
                  : r.type === "Voucher"
                    ? "Voucher"
                    : r.type
            }
          </td>

          <td style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>{r.customerName || r.partyName}</td>

          <td style={{ fontWeight: '600', backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>
            {r.mode}
            {r.bankMode ? ` (${r.bankMode}${r.chequeNo ? ` - ${r.chequeNo}` : ''})` : ''}
          </td>

          <td style={{ fontWeight: '600', backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", }}>
            {r.cashTo}
          </td>

          <td style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff", width: "fit-content", }}>#{r.slNo}</td>

          <td style={{ width: "fit-content", backgroundColor: index % 2 === 0 ? "#ffffff" : "#eaf4ff" }}>{r.manualSlNo}</td>

          <td>{r.description ? r.description : "Advance Payment"}</td>

          <td>{r.paymentFor === "Credit" ? r.paymentFor : ""}</td>

          <td>{r.paymentFor === "Debit" ? r.paymentFor : ""}</td>

          <td>{r.mobile}</td>

          <td >{r.eventDate ? formatDate(r.eventDate) : ''}</td>

          <td style={{ textAlign: "center" }}>
            <button
              onClick={() => handleVerifyReceipt(r)}
              style={{
                padding: "5px 20px",
                border: "none",
                borderRadius: "4px",
                fontWeight: "600",
                cursor: "pointer",
                background: r.verified ? "#27ae60" : "#e74c3c",
                color: "#fff"
              }}
            >
              {r.verified ? "✔" : "X"}
            </button>

          </td>

          <td style={{ textAlign: "right" }}>
            ₹{Number(r.amount || 0).toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </td>

          <td style={{
            justifyContent: "center",
            background: "transparent",
            color: "#fff",
            padding: "0px",
            cursor: "pointer",
            width: "fit-content"
          }}>
            <LogPopupCell lead={r} />
          </td>

          <td>{r.receiver || r.myName || r.receiverName || r.sender}</td>

          <td style={{ fontSize: "12px", lineHeight: "16px" }}>
            {r.verified ? (
              <>
                <div>{r.verifiedBy || "-"}</div>
                <div style={{ fontSize: "11px", color: "#555" }}>
                  {r.verifiedAt
                    ? new Date(r.verifiedAt).toLocaleString("en-GB", {
                      timeZone: "Asia/Kolkata",
                    })
                    : "-"}
                </div>
              </>
            ) : (
              <span style={{ color: "red" }}>Not Verified</span>
            )}
          </td>

          <td> Approval: {r.approval || "Non"}, By: {r.approvedBy || "Default"} </td>

          <td style={{ display: "none" }}>
            <button
              onClick={() => handleDeleteReceipt(r)}
              disabled={userAppType !== "A"}
              style={{
                background: userAppType === "A" ? "#e74c3c" : "#ccc",
                cursor: userAppType === "A" ? "pointer" : "not-allowed",
              }}
            >
              Delete
            </button>
          </td>

        </tr>
      );
    });
  }, [
    finalReceipts,
    userAppType,
    currentPage,
    itemsPerPage,
    bankNames,
    handlePrint,
    handlePrintCash,
    handlePrintOther
  ]);

  return (
    <div className="page-scroller">

      <div className="receipts-container">
        <div style={{ marginBottom: '0px' }}> <BackButton /> </div>

        <div style={{ marginBottom: '10px' }}>
          <h2 className="title">Receipt Report</h2>
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

            <button
              onClick={() => setShowPDFPopup(true)}
              style={{
                padding: "10px 14px",
                backgroundColor: "#2e6999",
                color: "#fff",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
            >
              ⬇ PDF
            </button>

          </div>

        </div>

        <div>
          <div style={{ marginTop: '20px' }}>
            <p style={{ fontWeight: '600', marginBottom: '10px' }}>📆 Filter by Date Range</p>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap'
            }}>

              {userAppType === 'A' && (
                <>
                  {/* Export */}
                  <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                    <button
                      onClick={handleExportReceipts}
                      style={{
                        padding: "8px 14px",
                        background: "#1eb619ff",
                        color: "#fff",
                        border: "none",
                        borderRadius: "5px",
                        cursor: "pointer",
                      }}
                    >
                      Export
                    </button>
                  </div>

                  {/* Import */}
                  <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                    <label
                      style={{
                        padding: "8px 14px",
                        background: "#1eb619ff",
                        color: "#fff",
                        border: "none",
                        borderRadius: "5px",
                        cursor: "pointer",
                      }}
                    >
                      Import
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleImportReceipts}
                        style={{ display: "none" }}
                      />
                    </label>
                  </div>
                </>
              )}

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

          {/* particularNature */}
          <div className="group-wrapper">
            {/* ALL BOX */}
            <div
              className={`group-card ${groupFilter.length === 0 ? "active" : ""}`}
              onClick={() => {
                setGroupFilter([]);
                setSubGroupFilter([]);
              }}
            >
              <h4>ALL</h4>
              <p>Show all receipts</p>
            </div>

            {(() => {
              const grouped = {};
              const displayNames = {};

              filteredReceipts.forEach((r) => {

                const eventType = (r.eventType || "").trim();
                const particular = (r.particularNature || "").trim();

                const displayValue =
                  ["Event Royalty", "Decoration Royalty"].includes(particular)
                    ? particular
                    : (eventType || particular || "No Particular");

                const key = displayValue.toLowerCase();

                if (!grouped[key]) {
                  grouped[key] = { credit: 0, debit: 0 };
                  displayNames[key] = displayValue;
                }

                const searchable = `${eventType} ${particular} ${r.customerName} ${r.partyName}`.toLowerCase();
                if (!searchable.includes(debouncedSearch.toLowerCase())) return;

                const amt = Number(r.amount || 0);
                if (r.paymentFor === "Credit") grouped[key].credit += amt;
                if (r.paymentFor === "Debit") grouped[key].debit += amt;
              });

              return Object.keys(grouped)
                .sort((a, b) => {

                  const aSelected = groupFilter.includes(a);
                  const bSelected = groupFilter.includes(b);

                  if (aSelected && !bSelected) return -1;
                  if (!aSelected && bSelected) return 1;

                  return displayNames[a].localeCompare(displayNames[b], "en", {
                    sensitivity: "base"
                  });
                })
                .map((key) => {
                  const { credit, debit } = grouped[key];
                  const display = displayNames[key];

                  return (
                    <div
                      key={key}
                      className={`group-card ${groupFilter.includes(key) ? "active" : ""}`}
                      onClick={() => {

                        const isRemoving = groupFilter.includes(key);

                        toggleSelection(key, groupFilter, setGroupFilter);

                        if (isRemoving) {

                          // 🔥 Remove only those subParticular that belong to this group
                          const subsToRemove = new Set();

                          filteredReceipts.forEach(r => {

                            const eventType = (r.eventType || "").trim().toLowerCase();
                            const particular = (r.particularNature || "").trim().toLowerCase();

                            if (eventType === key || particular === key) {

                              const sub = (r.subParticularNature || "").trim().toLowerCase();
                              if (sub) subsToRemove.add(sub);

                            }

                          });

                          setSubGroupFilter(prev =>
                            prev.filter(sub => !subsToRemove.has(sub))
                          );
                        }

                      }}
                      style={{ position: "relative" }}
                    >
                      <h4>{display}</h4>

                      {credit > 0 && <p className="credit">Credit: ₹{credit.toLocaleString("en-IN")}</p>}
                      {debit > 0 && <p className="debit">Debit: ₹{debit.toLocaleString("en-IN")}</p>}

                      {/* 🔥 NEW EDIT BUTTON */}
                      {userAppType === "A" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();   // 🔥 filter click na ho
                            openGroupEditPopup(display);
                          }}
                          style={{
                            position: "absolute",
                            top: "5px",
                            right: "5px",
                            background: "#2e86de",
                            color: "#fff",
                            border: "none",
                            borderRadius: "4px",
                            padding: "3px 6px",
                            fontSize: "12px",
                            cursor: "pointer"
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  );
                });

            })()}
          </div>

          {/* subParticularNature */}
          {groupFilter.length > 0 && (
            <div className="group-wrapper">
              {/* ALL BOX */}
              <div
                className={`group-card ${subGroupFilter.length === 0 ? "active" : ""}`}
                onClick={() => setSubGroupFilter([])}
              >
                <h4>ALL</h4>
                <p>Show all sub receipts</p>
              </div>

              {(() => {
                const grouped = {};
                const displayNames = {};

                filteredReceipts.forEach((r) => {

                  // ✅ Only show subs of selected particular
                  if (
                    groupFilter !== "All" &&
                    !groupFilter.includes(
                      r.particularNature?.trim().toLowerCase()
                    )
                  ) return;

                  const subParticular = (r.subParticularNature || "").trim();
                  if (!subParticular) return;

                  const key = subParticular.toLowerCase();

                  if (!grouped[key]) {
                    grouped[key] = { credit: 0, debit: 0 };
                    displayNames[key] = subParticular;
                  }

                  const amt = Number(r.amount || 0);
                  if (r.paymentFor === "Credit") grouped[key].credit += amt;
                  if (r.paymentFor === "Debit") grouped[key].debit += amt;
                });

                return Object.keys(grouped)
                  .sort((a, b) => {

                    const aSelected = subGroupFilter.includes(a);
                    const bSelected = subGroupFilter.includes(b);

                    // 🔥 Selected first
                    if (aSelected && !bSelected) return -1;
                    if (!aSelected && bSelected) return 1;

                    // 🔤 Alphabetical order
                    return displayNames[a]
                      .toLowerCase()
                      .localeCompare(displayNames[b].toLowerCase());
                  })
                  .map((key) => {
                    const { credit, debit } = grouped[key];
                    const display = displayNames[key];

                    return (
                      <div
                        key={key}
                        className={`group-card ${subGroupFilter.includes(key) ? "active" : ""}`}
                        onClick={() =>
                          toggleSelection(key, subGroupFilter, setSubGroupFilter)
                        }
                        style={{ position: "relative" }}
                      >
                        <h4>{display}</h4>

                        {credit > 0 && (
                          <p className="credit">
                            Credit: ₹{credit.toLocaleString("en-IN")}
                          </p>
                        )}
                        {debit > 0 && (
                          <p className="debit">
                            Debit: ₹{debit.toLocaleString("en-IN")}
                          </p>
                        )}

                        {userAppType === "A" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openGroupEditPopup(display);
                            }}
                            style={{
                              position: "absolute",
                              top: "5px",
                              right: "5px",
                              background: "#2e86de",
                              color: "#fff",
                              border: "none",
                              borderRadius: "4px",
                              padding: "3px 6px",
                              fontSize: "12px",
                              cursor: "pointer"
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    );
                  });
              })()}
            </div>
          )}
        </div>

        {/* date from to  */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: "10px"
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
          <span style={{ color: "green", background: creditDebitFilter.includes('Credit') ? '#c9f0ff' : '#ffffff', borderRadius: "30px" }} onClick={() => toggleSelection('Credit', creditDebitFilter, setCreditDebitFilter)} >Credit: <span > ₹{totalCredit.toLocaleString("en-IN")} </span> </span>
          <span style={{ color: "red", background: creditDebitFilter.includes('Debit') ? '#c9f0ff' : '#ffffff', borderRadius: "30px" }} onClick={() => toggleSelection('Debit', creditDebitFilter, setCreditDebitFilter)} >Debit: <span > ₹{totalDebit.toLocaleString("en-IN")} </span> </span>
          <span style={{ color: "black", background: creditDebitFilter.includes('') ? '#c9f0ff' : '#ffffff', borderRadius: "30px" }} >Balance: <span > ₹{balance.toLocaleString("en-IN")} </span> </span>
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
                  <th>Sub-Particular Nature</th>
                  <th>Action</th>
                  <th>Receipt Type</th>
                  <th>Name</th>
                  <th>Mode</th>
                  <th>Cash-Via</th>
                  <th>Auto Sl.No</th>
                  <th>Manual Sl.No</th>
                  <th>Description</th>
                  <th>Credit</th>
                  <th>Debit</th>
                  <th>Mobile</th>
                  <th>Function Date</th>
                  <th>Verify</th>
                  <th>Amount</th>
                  <th>Logs</th>
                  <th>Generated By</th>
                  <th>Verified Info</th>
                  <th>Approval</th>
                  <th style={{ display: "none" }}>Delete</th>
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

      </div>

      {showGroupPopup && (
        <div style={overlayStyle}>
          <div style={popupStyle}>
            <h3>Edit Particular Name</h3>

            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              style={inputStyle}
            />

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={handleBulkGroupUpdate}
                style={{
                  flex: 1,
                  padding: "8px",
                  background: "#27ae60",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                }}
              >
                Update All
              </button>

              <button
                onClick={() => setShowGroupPopup(false)}
                style={{
                  flex: 1,
                  padding: "8px",
                  background: "#e74c3c",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showPDFPopup && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 99999,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "24px",
              borderRadius: "12px",
              width: "360px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              boxShadow: "0 15px 40px rgba(0,0,0,0.25)",
            }}
          >
            <h3
              style={{
                margin: 0,
                textAlign: "center",
                color: "#2e6999",
                fontWeight: "700",
              }}
            >
              📄 Select PDF Type
            </h3>

            {/* OPTION BUTTONS */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

              {["summary", "details", "overall"].map((type) => {

                const label =
                  type === "summary"
                    ? "Particulars Summary"
                    : type === "details"
                      ? "Particulars + Details"
                      : "Overall Only";

                const isActive = pdfTypes.includes(type);

                return (
                  <button
                    key={type}
                    onClick={() => togglePDFType(type)}
                    style={{
                      padding: "11px",
                      background: isActive ? "#2e6999" : "#f1f1f1",
                      color: isActive ? "#fff" : "#333",
                      border: isActive ? "2px solid #2e6999" : "2px solid #ddd",
                      borderRadius: "8px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    {isActive ? "✔ " : ""}{label}
                  </button>
                );
              })}

            </div>

            {/* ACTION BUTTONS */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "6px",
              }}
            >
              <button
                onClick={() => {
                  handleDownloadPDF();
                  setShowPDFPopup(false);
                }}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "#27ae60",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                ✅ Proceed
              </button>

              <button
                onClick={() => setShowPDFPopup(false)}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "#e74c3c",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                ✖ Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      {showPopup && (
        <div
          className="popup-overlay1"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "#00000029",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 91000,
          }}
        >
          <div
            className="popup-content"
            style={{
              backgroundColor: "#fff",
              padding: "10px",
              borderRadius: "10px",
              width: "fit-content",
              display: "flex",
              height: "fit-content",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
              scrollbarWidth: "thin",
            }}
          >

            <h3 style={{ margin: 0, textAlign: "center", color: "#2e6999" }}>
              ✏️ Edit Receipt
            </h3>

            <div
              className="popup-content"
              style={{
                backgroundColor: "#fff",
                padding: "22px",
                borderRadius: "10px",
                width: "360px",
                maxHeight: "65vh",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                scrollbarWidth: "thin",
              }}
            >

              {/* Name */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={labelStyle}>Name</label>
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Mobile */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={labelStyle}>Mobile No</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={newMobile}
                  onChange={(e) =>
                    setNewMobile(e.target.value.replace(/\D/g, ""))
                  }
                  style={inputStyle}
                />
              </div>

              {/* Function Date */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={labelStyle}>Function Date</label>
                <input
                  type="date"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Manual Receipt No */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={labelStyle}>Manual Receipt No</label>
                <input
                  type="text"
                  placeholder="Enter manual receipt no"
                  value={newManualSlNo}
                  onChange={(e) => setNewManualSlNo(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Amount */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={labelStyle}>Amount (₹)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Enter amount"
                  value={newAmount}
                  onChange={(e) => {
                    let val = e.target.value.replace(/[^0-9.]/g, "");
                    if ((val.match(/\./g) || []).length > 1) val = val.slice(0, -1);
                    setNewAmount(val);
                  }}
                  style={inputStyle}
                />
              </div>

              {/* Payment Type */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={labelStyle}>Payment For</label>
                <select
                  value={newPaymentFor}
                  onChange={(e) => setNewPaymentFor(e.target.value)}
                  style={{
                    ...inputStyle,
                    backgroundColor: newPaymentFor ? "#eaf4ff" : "#fff",
                    fontWeight: newPaymentFor ? "600" : "normal",
                  }}
                >
                  <option value="">-- Select --</option>
                  <option value="Credit">Credit</option>
                  <option value="Debit">Debit</option>
                </select>
              </div>

              {/* Particular Nature */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={labelStyle}>Particular Nature</label>

                <div
                  onClick={() => setShowNaturePopup(true)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #ccc",
                    cursor: "pointer",
                    background: "#fff",
                    fontWeight: "600"
                  }}
                >
                  {newParticularNature || "Select / Add Particular Nature"}
                </div>

                {newParticularNature === "" && (
                  <input
                    type="text"
                    placeholder="Enter new particular nature"
                    value={customNature}
                    onChange={(e) => setCustomNature(e.target.value)}
                    style={{ ...inputStyle, marginTop: "6px" }}
                  />
                )}
              </div>

              {showNaturePopup && (
                <div style={overlayStyle}>
                  <div style={popupStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <h3>Select Particular Nature</h3>
                      <button
                        onClick={() => setShowNaturePopup(false)}
                        style={{ ...closeBtn, color: "red" }} >✕
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder="🔍 Search..."
                      value={natureSearch}
                      onChange={e => setNatureSearch(e.target.value)}
                      style={inputStyle}
                    />

                    <div style={{ maxHeight: "220px", overflowY: "auto" }}>
                      {filteredNatureOptions.map(p => (
                        <div
                          key={p}
                          onClick={() => {
                            setNewParticularNature(p);
                            setCustomNature("");
                            setShowNaturePopup(false);
                            setNatureSearch("");
                          }}
                          style={{ ...itemStyle }}
                        >
                          {p}
                        </div>
                      ))}

                      <div
                        onClick={() => {
                          setNewParticularNature("");
                          setCustomNature("");
                        }}
                        style={{ ...itemStyle, color: "#1890ff", fontWeight: "bold" }}
                      >
                        + Add New
                      </div>
                    </div>

                    {!filteredNatureOptions.length && (
                      <p style={{ textAlign: "center", fontSize: "13px" }}>No match found</p>
                    )}
                  </div>
                </div>
              )}

              {newParticularNature && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={labelStyle}>Sub Particular Nature</label>

                  {/* 🔹 If options exist */}
                  {subParticularOptions.length > 0 ? (
                    <>
                      <select
                        value={newSubParticular}
                        onChange={(e) => {
                          setNewSubParticular(e.target.value);
                          setCustomSubParticular("");
                        }}
                        style={{
                          ...inputStyle,
                          backgroundColor: "#eaf4ff",
                          fontWeight: "600"
                        }}
                      >
                        <option value="">-- Select --</option>

                        {subParticularOptions.map(sub => (
                          <option key={sub} value={sub}>
                            {sub}
                          </option>
                        ))}

                        <option value="__OTHER__">+ Add Other</option>
                      </select>

                      {newSubParticular === "__OTHER__" && (
                        <input
                          type="text"
                          placeholder="Enter new sub particular"
                          value={customSubParticular}
                          onChange={(e) => setCustomSubParticular(e.target.value)}
                          style={{ ...inputStyle, marginTop: "6px" }}
                        />
                      )}
                    </>
                  ) : (
                    /* 🔹 If NO sub exist → Direct Input */
                    <input
                      type="text"
                      placeholder="Enter sub particular"
                      value={customSubParticular}
                      onChange={(e) => setCustomSubParticular(e.target.value)}
                      style={inputStyle}
                    />
                  )}
                </div>
              )}

              {/* Description */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={labelStyle}>Description</label>
                <input
                  type="text"
                  placeholder="Enter description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Receipt Date */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={labelStyle}>Receipt Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Bank Change Dropdown */}
              {newMode && newMode !== "Cash" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={labelStyle}>Bank Change</label>
                  <select
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">-- Select Bank --</option>
                    {bankNames
                      .filter(bank => bank && bank.toLowerCase() !== "cash")
                      .map(bank => (
                        <option key={bank} value={bank}>{bank}</option>
                      ))
                    }
                  </select>
                </div>
              )}

              {/* Payment Mode */}
              <div style={{ flexDirection: "column", gap: "4px", display: "none" }}>
                <label style={labelStyle}>Payment Mode</label>
                <select
                  value={newMode}
                  onChange={(e) => {
                    const selected = e.target.value;
                    setNewMode(selected);
                    if (selected !== "Cash") { setNewCashTo(""); }
                  }}
                  style={{
                    ...inputStyle,
                    backgroundColor: newMode ? "#eaf4ff" : "#fff",
                    fontWeight: newMode ? "600" : "normal",
                  }}
                >
                  <option value="">-- Select Mode --</option>
                  <option value="Cash">Cash</option>
                  {/* Bank names */}
                  {bankNames.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {newMode && newMode !== "Cash" && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={labelStyle}>Bank Mode</label>
                    <select
                      value={newBankMode}
                      onChange={(e) => setNewBankMode(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="RTGS/NEFT">RTGS/NEFT</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Card">Card</option>
                      <option value="UPI">UPI</option>
                    </select>
                  </div>
                  {newBankMode === "Cheque" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={labelStyle}>Cheque No</label>
                      <input
                        type="text"
                        placeholder="Enter Cheque Number"
                        value={newChequeNo}
                        onChange={(e) => setNewChequeNo(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Cash To */}
              {newMode === "Cash" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={labelStyle}>Cash To</label>
                  <select
                    value={newCashTo}
                    onChange={(e) => setNewCashTo(e.target.value)}
                    style={{
                      ...inputStyle,
                      backgroundColor: newCashTo ? "#eaf4ff" : "#fff",
                      fontWeight: newCashTo ? "600" : "normal",
                    }}
                  >
                    <option value="">-- Select Cash Receiver --</option>
                    {cashToOptions
                      .filter(ct => ct !== "")
                      .map(ct => (
                        <option key={ct} value={ct}>{ct}</option>
                      ))}
                  </select>
                </div>
              )}

            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "10px",
                gap: "10px"
              }}
            >
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  flex: 1,
                  padding: "8px",
                  background: isSaving
                    ? "linear-gradient(180deg, #95a5a6, #7f8c8d)"
                    : "linear-gradient(180deg, #2ecc71, #27ae60)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "600",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.8 : 1,
                }}
              >
                {isSaving ? "Saving..." : "💾 Save"}
              </button>

              <button
                onClick={() => setShowPopup(false)}
                style={{
                  flex: 1,
                  padding: "8px",
                  background: "linear-gradient(180deg, #ff6b6b, #d63031)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                ✖ Cancel
              </button>
            </div>

          </div>
        </div>
      )}

      <div style={{ marginBottom: "50px" }}></div>
      <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
    </div>
  );
};

const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  backgroundColor: "#00000000",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 99999,
};

const popupStyle = {
  background: "#fff",
  borderRadius: "10px",
  padding: "16px",
  width: "320px",
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
};

const closeBtn = {
  background: "transparent",
  border: "none",
  fontSize: "18px",
  cursor: "pointer",
  fontWeight: "bold",
};

const itemStyle = {
  padding: "8px 10px",
  borderBottom: "1px solid #eee",
  cursor: "pointer",
  fontSize: "14px",
};

const labelStyle = {
  fontSize: "13px",
  fontWeight: "600",
  color: "#333",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: "6px",
  border: "1px solid #ccc",
  fontSize: "14px",
  outline: "none",
};

export default MoneyReceipts;
