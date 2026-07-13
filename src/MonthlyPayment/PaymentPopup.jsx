import QRCode from "react-qr-code";
import "./PaymentPopup.css";

export default function PaymentPopup({ data, onClose }) {

    const formatIST = (ts) => {
        if (!ts) return "";
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            dateStyle: "medium",
            timeStyle: "short",
        }).format(d);
    };

    const formatINR = (num) => new Intl.NumberFormat("en-IN").format(num);

    const getPayBeforeDate = () => {
        if (!data.enabledAt) return "";
        const enabledDate = data.enabledAt.toDate
            ? data.enabledAt.toDate()
            : new Date(data.enabledAt);

        const payBefore = new Date(enabledDate.getTime() + 48 * 60 * 60 * 1000);
        return formatIST(payBefore);
    };

    const isExpired = () => {
        if (!data.enabledAt) return false;

        const enabledDate = data.enabledAt.toDate
            ? data.enabledAt.toDate()
            : new Date(data.enabledAt);

        const payBefore = new Date(enabledDate.getTime() + 48 * 60 * 60 * 1000);

        return new Date() > payBefore;
    };

    // 🔐 SAFE PARAMS
    const txnId = `TXN${Date.now()}`;
    const name = encodeURIComponent("Abhishek Kumar");
    const note = encodeURIComponent("");

    // ✅ UNIVERSAL QR INTENT (NO MULTILINE)
    const upiIntentUrl =
        `upi://pay?pa=${data.upiId}&pn=${name}&am=${data.amount}&cu=INR&tn=${note}&tr=${txnId}`;

    const whatsappUrl =
        `https://wa.me/919693894812?text=Payment%20done%20for%20₹${formatINR(data.amount)}`;

    return (
        <div className="popup-backdrop">
            <div className="popup-card ticket-v2">
                {!isExpired() && (
                    <button className="close-btn" onClick={onClose}>✕</button>
                )}

                {/* SCROLLABLE CONTENT */}
                <div className="popup-content">

                    {/* HEADER */}
                    <div className="ticket-top">
                        <div className="ticket-title">💳 Payment Ticket</div>
                        <div className="ticket-price">₹ {formatINR(data.amount)}</div>
                    </div>

                    {/* WARNING */}
                    <div className="payment-warning">
                        ⏰ <b>Please pay before</b><br />
                        <span className="pay-before-date">{getPayBeforeDate()}</span>
                    </div>

                    {/* QR */}
                    <div className="ticket-qr">
                        <QRCode value={upiIntentUrl} size={200} />
                    </div>

                    {/* DETAILS */}
                    <div style={{ borderTop: "1px dashed #c6c6c6", marginTop: 10 }}>
                        <div className="ticket-info">
                            <div><b>UPI ID :</b> {data.upiId}</div>
                            <div><b>Account :</b> {data.accountNumber}</div>
                            <div><b>IFSC :</b> {data.ifscCode}</div>
                            <div><b>Enabled At :</b> {formatIST(data.enabledAt)}</div>
                        </div>
                    </div>

                    {/* WHATSAPP */}
                    <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="whatsapp-btn"
                    >
                        WhatsApp Confirmation
                    </a>
                </div>
            </div>
        </div>
    );
}
