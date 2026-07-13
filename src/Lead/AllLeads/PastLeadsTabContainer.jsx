import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import PastEnquiry from '../../Enquiry/pastEnquiry/pastEnquiry';
import DroppedLeads from './LeadsTabs/DroppedLeads';
import CancelledBookings from '../../Book/CancelledLeads/CancelledLeadsTable';
import '../../styles/LeadsTabContainer.css';
import BackButton from "../../components/BackButton";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { getAuth } from "firebase/auth";

const PastLeadsTabContainer = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const tabFromURL = queryParams.get("tab");

  const [activeTab, setActiveTab] = useState(null);
  const [panelAccess, setPanelAccess] = useState({});
  const [userAppType, setUserAppType] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch user & panel access
  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      console.warn("No user logged in!");
      setLoading(false);
      return;
    }

    const userRef = doc(db, 'usersAccess', user.email);
    const accessRef = doc(db, "pannelAccess", "Bookings");

    const unsubscribeUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const access = snap.data().accessToApp;
        setUserAppType(access);
      } else {
        console.warn("User access document not found");
      }
    });

    const unsubscribeAccess = onSnapshot(accessRef, (snap) => {
      if (snap.exists()) {
        setPanelAccess(snap.data());
      } else {
        console.warn("Panel access document not found");
      }
    });

    return () => {
      unsubscribeUser();
      unsubscribeAccess();
    };
  }, []);

  // Check access helper
  const hasAccess = useCallback(
    (recordType) => {
      if (userAppType === "A") return true;
      if (!userAppType || !panelAccess) return false;
      const arr = panelAccess[recordType] || [];
      return arr.some(a => a.toString().trim() === userAppType.toString().trim());
    },
    [userAppType, panelAccess]
  );

  // Stop loading when both userAppType & panelAccess are ready
  useEffect(() => {
    if (userAppType && Object.keys(panelAccess).length > 0) {
      setLoading(false);
    }
  }, [userAppType, panelAccess]);

  // Auto-select default tab based on URL and access
  useEffect(() => {
    if (!loading) {
      const accessibleTabs = [];
      if (hasAccess("Past Enquiry")) accessibleTabs.push("PastEnquiry");
      if (hasAccess("Dropped Leads")) accessibleTabs.push("dropped");
      if (hasAccess("Cancelled Bookings")) accessibleTabs.push("cancelled");

      let defaultTab = null;
      if (tabFromURL === "PastEnquiry" && accessibleTabs.includes("PastEnquiry")) defaultTab = "PastEnquiry";
      else if (tabFromURL === "dropped" && accessibleTabs.includes("dropped")) defaultTab = "dropped";
      else if (tabFromURL === "cancelled" && accessibleTabs.includes("cancelled")) defaultTab = "cancelled";
      else defaultTab = accessibleTabs[0] || null;

      setActiveTab(defaultTab);
    }
  }, [tabFromURL, hasAccess, loading]);

  const renderActiveComponent = () => {
    switch (activeTab) {
      case 'PastEnquiry': return <PastEnquiry />;
      case 'dropped': return <DroppedLeads />;
      case 'cancelled': return <CancelledBookings />;
      default: return <p>No access to any tabs</p>;
    }
  };

  const handleTabClick = (tabKey, urlParam) => {
    setActiveTab(tabKey);
    window.history.replaceState(null, "", `?tab=${urlParam}`);
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div className="page-scroller">
      <div className="leads-tab-wrapper">
        <BackButton setActiveTab={setActiveTab} />
        <div>{renderActiveComponent()}</div>
        <div className="tab-buttons">
          {hasAccess("Past Enquiry") && (
            <button
              onClick={() => handleTabClick('PastEnquiry', 'PastEnquiry')}
              className={activeTab === 'PastEnquiry' ? 'active' : ''}
            >
              <span>Enquiry</span>
            </button>
          )}
          {hasAccess("Dropped Leads") && (
            <button
              onClick={() => handleTabClick('dropped', 'dropped')}
              className={activeTab === 'dropped' ? 'active' : ''}
            >
              <span>Leads</span>
            </button>
          )}
          {hasAccess("Cancelled Bookings") && (
            <button
              onClick={() => handleTabClick('cancelled', 'cancelled')}
              className={activeTab === 'cancelled' ? 'active' : ''}
            >
              <span>Bookings</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PastLeadsTabContainer;
