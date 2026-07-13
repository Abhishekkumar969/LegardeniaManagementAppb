import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";

const checkDuplicateEntry = async (formData, navigate, setToast) => {
  const collectionsToCheck = [
    "enquiry",
    "pastEnquiry",
    "bookingLeads",
    "dropLeads",
    "prebookings",
    "cancelledBookings",
  ];

  const tabMap = {
    enquiry: "enquiry",
    pastEnquiry: "enquiry",
    bookingLeads: "leads",
    dropLeads: "leads",
    prebookings: "bookings",
    cancelledBookings: "bookings",
  };

  const normalize = (v) => {
    if (!v) return "";
    if (typeof v === "object" && v.toDate) {
      return v.toDate().toISOString().split("T")[0].trim().toLowerCase();
    }
    return v.toString().trim().toLowerCase();
  };

  const normalizeMobile = (m) => {
    if (!m) return "";
    return m
      .toString()
      .replace(/\D/g, "") // digits only
      .replace(/^(\+?91|0)+/, "") // remove +91, 91, or 0
      .slice(-10); // keep last 10 digits
  };

  // 🔹 Extract and normalize form mobiles
  const formMob1 = normalizeMobile(formData.mobile1);
  const formMob2 = normalizeMobile(formData.mobile2);

  // 🛑 Early exit — skip check if no valid mobile number
  if (!formMob1 && !formMob2) {
    console.warn("Skipping duplicate check — no mobile numbers provided.");
    return false;
  }

  for (const coll of collectionsToCheck) {
    const snapshot = await getDocs(collection(db, coll));

    for (const monthDoc of snapshot.docs) {
      const data = monthDoc.data();

      for (const [id, record] of Object.entries(data)) {
        if (!record) continue;

        const recMob1 = normalizeMobile(record.mobile1);
        const recMob2 = normalizeMobile(record.mobile2);

        const hasMobileMatch =
          (recMob1 && (recMob1 === formMob1 || recMob1 === formMob2)) ||
          (recMob2 && (recMob2 === formMob1 || recMob2 === formMob2));

        if (!hasMobileMatch) continue;

        const fnDateMatch =
          normalize(record.functionDate) === normalize(formData.functionDate);
        const fnTypeMatch =
          normalize(record.functionType) === normalize(formData.functionType);
        const dayNightMatch =
          normalize(record.dayNight) === normalize(formData.dayNight);

        let venueTypeMatch = true;
        if (coll !== "enquiry") {
          venueTypeMatch =
            normalize(record.venueType) === normalize(formData.venueType);
        }

        if (fnDateMatch && fnTypeMatch && venueTypeMatch && dayNightMatch) {
          const tabParam = tabMap[coll] || "leads";

          setToast(
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                backdropFilter: "blur(10px)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 9999,
              }}
            >
              <div
                style={{
                  backgroundColor: "white",
                  padding: "30px 40px",
                  borderRadius: "12px",
                  boxShadow: "0 0 25px rgba(0,0,0,0.3)",
                  textAlign: "center",
                  color: "#222",
                  maxWidth: "400px",
                }}
              >
                <h3 style={{ marginBottom: "10px", color: "red" }}>⚠️ Duplicate Entry</h3>
                <p style={{ fontSize: "16px", fontWeight: "500" }}>
                  Already saved in <b>{coll}</b>
                </p>

                <button
                  style={{
                    backgroundColor: "#28a745",
                    color: "white",
                    padding: "10px 16px",
                    border: "none",
                    borderRadius: "6px",
                    marginTop: "15px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    navigate(`/leadstabcontainer?tab=${tabParam}`, {
                      state: { leadId: id, collection: coll },
                    })
                  }
                >
                  Go to Record
                </button>
              </div>
            </div>
          );

          setTimeout(() => setToast(null), 8000);
          return true;
        }
      }
    }
  }

  return false;
};

export default checkDuplicateEntry;
