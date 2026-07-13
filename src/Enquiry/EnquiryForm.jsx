import React, { useState, useEffect } from "react";
import "../styles/Booking.css";
import CalendarInput from "../pages/CalendarInput";
import { db } from "../firebaseConfig";
import { doc, setDoc, serverTimestamp, collection, deleteField, getDoc } from "firebase/firestore";
import BackButton from "../components/BackButton";
import FunctionTypeSelector from "./FunctionTypeSelector";
import { useLocation } from "react-router-dom";
import { useNavigate } from 'react-router-dom';
import { getAuth } from "firebase/auth";
import BottomNavigationBar from "../components/BottomNavigationBar";
import checkDuplicateEntry from "../components/checkDuplicateEntry";

const EnquiryPage = () => {
    const navigate = useNavigate();
    const [userAppType, setUserAppType] = useState(null);
    const [editorInfo, setEditorInfo] = useState({ name: "", email: "" });
    const [whatsappTemplate, setWhatsappTemplate] = useState("");
    const [winError, setWinError] = useState(false);

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
                        setEditorInfo({ name: data.name || "Unknown", email: data.email });
                    }
                } catch (err) {
                    console.error("Error fetching user app type:", err);
                }
            }
        };
        fetchUserAppType();
    }, []);

    useEffect(() => {
        const fetchWhatsappTemplate = async () => {
            try {
                const ref = doc(db, "whatsappMessages", "Enquiry");
                const snap = await getDoc(ref);

                if (snap.exists()) {
                    setWhatsappTemplate(snap.data().text);
                }
            } catch (err) {
                console.error("Failed to fetch WhatsApp template", err);
            }
        };

        fetchWhatsappTemplate();
    }, []);

    const buildWhatsappMessage = () => {
        if (!whatsappTemplate) return "";

        let msg = whatsappTemplate
            .replace(
                "{functionDate}",
                formData.functionDate ? formatDate(formData.functionDate) : "-"
            )
            .replace("{name}", formData.name || "");

        // 🧨 ONLY remove exact "Guest Name" (case-insensitive)
        msg = msg
            .replace(/\bguest\s+name\b/gi, "")
            .replace(/\s{2,}/g, " ")   // extra spaces clean
            .replace(/,\s*,/g, ",")    // double commas
            .replace(/^,\s*/g, "")     // starting comma
            .trim();

        return msg;
    };

    const formatDateIST = (date) => {
        if (!date) return "-";

        const d = new Date(date);

        // Convert to IST (UTC + 5:30)
        const istOffset = 5 * 60 + 30; // minutes
        const istDate = new Date(d.getTime() + istOffset * 60 * 1000);

        const day = String(istDate.getUTCDate()).padStart(2, "0");
        const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
        const year = istDate.getUTCFullYear();
        const hours = String(istDate.getUTCHours()).padStart(2, "0");
        const minutes = String(istDate.getUTCMinutes()).padStart(2, "0");

        return `${day}-${month}-${year}, ${hours}:${minutes}`; // DD-MM-YYYY HH:MM IST
    };

    const formatDate = (date) => {
        if (!date) return "-";

        const d = new Date(date);

        // Convert to IST (UTC + 5:30)
        const istOffset = 5 * 60 + 30; // minutes
        const istDate = new Date(d.getTime() + istOffset * 60 * 1000);

        const day = String(istDate.getUTCDate()).padStart(2, "0");
        const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
        const year = istDate.getUTCFullYear();

        return `${day}-${month}-${year}`; // DD-MM-YYYY
    };

    const getTodayIST = () => {
        const now = new Date();
        const istOffset = 5 * 60 + 30; // minutes
        const istDate = new Date(now.getTime() + istOffset * 60 * 1000);

        const day = String(istDate.getUTCDate()).padStart(2, "0");
        const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
        const year = istDate.getUTCFullYear();

        return `${year}-${month}-${day}`; // YYYY-MM-DD
    };

    const location = useLocation();
    const enquiry = location.state?.enquiry || null;

    const [formData, setFormData] = useState({
        prefix: "Mr.",
        name: "Guest Name",
        mobile1: "",
        mobile2: "",
        email: "",
        pax: "",
        functionType: "Wedding",
        functionDate: "",
        dayNight: "Night",
        enquiryDate: getTodayIST(),
        note: "",
        winProbability: "",
        shareMedia: { shareMedia: true, at: formatDateIST(new Date()) }, // <-- DEFAULT SELECTED
    });

    useEffect(() => {
        if (enquiry) {
            const enquiryDateObj = new Date(enquiry.enquiryDate);
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const originalMonthYear = `${monthNames[enquiryDateObj.getMonth()]}${enquiryDateObj.getFullYear()}`;

            setFormData(prev => ({
                ...prev,
                ...enquiry,
                fieldId: enquiry.fieldId,
                shareMedia: enquiry.shareMedia || { shareMedia: false, at: null },
                originalMonthYear,
            }));
        }
    }, [enquiry]);

    const [showCalendar, setShowCalendar] = useState(false);
    const [errors, setErrors] = useState({});
    const [toast, setToast] = useState(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleWinChange = (value) => {
        setFormData(prev => ({
            ...prev,
            winProbability: value
        }));

        setWinError(!value);
    };

    const validate = () => {
        const tempErrors = {};
        if (!formData.mobile1) tempErrors.mobile1 = "Mobile 1 is required";
        if (!formData.pax) tempErrors.pax = "Pax is required";
        if (!formData.functionDate) tempErrors.functionDate = "Function Date is required";
        if (!formData.functionType) tempErrors.functionType = "Function Type is required";
        if (!formData.winProbability) {
            tempErrors.winProbability = true;
            setWinError(true);
        }
        setErrors(tempErrors);
        return Object.keys(tempErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const duplicate = await checkDuplicateEntry(formData, navigate, setToast);
        if (duplicate) return;


        if (!validate()) {
            setToast("❌ Please fill all mandatory fields.");
            setTimeout(() => setToast(null), 5000);
            return;
        }

        if (enquiry && !formData.fieldId) {
            console.error("❌ fieldId missing in edit mode");
            return;
        }

        try {
            const enquiryDateObj = new Date(formData.enquiryDate);
            if (isNaN(enquiryDateObj)) throw new Error("Invalid enquiry date");

            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const newMonthYear = `${monthNames[enquiryDateObj.getMonth()]}${enquiryDateObj.getFullYear()}`;
            const monthDocRef = doc(db, "enquiry", newMonthYear);

            // 🔹 Determine field ID
            const fieldIdToUse = formData.fieldId || doc(collection(db, "enquiry")).id;

            // 🔹 Delete old month entry if enquiryDate month/year changed
            if (formData.fieldId && formData.originalMonthYear && formData.originalMonthYear !== newMonthYear) {
                const oldMonthRef = doc(db, "enquiry", formData.originalMonthYear);
                await setDoc(oldMonthRef, { [fieldIdToUse]: deleteField() }, { merge: true });
                console.log("🗑️ Deleted old enquiry from:", formData.originalMonthYear);
            }

            // 🔹 Prepare data to save
            const dataToSave = {
                ...formData,
                fieldId: fieldIdToUse,
                originalMonthYear: newMonthYear, // update for future edits
                updatedAt: serverTimestamp(),
                createdAt: formData.fieldId ? formData.createdAt || formatDateIST(new Date()) : formatDateIST(new Date()),
            };

            // 🔹 Handle update log if editing
            let previousEnquiry = null;
            if (formData.fieldId) {
                // We need to get the previous enquiry from the original month doc
                const oldMonthRef = doc(db, "enquiry", formData.originalMonthYear || newMonthYear);
                const oldMonthSnap = await getDoc(oldMonthRef);
                if (oldMonthSnap.exists()) {
                    previousEnquiry = oldMonthSnap.data()[fieldIdToUse] || null;
                }
            }

            if (previousEnquiry) {
                let changes = {};
                let logKey = null;

                Object.entries(dataToSave).forEach(([key, newVal]) => {
                    if (["updatedAt", "createdAt"].includes(key)) return;

                    const oldVal = previousEnquiry[key];

                    if (key === "shareMedia") {
                        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                           changes[key] = { old: oldVal || null, new: newVal || null };
                        }
                        return;
                    }

                    if (oldVal !== newVal) {
                        changes[key] = { old: oldVal ?? null, new: newVal ?? null };
                    }
                });

                if (Object.keys(changes).length > 0) {
                    const existingLogs = Object.keys(previousEnquiry).filter(k => k.startsWith("updateLog"));
                    const nextLogNumber = existingLogs.length + 1;
                    logKey = `updateLog${nextLogNumber}`;

                    dataToSave[logKey] = {
                        at: serverTimestamp(),
                        by: editorInfo,
                        changes
                    };
                }
            }

            // 🔹 Save/update enquiry in Firestore
            await setDoc(monthDocRef, { [fieldIdToUse]: dataToSave }, { merge: true });

            setToast(formData.fieldId ? "✅ Enquiry updated successfully!" : "✅ Enquiry submitted successfully!");

            // 🔹 Reset form if new
            if (!formData.fieldId) {
                setFormData({
                    fieldId: "",
                    name: "Guest Name",
                    mobile1: "",
                    mobile2: "",
                    email: "",
                    pax: "",
                    functionType: "",
                    functionDate: "",
                    note: "",
                    dayNight: "Night",
                    enquiryDate: getTodayIST(),
                    winProbability: "",
                    shareMedia: { shareMedia: false, at: null }, // ✅ updated
                });
            }

            // 🔹 WhatsApp share
            if (formData.shareMedia.shareMedia && formData.mobile1) {
                let phone = formData.mobile1.trim().replace(/\D/g, "");
                if (!phone.startsWith("91")) phone = phone.length === 10 ? "91" + phone : "91" + phone;

                const message = encodeURIComponent(buildWhatsappMessage());
                window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
            }

            setTimeout(() => setToast(null), 4000);
            setTimeout(() => window.history.back(), 1200);

        } catch (error) {
            console.error("❌ Error saving enquiry:", error);
            setToast("❌ Failed to submit enquiry: " + error.message);
            setTimeout(() => setToast(null), 4000);
        }
    };

    const formatIndianNumber = (value) => {
        if (!value) return "";
        const num = value.replace(/,/g, "");
        return Number(num).toLocaleString("en-IN");
    };

    const WIN_MAP = {
        "0-25": { value: 12, color: "#f44336" },
        "25-50": { value: 38, color: "#ff9800" },
        "50-75": { value: 62, color: "#ffeb3b" },
        "75-98": { value: 90, color: "#00bfff" },
        "99-100": { value: 100, color: "#4caf50" }
    };

    const selectedKey = Object.keys(WIN_MAP).find(
        key => WIN_MAP[key].value === formData.winProbability
    ) || "";

    return (
        <div className="page-scroller">
            <div style={{ color: "black" }}>
                <BackButton />

                <form style={{ marginTop: "70px", display: 'flex', justifyContent: 'space-between' }}>
                    <div></div>
                    <div className="BookedOn">
                        <label
                            style={{
                                fontWeight: 600,
                                fontSize: "14px",
                                color: "#333",
                                whiteSpace: "nowrap",
                            }}
                        >
                            Enquiry on:
                        </label>
                        <input
                            type="date"
                            name="enquiryDate"
                            value={formData.enquiryDate}
                            onChange={handleChange}
                            style={{ color: 'red', width: '150px' }}
                        />
                    </div>
                </form>


                <div className="booking-lead-container">
                    <h2>{enquiry ? "Edit Enquiry" : "New Enquiry"}</h2>
                    <form style={{ marginTop: "0px" }} onSubmit={handleSubmit}>

                        {/* Name with Prefix */}
                        <div className="form-group">
                            <label style={{ color: 'red' }}>Name:</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <select
                                    onChange={(e) => handleChange({ target: { name: 'prefix', value: e.target.value } })}
                                    value={formData.prefix || ''}
                                    style={{ width: '100px' }}
                                >
                                    <option value="Mr.">Mr.</option>
                                    <option value="Ms.">Ms.</option>
                                    <option value="Mrs.">Mrs.</option>
                                    <option value="Dr.">Dr.</option>
                                    <option value="Md.">Md.</option>
                                    <option value="">Blank</option>
                                </select>

                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={(e) => {
                                        let value = e.target.value.replace(/\b\w/g, char => char.toUpperCase());
                                        handleChange({ target: { name: 'name', value } });
                                    }}
                                    placeholder="Guest Name"
                                />
                            </div>
                        </div>

                        {/* Mobile 1 */}
                        <div className="form-group">
                            <label style={{ color: 'red' }}>Mobile 1*:</label>
                            <input
                                type="text"
                                name="mobile1"
                                value={formData.mobile1}
                                maxLength={10}
                                onChange={(e) => {
                                    const onlyNums = e.target.value.replace(/[^0-9]/g, "");
                                    if (onlyNums.length <= 10) {
                                        handleChange({ target: { name: "mobile1", value: onlyNums } });
                                    }
                                    // Live validation
                                    if (onlyNums.length > 0 && onlyNums.length < 10) {
                                        setErrors((prev) => ({
                                            ...prev,
                                            mobile1: "Enter a valid 10-digit numberd",
                                        }));
                                    } else {
                                        setErrors((prev) => {
                                            const { mobile1, ...rest } = prev;
                                            return rest;
                                        });
                                    }
                                }}
                                inputMode="numeric"
                                placeholder="Enter 10-digit number"
                            />
                            {errors.mobile1 && <span className="error">{errors.mobile1}</span>}
                        </div>

                        {/* Mobile 2 */}
                        <div className="form-group">
                            <label>Mobile 2:</label>
                            <input
                                type="text"
                                name="mobile2"
                                value={formData.mobile2}
                                maxLength={10}
                                onChange={(e) => {
                                    const onlyNums = e.target.value.replace(/[^0-9]/g, "");
                                    if (onlyNums.length <= 10) {
                                        handleChange({ target: { name: "mobile2", value: onlyNums } });
                                    }
                                    // Live validation for optional field
                                    if (onlyNums.length > 0 && onlyNums.length < 10) {
                                        setErrors((prev) => ({
                                            ...prev,
                                            mobile2: "Enter a valid 10-digit number",
                                        }));
                                    } else {
                                        setErrors((prev) => {
                                            const { mobile2, ...rest } = prev;
                                            return rest;
                                        });
                                    }
                                }}
                                inputMode="numeric"
                                placeholder="Enter 10-digit number"
                            />
                            {errors.mobile2 && <span className="error">{errors.mobile2}</span>}
                        </div>

                        {/* Email */}
                        <div className="form-group">
                            <label>Email ID:</label>
                            <input type="email" name="email" value={formData.email} onChange={handleChange} />
                        </div>

                        {/* Source */}
                        <div className="form-group">
                            <label>Source of Lead</label>
                            <select
                                name="source"
                                onChange={handleChange}
                                value={formData.source || ""}
                            >
                                <option value=""></option>
                                <option value="Walk-In">Walk-In</option>
                                <option value="Just Dial">Just Dial</option>
                                <option value="Reference">Reference</option>
                                <option value="Social Media">Social Media</option>
                                <option value="Past Booked">Past Booked</option>
                            </select>
                            {errors.source && <span className="error">Required</span>}
                        </div>

                        {formData.source === "Reference" && (
                            <div className="form-group">
                                <label>Referred By</label>
                                <input
                                    type="text"
                                    name="referredBy"
                                    value={formData.referredBy || ""}
                                    onChange={handleChange}
                                />
                                {errors.referredBy && <span className="error">Required</span>}
                            </div>
                        )}

                        {/* Pax */}
                        <div className={`form-group ${errors.pax ? "section-error" : ""}`}>
                            <label style={{ color: 'red' }}>Pax*:</label>
                            <input
                                type="text"
                                name="pax"
                                value={formatIndianNumber(formData.pax)}
                                onChange={(e) => {
                                    const onlyNums = e.target.value.replace(/[^0-9]/g, ""); // सिर्फ digits allow
                                    handleChange({ target: { name: "pax", value: onlyNums } });
                                }}
                                inputMode="numeric"
                                placeholder=""
                            />
                            {errors.pax && <span className="error">{errors.pax}</span>}
                        </div>

                        {/* Function Type */}
                        <div className="form-group">
                            <label style={{ color: 'red' }}>Function Type*:</label>
                            <FunctionTypeSelector
                                selectedType={formData.functionType}
                                onSelect={(type) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        functionType: type,
                                        // dayNight: typesWithDayNight.includes(type) ? prev.dayNight : "",
                                    }))
                                }
                            />
                            {errors.functionType && <span className="error">{errors.functionType}</span>}
                        </div>

                        {/* Day/Night */}
                        <div className="form-group">
                            <label>Day / Night</label>
                            <select name="dayNight" value={formData.dayNight || ""} onChange={handleChange}>
                                <option value="Night">Night</option>
                                <option value="Day">Day</option>
                                <option value="Both">Both</option>
                            </select>
                        </div>

                        {/* Function Date */}
                        <div className={`form-group ${errors.functionDate ? "section-error" : ""}`}>
                            <label style={{ color: 'red' }}>Function Date*:</label>
                            <button
                                type="button"
                                onClick={() => setShowCalendar(true)}
                                style={{
                                    width: "100%",
                                    borderRadius: "5px",
                                    backgroundColor: "transparent",
                                    border: "1px solid #93939393",
                                    fontSize: '14px',
                                    display: 'flex',
                                    boxShadow: 'inset 2px 2px 5px rgba(255, 255, 255, 0.8), inset -2px -2px 5px #00000045',
                                    color: formData.functionDate ? 'black' : 'white',
                                }}
                            >
                                {formData.functionDate
                                    ? `📅 ${formatDate(formData.functionDate)}`
                                    : "."}
                            </button>

                            <CalendarInput
                                isOpen={showCalendar}
                                onClose={() => setShowCalendar(false)}
                                onDateSelect={async (selectedDate) => {
                                    setFormData((prev) => ({ ...prev, functionDate: selectedDate }));
                                    setShowCalendar(false);

                                    const duplicate = await checkDuplicateEntry(
                                        { ...formData, functionDate: selectedDate },
                                        navigate,
                                        setToast
                                    );
                                    if (duplicate) return;
                                }}

                                selectedDate={formData.functionDate} // string pass karo
                            />

                            {errors.functionDate && <span className="error">{errors.functionDate}</span>}
                        </div>

                        {/* Notes */}
                        <div className="form-group">
                            <label>Notes:</label>
                            <textarea
                                name="note"
                                value={formData.note || ""}
                                onChange={handleChange}
                                placeholder="Enter any special notes or details here..."
                                style={{
                                    width: "100%",
                                    minHeight: "70px",
                                    borderRadius: "5px",
                                    border: "1px solid #ccc",
                                    padding: "8px",
                                    fontSize: "14px",
                                    resize: "vertical",
                                    boxShadow:
                                        "inset 2px 2px 5px rgba(255, 255, 255, 0.8), inset -2px -2px 5px #00000045",
                                }}
                            />
                        </div>

                        {/* Booking Confirmation Probability */}
                        <div className="form-group">
                            <label>Booking Confirmation Probability</label>
                            <select
                                onChange={(e) => {
                                    const key = e.target.value;
                                    handleWinChange(WIN_MAP[key]?.value || "");
                                }}
                                value={selectedKey}
                                style={{
                                    backgroundColor: WIN_MAP[selectedKey]?.color || "#fff",
                                    color: "black",
                                    fontWeight: "bold",
                                    border: winError ? "1px solid red" : "1px solid #ccc",
                                    padding: "8px",
                                    borderRadius: "4px"
                                }}
                            >
                                <option value=""></option>
                                <option value="0-25">0 - 25%</option>
                                <option value="25-50">25 - 50%</option>
                                <option value="50-75">50 - 75%</option>
                                <option value="75-98">75 - 98%</option>
                                <option value="99-100">99 - 100%</option>
                            </select>
                            {winError && <span className="error">Required</span>}
                        </div>

                        {/* Share Media */}
                        <div className="form-group">
                            <label>
                                <input
                                    type="checkbox"
                                    name="shareMedia"
                                    checked={formData.shareMedia.shareMedia} // ✅ fixed
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            shareMedia: {
                                                shareMedia: e.target.checked,
                                                at: e.target.checked ? formatDateIST(new Date()) : null, // ✅ use formatted IST
                                            },
                                        }))
                                    }
                                />
                                Share Media
                            </label>
                        </div>

                        {/* Submit */}
                        <div className="footer-buttons">
                            <button type="submit" className="save-button">
                                {enquiry ? "Update Enquiry" : "Submit Enquiry"}
                            </button>
                        </div>
                    </form>

                    {toast && (
                        <div className="custom-toast">
                            {toast}
                            <div className="toast-progress"></div>
                        </div>
                    )}

                </div>
                <div style={{ paddingBottom: '60px' }}></div>
            </div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
        </div>
    );
};

export default EnquiryPage;