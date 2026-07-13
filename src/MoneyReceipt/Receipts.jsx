import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { runTransaction, doc, setDoc, getDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import BackButton from '../components/BackButton';
import { useNavigate } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import BottomNavigationBar from "../components/BottomNavigationBar";

const Receipts = () => {
  const [type, setType] = useState('Debit');
  const [amount, setAmount] = useState('');
  const [mobile, setMobile] = useState('');
  const [prefix, setPrefix] = useState('Mr.');
  const [myName, setMyName] = useState('');
  const [partyName, setPartyName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState('');
  const [slNo, setSlNo] = useState(null);
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [particularNature, setParticularNature] = useState('');
  const [customParticularNature, setCustomParticularNature] = useState('');
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [cashTo, setCashTo] = useState('');
  const [userAppType, setUserAppType] = useState(null);
  const [banks, setBanks] = useState([]);
  const [cashInHand, setCashInHand] = useState(0);
  const [particularOptions, setParticularOptions] = useState({ Debit: [], Credit: [] });
  const [showNaturePopup, setShowNaturePopup] = useState(false);
  const [natureSearch, setNatureSearch] = useState("");
  const [manualSlNo, setManualSlNo] = useState("");
  const [subParticularNature, setSubParticularNature] = useState('');
  const [customSubNature, setCustomSubNature] = useState('');
  const [subNatureOptions, setSubNatureOptions] = useState([]);
  const [showSubNaturePopup, setShowSubNaturePopup] = useState(false);
  const [subNatureSearch, setSubNatureSearch] = useState('');

  useEffect(() => {
    const fetchSubNatures = async () => {
      if (!particularNature) {
        setSubNatureOptions([]);
        return;
      }

      try {
        const snap = await getDocs(collection(db, "moneyReceipts"));
        const subMap = new Map();

        snap.forEach(docSnap => {
          const data = docSnap.data();

          Object.values(data).forEach(r => {
            if (!r) return;

            if (
              r.particularNature === particularNature &&
              r.subParticularNature
            ) {
              const normalized = r.subParticularNature.trim().toLowerCase();
              if (!subMap.has(normalized)) {
                subMap.set(normalized, r.subParticularNature.trim());
              }

            }
          });
        });

        setSubNatureOptions(Array.from(subMap.values()).sort());

      } catch (err) {
        console.error("❌ Error fetching Sub Nature:", err);
      }
    };

    fetchSubNatures();
  }, [particularNature]);

  useEffect(() => {
    const fetchParticularNatures = async () => {
      try {
        const snap = await getDocs(collection(db, "moneyReceipts"));

        const debitSet = new Set();
        const creditSet = new Set();

        snap.forEach(docSnap => {
          const data = docSnap.data();

          Object.values(data).forEach(r => {
            if (!r || !r.particularNature || !r.paymentFor) return;

            const nature = r.particularNature.trim();
            const type = r.paymentFor; // Debit / Credit

            if (type === "Debit") debitSet.add(nature);
            if (type === "Credit") creditSet.add(nature);
          });
        });

        setParticularOptions({
          Debit: Array.from(debitSet).sort(),
          Credit: Array.from(creditSet).sort(),
        });

      } catch (err) {
        console.error("❌ Error fetching Particular Nature:", err);
      }
    };

    fetchParticularNatures();
  }, []);

  useEffect(() => {

    const fetchNatureDetails = async () => {
      try {
        const snap = await getDocs(collection(db, "moneyReceipts"));
        let rows = [];

        snap.forEach(docSnap => {
          const monthData = docSnap.data();

          Object.values(monthData).forEach(r => {
            if (!r) return;

            if (r.particularNature === particularNature) {
              rows.push({
                slNo: r.slNo,
                date: r.receiptDate,
                partyName: r.partyName,
                partyPrefix: r.partyPrefix,
                type: r.paymentFor,
                particularNature: r.particularNature,
                mode: r.mode,
                amount: r.amount,
                description: r.description
              });
            }
          });
        });

        // Optional: latest first
        // Default ASC sort by receiptDate
        rows.sort((a, b) => new Date(a.date) - new Date(b.date));

      } catch (err) {
        console.error("❌ Error fetching nature details:", err);
      }
    };

    fetchNatureDetails();
  }, [particularNature]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "moneyReceipts"), async (snap) => {

      let totalCash = 0;

      snap.forEach(docSnap => {
        const data = docSnap.data();
        Object.values(data).forEach(r => {
          if (!r) return;

          if ((r.mode || "").toLowerCase() === "cash") {
            const amt = Number(r.amount || 0);
            const isCredit = (r.paymentFor || "").toLowerCase() === "credit";
            totalCash += isCredit ? amt : -amt;
          }
        });
      });

      // 🔹 BANK TOTAL
      const bankSnap = await getDoc(doc(db, "accountant", "AssignBank"));
      const bankUsers = bankSnap.exists() ? bankSnap.data().users || [] : [];

      let totalBankAmount = 0;

      snap.forEach(docSnap => {
        const data = docSnap.data();
        Object.values(data).forEach(r => {
          if (!r || !r.cashTo) return;

          if (r.mode?.toLowerCase() !== "cash") return;

          const bankName = r.cashTo.replace("-Bank", "").trim();

          if (bankUsers.some(b => b.name === bankName)) {
            const amt = Number(r.amount || 0);
            if (r.paymentFor?.toLowerCase() === "credit") totalBankAmount += amt;
            else totalBankAmount -= amt;
          }
        });
      });

      const finalCash = totalCash - totalBankAmount;

      setCashInHand(finalCash);
    });

    return () => unsubscribe();
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
    const fetchBanks = async () => {
      try {
        const bankSnap = await getDoc(doc(db, "accountant", "BankNames"));
        if (bankSnap.exists()) setBanks(bankSnap.data().banks || []);
        else setBanks([]);
      } catch (err) {
        console.error("Error fetching banks:", err);
        setBanks([]);
      }
    };
    fetchBanks();
  }, []);

  const getISTDate = (date = new Date()) => {
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    const istOffset = 5.5 * 60 * 60000; // +5:30 in ms
    const istTime = new Date(utc + istOffset);
    const yyyy = istTime.getFullYear();
    const mm = String(istTime.getMonth() + 1).padStart(2, '0');
    const dd = String(istTime.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getISTDateTime = () => {
    const utc = new Date().getTime() + new Date().getTimezoneOffset() * 60000;
    const istOffset = 5.5 * 60 * 60000;
    return new Date(utc + istOffset).toISOString();
  };

  const [manualDate, setManualDate] = useState(getISTDate());

  useEffect(() => {
    const fetchAssignedUsers = async () => {
      try {
        const bankSnap = await getDoc(doc(db, "accountant", "AssignBank"));
        let users = [];
        if (bankSnap.exists()) {
          const bankUsers = bankSnap.data().users || [];
          users = bankUsers.map(u => ({ name: u.name, email: u.email, type: "Bank" }));
        }
        const uniqueUsers = Object.values(users.reduce((acc, u) => {
          const key = `${u.email}-${u.type}`;
          acc[key] = u;
          return acc;
        }, {}));
        setAssignedUsers(uniqueUsers);
      } catch (err) {
        console.error("Error fetching assigned users:", err);
      }
    };
    fetchAssignedUsers();
  }, []);

  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;
        const userRef = doc(db, "usersAccess", user.email);
        const snap = await getDoc(userRef);
        if (snap.exists()) setMyName(snap.data().name || "");
      } catch (err) {
        console.error("❌ Error fetching user name:", err);
      }
    };
    fetchUserName();
  }, []);

  const convertToWords = (num) => {
    if (num === 0) return "Zero only";

    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);

    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
      'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const numToWords = (n) => {
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
      if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
      if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
      if (n < 10000000) return numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWords(n % 100000) : '');
      return numToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numToWords(n % 10000000) : '');
    };

    let words = numToWords(integerPart) + " Rupees";

    if (decimalPart > 0) {
      words += " and " + numToWords(decimalPart) + " Paise";
    }

    return words + " only";
  };

  const fetchNextSlNo = useCallback(async () => {
    try {
      const counterRef = doc(db, 'settings', 'slCounter');
      const counterSnap = await getDoc(counterRef);
      const current = counterSnap.exists() ? counterSnap.data().otherMoneyReceipt || 0 : 0;
      setSlNo(current + 1);
    } catch (err) {
      console.error('Error fetching next Sl No:', err);
      setSlNo(null);
    }
  }, []);

  useEffect(() => { fetchNextSlNo(); }, [fetchNextSlNo]);

  const handleSubmit = async () => {
    if (!myName || !partyName || !amount || !mode || !description) {
      alert('Please fill all fields'); return;
    }
    if (mode === 'Cash' && !cashTo) { alert('Please select "Cash To"'); return; }

    if (isDebitCashFromCash && amountNumber > cashInHand) {
      alert("Insufficient Cash Balance In Hand");
      return;
    }

    if (particularNature && !subParticularNature) {
      alert("Please select Sub-Particular Nature");
      return;
    }

    if (subParticularNature === "Other" && !customSubNature.trim()) {
      alert("Please enter Sub-Particular Nature");
      return;
    }

    setIsSaving(true);
    try {
      const counterRef = doc(db, 'settings', 'slCounter');
      let newSlNo = '';
      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const data = counterDoc.exists() ? counterDoc.data() : {};
        const current = data.otherMoneyReceipt || 0;
        newSlNo = `V${current + 1}`;
        transaction.update(counterRef, { otherMoneyReceipt: current + 1 });
      });

      const formatText = (text) =>
        text.trim().replace(/\b\w/g, c => c.toUpperCase());

      const finalSubNature =
        subParticularNature === "Other"
          ? formatText(customSubNature)
          : formatText(subParticularNature);

      const amountWords = convertToWords(Number(amount));
      const finalParticularNature = type === 'Debit' && particularNature === 'Other' ? customParticularNature : particularNature;

      const receiptData = {
        slNo: newSlNo,
        manualSlNo: manualSlNo.trim() || "",
        amount: Number(amount),
        amountWords,
        mode,
        cashTo,
        type: 'Voucher',
        paymentFor: type,
        partyPrefix: prefix,
        partyName,
        approval: 'No',
        mobile,
        myName,
        particularNature: finalParticularNature,
        subParticularNature: finalSubNature || "",
        description,
        receiptDate: manualDate,
        createdAt: getISTDateTime(),
      };

      // Month-Year doc ID (IST)
      const jsDate = new Date(manualDate + "T00:00:00");

      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];

      const month = monthNames[jsDate.getMonth()];
      const year = jsDate.getFullYear();

      const istMonthYear = `${month}${year}`;

      const docRef = doc(db, "moneyReceipts", istMonthYear);

      const receiptId = crypto.randomUUID();
      await setDoc(docRef, { [receiptId]: receiptData }, { merge: true });

      navigate('/MoneyReceipts');

    } catch (err) {
      console.error('❌ Error saving receipt:', err);
      alert(`❌ Error saving receipt: ${err.message || err}`);
    } finally {
      setIsSaving(false);
      setAmount('');
      setMyName('');
      setMobile('');
      setPartyName('');
      setDescription('');
      setMode('Cash');
      fetchNextSlNo();
      setManualSlNo("");
      setParticularNature('');
      setSubParticularNature('');
      setCustomParticularNature('');
      setCustomSubNature('');
    }
  };

  const isDebitCashFromCash =
    type === "Debit" &&
    mode === "Cash" &&
    cashTo === "Cash";

  const amountNumber = Number(amount || 0);

  const hasSufficientCash = !isDebitCashFromCash || amountNumber <= cashInHand;

  const normalize = (str = "") => str.trim().toLowerCase();

  const currentParticularList = particularOptions[type] || [];

  const uniqueParticularOptions = [
    ...new Map(
      currentParticularList.map(item => [normalize(item), item])
    ).values()
  ];

  const filteredParticularOptions = uniqueParticularOptions.filter(p =>
    normalize(p).includes(normalize(natureSearch))
  );

  const formatIndianNumber = (value) => {
    if (!value) return "";

    const parts = value.split(".");
    let integerPart = parts[0];

    // Remove existing commas
    integerPart = integerPart.replace(/,/g, "");

    // Indian formatting
    let lastThree = integerPart.slice(-3);
    let otherNumbers = integerPart.slice(0, -3);

    if (otherNumbers !== "") {
      lastThree = "," + lastThree;
    }

    const formatted =
      otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;

    return parts.length > 1 ? formatted + "." + parts[1] : formatted;
  };

  return (
    <div className="page-scroller">
      <div>
        <div style={{ marginBottom: '30px' }}> <BackButton /> </div>
        <div className="receipt-container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 className="title">Voucher</h2>

            <div style={{
              background: "#fff3cd",
              padding: "8px 14px",
              borderRadius: "6px",
              fontWeight: "bold",
              fontSize: "15px",
              color: "#856404",
              border: "1px solid #ffeeba"
            }}>
              💵 Cash In Hand: ₹{cashInHand.toLocaleString("en-IN")}
            </div>

          </div>

          {slNo && <p><strong>Sl No:</strong> V{slNo}</p>}

          <div className="input-row">
            <label>Manual Voucher No (Hard Copy)</label>
            <input
              type="text"
              placeholder="Eg: Book-2 / 45"
              value={manualSlNo}
              onChange={e => setManualSlNo(e.target.value)}
            />
          </div>

          <div className="input-row">
            <label>Receipt Type</label>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="Debit">Debit</option>
              <option value="Credit">Credit</option>
            </select>
          </div>

          <div className="input-row">
            <label>Particular Nature</label>
            <div
              onClick={() => setShowNaturePopup(true)}
              style={{
                border: "1px solid #ccc",
                padding: "10px",
                borderRadius: "6px",
                background: "#fff",
                cursor: "pointer"
              }}
            >
              {particularNature || "Select / Add - Particular Nature"}
            </div>

            {particularNature === "Other" && (
              <input
                type="text"
                placeholder="Add Particular Nature"
                value={customParticularNature}
                onChange={e => setCustomParticularNature(e.target.value)}
                style={{ marginTop: "8px" }}
              />
            )}
          </div>

          {particularNature && (
            <div className="input-row">
              <label>Sub-Particular Nature</label>

              <div
                onClick={() => setShowSubNaturePopup(true)}
                style={{
                  border: "1px solid #ccc",
                  padding: "10px",
                  borderRadius: "6px",
                  background: "#fff",
                  cursor: "pointer"
                }}
              >
                {subParticularNature || "Select / Add - Sub Particular Nature"}
              </div>

              {subParticularNature === "Other" && (
                <input
                  type="text"
                  placeholder="Add Sub Particular Nature"
                  value={customSubNature}
                  onChange={e => setCustomSubNature(e.target.value)}
                  style={{ marginTop: "8px" }}
                />
              )}
            </div>
          )}

          <div className="input-row">
            <label>{type === 'Credit' ? 'Receive From' : 'Pay To'}</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select value={prefix} onChange={e => setPrefix(e.target.value)} style={{ width: '100px' }}>
                <option value="Mr.">Mr.</option>
                <option value="Ms.">Ms.</option>
                <option value="Mrs.">Mrs.</option>
                <option value="Dr.">Dr.</option>
                <option value="Md.">Md.</option>
                <option value="">Blank</option>
              </select>
              <input type="text" value={partyName} onChange={e => setPartyName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))} placeholder={type === 'Credit' ? 'From getting money' : 'Giving money to'} />
            </div>
          </div>

          <div className="input-row">
            <label>Mobile No.</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="Enter Mobile No." value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, ""))} />
          </div>

          <div className="input-row">
            <label>Payment Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)}>
              <option value="">-- Select --</option>
              {banks.map(bank => (
                <option key={bank} value={bank}>{bank}</option>
              ))}
              <option value="Cash">Cash</option>
              {/* <option value="Card">Card</option>
              <option value="Cheque">Cheque</option> */}
            </select>
          </div>

          {mode === 'Cash' && (
            <div className="input-row">
              <label>{type === "Debit" ? "Cash From" : "Cash To"}</label>
              <select value={cashTo} onChange={e => setCashTo(e.target.value)}>
                <option value="">-- Select --</option>
                <option value="Cash">Cash</option>
                {assignedUsers.map(u => <option key={`${u.email}-${u.type}`} value={`${u.name}-${u.type}`}>{u.name} - ({u.type})</option>)}
              </select>
            </div>
          )}

          <div className="input-row">
            <label>Amount</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Enter amount"
              value={formatIndianNumber(amount)}
              onChange={(e) => {
                let val = e.target.value.replace(/,/g, ""); // remove commas
                val = val.replace(/[^0-9.]/g, "");
                if ((val.match(/\./g) || []).length > 1) return;
                setAmount(val);
              }}
            />
          </div>

          {isDebitCashFromCash && amountNumber > cashInHand && (
            <div style={{ color: "red", fontSize: "13px", marginTop: "4px" }}>
              Available Cash: ₹{cashInHand.toLocaleString("en-IN")}
            </div>
          )}

          <div className="input-row" style={{ display: 'none' }}>
            <input type="text" value={myName || "Fetching name..."} />
          </div>

          {hasSufficientCash && (
            <>

              <div className="input-row">
                <label>Description</label>
                <input type="text" placeholder='Enter description' value={description} onChange={e => setDescription(e.target.value)} />
              </div>

              <div className="input-row">
                <label>Date</label>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} />
              </div>
            </>
          )}

          <div className="submit-row">
            {hasSufficientCash ? (
              <button onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? '⏳ Saving...' : `💾 Save ${type} Receipt`}
              </button>
            ) : (
              <div
                style={{
                  background: "#ffe6e6",
                  border: "1px solid #ff4d4f",
                  padding: "12px",
                  borderRadius: "6px",
                  color: "#a8071a",
                  fontWeight: "bold",
                  textAlign: "center"
                }}
              >
                ❌ Insufficient Cash Balance In Hand
                <br />
                <button
                  style={{
                    marginTop: "8px",
                    padding: "6px 12px",
                    background: "#1890ff",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                  onClick={() => navigate("/AccountantForm")}
                >
                  ➜ Go to Accountant
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {showNaturePopup && (
        <div style={overlayStyle}>
          <div style={popupStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px"
              }}
            >
              <h3 style={{ margin: 0 }}>Select Particular Nature</h3>
              <button
                onClick={() => {
                  setShowNaturePopup(false);
                  setNatureSearch("");
                }}
                style={closeBtn}
              >
                ✕
              </button>
            </div>

            {/* 🔍 SEARCH BOX */}
            <input
              type="text"
              placeholder="🔍 Search particular nature..."
              value={natureSearch}
              onChange={e => setNatureSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                marginBottom: "8px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                fontSize: "13px"
              }}
            />

            <div style={{ maxHeight: "260px", overflowY: "auto" }}>
              {filteredParticularOptions.map(p => (
                <div
                  key={normalize(p)}
                  onClick={() => {
                    setParticularNature(p);
                    setCustomParticularNature("");
                    setShowNaturePopup(false);
                    setNatureSearch("");
                    setSubParticularNature('');
                    setCustomSubNature('');
                  }}
                  style={itemStyle}
                >
                  {p}
                </div>
              ))}

              {/* ➕ OTHER */}
              <div
                onClick={() => {
                  setParticularNature("Other");
                  setShowNaturePopup(false);
                  setNatureSearch("");
                }}
                style={{ ...itemStyle, color: "#1890ff", fontWeight: "bold" }}
              >
                + Add
              </div>

              {/* ❌ No match */}
              {filteredParticularOptions.length === 0 && (
                <div
                  style={{
                    padding: "10px",
                    textAlign: "center",
                    color: "#888",
                    fontSize: "13px"
                  }}
                >
                  No match found
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {showSubNaturePopup && (
        <div style={overlayStyle}>
          <div style={popupStyle}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px"
            }}>
              <h3 style={{ margin: 0 }}>Select Sub Nature</h3>
              <button
                onClick={() => {
                  setShowSubNaturePopup(false);
                  setSubNatureSearch("");
                }}
                style={closeBtn}
              >
                ✕
              </button>
            </div>

            <input
              type="text"
              placeholder="🔍 Search sub nature..."
              value={subNatureSearch}
              onChange={e => setSubNatureSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                marginBottom: "8px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                fontSize: "13px"
              }}
            />

            <div style={{ maxHeight: "260px", overflowY: "auto" }}>
              {subNatureOptions
                .filter(s =>
                  s.toLowerCase().includes(subNatureSearch.toLowerCase())
                )
                .map(s => (
                  <div
                    key={s}
                    onClick={() => {
                      setSubParticularNature(s);
                      setCustomSubNature("");
                      setShowSubNaturePopup(false);
                      setSubNatureSearch("");
                    }}
                    style={itemStyle}
                  >
                    {s}
                  </div>
                ))}

              <div
                onClick={() => {
                  setSubParticularNature("Other");
                  setShowSubNaturePopup(false);
                  setSubNatureSearch("");
                }}
                style={{ ...itemStyle, color: "#1890ff", fontWeight: "bold" }}
              >
                + Add New Sub Nature
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: "50px" }}></div>
      <BottomNavigationBar navigate={navigate} userAppType={userAppType} />

    </div>
  );

};

export default Receipts;

const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999
};

const popupStyle = {
  background: "#fff",
  width: "90%",
  maxWidth: "400px",
  borderRadius: "10px",
  padding: "15px",
};

const itemStyle = {
  padding: "10px",
  borderBottom: "1px solid #eee",
  cursor: "pointer"
};

const closeBtn = {
  background: "transparent",
  border: "none",
  fontSize: "18px",
  cursor: "pointer",
  color: "red"
};