import React, { useState, forwardRef, useImperativeHandle } from 'react';

const LeadFollowUp = forwardRef(({ form, handleChange }, ref) => {
    const [winError, setWinError] = useState(false);

    useImperativeHandle(ref, () => ({
        validateFollowUp: () => {
            const isValid = !!form.winProbability;
            setWinError(!isValid);
            return isValid;
        }
    }));

    const handleWinChange = (value) => {
        const fakeEvent = {
            target: {
                name: 'winProbability',
                value
            }
        };
        handleChange(fakeEvent);
    };

    const WIN_MAP = {
        "0-25": { value: 12, color: "#f44336" },
        "25-50": { value: 38, color: "#ff9800" },
        "50-75": { value: 62, color: "#ffeb3b" },
        "75-98": { value: 90, color: "#00bfff" },
        "99-100": { value: 100, color: "#4caf50" }
    };

    const selectedKey = Object.keys(WIN_MAP).find(
        key => WIN_MAP[key].value === form.winProbability
    ) || "";

    return (
        <>
            <div className="form-group">
                <label>Booking Confirmation Probability</label>
                <select
                    onChange={(e) => {
                        const key = e.target.value;
                        handleWinChange(WIN_MAP[key]?.value || "");
                    }}
                    value={selectedKey}
                    style={{
                        backgroundColor: WIN_MAP[selectedKey]?.color || "#fff",
                        color: "black",
                        fontWeight: "bold",
                        border: winError ? "1px solid red" : "1px solid #ccc",
                        padding: "8px",
                        borderRadius: "4px"
                    }}
                >
                    <option value=""></option>
                    <option value="0-25">0 - 25%</option>
                    <option value="25-50">25 - 50%</option>
                    <option value="50-75">50 - 75%</option>
                    <option value="75-98">75 - 98%</option>
                    <option value="99-100">99 - 100%</option>
                </select>
                {winError && <span className="error">Required</span>}
            </div>


            <div className="form-group">
                <label>Hold Date</label>
                <input name="holdDate" type="date" onChange={handleChange} value={form.holdDate} />
            </div>

            {form.followUpDates.map((date, i) => (
                <div className="form-group" key={i} style={{ display: 'none' }}>
                    <label>{`Next Follow Up ${i + 1}`}</label>
                    <input
                        name="followUpDates"
                        type="date"
                        value={date}
                        onChange={(e) => handleChange(e, i)}
                    />
                </div>
            ))}
        </>
    );
});

export default LeadFollowUp;
