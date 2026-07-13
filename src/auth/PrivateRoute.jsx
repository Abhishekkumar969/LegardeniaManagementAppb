import { Navigate } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../firebaseConfig";

export default function PrivateRoute({ children }) {
    const [user, loading] = useAuthState(auth);


    if (loading )
        return (
            <div
                style={{
                    height: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    textAlign: "center",
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                <img
                    style={{
                        height: "100vh",
                        width: "100vw",
                        objectFit: "cover",
                        position: "absolute",
                        top: 0,
                        left: 0,
                        zIndex: -1,
                    }}
                    src="/assets/1006.jpg"
                    alt="BookStore"
                    className="hero-image"
                />
                <h1
                    style={{
                        fontSize: "2rem",
                        fontWeight: "800",
                        color: "#fff",
                        textTransform: "uppercase",
                        letterSpacing: "2px",
                        textShadow: "0px 0px 20px rgba(255, 0, 128, 0.49), 0px 0px 40px rgba(255, 255, 255, 0.23)",
                        backdropFilter: "blur(3px)",
                        padding: "20px",
                        borderRadius: "10px",
                        zIndex: 2,
                        animation: "fadeIn 1s ease-in-out",
                    }}
                >
                    Book Store
                </h1>
            </div>
        );

    if (!user) return <Navigate to="/login" />;

    return children;
}