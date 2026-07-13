import React, { useState } from 'react';
import FilterComponent from './FilterComponent';
import '../../styles/FilterComponent.css';
import '../../styles/FilterModal.css';

const FilterPopupWrapper = ({ onFilter }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button className="sort-button" onClick={() => setIsOpen(true)}>
                <svg xmlns="http://www.w3.org/2000/svg"
                    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                >
                    <polygon points="3 4 21 4 14 12.5 14 19 10 21 10 12.5 3 4"></polygon>
                </svg>
            </button>

            {isOpen && (
                <div className="filter-modal-overlay" onClick={() => setIsOpen(false)}>
                    <div className="filter-modal-content" onClick={e => e.stopPropagation()}>
                        <div style={{ textAlign: 'right' }}>
                            <button className="close-button" onClick={() => setIsOpen(false)}>✕</button>
                        </div>
                        <FilterComponent onFilter={(filters) => {
                            onFilter(filters);
                            setIsOpen(false);
                        }} />
                    </div>
                </div>
            )}
        </>
    );
};

export default FilterPopupWrapper;
