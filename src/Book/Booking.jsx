import React, { useState, useEffect, useRef } from 'react';
import '../styles/Booking.css';
import LeadForm from './LeadForm';
import BookingAmenities from './BookingAmenities';
import LeadSummary from './LeadSummary';
import FoodMenuSelection from './FoodMenuSelection';
import CustomChargeItems from './CustomChargeItems';
import CustomMenuCharges from './CustomMenuCharges';
import MealSelection from './MealSelection';
import { db } from '../firebaseConfig';
import { collection, Timestamp, doc, setDoc, updateDoc, deleteField, getDoc } from 'firebase/firestore';
import BackButton from '../components/BackButton';
import { getAuth } from "firebase/auth";
import { useLocation, useNavigate } from 'react-router-dom';
import { query, where, getDocs } from "firebase/firestore";
import BottomNavigationBar from "../components/BottomNavigationBar";
// import { useWhatsAppPrint } from "./AllLeads/useWhatsAppPrint";

const BookingLead = () => {
    const [form, setForm] = useState({ prefix: 'Mr.', name: '', email: '', enquiryDate: '', functionType: '', functionDate: '', source: '', venueType: '', noOfPlates: '', extraPlates: '', hallCharges: '', startTime: '', referredBy: '', finishTime: '', mobile1: '', mobile2: '', dayNight: 'Night', });
    const [selectedMenus, setSelectedMenus] = useState({});
    const [selectedItems, setSelectedItems] = useState([]);
    const [advancePayments, setAdvancePayments] = useState([]);
    const [totalAmount, setTotalAmount] = useState(0);
    const [gstAmount, setGstAmount] = useState(0);
    const [grandTotal, setGrandTotal] = useState(0);
    const [gstBase, setGstBase] = useState('');
    const [discount, setDiscount] = useState('');
    const [commission, setCommission] = useState('');
    const [customItems, setCustomItems] = useState([]);
    const [customMenuCharges, setCustomMenuCharges] = useState([]);
    const [meals, setMeals] = useState({});
    const [lead, setLead] = useState(null);
    const [editingMode, setEditingMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [editorInfo, setEditorInfo] = useState({ name: "", email: "" });
    const leadFormRef = useRef();
    const customItemsRef = useRef();
    const customMenuRef = useRef();
    const summaryRef = useRef();
    const mealRef = useRef();
    const navigate = useNavigate();
    const location = useLocation();
    const auth = getAuth();
    const currentUser = auth.currentUser;
    // const { sendToWhatsAppPrintCombined } = useWhatsAppPrint();

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

    const triggerToast = () => {
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
    };

    const getMonthYear = (dateStr) => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${monthNames[date.getMonth()]}${date.getFullYear()}`;
    };

    useEffect(() => {
        const loadEditor = async () => {
            if (currentUser?.email) {
                const q = query(collection(db, "usersAccess"), where("email", "==", currentUser.email));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const docData = snapshot.docs[0].data();
                    setEditorInfo({ name: docData.name || "Unknown", email: docData.email });
                }
            }
        };
        loadEditor();
    }, [currentUser]);

    const handleChange = (e, index = null) => {
        if (e.target.name === 'followUpDates') {
            const updated = [...form.followUpDates];
            updated[index] = e.target.value;
            setForm({ ...form, followUpDates: updated });
        } else {
            setForm({ ...form, [e.target.name]: e.target.value });
        }
    };

    const deepEqual = (a, b) => {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (typeof a !== typeof b) return false;

        // Primitive
        if (typeof a !== "object") return a === b;

        // Array
        if (Array.isArray(a)) {
            if (!Array.isArray(b)) return false;
            if (a.length !== b.length) return false;

            for (let i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i])) return false;
            }
            return true;
        }

        // Object
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);

        if (aKeys.length !== bKeys.length) return false;

        for (const key of aKeys) {
            if (!deepEqual(a[key], b[key])) return false;
        }

        return true;
    };

    const selectedMenusCompare = (oldMenus, newMenus) => {
        if (!oldMenus && !newMenus) return true;
        if (!oldMenus || !newMenus) return false;

        const oldKeys = Object.keys(oldMenus);
        const newKeys = Object.keys(newMenus);

        if (oldKeys.length !== newKeys.length) return false;

        for (let key of oldKeys) {
            if (!newMenus[key]) return false;

            const oldItem = oldMenus[key];
            const newItem = newMenus[key];

            // Compare inside menu item fields
            if (
                oldItem.qty !== newItem.qty ||
                oldItem.rate !== newItem.rate ||
                oldItem.total !== newItem.total ||
                oldItem.noOfPlates !== newItem.noOfPlates ||
                oldItem.extraPlates !== newItem.extraPlates
            ) {
                return false;
            }
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSaving) return;

        const isValid = [
            leadFormRef.current?.validateForm?.(),
            customItemsRef.current?.validateCustomItems?.(),
            summaryRef.current?.validateSummary?.(),
            mealRef.current?.validateMeals?.(),
            customMenuRef.current?.validateMenuCharges?.(),
        ];

        let allErrors = [];

        isValid.forEach(v => {
            if (v && !v.valid) {
                allErrors.push(...(v.errors || []));
            }
        });

        if (allErrors.length > 0) {
            alert("Please fix:\n\n" + allErrors.map((e, i) => `${i + 1}. ${e}`).join("\n"));
            setIsSaving(false);
            return;
        }

        if (!isValid) {
            triggerToast();
            return;
        }

        setIsSaving(true);

        try {
            const cleanedMenus = Object.fromEntries(
                Object.entries(selectedMenus || {}).filter(([_, v]) => ((v.noOfPlates || 0) + (v.extraPlates || 0)) > 0 && Number(v.total) > 0)
            );

            const bookingId = editingMode ? lead.id : doc(collection(db, "prebookings")).id;
            const monthYear = getMonthYear(form.enquiryDate);
            const monthRef = doc(db, "prebookings", monthYear);

            // Delete old month entry if month changed
            if (editingMode && lead?.sourceDoc && lead.sourceDoc !== monthYear) {
                const oldMonthRef = doc(db, "prebookings", lead.sourceDoc);
                try {
                    await updateDoc(oldMonthRef, { [bookingId]: deleteField() });
                } catch (e) { console.warn("Failed to delete from old prebookings month", e); }
            }

            const dataToSave = {
                ...form,
                id: bookingId,
                sourceDoc: monthYear,
                eventBookedBy: form.eventBookedBy || editorInfo.name || "Unknown",
                gstBase: parseFloat(gstBase || 0),
                gstAmount,
                totalAmount,
                grandTotal,
                discount: discount || 0,
                commission: commission || 0,
                bookingAmenities: selectedItems,
                advancePayments,
                customItems,
                customMenuCharges,
                meals,
                startTime: form.startTime || '',
                finishTime: form.finishTime || '',
                updatedAt: Timestamp.now(),
            };

            // --- NEW: Prepare updateLog when editing and previous booking exists ---
            const monthSnap = await getDoc(monthRef);
            let previousBooking = null;

            if (monthSnap.exists()) {
                const monthData = monthSnap.data() || {};
                previousBooking = monthData[bookingId] || null;
            }

            let changes = {};
            let logKey = null;

            if (editingMode && previousBooking) {

                Object.entries(dataToSave).forEach(([key, newVal]) => {
                    if (key === "updatedAt") return;

                    const oldVal = previousBooking[key];

                    // Custom comparison for nested objects
                    if (key === "selectedMenus") {
                        const oldMenu = previousBooking.selectedMenus || {};
                        const newMenu = cleanedMenus;

                        if (!selectedMenusCompare(oldMenu, newMenu)) {
                            changes[key] = { old: oldMenu, new: newMenu };
                        }
                        return;
                    }

                    if (["customItems", "customMenuCharges", "meals"].includes(key)) {
                        const oldVal = previousBooking[key] || {};
                        const newVal = dataToSave[key] || {};

                        if (!deepEqual(oldVal, newVal)) {
                            changes[key] = { old: oldVal, new: newVal };
                        }
                        return;
                    }


                    // Normal comparison for primitives
                    if (!deepEqual(oldVal, newVal)) {
                        changes[key] = { old: oldVal ?? null, new: newVal ?? null };
                    }
                });

                if (Object.keys(changes).length === 0) {
                    alert("No changes to update.");
                    setIsSaving(false);
                    return;
                }

                const existingLogs = Object.keys(previousBooking).filter(k => k.startsWith("updateLog"));
                const nextLogNumber = existingLogs.length + 1;

                logKey = `updateLog${nextLogNumber}`;
            }

            // --- END updateLog prep ---

            // Save to Firestore (either create month doc or update it)
            if (!monthSnap.exists() || !monthSnap.data()[bookingId]) {
                // new month document or booking doesn't exist in this month yet
                const docToSet = {
                    [bookingId]: {
                        ...dataToSave,
                        selectedMenus: cleanedMenus,
                        // attach update log here only if we have one
                        ...(logKey && { [logKey]: { at: Timestamp.now(), by: editorInfo, changes } })
                    }
                };
                await setDoc(monthRef, docToSet, { merge: true });
            } else {
                // update existing month doc (field-path style)
                const payload = {};
                Object.entries(dataToSave).forEach(([k, v]) => {
                    payload[`${bookingId}.${k}`] = v;
                });

                payload[`${bookingId}.selectedMenus`] = Object.keys(cleanedMenus).length ? cleanedMenus : deleteField();

                // attach updateLog entry if we generated it
                if (logKey) {
                    payload[`${bookingId}.${logKey}`] = {
                        at: Timestamp.now(),
                        by: editorInfo,
                        changes
                    };
                }

                await updateDoc(monthRef, payload);
            }

            // Remove from bookingLeads if needed
            if (lead?.sourceDoc && location.state?.from === "bookingLeads") {
                const leadMonthRef = doc(db, "bookingLeads", lead.sourceDoc);
                try {
                    await updateDoc(leadMonthRef, { [lead.id]: deleteField() });
                } catch (e) { console.warn("Failed to delete from bookingLeads", e); }
            }

            // Remove enquiry if coming from enquiry flow
            if (location.state?.enquiry) {
                const { id, monthYear: enquiryMonth } = location.state.enquiry;
                const enquiryDocRef = doc(db, "enquiry", enquiryMonth);
                try {
                    await setDoc(enquiryDocRef, { [id]: deleteField() }, { merge: true });
                } catch (e) { console.warn("Failed to delete from enquiry", e); }
            }

            // ✅ FINAL LEAD OBJECT for WhatsApp / Print
            // const finalLeadForPrint = {
            //     ...dataToSave,
            //     id: bookingId,
            //     selectedMenus: cleanedMenus,
            //     bookingAmenities: selectedItems,
            //     advancePayments,
            //     customItems,
            //     customMenuCharges,
            //     meals,
            //     gstBase,
            //     gstAmount,
            //     totalAmount,
            //     grandTotal,
            //     discount,
            //     commission,
            // };

            // await sendToWhatsAppPrintCombined({
            //     lead: finalLeadForPrint
            // });

            navigate("/leadstabcontainer?tab=bookings");

            // Reset state
            setForm({
                prefix: 'Mr.', name: '', email: '', enquiryDate: '', functionType: 'Wedding',
                functionDate: '', source: '', venueType: '', noOfPlates: '', extraPlates: '',
                hallCharges: '', startTime: '', referredBy: '', finishTime: '', mobile1: '',
                mobile2: '', dayNight: 'Night',
            });
            setSelectedMenus({});
            setSelectedItems([]);
            setAdvancePayments([]);
            setGstBase('');
            setCommission('');
            setTotalAmount(0);
            setGstAmount(0);
            setGrandTotal(0);
            setCustomItems([]);
            setCustomMenuCharges([]);
            setMeals({});
            setDiscount('');
            setLead(null);
            setEditingMode(false);

        } catch (error) {
            console.error("Error saving booking:", error);
            alert("❌ Error saving booking: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        if ((location.state?.leadToEdit || location.state?.enquiry) && !editingMode) {

            const incoming = location.state.leadToEdit || location.state.enquiry;
            const sourceDoc = location.state.sourceDoc || incoming.monthYear || getMonthYear(incoming.enquiryDate);

            setLead({ ...incoming, sourceDoc });

            setForm({
                prefix: incoming.prefix || '',
                name: incoming.name || '',
                email: incoming.email || '',
                enquiryDate: incoming.enquiryDate || '',
                functionType: incoming.functionType || '',
                functionDate: incoming.functionDate || '',
                source: incoming.source || '',
                referredBy: incoming.referredBy || '',
                venueType: incoming.venueType || '',
                noOfPlates: incoming.noOfPlates || incoming.pax || '',
                hallCharges: incoming.hallCharges || '',
                extraPlates: incoming.extraPlates || '',
                mobile1: incoming.mobile1 || '',
                note: incoming.note || '',
                mobile2: incoming.mobile2 || '',
                startTime: incoming.startTime || '11:00',
                finishTime: incoming.finishTime || '09:00',
                eventBookedBy: incoming.eventBookedBy || '',
                followUpDates: incoming.followUpDates || ['', '', '', '', ''],
                dayNight: incoming.dayNight || 'Night',
            });

            setSelectedMenus(incoming.selectedMenus || {});
            setSelectedItems(incoming.bookingAmenities || []);
            setAdvancePayments(incoming.advancePayments || []);
            setGstBase(incoming.gstBase || '');
            setCommission(incoming.commission || 0);
            setTotalAmount(incoming.totalAmount || 0);
            setGstAmount(incoming.gstAmount || 0);
            setGrandTotal(incoming.grandTotal || 0);
            setCustomItems(incoming.customItems || []);
            setCustomMenuCharges(incoming.customMenuCharges || []);
            setMeals(incoming.meals || {});
            setDiscount(incoming.discount || 0);

            setEditingMode(true);
        }
    }, [location.state, editingMode]);

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
                        Booking on:
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

                <h2>BOOKING ESTIMATE</h2>
                <form className="form-section" onSubmit={handleSubmit}>
                    <LeadForm
                        currentUserEmail={currentUser?.email}
                        ref={leadFormRef}
                        form={form}
                        handleChange={handleChange}
                        setForm={setForm}
                    />

                    <BookingAmenities
                        selectedItems={selectedItems}
                        setSelectedItems={setSelectedItems}
                        venueType={form.venueType}
                        functionType={form.functionType}
                        editingMode={editingMode}
                    />

                    <CustomChargeItems
                        ref={customItemsRef}
                        customItems={customItems}
                        setCustomItems={setCustomItems}
                        functionType={form.functionType}
                    />

                    <CustomMenuCharges
                        ref={customMenuRef}
                        menuCharges={customMenuCharges}
                        setMenuCharges={setCustomMenuCharges}
                        functionType={form.functionType}
                        extraPlates={form.extraPlates}
                    />

                    <FoodMenuSelection
                        selectedMenus={selectedMenus}
                        setSelectedMenus={setSelectedMenus}
                        noOfPlates={form.noOfPlates}
                        extraPlates={form.extraPlates}
                        editingMode={editingMode}
                        functionType={form.functionType}
                    />

                    <MealSelection
                        ref={mealRef}
                        meals={meals}
                        setMeals={setMeals}
                        functionDate={form.functionDate}
                        dayNight={form.dayNight || "Night"}
                        functionType={form.functionType}
                    />

                    <LeadSummary
                        ref={summaryRef}
                        leadId={lead?.id}
                        selectedMenus={selectedMenus}
                        hallCharges={form.hallCharges}

                        gstBase={gstBase}
                        setGstBase={setGstBase}

                        totalAmount={totalAmount}

                        discount={discount}
                        setDiscount={setDiscount}

                        commission={commission}
                        setCommission={setCommission}

                        setTotalAmount={setTotalAmount}

                        gstAmount={gstAmount}
                        setGstAmount={setGstAmount}

                        grandTotal={grandTotal}
                        setGrandTotal={setGrandTotal}

                        customItems={customItems}
                        customMenuCharges={customMenuCharges}
                        meals={meals}
                    />
                    <button type="submit" className="save-button" disabled={isSaving}>
                        {lead?.id ? (isSaving ? "Updating..." : "Update") : (isSaving ? "Saving..." : "Save")}
                    </button>
                </form>

                {/* ✅ Toast Notification */}
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