import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import debounce from 'lodash.debounce';
import { getDocs, where, query, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import '../styles/CustomChargeItems.css';

const mergeWithDbItems = (dbItems = [], selected = []) => {
    const merged = dbItems.map(item => ({
        ...item,
        qty: item.qty ? String(item.qty) : '1',
        rate: item.rate ? String(item.rate) : '',
        selected: false
    }));

    selected.forEach(sel => {
        const idStr = String(sel.id);
        const idx = merged.findIndex(p => String(p.id) === idStr);
        const cleaned = {
            ...sel,
            qty: sel.qty !== undefined && sel.qty !== null ? String(sel.qty) : merged[idx]?.qty ?? '1',
            rate: sel.rate !== undefined && sel.rate !== null ? String(sel.rate) : merged[idx]?.rate ?? ''
        };
        if (idx !== -1) merged[idx] = { ...merged[idx], ...cleaned, selected: true };
        else merged.push({ ...cleaned, selected: true });
    });

    return merged;
};

const CustomMenuCharges = forwardRef(({ menuCharges, setMenuCharges, functionType, extraPlates }, ref) => {
    const hasInitializedRef = React.useRef(false);
    const [dbItems, setDbItems] = useState([]);
    const [localItems, setLocalItems] = useState([]);
    const [errors, setErrors] = useState({});

    const debouncedSave = useMemo(() =>
        debounce(items => {
            validateItems(items);
            const selectedOnly = items
                .filter(i => i.selected)
                .map(i => ({
                    ...i,
                    qty: i.qty === '' ? '' : Number(i.qty),
                    rate: i.rate,                  // 👈 keep STRING
                    total:
                        i.qty === '' || i.rate === ''
                            ? 0
                            : Number(i.qty) * Number(i.rate)
                }));
            setMenuCharges(selectedOnly);
        }, 200), [setMenuCharges]
    );

    useEffect(() => {
        const fetchMenuItems = async () => {
            try {
                const q = query(collection(db, "usersAccess"), where("accessToApp", "==", "A"));
                const snap = await getDocs(q);

                if (snap.empty) {
                    console.warn("No usersAccess document found with accessToApp: 'A'");
                    return;
                }

                const allMenus = [];
                snap.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.menuItems && Array.isArray(data.menuItems)) {
                        allMenus.push(...data.menuItems);
                    }
                });

                const uniqueMenus = [...new Set(allMenus)];

                const items = uniqueMenus.map((menu, idx) => ({
                    id: (idx + 1).toString(),
                    name: menu || '',
                    qty: '1', // default 1 for DB-provided items
                    rate: '',
                    selected: false
                }));

                setDbItems(items);
            } catch (err) {
                console.error("Error fetching menuItems:", err);
            }
        };

        fetchMenuItems();
    }, []);

    useEffect(() => {
        if (!dbItems.length) return;

        setLocalItems(prev => {
            // initial case: prev empty -> fully merge
            if (!prev || prev.length === 0) {
                return mergeWithDbItems(dbItems, menuCharges || []);
            }

            // otherwise preserve prev but sync selected values coming from menuCharges:
            const byId = {};
            (menuCharges || []).forEach(mc => {
                byId[String(mc.id)] = mc;
            });

            // ensure we also include any DB items that are new and not present in prev
            const prevById = Object.fromEntries(prev.map(p => [String(p.id), p]));

            // start from dbItems (so ordering remains consistent)
            const merged = dbItems.map(dbIt => {
                const idStr = String(dbIt.id);
                const prevItem = prevById[idStr];
                const saved = byId[idStr];

                if (prevItem) {
                    // keep user's ongoing edits (qty/rate/name/selected) unless saved has stronger authority:
                    // if saved exists and prevItem is not currently focused/being edited, we still apply saved values.
                    // BUT to keep it simple and safe for typing, prefer prevItem's values (so typing won't be clobbered).
                    return { ...prevItem, selected: !!saved || !!prevItem.selected };
                }

                // if there's no prev item, build from db and possibly saved
                if (saved) {
                    return {
                        id: idStr,
                        name: saved.name ?? dbIt.name ?? '',
                        qty: saved.qty !== undefined && saved.qty !== null ? String(saved.qty) : (dbIt.qty ?? '1'),
                        rate: saved.rate !== undefined && saved.rate !== null ? String(saved.rate) : (dbIt.rate ?? ''),
                        selected: true
                    };
                }

                return {
                    id: idStr,
                    name: dbIt.name ?? '',
                    qty: dbIt.qty ?? '1',
                    rate: dbIt.rate ?? '',
                    selected: false
                };
            });

            // Also include any selected items that are not present in dbItems (custom added earlier)
            (menuCharges || []).forEach(mc => {
                const idStr = String(mc.id);
                if (!merged.find(m => String(m.id) === idStr)) {
                    merged.push({
                        id: idStr,
                        name: mc.name ?? '',
                        qty: mc.qty !== undefined && mc.qty !== null ? String(mc.qty) : '1',
                        rate: mc.rate !== undefined && mc.rate !== null ? String(mc.rate) : '',
                        selected: true
                    });
                }
            });

            // Include any prev items that were custom and not in merged yet (preserve user edits)
            prev.forEach(p => {
                const idStr = String(p.id);
                if (!merged.find(m => String(m.id) === idStr)) merged.push(p);
            });

            return merged;
        });
    }, [dbItems, menuCharges]);

    useEffect(() => {
        if (!hasInitializedRef.current && dbItems.length) {
            setLocalItems(mergeWithDbItems(dbItems, menuCharges || []));
            hasInitializedRef.current = true;
        }
    }, [dbItems, menuCharges]);

    const validateItems = (items) => {
        const newErrors = {};
        items.forEach((item, idx) => {
            if (item.selected) {
                const qtyNum = Number(item.qty) || 0;
                const rateNum = Number(item.rate) || 0;

                if (qtyNum <= 0) {
                    newErrors[idx] = { ...(newErrors[idx] || {}), qty: true };
                }
                if (item.rate === "" || isNaN(rateNum)) {
                    newErrors[idx] = { ...(newErrors[idx] || {}), rate: true };
                }

            }
        });
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    useImperativeHandle(ref, () => ({
        validateMenuCharges: () => validateItems(localItems)
    }));

    const updateRow = (idx, mutator) => {
        setLocalItems(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], ...mutator(next[idx]) };
            debouncedSave(next);
            return next;
        });
    };

    const toggleSelection = idx =>
        updateRow(idx, row => {
            const isSelecting = !row.selected;
            const extra = Number(extraPlates) || 0;

            if (isSelecting) {
                return {
                    selected: true,
                    qty: extra > 0 ? String(extra) : "1",
                    autoGenerated: true
                };
            }

            return { selected: false };
        });

    const handleChange = (idx, field, value) => updateRow(idx, () => ({ [field]: value }));

    const addNewItem = () => {
        setLocalItems(prev => {
            const next = [
                ...prev,
                { id: Date.now().toString(), name: '', qty: '1', rate: '', selected: true }
            ];
            debouncedSave(next);
            return next;
        });
    };

    if (functionType === "Luxury Rooms") {
        return null;
    }

    const formatIndianNumber = (value) => {
        if (value === "" || value === null || value === undefined) return "";

        const str = value.toString();

        // typing / fixed decimals support
        if (str.endsWith(".")) return str;

        const [intPart, decimalPart] = str.split(".");
        const formattedInt = Number(intPart || 0).toLocaleString("en-IN");

        return decimalPart !== undefined
            ? `${formattedInt}.${decimalPart}`
            : formattedInt;
    };

    return (
        <div className="custom-items-section">
            <h4>3. Menu Item Charges</h4>

            {localItems.map((item, idx) => (
                <div key={item.id} className="custom-item-card">
                    <div className="item-header-row">
                        <label style={{ display: "inline-block", cursor: "pointer", marginRight: "12px" }}>
                            <input
                                type="checkbox"
                                checked={!!item.selected}
                                onChange={() => toggleSelection(idx)}
                                style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{
                                display: "inline-block",
                                width: "14px",
                                height: "14px",
                                backgroundColor: item.selected ? "#4af650ff" : "#ffffff",
                                border: "0.5px solid gray",
                                borderRadius: "6px"
                            }} />
                        </label>

                        <input
                            type="text"
                            placeholder="Menu item name"
                            value={item.name}
                            onChange={e => handleChange(idx, 'name', e.target.value)}
                        />
                    </div>

                    {item.selected && (
                        <div>
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
                                    onChange={(e) => {
                                        let val = e.target.value.replace(/[^0-9.]/g, "");
                                        if ((val.match(/\./g) || []).length > 1) val = val.slice(0, -1);
                                        handleChange(idx, "rate", val);
                                    }}
                                    className={errors[idx]?.rate ? "error-border" : ""}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                <span className="math-symbol">
                                    Qty: {errors[idx]?.qty && <span className="error">Required</span>}
                                </span>
                                <div >
                                    <input
                                        style={{ width: '40vw', marginTop: '10px' }}
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="Quantity"
                                        value={formatIndianNumber(item.qty)}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9]/g, "");
                                            updateRow(idx, () => ({
                                                qty: val,
                                                autoGenerated: false
                                            }));
                                        }}
                                        onBlur={() => {
                                            // only restore 0 if left blank or zero on blur
                                            if (!item.qty || item.qty === '0') handleChange(idx, "qty", "0");
                                        }}
                                        className={errors[idx]?.qty ? "error-border" : ""}
                                    />

                                    {item.selected && Number(extraPlates) > 0 && (
                                        <div style={{
                                            fontSize: "12px",
                                            color: "#c62828",
                                            background: "#fff3f3",
                                            padding: "4px 8px",
                                            borderRadius: "6px",
                                            marginTop: "6px",
                                            display: "block"
                                        }}>
                                            Includes extra plates:  {extraPlates}
                                        </div>
                                    )}
                                </div>
                            </div>

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
                + Add Menu Charge
            </button>
        </div>
    );
});

export default CustomMenuCharges;
