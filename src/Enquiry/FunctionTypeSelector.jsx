import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import "../styles/BookingAmenities.css";

const FunctionTypeSelector = ({ selectedType = "", onSelect = () => {} }) => {
  const [types, setTypes] = useState([]);
  const [customType, setCustomType] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);

  // ✅ Real-time fetch from Firestore (usersAccess where accessToApp == "A")
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

  // ✅ Keep selected type synced
  useEffect(() => {
    if (selectedType && !types.includes(selectedType)) {
      setTypes((prev) => [...prev, selectedType]);
      setCustomType(selectedType);
    }
  }, [selectedType, types]);

  // ✅ Filter suggestions for custom input
  useEffect(() => {
    if (customType.trim() === "") {
      setFilteredSuggestions([]);
    } else {
      const filtered = types.filter(
        (t) => t.toLowerCase().includes(customType.toLowerCase()) && t !== customType
      );
      setFilteredSuggestions(filtered);
    }
  }, [customType, types]);

  // ✅ Selection handler
  const handleSelect = (type) => {
    if (typeof onSelect === "function") onSelect(type);
    setDrawerOpen(false);
    setCustomType(type);
  };

  // ✅ Add custom function
  const handleAddCustomType = () => {
    const trimmed = customType.trim();
    if (!trimmed) return;
    if (!types.includes(trimmed)) setTypes((prev) => [...prev, trimmed]);
    if (typeof onSelect === "function") onSelect(trimmed);
    setCustomType(trimmed);
    setDrawerOpen(false);
  };

  return (
    <div className="function-type-container">
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="drawer-trigger"
      >
        {selectedType ? `🎉 ${selectedType}` : "Select Function Type"}
      </button>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>Select Function Type</h3>
              <button style={{backgroundColor:'red'}} onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            {/* ✅ All fetched function types */}
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

            {/* ✅ Custom function type */}
            <div className="drawer-custom">
              <input
                type="text"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="Add Custom Function"
              />
              <button onClick={handleAddCustomType}>Add</button>

              {filteredSuggestions.length > 0 && (
                <ul className="suggestion-box">
                  {filteredSuggestions.map((sug, index) => (
                    <li key={index} onClick={() => handleSelect(sug)}>
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
