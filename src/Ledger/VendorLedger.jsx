import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import BackButton from '../components/BackButton';
import styles from '../styles/SalaryLedger.module.css';

const formatIST = (date) => {
    if (!date) return "";
    const options = { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" };
    return new Date(date).toLocaleString("en-GB", options);
};

const getISTNow = () => {
    const now = new Date();
    return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

const parseIST = (dateInput) => {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;
    return new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
};

const VendorLedger = () => {
    const [vendors, setVendors] = useState([]);
    const [receipts, setReceipts] = useState([]);
    const [selectedVendor, setSelectedVendor] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showProfileForm, setShowProfileForm] = useState(false);

    // Form States
    const [formMobile, setFormMobile] = useState('');
    const [formAddress, setFormAddress] = useState('');
    const [formAadhar, setFormAadhar] = useState('');
    const [formDeadline, setFormDeadline] = useState('');
    const [formContractAmount, setFormContractAmount] = useState('');
    const [formWorkType, setFormWorkType] = useState('');

    useEffect(() => {
        const q = collection(db, "vendorLedger");
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let list = [];
            snapshot.docs.forEach((docSnap) => {
                list.push({ id: docSnap.id, ...docSnap.data() });
            });
            setVendors(list);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = collection(db, "moneyReceipts");
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let vendorReceipts = [];
            snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data();
                Object.entries(data).forEach(([id, receipt]) => {
                    if (receipt.particularNature === "Vendor Payment") {
                        vendorReceipts.push({ id, ...receipt });
                    }
                });
            });
            setReceipts(vendorReceipts);
        });
        return () => unsubscribe();
    }, []);

    const combinedData = useMemo(() => {
        const map = new Map();

        vendors.forEach(v => {
            map.set(v.name?.toLowerCase().trim(), {
                ...v,
                receipts: [],
                totalPaid: 0
            });
        });

        receipts.forEach(receipt => {
            const originalName = receipt.subParticularNature || "Unknown Vendor";
            const nameKey = originalName.toLowerCase().trim();
            let v = map.get(nameKey);

            if (!v) {
                v = {
                    name: originalName,
                    mobileNo: receipt.mobile || "",
                    contractAmount: 0,
                    receipts: [],
                    totalPaid: 0,
                    isUnregistered: true
                };
                map.set(nameKey, v);
            }
            v.receipts.push(receipt);
            v.totalPaid += Number(receipt.amount || 0);
        });

        return Array.from(map.values())
            .map(v => {
                v.remaining = (Number(v.contractAmount) || 0) - v.totalPaid;
                v.receipts.sort((a, b) => parseIST(b.receiptDate || 0) - parseIST(a.receiptDate || 0));
                return v;
            })
            .filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => {
                const isAPending = a.remaining > 0;
                const isBPending = b.remaining > 0;
                if (isAPending && !isBPending) return -1;
                if (!isAPending && isBPending) return 1;
                return a.name.localeCompare(b.name);
            });
    }, [vendors, receipts, searchTerm]);

    const openVendorModal = (vendor) => {
        setSelectedVendor(vendor);
        setFormMobile(vendor.mobileNo || '');
        setFormAddress(vendor.address || '');
        setFormAadhar(vendor.aadharNo || '');
        setFormDeadline(vendor.deadlineDate || '');
        setFormContractAmount(vendor.contractAmount || '');
        setFormWorkType(vendor.workType || '');
        setShowProfileForm(false);
        setIsModalOpen(true);
    };

    const handleSaveVendor = async (e) => {
        e.preventDefault();
        if (!formMobile) {
            alert("Mobile number is required!");
            return;
        }

        try {
            const docRef = doc(db, "vendorLedger", formMobile);
            await setDoc(docRef, {
                name: selectedVendor.name,
                mobileNo: formMobile,
                address: formAddress,
                aadharNo: formAadhar,
                deadlineDate: formDeadline,
                contractAmount: Number(formContractAmount),
                workType: formWorkType,
                updatedAt: getISTNow().toISOString()
            }, { merge: true });

            alert("Vendor Details Saved!");
            setShowProfileForm(false);
        } catch (err) {
            console.error("Error saving vendor:", err);
            alert("Error saving data.");
        }
    };

    const handlePrintLedger = () => {
        if (!selectedVendor) return;
        const content = `
          <html>
            <head>
              <title>Vendor Statement - ${selectedVendor.name}</title>
              <style>
                body { font-family: 'Outfit', sans-serif; padding: 40px; color: #1e293b; }
                h1 { font-size: 24px; border-bottom: 2px solid #235164; padding-bottom: 10px; color: #235164; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0; }
                .box { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
                table { width: 100%; border-collapse: collapse; margin-top: 30px; }
                th { background: #eff6ff; text-align: left; padding: 12px; font-size: 12px; border: 1px solid #e2e8f0; }
                td { padding: 12px; border: 1px solid #e2e8f0; font-size: 14px; }
                .summary { margin-top: 30px; text-align: right; font-weight: bold; font-size: 20px; }
                .footer { margin-top: 60px; display: flex; justify-content: space-between; }
                .sig { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 5px; }
              </style>
            </head>
            <body>
              <h1>Vendor Payment Ledger</h1>
              <div class="grid">
                <div class="box"><strong>Vendor Name:</strong> ${selectedVendor.name}</div>
                <div class="box"><strong>Mobile:</strong> ${selectedVendor.mobileNo || 'N/A'}</div>
                <div class="box"><strong>Work Type:</strong> ${selectedVendor.workType || 'N/A'}</div>
                <div class="box"><strong>Deadline:</strong> ${formatIST(selectedVendor.deadlineDate)}</div>
              </div>
              <table>
                <thead><tr><th>Date</th><th>Method</th><th>Description</th><th>Amount Paid</th></tr></thead>
                <tbody>${selectedVendor.receipts.map(r => `<tr><td>${formatIST(r.receiptDate)}</td><td>${r.mode}</td><td>${r.description || '-'}</td><td>${formatCurrency(r.amount)}</td></tr>`).join('')}</tbody>
              </table>
              <div class="summary">
                <p>Contract Amount: ${formatCurrency(selectedVendor.contractAmount)}</p>
                <p>Total Paid: ${formatCurrency(selectedVendor.totalPaid)}</p>
                <p style="color: #ef4444">Balance: ${formatCurrency(selectedVendor.remaining)}</p>
              </div>
              <div class="footer"><div class="sig">Vendor Signature</div><div class="sig">Manager Signature</div></div>
            </body>
          </html>
        `;
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        iframe.contentWindow.document.write(content);
        iframe.contentWindow.document.close();
        iframe.onload = () => { iframe.contentWindow.print(); document.body.removeChild(iframe); };
    };

    const handlePrintAllVendors = () => {
        const content = `
            <html>
                <head>
                    <title>Vendor Ledger Report - ${formatIST(getISTNow())}</title>
                    <style>
                        body { font-family: 'Outfit', sans-serif; padding: 20px; color: #1e293b; }
                        h1 { font-size: 22px; text-align: center; margin-bottom: 5px; color: #235164; }
                        h2 { font-size: 14px; text-align: center; margin-bottom: 20px; color: #64748b; font-weight: 400; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
                        th { background: #f1f5f9; text-align: left; padding: 8px; border: 1px solid #e2e8f0; color: #475569; }
                        td { padding: 8px; border: 1px solid #e2e8f0; }
                        .text-right { text-align: right; }
                        .footer { margin-top: 30px; font-size: 10px; text-align: center; color: #94a3b8; }
                    </style>
                </head>
                <body>
                    <h1>Vendor Payment Summary Report</h1>
                    <h2>Generated on: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })} </h2>
                    <table>
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>Vendor Name</th>
                                <th>Work Type</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th class="text-right">Contract Amt</th>
                                <th class="text-right">Advance Paid</th>
                                <th class="text-right">Remaining</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${combinedData.map((v, idx) => {
            const startDate = v.receipts.length > 0 ? formatIST(v.receipts[v.receipts.length - 1].receiptDate) : 'N/A';
            return `
                                    <tr>
                                        <td>${idx + 1}</td>
                                        <td>${v.name}</td>
                                        <td>${v.workType || 'General'}</td>
                                        <td>${startDate}</td>
                                        <td>${formatIST(v.deadlineDate) || 'N/A'}</td>
                                        <td class="text-right">${formatCurrency(v.contractAmount)}</td>
                                        <td class="text-right">${formatCurrency(v.totalPaid)}</td>
                                        <td class="text-right">${formatCurrency(v.remaining)}</td>
                                    </tr>
                                `;
        }).join('')}
                        </tbody>
                    </table>
                </body>
            </html>
        `;
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        iframe.contentWindow.document.write(content);
        iframe.contentWindow.document.close();
        iframe.onload = () => { iframe.contentWindow.print(); document.body.removeChild(iframe); };
    };

    return (
        <div className={styles['salary-ledger-page']}>
            <div className={styles['header-container']}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <BackButton />
                    <h1 className={`${styles['page-title']} ${styles['text-primary-theme']}`}>Vendor Payment Ledger</h1>
                </div>
                <button
                    className={styles['btn-vibrant']}
                    onClick={handlePrintAllVendors}
                    style={{ background: 'var(--primary)', color: 'white' }}
                >
                    Print All Vendors Report 🖨️
                </button>
            </div>

            <div className={styles['controls-container']}>
                <input
                    type="text"
                    className={styles['search-input']}
                    placeholder="Search Vendor or Work Name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className={styles['stats-bar']}>
                    <div className={styles['stat-box']}>
                        <span className={styles['stat-label']}>Active Vendors</span>
                        <div className={`${styles['stat-value']} ${styles['text-primary-theme']}`}>{combinedData.length}</div>
                    </div>
                    <div className={styles['stat-box']}>
                        <span className={styles['stat-label']}>Total Paid to Vendors</span>
                        <div className={`${styles['stat-value']} ${styles['text-success']}`}>
                            {formatCurrency(combinedData.reduce((acc, curr) => acc + curr.totalPaid, 0))}
                        </div>
                    </div>
                    <div className={styles['stat-box']}>
                        <span className={styles['stat-label']}>Pending Liability</span>
                        <div className={`${styles['stat-value']} ${styles['text-danger']}`}>
                            {formatCurrency(combinedData.reduce((acc, curr) => acc + curr.remaining, 0))}
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles['ledger-list']}>
                <div className={styles['list-header']}>
                    <span>S.No</span>
                    <span>Vendor Name / Work</span>
                    <span>Contract Amt</span>
                    <span>Total Paid</span>
                    <span>Remaining</span>
                    <span>Status</span>
                </div>
                {combinedData.map((v, idx) => (
                    <div key={idx} className={styles['list-row']} onClick={() => openVendorModal(v)}>
                        <div className={styles['row-data']} style={{ fontWeight: '600', color: '#94a3b8' }}>
                            {combinedData.length - idx}
                        </div>
                        <div className={styles['row-name']}>
                            <div>
                                <div className={styles['emp-name']}>{v.name}</div>
                                <div className={styles['emp-duration']}>{v.workType || 'General Work'}</div>
                            </div>
                        </div>
                        <div className={styles['row-data']}>{formatCurrency(v.contractAmount)}</div>
                        <div className={styles['row-data']} style={{ color: 'var(--present)' }}>{formatCurrency(v.totalPaid)}</div>
                        <div className={styles['row-data']} style={{
                            color: v.remaining > 0 ? 'var(--absent)' : 'var(--present)',
                            fontWeight: 'bold'
                        }}>
                            {formatCurrency(Math.abs(v.remaining))}
                        </div>
                        <div className={styles['row-data']}>
                            <span style={{
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '0.75rem',
                                background: v.remaining > 0 ? '#fee2e2' : '#dcfce7',
                                color: v.remaining > 0 ? '#dc2626' : '#16a34a',
                                fontWeight: '700'
                            }}>
                                {v.remaining > 0 ? 'Pending' : 'Cleared'}
                            </span>
                        </div>
                    </div>
                ))}
                {combinedData.length === 0 && <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No vendors found.</div>}
            </div>

            {isModalOpen && selectedVendor && (
                <div className={styles['modal-overlay']} onClick={() => setIsModalOpen(false)}>
                    <div className={styles['modal-content']} onClick={e => e.stopPropagation()}>
                        <div className={styles['modal-header-colorful']}>
                            <div className={styles['header-left']}>
                                <h2 className={styles['text-primary-theme']}>{selectedVendor.name}</h2>
                                <div className="header-btns" style={{ display: 'flex', gap: '1rem', margin: '0px 1rem' }}>
                                    <button className={styles['btn-vibrant']} onClick={() => { setShowProfileForm(!showProfileForm); }}>
                                        {showProfileForm ? 'Close Edit' : 'Edit Details'}
                                    </button>
                                    <button className={styles['btn-vibrant']} onClick={handlePrintLedger}>
                                        Print Statement
                                    </button>
                                </div>
                            </div>
                            <button className={styles['btn-close-modal']} onClick={() => setIsModalOpen(false)}>&times;</button>
                        </div>

                        <div className={styles['modal-body']}>
                            {showProfileForm && (
                                <div className={styles['profile-card']}>
                                    <h3 className={`${styles['form-title']} ${styles['text-primary-theme']}`}>Vendor Contract Details</h3>
                                    <form onSubmit={handleSaveVendor}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                            <div className={styles['form-group']}>
                                                <label className={styles['text-muted']}>Mobile Number (Required)</label>
                                                <input type="text" value={formMobile} onChange={e => setFormMobile(e.target.value)} required />
                                            </div>
                                            <div className={styles['form-group']}>
                                                <label className={styles['text-muted']}>Work Type (e.g. Pop Work)</label>
                                                <input type="text" value={formWorkType} onChange={e => setFormWorkType(e.target.value)} />
                                            </div>
                                            <div className={styles['form-group']}>
                                                <label className={styles['text-muted']}>Aadhar Card No.</label>
                                                <input type="text" value={formAadhar} onChange={e => setFormAadhar(e.target.value)} />
                                            </div>
                                            <div className={styles['form-group']}>
                                                <label className={styles['text-muted']}>Deadline Date</label>
                                                <input type="date" value={formDeadline} onChange={e => setFormDeadline(e.target.value)} />
                                            </div>
                                            <div className={styles['form-group']} style={{ gridColumn: 'span 2' }}>
                                                <label className={styles['text-muted']}>Full Address</label>
                                                <input type="text" value={formAddress} onChange={e => setFormAddress(e.target.value)} />
                                            </div>
                                            <div className={styles['form-group']} style={{ gridColumn: 'span 2' }}>
                                                <label className={styles['text-muted']} style={{ fontWeight: '800', color: 'var(--primary)' }}>Total Contract Amount (₹)</label>
                                                <input type="number" value={formContractAmount} onChange={e => setFormContractAmount(e.target.value)} required style={{ fontSize: '1.2rem', fontWeight: 'bold' }} />
                                            </div>
                                        </div>
                                        <button type="submit" className={styles['btn-vibrant']} style={{ width: '100%', background: '#63cbf1', color: 'white', padding: '1rem', fontSize: '1.1rem' }}>Save Vendor Contract</button>
                                    </form>
                                </div>
                            )}

                            <div className={styles['table-wrapper']}>
                                <table className={styles['custom-table']}>
                                    <thead><tr><th>Payment Date</th><th>Method</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount Paid</th></tr></thead>
                                    <tbody>
                                        {selectedVendor.receipts.map(r => (
                                            <tr key={r.id}>
                                                <td>{formatIST(r.receiptDate)}</td>
                                                <td>{r.mode}</td>
                                                <td className={styles['text-muted']} style={{ fontSize: '0.9rem' }}>{r.description || '-'}</td>
                                                <td className={styles['text-success']} style={{ fontWeight: '700', textAlign: 'right' }}>{formatCurrency(r.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {selectedVendor.receipts.length === 0 && <div className={`${styles['no-data']} ${styles['text-muted']}`}>No payments found for this vendor.</div>}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VendorLedger;
