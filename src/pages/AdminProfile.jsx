import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import { getDoc, collection, onSnapshot, query, where, doc, updateDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import styles from "../styles/vendorProfile.module.css";
import BackButton from "../components/BackButton";
import makeAnimated from "react-select/animated";
import CreatableSelect from "react-select/creatable";
import { useNavigate } from 'react-router-dom';
import BottomNavigationBar from "../components/BottomNavigationBar";

const AdminProfile = () => {
  const navigate = useNavigate();
  const [adminProfile, setAdminProfile] = useState(null);
  const [venueTypes, setVenueTypes] = useState([]);
  const [functionTypes, setFunctionTypes] = useState([]);
  const [venueMenuOpen, setVenueMenuOpen] = useState(false);
  const [functionMenuOpen, setFunctionMenuOpen] = useState(false);
  const [hasVenueChanges, setHasVenueChanges] = useState(false);
  const [hasFunctionChanges, setHasFunctionChanges] = useState(false);
  const defaultVenueOptions = ["Hall with Front Lawn", "Hall with Front & Back Lawn", "Pool Side"];
  const defaultFunctionOptions = ["Wedding", "Reception", "Engagement", "Haldi & Mehndi", "Birthday", "Corporate Party", "Anniversary", "Dandiya"];
  const [editField, setEditField] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(true);
  const animatedComponents = makeAnimated();
  const [userAppType, setUserAppType] = useState(null);
  const [amenities, setAmenities] = useState([]);
  const [amenitiesMenuOpen, setAmenitiesMenuOpen] = useState(false);
  const [hasAmenitiesChanges, setHasAmenitiesChanges] = useState(false);
  const [venueTypeColors, setVenueTypeColors] = useState({});
  const [hasVenueColorChanges, setHasVenueColorChanges] = useState(false);
  const defaultAmenityOptions = [
    "Welcome flex",
    "DJ with Floor",
    "Flower Decoration (Artificial)",
    "Temporary Electricity Challan",
    "Generator Power Backup",
    "Security Guards"
  ];
  const [toAddAmenitiesValues, setToAddAmenitiesValues] = useState([]);
  const [toAddAmenitiesMenuOpen, setToAddAmenitiesMenuOpen] = useState(false);
  const [hasToAddAmenitiesChanges, setHasToAddAmenitiesChanges] = useState(false);
  const toAddAmenities = [
    "6 Nos. Luxury Rooms",
    "9 Nos. Luxury Rooms"
  ];
  const [addons, setAddons] = useState([]);
  const [addonsMenuOpen, setAddonsMenuOpen] = useState(false);
  const [hasAddonsChanges, setHasAddonsChanges] = useState(false);
  const defaultAddonsOptions = [
    "Natural Flower Decorations",
    "Sahnai",
    "PAAN Stall",
    "Jaimala Package (2pcs jaimala Roses, 30 Baratimala, 2pcs Samdhimala, 1 chadar, 1pcs)",
    "Additional Rooms"
  ];
  const [menuItems, setMenuItems] = useState([]);
  const [menuItemsMenuOpen, setMenuItemsMenuOpen] = useState(false);
  const [hasMenuItemsChanges, setHasMenuItemsChanges] = useState(false);
  const defaultMenuItemOptions = [
    "Cowmin + Manchuriyan + Golgappa + Chat",
    "Salad Bar",
    "Soft Drinks / Mocktails"
  ];

  const [eventExpenses, setEventExpenses] = useState([]);
  const [eventExpensesMenuOpen, setEventExpensesMenuOpen] = useState(false);
  const [hasEventExpensesChanges, setHasEventExpensesChanges] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
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
          console.error("Error fetching user data:", err);
        }
      }
    };
    fetchUserData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 10000);
    const auth = getAuth();
    let hasFetched = false;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user && user.email && !hasFetched) {
        hasFetched = true;
        try {
          const q = query(
            collection(db, "usersAccess"),
            where("email", "==", user.email),
            where("accessToApp", "in", ["A", "D"])
          );
          const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
              const docSnap = snapshot.docs[0];
              const data = docSnap.data();
              setAdminProfile({ id: docSnap.id, ...data });
              setFunctionTypes(data.functionTypes || []);
              setAmenities(data.amenities || []);
              setAddons(data.addons || []);
              setMenuItems(data.menuItems || []);
              setToAddAmenitiesValues(data.toAddAmenities || []);
              setVenueTypes(data.venueTypes || []);
              setVenueTypeColors(data.venueTypeColors || {});
              setEventExpenses(data.eventExpenses || []);
            } else {
              console.warn("❌ No Admin Profile record found for this user.");
            }
          });
          return () => unsubscribeSnapshot();
        } catch (error) {
          console.error("🔥 Error fetching Admin Profile:", error);
        }
      }
    });

    return () => {
      unsubscribeAuth();
      clearTimeout(timer);
    };
  }, []);

  const handleUpdateField = async (field) => {
    if (!editValue.trim() || !adminProfile) return;
    try {
      const adminProfileRef = doc(db, "usersAccess", adminProfile.id);
      await updateDoc(adminProfileRef, { [field]: editValue });
      setAdminProfile({ ...adminProfile, [field]: editValue });
      setEditField(null);
      setEditValue("");
    } catch (error) {
      console.error("Error updating field:", error);
    }
  };

  return (
    <div className="page-scroller">
      <div className={styles.backButtonWrapper}>
        <BackButton />
      </div>
      
      <div className={styles.container}>

        {adminProfile ? (
          <>
            <h2 className={styles.heading}>
              Hi{" "}
              {adminProfile?.name
                ? adminProfile.name
                : adminProfile?.firmName
                  ? adminProfile.firmName
                  : "Decoration"}{" "}
              👋
            </h2>

            {adminProfile?.email && (
              <p className={styles.emailLine}>
                📧 <strong>Email:</strong> {adminProfile.email}
              </p>
            )}

            {/* Form name to Terms & Conditions */}
            <div className={styles.adminProfileInfo}>
              {["firmName", "State", "City", "address", "contactNo", "termsAndConditions"].map(
                (field) => (
                  <div key={field} className={styles.fieldRow}>
                    {editField === field ? (
                      <>
                        <div>
                          <strong className={styles.fieldLabel}>
                            {field === "contactNo"
                              ? "Phone Number"
                              : field === "firmName"
                                ? "Firm Name"
                                : field === "termsAndConditions"
                                  ? "Terms & Conditions"
                                  : field.charAt(0).toUpperCase() +
                                  field.slice(1)}
                            :
                          </strong>
                        </div>

                        <div className={styles.itemButtons}>
                          <textarea
                            rows={
                              field === "termsAndConditions" ? "10" : "5"
                            }
                            className={styles.textarea}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder={
                              field === "termsAndConditions"
                                ? "Enter terms and conditions (one per line)..."
                                : ""
                            }
                          />
                        </div>

                        <div className={styles.buttonGroup}>
                          <button
                            type="button"
                            onClick={() => handleUpdateField(field)}
                            className={styles.saveButton}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditField(null)}
                            className={styles.cancelButton}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={styles.fieldHeader}>
                          <strong className={styles.fieldLabel}>
                            {field === "contactNo"
                              ? "Phone Number"
                              : field === "firmName"
                                ? "Firm Name"
                                : field === "termsAndConditions"
                                  ? "Terms & Conditions"
                                  : field.charAt(0).toUpperCase() +
                                  field.slice(1)}
                            :
                          </strong>
                          <button
                            type="button"
                            onClick={() => {
                              setEditField(field);
                              setEditValue(adminProfile[field] || "");
                            }}
                            className={styles.editButton}
                          >
                            {`Edit`}
                          </button>
                        </div>

                        <div className={styles.fieldValue}>
                          {field === "termsAndConditions" ? (
                            <div className={styles.termsText}>
                              {adminProfile[field] || "Not Filled"}
                            </div>
                          ) : (
                            <strong className={styles.valueText}>
                              {adminProfile[field] || "Not Filled"}
                            </strong>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              )}
            </div>

            {/* Venue Types to Menu Item Charges: */}
            {[
              {
                title: "Venue Types",
                open: venueMenuOpen,
                setOpen: setVenueMenuOpen,
                values: venueTypes,
                setValues: setVenueTypes,
                profileKey: "venueTypes",
                defaultOptions: defaultVenueOptions,
                hasChanges: hasVenueChanges,
                setHasChanges: setHasVenueChanges,
                color: "#4ebecdff",
              },

              {
                title: "Function Types",
                open: functionMenuOpen,
                setOpen: setFunctionMenuOpen,
                values: functionTypes,
                setValues: setFunctionTypes,
                profileKey: "functionTypes",
                defaultOptions: defaultFunctionOptions,
                hasChanges: hasFunctionChanges,
                setHasChanges: setHasFunctionChanges,
                color: "#e0f7fa",
              },

              {
                title: "Complimentary Booking Amenities",
                open: amenitiesMenuOpen,
                setOpen: setAmenitiesMenuOpen,
                values: amenities,
                setValues: setAmenities,
                profileKey: "amenities",
                defaultOptions: defaultAmenityOptions,
                hasChanges: hasAmenitiesChanges,
                setHasChanges: setHasAmenitiesChanges,
                color: "#f1f8e9",
              },

              {
                title: "To Add Complimentary Amenities",
                open: toAddAmenitiesMenuOpen,
                setOpen: setToAddAmenitiesMenuOpen,
                values: toAddAmenitiesValues,
                setValues: setToAddAmenitiesValues,
                profileKey: "toAddAmenities",
                defaultOptions: toAddAmenities,
                hasChanges: hasToAddAmenitiesChanges,
                setHasChanges: setHasToAddAmenitiesChanges,
                color: "#f9fbe7",
              },

              {
                title: "Add-Ons Charges",
                open: addonsMenuOpen,
                setOpen: setAddonsMenuOpen,
                values: addons,
                setValues: setAddons,
                profileKey: "addons",
                defaultOptions: defaultAddonsOptions,
                hasChanges: hasAddonsChanges,
                setHasChanges: setHasAddonsChanges,
                color: "#e8f5e9",
              },

              {
                title: "Menu Item Charges",
                open: menuItemsMenuOpen,
                setOpen: setMenuItemsMenuOpen,
                values: menuItems,
                setValues: setMenuItems,
                profileKey: "menuItems",
                defaultOptions: defaultMenuItemOptions,
                hasChanges: hasMenuItemsChanges,
                setHasChanges: setHasMenuItemsChanges,
                color: "#fff3e0",
              },

              {
                title: "Event Expenses",
                open: eventExpensesMenuOpen,
                setOpen: setEventExpensesMenuOpen,
                values: eventExpenses,
                setValues: setEventExpenses,
                profileKey: "eventExpenses",
                hasChanges: hasEventExpensesChanges,
                setHasChanges: setHasEventExpensesChanges,
                color: "#e3f2fd",
              },

            ].map((section, idx) => (
              <div key={idx} className={styles.fieldRow}>
                <div className={styles.sectionHeader}>
                  <label className={styles.subHeading}>{section.title}:</label>
                  <button
                    type="button"
                    className={`${styles.toggleButton} ${section.open ? styles.activeToggle : ""}`}
                    onClick={() => section.setOpen((p) => !p)}
                  >
                    {section.open ? "x" : "Edit"}
                  </button>
                </div>

                {/* Display badges */}
                <div className={styles.tagList}>
                  {adminProfile?.[section.profileKey]?.length > 0 ? (
                    adminProfile[section.profileKey].map((val, index) => (
                      <span
                        key={index}
                        className={styles.badge}
                        style={{ backgroundColor: section.color }}
                      >
                        {section.title === "Event Expenses"
                          ? `${val.item || "Unnamed"} – ₹${val.rate || 0}`
                          : val}
                      </span>
                    ))
                  ) : (
                    <span className={styles.emptyText}>No items saved yet.</span>
                  )}
                </div>

                {/* Dropdown Section */}
                {section.open && (
                  <div className={styles.dropdownSection}>
                    {section.title === "Event Expenses" ? (
                      <>
                        <div className={styles.expenseTable}>
                          {eventExpenses.length > 0 ? (
                            eventExpenses.map((exp, i) => (
                              <div key={i} className={styles.expenseRow}>
                                <input
                                  type="text"
                                  placeholder="Item Name"
                                  className={styles.expenseInput}
                                  value={exp.item || ""}
                                  onChange={(e) => {
                                    const updated = [...eventExpenses];
                                    updated[i].item = e.target.value;
                                    setEventExpenses(updated);
                                    setHasEventExpensesChanges(true);
                                  }}
                                />
                                <input
                                  type="number"
                                  placeholder="Rate"
                                  className={styles.expenseInput}
                                  value={exp.rate || ""}
                                  onChange={(e) => {
                                    const updated = [...eventExpenses];
                                    updated[i].rate = e.target.value;
                                    setEventExpenses(updated);
                                    setHasEventExpensesChanges(true);
                                  }}
                                  onWheel={(e) => e.target.blur()}
                                />
                                <button
                                  type="button"
                                  className={styles.deleteButton}
                                  onClick={() => {
                                    const updated = eventExpenses.filter((_, idx) => idx !== i);
                                    setEventExpenses(updated);
                                    setHasEventExpensesChanges(true);
                                  }}
                                >
                                  ❌
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className={styles.emptyText}>No event expenses added yet.</p>
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: "20px",
                          }}
                        >
                          <button
                            type="button"
                            className={styles.addButton}
                            onClick={() => {
                              setEventExpenses([...eventExpenses, { item: "", rate: "" }]);
                              setHasEventExpensesChanges(true);
                            }}
                          >
                            + Add Item
                          </button>

                          {hasEventExpensesChanges && (
                            <button
                              type="button"
                              className={styles.saveButtonPrimary}
                              onClick={async () => {
                                if (!adminProfile) return;
                                const ref = doc(db, "usersAccess", adminProfile.id);
                                await updateDoc(ref, { eventExpenses });
                                setHasEventExpensesChanges(false);
                                setEventExpensesMenuOpen(false);
                              }}
                            >
                              💾 Save Event Expenses
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {/* 🔹 Main Creatable Select for all sections */}
                        <CreatableSelect
                          isMulti
                          components={{ ...animatedComponents, ClearIndicator: () => null }}
                          options={[
                            ...section.defaultOptions.map((opt) => ({ value: opt, label: opt })),
                            ...(section.values
                              ?.filter((v) => !section.defaultOptions.includes(v))
                              ?.map((v) => ({ value: v, label: v })) || []),
                          ]}
                          className={styles.selectBox}
                          placeholder={`Select or add ${section.title.toLowerCase()}...`}
                          value={section.values.map((v) => ({ value: v, label: v }))}
                          onChange={(selected) => {
                            const vals = selected ? selected.map((s) => s.value) : [];

                            if (section.title === "Venue Types") {
                              const updatedColors = { ...venueTypeColors };
                              Object.keys(updatedColors).forEach((key) => {
                                if (!vals.includes(key)) delete updatedColors[key];
                              });

                              vals.forEach((v) => {
                                if (!updatedColors[v]) updatedColors[v] = "#0ac3dbff";
                              });

                              setVenueTypeColors(updatedColors);
                            }

                            section.setValues(vals);
                            section.setHasChanges(
                              JSON.stringify(vals) !==
                              JSON.stringify(adminProfile?.[section.profileKey] || [])
                            );
                          }}
                          onCreateOption={(inputValue) => {
                            const val = inputValue.trim();
                            if (!val || section.values.includes(val) || section.defaultOptions.includes(val))
                              return;

                            section.setValues([...section.values, val]);
                            if (section.title === "Venue Types") {
                              setVenueTypeColors((prev) => ({ ...prev, [val]: "#0ac3dbff" }));
                            }
                            section.setHasChanges(true);
                          }}
                          isSearchable
                          closeMenuOnSelect={false}
                          styles={{
                            control: (base) => ({
                              ...base,
                              borderRadius: "10px",
                              borderColor: "#ccc",
                              padding: "3px",
                            }),
                          }}
                          formatCreateLabel={(val) => `${val}`}
                        />

                        {section.hasChanges && (
                          <button
                            type="button"
                            className={styles.saveButtonPrimary}
                            onClick={async () => {
                              if (!adminProfile) return;
                              const ref = doc(db, "usersAccess", adminProfile.id);
                              const updateData = { [section.profileKey]: section.values };
                              if (section.title === "Venue Types") updateData.venueTypeColors = venueTypeColors;
                              await updateDoc(ref, updateData);
                              section.setHasChanges(false);
                              section.setOpen(false);
                            }}
                          >
                            Save Update
                          </button>
                        )}



                      </>
                    )}
                  </div>
                )}

                {/* Venue Colors Section */}
                {/* 🎨 Venue Colors – show ONLY after venue types are saved */}
                {section.title === "Venue Types" &&
                  section.values.length > 0 &&
                  !hasVenueChanges && (
                    <div className={styles.colorSection}>
                      <h4>Assign Color to Each Venue:</h4>

                      {section.values.map((venue) => (
                        <div key={venue} className={styles.colorRow}>
                          <span>{venue}</span>
                          <input
                            type="color"
                            style={{ width: "10%", marginLeft: "10px" }}
                            value={venueTypeColors[venue] || "#0ac3dbff"}
                            onChange={(e) => {
                              setVenueTypeColors((prev) => ({
                                ...prev,
                                [venue]: e.target.value,
                              }));
                              setHasVenueColorChanges(true);
                            }}
                          />
                        </div>
                      ))}

                      {hasVenueColorChanges && (
                        <button
                          type="button"
                          className={styles.saveButtonPrimary}
                          onClick={async () => {
                            if (!adminProfile) return;
                            const ref = doc(db, "usersAccess", adminProfile.id);
                            await updateDoc(ref, { venueTypeColors });
                            setHasVenueColorChanges(false);
                          }}
                        >
                          Save Colors
                        </button>
                      )}
                    </div>
                  )}

              </div>
            ))}

          </>
        ) : (
          <div className={styles.loadingContainer}>
            {loading ? (
              <div className={styles.spinner}></div>
            ) : (
              <p className={styles.message}>
                Please log in with an Admin/Partner profile...
              </p>
            )}
          </div>
        )}

        <div className={styles.bottomSpacing}></div>
      </div>

      <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
    </div>
  );
};

export default AdminProfile;