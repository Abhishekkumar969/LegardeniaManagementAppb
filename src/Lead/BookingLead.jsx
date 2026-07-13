import React, { useRef, useState, useEffect } from 'react';
import LeadForm from './LeadForm';
import BookingAmenities from './BookingAmenities';
import LeadFollowUp from './LeadFollowUp';
import LeadSummary from './LeadSummary';
import MealSelection from './MealSelection';
import BottomNavigationBar from "../components/BottomNavigationBar";

import FoodMenuSelection from './FoodMenuSelection';
import { db } from '../firebaseConfig';
import { collection, Timestamp, setDoc, doc, query, where, getDocs, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import BackButton from '../components/BackButton';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/Booking.css';
import { getAuth, onAuthStateChanged } from "firebase/auth";

const BookingLead = () => {
    const leadFormRef = useRef();
    const navigate = useNavigate();
    const location = useLocation();
    const leadSummaryRef = useRef();
    const leadFollowUpRef = useRef();
    const leadToEdit = location.state?.leadToEdit || location.state?.enquiry || null;
    const isUpdateMode = !!leadToEdit;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [form, setForm] = useState({
        prefix: 'Mr.', name: '', enquiryDate: '', functionType: '', dayNight: 'Night', functionDate: '',
        source: 'Footfall', noOfPlates: '', hallCharges: '', note: "", winProbability: '',
        holdDate: '', followUpDates: ['', '', '', '', '']
    });
    const [gstBase, setGstBase] = useState('');
    const [selectedMenus, setSelectedMenus] = useState({});
    const [selectedItems, setSelectedItems] = useState([]);
    const [totalAmount, setTotalAmount] = useState(0);
    const [gstAmount, setGstAmount] = useState(0);
    const [meals, setMeals] = useState({});
    const [grandTotal, setGrandTotal] = useState(0);
    const [summaryData, setSummaryData] = useState([]);
    const [showToast, setShowToast] = useState(false);
    const [editorInfo, setEditorInfo] = useState({ name: "", email: "" });
    const [userAppType, setUserAppType] = useState(null);
    const mealRef = useRef();
    const [isEditDataLoaded, setIsEditDataLoaded] = useState(false);

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

    const getEditorName = async (email) => {
        const q = query(collection(db, "usersAccess"), where("email", "==", email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const docData = snapshot.docs[0].data();
            return {
                name: docData.name || "Unknown",
                email: docData.email || email
            };
        }
        return { name: "Unknown", email };
    };

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user?.email) {
                const info = await getEditorName(user.email);
                setEditorInfo(info);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (isUpdateMode && leadToEdit) {

            setForm((prev) => ({
                ...prev,
                ...leadToEdit,
                noOfPlates: leadToEdit.noOfPlates || leadToEdit.pax || "",
                dayNight: leadToEdit.dayNight || 'Night',
            }));

            setSelectedMenus(leadToEdit.selectedMenus || {});
            setSelectedItems(leadToEdit.bookingAmenities || []);
            setGstBase(leadToEdit.gstBase || '');
            setTotalAmount(leadToEdit.totalAmount || 0);
            setGstAmount(leadToEdit.gstAmount || 0);
            setGrandTotal(leadToEdit.grandTotal || 0);
            setMeals(leadToEdit.meals || {});
            setSummaryData(leadToEdit.menuSummaries || []);

            setIsEditDataLoaded(true);
        }
    }, [isUpdateMode, leadToEdit]);

    const handleChange = (e, index = null) => {
        if (e.target.name === 'followUpDates') {
            const updated = [...form.followUpDates];
            updated[index] = e.target.value;
            setForm({ ...form, followUpDates: updated });
        } else {
            setForm({ ...form, [e.target.name]: e.target.value });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // 🔒 Mobile validation
        if (!/^\d{10}$/.test(form.mobile1)) {
            alert("Mobile 1 must be a valid 10-digit number");
            return;
        }

        if (form.mobile2 && !/^\d{10}$/.test(form.mobile2)) {
            alert("Mobile 2 must be a valid 10-digit number");
            return;
        }

        const triggerToast = () => {
            setShowToast(true);
            setTimeout(() => setShowToast(false), 5000);
        };

        // Safe validator helper to catch errors and avoid breaking render
        const safeValidate = (ref, methodName) => {
            try {
                if (ref.current && typeof ref.current[methodName] === 'function') {
                    return ref.current[methodName]();
                }
                return false;
            } catch (err) {
                console.error(`Validation method ${methodName} threw an error:`, err);
                return false;
            }
        };

        const isLeadValid = safeValidate(leadFormRef, 'validateForm');
        const isSummaryValid = safeValidate(leadSummaryRef, 'validateSummary');
        const isFollowUpValid = safeValidate(leadFollowUpRef, 'validateFollowUp');

        if (!isLeadValid || !isSummaryValid || !isFollowUpValid) {
            triggerToast();
            return;
        }

        setIsSubmitting(true);

        try {
            // Your existing meal sanitization and firestore logic unchanged
            const sanitizedMeals = {};
            for (const dayKey in meals) {
                if (dayKey === "No. of days") continue;
                const dayMeals = meals[dayKey];
                if (!dayMeals) continue;

                const sanitizedDay = {};
                for (const mealName in dayMeals) {
                    if (mealName === "date") {
                        sanitizedDay.date = dayMeals.date;
                        continue;
                    }

                    const meal = dayMeals[mealName];
                    if (!meal.selectedItems || meal.selectedItems.length === 0) continue;

                    sanitizedDay[mealName] = {
                        ...meal,
                        items: meal.selectedItems,
                        total: (parseFloat(meal.rate) || 0) * (parseFloat(meal.pax) || 0)
                    };
                }

                if (Object.keys(sanitizedDay).length > 0) {
                    sanitizedMeals[dayKey] = sanitizedDay;
                }
            }

            const leadData = {
                ...form,
                gstBase: parseFloat(gstBase || 0),
                gstAmount,
                totalAmount,
                grandTotal,
                selectedMenus,
                menuSummaries: summaryData,
                bookingAmenities: selectedItems,
                updatedAt: Timestamp.now(),
                authorisedSignatory: editorInfo.name,
                meals,
                authorisedEmail: editorInfo.email
            };

            const enquiryDateObj = new Date(form.enquiryDate);
            if (isNaN(enquiryDateObj)) throw new Error("Invalid enquiry date");

            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const monthYear = `${monthNames[enquiryDateObj.getMonth()]}${enquiryDateObj.getFullYear()}`;
            const monthDocRef = doc(db, "bookingLeads", monthYear);

            let docId;
            let logKey = null;
            let changes = {};

            // deepEqual helper for objects
            const deepEqual = (a, b) => {
                if (a === b) return true;
                if (a == null || b == null) return false;
                if (typeof a !== typeof b) return false;
                if (typeof a !== "object") return a === b;
                if (Array.isArray(a)) {
                    if (!Array.isArray(b)) return false;
                    if (a.length !== b.length) return false;
                    for (let i = 0; i < a.length; i++) {
                        if (!deepEqual(a[i], b[i])) return false;
                    }
                    return true;
                }
                const aKeys = Object.keys(a);
                const bKeys = Object.keys(b);
                if (aKeys.length !== bKeys.length) return false;
                for (const key of aKeys) {
                    if (!deepEqual(a[key], b[key])) return false;
                }
                return true;
            };

            if (isUpdateMode) {
                docId = leadToEdit.id;
                const oldMonthYear = leadToEdit.monthYear || monthYear;

                Object.entries(leadData).forEach(([key, newVal]) => {
                    if (["updatedAt", "createdAt"].includes(key)) return;

                    const oldVal = leadToEdit[key];

                    if (["selectedMenus", "meals", "menuSummaries", "bookingAmenities"].includes(key)) {
                        if (!deepEqual(oldVal || {}, newVal || {})) {
                            changes[key] = { old: oldVal || null, new: newVal || null };
                        }
                        return;
                    }

                    if (oldVal !== newVal) {
                        changes[key] = { old: oldVal ?? null, new: newVal ?? null };
                    }
                });

                if (Object.keys(changes).length > 0) {
                    const existingLogs = Object.keys(leadToEdit).filter(k => k.startsWith("updateLog"));
                    const nextLogNumber = existingLogs.length + 1;
                    logKey = `updateLog${nextLogNumber}`;
                }

                const docToSet = { ...leadToEdit, ...leadData, updatedAt: Timestamp.now(), monthYear };
                if (logKey) {
                    docToSet[logKey] = {
                        at: Timestamp.now(),
                        by: editorInfo,
                        changes
                    };
                }

                await setDoc(
                    monthDocRef,
                    { [docId]: docToSet },
                    { merge: true }
                );

                if (oldMonthYear !== monthYear) {
                    const oldMonthRef = doc(db, "bookingLeads", oldMonthYear);
                    try {
                        const oldSnap = await getDoc(oldMonthRef);
                        if (oldSnap.exists() && oldSnap.data()[docId]) {
                            await updateDoc(oldMonthRef, { [docId]: deleteField() });
                            console.log(`Deleted lead ${docId} from old month ${oldMonthYear}`);
                        }
                    } catch (err) {
                        console.warn(`Could not delete lead from old month (${oldMonthYear}):`, err);
                    }
                }
            } else {
                docId = doc(collection(db, "bookingLeads")).id;
                await setDoc(
                    monthDocRef,
                    { [docId]: { ...leadData, createdAt: Timestamp.now(), id: docId, monthYear } },
                    { merge: true }
                );
            }

            if (location.state?.enquiry) {
                const { id: enquiryId, monthYear: enquiryMonth } = location.state.enquiry;
                const enquiryDocRef = doc(db, "enquiry", enquiryMonth);
                await setDoc(enquiryDocRef, { [enquiryId]: deleteField() }, { merge: true });
                console.log("✅ Enquiry removed after saving lead");
            }

            navigate("/leadstabcontainer?tab=leads");

            // Reset form
            setForm({
                prefix: "Mr.", name: "", enquiryDate: "", dayNight: "Night", functionType: "Wedding", functionDate: "",
                source: "Footfall", noOfPlates: "", hallCharges: "", winProbability: "",
                holdDate: "", followUpDates: ['', '', '', '', '']
            });
            setSelectedMenus({});
            setSelectedItems([]);
            setGstBase("");
            setMeals({});
            setTotalAmount(0);
            setGstAmount(0);
            setGrandTotal(0);
            setSummaryData([]);
        } catch (error) {
            console.error("Error saving/updating booking lead: ", error);
            alert("Error saving booking lead: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="page-scroller">
            <form style={{ paddingTop: "65px", display: 'flex', justifyContent: 'space-between' }} onSubmit={handleSubmit}>
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
                        Lead on:
                    </label>
                    <input
                        type="date"
                        name="enquiryDate"
                        value={form.enquiryDate}
                        onChange={handleChange}
                        style={{ color: 'red', width: '150px' }}
                    />
                </div>
            </form>

            <div className="booking-lead-container">
                <BackButton />

                <h2>LEAD ESTIMATE</h2>
                <form className="form-section" onSubmit={handleSubmit}>
                    <LeadForm
                        ref={leadFormRef}
                        form={form}
                        handleChange={handleChange}
                        setForm={setForm}
                    />

                    {(!isUpdateMode || isEditDataLoaded) && (
                        <BookingAmenities
                            selectedItems={selectedItems}
                            setSelectedItems={setSelectedItems}
                            isEditMode={isUpdateMode}
                        />
                    )}

                    <FoodMenuSelection
                        selectedMenus={selectedMenus}
                        extraPlates={form.extraPlates}
                        setSelectedMenus={setSelectedMenus}
                        noOfPlates={form.noOfPlates}
                    />

                    <MealSelection
                        ref={mealRef}
                        meals={meals}
                        setMeals={setMeals}
                        functionDate={form.functionDate}
                        dayNight={form.dayNight || "Night"}

                        functionType={form.functionType}
                        isEditMode={isUpdateMode}
                    />

                    <LeadSummary
                        ref={leadSummaryRef}
                        selectedMenus={selectedMenus}
                        hallCharges={form.hallCharges}
                        gstBase={gstBase}
                        setGstBase={setGstBase}
                        setTotalAmount={setTotalAmount}
                        setGstAmount={setGstAmount}
                        setGrandTotal={setGrandTotal}
                        setSummaryData={setSummaryData}
                        meals={meals}
                    />

                    <LeadFollowUp
                        ref={leadFollowUpRef}
                        form={form} handleChange={handleChange} />
                    <button type="submit" className="save-button" disabled={isSubmitting}>
                        {isSubmitting
                            ? isUpdateMode
                                ? 'Updating...'
                                : 'Saving...'
                            : isUpdateMode
                                ? 'Update'
                                : 'Save'}
                    </button>
                </form>

                {showToast && (
                    <div className="custom-toast">
                        Please fill all required fields.
                        <div className="toast-progress"></div>
                    </div>
                )}
            </div>

            <div style={{ marginBottom: "50px" }}></div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
        </div>
    );
};

export default BookingLead;