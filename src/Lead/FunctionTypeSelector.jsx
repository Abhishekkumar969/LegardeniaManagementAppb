import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import "../styles/BookingAmenities.css";

const FunctionTypeSelector = ({ selectedType, setForm }) => {
  const [customType, setCustomType] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [types, setTypes] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ✅ Fetch all unique functionTypes from usersAccess where accessToApp === "A"
  useEffect(() => {
    const q = query(collection(db, "usersAccess"), where("accessToApp", "==", "A"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allTypes = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (Array.isArray(data.functionTypes)) {
            allTypes.push(...data.functionTypes);
          }
        });
        const uniqueTypes = [...new Set(allTypes)].sort();
        setTypes(uniqueTypes);
      },
      (error) => {
        console.error("Error fetching function types:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSelect = (type) => {
    setForm((prev) => ({ ...prev, functionType: type }));
    setDrawerOpen(false);
  };

  const handleAddCustomType = () => {
    const trimmed = customType.trim();
    if (!trimmed) return;
    if (!types.includes(trimmed)) setTypes([...types, trimmed]);
    setForm((prev) => ({ ...prev, functionType: trimmed }));
    setCustomType("");
    setDrawerOpen(false);
  };

  const filteredSuggestions = suggestions.filter(
    (sug) =>
      sug.toLowerCase().includes(customType.toLowerCase()) &&
      sug.toLowerCase() !== customType.toLowerCase()
  );

  return (
    <div className="function-type-container">
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="drawer-trigger"
      >
        {selectedType ? `🎉 ${selectedType}` : "."}
      </button>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Select Function Type</h3>
              <button style={{ backgroundColor: 'red' }} onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            {/* ✅ List fetched function types */}
            <ul className="drawer-list">
              {types.length === 0 ? (
                <li style={{ color: "#888" }}>Loading...</li>
              ) : (
                types.map((type, index) => (
                  <li key={index}>
                    <label>
                      <input
                        type="radio"
                        name="functionType"
                        checked={selectedType === type}
                        onChange={() => handleSelect(type)}
                      />
                      {type}
                    </label>
                  </li>
                ))
              )}
            </ul>

            {/* ✅ Add custom function */}
            <div className="drawer-custom">
              <input
                type="text"
                value={customType}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomType(val);
                  setSuggestions(
                    types.filter((t) =>
                      t.toLowerCase().includes(val.toLowerCase())
                    )
                  );
                }}
                placeholder="Add Custom Function"
              />
              <button onClick={handleAddCustomType}>Add</button>

              {customType && filteredSuggestions.length > 0 && (
                <ul className="suggestion-box">
                  {filteredSuggestions.map((sug, index) => (
                    <li key={index} onClick={() => setCustomType(sug)}>
                      {sug}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ marginBottom: "70px" }}></div>

          </div>
        </div>
      )}
    </div>
  );
};

export default FunctionTypeSelector;
