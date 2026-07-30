import React, { useState } from 'react';
import { setDoc, doc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import * as XLSX from 'xlsx';
import BackButton from '../components/BackButton';
import { Loader2, UploadCloud, CheckCircle2 } from 'lucide-react';
import styles from '../styles/SalaryLedger.module.css';

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

const ImportData = () => {
    const [selectedCollection, setSelectedCollection] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    
    // Attempt to unflatten object keys that were flattened by DownloadEveryThing
    const unflattenObject = (data) => {
        if (Object(data) !== data || Array.isArray(data)) return data;
        const result = {};
        for (const key in data) {
            let keys = key.split('_');
            keys.reduce((acc, currentKey, index) => {
                if (index === keys.length - 1) {
                    let val = data[key];
                    if (typeof val === 'string') {
                        try {
                            if (val.startsWith('[') && val.endsWith(']')) {
                                val = JSON.parse(val);
                            } else if (val === 'true') {
                                val = true;
                            } else if (val === 'false') {
                                val = false;
                            }
                        } catch(e) {}
                    }
                    acc[currentKey] = val;
                } else {
                    acc[currentKey] = acc[currentKey] || {};
                }
                return acc[currentKey];
            }, result);
        }
        return result;
    }

    const handleImport = async () => {
        if (!selectedCollection) {
            alert('Please select a collection to import into.');
            return;
        }
        if (!file) {
            alert('Please select an Excel (.xlsx) file.');
            return;
        }

        const colConfig = COLLECTIONS_CONFIG.find(c => c.id === selectedCollection);
        if (!colConfig) return;

        if (!window.confirm(`Are you sure you want to import data into the "${colConfig.name}" collection? This will overwrite existing documents with the same ID.`)) {
            return;
        }

        try {
            setLoading(true);
            setStatus('Reading File...');

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet);

                    if (!json || json.length === 0) {
                        setStatus('Error: File is empty or invalid.');
                        setLoading(false);
                        return;
                    }

                    setStatus(`Importing ${json.length} records into ${colConfig.name}...`);
                    
                    let importedCount = 0;
                    for (const row of json) {
                        // For map collections, original export flattened with sourceDoc
                        // but if we blindly unflatten, we might break plain fields with underscores.
                        // However, we apply unflattening to respect the structure.
                        const unflattened = unflattenObject(row);
                        
                        let docId = unflattened.id; 
                        let docRef;
                        
                        if (!docId) {
                            // Automatically generate an ID if not provided
                            docId = doc(collection(db, colConfig.dbName)).id;
                        } else {
                            delete unflattened.id;
                        }
                        
                        let targetId = docId;
                        if (colConfig.type === 'map' && unflattened.sourceDoc) {
                            const sourceDocId = unflattened.sourceDoc;
                            delete unflattened.sourceDoc;
                            
                            docRef = doc(db, colConfig.dbName, sourceDocId);
                            await setDoc(docRef, { [targetId]: unflattened }, { merge: true });
                        } else {
                            if (colConfig.type === 'map') {
                                const fallbackDoc = "ImportedData";
                                docRef = doc(db, colConfig.dbName, fallbackDoc);
                                await setDoc(docRef, { [targetId]: unflattened }, { merge: true });
                            } else {
                                docRef = doc(db, colConfig.dbName, targetId);
                                await setDoc(docRef, unflattened, { merge: true });
                            }
                        }
                        
                        importedCount++;
                        if (importedCount % 10 === 0) {
                            setStatus(`Imported ${importedCount} of ${json.length}...`);
                        }
                    }

                    setStatus(`Successfully imported ${importedCount} records!`);
                    setTimeout(() => setStatus(''), 5000);
                } catch (err) {
                    console.error('Import error:', err);
                    setStatus(`Error: ${err.message}`);
                } finally {
                    setLoading(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            console.error('Import failed:', err);
            setStatus(`Error: ${err.message}`);
            setLoading(false);
        }
    };

    return (
        <div className={styles['salary-ledger-page']}>
            <div className={styles['header-container']}>
                <BackButton />
            </div>

            <div className={styles['controls-container']} style={{ padding: '0 1rem', maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ background: 'white', padding: '2rem', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.05)', textAlign: 'center' }}>
                    <div style={{ background: '#f0f9ff', width: '60px', height: '60px', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: '#0369a1' }}>
                        <UploadCloud size={30} />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.5rem' }}>Data Import</h2>
                    <p style={{ color: '#64748b', marginBottom: '2rem' }}>Select a collection and upload the corresponding Excel (.xlsx) file to import data.</p>

                    <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#1e293b' }}>Select Collection</label>
                        <select 
                            value={selectedCollection} 
                            onChange={(e) => setSelectedCollection(e.target.value)}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none', background: 'white' }}
                        >
                            <option value="">-- Choose a collection --</option>
                            {COLLECTIONS_CONFIG.map(col => (
                                <option key={col.id} value={col.id}>{col.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ textAlign: 'left', marginBottom: '2.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#1e293b' }}>Select Excel File</label>
                        <input 
                            type="file" 
                            accept=".xlsx, .xls"
                            onChange={(e) => setFile(e.target.files[0])}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px dashed #cbd5e1', background: '#f8fafc' }}
                        />
                    </div>

                    <button
                        className={styles['btn-vibrant']}
                        style={{ width: '100%', height: '60px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "12px", cursor: "pointer", fontWeight: "600" }}
                        onClick={handleImport}
                        disabled={loading || !selectedCollection || !file}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin" size={24} />
                                <span>{status}</span>
                            </>
                        ) : (
                            <>
                                <UploadCloud size={24} />
                                <span>Import Data</span>
                            </>
                        )}
                    </button>

                    {status && !loading && status.includes('Successfully') && (
                        <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#10b981', fontWeight: '600' }}>
                            <CheckCircle2 size={20} /> {status}
                        </div>
                    )}
                    
                    {status && !loading && status.includes('Error') && (
                        <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#dc2626', fontWeight: '600' }}>
                            {status}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportData;
