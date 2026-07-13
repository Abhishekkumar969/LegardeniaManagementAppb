import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebaseConfig";

import EnquiryDetails from "../../Enquiry/EnquiryDetails";
import BookingLeadsTable from "./BookingLeadsTable";
import AllBookings from "../../Book/AllLeads/BookingLeadsTable";

import "../../styles/LeadsTabContainer.css";
import BackButton from "../../components/BackButton";

const LeadsTabContainer = () => {
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const tabFromURL = queryParams.get("tab");
    const [activeTab, setActiveTab] = useState(null);
    const [panelAccess, setPanelAccess] = useState({});
    const [userAppType, setUserAppType] = useState(null);
    const [loading, setLoading] = useState(true);

    // 🔹 Fetch user + access (same as Past)
    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;

        if (!user) {
            setLoading(false);
            return;
        }

        const userRef = doc(db, "usersAccess", user.email);
        const accessRef = doc(db, "pannelAccess", "Bookings");

        const unsubUser = onSnapshot(userRef, snap => {
            if (snap.exists()) {
                setUserAppType(snap.data().accessToApp);
            }
        });

        const unsubAccess = onSnapshot(accessRef, snap => {
            if (snap.exists()) {
                setPanelAccess(snap.data());
            }
        });

        return () => {
            unsubUser();
            unsubAccess();
        };
    }, []);

    // 🔹 Access checker (same logic)
    const hasAccess = useCallback(
        (recordType) => {
            if (userAppType === "A") return true;
            if (!userAppType || !panelAccess) return false;
            const arr = panelAccess[recordType] || [];
            return arr.includes(userAppType);
        },
        [userAppType, panelAccess]
    );

    // 🔹 Stop loading ONLY when ready
    useEffect(() => {
        if (userAppType && Object.keys(panelAccess).length > 0) {
            setLoading(false);
        }
    }, [userAppType, panelAccess]);

    // 🔹 Auto select tab (PAST STYLE – THIS IS KEY)
    useEffect(() => {
        if (loading) return;

        const accessibleTabs = [];
        if (hasAccess("Enquiry Record")) accessibleTabs.push("enquiry");
        if (hasAccess("Lead Record")) accessibleTabs.push("leads");
        if (hasAccess("Book Record")) accessibleTabs.push("bookings");

        let defaultTab = null;

        if (tabFromURL && accessibleTabs.includes(tabFromURL)) {
            defaultTab = tabFromURL;
        } else {
            defaultTab = accessibleTabs[0] || null;
        }

        setActiveTab(defaultTab);
    }, [loading, tabFromURL, hasAccess]);

    const handleTabClick = (tabKey) => {
        setActiveTab(tabKey);
        window.history.replaceState(null, "", `?tab=${tabKey}`);
    };

    const renderActiveComponent = () => {
        switch (activeTab) {
            case "enquiry":
                return <EnquiryDetails />;
            case "leads":
                return <BookingLeadsTable />;
            case "bookings":
                return <AllBookings />;
            default:
                return <p style={{ textAlign: "center" }}>No access</p>;
        }
    };

    if (loading) return <p style={{ textAlign: "center" }}>Loading...</p>;

    return (
        <div className="page-scroller">
            <div className="leads-tab-wrapper">
                <BackButton />

                <div className="tab-buttons">
                    {hasAccess("Enquiry Record") && (
                        <button
                            className={activeTab === "enquiry" ? "active" : ""}
                            onClick={() => handleTabClick("enquiry")}
                        >
                            Enquiry
                        </button>
                    )}

                    {hasAccess("Lead Record") && (
                        <button
                            className={activeTab === "leads" ? "active" : ""}
                            onClick={() => handleTabClick("leads")}
                        >
                            Leads
                        </button>
                    )}

                    {hasAccess("Book Record") && (
                        <button
                            className={activeTab === "bookings" ? "active" : ""}
                            onClick={() => handleTabClick("bookings")}
                        >
                            Bookings
                        </button>
                    )}
                </div>

                <div>{renderActiveComponent()}</div>
            </div>
        </div>
    );
};

export default LeadsTabContainer;
