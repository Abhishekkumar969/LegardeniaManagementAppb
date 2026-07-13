import React, { useRef, useEffect, useState } from "react";
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

import styles from "../styles//WhatsappMessage.module.css";
import BackButton from '../components/BackButton';
import BottomNavigationBar from "../components/BottomNavigationBar";

import { getAuth } from "firebase/auth";
import { useNavigate } from 'react-router-dom';

const MESSAGE_TYPES = [
    "Back Balance Amount Request",
    "Advance Amount Request",
    "Enquiry",
    "Lead",
    "Booked",
    "Google Rating"
];

const WhatsappMessage = () => {
    const navigate = useNavigate();
    const [selectedType, setSelectedType] = useState("");
    const [message, setMessage] = useState("");
    const [messages, setMessages] = useState({});
    const [saving, setSaving] = useState(false);
    const textareaRef = useRef(null);
    const [userAppType, setUserAppType] = useState(null);

    useEffect(() => {
        const fetchUserAppType = async () => {
            const auth = getAuth();
            const user = auth.currentUser;
            if (user) {
                try {
                    const userRef = doc(db, 'usersAccess', user.email);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        setUserAppType(data.accessToApp);
                    }
                } catch (err) {
                    console.error("Error fetching user app type:", err);
                }
            }
        };
        fetchUserAppType();
    }, []);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, "whatsappMessages"), snap => {
            const data = {};
            snap.docs.forEach(d => {
                data[d.id] = d.data();
            });
            setMessages(data);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (selectedType && messages[selectedType]) {
            setMessage(messages[selectedType].text || "");
        } else {
            setMessage("");
        }
    }, [selectedType, messages]);

    const PLACEHOLDERS = ["{name}", "{functionDate}", "{dueAmount}"];

    const getTokenAtCursor = (value, cursor) => {
        for (const token of PLACEHOLDERS) {
            const start = value.lastIndexOf(token, cursor);
            const end = start + token.length;

            if (start !== -1) {
                if (cursor > start && cursor < end) {
                    return { token, start, end, position: "inside" };
                }
                if (cursor === end) {
                    return { token, start, end, position: "after" };
                }
            }
        }
        return null;
    };

    const handleKeyDown = (e) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const cursor = textarea.selectionStart;
        const value = message;
        const tokenData = getTokenAtCursor(value, cursor);

        if (!tokenData) return;

        const { start, end, position } = tokenData;

        // 🔥 Case 1: cursor INSIDE token → full block
        if (position === "inside") {
            e.preventDefault();

            if (e.key === "Backspace" || e.key === "Delete") {
                setMessage(value.slice(0, start) + value.slice(end));
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = start;
                }, 0);
            }
            return;
        }

        // 🔥 Case 2: cursor JUST AFTER token
        if (position === "after") {
            if (e.key === "Backspace") {
                e.preventDefault();
                setMessage(value.slice(0, start) + value.slice(end));
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = start;
                }, 0);
            }
            // ✅ typing / space / arrows ALLOWED
        }
    };

    const handlePaste = (e) => {
        const textarea = textareaRef.current;
        const cursor = textarea.selectionStart;
        const tokenData = getTokenAtCursor(message, cursor);

        if (tokenData) {
            e.preventDefault(); // ⛔ paste blocked inside token
        }
    };

    const handleCut = (e) => {
        const textarea = textareaRef.current;
        const cursor = textarea.selectionStart;
        const tokenData = getTokenAtCursor(message, cursor);

        if (tokenData) {
            e.preventDefault();
            setMessage(
                message.slice(0, tokenData.start) +
                message.slice(tokenData.end)
            );
        }
    };

    const insertPlaceholder = (text) => {
        if (!textareaRef.current) return;

        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        const newValue =
            message.substring(0, start) +
            text +
            message.substring(end);

        setMessage(newValue);

        // cursor ko inserted text ke baad le jao
        setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + text.length;
        }, 0);
    };

    const applyFormat = (wrapper) => {
        if (!textareaRef.current) return;

        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        if (start === end) return; // nothing selected

        const selectedText = message.slice(start, end);

        const newText =
            message.slice(0, start) +
            wrapper + selectedText + wrapper +
            message.slice(end);

        setMessage(newText);

        setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = start + wrapper.length;
            textarea.selectionEnd = end + wrapper.length;
        }, 0);
    };

    const handleSave = async () => {
        if (!selectedType) return alert("Pehle type select karo");
        if (!message.trim()) return alert("Message likho");

        setSaving(true);
        try {
            await setDoc(
                doc(db, "whatsappMessages", selectedType),
                {
                    text: message.trim(),
                    type: selectedType,
                    updatedAt: serverTimestamp()
                },
                { merge: true }
            );

            // reset after save
            setSelectedType("");
            setMessage("");
        } catch (err) {
            console.error(err);
            alert("Save failed");
        }
        setSaving(false);
    };

    const handleDelete = async () => {
        if (!selectedType) return;
        if (!window.confirm(`Delete "${selectedType}" message?`)) return;

        try {
            await deleteDoc(doc(db, "whatsappMessages", selectedType));
            setSelectedType("");
            setMessage("");
        } catch (err) {
            console.error(err);
            alert("Delete failed");
        }
    };

    return (
        <div className={styles.container}>
            <BackButton />
            <div style={{ margin: "60px 0px" }}>
                <h2 className={styles.title}>💬 WhatsApp Message Server</h2>

                {/* DROPDOWN */}
                <select
                    value={selectedType}
                    onChange={e => setSelectedType(e.target.value)}
                    className={styles.select}
                >
                    <option value="">-- Select Message Type --</option>
                    {MESSAGE_TYPES.map(type => (
                        <option key={type} value={type}>
                            {type} {messages[type] ? "✔️" : ""}
                        </option>
                    ))}
                </select>

                {/* TEXTAREA */}
                <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onCut={handleCut}
                    rows={6}
                    disabled={!selectedType}
                    className={`${styles.textarea} ${!selectedType ? styles.textareaDisabled : ""}`}
                />

                <div className={styles.placeholderBar}>
                    <span className={styles.placeholderLabel}>Insert:</span>

                    <button
                        type="button"
                        onClick={() => insertPlaceholder("{name}")}
                        className={styles.placeholderBtn}
                    >
                        Name
                    </button>

                    <button
                        type="button"
                        onClick={() => insertPlaceholder("{functionDate}")}
                        className={styles.placeholderBtn}
                    >
                        Function Date
                    </button>

                    <button
                        type="button"
                        onClick={() => insertPlaceholder("{dueAmount}")}
                        className={styles.placeholderBtn}
                    >
                        Due Amount
                    </button>
                </div>

                <div className={styles.formatBar}>
                    <button onClick={() => applyFormat("*")} className={styles.formatBtn}>
                        <b>B</b>
                    </button>

                    <button onClick={() => applyFormat("_")} className={styles.formatBtn}>
                        <i>I</i>
                    </button>

                    <button onClick={() => applyFormat("~")} className={styles.formatBtn}>
                        <s>S</s>
                    </button>

                    <button onClick={() => applyFormat("```")} className={styles.formatBtn}>
                        <span style={{ fontFamily: "monospace" }}>{"</>"}</span>
                    </button>
                </div>

                {/* ACTIONS */}
                <div className={styles.actions}>
                    <button
                        onClick={handleSave}
                        disabled={saving || !selectedType}
                        className={styles.saveBtn}
                    >
                        {saving ? "Saving..." : "Save"}
                    </button>

                    {selectedType && messages[selectedType] && (
                        <button onClick={handleDelete} className={styles.deleteBtn}>
                            Delete
                        </button>
                    )}
                </div>

                <hr className={styles.divider} />

                {/* SAVED LIST */}
                <h3 className={styles.savedTitle}>📜 Saved Message Templates</h3>

                {Object.keys(messages).length === 0 && (
                    <p className={styles.empty}>No messages saved yet</p>
                )}

                <div className={styles.cardList}>
                    {Object.entries(messages).map(([type, data]) => (
                        <div
                            key={type}
                            className={styles.card}
                            onClick={() => {
                                setSelectedType(type);
                                setMessage(data.text || "");
                            }}
                        >
                            <div className={styles.cardTitle}>{type}</div>
                            <div className={styles.cardText}>{data.text}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div style={{ marginBottom: "50px" }}></div>
            <BottomNavigationBar navigate={navigate} userAppType={userAppType} />
        </div>
    );
};

export default WhatsappMessage;