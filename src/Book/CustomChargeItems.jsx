import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import debounce from 'lodash.debounce';
import { getDocs, where, query, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import '../styles/CustomChargeItems.css';

const mergeWithDbItems = (dbItems = [], selected = []) => {
    const merged = dbItems.map(item => ({
        ...item,
        qty: item.qty ? String(item.qty) : '1',
        rate: item.rate !== undefined && item.rate !== null
            ? String(item.rate)
            : "",

        selected: false
    }));

    selected.forEach(sel => {
        const idx = merged.findIndex(p => p.id === sel.id);
        const cleaned = {
            ...sel,
            qty: sel.qty !== undefined && sel.qty !== null ? String(sel.qty) : '1',
            rate: sel.rate !== undefined && sel.rate !== null
                ? String(sel.rate)
                : "",

            selected: true
        };
        if (idx !== -1) merged[idx] = { ...merged[idx], ...cleaned };
        else merged.push(cleaned);
    });

    return merged;
};

const CustomChargeItems = forwardRef(({ customItems, setCustomItems, functionType }, ref) => {
    const [dbItems, setDbItems] = useState([]);
    const [localItems, setLocalItems] = useState([]);
    const [errors, setErrors] = useState({});
    const hasInitializedRef = React.useRef(false);

    // ✅ Fetch Add-Ons
    useEffect(() => {
        const fetchAddons = async () => {
            try {
                const q = query(collection(db, "usersAccess"), where("accessToApp", "==", "A"));
                const snap = await getDocs(q);

                if (snap.empty) {
                    console.warn("No usersAccess doc found with accessToApp: 'A'");
                    return;
                }

                const allAddons = [];

                snap.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.addons && Array.isArray(data.addons)) {
                        allAddons.push(...data.addons);
                    }
                });

                const uniqueAddons = [...new Set(allAddons)];

                const items = (functionType === "Luxury Rooms"
                    ? ["Luxury Rooms", "Water Bottle"]
                    : uniqueAddons
                ).map((addon, idx) => ({
                    id: idx + 1,
                    name: addon || '',
                    qty: '1',
                    rate: '',
                    selected: false
                }));

                setDbItems(items);
            } catch (err) {
                console.error("Error fetching addons:", err);
            }
        };

        fetchAddons();
    }, [functionType]);

    // ✅ Merge items once data arrives
    useEffect(() => {
        if (!hasInitializedRef.current && dbItems.length) {
            setLocalItems(mergeWithDbItems(dbItems, customItems));
            hasInitializedRef.current = true;
        }
    }, [dbItems, customItems]);

    const numOrBlank = v => (v === '' ? '' : Number(v));

    const validateItems = items => {
        const newErrors = {};
        items.forEach((item, idx) => {
            if (item.selected) {
                const qtyNum = Number(item.qty) || 0;
                const rateNum = Number(item.rate) || 0;
                if (qtyNum <= 0) newErrors[idx] = { ...(newErrors[idx] || {}), qty: true };
                if (item.rate === '' || isNaN(rateNum)) {
                    newErrors[idx] = { ...(newErrors[idx] || {}), rate: true };
                }
            }
        });
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    useImperativeHandle(ref, () => ({
        validateCustomItems: () => validateItems(localItems)
    }));

    const debouncedSaveRef = React.useRef(null);

    if (!debouncedSaveRef.current) {
        debouncedSaveRef.current = debounce(items => {
            validateItems(items);
            const selectedOnly = items
                .filter(i => i.selected)
                .map(i => ({
                    ...i,
                    qty: numOrBlank(i.qty),
                    rate: i.rate === '' ? '' : Number(i.rate),
                    total: i.qty === '' || i.rate === '' ? 0 : i.qty * i.rate
                }));
            setCustomItems(selectedOnly);
        }, 300);
    }

    const updateRow = (idx, mutator) => {
        setLocalItems(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...mutator(next[idx]) };
            debouncedSaveRef.current(next);
            return next;
        });
    };

    const toggleSelection = idx =>
        updateRow(idx, row => ({ selected: !row.selected }));

    const handleChange = (idx, field, value) => {
        // ✅ Don’t auto-restore 1 here — only update what user typed
        updateRow(idx, () => ({ [field]: value }));
    };

    const addNewItem = () => {
        setLocalItems(prev => {
            const next = [
                ...prev,
                { id: Date.now().toString(), name: '', qty: '1', rate: '', selected: true }
            ];
            debouncedSaveRef.current(next);

            return next;
        });
    };

    const formatIndianNumber = (value) => {
        if (value === "" || value === null || value === undefined) return "";

        const str = value.toString();

        // typing support like "12."
        if (str.endsWith(".")) return str;

        const [intPart, decimalPart] = str.split(".");
        const formattedInt = Number(intPart || 0).toLocaleString("en-IN");

        return decimalPart !== undefined
            ? `${formattedInt}.${decimalPart}`
            : formattedInt;
    };

    return (
        <div className="custom-items-section">
            <h4>2. Extra Items / Add-Ons Charges</h4>

            {localItems.map((item, idx) => (
                <div key={item.id} className="custom-item-card">
                    <div className="item-header-row">
                        <label style={{ display: "inline-block", cursor: "pointer", marginRight: "12px" }}>
                            <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => toggleSelection(idx)}
                                style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span
                                style={{
                                    display: "inline-block",
                                    width: "14px",
                                    height: "14px",
                                    backgroundColor: item.selected ? "#4af650ff" : "#fff",
                                    border: "0.5px solid gray",
                                    borderRadius: "6px"
                                }}
                            />
                        </label>

                        <input
                            type="text"
                            placeholder="Add-on name"
                            value={item.name}
                            onChange={e => handleChange(idx, 'name', e.target.value)}
                        />
                    </div>

                    {item.selected && (
                        <div className="item-details">
                            {/* RATE FIELD */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                <span className="math-symbol">
                                    Rate: {errors[idx]?.rate && <span className="error">Required</span>}
                                </span>
                                <input
                                    style={{ width: '40vw', marginTop: '10px' }}
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="Rate"
                                    value={item.rate}
                                    onFocus={() => {
                                        debouncedSaveRef.current?.cancel();
                                    }}
                                    onChange={e => {
                                        let val = e.target.value.replace(/,/g, "");

                                        // ✅ allow "", 0, 0.5, 21.45
                                        if (!/^\d*(\.\d{0,2})?$/.test(val)) return;

                                        handleChange(idx, "rate", val);
                                    }}
                                    className={errors[idx]?.rate ? "error-border" : ""}
                                />

                            </div>

                            {/* QTY FIELD */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                <span className="math-symbol">
                                    Qty: {errors[idx]?.qty && <span className="error">Required</span>}
                                </span>
                                <input
                                    style={{ width: '40vw', marginTop: '10px' }}
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Quantity"
                                    value={formatIndianNumber(item.qty)}
                                    onFocus={e => e.target.select()}
                                    onChange={e => {
                                        const val = e.target.value.replace(/[^0-9]/g, "");
                                        handleChange(idx, "qty", val); // ✅ Allow empty
                                    }}
                                    onBlur={() => {
                                        // ✅ Only restore “1” if blank or 0 after leaving the field
                                        if (item.qty === '' || item.qty === '0') handleChange(idx, "qty", "1");
                                    }}
                                    className={errors[idx]?.qty ? "error-border" : ""}
                                />
                            </div>

                            {/* TOTAL */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                <label></label>
                                <span style={{ fontWeight: '700' }}>
                                    Total: ₹
                                    {item.qty !== '' && item.rate !== ''
                                        ? formatIndianNumber(
                                            (Number(item.qty) * Number(item.rate)).toFixed(2)
                                        )
                                        : '—'}
                                </span>

                            </div>
                        </div>
                    )}
                </div>
            ))}

            <button type="button" className="add-item-btn" onClick={addNewItem}>
                + Add Item
            </button>
        </div>
    );
});

export default CustomChargeItems;
