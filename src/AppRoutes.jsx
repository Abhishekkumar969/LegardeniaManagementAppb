import React, { useState, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebaseConfig";
import AppLoading from "./AppLoading/AppLoading";

import Prebook from "./components/Prebook";
import PrivateRoute from "./auth/PrivateRoute";
import LoginPage from "./auth/LoginPage";
import BookingLead from './Lead/BookingLead';
import BookingLeadsTable from './Lead/AllLeads/BookingLeadsTable';
import DroppedLeads from './Lead/AllLeads/LeadsTabs/DroppedLeads';
import Booking from './Book/Booking';
import BookingTable from './Book/AllLeads/BookingLeadsTable';
import AllBookingDatesList from './pages/AllBookingDatesList';
import GSTSummary from './Book/AllLeads/GSTSummary';
import MoneyReceipt from './MoneyReceipt/MoneyReceiptForm';
import MoneyReceipts from './MoneyReceipt/MoneyReceipts';
import MoneyReceiptsStats from './MoneyReceipt/MoneyReceiptsStats';
import Receipts from './MoneyReceipt/Receipts';
import LeadsTabContainer from './Lead/AllLeads/LeadsTabContainer';
import PastLeadsTabContainer from './Lead/AllLeads/PastLeadsTabContainer';
import ReceiverCollectionsPage from './pages/ReceiverCollectionsPage';

import VendorProfile from './Vendor/VendorProfile';
import Vendor from './Vendor/Vendor';
import VendorOtherForm from './Vendor/VendorOtherForm';
import VendorTable from './Vendor/VendorTable';
import VendorTableAll from './Vendor/VendorTableAll';
import VendorBookedTable from './Vendor/VendorBookedTable';
import VendorBookedTableOthers from './Vendor/VendorBookedTableOthers';
import VendorDeoppedTable from './Vendor/VendorDeoppedTable';

import DecorationProfile from './Decoration/DecorationProfile';
import Decoration from './Decoration/Decoration';
import DecorationOtherForm from './Decoration/DecorationOtherForm';
import DecorationTable from './Decoration/DecorationTable';
import DecorationTableAll from './Decoration/DecorationTableAll';
import DecorationBookedTable from './Decoration/DecorationBookedTable';
import DecorationBookedTableOthers from './Decoration/DecorationBookedTableOthers';
import DecorationDeoppedTable from './Decoration/DecorationDeoppedTable';

import ApprovalPage from './MoneyReceipt/ApprovalPage';
import EnquiryForm from "./Enquiry/EnquiryForm";
import EnquiryDetails from "./Enquiry/EnquiryDetails";
import PastEnquiry from "./Enquiry/pastEnquiry/pastEnquiry";
import CateringAssign from "./Catering/CateringAssign";
import CateringAssigned from "./Catering/CateringAssigned";
import UserAccessPanel from './pages/UserAccessPanel';
import StatsPage from './pages/Stats';
import MenuItems from './pages/MenuItems';
import AdminProfile from './pages/AdminProfile';
import RoomBookings from './RoomBookings/RoomBookings';
import WhatsappMessage from './pages/WhatsappMessage';
import PaymentBar from "./MonthlyPayment/PaymentBar";
import AutoLogoutTimer from "./hooks/AutoLogoutTimer";

import SalaryLedger from './Ledger/SalaryLedger';
import VendorLedger from './Ledger/VendorLedger';

import Inventory from "./components/Inventory";
import DownloadEveryThing from "./Download/DownloadEveryThing";
import ImportData from "./Download/ImportData";
import EventTasks from "./components/EventTasks";

export default function AppRoutes() {
    const navigate = useNavigate();
    const [authUser, setAuthUser] = useState(undefined);
    const [hidePaymentBar, setHidePaymentBar] = useState(false);
    const [appCost, setAppCost] = useState(null);

    const [accessChecked, setAccessChecked] = useState(false);

    useEffect(() => {
        const auth = getAuth();
        return onAuthStateChanged(auth, (user) => {
            setAuthUser(user || null);
        });
    }, []);

    useEffect(() => {
        const auth = getAuth();
        if (!auth.currentUser) return;

        const ref = doc(db, "usersAccess", auth.currentUser.email);
        const unsub = onSnapshot(ref, (snap) => {
            const data = snap.data();

            if (!data || data.access !== "enable") {
                signOut(auth);
                navigate("/login", { replace: true });
                return;
            }

            // 🔴 PaymentBar hide roles
            if (["C", "E", "O"].includes(data.accessToApp)) {
                setHidePaymentBar(true);
            } else {
                setHidePaymentBar(false);
            }
            
            setAccessChecked(true);
        });

        return () => unsub();
    }, [authUser, navigate]);

    useEffect(() => {
        if (!authUser) return;

        const ref = doc(db, "AppCost", "active");

        const unsub = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                setAppCost(snap.data());
            } else {
                setAppCost(null);
            }
        });

        return () => unsub();
    }, [authUser]);

    if (!accessChecked) return <AppLoading />;

    return (
        <>
            <AutoLogoutTimer />

            <Routes>
                <Route path="/" element={<PrivateRoute><Prebook /></PrivateRoute>} />
                <Route path="/leadstabcontainer" element={<PrivateRoute><LeadsTabContainer /></PrivateRoute>} />
                <Route path="/PastLeadsTabContainer" element={<PrivateRoute><PastLeadsTabContainer /></PrivateRoute>} />
                <Route path="/GSTSummary" element={<PrivateRoute><GSTSummary /></PrivateRoute>} />
                <Route path="/MoneyReceipt" element={<PrivateRoute><MoneyReceipt /></PrivateRoute>} />
                <Route path="/MoneyReceipts" element={<PrivateRoute><MoneyReceipts /></PrivateRoute>} />
                <Route path="/MoneyReceiptsStats" element={<PrivateRoute><MoneyReceiptsStats /></PrivateRoute>} />
                <Route path="/Receipts" element={<PrivateRoute><Receipts /></PrivateRoute>} />
                <Route path="/ApprovalPage" element={<PrivateRoute><ApprovalPage /></PrivateRoute>} />
                <Route path="/bookingLead" element={<PrivateRoute><BookingLead /></PrivateRoute>} />
                <Route path="/leads" element={<PrivateRoute><BookingLeadsTable /></PrivateRoute>} />
                <Route path="/DroppedLeads" element={<PrivateRoute><DroppedLeads /></PrivateRoute>} />
                <Route path="/Booking" element={<PrivateRoute><Booking /></PrivateRoute>} />
                <Route path="/BookingTable" element={<PrivateRoute><BookingTable /></PrivateRoute>} />
                <Route path="/AllBookingDatesList" element={<PrivateRoute><AllBookingDatesList /></PrivateRoute>} />

                <Route path="/VendorProfile" element={<PrivateRoute><VendorProfile /></PrivateRoute>} />
                <Route path="/Vendor" element={<PrivateRoute><Vendor /></PrivateRoute>} />
                <Route path="/VendorOtherForm" element={<PrivateRoute><VendorOtherForm /></PrivateRoute>} />
                <Route path="/VendorTable" element={<PrivateRoute><VendorTable /></PrivateRoute>} />
                <Route path="/VendorTableAll" element={<PrivateRoute><VendorTableAll /></PrivateRoute>} />
                <Route path="/VendorBookedTable" element={<PrivateRoute><VendorBookedTable /></PrivateRoute>} />
                <Route path="/VendorBookedTableOthers" element={<PrivateRoute><VendorBookedTableOthers /></PrivateRoute>} />
                <Route path="/VendorDeoppedTable" element={<PrivateRoute><VendorDeoppedTable /></PrivateRoute>} />

                <Route path="/Decoration" element={<PrivateRoute><Decoration /></PrivateRoute>} />
                <Route path="/DecorationBookedTable" element={<PrivateRoute><DecorationBookedTable /></PrivateRoute>} />
                <Route path="/DecorationBookedTableOthers" element={<PrivateRoute><DecorationBookedTableOthers /></PrivateRoute>} />
                <Route path="/DecorationDeoppedTable" element={<PrivateRoute><DecorationDeoppedTable /></PrivateRoute>} />
                <Route path="/DecorationOtherForm" element={<PrivateRoute><DecorationOtherForm /></PrivateRoute>} />
                <Route path="/DecorationProfile" element={<PrivateRoute><DecorationProfile /></PrivateRoute>} />
                <Route path="/DecorationTable" element={<PrivateRoute><DecorationTable /></PrivateRoute>} />
                <Route path="/DecorationTableAll" element={<PrivateRoute><DecorationTableAll /></PrivateRoute>} />

                <Route path="/ReceiverCollectionsPage" element={<PrivateRoute><ReceiverCollectionsPage /></PrivateRoute>} />
                <Route path="/UserAccessPanel" element={<PrivateRoute><UserAccessPanel /></PrivateRoute>} />
                <Route path="/StatsPage" element={<PrivateRoute><StatsPage /></PrivateRoute>} />
                <Route path="/EnquiryForm" element={<PrivateRoute><EnquiryForm /></PrivateRoute>} />
                <Route path="/EnquiryDetails" element={<PrivateRoute><EnquiryDetails /></PrivateRoute>} />
                <Route path="/PastEnquiry" element={<PrivateRoute><PastEnquiry /></PrivateRoute>} />
                <Route path="/CateringAssign" element={<PrivateRoute><CateringAssign /></PrivateRoute>} />
                <Route path="/CateringAssigned" element={<PrivateRoute><CateringAssigned /></PrivateRoute>} />
                <Route path="/MenuItems" element={<PrivateRoute><MenuItems /></PrivateRoute>} />
                <Route path="/AdminProfile" element={<PrivateRoute><AdminProfile /></PrivateRoute>} />
                <Route path="/RoomBookings" element={<PrivateRoute><RoomBookings /></PrivateRoute>} />
                <Route path="/WhatsappMessage" element={<PrivateRoute><WhatsappMessage /></PrivateRoute>} />

                <Route path="/SalaryLedger" element={<PrivateRoute><SalaryLedger /></PrivateRoute>} />
                <Route path="/VendorLedger" element={<PrivateRoute><VendorLedger /></PrivateRoute>} />

                <Route path="/Inventory" element={<PrivateRoute><Inventory /></PrivateRoute>} />
                <Route path="/DownloadEveryThing" element={<PrivateRoute><DownloadEveryThing /></PrivateRoute>} />
                <Route path="/ImportData" element={<PrivateRoute><ImportData /></PrivateRoute>} />
                <Route path="/EventTasks" element={<PrivateRoute><EventTasks /></PrivateRoute>} />

                <Route path="/login" element={<LoginPage />} />
            </Routes>

            {!hidePaymentBar && <PaymentBar appCost={appCost} />}
        </>
    );
}
