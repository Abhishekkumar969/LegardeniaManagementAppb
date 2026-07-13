import useGlobalAutoLogout from "./useGlobalAutoLogout";

export default function AutoLogoutTimer() {
    const secondsLeft = useGlobalAutoLogout();

    if (secondsLeft === null) return null;

    const isCritical = secondsLeft <= 1; // 🔥 more aggressive shake

    return (
        <>
            {/* inline CSS for vibration */}
            <style>
                {`
          @keyframes vibrate {
            0% { transform: translate(0); }
            20% { transform: translate(-0.5px, 0.5px); }
            40% { transform: translate(-0.5px, -0.5px); }
            60% { transform: translate(0.5px, 0.5px); }
            80% { transform: translate(0.5px, -0.5px); }
            100% { transform: translate(0); }
          }

          @keyframes vibrate-strong {
            0% { transform: translate(0); }
            25% { transform: translate(-1px, 1px); }
            50% { transform: translate(1px, -1px); }
            75% { transform: translate(-1px, -1px); }
            100% { transform: translate(0); }
          }
        `}
            </style>

            <div
                style={{
                    position: "fixed",
                    top: 15,
                    right: 15,
                    background: "#fe0000",
                    color: "#fff",
                    padding: "10px 16px",
                    borderRadius: 10,
                    fontWeight: "bold",
                    fontSize: 14,
                    zIndex: 999999,
                    boxShadow: "0 6px 15px rgba(0,0,0,0.3)",
                    animation: isCritical
                        ? "vibrate-strong 0.15s infinite"
                        : "vibrate 0.25s infinite",
                }}
            >
                ⏳ Auto logout in {secondsLeft}s
            </div>
        </>
    );
}
