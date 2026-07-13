import React, { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import BackButton from '../components/BackButton';
import { Loader2, Database, CheckSquare, Square, CheckCircle2 } from 'lucide-react';
import styles from '../styles/SalaryLedger.module.css'; // Reusing styles for consistency

const COLLECTIONS_CONFIG = [
    // Core Booking Flow
    { id: 'enquiry', name: 'Enquiries', dbName: 'enquiry', type: 'map' },
    { id: 'pastEnquiry', name: 'Past Enquiries', dbName: 'pastEnquiry', type: 'map' },
    { id: 'bookingLeads', name: 'Active Leads', dbName: 'bookingLeads', type: 'map' },
    { id: 'dropLeads', name: 'Dropped Leads', dbName: 'dropLeads', type: 'map' },
    { id: 'prebookings', name: 'Confirmed Bookings', dbName: 'prebookings', type: 'map' },
    { id: 'cancelledBookings', name: 'Cancelled Bookings', dbName: 'cancelledBookings', type: 'map' },

    // Financial & Staff
    { id: 'salaryLedger', name: 'Staff Ledger', dbName: 'salaryLedger', type: 'doc' },
    { id: 'staffAttendance', name: 'Staff Attendance', dbName: 'staffAttendance', type: 'doc' },
    { id: 'moneyReceipts', name: 'Receipts & Vouchers', dbName: 'moneyReceipts', type: 'map' },
    { id: 'vendor', name: 'Vendor Ledger', dbName: 'vendor', type: 'doc' },
    { id: 'vendorLedger', name: 'Vendor Ledger (Alt)', dbName: 'vendorLedger', type: 'doc' },
    { id: 'accountant', name: 'Accountant Data', dbName: 'accountant', type: 'doc' },

    // Operations
    { id: 'Inventory', name: 'Inventory Stock', dbName: 'Inventory', type: 'map' },
    { id: 'eventTasks', name: 'Checklist Tasks', dbName: 'eventTasks', type: 'doc' },
    { id: 'catering', name: 'Catering Records', dbName: 'catering', type: 'map' },
    { id: 'decoration', name: 'Decoration Records', dbName: 'decoration', type: 'map' },
    { id: 'menu', name: 'Menu Items', dbName: 'menu', type: 'map' },
    { id: 'whatsappMessages', name: 'WhatsApp Logs', dbName: 'whatsappMessages', type: 'map' },

    // System & Settings
    { id: 'usersAccess', name: 'Users & Roles', dbName: 'usersAccess', type: 'doc' },
    { id: 'pannelAccess', name: 'Panel Access', dbName: 'pannelAccess', type: 'doc' },
    { id: 'settings', name: 'System Settings', dbName: 'settings', type: 'doc' },
    { id: 'appControl', name: 'App Control', dbName: 'appControl', type: 'doc' },
    { id: 'MinAmount', name: 'Min Amount Config', dbName: 'MinAmount', type: 'doc' },
];

const DownloadEveryThing = () => {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set(COLLECTIONS_CONFIG.map(c => c.id)));

    const toggleSelection = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const selectAll = () => setSelectedIds(new Set(COLLECTIONS_CONFIG.map(c => c.id)));
    const deselectAll = () => setSelectedIds(new Set());

    const flattenObject = (obj, prefix = '') => {
        let items = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                Object.assign(items, flattenObject(value, prefix + key + '_'));
            } else if (Array.isArray(value)) {
                items[prefix + key] = JSON.stringify(value);
            } else {
                items[prefix + key] = value;
            }
        }
        return items;
    };

    const loadJSZip = () => {
        return new Promise((resolve, reject) => {
            if (window.JSZip) return resolve(window.JSZip);
            const script = document.createElement('script');
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
            script.onload = () => resolve(window.JSZip);
            script.onerror = () => reject(new Error("Failed to load ZIP library. Check internet."));
            document.head.appendChild(script);
        });
    };

    const handleExport = async () => {
        if (selectedIds.size === 0) {
            alert("Please select at least one collection.");
            return;
        }

        try {
            setLoading(true);
            setStatus('Loading ZIP Engine...');
            const JSZip = await loadJSZip();
            const zip = new JSZip();
            const today = new Date().toISOString().split('T')[0];
            let skipped = [];
            let fileCount = 0;

            for (const col of COLLECTIONS_CONFIG) {
                if (!selectedIds.has(col.id)) continue;

                try {
                    setStatus(`Fetching ${col.name}...`);
                    const querySnapshot = await getDocs(collection(db, col.dbName));
                    let allRecords = [];

                    querySnapshot.forEach((docSnap) => {
                        const docData = docSnap.data();
                        if (col.type === 'map') {
                            Object.entries(docData).forEach(([id, record]) => {
                                if (record && typeof record === 'object') {
                                    allRecords.push(flattenObject({ id, ...record, sourceDoc: docSnap.id }));
                                }
                            });
                        } else {
                            allRecords.push(flattenObject({ id: docSnap.id, ...docData }));
                        }
                    });

                    if (allRecords.length > 0) {
                        const ws = XLSX.utils.json_to_sheet(allRecords);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Data");
                        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

                        const fileName = `${col.name.replace(/\s+/g, '_')}_${today}.xlsx`;
                        zip.file(fileName, excelBuffer);
                        fileCount++;
                    }
                } catch (err) {
                    console.warn(`Could not fetch ${col.name}:`, err);
                    skipped.push(col.name);
                }
            }

            if (fileCount === 0) throw new Error("No data found.");

            setStatus('Creating ZIP Archive...');
            const zipContent = await zip.generateAsync({ type: 'blob' });
            saveAs(zipContent, `Backup_${today}.zip`);

            if (skipped.length > 0) {
                setStatus(`Done! (Skipped: ${skipped.join(', ')})`);
            } else {
                setStatus('Download Complete!');
            }
            setTimeout(() => setStatus(''), 5000);
        } catch (error) {
            console.error("Export failed:", error);
            alert("Export failed: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles['salary-ledger-page']}>
            <div className={styles['header-container']}>
                <BackButton />
            </div>

            <div className={styles['controls-container']} style={{ padding: '0 1rem', maxWidth: '1500px', margin: '0 auto' }}>
                <div style={{ background: 'white', padding: '1rem', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.05)', textAlign: 'center' }}>
                    <div style={{ background: '#f0f9ff', width: '60px', height: '60px', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#0369a1' }}>
                        <Database size={30} />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.5rem' }}>Full Data Backup</h2>
                    <p style={{ color: '#64748b', marginBottom: '2rem' }}>Select the collections you want to include in your Excel backup. Every field will be exported.</p>

                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
                        <button onClick={selectAll} style={{ background: '#eff6ff', color: '#2563eb', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Select All</button>
                        <button onClick={deselectAll} style={{ background: '#fef2f2', color: '#dc2626', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Deselect All</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', textAlign: 'left', marginBottom: '2.5rem', background: '#f8fafc', padding: '1.5rem', borderRadius: '16px' }}>
                        {COLLECTIONS_CONFIG.map(col => (
                            <div
                                key={col.id}
                                onClick={() => toggleSelection(col.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    cursor: 'pointer',
                                    padding: '10px',
                                    borderRadius: '10px',
                                    background: selectedIds.has(col.id) ? 'white' : 'transparent',
                                    boxShadow: selectedIds.has(col.id) ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {selectedIds.has(col.id) ? <CheckSquare size={20} color="#2563eb" /> : <Square size={20} color="#cbd5e1" />}
                                <span style={{ fontSize: '0.9rem', color: selectedIds.has(col.id) ? '#1e293b' : '#64748b', fontWeight: selectedIds.has(col.id) ? '600' : '400' }}>{col.name}</span>
                            </div>
                        ))}
                    </div>

                    <button
                        className={styles['btn-vibrant']}
                        style={{ width: '100%', height: '60px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', backgroundColor: "#39add7", color: "white" }}
                        onClick={handleExport}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin" size={24} />
                                <span>{status}</span>
                            </>
                        ) : (
                            <>
                                <span>Generate Excel Backup ({selectedIds.size} selected)</span>
                            </>
                        )}
                    </button>

                    {status && !loading && (
                        <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#10b981', fontWeight: '600' }}>
                            <CheckCircle2 size={20} /> {status}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DownloadEveryThing;

