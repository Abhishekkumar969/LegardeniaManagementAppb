import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import { getDoc, collection, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import styles from "../styles/decorationProfile.module.css";
import { useNavigate } from "react-router-dom";
import BottomNavigationBar from "../components/BottomNavigationBar";

const DecorationProfile = () => {
  const navigate = useNavigate();
  const [decoration, setDecoration] = useState(null);
  const [selectedFunction, setSelectedFunction] = useState("Default");
  const [itemName, setItemName] = useState("");
  const [items, setItems] = useState({});
  const [editField, setEditField] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [functionTypes, setFunctionTypes] = useState(["Default"]);
  const [newFunctionType, setNewFunctionType] = useState("");
  const [loading, setLoading] = useState(true);
  const [userAppType, setUserAppType] = useState(null);

  useEffect(() => {
    const fetchUserAppType = async () => {
      const auth = getAuth();
      const user = auth.currentUser;
      if (user) {
        try {
          const userRef = doc(db, 'usersAccess', user.email);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            setUserAppType(data.accessToApp);
          }
        } catch (err) {
          console.error("Error fetching user app type:", err);
        }
      }
    };
    fetchUserAppType();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 10000); // max 10 sec
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && user.email) {
        try {
          const q = query(
            collection(db, "usersAccess"),
            where("email", "==", user.email),
            where("accessToApp", "in", ["E"])
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const docSnap = snapshot.docs[0];
            const data = docSnap.data();
            setDecoration({ id: docSnap.id, ...data });
            setItems(data.items || {});
            setFunctionTypes(data.functionTypes ? ["Default", ...data.functionTypes] : ["Default"]);
          }
          else console.warn("❌ No decoration record found for this user.");
        } catch (error) {
          console.error("🔥 Error fetching decoration:", error);
        }
      }
    });
    return () => {
      unsubscribe();      // cleanup Firebase listener
      clearTimeout(timer); // cleanup timer
    };
  }, []);

  const handleAddItem = async () => {
    if (!itemName.trim() || !decoration) return;

    try {
      const decorationRef = doc(db, "usersAccess", decoration.id);
      const newItems = { ...items };

      if (selectedFunction === "Default") {
        functionTypes.slice(1).forEach((fn) => {
          if (!Array.isArray(newItems[fn])) newItems[fn] = [];
          if (!newItems[fn].includes(itemName)) newItems[fn].push(itemName);
        });
      } else {
        if (!Array.isArray(newItems[selectedFunction])) newItems[selectedFunction] = [];
        if (!newItems[selectedFunction].includes(itemName)) newItems[selectedFunction].push(itemName);
      }

      await updateDoc(decorationRef, { items: newItems });
      setItems(newItems);
      setItemName("");
    } catch (error) {
      console.error("Error adding item:", error);
    }
  };

  const handleUpdateField = async (field) => {
    if (!editValue.trim() || !decoration) return;
    try {
      const decorationRef = doc(db, "usersAccess", decoration.id);
      await updateDoc(decorationRef, { [field]: editValue });
      setDecoration({ ...decoration, [field]: editValue });
      setEditField(null);
      setEditValue("");
    } catch (error) {
      console.error("Error updating field:", error);
    }
  };

  const handleDeleteField = async (field) => {
    if (!decoration) return;
    try {
      const decorationRef = doc(db, "usersAccess", decoration.id);
      await updateDoc(decorationRef, { [field]: "" });
      setDecoration({ ...decoration, [field]: "" });
    } catch (error) {
      console.error("Error deleting field:", error);
    }
  };

  const AccordionItem = ({ title, items, onUpdateItem, onDeleteItem }) => {
    const [open, setOpen] = React.useState(false);
    const [editIndex, setEditIndex] = React.useState(null);
    const [editValue, setEditValue] = React.useState("");

    const handleSave = (idx) => {
      onUpdateItem(title, idx, editValue);
      setEditIndex(null);
      setEditValue("");
    };

    if (title === "Default") return null;

    return (
      <div className={styles.accordionItem}>
        <div className={styles.accordionHeader} onClick={() => setOpen((prev) => !prev)}>
          <strong>{title}</strong>
          <span className={styles.toggleIcon}>{open ? "▲" : "▼"}</span>
        </div>

        {open && (
          <div className={styles.accordionContentWrapper}>
            <ul className={styles.accordionContent}>
              {items.length > 0 ? (
                items.map((itm, idx) => (
                  <li key={idx} className={styles.itemRow}>
                    {editIndex === idx ? (
                      <>
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className={styles.editInput}
                        />
                        <button type="button" onClick={() => handleSave(idx)} className={styles.saveButton}>Save</button>
                        <button type="button" onClick={() => setEditIndex(null)} className={styles.cancelButton}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <span>{itm}</span>
                        <div className={styles.itemButtons}>
                          <button type="button"
                            onClick={() => { setEditIndex(idx); setEditValue(itm); }}
                            className={styles.editButton}
                          >Edit</button>
                          <button type="button" onClick={() => onDeleteItem(title, idx)} className={styles.deleteButton}>Delete</button>
                        </div>
                      </>
                    )}
                  </li>
                ))
              ) : (
                <li className={styles.message}>No items yet</li>
              )}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const handleUpdateItem = async (fn, idx, newValue) => {
    const updatedItems = { ...items };
    updatedItems[fn][idx] = newValue;

    const decorationRef = doc(db, "usersAccess", decoration.id);
    await updateDoc(decorationRef, { items: updatedItems });
    setItems(updatedItems);
  };

  const handleDeleteItem = async (fn, idx) => {
    const updatedItems = { ...items };
    updatedItems[fn].splice(idx, 1);

    const decorationRef = doc(db, "usersAccess", decoration.id);
    await updateDoc(decorationRef, { items: updatedItems });
    setItems(updatedItems);
  };

  const handleAddFunctionType = async () => {
    if (!newFunctionType.trim() || !decoration) return;

    const newType = newFunctionType.trim();

    if (functionTypes.includes(newType)) return; // prevent duplicates

    const updatedFunctionTypes = [...functionTypes, newType];
    const updatedItems = { ...items, [newType]: [] };

    try {
      const decorationRef = doc(db, "usersAccess", decoration.id);
      await updateDoc(decorationRef, { functionTypes: updatedFunctionTypes.filter(ft => ft !== "Default"), items: updatedItems });
      setFunctionTypes(updatedFunctionTypes);
      setItems(updatedItems);
      setNewFunctionType("");
    } catch (error) {
      console.error("Error adding function type:", error);
    }
  };

  return (
    <div className="page-scroller">
      <div className={styles.container}>

        {decoration ? (
          <>

            <h2 className={styles.heading}>
              Hi {decoration?.name ? decoration.name : decoration?.firmName ? decoration.firmName : "Decoration"} 👋
            </h2>

            {/* Decoration Email Below the Heading */}
            <div className={styles.emailContainer}>
              {decoration?.email && (
                <p className={styles.emailLine}>
                  📧 <strong>Email:</strong> {decoration.email}
                </p>
              )}
            </div>

            <div className={styles.emailContainer}>
              <button type="button"
                style={{ width: '100%', color: '#1a1a1aff' }}
                className={styles.showDetails}
                onClick={() => setShowDetails((prev) => !prev)}
              >
                {showDetails ? "▲" : "Edit Firm Data"}
              </button>
            </div>

            {/* Top Fields */}
            {showDetails && (
              <div className={styles.decorationInfo}>
                {["firmName", "address", "contactNo", "termsAndConditions"].map((field) => (
                  <div key={field} className={styles.fieldRow}>
                    {editField === field ? (
                      <>
                        <div>
                          <div>
                            <strong style={{ whiteSpace: "nowrap" }}>
                              {field === "contactNo"
                                ? "Phone Number"
                                : field === "firmName"
                                  ? "Firm Name"
                                  : field === "email"
                                    ? "Email"
                                    : field === "termsAndConditions"
                                      ? "Terms & Conditions"
                                      : field.charAt(0).toUpperCase() + field.slice(1)}
                              :
                            </strong>
                          </div>

                          <div>
                            <span>
                              <strong style={{ color: "orangered", marginLeft: "10px" }}>
                                {decoration[field] || "Not Filled"}
                              </strong>
                            </span>
                          </div>
                        </div>

                        <div className={styles.itemButtons}>
                          {field === "termsAndConditions" ? (
                            <textarea
                              rows={10}
                              style={{ width: '100%', marginTop: '10px', padding: '10px', borderRadius: '10px', border: '1px solid gray' }}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className={styles.editTextarea}
                              placeholder="Enter terms and conditions (one per line)..."
                            />
                          ) : (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className={styles.editInput}
                            />
                          )}
                          <button type="button"
                            onClick={() => handleUpdateField(field)}
                            className={styles.saveButton}
                          >
                            Save
                          </button>
                          <button type="button"
                            onClick={() => setEditField(null)}
                            className={styles.cancelButton}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <div>
                            <strong style={{ whiteSpace: "nowrap" }}>
                              {field === "contactNo"
                                ? "Phone Number"
                                : field === "firmName"
                                  ? "Firm Name"
                                  : field === "email"
                                    ? "Email"
                                    : field === "termsAndConditions"
                                      ? "Terms & Conditions"
                                      : field.charAt(0).toUpperCase() + field.slice(1)}
                              :
                            </strong>
                          </div>

                          <div style={{ marginLeft: "10px" }}>
                            {field === "termsAndConditions" ? (
                              <div
                                style={{
                                  color: "green",
                                  textTransform: "none",
                                  whiteSpace: "pre-line",
                                  fontWeight: 'bold'
                                }}
                              >
                                {decoration[field] || "Not Filled"}
                              </div>
                            ) : (
                              <strong style={{ color: "green", textTransform: "capitalize" }}>
                                {decoration[field] || "Not Filled"}
                              </strong>
                            )}
                          </div>
                        </div>

                        <div className={styles.itemButtons}>
                          <button type="button"
                            onClick={() => {
                              setEditField(field);
                              setEditValue(decoration[field] || "");
                            }}
                            className={styles.editButton}
                          >
                            Edit
                          </button>
                          <button type="button"
                            onClick={() => handleDeleteField(field)}
                            className={styles.deleteButton}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* Dynamic Function Types - All in one line */}
                <div className={styles.fieldRow}>
                  <strong style={{ whiteSpace: "nowrap", marginRight: "10px" }}>Function Types:</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                    {functionTypes
                      .filter(ft => ft !== "Default")
                      .map(ft => (
                        <div key={ft} style={{ display: "flex", alignItems: "center", gap: "5px", backgroundColor: "#f0f0f0", padding: "5px 10px", borderRadius: "8px" }}>
                          {editField === ft ? (
                            <>
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className={styles.editInput}
                                style={{ width: "100px" }}
                              />
                              <button type="button"
                                onClick={async () => {
                                  if (!editValue.trim() || !decoration) return;
                                  const updatedFunctions = functionTypes.map(f => f === ft ? editValue.trim() : f);
                                  const updatedItems = { ...items };
                                  if (updatedItems[ft]) {
                                    updatedItems[editValue.trim()] = updatedItems[ft];
                                    delete updatedItems[ft];
                                  }
                                  const decorationRef = doc(db, "usersAccess", decoration.id);
                                  await updateDoc(decorationRef, { functionTypes: updatedFunctions.filter(f => f !== "Default"), items: updatedItems });
                                  setFunctionTypes(updatedFunctions);
                                  setItems(updatedItems);
                                  setEditField(null);
                                  setEditValue("");
                                }}
                                className={styles.saveButton}
                              >Save</button>
                              <button type="button"
                                onClick={() => setEditField(null)}
                                className={styles.cancelButton}
                              >Cancel</button>
                            </>
                          ) : (
                            <>
                              <span>{ft}</span>
                              <button type="button"
                                onClick={() => {
                                  setEditField(ft);
                                  setEditValue(ft);
                                }}
                                className={styles.editButton}
                                style={{ padding: "2px 5px", fontSize: "0.8rem" }}
                              >✏️</button>
                              <button type="button"
                                onClick={async () => {
                                  if (!decoration) return;
                                  const updatedFunctions = functionTypes.filter(f => f !== ft);
                                  const updatedItems = { ...items };
                                  delete updatedItems[ft];
                                  const decorationRef = doc(db, "usersAccess", decoration.id);
                                  await updateDoc(decorationRef, { functionTypes: updatedFunctions.filter(f => f !== "Default"), items: updatedItems });
                                  setFunctionTypes(updatedFunctions);
                                  setItems(updatedItems);
                                }}
                                className={styles.deleteButton}
                                style={{ padding: "2px 5px", fontSize: "0.8rem" }}
                              >🗑️</button>
                            </>
                          )}
                        </div>
                      ))}
                  </div>
                </div>

              </div>
            )}

            <div className={styles.InsertFields}>
              <div>
                <label htmlFor="functionType" className={styles.subHeading}>
                  Add Function Type:
                </label>
                <input
                  type="text"
                  placeholder="Add new function type"
                  value={newFunctionType}
                  onChange={(e) => setNewFunctionType(e.target.value)}
                  className={styles.inputBox}
                />
                <button type="button"
                  style={{ marginTop: "15px" }}
                  onClick={handleAddFunctionType}
                  className={styles.button}
                >
                  Add
                </button>
              </div>
            </div>

            <div className={styles.InsertFields}>
              <div>
                <label htmlFor="functionType" className={styles.subHeading}>
                  Add Item:
                </label>
                <select
                  id="functionType"
                  value={selectedFunction}
                  onChange={(e) => setSelectedFunction(e.target.value)}
                  className={styles.selectBox}
                >
                  {functionTypes.map((ft) => (
                    <option key={ft} value={ft}>{ft}</option>
                  ))}
                </select>

                <span style={{ color: 'red', fontSize: '15px' }}>
                  Default will add items in all the functions
                </span>
              </div>

              {/* Add Item */}
              <div style={{ marginTop: "15px" }}>
                <input
                  type="text"
                  placeholder="Enter item name"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className={styles.inputBox}
                />
                <button type="button" style={{ marginTop: "15px" }} onClick={handleAddItem} className={styles.button}>
                  Add
                </button>
              </div>
            </div>

            {/* Accordion Items */}
            <div className={styles.itemsSection}>
              <h3>Items by Function</h3>
              {functionTypes
                .filter(fn => selectedFunction === "Default" || fn === selectedFunction)
                .map(fn => (
                  <AccordionItem
                    key={fn}
                    title={fn}
                    items={items[fn] || []}
                    onUpdateItem={handleUpdateItem}
                    onDeleteItem={handleDeleteItem}
                    onAddItem={(newItem) => {
                      const updatedItems = { ...items };
                      if (!Array.isArray(updatedItems[fn])) updatedItems[fn] = [];
                      updatedItems[fn].push(newItem);
                      const decorationRef = doc(db, "usersAccess", decoration.id);
                      updateDoc(decorationRef, { items: updatedItems });
                      setItems(updatedItems);
                    }}
                  />
                ))
              }
            </div>
          </>
        ) : (
          <div className={styles.container}>
            {loading ? (
              <div className={styles.spinnerContainer}>
                <div className={styles.spinner}></div>
              </div>
            ) : !decoration ? (
              <p className={styles.message}>Pls Login With Decoration profile...</p>
            ) : (
              <div>
                {/* Your Decoration content goes here */}
                <h2>Welcome, {decoration.name}</h2>
              </div>
            )}
          </div>)}

      </div>

      <div style={{ marginBottom: "50px" }}></div>
      <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
    </div>
  );
};

export default DecorationProfile;