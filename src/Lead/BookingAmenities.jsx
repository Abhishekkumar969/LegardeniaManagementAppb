import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import '../styles/BookingAmenities.css';

const BookingAmenities = ({ selectedItems, setSelectedItems, isEditMode }) => {
    const [defaultAmenities, setDefaultAmenities] = useState([]);
    const [toAddAmenities, setToAddAmenities] = useState([]);
    const [customAmenities, setCustomAmenities] = useState([]);
    const [customItem, setCustomItem] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const hasInitialized = useRef(false);

    const fetchAmenities = useCallback(async () => {
        try {
            const q = query(
                collection(db, "usersAccess"),
                where("accessToApp", "==", "A")
            );
            const snap = await getDocs(q);

            if (!snap.empty) {
                const allDefaultAmenities = [];
                const allToAddAmenities = [];

                snap.forEach(doc => {
                    const data = doc.data();

                    if (Array.isArray(data.amenities)) {
                        allDefaultAmenities.push(...data.amenities);
                    }

                    if (Array.isArray(data.toAddAmenities)) {
                        allToAddAmenities.push(...data.toAddAmenities);
                    }
                });

                setDefaultAmenities([...new Set(allDefaultAmenities)]);
                setToAddAmenities([...new Set(allToAddAmenities)]);
            }
        } catch (error) {
            console.error("Error fetching amenities:", error);
        }
    }, []);

    useEffect(() => {
        if (!isEditMode && defaultAmenities.length > 0 && !hasInitialized.current) {
            setSelectedItems(defaultAmenities);
            hasInitialized.current = true;
        }
    }, [defaultAmenities, isEditMode, setSelectedItems]);

    useEffect(() => {
        fetchAmenities();
    }, [fetchAmenities]);

    useEffect(() => {
        const stored = JSON.parse(localStorage.getItem("customAmenitySuggestions") || "[]");
        setSuggestions(stored);
    }, []);

    const handleCheckboxChange = (item) => {
        setSelectedItems(prev =>
            prev.includes(item)
                ? prev.filter(i => i !== item)
                : [...prev, item]
        );
    };

    const handleAddCustomItem = () => {
        const trimmed = customItem.trim();
        if (!trimmed) return;

        const allExisting = [...defaultAmenities, ...toAddAmenities, ...customAmenities];
        if (!allExisting.includes(trimmed)) {
            const updatedCustoms = [...customAmenities, trimmed];
            setCustomAmenities(updatedCustoms);
            setSelectedItems(prev => [...prev, trimmed]);

            // Save suggestion to localStorage
            const updatedSuggestions = [...new Set([...suggestions, trimmed])];
            setSuggestions(updatedSuggestions);
            localStorage.setItem("customAmenitySuggestions", JSON.stringify(updatedSuggestions));
        }
        setCustomItem('');
    };

    const filteredSuggestions = suggestions.filter(
        sug =>
            sug.toLowerCase().includes(customItem.toLowerCase()) &&
            sug.toLowerCase() !== customItem.toLowerCase()
    );

    const handleSuggestionClick = (sug) => {
        setCustomItem(sug);
    };

    const filteredToAdd = toAddAmenities.filter(item => !defaultAmenities.includes(item));

    const finalAmenities = [
        ...new Set([
            ...defaultAmenities,
            ...filteredToAdd,
            ...customAmenities,
            ...selectedItems   // 🔥 IMPORTANT FIX
        ])
    ];
    
    return (
        <div className="booking-amenities">
            <h4 style={{ marginTop: '40px' }}>Complimentary Booking Amenities</h4>

            {/* Combined amenities list */}
            <ul className="amenities-list">
                {finalAmenities.map((item, index) => (
                    <li key={`amenity-${index}`}>
                        <input
                            type="checkbox"
                            className="amenity-checkbox"
                            checked={selectedItems.includes(item)}
                            onChange={() => handleCheckboxChange(item)}
                        />
                        {item}
                    </li>
                ))}
            </ul>

            {/* Add Custom Amenity Section */}
            <div className="custom-amenity-form">
                <input
                    type="text"
                    value={customItem}
                    onChange={(e) => setCustomItem(e.target.value)}
                    placeholder="Add custom amenity..."
                />
                <button type="button" onClick={handleAddCustomItem}>Add</button>

                {customItem && filteredSuggestions.length > 0 && (
                    <ul className="suggestion-box">
                        {filteredSuggestions.map((sug, index) => (
                            <li key={index} onClick={() => handleSuggestionClick(sug)}>
                                {sug}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default BookingAmenities;
