import { useState } from "react";
import PaymentPopup from "./PaymentPopup";
import "./PaymentBar.css";

export default function PaymentBar({ appCost }) {
    const [open, setOpen] = useState(true);

    if (!appCost?.isActive || !appCost?.amount) return null;

    const formatINR = (num) => new Intl.NumberFormat("en-IN").format(num);

    return (
        <>
            <div className="payment-bar" onClick={() => setOpen(true)}>
                <span className="pay-amount">₹ {formatINR(appCost.amount)}</span>
                <span className="pay-now">Pay Now</span>
            </div>

            {open && (
                <PaymentPopup
                    data={appCost}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}
