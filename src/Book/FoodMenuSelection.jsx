import React, { useState, useEffect } from 'react';
import '../styles/BookingAmenities.css';
import { db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

const FoodMenuSelection = ({ selectedMenus, setSelectedMenus, noOfPlates, extraPlates, functionType }) => {
    const [newItemName, setNewItemName] = useState("");
    const [popupMenu, setPopupMenu] = useState(null);
    const [categories, setCategories] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMenu = async () => {
            try {
                const dinnerRef = doc(db, "menu", "Dinner");
                const dinnerSnap = await getDoc(dinnerRef);

                if (dinnerSnap.exists()) {
                    const data = dinnerSnap.data();
                    setCategories(data.categories || {});
                }
            } catch (err) {
                console.error("Error fetching menu:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchMenu();
    }, []);

    useEffect(() => {
        const base = parseInt(noOfPlates || "0", 10);
        const extra = parseInt(extraPlates || "0", 10);

        setSelectedMenus(prev => {
            const updated = {};
            for (const [menuKey, menu] of Object.entries(prev)) {
                const total = (menu.rate || 0) * (base + extra);
                updated[menuKey] = {
                    ...menu,
                    noOfPlates: base,
                    extraPlates: extra,
                    total
                };
            }
            return updated;
        });
    }, [noOfPlates, extraPlates, setSelectedMenus]);

    const toggleSelection = (menuKey) => {
        setSelectedMenus(prev => {
            const isSelected = menuKey in prev;
            if (isSelected) {
                const updated = { ...prev };
                delete updated[menuKey];
                return updated;
            }

            const categoryData = categories[menuKey] || {};
            const rate = parseFloat(categoryData.price || 0);

            const base = parseInt(noOfPlates || "0", 10);
            const extra = parseInt(extraPlates || "0", 10);
            const total = rate * (base + extra);

            // Collect all menuItems from sections
            const selectedSubItems = Object.values(categoryData)
                .filter(v => typeof v === 'object' && v.menuItems)
                .flatMap(section => section.menuItems.map(mi => mi.name));

            return {
                [menuKey]: {
                    rate,
                    noOfPlates: base,
                    extraPlates: extra,
                    total,
                    selectedSubItems
                }
            };


        });
    };

    const toggleSubItem = (menuKey, item) => {
        setSelectedMenus(prev => {
            const menu = prev[menuKey];
            const selected = menu.selectedSubItems || [];
            const updatedSelected = selected.includes(item)
                ? selected.filter(i => i !== item)
                : [...selected, item];
            return { ...prev, [menuKey]: { ...menu, selectedSubItems: updatedSelected } };
        });
    };

    const handleRateChange = (menuKey, value) => {
        const rate = parseFloat(value || "0");
        const base = parseInt(noOfPlates || "0", 10);
        const extra = parseInt(extraPlates || "0", 10);
        const total = rate * (base + extra);

        setSelectedMenus(prev => ({
            ...prev,
            [menuKey]: {
                ...prev[menuKey],
                rate: value,
                noOfPlates: base,
                extraPlates: extra,
                total
            }
        }));

    };

    const addNewItem = (menuKey) => {
        if (!newItemName.trim()) return;
        setSelectedMenus(prev => {
            const menu = prev[menuKey];
            const updatedSelectedSubItems = [...(menu.selectedSubItems || []), newItemName.trim()];
            return { ...prev, [menuKey]: { ...menu, selectedSubItems: updatedSelectedSubItems } };
        });
        setNewItemName("");
    };

    if (functionType === "Luxury Rooms") {
        return null;
    }

    if (loading) return <p>Loading menu...</p>;

    const formatIndianNumber = (value) => {
        if (value === "" || value === null || value === undefined) return "";

        const str = value.toString();

        // allow typing like "21." or "0."
        if (str.endsWith(".")) return str;

        const [intPart, decimalPart] = str.split(".");
        const formattedInt = Number(intPart || 0).toLocaleString("en-IN");

        return decimalPart !== undefined
            ? `${formattedInt}.${decimalPart}`
            : formattedInt;
    };

    return (
        <div className="food-menu-selection">
            <h4>3. Food Menu Selection</h4>

            {Object.keys(categories).map((categoryName) => {
                const isSelected = categoryName in selectedMenus;
                const menuData = selectedMenus[categoryName] || {};

                return (
                    <div key={categoryName} style={{ marginBottom: "16px" }}>
                        {/* Category Row */}
                        <div style={{ display: "flex", alignItems: "center" }}>
                            <label style={{ position: "relative", cursor: "pointer", marginRight: "12px" }}>
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelection(categoryName)}
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span
                                    style={{
                                        display: "inline-block",
                                        width: "16px",
                                        height: "16px",
                                        borderRadius: "8px",
                                        border: "1px solid gray",
                                        backgroundColor: isSelected ? "#4af650" : "#fff",
                                        boxShadow: isSelected
                                            ? "0 4px #9b9b9b, 0 6px 8px rgba(27,116,7,0.8)"
                                            : "0 4px #adadad, 0 6px 5px rgba(0,0,0,0)",
                                        transition: "all 0.1s ease-in-out",
                                    }}
                                />
                            </label>

                            <span style={{ fontWeight: 500 }}>
                                {categoryName
                                    .split(" ")
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(" ")}
                            </span>

                        </div>

                        {/* If selected, show menu items */}
                        {isSelected && (
                            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                                {/* Menu Button */}
                                <button
                                    type="button"
                                    onClick={() => setPopupMenu(categoryName)}
                                    style={{
                                        alignSelf: "flex-start",
                                        padding: "6px 18px",
                                        backgroundColor: "#4CAF50",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: "12px",
                                        fontWeight: 600,
                                        fontSize: "14px",
                                        cursor: "pointer",
                                        boxShadow: "0 4px #388E3C, 0 6px 10px rgba(0,0,0,0.2)",
                                        transition: "all 0.15s ease-in-out",
                                    }}
                                    onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(2px)")}
                                    onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0px)")}
                                >
                                    🍽 Menu
                                </button>

                                {/* Rate × Qty = Total */}
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "12px",
                                        padding: "8px 12px",
                                        borderRadius: "12px",
                                        backgroundColor: "#f0f0f0",
                                        boxShadow: "inset 3px 3px 6px #d1d1d1, inset -3px -3px 6px #ffffff",
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <label>Rate :</label>
                                    <input
                                        type="text"
                                        value={formatIndianNumber(menuData.rate ?? "")}
                                        onChange={(e) => {
                                            let val = e.target.value.replace(/,/g, "");

                                            // ✅ allow 0, 43, 43.5, 21.45
                                            if (!/^\d*(\.\d{0,2})?$/.test(val)) return;

                                            handleRateChange(categoryName, val);
                                        }}
                                        style={{ width: "90px", textAlign: "center" }}
                                    />

                                    <div>
                                        <label> Pax : </label>
                                        <input
                                            type="text"
                                            disabled
                                            value={`${formatIndianNumber(noOfPlates || 0)} + ${formatIndianNumber(extraPlates || 0)}`}
                                            style={{
                                                width: "200px",
                                                padding: "6px 10px",
                                                borderRadius: "8px",
                                                border: "none",
                                                outline: "none",
                                                textAlign: "center",
                                                fontWeight: 500,
                                                backgroundColor: "#e0e0e0",
                                                boxShadow: "3px 3px 6px rgba(0,0,0,0.2), -3px -3px 6px rgba(255,255,255,0.7)",
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label> Total : </label>
                                        <span
                                            style={{
                                                fontWeight: 700,
                                                padding: "6px 10px",
                                                borderRadius: "8px",
                                                backgroundColor: "#4CAF50",
                                                color: "#fff",
                                                boxShadow: "3px 3px 6px rgba(0,0,0,0.3), -2px -2px 5px rgba(255,255,255,0.5)",
                                            }}
                                        >
                                            ₹{formatIndianNumber(
                                                menuData?.total !== undefined
                                                    ? Number(menuData.total).toFixed(2)   // ✅ 2 decimal
                                                    : "0"
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}

            {popupMenu && (
                <div
                    className="menu-popup"
                    style={{
                        position: "fixed",
                        inset: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.27)",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 9999,
                    }}
                >
                    <div
                        style={{
                            backgroundColor: "#e0e0e0",
                            padding: "20px",
                            borderRadius: "16px",
                            maxWidth: "400px",
                            width: "90%",
                            maxHeight: "75%",
                            overflowY: "auto",
                        }}
                    >

                        <h4 style={{ textAlign: "center", marginBottom: "16px", textDecoration: 'underline' }}>
                            {popupMenu
                                .split(" ")
                                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                .join(" ")}
                        </h4>

                        {categories[popupMenu] &&
                            Object.keys(categories[popupMenu])
                                .filter(subCat => typeof categories[popupMenu][subCat] === 'object')
                                .map((subCat) => (
                                    <div key={subCat} style={{ marginBottom: "12px" }}>
                                        <h5
                                            style={{
                                                fontWeight: 700,
                                                marginBottom: "6px",
                                                color: 'red',
                                                fontSize: '16px'
                                            }}
                                        >
                                            {subCat.toUpperCase()}
                                        </h5>

                                        {categories[popupMenu][subCat].menuItems?.map((item) => {
                                            const isChecked = selectedMenus[popupMenu]?.selectedSubItems?.includes(item.name);
                                            return (
                                                <label
                                                    key={item.id}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "10px",
                                                        padding: "6px 10px",
                                                        marginBottom: "6px",
                                                        borderRadius: "8px",
                                                        background: "#e0e0e0",
                                                        boxShadow: "2px 2px 5px #bebebe, -2px -2px 5px #ffffff",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleSubItem(popupMenu, item.name)}
                                                        style={{ display: "none" }}
                                                    />
                                                    <span
                                                        style={{
                                                            width: "20px",
                                                            height: "20px",
                                                            borderRadius: "50%",
                                                            background: isChecked ? "#4CAF50" : "#e0e0e0",
                                                            boxShadow: isChecked
                                                                ? "inset 2px 2px 5px #2d7a32, inset -2px -2px 5px #6ad97d"
                                                                : "inset 2px 2px 5px #bebebe, inset -2px -2px 5px #ffffff",
                                                            transition: "all 0.1s",
                                                        }}
                                                    />
                                                    {item.name}
                                                </label>
                                            );
                                        })}
                                    </div>
                                ))
                        }

                        {selectedMenus[popupMenu]?.selectedSubItems?.some(itemName => {
                            return !Object.values(categories[popupMenu] || {})
                                .some(subCat => subCat.menuItems?.some(mi => mi.name === itemName));
                        }) && (
                                <div style={{ marginBottom: "12px" }}>

                                    <h5
                                        style={{
                                            fontWeight: 700,
                                            marginBottom: "6px",
                                            color: 'red',
                                            fontSize: '16px'
                                        }}
                                    >
                                        Added
                                    </h5>

                                    {selectedMenus[popupMenu].selectedSubItems
                                        .filter(itemName => !Object.values(categories[popupMenu] || {})
                                            .some(subCat => subCat.menuItems?.some(mi => mi.name === itemName))
                                        )
                                        .map((itemName, idx) => (
                                            <label
                                                key={idx}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "10px",
                                                    padding: "6px 10px",
                                                    marginBottom: "6px",
                                                    borderRadius: "8px",
                                                    background: "#e0e0e0",
                                                    boxShadow: "2px 2px 5px #bebebe, -2px -2px 5px #ffffff",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={true}
                                                    onChange={() => toggleSubItem(popupMenu, itemName)}
                                                    style={{ display: "none" }}
                                                />
                                                <span
                                                    style={{
                                                        width: "20px",
                                                        height: "20px",
                                                        borderRadius: "50%",
                                                        background: "#4CAF50",
                                                        boxShadow: "inset 2px 2px 5px #2d7a32, inset -2px -2px 5px #6ad97d",
                                                        transition: "all 0.1s",
                                                    }}
                                                />
                                                {itemName}
                                            </label>
                                        ))}
                                </div>
                            )}

                        {/* Add Custom Item Input */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <input
                                type="text"
                                value={newItemName}
                                onChange={(e) => setNewItemName(e.target.value)}
                                placeholder=""
                                style={{ flex: 1, padding: '6px', borderRadius: '8px', border: '1px solid #ccc' }}
                            />
                            <button
                                type='button'
                                onClick={() => addNewItem(popupMenu)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#4CAF50',
                                    color: '#fff',
                                    cursor: 'pointer',
                                }}
                            >
                                Add
                            </button>
                        </div>

                        {/* Close Button */}
                        <button
                            type='button'
                            onClick={() => setPopupMenu(null)}
                            style={{
                                marginTop: "16px",
                                padding: "8px 14px",
                                borderRadius: "12px",
                                border: "none",
                                background: "#36ce22ff",
                                color: "#fff",
                                cursor: "pointer",
                                fontSize: "14px",
                                width: "100%",
                                boxShadow: "inset 4px 4px 6px #1fa00eff, inset -4px -4px 6px #90fc82ff",
                                transition: "all 0.1s",
                            }}
                        >
                            Save & Close
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default FoodMenuSelection;
