import React, { forwardRef, useState, useEffect, useImperativeHandle } from "react";
import { db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import "../styles/MealSelection.css";

const mealOptions = ["Breakfast", "Lunch", "Dinner"];

const MealSelection = forwardRef(({ meals, setMeals, functionDate, dayNight, functionType, isEditMode }, ref) => {
    const [numDays, setNumDays] = useState(1);
    const [showMealModal, setShowMealModal] = useState(false);
    const [currentDayKey, setCurrentDayKey] = useState(null);
    const [currentMeal, setCurrentMeal] = useState(null);
    const [menuData, setMenuData] = useState({});
    const [newItemInputs, setNewItemInputs] = useState({});

    const sanitizeDecimal = (val) => {
        val = val.replace(/,/g, "");

        // allow empty, digits, one dot, 2 decimals
        if (!/^\d*(\.\d{0,2})?$/.test(val)) return null;

        return val;
    };

    // ✅ Auto-select all items when the modal opens
    useEffect(() => {
        if (isEditMode) return;

        if (showMealModal && currentDayKey && currentMeal) {
            setMeals(prev => {
                const updated = { ...prev };
                const mealObj = updated[currentDayKey][currentMeal];
                if (!mealObj) return prev;

                // Get all menu items from the selected category
                const allItems = Object.values(
                    menuData[currentMeal]?.categories?.[mealObj.option] || {}
                ).flat();

                // ✅ If no items selected yet, preselect all
                if (!mealObj.selectedItems || mealObj.selectedItems.length === 0) {
                    updated[currentDayKey][currentMeal] = {
                        ...mealObj,
                        selectedItems: allItems,
                    };
                }
                return updated;
            });
        }
    }, [showMealModal, currentDayKey, currentMeal, menuData, setMeals, isEditMode]);

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

            // 🚀 Merge all three (Breakfast + Lunch + Dinner) into each meal
            const breakfastCats = newMenuData["Breakfast"]?.categories || {};
            const lunchCats = newMenuData["Lunch"]?.categories || {};
            const dinnerCats = newMenuData["Dinner"]?.categories || {};

            // Combine all
            const allCombined = {
                ...breakfastCats,
                ...lunchCats,
                ...dinnerCats,
            };

            // Apply to all meals
            if (newMenuData["Breakfast"]) newMenuData["Breakfast"].categories = allCombined;
            if (newMenuData["Lunch"]) newMenuData["Lunch"].categories = allCombined;
            if (newMenuData["Dinner"]) newMenuData["Dinner"].categories = allCombined;


            setMenuData(newMenuData);
        };
        fetchMenu();
    }, []);

    useEffect(() => {
        if (meals && meals["No. of days"]) setNumDays(parseInt(meals["No. of days"]) || 1);
    }, [meals]);

    const toggleMeal = (dayKey, meal) => {
        setMeals(prev => {
            const updated = { ...prev };
            const dayMeals = { ...(updated[dayKey] || {}) };
            if (dayMeals[meal]) delete dayMeals[meal];
            else {
                const defaultOption = Object.keys(menuData[meal]?.categories || {})[0] || "";
                const items = Object.values(menuData[meal]?.categories?.[defaultOption] || {})
                    .flatMap(subCat => (subCat.menuItems || []).filter(i => i.visibility).map(i => i.name)) || [];
                dayMeals[meal] = {
                    pax: "",
                    extraPlates: "",
                    rate: "",
                    startTime: "",
                    endTime: "",
                    total: 0,
                    option: defaultOption,
                    items,
                    selectedItems: meals?.[dayKey]?.[meal]?.selectedItems || items,
                    newItem: ""
                };
            }
            updated[dayKey] = dayMeals;
            return updated;
        });
    };

    const handleChange = (dayKey, meal, field, value) => {
        setMeals(prev => {
            const updated = { ...prev };
            const dayMeals = updated[dayKey] || {};
            const item = dayMeals[meal] || {};
            const newItem = { ...item, [field]: value };
            if (field === "rate" || field === "pax" || field === "extraPlates") {
                const rate = parseFloat(newItem.rate) || 0;
                const pax = parseInt(newItem.pax) || 0;
                const extra = parseInt(newItem.extraPlates) || 0;
                newItem.total = rate * (pax + extra);
            }
            dayMeals[meal] = newItem;
            updated[dayKey] = dayMeals;
            return updated;
        });
    };

    useImperativeHandle(ref, () => ({
        validateMeals: () => {
            let isValid = true;
            for (const dayKey in meals) {
                const dayMeals = meals[dayKey];
                if (!dayMeals) continue;
                for (const meal in dayMeals) {
                    const { rate, pax, startTime, endTime } = dayMeals[meal];
                    if (
                        rate === "" ||
                        pax === "" ||
                        !startTime ||
                        !endTime
                    ) {
                        isValid = false;
                    }

                }
            }
            return isValid;
        }
    }));

    const getMealOptionsForMeal = (meal, dayDate, functionDate, dayNight) => {
        if (!menuData[meal]) return [];
        if (meal === "Dinner" && dayDate === functionDate && dayNight === "Night") return [];
        if (meal === "Lunch" && dayDate === functionDate && dayNight === "Day") return [];
        return Object.keys(menuData[meal]?.categories || {});
    };

    if (functionType === "Luxury Rooms") {
        return null;
    }

    const formatIndianNumber = (value) => {
        if (value === "" || value === null || value === undefined) return "";

        const str = value.toString();

        // allow typing states like "12."
        if (str.endsWith(".")) return str;

        const [intPart, decPart] = str.split(".");
        const formattedInt = Number(intPart || 0).toLocaleString("en-IN");

        return decPart !== undefined
            ? `${formattedInt}.${decPart}`
            : formattedInt;
    };

    return (
        <div className="meal-selection">
            <h4>4. Meal Selection</h4>

            <div className="num-days" style={{ display: 'none', justifyContent: 'space-between' }}>
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

            {Array.from({ length: numDays }, (_, dIndex) => {
                const dayKey = `Day${dIndex + 1}`;
                const dayMeals = meals[dayKey] || {};
                return (
                    <div key={dayKey} className="day-section">
                        <h5 style={{ display: 'flex', justifyContent: 'space-between' }}>
                            {/* Day {dIndex + 1} */} Date:

                            <input
                                style={{ width: '40vw' }}
                                type="date"
                                value={dayMeals.date || ""}
                                onChange={(e) =>
                                    setMeals(prev => ({ ...prev, [dayKey]: { ...prev[dayKey], date: e.target.value } }))
                                }
                            />
                        </h5>

                        {mealOptions.map(meal => {
                            const availableOptions = getMealOptionsForMeal(meal, dayMeals.date, functionDate, dayNight);

                            if (!dayMeals.date) return null;

                            if (availableOptions.length === 0) return null;
                            const selected = !!dayMeals[meal];
                            const data = dayMeals[meal] || {};

                            return (
                                <div key={meal} className="meal-card">
                                    <div className="meal-left">
                                        <input type="checkbox" checked={selected} onChange={() => toggleMeal(dayKey, meal)} />
                                        <span className="meal-label">{meal}</span>
                                    </div>

                                    {selected && (
                                        <div className="meal-inputs-wrapper">
                                            <div className="meal-option-dropdown">
                                                <div className="num-days" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center' }}>Options: </label>
                                                    <select
                                                        style={{ width: '40vw' }}
                                                        value={data.option || availableOptions[0]}
                                                        onChange={e => {
                                                            const newOption = e.target.value;
                                                            handleChange(dayKey, meal, "option", newOption);
                                                            setMeals(prev => {
                                                                const updated = { ...prev };
                                                                const items = Object.values(menuData[meal]?.categories?.[newOption] || {}).flat();
                                                                updated[dayKey][meal] = { ...updated[dayKey][meal], items, selectedItems: items, newItem: "" };
                                                                return updated;
                                                            });
                                                        }}
                                                    >
                                                        {availableOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                </div>

                                                <div className="num-days" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center' }}>Menu Items: </label>

                                                    <button
                                                        style={{
                                                            width: '40vw',
                                                            marginTop: 10,
                                                            padding: "6px 12px",
                                                            backgroundColor: "#eea220ff",
                                                            color: "white",
                                                            border: "none",
                                                            borderRadius: 4,
                                                            cursor: "pointer",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            gap: "6px"
                                                        }}
                                                        type="button"
                                                        onClick={() => {
                                                            setCurrentDayKey(dayKey);
                                                            setCurrentMeal(meal);
                                                            setShowMealModal(true);
                                                        }}
                                                    >
                                                        <span style={{ fontWeight: '700' }} > 🍽 Menu{" "} </span>
                                                        {(() => {
                                                            const selectedCount = meals?.[dayKey]?.[meal]?.selectedItems?.length || 0;
                                                            const totalCount = Object.values(menuData[meal]?.categories?.[data.option] || {}).flat().length || 0;

                                                            // 🧩 CASE 1: When nothing selected yet — show total items
                                                            if (selectedCount === 0 && totalCount > 0) {
                                                                return (
                                                                    <span
                                                                        style={{
                                                                            background: "#fff",
                                                                            color: "#eea220ff",
                                                                            borderRadius: "12px",
                                                                            padding: "2px 8px",
                                                                            fontSize: "12px",
                                                                            fontWeight: "600"
                                                                        }}
                                                                    >
                                                                        {totalCount} items
                                                                    </span>
                                                                );
                                                            }

                                                            // 🧩 CASE 2: When user selected items — show count
                                                            if (selectedCount > 0) {
                                                                return (
                                                                    <span
                                                                        style={{
                                                                            background: "#fff",
                                                                            color: "#eea220ff",
                                                                            borderRadius: "12px",
                                                                            padding: "2px 8px",
                                                                            fontSize: "12px",
                                                                            fontWeight: "600"
                                                                        }}
                                                                    >
                                                                        {selectedCount} items
                                                                    </span>
                                                                );
                                                            }

                                                            return null;
                                                        })()}
                                                    </button>

                                                </div>

                                                <div className="meal-inputs">
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                                        <label style={{ display: "flex", alignItems: 'center' }}>Rate:</label>
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            style={{ width: '40vw' }}
                                                            value={formatIndianNumber(data.rate)}
                                                            onChange={(e) => {
                                                                const raw = sanitizeDecimal(e.target.value);
                                                                if (raw === null) return;

                                                                handleChange(dayKey, meal, "rate", raw);
                                                            }}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                                        <label style={{ display: "flex", alignItems: 'center' }}>Pax:</label>
                                                        <input style={{ width: '40vw' }} type="text" placeholder="" value={formatIndianNumber(data.pax || "")}
                                                            onChange={(e) => {
                                                                const val = e.target.value.replace(/[^0-9]/g, "");
                                                                handleChange(dayKey, meal, "pax", val);
                                                            }}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                                        <label style={{ display: "flex", alignItems: 'center' }}>Extra Plates:</label>
                                                        <input
                                                            style={{ width: '40vw' }}
                                                            type="text"
                                                            placeholder=""
                                                            value={formatIndianNumber(data.extraPlates || "")}
                                                            onChange={(e) => {
                                                                const val = e.target.value.replace(/[^0-9]/g, "");
                                                                handleChange(dayKey, meal, "extraPlates", val);
                                                            }}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                                        <label style={{ display: "flex", alignItems: 'center' }}></label>
                                                        <span>
                                                            Total: ₹{formatIndianNumber((data.total || 0).toFixed(2))}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="meal-inputs" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center' }}>Start Time:</label>
                                                    <input style={{ width: '40vw' }} type="time" value={data.startTime || ""} onChange={e => handleChange(dayKey, meal, "startTime", e.target.value)} />
                                                </div>

                                                <div className="meal-inputs" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center' }}>End Time:</label>
                                                    <input style={{ width: '40vw' }} type="time" value={data.endTime || ""} onChange={e => handleChange(dayKey, meal, "endTime", e.target.value)} />
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

            {showMealModal && currentDayKey && currentMeal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxHeight: "80vh", overflowY: "auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h3>Select {currentMeal} Items</h3>

                            {/* 🌍 Global Select All / Deselect All */}
                            <button
                                type="button"
                                style={{
                                    backgroundColor: "#ff7a1bff",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 6,
                                    padding: "6px 12px",
                                    cursor: "pointer",
                                    fontSize: "13px"
                                }}
                                onClick={() => {
                                    const allItems = Object.values(
                                        menuData[currentMeal]?.categories?.[meals[currentDayKey][currentMeal]?.option] || {}
                                    ).flat();

                                    const allAlreadySelected = allItems.every(item =>
                                        meals[currentDayKey][currentMeal]?.selectedItems?.includes(item)
                                    );

                                    setMeals(prev => {
                                        const updated = { ...prev };
                                        const mealObj = updated[currentDayKey][currentMeal];
                                        updated[currentDayKey][currentMeal] = {
                                            ...mealObj,
                                            selectedItems: allAlreadySelected ? [] : allItems
                                        };
                                        return updated;
                                    });
                                }}
                            >
                                {
                                    Object.values(
                                        menuData[currentMeal]?.categories?.[meals[currentDayKey][currentMeal]?.option] || {}
                                    )
                                        .flat()
                                        .every(item =>
                                            meals[currentDayKey][currentMeal]?.selectedItems?.includes(item)
                                        )
                                        ? "Deselect All (All Categories)"
                                        : "Select All (All Categories)"
                                }
                            </button>
                        </div>

                        {Object.entries(
                            menuData[currentMeal]?.categories?.[meals[currentDayKey][currentMeal]?.option] || {}
                        ).map(([subCatName, items]) => {
                            const newItemKey = `${currentMeal}_${subCatName}`;
                            const allSelected = items.every(item =>
                                meals[currentDayKey][currentMeal]?.selectedItems?.includes(item)
                            );

                            return (
                                <div key={subCatName} style={{ marginBottom: 12 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <h4 style={{ fontWeight: 600 }}>{subCatName.toUpperCase()}</h4>

                                        {/* ✅ Category Select All / Deselect All */}
                                        <button
                                            type="button"
                                            style={{
                                                backgroundColor: allSelected ? "#ff5c5c" : "#4caf50",
                                                color: "white",
                                                border: "none",
                                                borderRadius: 4,
                                                padding: "4px 10px",
                                                cursor: "pointer",
                                                fontSize: "12px"
                                            }}
                                            onClick={() => {
                                                setMeals(prev => {
                                                    const updated = { ...prev };
                                                    const mealObj = updated[currentDayKey][currentMeal];
                                                    let selectedItems = [...(mealObj.selectedItems || [])];

                                                    if (allSelected) {
                                                        selectedItems = selectedItems.filter(i => !items.includes(i));
                                                    } else {
                                                        selectedItems = Array.from(new Set([...selectedItems, ...items]));
                                                    }

                                                    updated[currentDayKey][currentMeal] = { ...mealObj, selectedItems };
                                                    return updated;
                                                });
                                            }}
                                        >
                                            {allSelected ? "Deselect All" : "Select All"}
                                        </button>
                                    </div>

                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                                        {[
                                            ...new Set([
                                                ...items,
                                                ...(meals[currentDayKey][currentMeal]?.selectedItems || [])
                                            ])
                                        ].map((item, index) => {
                                            const isChecked = meals[currentDayKey][currentMeal]?.selectedItems?.includes(item);
                                            return (
                                                <label key={item} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span style={{ minWidth: "30px", fontWeight: "600" }}>
                                                        {index + 1}.
                                                    </span>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => {
                                                            setMeals(prev => {
                                                                const updated = { ...prev };
                                                                const mealObj = updated[currentDayKey][currentMeal];
                                                                const selectedItems = isChecked
                                                                    ? mealObj.selectedItems.filter(i => i !== item)
                                                                    : Array.from(new Set([...mealObj.selectedItems, item]));
                                                                updated[currentDayKey][currentMeal] = { ...mealObj, selectedItems };
                                                                return updated;
                                                            });
                                                        }}
                                                    />
                                                    <span>{item}</span>
                                                </label>
                                            );
                                        })}


                                        {/* ➕ Add New Item */}
                                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                            <input
                                                type="text"
                                                placeholder=""
                                                value={newItemInputs[newItemKey] || ""}
                                                onChange={e => setNewItemInputs(prev => ({ ...prev, [newItemKey]: e.target.value }))}
                                                style={{ flex: 1, padding: "4px 8px" }}
                                            />
                                            <button
                                                type="button"
                                                style={{
                                                    padding: "6px 12px",
                                                    backgroundColor: "#4dd219ff",
                                                    color: "white",
                                                    border: "none",
                                                    borderRadius: 4,
                                                    cursor: "pointer"
                                                }}
                                                onClick={() => {
                                                    const itemValue = newItemInputs[newItemKey]?.trim();
                                                    if (!itemValue) return;

                                                    setMenuData(prev => {
                                                        const updated = { ...prev };
                                                        const cat = meals[currentDayKey][currentMeal].option;
                                                        if (!updated[currentMeal].categories[cat][subCatName]) {
                                                            updated[currentMeal].categories[cat][subCatName] = [];
                                                        }
                                                        if (!updated[currentMeal].categories[cat][subCatName].includes(itemValue)) {
                                                            updated[currentMeal].categories[cat][subCatName].push(itemValue);
                                                        }
                                                        return updated;
                                                    });

                                                    setMeals(prev => {
                                                        const updated = { ...prev };
                                                        const mealObj = updated[currentDayKey][currentMeal];
                                                        mealObj.selectedItems = Array.from(new Set([...mealObj.selectedItems, itemValue]));

                                                        updated[currentDayKey][currentMeal] = mealObj;
                                                        return updated;
                                                    });

                                                    setNewItemInputs(prev => ({ ...prev, [newItemKey]: "" }));
                                                }}
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* ✅ Save button */}
                        <button
                            onClick={() => setShowMealModal(false)}
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
                                transition: "all 0.1s"
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
