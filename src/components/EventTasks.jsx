import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { CheckCircle2, Circle, Plus, Trash2, Calendar, User, ClipboardList, CheckSquare, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import BackButton from './BackButton';
import styles from '../styles/Inventory.module.css'; // Reusing some shared styles
import tStyles from '../styles/EventTasks.module.css';
import { ArrowLeft } from 'lucide-react';

const EventTasks = () => {
    const [bookings, setBookings] = useState([]);
    const [tasksData, setTasksData] = useState({});
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [newTaskText, setNewTaskText] = useState('');
    const [filterTab, setFilterTab] = useState('UpComing'); // 'UpComing', 'Past', 'All'

    // Fetch all bookings from prebookings collection
    useEffect(() => {
        const prebookingsRef = collection(db, "prebookings");
        const unsubscribe = onSnapshot(prebookingsRef, (snapshot) => {
            const leadsMap = new Map();

            // Get all docs and sort them by ID to ensure consistent de-duplication
            const docs = snapshot.docs.sort((a, b) => a.id.localeCompare(b.id));

            docs.forEach(docSnap => {
                const monthData = docSnap.data();
                Object.entries(monthData).forEach(([id, data]) => {
                    // Only include actual booking objects (must have functionDate)
                    if (data && typeof data === 'object' && data.functionDate) {
                        // Normalize date
                        let normalizedDate = data.functionDate;
                        try {
                            if (normalizedDate && (normalizedDate.includes('/') || !normalizedDate.includes('-'))) {
                                const d = new Date(normalizedDate);
                                normalizedDate = new Intl.DateTimeFormat('en-CA', {
                                    timeZone: 'Asia/Kolkata',
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit'
                                }).format(d);
                            }
                        } catch (e) {
                            console.error("Date normalization error:", e);
                        }

                        // Create a unique signature to detect duplicates even with different database IDs
                        const signature = `${(data.customerName || data.name || '').trim().toLowerCase()}_${normalizedDate}_${(data.functionType || '').trim().toLowerCase()}`;

                        // If we haven't seen this specific event yet, add it
                        if (!leadsMap.has(signature)) {
                            leadsMap.set(signature, { ...data, id, normalizedDate });
                        }
                    }
                });
            });

            const allLeads = Array.from(leadsMap.values());
            // Sort by function date
            const sorted = allLeads.sort((a, b) => new Date(a.functionDate) - new Date(b.functionDate));
            setBookings(sorted);
            setLoading(false);
        });

        // Fetch task statuses
        const tasksRef = collection(db, "eventTasks");
        const unsubTasks = onSnapshot(tasksRef, (snapshot) => {
            let data = {};
            snapshot.forEach(docSnap => {
                data[docSnap.id] = docSnap.data().tasks || [];
            });
            setTasksData(data);
        });

        return () => {
            unsubscribe();
            unsubTasks();
        };
    }, []);

    const filteredBookings = useMemo(() => {
        // Get today's date string in IST (YYYY-MM-DD)
        const todayISTKey = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());

        return bookings.filter(b => {
            const eventKey = b.normalizedDate || b.functionDate;

            let matchesTab = true;
            if (filterTab === 'UpComing') matchesTab = eventKey >= todayISTKey;
            else if (filterTab === 'Past') matchesTab = eventKey < todayISTKey;

            const matchesSearch = (b.customerName || b.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (b.functionType || '').toLowerCase().includes(searchTerm.toLowerCase());
            return matchesTab && matchesSearch;
        }).sort((a, b) => {
            // Sort UpComing ascending, Past descending
            const da = new Date(a.functionDate);
            const db = new Date(b.functionDate);
            return filterTab === 'Past' ? db - da : da - db;
        });
    }, [bookings, searchTerm, filterTab]);

    const handleAddTask = async (e) => {
        e.preventDefault();
        if (!selectedBooking || !newTaskText.trim()) return;

        const bookingId = selectedBooking.id;
        const currentTasks = tasksData[bookingId] || [];
        const newTask = {
            id: Date.now().toString(),
            text: newTaskText.trim(),
            completed: false,
            createdAt: new Date().toISOString()
        };

        const updatedTasks = [...currentTasks, newTask];
        try {
            await setDoc(doc(db, "eventTasks", bookingId), { tasks: updatedTasks }, { merge: true });
            setNewTaskText('');
        } catch (err) {
            console.error("Error adding task:", err);
        }
    };

    const toggleTask = async (bookingId, taskId) => {
        const currentTasks = tasksData[bookingId] || [];
        const updatedTasks = currentTasks.map(t =>
            t.id === taskId ? { ...t, completed: !t.completed } : t
        );
        try {
            await setDoc(doc(db, "eventTasks", bookingId), { tasks: updatedTasks }, { merge: true });
        } catch (err) {
            console.error("Error toggling task:", err);
        }
    };

    const deleteTask = async (bookingId, taskId) => {
        const currentTasks = tasksData[bookingId] || [];
        const updatedTasks = currentTasks.filter(t => t.id !== taskId);
        try {
            await setDoc(doc(db, "eventTasks", bookingId), { tasks: updatedTasks }, { merge: true });
        } catch (err) {
            console.error("Error deleting task:", err);
        }
    };

    const getProgress = (bookingId) => {
        const tasks = tasksData[bookingId] || [];
        if (tasks.length === 0) return 0;
        const completed = tasks.filter(t => t.completed).length;
        return Math.round((completed / tasks.length) * 100);
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Checklist...</div>;

    return (
        <div className={styles['inventory-page']} style={{ background: '#f8fafc', minHeight: '100vh' }}>
            <div className={styles['inventory-header']} style={{ marginBottom: '1.5rem' }}>
                <div className={styles['title-section']}>
                    <BackButton />
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CheckSquare color="var(--primary)" size={32} />
                        Event Checklist
                    </h1>
                </div>
            </div>

            <div className={tStyles.container} style={{ gridTemplateColumns: selectedBooking ? undefined : '1fr' }}>

                {/* Left Panel: Booking List */}
                <div className={`${tStyles.leftPanel} ${selectedBooking ? tStyles.hidden : ''}`}>
                    <div style={{ display: 'flex', gap: '5px', background: '#e2e8f0', padding: '4px', borderRadius: '10px' }}>
                        {['UpComing', 'Past', 'All'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setFilterTab(tab)}
                                style={{
                                    flex: 1,
                                    padding: '8px',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    background: filterTab === tab ? 'white' : 'transparent',
                                    color: filterTab === tab ? '#3b82f6' : '#64748b',
                                    boxShadow: filterTab === tab ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className={styles['search-box']} style={{ width: '100%' }}>
                        <input
                            type="text"
                            placeholder="Search Customer or Event..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className={tStyles.bookingList}>
                        {filteredBookings.map(b => (
                            <motion.div
                                key={b.id}
                                whileHover={{ x: 5 }}
                                onClick={() => setSelectedBooking(b)}
                                style={{
                                    padding: '1rem',
                                    background: selectedBooking?.id === b.id ? '#eff6ff' : 'white',
                                    borderRadius: '12px',
                                    border: selectedBooking?.id === b.id ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>{b.customerName || b.name}</h3>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '10px' }}>
                                        {b.functionType}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#64748b' }}>
                                    <Calendar size={14} /> {b.functionDate}
                                </div>
                                <div style={{ marginTop: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                                        <span>Progress</span>
                                        <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{getProgress(b.id)}%</span>
                                    </div>
                                    <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${getProgress(b.id)}%`, background: '#3b82f6', transition: 'width 0.3s' }}></div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Right Panel: Task List */}
                <AnimatePresence mode="wait">
                    {selectedBooking ? (
                        <motion.div
                            key={selectedBooking.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className={tStyles.rightPanel}
                        >
                            <button
                                className={tStyles.backButtonMobile}
                                onClick={() => setSelectedBooking(null)}
                            >
                                <ArrowLeft size={18} /> Back to Event List
                            </button>

                            <div style={{ background: 'white', borderRadius: '20px', padding: '2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                                <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem' }}>
                                            {selectedBooking.customerName || selectedBooking.name}
                                        </h2>
                                        <div style={{ display: 'flex', gap: '1.5rem', color: '#64748b', fontSize: '0.9rem' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={16} /> {selectedBooking.functionDate}</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={16} /> {selectedBooking.dayNight || 'Event'}</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><User size={16} /> {selectedBooking.mobile1}</span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: '900', color: '#3b82f6' }}>{getProgress(selectedBooking.id)}%</div>
                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Tasks Completed</div>
                                    </div>
                                </div>

                                <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '10px', marginBottom: '2rem' }}>
                                    <input
                                        type="text"
                                        placeholder="Add a new task (e.g., Check Stage Lighting, Call DJ...)"
                                        value={newTaskText}
                                        onChange={(e) => setNewTaskText(e.target.value)}
                                        style={{ flex: 1, padding: '0.85rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }}
                                        onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                                        onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                                    />
                                    <button type="submit" style={{ padding: '0 1.5rem', borderRadius: '12px', background: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
                                        <Plus size={20} /> Add Task
                                    </button>
                                </form>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {(tasksData[selectedBooking.id] || []).length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '4rem 0', color: '#94a3b8' }}>
                                            <ClipboardList size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                                            <p>No tasks added yet for this event.</p>
                                        </div>
                                    ) : (
                                        (tasksData[selectedBooking.id] || []).sort((a, b) => a.completed - b.completed).map(task => (
                                            <motion.div
                                                key={task.id}
                                                layout
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    padding: '1rem',
                                                    background: task.completed ? '#f8fafc' : 'white',
                                                    borderRadius: '12px',
                                                    border: '1px solid #e2e8f0',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <div
                                                    onClick={() => toggleTask(selectedBooking.id, task.id)}
                                                    style={{ cursor: 'pointer', color: task.completed ? '#10b981' : '#cbd5e1' }}
                                                >
                                                    {task.completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                                                </div>
                                                <span style={{ flex: 1, fontSize: '1rem', color: task.completed ? '#94a3b8' : '#1e293b', textDecoration: task.completed ? 'line-through' : 'none' }}>
                                                    {task.text}
                                                </span>
                                                <button
                                                    onClick={() => deleteTask(selectedBooking.id, task.id)}
                                                    style={{ padding: '8px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.6 }}
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </motion.div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <div className={`${tStyles.rightPanel} ${tStyles.hidden}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8', textAlign: 'center' }}>
                            <CheckSquare size={64} style={{ marginBottom: '1.5rem', opacity: 0.2 }} />
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#64748b' }}>Select a booking to manage its checklist</h2>
                            <p>All upcoming events from your booking leads will appear on the left.</p>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default EventTasks;
