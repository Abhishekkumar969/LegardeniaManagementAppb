import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";
import PaymentBar from "../MonthlyPayment/PaymentBar";

export default function AppLayout({ children }) {
    const [appCost, setAppCost] = useState(null);

    useEffect(() => {
        const ref = doc(db, "AppCost", "active");

        const unsub = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                setAppCost(snap.data());
            } else {
                setAppCost(null);
            }
        });

        return () => unsub();
    }, []);

    return (
        <>
            {children}

            <PaymentBar appCost={appCost} />
        </>
    );
}
