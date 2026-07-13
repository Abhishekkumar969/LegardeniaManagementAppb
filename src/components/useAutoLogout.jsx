import { useEffect, useState, useRef } from "react";
import { getAuth, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

const useAutoLogout = (idleTime = 10 * 60 * 1000, warningTime = 10) => {
    const navigate = useNavigate();
    const auth = getAuth();

    const [secondsLeft, setSecondsLeft] = useState(null);
    const audioCtxRef = useRef(null);

    useEffect(() => {
        let idleTimer;
        let countdownTimer;
        let logoutTimer;

        const logout = async () => {
            try {
                await signOut(auth);
                navigate("/");
            } catch (err) {
                console.error("Auto logout error:", err);
            }
        };

        const playBeep = (frequency = 800, duration = 120, volume = 0.15) => {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }

            const ctx = audioCtxRef.current;
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.type = "sine";
            oscillator.frequency.value = frequency;

            gainNode.gain.setValueAtTime(volume, ctx.currentTime);

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.start();
            oscillator.stop(ctx.currentTime + duration / 1000);
        };

        const startCountdown = () => {
            let time = warningTime;
            setSecondsLeft(time);

            const tick = () => {
                time -= 1;
                setSecondsLeft(time);

                if (time > 0) {
                    if (time <= 3) {
                        // 🚨 loud + fast
                        playBeep(1200, 200, 0.35);
                        countdownTimer = setTimeout(tick, 1000); // fast
                    } else {
                        // 🔔 normal
                        playBeep(700, 120, 0.15);
                        countdownTimer = setTimeout(tick, 1000);
                    }
                }
            };

            countdownTimer = setTimeout(tick, 1000);
        };

        const clearAllTimers = () => {
            clearTimeout(idleTimer);
            clearTimeout(logoutTimer);
            clearInterval(countdownTimer);
        };

        const resetTimer = () => {
            clearAllTimers();
            setSecondsLeft(null);

            idleTimer = setTimeout(() => {
                startCountdown();

                logoutTimer = setTimeout(() => {
                    logout();
                }, warningTime * 1000);

            }, idleTime - warningTime * 1000);
        };

        const activityEvents = [
            "mousemove",
            "mousedown",
            "keydown",
            "wheel",
            "touchstart",
            "click",
        ];

        activityEvents.forEach(event =>
            window.addEventListener(event, resetTimer)
        );

        const handleUnload = () => {
            signOut(auth);
        };

        window.addEventListener("beforeunload", handleUnload);

        resetTimer();

        return () => {
            clearAllTimers();
            activityEvents.forEach(event =>
                window.removeEventListener(event, resetTimer)
            );
            window.removeEventListener("beforeunload", handleUnload);
        };
    }, [auth, navigate, idleTime, warningTime]);

    return secondsLeft;
};

export default useAutoLogout;
