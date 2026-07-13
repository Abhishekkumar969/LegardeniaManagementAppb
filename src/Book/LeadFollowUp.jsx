import React from 'react';

const LeadFollowUp = ({ form, handleChange }) => (
    <>
        <div className="form-group">
            <label>Win Probability (%)</label>
            <input name="winProbability" placeholder="" onChange={handleChange} value={form.winProbability} />
        </div>

        <div className="form-group">
            <label>Hold Date</label>
            <input name="holdDate" type="date" onChange={handleChange} value={form.holdDate} />
        </div>

        {form.followUpDates.map((date, i) => (
            <div className="form-group" key={i}>
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

export default LeadFollowUp;
