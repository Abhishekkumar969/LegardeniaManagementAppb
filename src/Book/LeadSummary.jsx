import React, { useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';

const LeadSummary = forwardRef(({
    selectedMenus,
    customItems = [],
    customMenuCharges = [],
    hallCharges,
    gstBase,
    setGstBase,
    setTotalAmount,
    setGstAmount,
    setGrandTotal,
    totalAmount,
    gstAmount,
    grandTotal,
    meals,
    discount,
    setDiscount,
    commission,
    setCommission
}, ref) => {

    const [manualGst, setManualGst] = React.useState("");
    const [gstMode, setGstMode] = React.useState("auto");

    useImperativeHandle(ref, () => ({
        validateSummary: () => true
    }));

    const validMenus = useMemo(() => {
        return Object.fromEntries(
            Object.entries(selectedMenus || {}).filter(
                ([_, val]) => (val?.rate > 0) && (val?.total > 0)
            )
        );
    }, [selectedMenus]);


    const mealTotal = useMemo(() => {
        if (!meals) return 0;

        return Object.entries(meals)
            .filter(([key]) => key !== "No. of days")
            .reduce((daySum, [_, dayMeals]) => {
                if (!dayMeals || typeof dayMeals !== "object") return daySum;

                const totalForDay = Object.values(dayMeals).reduce((mealSum, meal) => {
                    if (!meal || typeof meal !== "object") return mealSum;
                    return mealSum + (meal.total || 0);
                }, 0);

                return daySum + totalForDay;
            }, 0);
    }, [meals]);

    useEffect(() => {
        const menuTotal = Object.values(validMenus).reduce((sum, item) => sum + (item?.total || 0), 0);
        const customCharges = customItems.reduce((sum, item) => sum + (item.total || 0), 0);
        const menuCharges = customMenuCharges.reduce(
            (sum, item) => sum + parseFloat(item.total || 0),
            0
        );

        const hall = parseFloat(hallCharges || 0);
        const base = parseFloat(gstBase || 0);
        const disc = parseFloat(discount || 0);

        const total = menuTotal + hall + customCharges + mealTotal + menuCharges - disc;
        const gst =
            gstMode === "auto"
                ? base * 0.18
                : parseFloat(manualGst || 0);

        const grand = total + gst;

        setTotalAmount(total);
        setGstAmount(gst);
        setGrandTotal(grand);
    }, [
        validMenus,
        customItems,
        customMenuCharges,
        hallCharges,
        gstBase,
        discount,
        mealTotal,
        setTotalAmount,
        setGstAmount,
        setGrandTotal,
        manualGst,
        gstMode
    ]);

    const formatIndianNumber = (value) => {
        if (value === "" || value === null || value === undefined) return "";

        const str = value.toString();

        // allow typing like "123."
        if (str.endsWith(".")) return str;

        const [intPart, decimalPart] = str.split(".");
        const formattedInt = Number(intPart || 0).toLocaleString("en-IN");

        return decimalPart !== undefined
            ? `${formattedInt}.${decimalPart}`
            : formattedInt;
    };

    return (
        <div>
            {[{ label: "Total Amount", value: totalAmount }].map(({ label, value }, i) => (
                <div className="form-group" key={i}>
                    <label>{label}</label>
                    <input type="text" value={formatIndianNumber(Number(value || 0).toFixed(2))} disabled />
                </div>
            ))}

            <div className="form-group">
                <label>Commission</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={formatIndianNumber(commission || "")}
                    onChange={(e) => {
                        let val = e.target.value.replace(/,/g, "");

                        if (!/^\d*(\.\d{0,2})?$/.test(val)) return;

                        setCommission(val); // ✅ string
                    }}
                />
            </div>

            <div className="form-group">
                <label>Discount</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={formatIndianNumber(discount || "")}
                    onChange={(e) => {
                        let val = e.target.value.replace(/,/g, "");

                        if (!/^\d*(\.\d{0,2})?$/.test(val)) return;

                        setDiscount(val); // ✅ string
                    }}
                />
            </div>

            <div className="form-group">
                <label>GST Applicable Amount</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={formatIndianNumber(gstBase || "")}
                    onChange={(e) => {
                        let val = e.target.value.replace(/,/g, "");

                        if (!/^\d*(\.\d{0,2})?$/.test(val)) return;

                        setGstBase(val);
                        setGstMode("auto");
                        setManualGst("");
                    }}
                />

            </div>

            <div className="form-group">
                <label>GST (18%)</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={
                        gstMode === "manual"
                            ? formatIndianNumber(manualGst || "")
                            : formatIndianNumber((Number(gstBase || 0) * 0.18).toFixed(2))
                    }
                    onChange={(e) => {
                        let val = e.target.value.replace(/,/g, "");

                        if (!/^\d*(\.\d{0,2})?$/.test(val)) return;

                        setGstMode("manual");

                        // ✅ IMPORTANT: empty ko empty hi rehne do
                        if (val === "") {
                            setManualGst("");
                            setGstBase("");
                            return;
                        }

                        setManualGst(val);
                        setGstBase((Number(val) / 0.18).toFixed(2));
                    }}
                />

            </div>

            <div className="form-group">
                <label>Grand Total</label>
                <input type="text" value={formatIndianNumber(Number(grandTotal || 0).toFixed(2))} disabled />
            </div>
        </div>
    );
});

export default LeadSummary;