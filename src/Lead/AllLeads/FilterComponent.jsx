import React, { useState } from 'react';
import '../../styles/FilterComponent.css';

const FilterComponent = ({ onFilter }) => {
    const [filters, setFilters] = useState({
        winMin: '',
        winMax: '',
        followUpBefore: '',
        followUpAfter: '',
        contactSearch: '',
        nameSearch: '',
        holdDateFrom: '',
        holdDateTo: '',
        functionDateFrom: '',
        functionDateTo: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const applyFilters = () => {
        onFilter(filters);
    };

    const clearFilters = () => {
        const cleared = {
            winMin: '',
            winMax: '',
            followUpBefore: '',
            followUpAfter: '',
            contactSearch: '',
            nameSearch: '',
            holdDateFrom: '',
            holdDateTo: '',
            functionDateFrom: '',
            functionDateTo: '',
        };
        setFilters(cleared);
        onFilter({});
    };

    return (
        <div className="filter-container" style={{ marginBottom: 20 }}>
            <div>
                <label>
                    Win % Min:
                    <input
                        type="text"
                        inputMode="decimal"
                        name="winMin"
                        value={filters.winMin}
                        onChange={(e) => {
                            let val = e.target.value.replace(/[^0-9.]/g, "");
                            if ((val.match(/\./g) || []).length > 1) val = val.slice(0, -1);
                            if (val !== "" && Number(val) > 100) val = "100";
                            handleChange({ ...e, target: { ...e.target, value: val } });
                        }}
                    />
                </label>
                <label style={{ marginLeft: 10 }}>
                    Win % Max:
                    <input
                        type="text"
                        inputMode="decimal"
                        name="winMax"
                        value={filters.winMax}
                        onChange={(e) => {
                            let val = e.target.value.replace(/[^0-9.]/g, "");
                            if ((val.match(/\./g) || []).length > 1) val = val.slice(0, -1);
                            if (val !== "" && Number(val) > 100) val = "100";
                            handleChange({ ...e, target: { ...e.target, value: val } });
                        }}
                    />
                </label>
            </div>


            <div style={{ marginTop: 10 }}>
                <label>
                    FollowUp Date Before:
                    <input type="date" name="followUpBefore" value={filters.followUpBefore} onChange={handleChange} />
                </label>
                <label style={{ marginLeft: 10 }}>
                    Follow-up Date After:
                    <input type="date" name="followUpAfter" value={filters.followUpAfter} onChange={handleChange} />
                </label>
            </div>

            <div style={{ marginTop: 10 }}>
                <label>
                    Contact Search:
                    <input type="text" name="contactSearch" value={filters.contactSearch} onChange={handleChange} placeholder="Contact" />
                </label>
                <label style={{ marginLeft: 10 }}>
                    Name Search:
                    <input type="text" name="nameSearch" value={filters.nameSearch} onChange={handleChange} placeholder="Customer Name" />
                </label>
            </div>

            <div style={{ marginTop: 10 }}>
                <label>
                    Hold Date From:
                    <input type="date" name="holdDateFrom" value={filters.holdDateFrom} onChange={handleChange} />
                </label>
                <label style={{ marginLeft: 10 }}>
                    Hold Date To:
                    <input type="date" name="holdDateTo" value={filters.holdDateTo} onChange={handleChange} />
                </label>
            </div>

            <div style={{ marginTop: 10 }}>
                <label>
                    Function Date From:
                    <input type="date" name="functionDateFrom" value={filters.functionDateFrom} onChange={handleChange} />
                </label>
                <label style={{ marginLeft: 10 }}>
                    Function Date To:
                    <input type="date" name="functionDateTo" value={filters.functionDateTo} onChange={handleChange} />
                </label>
            </div>

            <div style={{ marginTop: 15 }}>
                <button onClick={applyFilters} style={{ marginRight: 10 }}>Apply</button>
                <button onClick={clearFilters}>Clear</button>
            </div>
        </div>
    );
};

export default FilterComponent;
