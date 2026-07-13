import { useState, useEffect } from 'react';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

import { FaEye, FaEyeSlash, } from "react-icons/fa";

export default function MoonSunLogin() {
    const [isDay, setIsDay] = useState(false);
    const [isNewUser, setIsNewUser] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();
    const auth = getAuth();
    const [errorCode, setErrorCode] = useState("");
    const [accessStatus, setAccessStatus] = useState("");
    const [appType, setAppType] = useState(" ");
    const [showPassword, setShowPassword] = useState(false);
    const [buttonLocked, setButtonLocked] = useState(false);
    const [infoMessage, setInfoMessage] = useState("");

    const currentApp = appType;

    useEffect(() => {
        const timer = setTimeout(() => {
            document.body.focus();
        }, 50);
        return () => clearTimeout(timer);
    }, []);

    const toggleTheme = () => setIsDay(!isDay);
    const toggleMode = () => {
        setError("");
        setIsNewUser(!isNewUser);
    };

    const handleLogin = async (e) => {
        e.preventDefault();

        if (buttonLocked) return;
        setButtonLocked(true);

        setError("");
        setAccessStatus("");

        const trimmedEmail = email.trim().toLowerCase();

        if (!trimmedEmail.includes("@") || !trimmedEmail.includes(".")) {
            setError("⚠️ Please enter a valid email address.");
            setErrorCode("invalid-email");
            setButtonLocked(false);
            return;
        }

        try {
            const userCredential = await signInWithEmailAndPassword(
                auth,
                trimmedEmail,
                password
            );

            const user = userCredential.user;
            await user.getIdToken(true);

            const userDocRef = doc(db, "usersAccess", trimmedEmail);

            const unsubscribe = onSnapshot(userDocRef, async (snapshot) => {
                if (!snapshot.exists()) {
                    setError("❌ Access not granted yet.");
                    await auth.signOut();
                    unsubscribe();
                    setButtonLocked(false);
                    return;
                }

                const userData = snapshot.data();

                if (
                    userData.access === "enable" &&
                    userData.accessToApp === currentApp
                ) {
                    navigate("/");
                    unsubscribe();
                } else {
                    setError("🚫 Contact Admin. Access disabled.");
                    await auth.signOut();
                    unsubscribe();
                    setButtonLocked(false);
                }
            });

        } catch (err) {
            if (err.code === "auth/wrong-password") {
                setError("❌ Incorrect password.");
                setErrorCode("wrong-password");
            } else if (
                err.code === "auth/user-not-found" ||
                err.code === "auth/invalid-credential"
            ) {
                setError("⚠️ " + err.message);
                setErrorCode("general");
            }
            setButtonLocked(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        if (buttonLocked) return; // stop double click
        setButtonLocked(true);

        setInfoMessage("Contact to Admin for Approval");

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log("✅ Logged in user:", user.email);

            // Save request in accessRequests
            await setDoc(doc(db, "accessRequests", email), {
                name,
                email,
                currentApp,
                editData: "disable",
                requestedAt: new Date().toISOString(),
            });

            alert("📝 Request submitted! Please wait for admin approval.");
            await auth.signOut();
            navigate("/");

        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setError("Please enter your email to reset password.");
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            alert("Password reset email sent to " + email);
        } catch (err) {
            console.error("Password reset error:", err);
            setError(err.message);
        }
    };

    return (
        <div style={{
            background: isDay ? 'linear-gradient(180deg,rgba(135, 207, 235, 0.77) 0%, #f0f8ff 100%)' : 'linear-gradient(180deg, #0b0c28 0%, #01010f 100%)',
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 1s ease-in-out', overflow: 'hidden', position: 'relative'
        }}>

            {/* Stars for Night Mode */}
            {!isDay && (
                <>
                    {[...Array(20)].map((_, i) => (
                        <div
                            key={i}
                            style={{
                                position: "absolute",
                                top: `${Math.random() * 100}vh`,
                                left: `${Math.random() * 100}vw`,
                                width: "3px",
                                height: "3px",
                                background: "#fff",
                                borderRadius: "50%",
                                opacity: Math.random(),
                                animation: `twinkle ${2 + Math.random() * 3}s infinite ease-in-out`,
                            }}
                        />
                    ))}
                </>
            )}


            {/* Moon/Sun Toggle */}
            <div onClick={toggleTheme} style={{
                position: 'absolute', top: '40px', right: '40px', width: '80px', height: '80px',
                background: isDay ? 'radial-gradient(circle, #FFD93D, #FDB813)' : 'radial-gradient(circle, #ffffff, #c0c0c0)',
                borderRadius: '50%', boxShadow: isDay ? '0 0 50px rgba(253,184,19,0.6)' : '0 0 30px rgba(255,255,255,0.4)',
                cursor: 'pointer', transition: 'all 0.8s ease', zIndex: 10
            }}></div>

            {/* Glass Card */}
            <div style={{
                background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(25px)',
                borderRadius: '20px', padding: '60px 50px', boxShadow: isDay ? '0 0 40px rgba(255, 223, 110, 0.3)' : '0 0 40px rgba(173, 216, 230, 0.2)',
                width: '420px', textAlign: 'center', border: '1px solid rgba(255, 255, 255, 0.2)', zIndex: 3
            }}>
                <h2 style={{ color: isDay ? '#1E90FF' : '#fff', marginBottom: '30px' }}>
                    {isNewUser ? (isDay ? "<FaSun /> Create Account" : "🌙 Create Account") : (isDay ? "☀️ Login" : "🌙 Login")}
                </h2>

                <form
                    autoComplete="off"
                    onSubmit={isNewUser ? handleRegister : handleLogin}
                    style={{ display: "flex", flexDirection: "column", gap: "20px" }}
                >

                    {/* EDGE autofill trap */}
                    <input
                        type="email"
                        name="edge_fake_email"
                        autoComplete="email"
                        style={{ position: "absolute", opacity: 0, height: 0 }}
                    />
                    <input
                        type="password"
                        name="edge_fake_password"
                        autoComplete="current-password"
                        style={{ position: "absolute", opacity: 0, height: 0 }}
                    />


                    <div>
                        <button type="button" onClick={toggleMode} style={{
                            background: isDay ? "#007bff" : "#4892e1ff",
                            border: "none",
                            color: isDay ? "#ffffffff" : "#ffffffff",
                            cursor: "pointer",
                            fontSize: "15px",
                            fontWeight: "500",
                            float: "right",
                            marginTop: "12px",
                            padding: "5px 10px",
                            borderRadius: "6px",
                            transition: "all 0.3s ease",
                        }}>
                            {isNewUser ? "Old User ? Login" : "New User ? SignUp"}
                        </button>
                    </div>

                    {isNewUser && (
                        <div style={{ position: "relative", width: "100%" }}>
                            <select
                                value={appType}
                                onChange={(e) => setAppType(e.target.value)}
                                style={{
                                    ...inputStyle(isDay),
                                    appearance: "none",
                                    WebkitAppearance: "none",
                                    MozAppearance: "none",
                                    backgroundColor: isDay ? "#ffffffcc" : "#42424266",
                                    padding: "14px",
                                    borderRadius: "12px",
                                    color: isDay ? "#222" : "#fff",
                                    fontSize: "15px",
                                    cursor: "pointer",
                                    width: "100%",
                                    boxShadow: isDay
                                        ? "0 4px 10px rgba(0,0,0,0.1)"
                                        : "0 4px 12px rgba(0,0,0,0.5)",
                                    transition: "all 0.3s ease",
                                    border: 'none'
                                }}
                            >
                                <option style={{ color: 'black' }} value=" ">✨ Choose Role</option>
                                <option style={{ color: 'black' }} value="D">🤝 Partner</option>
                                <option style={{ color: 'black' }} value="B">📊 Manager</option>
                                <option style={{ color: 'black' }} value="I">👩‍💻 Accounts Manager</option>
                                <option style={{ color: 'black' }} value="H">📞 Enquiry Executive</option>
                                <option style={{ color: 'black' }} value="F">💰 Accountant</option>
                                <option style={{ color: 'black' }} value="G">👩‍💻 User</option>
                                <option style={{ color: 'black' }} value="C">📦 Event Manager</option>
                                <option style={{ color: 'black' }} value="E">🎉 Decoration Manager</option>
                                <option style={{ color: 'black' }} value="O">🏛️ Official</option>
                            </select>

                            <div
                                style={{
                                    position: "absolute",
                                    right: "16px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    pointerEvents: "none",
                                    fontSize: "16px",
                                    color: isDay ? "#444" : "#ccc",
                                }}
                            >
                                ▼
                            </div>
                        </div>
                    )}

                    {!isNewUser && (
                        <div style={{ position: "relative", width: "100%" }}>
                            <select
                                value={appType}
                                onChange={(e) => setAppType(e.target.value)}
                                style={{
                                    ...inputStyle(isDay),
                                    appearance: "none",
                                    WebkitAppearance: "none",
                                    MozAppearance: "none",
                                    backgroundColor: isDay ? "#ffffffcc" : "#42424266",
                                    padding: "14px",
                                    borderRadius: "12px",
                                    color: isDay ? "#222" : "#fff",
                                    fontSize: "15px",
                                    cursor: "pointer",
                                    width: "100%",
                                    boxShadow: isDay
                                        ? "0 4px 10px rgba(0,0,0,0.1)"
                                        : "0 4px 12px rgba(0,0,0,0.5)",
                                    transition: "all 0.3s ease",
                                    border: 'none'
                                }}
                            >
                                <option style={{ color: 'black' }} value=" ">✨ Choose Role</option>
                                <option style={{ color: 'black' }} value="A">🛡️ Admin</option>
                                <option style={{ color: 'black' }} value="D">🤝 Partner</option>
                                <option style={{ color: 'black' }} value="B">📊 Manager</option>
                                <option style={{ color: 'black' }} value="I">👩‍💻 Accounts Manager</option>
                                <option style={{ color: 'black' }} value="H">📞 Enquiry Executive</option>
                                <option style={{ color: 'black' }} value="F">💰 Accountant</option>
                                <option style={{ color: 'black' }} value="G">👩‍💻 User</option>
                                <option style={{ color: 'black' }} value="C">📦 Event Manager</option>
                                <option style={{ color: 'black' }} value="E">🎉 Decoration Manager</option>
                                <option style={{ color: 'black' }} value="O">🏛️ Official</option>
                            </select>

                            <div
                                style={{
                                    position: "absolute",
                                    right: "16px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    pointerEvents: "none",
                                    fontSize: "16px",
                                    color: isDay ? "#444" : "#ccc",
                                }}
                            >
                                ▼
                            </div>
                        </div>
                    )}

                    {isNewUser && (
                        <input type="text" placeholder="Your Name" value={name}
                            onChange={(e) =>
                                setName(e.target.value)
                            }
                            required
                            style={inputStyle(isDay)}
                        />
                    )}

                    <input
                        type="text"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            setError("");
                            setErrorCode("");
                        }}
                        style={inputStyle(isDay)}
                        autoComplete="off"
                        inputMode="text"   // 👈 EDGE ke liye
                        spellCheck={false}
                        name="contact_field"
                        data-ms-editor="false"   // 🔥 EDGE specific
                    />

                    <div style={{ position: "relative", width: "100%" }}>
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setError("");
                                setErrorCode("");
                            }}
                            style={{ ...inputStyle(isDay), width: "100%" }}
                            autoComplete="off"        // 👈 NOT new-password (Edge ignores it)
                            name="secret_field"
                            data-ms-editor="false"
                        />

                        <span
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                                position: "absolute",
                                right: "16px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                cursor: "pointer",
                                fontSize: "25px",
                                color: isDay ? "#333" : "#fff",
                                userSelect: "none",
                            }}
                        >
                            {showPassword ? <FaEyeSlash /> : <FaEye />}
                        </span>
                    </div>


                    <button
                        type="submit"
                        disabled={buttonLocked}
                        style={{
                            ...buttonStyle(isDay),
                            background: buttonLocked
                                ? "#b5b5b5"
                                : (isDay
                                    ? 'linear-gradient(135deg, #FFD93D, #FDB813)'
                                    : 'linear-gradient(135deg, #4e54c8, #8f94fb)'
                                ),
                            cursor: buttonLocked ? "not-allowed" : "pointer"
                        }}
                    >
                        {isNewUser ? "✨ Create Account" : "🚀 Login"}
                    </button>

                    {infoMessage && (
                        <div style={{ marginTop: "15px", color: "orange", fontWeight: "600" }}>
                            {infoMessage}
                        </div>
                    )}

                    {error && (
                        <div style={{ color: 'red', fontSize: '14px', display: "none" }}>{error}</div>
                    )}

                    {errorCode && (
                        <div style={{ color: 'orange', fontSize: '13px', display: "none" }}>
                            ⚙️ Error Code: {errorCode}
                        </div>
                    )}

                    {!isNewUser && (
                        <>
                            {accessStatus === "disable" && (
                                <div style={{ color: "red", fontSize: "14px" }}>
                                    🚫 Access is disabled by admin
                                </div>
                            )}
                        </>
                    )}

                    {!isNewUser && (<div>
                        <button
                            type="button"
                            onClick={handleForgotPassword}
                            style={{
                                background: isDay ? "#007bff" : "#001b38ff",
                                border: "none",
                                color: isDay ? "#ffffffff" : "#76bbffff",
                                cursor: "pointer",
                                fontSize: "15px",
                                fontWeight: "500",
                                float: "right",
                                marginTop: "12px",
                                marginRight: "8px",
                                padding: "5px 10px",
                                borderRadius: "6px",
                                transition: "all 0.3s ease",
                            }}
                        >
                            Forgot Password
                        </button>
                    </div>
                    )}

                </form>

            </div>

            <style>   {`
                    @keyframes twinkle {
                        0% { left: -20%; transform: translateY(0); }
                        100% { left: 120%; transform: translateY(0); }
                    }
                        @keyframes skyMove {
                        0% { transform: translateY(0) translateX(0); opacity: 0.4; }
                        50% { transform: translateY(-10px) translateX(5px); opacity: 0.8; }
                        100% { transform: translateY(0) translateX(0); opacity: 0.4; }
                    }
                `}</style>
        </div>
    );
}

const inputStyle = (isDay) => ({
    padding: '16px 20px',
    border: 'none',
    borderRadius: '14px',
    background: isDay ? '#ffffff99' : '#ffffff1a',
    color: isDay ? '#333' : '#fff',
    fontSize: '16px',
    outline: 'none',
    boxShadow: isDay
        ? 'inset 1px 1px 6px #0000001a, inset -1px -1px 6px #ffffffb3'
        : 'inset 1px 1px 8px #ffffff1a, inset -1px -1px 8px #00000066',
    transition: 'all 0.4s ease'
});

const buttonStyle = (isDay) => ({
    width: '100%',
    padding: '16px',
    background: isDay ? 'linear-gradient(135deg, #FFD93D, #FDB813)' : 'linear-gradient(135deg, #4e54c8, #8f94fb)',
    color: '#fff',
    border: 'none',
    borderRadius: '14px',
    fontSize: '18px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 0 20px rgba(143, 148, 251, 0.6)',
    transition: 'all 0.3s ease'
});