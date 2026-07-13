import { useEffect, useRef, useState } from "react";
import { getAuth, signOut, onAuthStateChanged } from "firebase/auth";

const IDLE_TIME = 10 * 60 * 1000; // 10 minutes
const WARNING_SECONDS = 10;
const EXPIRY_KEY = "autoLogoutExpiry";

export default function useGlobalAutoLogout() {
    const intervalRef = useRef(null);
    const audioCtxRef = useRef(null);
    const lastBeepSecondRef = useRef(null);
    const [secondsLeft, setSecondsLeft] = useState(null);

    useEffect(() => {
        const auth = getAuth();

        // 🔊 Safe beep (no stacking)
        const beep = () => {
            try {
                if (!audioCtxRef.current) {
                    audioCtxRef.current =
                        new (window.AudioContext || window.webkitAudioContext)();
                }

                const ctx = audioCtxRef.current;

                if (ctx.state === "suspended") {
                    ctx.resume();
                }

                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.frequency.value = 1200;
                gain.gain.value = 0.35;

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start();
                osc.stop(ctx.currentTime + 0.15);
            } catch { }
        };

        const setNewExpiry = () => {
            const expiry = Date.now() + IDLE_TIME;
            localStorage.setItem(EXPIRY_KEY, expiry.toString());
        };

        const clearExpiry = () => {
            localStorage.removeItem(EXPIRY_KEY);
        };

        const logout = async () => {
            clearInterval(intervalRef.current);
            setSecondsLeft(null);
            clearExpiry();
            await signOut(auth);
            window.location.replace("/login");
        };

        const checkExpiry = () => {
            const expiry = Number(localStorage.getItem(EXPIRY_KEY));
            if (!expiry) return;

            const remaining = expiry - Date.now();

            if (remaining <= 0) {
                logout();
                return;
            }

            const sec = Math.ceil(remaining / 1000);

            if (sec <= WARNING_SECONDS) {
                setSecondsLeft(sec);

                // 🔔 beep only in last 5 sec
                if (sec === 5 && lastBeepSecondRef.current !== 5) {
                    lastBeepSecondRef.current = 5;
                    beep();
                }
            } else {
                setSecondsLeft(null);
                lastBeepSecondRef.current = null;
            }
        };

        const onActivity = () => {
            if (document.visibilityState === "visible") {
                setNewExpiry();
                setSecondsLeft(null);
                lastBeepSecondRef.current = null; // important
            }
        };

        const events = [
            "mousemove",
            "mousedown",
            "keydown",
            "touchstart",
            "scroll"
        ];

        let cleanup = () => { };

        const unsub = onAuthStateChanged(auth, (user) => {
            if (!user) {
                clearInterval(intervalRef.current);
                cleanup();
                return;
            }

            // Restore expiry if exists (browser reopen case)
            const existing = localStorage.getItem(EXPIRY_KEY);
            if (!existing) {
                setNewExpiry();
            }

            intervalRef.current = setInterval(checkExpiry, 1000);

            events.forEach(e =>
                window.addEventListener(e, onActivity)
            );

            document.addEventListener("visibilitychange", checkExpiry);

            cleanup = () => {
                events.forEach(e =>
                    window.removeEventListener(e, onActivity)
                );
                document.removeEventListener(
                    "visibilitychange",
                    checkExpiry
                );
            };
        });

        return () => {
            clearInterval(intervalRef.current);
            cleanup();
            unsub();
        };
    }, []);

    return secondsLeft;
}