import React, { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Plus, Search, ArrowUpRight, ArrowDownLeft, Package, History, Edit2, Trash2, X, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';
import BackButton from './BackButton';
import styles from '../styles/Inventory.module.css';

const CATEGORIES = [
    "Kitchen", "Bar", "Housekeeping", "Maintenance", "Front Office",
    "Laundry", "Stationery", "Electrical", "Toiletries", "Others"
];

const UNITS = ["pcs", "kg", "ltr", "pkt", "box", "bundle", "set", "dozen"];

const getMonthYear = (dateInput = new Date()) => {
    const date = new Date(dateInput);
    const options = { month: "long", year: "numeric", timeZone: "Asia/Kolkata" };
    return date.toLocaleString("en-US", options).replace(/\s/g, "");
};

const Inventory = () => {
    const [items, setItems] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('inventory');

    // Search & Filter
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');

    // Modals
    const [showItemModal, setShowItemModal] = useState(false);
    const [showStockModal, setShowStockModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [selectedItemForStock, setSelectedItemForStock] = useState(null);

    // Form State
    const [itemForm, setItemForm] = useState({
        name: '',
        category: 'Others',
        unit: 'pcs',
        minStock: 0,
        initialStock: 0,
        description: ''
    });

    const [stockForm, setStockForm] = useState({
        type: 'OUT', // 'OUT', 'IN' (Return), 'PURCHASE'
        quantity: '',
        remarks: '',
        date: new Date().toISOString().split('T')[0]
    });

    // Real-time Data Sync
    useEffect(() => {
        const monthYear = getMonthYear();
        const docRef = doc(db, "Inventory", monthYear);

        const unsubscribe = onSnapshot(docRef, (snapshot) => {
            if (snapshot.exists()) {
                const allData = snapshot.data();
                const allRecords = Object.entries(allData).map(([id, data]) => ({
                    id,
                    ...data
                }));

                // Split into items and transactions
                const itemsList = allRecords
                    .filter(r => r.type === 'item')
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

                const transList = allRecords
                    .filter(r => r.type === 'transaction')
                    .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

                setItems(itemsList);
                setTransactions(transList.slice(0, 50));
            } else {
                setItems([]);
                setTransactions([]);
            }
            setLoading(false);
        }, (error) => {
            console.error("Inventory sync error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Filtered Items
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [items, searchTerm, selectedCategory]);

    // Stats
    const stats = useMemo(() => {
        const totalItems = items.length;
        const lowStockItems = items.filter(item => item.currentStock <= item.minStock && item.currentStock > 0).length;
        const outOfStockItems = items.filter(item => item.currentStock <= 0).length;

        // Calculate totals from items
        const totalPurchased = items.reduce((acc, item) => acc + (item.totalIn || 0), 0);
        const totalInUse = items.reduce((acc, item) => acc + (item.totalOut || 0), 0);
        const currentTotal = items.reduce((acc, item) => acc + (item.currentStock || 0), 0);

        return { totalItems, lowStockItems, outOfStockItems, totalPurchased, totalInUse, currentTotal };
    }, [items]);

    // Handlers
    const handleSaveItem = async (e) => {
        e.preventDefault();
        try {
            const monthYear = getMonthYear();
            const docRef = doc(db, "Inventory", monthYear);

            if (editingItem) {
                await setDoc(docRef, {
                    [editingItem.id]: {
                        ...editingItem,
                        name: itemForm.name,
                        category: itemForm.category,
                        unit: itemForm.unit,
                        minStock: Number(itemForm.minStock),
                        description: itemForm.description
                    }
                }, { merge: true });
                Swal.fire('Updated!', 'Item details updated successfully.', 'success');
            } else {
                const itemId = "item_" + Date.now();
                const newItem = {
                    type: 'item',
                    id: itemId,
                    name: itemForm.name,
                    category: itemForm.category,
                    unit: itemForm.unit,
                    minStock: Number(itemForm.minStock),
                    currentStock: Number(itemForm.initialStock),
                    totalIn: Number(itemForm.initialStock),
                    totalOut: 0,
                    description: itemForm.description,
                    createdAt: new Date().toISOString()
                };

                const updatePayload = { [itemId]: newItem };

                // Initial transaction if stock > 0
                if (Number(itemForm.initialStock) > 0) {
                    const transId = "trans_" + Date.now();
                    updatePayload[transId] = {
                        type: 'transaction',
                        id: transId,
                        itemId: itemId,
                        itemName: itemForm.name,
                        transactionType: 'PURCHASE',
                        quantity: Number(itemForm.initialStock),
                        remarks: 'Initial Stock',
                        date: new Date().toISOString().split('T')[0],
                        timestamp: { seconds: Math.floor(Date.now() / 1000) }
                    };
                }

                await setDoc(docRef, updatePayload, { merge: true });
                Swal.fire('Added!', 'New item added to inventory.', 'success');
            }
            setShowItemModal(false);
            setEditingItem(null);
            setItemForm({ name: '', category: 'Others', unit: 'pcs', minStock: 0, initialStock: 0, description: '' });
        } catch (error) {
            console.error("Error saving item:", error);
            Swal.fire('Error', 'Failed to save item.', 'error');
        }
    };

    const handleDeleteItem = async (item) => {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: `Do you want to delete ${item.name}? This action cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, delete it!'
        });

        if (result.isConfirmed) {
            try {
                const docRef = doc(db, "Inventory", getMonthYear());
                await setDoc(docRef, {
                    [item.id]: deleteField()
                }, { merge: true });
                Swal.fire('Deleted!', 'Item has been removed.', 'success');
            } catch (error) {
                Swal.fire('Error', 'Failed to delete item.', 'error');
            }
        }
    };

    const handleUpdateStock = async (e) => {
        e.preventDefault();
        if (!selectedItemForStock) return;

        const qty = Number(stockForm.quantity);
        if (isNaN(qty) || qty <= 0) {
            Swal.fire('Invalid Quantity', 'Please enter a valid positive number.', 'warning');
            return;
        }

        if (stockForm.type === 'OUT' && selectedItemForStock.currentStock < qty) {
            Swal.fire('Insufficient Stock', `Only ${selectedItemForStock.currentStock} ${selectedItemForStock.unit} available in house.`, 'error');
            return;
        }

        if (stockForm.type === 'IN' && (selectedItemForStock.totalOut || 0) < qty) {
            Swal.fire('Invalid Return', `Only ${selectedItemForStock.totalOut || 0} ${selectedItemForStock.unit} are currently marked as 'OUT'. You cannot return more than what was given out.`, 'warning');
            return;
        }

        try {
            const currentMonthYear = getMonthYear();
            const docRef = doc(db, "Inventory", currentMonthYear);

            const qty = Number(stockForm.quantity);


            // Update item data locally first to prepare payload
            const updatedItem = { ...selectedItemForStock };
            updatedItem.currentStock = (updatedItem.currentStock || 0) + (stockForm.type === 'OUT' ? -qty : qty);

            if (stockForm.type === 'PURCHASE') {
                updatedItem.totalIn = (updatedItem.totalIn || 0) + qty;
            } else if (stockForm.type === 'OUT') {
                updatedItem.totalOut = (updatedItem.totalOut || 0) + qty;
            } else if (stockForm.type === 'IN') {
                updatedItem.totalOut = (updatedItem.totalOut || 0) - qty;
            } else if (stockForm.type === 'DAMAGE') {
                updatedItem.totalIn = (updatedItem.totalIn || 0) - qty;
            }

            const transId = "trans_" + Date.now();
            const newTransaction = {
                type: 'transaction',
                id: transId,
                itemId: selectedItemForStock.id,
                itemName: selectedItemForStock.name,
                transactionType: stockForm.type,
                quantity: qty,
                remarks: stockForm.remarks,
                date: stockForm.date,
                timestamp: { seconds: Math.floor(Date.now() / 1000) }
            };

            await setDoc(docRef, {
                [selectedItemForStock.id]: updatedItem,
                [transId]: newTransaction
            }, { merge: true });

            const statusMsg = stockForm.type === 'PURCHASE' ? 'added as new stock' :
                stockForm.type === 'IN' ? 'returned to house' :
                    stockForm.type === 'DAMAGE' ? 'marked as DAMAGED/REMOVED' : 'marked as OUT';

            Swal.fire('Success', `Stock ${statusMsg} successfully.`, 'success');
            setShowStockModal(false);
            setStockForm({ type: 'OUT', quantity: '', remarks: '', date: new Date().toISOString().split('T')[0] });
        } catch (error) {
            console.error("Error updating stock:", error);
            Swal.fire('Error', 'Failed to update stock.', 'error');
        }
    };

    const openEditModal = (item) => {
        setEditingItem(item);
        setItemForm({
            name: item.name,
            category: item.category,
            unit: item.unit,
            minStock: item.minStock,
            initialStock: item.currentStock,
            description: item.description || ''
        });
        setShowItemModal(true);
    };

    const openStockModal = (item, type = 'IN') => {
        setSelectedItemForStock(item);
        setStockForm({ ...stockForm, type });
        setShowStockModal(true);
    };

    if (loading) {
        return (
            <div className={styles['inventory-page']} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div className="loader">Loading Inventory...</div>
            </div>
        );
    }

    return (
        <div className={styles['inventory-page']}>
            <div className={styles['inventory-header']}>
                <div className={styles['title-section']}>
                    <BackButton />
                    <h1>Inventory Management</h1>
                </div>

                <div className={styles['actions-section']}>
                    <button className={styles['btn-outline']} onClick={() => setActiveTab(activeTab === 'inventory' ? 'history' : 'inventory')}>
                        {activeTab === 'inventory' ? <History size={18} /> : <Package size={18} />}
                        {activeTab === 'inventory' ? 'View Logs' : 'View Stock'}
                    </button>
                    <button className={styles['btn-primary']} onClick={() => { setEditingItem(null); setShowItemModal(true); }}>
                        <Plus size={18} /> Add New Item
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className={styles['inventory-stats']}>
                <div className={styles['stat-card']}>
                    <div className={`${styles['stat-icon']} ${styles.blue}`}><Package size={24} /></div>
                    <div className={styles['stat-info']}>
                        <span className={styles.label}>Total Items</span>
                        <span className={styles.value}>{stats.totalItems}</span>
                    </div>
                </div>
                <div className={styles['stat-card']}>
                    <div className={`${styles['stat-icon']} ${styles.green}`}><Plus size={24} /></div>
                    <div className={styles['stat-info']}>
                        <span className={styles.label}>Total Purchased</span>
                        <span className={styles.value}>{stats.totalPurchased}</span>
                    </div>
                </div>
                <div className={styles['stat-card']}>
                    <div className={`${styles['stat-icon']} ${styles.red}`}><ArrowUpRight size={24} /></div>
                    <div className={styles['stat-info']}>
                        <span className={styles.label}>Currently OUT</span>
                        <span className={styles.value}>{stats.totalInUse}</span>
                    </div>
                </div>
                <div className={styles['stat-card']}>
                    <div className={`${styles['stat-icon']} ${styles.orange}`}><TrendingUp size={24} /></div>
                    <div className={styles['stat-info']}>
                        <span className={styles.label}>Available In-House</span>
                        <span className={styles.value}>{stats.currentTotal}</span>
                    </div>
                </div>
            </div>

            {activeTab === 'inventory' ? (
                <>
                    {/* Controls */}
                    <div className={styles['inventory-controls']}>
                        <div className={styles['search-box']}>
                            <Search size={18} />
                            <input
                                type="text"
                                placeholder="Search by item name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className={styles['filter-group']}>
                            <select
                                className={styles['filter-select']}
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                            >
                                <option value="All">All Categories</option>
                                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Inventory Table */}
                    <div className={styles['inventory-table-container']}>
                        <div className={styles['inventory-table-wrapper']}>
                            <table className={styles['inventory-table']}>
                                <thead>
                                    <tr>
                                        <th>Item Details</th>
                                        <th>Category</th>
                                        <th style={{ color: 'var(--success)' }}>Purchased</th>
                                        <th style={{ color: 'var(--danger)' }}>Currently OUT</th>
                                        <th style={{ background: '#eff6ff' }}>In-House</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.map((item) => {
                                        const isLow = item.currentStock <= item.minStock && item.currentStock > 0;
                                        const isOut = item.currentStock <= 0;

                                        return (
                                            <tr key={item.id}>
                                                <td>
                                                    <div className={styles['item-name-cell']}>
                                                        <span className={styles.name}>{item.name}</span>
                                                        <span className={styles.category}>{item.description || 'No description'}</span>
                                                    </div>
                                                </td>
                                                <td>{item.category}</td>
                                                <td>
                                                    <span className="text-success" style={{ fontWeight: '600' }}>{item.totalIn || 0}</span>
                                                    <span className="text-secondary" style={{ fontSize: '0.8rem', marginLeft: '4px' }}>{item.unit}</span>
                                                </td>
                                                <td>
                                                    <span className="text-danger" style={{ fontWeight: '600' }}>{item.totalOut || 0}</span>
                                                    <span className="text-secondary" style={{ fontSize: '0.8rem', marginLeft: '4px' }}>{item.unit}</span>
                                                </td>
                                                <td style={{ background: '#f8fafc' }}>
                                                    <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{item.currentStock}</strong>
                                                    <span className="text-secondary" style={{ marginLeft: '4px' }}>{item.unit}</span>
                                                </td>
                                                <td>
                                                    <span className={`${styles['stock-badge']} ${isOut ? styles.out : isLow ? styles.low : styles.high}`}>
                                                        {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className={styles['action-btns']} style={{ justifyContent: 'flex-end' }}>
                                                        <button className={`${styles['action-btn']} ${styles.delete}`} title="Stock OUT (Guest/Laundry)" onClick={() => openStockModal(item, 'OUT')}>
                                                            <ArrowUpRight size={20} />
                                                        </button>
                                                        <button className={`${styles['action-btn']} ${styles.update}`} title="Stock IN (Return)" onClick={() => openStockModal(item, 'IN')}>
                                                            <ArrowDownLeft size={20} />
                                                        </button>
                                                        <button className={`${styles['action-btn']} ${styles.update}`} style={{ background: '#f0fdf4', color: '#10b981' }} title="Purchase/Add New" onClick={() => openStockModal(item, 'PURCHASE')}>
                                                            <Plus size={20} />
                                                        </button>
                                                        <button className={`${styles['action-btn']} ${styles.edit}`} title="Edit Item" onClick={() => openEditModal(item)}>
                                                            <Edit2 size={20} />
                                                        </button>
                                                        <button className={`${styles['action-btn']} ${styles.delete}`} title="Delete Item" onClick={() => handleDeleteItem(item)}>
                                                            <Trash2 size={20} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredItems.length === 0 && (
                                        <tr>
                                            <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                                No items found matching your search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : (
                <div className={styles['inventory-table-container']}>
                    <div style={{ padding: '1.5rem', borderBottom: 'var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>Recent Stock Movements (Last 50)</span>
                        <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '15px' }}><Plus size={12} className="text-success" /> Purchase</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '15px' }}><X size={12} className="text-danger" /> Damage</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '15px' }}><ArrowUpRight size={12} className="text-danger" /> OUT</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '15px' }}><ArrowDownLeft size={12} className="text-info" /> Return</span>
                        </div>
                    </div>

                    <div className={styles['inventory-table-wrapper']}>
                        <table className={styles['inventory-table']}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Item Name</th>
                                    <th>Action</th>
                                    <th>Quantity</th>
                                    <th>Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map(trans => {
                                    const type = trans.transactionType || '';
                                    let badgeClass = '';
                                    let typeLabel = '';
                                    let icon = null;

                                    if (type === 'PURCHASE') {
                                        badgeClass = styles.high;
                                        typeLabel = 'Purchase';
                                        icon = <Plus size={14} />;
                                    } else if (type === 'OUT') {
                                        badgeClass = styles.out;
                                        typeLabel = 'Stock OUT';
                                        icon = <ArrowUpRight size={14} />;
                                    } else if (type === 'IN') {
                                        badgeClass = styles.low;
                                        typeLabel = 'Return (IN)';
                                        icon = <ArrowDownLeft size={14} style={{ color: '#3b82f6' }} />;
                                    } else if (type === 'DAMAGE') {
                                        badgeClass = styles.out;
                                        typeLabel = 'Loss/Damage';
                                        icon = <Trash2 size={14} />;
                                    }

                                    return (
                                        <tr key={trans.id}>
                                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{trans.date}</td>
                                            <td style={{ fontWeight: '600' }}>{trans.itemName}</td>
                                            <td>
                                                <span className={`${styles['stock-badge']} ${badgeClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                    {icon} {typeLabel}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: '700' }}>
                                                <span className={type === 'OUT' || type === 'DAMAGE' ? 'text-danger' : 'text-success'}>
                                                    {type === 'OUT' || type === 'DAMAGE' ? '-' : '+'} {trans.quantity}
                                                </span>
                                            </td>
                                            <td className="text-secondary" style={{ fontSize: '0.85rem' }}>{trans.remarks || '-'}</td>
                                        </tr>
                                    );
                                })}
                                {transactions.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            No transaction history available.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modals */}
            <AnimatePresence>
                {showItemModal && (
                    <div className={styles['modal-overlay']} onClick={() => setShowItemModal(false)}>
                        <motion.div
                            className={styles['modal-container']}
                            onClick={e => e.stopPropagation()}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                        >
                            <div className={styles['modal-header']}>
                                <h2>{editingItem ? 'Edit Item' : 'Add New Item'}</h2>
                                <button className={styles['close-modal']} onClick={() => setShowItemModal(false)}><X /></button>
                            </div>
                            <form onSubmit={handleSaveItem}>
                                <div className={styles['modal-body']}>
                                    <div className={styles['form-group']}>
                                        <label>Item Name</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Bed Sheets King Size"
                                            required
                                            value={itemForm.name}
                                            onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                                        />
                                    </div>
                                    <div className={styles['form-grid']}>
                                        <div className={styles['form-group']}>
                                            <label>Category</label>
                                            <select
                                                value={itemForm.category}
                                                onChange={e => setItemForm({ ...itemForm, category: e.target.value })}
                                            >
                                                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                            </select>
                                        </div>
                                        <div className={styles['form-group']}>
                                            <label>Unit</label>
                                            <select
                                                value={itemForm.unit}
                                                onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}
                                            >
                                                {UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className={styles['form-grid']}>
                                        <div className={styles['form-group']}>
                                            <label>Min. Stock Level</label>
                                            <input
                                                type="number"
                                                required
                                                value={itemForm.minStock}
                                                onChange={e => setItemForm({ ...itemForm, minStock: e.target.value })}
                                            />
                                        </div>
                                        {!editingItem && (
                                            <div className={styles['form-group']}>
                                                <label>Initial Stock</label>
                                                <input
                                                    type="number"
                                                    required
                                                    value={itemForm.initialStock}
                                                    onChange={e => setItemForm({ ...itemForm, initialStock: e.target.value })}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles['form-group']}>
                                        <label>Description (Optional)</label>
                                        <textarea
                                            rows="2"
                                            value={itemForm.description}
                                            onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                                        ></textarea>
                                    </div>
                                </div>
                                <div className={styles['modal-footer']}>
                                    <button type="button" className={styles['btn-outline']} onClick={() => setShowItemModal(false)}>Cancel</button>
                                    <button type="submit" className={styles['btn-primary']}>Save Item</button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}

                {showStockModal && selectedItemForStock && (
                    <div className={styles['modal-overlay']} onClick={() => setShowStockModal(false)}>
                        <motion.div
                            className={styles['modal-container']}
                            onClick={e => e.stopPropagation()}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                        >
                            <div className={styles['modal-header']}>
                                <h2>Stock Update: {selectedItemForStock.name}</h2>
                                <button className={styles['close-modal']} onClick={() => setShowStockModal(false)}><X /></button>
                            </div>
                            <form onSubmit={handleUpdateStock}>
                                <div className={styles['modal-body']}>
                                    <div className={styles['form-grid']}>
                                        <div className={styles['form-group']}>
                                            <label>Transaction Type</label>
                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    className={`${styles['btn-outline']} ${stockForm.type === 'PURCHASE' ? styles['active-success'] : ''}`}
                                                    onClick={() => setStockForm({ ...stockForm, type: 'PURCHASE' })}
                                                >
                                                    Add
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`${styles['btn-outline']} ${stockForm.type === 'DAMAGE' ? styles['active-danger'] : ''}`}
                                                    onClick={() => setStockForm({ ...stockForm, type: 'DAMAGE' })}
                                                >
                                                    Damage
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`${styles['btn-outline']} ${stockForm.type === 'OUT' ? styles['active-danger'] : ''}`}
                                                    onClick={() => setStockForm({ ...stockForm, type: 'OUT' })}
                                                >
                                                    Stock OUT
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`${styles['btn-outline']} ${stockForm.type === 'IN' ? styles['active-info'] : ''}`}
                                                    onClick={() => setStockForm({ ...stockForm, type: 'IN' })}
                                                >
                                                    Stock IN
                                                </button>

                                            </div>
                                        </div>
                                        <div className={styles['form-group']}>
                                            <label>Quantity ({selectedItemForStock.unit})</label>
                                            <input
                                                type="number"
                                                required
                                                value={stockForm.quantity}
                                                onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })}
                                                placeholder="Enter quantity"
                                            />
                                        </div>
                                    </div>
                                    <div className={styles['form-group']}>
                                        <label>Date</label>
                                        <input
                                            type="date"
                                            required
                                            value={stockForm.date}
                                            onChange={e => setStockForm({ ...stockForm, date: e.target.value })}
                                        />
                                    </div>
                                    <div className={styles['form-group']}>
                                        <label>Remarks / Note</label>
                                        <textarea
                                            rows="2"
                                            placeholder="e.g. Monthly refill, Room usage, Damaged, etc."
                                            value={stockForm.remarks}
                                            onChange={e => setStockForm({ ...stockForm, remarks: e.target.value })}
                                        ></textarea>
                                    </div>
                                </div>
                                <div className={styles['modal-footer']}>
                                    <button type="button" className={styles['btn-outline']} onClick={() => setShowStockModal(false)}>Cancel</button>
                                    <button
                                        type="submit"
                                        className={styles['btn-primary']}
                                        style={{ background: stockForm.type === 'PURCHASE' ? 'var(--success)' : stockForm.type === 'IN' ? 'var(--info)' : 'var(--danger)' }}
                                    >
                                        Confirm {stockForm.type === 'PURCHASE' ? 'Purchase' : stockForm.type === 'IN' ? 'Return' : stockForm.type === 'DAMAGE' ? 'Loss/Damage' : 'OUT'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Inventory;