import React, { forwardRef, useState, useEffect, useImperativeHandle } from "react";
import { db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import "../styles/MealSelection.css";

const mealOptions = ["Breakfast", "Lunch", "Dinner"];

const MealSelection = forwardRef(({ meals, setMeals, functionDate, dayNight, functionType }, ref) => {
    const [numDays, setNumDays] = useState(1);
    const [showMealModal, setShowMealModal] = useState(false);
    const [currentDayKey, setCurrentDayKey] = useState(null);
    const [currentMeal, setCurrentMeal] = useState(null);
    const [menuData, setMenuData] = useState({});
    const [newItemInputs, setNewItemInputs] = useState({});
    const [mealErrors, setMealErrors] = useState({});   // 🔥 NEW

    // Auto-select all items when the modal opens
    useEffect(() => {
        if (showMealModal && currentDayKey && currentMeal) {
            setMeals(prev => {
                const updated = { ...prev };
                const mealObj = updated[currentDayKey][currentMeal];
                if (!mealObj) return prev;

                const allItems = Object.values(
                    menuData[currentMeal]?.categories?.[mealObj.option] || {}
                ).flat();

                if (!mealObj.selectedItems || mealObj.selectedItems.length === 0) {
                    updated[currentDayKey][currentMeal] = {
                        ...mealObj,
                        selectedItems: allItems,
                    };
                }
                return updated;
            });
        }
    }, [showMealModal, currentDayKey, currentMeal, menuData, setMeals]);

    // Fetch menu from Firestore
    useEffect(() => {
        const fetchMenu = async () => {
            const newMenuData = {};
            for (let meal of mealOptions) {
                const docRef = doc(db, "menu", meal);
                const snap = await getDoc(docRef);
                if (!snap.exists()) continue;

                const data = snap.data();
                const categories = {};

                Object.entries(data.categories || {}).forEach(([catName, catObj]) => {
                    const catItems = {};
                    Object.entries(catObj || {}).forEach(([catItemName, catItemObj]) => {
                        if (catItemName === "price") return;
                        catItems[catItemName] = (catItemObj.menuItems || []).map(i => i.name);
                    });
                    categories[catName] = catItems;
                });

                newMenuData[meal] = { categories };
            }

            const b = newMenuData["Breakfast"]?.categories || {};
            const l = newMenuData["Lunch"]?.categories || {};
            const d = newMenuData["Dinner"]?.categories || {};

            const allCombined = { ...b, ...l, ...d };

            if (newMenuData["Breakfast"]) newMenuData["Breakfast"].categories = allCombined;
            if (newMenuData["Lunch"]) newMenuData["Lunch"].categories = allCombined;
            if (newMenuData["Dinner"]) newMenuData["Dinner"].categories = allCombined;

            setMenuData(newMenuData);
        };
        fetchMenu();
    }, []);

    // Set number of days from meals data
    useEffect(() => {
        if (meals && meals["No. of days"]) setNumDays(parseInt(meals["No. of days"]) || 1);
    }, [meals]);

    // Toggle Meal (Add/Remove)
    const toggleMeal = (dayKey, meal) => {
        setMeals(prev => {
            const updated = { ...prev };
            const dayMeals = { ...(updated[dayKey] || {}) };

            if (dayMeals[meal]) delete dayMeals[meal];
            else {
                const defaultOption = Object.keys(menuData[meal]?.categories || {})[0] || "";
                const items = Object.values(menuData[meal]?.categories?.[defaultOption] || {}).flat() || [];

                dayMeals[meal] = {
                    pax: "",
                    extraPlates: "",
                    rate: "",
                    startTime: "",
                    endTime: "",
                    total: 0,
                    option: defaultOption,
                    items,
                    selectedItems: items,
                };
            }
            updated[dayKey] = dayMeals;
            return updated;
        });
    };

    // Handle Input Change
    const handleChange = (dayKey, meal, field, value) => {
        setMeals(prev => {
            const updated = { ...prev };
            const dayMeals = updated[dayKey] || {};
            const item = dayMeals[meal] || {};
            const newItem = { ...item, [field]: value };

            if (["rate", "pax", "extraPlates"].includes(field)) {
                const rateNum = Number(newItem.rate || 0);   // only for calc
                const paxNum = Number(newItem.pax || 0);
                const extraNum = Number(newItem.extraPlates || 0);

                newItem.total = rateNum * (paxNum + extraNum);
            }

            dayMeals[meal] = newItem;
            updated[dayKey] = dayMeals;

            return updated;
        });

        // Remove validation error on typing
        setMealErrors(prev => {
            const newErr = { ...prev };
            if (newErr?.[dayKey]?.[meal]?.[field]) {
                delete newErr[dayKey][meal][field];
            }
            return newErr;
        });
    };

    // 🔥 REQUIRED VALIDATION LOGIC
    useImperativeHandle(ref, () => ({
        validateMeals: () => {
            let valid = true;
            const errors = {};
            let hasSelectedMeal = false;

            for (const dayKey in meals) {
                const dayMeals = meals[dayKey];
                if (!dayMeals) continue;

                for (const mealKey of Object.keys(dayMeals)) {

                    if (mealKey === "date" || !dayMeals[mealKey]) continue;

                    hasSelectedMeal = true; // At least one meal selected

                    const m = dayMeals[mealKey];
                    const err = {};

                    if (m.rate === "" || isNaN(Number(m.rate))) err.rate = true;

                    if (!m.pax) err.pax = true;
                    if (!m.startTime) err.startTime = true;
                    if (!m.endTime) err.endTime = true;

                    if (Object.keys(err).length > 0) {
                        valid = false;
                        if (!errors[dayKey]) errors[dayKey] = {};
                        errors[dayKey][mealKey] = err;
                    }
                }
            }

            // ⭐ If no meal selected → always valid + clear errors
            if (!hasSelectedMeal) {
                setMealErrors({});
                return true;
            }

            setMealErrors(errors);
            return valid;
        }
    }));

    const getMealOptionsForMeal = (meal, dayDate, functionDate, dayNight) => {
        if (!menuData[meal]) return [];
        if (meal === "Dinner" && dayDate === functionDate && dayNight === "Night") return [];
        if (meal === "Lunch" && dayDate === functionDate && dayNight === "Day") return [];
        return Object.keys(menuData[meal]?.categories || {});
    };

    if (functionType === "Luxury Rooms") return null;

    const formatIndianNumber = (value) => {
        if (value === "" || value === null || value === undefined) return "";

        const [integer, decimal] = value.toString().split(".");

        const formattedInt = Number(integer).toLocaleString("en-IN");

        return decimal !== undefined
            ? `${formattedInt}.${decimal}`
            : formattedInt;
    };

    return (
        <div className="meal-selection">
            <h4>4. Meal Selection</h4>

            <div className="num-days" style={{ justifyContent: 'space-between', display: "none" }}>
                <label style={{ display: 'flex', alignItems: 'center' }}>No. of Days: </label>

                <input
                    style={{ width: '40vw' }}
                    type="text"
                    inputMode="numeric"
                    value={numDays}
                    onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        setNumDays(val);
                        const numVal = parseInt(val);
                        if (!isNaN(numVal)) {
                            setMeals(prev => {
                                const updated = { ...prev, "No. of days": numVal.toString() };
                                for (let i = 1; i <= numVal; i++) {
                                    const dayKey = `Day${i}`;
                                    if (!updated[dayKey]) updated[dayKey] = {};
                                }
                                return updated;
                            });
                        }
                    }}
                />
            </div>

            {/* All Days */}
            {Array.from({ length: numDays }, (_, dIndex) => {
                const dayKey = `Day${dIndex + 1}`;
                const dayMeals = meals[dayKey] || {};

                return (
                    <div key={dayKey} className="day-section">

                        {/* Day Header */}
                        <h5 style={{ display: 'flex', justifyContent: 'space-between' }}>
                            {/* Day {dIndex + 1} */} Date:

                            <input
                                style={{ width: '40vw' }}
                                type="date"
                                value={dayMeals.date || ""}
                                onChange={(e) =>
                                    setMeals(prev => ({
                                        ...prev,
                                        [dayKey]: { ...prev[dayKey], date: e.target.value }
                                    }))
                                }
                            />
                        </h5>

                        {/* Meal Options */}
                        {mealOptions.map(meal => {

                            const availableOptions = getMealOptionsForMeal(
                                meal,
                                dayMeals.date,
                                functionDate,
                                dayNight
                            );

                            if (!dayMeals.date) return null;
                            if (availableOptions.length === 0) return null;

                            const selected = !!dayMeals[meal];
                            const data = dayMeals[meal] || {};

                            return (
                                <div key={meal} className="meal-card">

                                    {/* Checkbox & Label */}
                                    <div className="meal-left">
                                        <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => toggleMeal(dayKey, meal)}
                                        />
                                        <span className="meal-label">{meal}</span>
                                    </div>

                                    {/* Meal Fields */}
                                    {selected && (
                                        <div className="meal-inputs-wrapper">

                                            {/* Option Dropdown */}
                                            <div className="meal-option-dropdown">
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <label>Options:</label>

                                                    <select
                                                        style={{ width: "40vw" }}
                                                        value={data.option || availableOptions[0]}
                                                        onChange={e => {
                                                            const newOption = e.target.value;

                                                            handleChange(dayKey, meal, "option", newOption);

                                                            setMeals(prev => {
                                                                const updated = { ...prev };
                                                                const items = Object.values(
                                                                    menuData[meal]?.categories?.[newOption] || {}
                                                                ).flat();

                                                                updated[dayKey][meal] = {
                                                                    ...updated[dayKey][meal],
                                                                    items,
                                                                    selectedItems: items,
                                                                };

                                                                return updated;
                                                            });
                                                        }}
                                                    >
                                                        {availableOptions.map(opt =>
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        )}
                                                    </select>
                                                </div>

                                                {/* Menu Button */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                                    <label>Menu Items:</label>

                                                    <button
                                                        style={{
                                                            width: '40vw',
                                                            marginTop: 10,
                                                            padding: "6px 12px",
                                                            backgroundColor: "#eea220ff",
                                                            color: "white",
                                                            borderRadius: 4,
                                                            cursor: "pointer",
                                                        }}
                                                        type="button"
                                                        onClick={() => {
                                                            setCurrentDayKey(dayKey);
                                                            setCurrentMeal(meal);
                                                            setShowMealModal(true);
                                                        }}
                                                    >
                                                        🍽 Menu

                                                        {/* Item Count */}
                                                        {(() => {
                                                            const selectedCount = meals?.[dayKey]?.[meal]?.selectedItems?.length || 0;
                                                            const totalCount = Object.values(
                                                                menuData[meal]?.categories?.[data.option] || {}
                                                            ).flat().length;

                                                            const count = selectedCount || totalCount;

                                                            return (
                                                                <span
                                                                    style={{
                                                                        background: "#fff",
                                                                        color: "#eea220",
                                                                        borderRadius: "12px",
                                                                        padding: "2px 8px",
                                                                        marginLeft: 8,
                                                                        fontSize: 12,
                                                                        fontWeight: "600",
                                                                    }}
                                                                >
                                                                    {count} items
                                                                </span>
                                                            );
                                                        })()}
                                                    </button>
                                                </div>

                                                {/* 🟥 REQUIRED FIELDS START HERE */}

                                                {/* Rate */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                                                    <label>Rate:   {mealErrors?.[dayKey]?.[meal]?.rate && (
                                                        <span style={{ color: "red", fontSize: 12 }}>Required</span>
                                                    )}</label>

                                                    <input
                                                        type="text"
                                                        value={formatIndianNumber(data.rate || "")}
                                                        style={{
                                                            width: "40vw",
                                                            border: mealErrors?.[dayKey]?.[meal]?.rate ? "2px solid red" : ""
                                                        }}
                                                        onChange={e => {
                                                            let val = e.target.value.replace(/[^0-9.]/g, "");
                                                            if ((val.match(/\./g) || []).length > 1) return;
                                                            handleChange(dayKey, meal, "rate", val);
                                                        }}

                                                    />
                                                </div>

                                                {/* Pax */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                                                    <label>Pax:  {mealErrors?.[dayKey]?.[meal]?.pax && (
                                                        <span style={{ color: "red", fontSize: 12 }}>Required</span>
                                                    )}</label>

                                                    <input
                                                        type="text"
                                                        value={formatIndianNumber(data.pax || "")}
                                                        style={{
                                                            width: "40vw",
                                                            border: mealErrors?.[dayKey]?.[meal]?.pax ? "2px solid red" : ""
                                                        }}
                                                        onChange={e =>
                                                            handleChange(dayKey, meal, "pax", e.target.value.replace(/[^0-9]/g, ""))
                                                        }
                                                    />
                                                </div>

                                                {/* Extra Plates (Optional) */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                                                    <label>Extra Plates:</label>

                                                    <input
                                                        type="text"
                                                        value={formatIndianNumber(data.extraPlates || "")}
                                                        style={{ width: "40vw" }}
                                                        onChange={e =>
                                                            handleChange(dayKey, meal, "extraPlates", e.target.value.replace(/[^0-9]/g, ""))
                                                        }
                                                    />
                                                </div>

                                                {/* Start Time */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                                                    <label>Start Time:  {mealErrors?.[dayKey]?.[meal]?.startTime && (
                                                        <span style={{ color: "red", fontSize: 12 }}>Required</span>
                                                    )}</label>

                                                    <input
                                                        type="time"
                                                        value={data.startTime || ""}
                                                        style={{
                                                            width: "40vw",
                                                            border: mealErrors?.[dayKey]?.[meal]?.startTime ? "2px solid red" : ""
                                                        }}
                                                        onChange={e =>
                                                            handleChange(dayKey, meal, "startTime", e.target.value)
                                                        }
                                                    />
                                                </div>

                                                {/* End Time */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                                                    <label>End Time:     {mealErrors?.[dayKey]?.[meal]?.endTime && (
                                                        <span style={{ color: "red", fontSize: 12 }}>Required</span>
                                                    )}</label>

                                                    <input
                                                        type="time"
                                                        value={data.endTime || ""}
                                                        style={{
                                                            width: "40vw",
                                                            border: mealErrors?.[dayKey]?.[meal]?.endTime ? "2px solid red" : ""
                                                        }}
                                                        onChange={e =>
                                                            handleChange(dayKey, meal, "endTime", e.target.value)
                                                        }
                                                    />
                                                </div>

                                                {/* Total */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                                                    <label></label>
                                                    <strong>
                                                        Total: ₹{formatIndianNumber((data.total || 0).toFixed(2))}
                                                    </strong>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            })}

            {/* 🍽 MENU MODAL */}
            {showMealModal && currentDayKey && currentMeal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxHeight: "80vh", overflowY: "auto" }}>

                        {/* Header Row */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h3>Select {currentMeal} Items</h3>

                            {/* GLOBAL SELECT ALL */}
                            <button
                                type="button"
                                style={{
                                    backgroundColor: "#ff7a1b",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 6,
                                    padding: "6px 12px",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                }}
                                onClick={() => {
                                    const allItems = Object.values(
                                        menuData[currentMeal]?.categories?.[meals[currentDayKey][currentMeal]?.option] || {}
                                    ).flat();

                                    const alreadySelected =
                                        allItems.every(item =>
                                            meals[currentDayKey][currentMeal]?.selectedItems?.includes(item)
                                        );

                                    setMeals(prev => {
                                        const updated = { ...prev };
                                        const mealObj = updated[currentDayKey][currentMeal];

                                        updated[currentDayKey][currentMeal] = {
                                            ...mealObj,
                                            selectedItems: alreadySelected ? [] : allItems
                                        };

                                        return updated;
                                    });
                                }}
                            >
                                {
                                    (() => {
                                        const allItems = Object.values(
                                            menuData[currentMeal]?.categories?.[meals[currentDayKey][currentMeal]?.option] || {}
                                        ).flat();

                                        const alreadySelected =
                                            allItems.every(item =>
                                                meals[currentDayKey][currentMeal]?.selectedItems?.includes(item)
                                            );

                                        return alreadySelected
                                            ? "Deselect All (All Categories)"
                                            : "Select All (All Categories)";
                                    })()
                                }
                            </button>
                        </div>

                        {/* CATEGORY LIST */}
                        {Object.entries(
                            menuData[currentMeal]?.categories?.[meals[currentDayKey][currentMeal]?.option] || {}
                        ).map(([subCatName, items]) => {
                            const isAllSelected = items.every(item =>
                                meals[currentDayKey][currentMeal]?.selectedItems?.includes(item)
                            );

                            return (
                                <div key={subCatName} style={{ marginBottom: 14 }}>

                                    {/* Sub-category header */}
                                    <div style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center"
                                    }}>
                                        <h4 style={{ fontWeight: 600 }}>
                                            {subCatName.toUpperCase()}
                                        </h4>

                                        {/* Category Select All */}
                                        <button
                                            type="button"
                                            style={{
                                                backgroundColor: isAllSelected ? "#ff5252" : "#4caf50",
                                                color: "white",
                                                border: "none",
                                                borderRadius: 4,
                                                padding: "4px 10px",
                                                cursor: "pointer",
                                                fontSize: "12px",
                                            }}
                                            onClick={() => {
                                                setMeals(prev => {
                                                    const updated = { ...prev };
                                                    const mealObj = updated[currentDayKey][currentMeal];
                                                    let selected = [...(mealObj.selectedItems || [])];

                                                    if (isAllSelected) {
                                                        selected = selected.filter(i => !items.includes(i));
                                                    } else {
                                                        selected = Array.from(new Set([...selected, ...items]));
                                                    }

                                                    updated[currentDayKey][currentMeal] = { ...mealObj, selectedItems: selected };
                                                    return updated;
                                                });
                                            }}
                                        >
                                            {isAllSelected ? "Deselect All" : "Select All"}
                                        </button>
                                    </div>

                                    {/* ITEMS LIST */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                                        {[
                                            ...new Set([
                                                ...items,
                                                ...(meals[currentDayKey][currentMeal]?.selectedItems || [])
                                            ])
                                        ].map((item, index) => {
                                            const checked =
                                                meals[currentDayKey][currentMeal]?.selectedItems?.includes(item);

                                            return (
                                                <label key={item} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span style={{ minWidth: 30, fontWeight: 600 }}>
                                                        {index + 1}.
                                                    </span>

                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => {
                                                            setMeals(prev => {
                                                                const updated = { ...prev };
                                                                const mealObj = updated[currentDayKey][currentMeal];

                                                                let updatedItems;

                                                                if (checked) {
                                                                    updatedItems = mealObj.selectedItems.filter(i => i !== item);
                                                                } else {
                                                                    updatedItems = [...mealObj.selectedItems, item];
                                                                }

                                                                updated[currentDayKey][currentMeal] = {
                                                                    ...mealObj,
                                                                    selectedItems: updatedItems
                                                                };

                                                                return updated;
                                                            });
                                                        }}
                                                    />

                                                    <span>{item}</span>
                                                </label>
                                            );
                                        })}

                                        {/* ➕ ADD NEW ITEM */}
                                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                            <input
                                                type="text"
                                                placeholder="Add new item"
                                                value={newItemInputs[subCatName] || ""}
                                                onChange={e =>
                                                    setNewItemInputs(prev => ({ ...prev, [subCatName]: e.target.value }))
                                                }
                                                style={{ flex: 1, padding: "6px" }}
                                            />

                                            <button
                                                type="button"
                                                style={{
                                                    padding: "6px 12px",
                                                    backgroundColor: "#4dd219",
                                                    color: "white",
                                                    border: "none",
                                                    borderRadius: 4,
                                                    cursor: "pointer",
                                                }}
                                                onClick={() => {
                                                    const value = (newItemInputs[subCatName] || "").trim();
                                                    if (!value) return;

                                                    // Add to menu list
                                                    setMenuData(prev => {
                                                        const updated = { ...prev };
                                                        const cat = meals[currentDayKey][currentMeal].option;

                                                        if (!updated[currentMeal].categories[cat][subCatName]) {
                                                            updated[currentMeal].categories[cat][subCatName] = [];
                                                        }

                                                        if (!updated[currentMeal].categories[cat][subCatName].includes(value)) {
                                                            updated[currentMeal].categories[cat][subCatName].push(value);
                                                        }

                                                        return updated;
                                                    });

                                                    // Add to selected
                                                    setMeals(prev => {
                                                        const updated = { ...prev };
                                                        const mealObj = updated[currentDayKey][currentMeal];

                                                        mealObj.selectedItems = Array.from(
                                                            new Set([...mealObj.selectedItems, value])
                                                        );

                                                        return updated;
                                                    });

                                                    setNewItemInputs(prev => ({ ...prev, [subCatName]: "" }));
                                                }}
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* SAVE BUTTON */}
                        <button
                            onClick={() => setShowMealModal(false)}
                            style={{
                                marginTop: "18px",
                                padding: "10px",
                                borderRadius: "6px",
                                width: "100%",
                                background: "#36ce22",
                                border: "none",
                                color: "white",
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            Save & Close
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
});

export default MealSelection;
