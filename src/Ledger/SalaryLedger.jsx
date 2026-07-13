import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import BackButton from '../components/BackButton';
import styles from '../styles/SalaryLedger.module.css';

const formatIST = (date) => {
    if (!date) return "";
    const options = { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" };
    return new Date(date).toLocaleString("en-GB", options);
};

const getISTNow = () => {
    const now = new Date();
    // This creates a Date object that behaves like IST in any local environment
    return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

const parseIST = (dateInput) => {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return null;
    // Force interpretation of the date string in IST
    return new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

const getDuration = (startDate, resignedDate = null) => {
    if (!startDate) return "Not Set";
    const start = parseIST(startDate);
    const today = getISTNow();
    const end = (resignedDate && parseIST(resignedDate) < today) ? parseIST(resignedDate) : today;

    if (start > end) return "Future Joiner";

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();

    if (months < 0) {
        years -= 1;
        months += 12;
    }

    if (years === 0 && months === 0) return "Just Joined";
    if (years === 0) return `${months} Months`;
    if (months === 0) return `${years} Years`;
    return `${years}y ${months}m`;
};

const getISODate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const calculateSalaryBreakdown = (salaryHistory, attendanceData = {}, employeeMobile = null, resignedDate = null, employeeNightPayRate = 0) => {
    if (!salaryHistory || salaryHistory.length === 0) return [];

    const sortedHistory = [...salaryHistory].sort((a, b) => parseIST(a.startDate) - parseIST(b.startDate));
    const breakdown = [];
    const now = getISTNow();
    now.setHours(23, 59, 59, 999);

    const resigned = resignedDate ? parseIST(resignedDate) : null;
    if (resigned) resigned.setHours(23, 59, 59, 999);

    const limit = (resigned && resigned < now) ? resigned : now;

    for (let i = 0; i < sortedHistory.length; i++) {
        let periodStart = parseIST(sortedHistory[i].startDate);
        periodStart.setHours(0, 0, 0, 0);
        if (periodStart > limit) continue;

        let nextRevisionDate = null;
        if (i < sortedHistory.length - 1) {
            nextRevisionDate = parseIST(sortedHistory[i + 1].startDate);
            nextRevisionDate.setHours(0, 0, 0, 0);
        }

        let periodEnd = (nextRevisionDate && nextRevisionDate <= limit)
            ? new Date(nextRevisionDate.getTime() - 86400000)
            : limit;
        periodEnd.setHours(23, 59, 59, 999);

        const salary = Number(sortedHistory[i].salary || 0);

        let current = new Date(periodStart);

        while (current <= periodEnd) {
            const year = current.getFullYear();
            const month = current.getMonth();

            const firstOfCurrentMonth = new Date(year, month, 1);
            const lastOfCurrentMonth = new Date(year, month + 1, 0);

            const overlapStart = new Date(Math.max(current.getTime(), firstOfCurrentMonth.getTime()));
            const overlapEnd = new Date(Math.min(periodEnd.getTime(), lastOfCurrentMonth.getTime()));

            const totalDaysInMonth = lastOfCurrentMonth.getDate();

            // Calculate days present based on attendance data
            let daysPresent = 0;
            let pCount = 0, hCount = 0, aCount = 0, nCount = 0;
            const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
            const monthlyAttendance = attendanceData[monthKey] || {};

            let checkDay = new Date(overlapStart);
            while (checkDay <= overlapEnd) {
                const dateStr = getISODate(checkDay);
                const attendanceInfo = monthlyAttendance[dateStr]?.[employeeMobile];

                let status = "";
                let nightStay = false;
                if (typeof attendanceInfo === 'object' && attendanceInfo !== null) {
                    status = attendanceInfo.status;
                    nightStay = attendanceInfo.night;
                } else {
                    status = attendanceInfo;
                }

                if (status === "absent") {
                    aCount++;
                } else if (status === "half-day") {
                    hCount++;
                    daysPresent += 0.5;
                } else {
                    // Default to present if not marked, for backward compatibility
                    pCount++;
                    daysPresent += 1;
                }

                if (nightStay) {
                    nCount++;
                }
                checkDay.setDate(checkDay.getDate() + 1);
            }

            const nightPay = nCount * (employeeNightPayRate || 0);
            const earned = Math.floor((salary / totalDaysInMonth) * daysPresent) + nightPay;

            const existing = breakdown.find(b => b.monthKey === monthKey);
            if (existing) {
                existing.earned += earned;
                existing.days += daysPresent;
                existing.p += pCount;
                existing.h += hCount;
                existing.a += aCount;
                existing.n += nCount;
                existing.nightPay += nightPay;
            } else {
                breakdown.push({
                    monthKey,
                    monthName: firstOfCurrentMonth.toLocaleString('default', { month: 'long', year: 'numeric' }),
                    earned,
                    days: daysPresent,
                    totalDays: totalDaysInMonth,
                    salary,
                    p: pCount,
                    h: hCount,
                    a: aCount,
                    n: nCount,
                    nightPay
                });
            }

            current = new Date(year, month + 1, 1);
        }
    }
    return breakdown;
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
};

const SalaryLedger = () => {
    const [employees, setEmployees] = useState([]);
    const [receipts, setReceipts] = useState([]);
    const [selectedEmp, setSelectedEmp] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showProfileForm, setShowProfileForm] = useState(false);

    const [formMobile, setFormMobile] = useState('');
    const [salaryHistory, setSalaryHistory] = useState([]);
    const [resignedDate, setResignedDate] = useState('');
    const [nightPayRate, setNightPayRate] = useState(0);
    const [attendanceData, setAttendanceData] = useState({});
    const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
    const [attendanceDate, setAttendanceDate] = useState(getISODate(getISTNow()));
    const [tempAttendance, setTempAttendance] = useState({});
    const [isPrintRangeModalOpen, setIsPrintRangeModalOpen] = useState(false);
    const [printSelectedMonth, setPrintSelectedMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
    const [printType, setPrintType] = useState('attendance');
    const [ledgerSelectedMonth, setLedgerSelectedMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);

    useEffect(() => {
        const q = collection(db, "salaryLedger");
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let emps = [];
            snapshot.docs.forEach((docSnap) => {
                emps.push({ id: docSnap.id, ...docSnap.data() });
            });
            setEmployees(emps);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = collection(db, "moneyReceipts");
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let salaryReceipts = [];
            snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data();
                Object.entries(data).forEach(([id, receipt]) => {
                    if (receipt.particularNature === "Salary") {
                        salaryReceipts.push({ id, ...receipt });
                    }
                });
            });
            setReceipts(salaryReceipts);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        // Fetch attendance for selected month and previous 2 months
        const [y, m] = ledgerSelectedMonth.split("-").map(Number);
        const selectedDate = new Date(y, m - 1, 1);

        const monthsToFetch = [];
        for (let i = 0; i < 3; i++) {
            const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - i, 1);
            monthsToFetch.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }

        const unsubscribes = monthsToFetch.map(monthKey => {
            return onSnapshot(doc(db, "staffAttendance", monthKey), (snap) => {
                if (snap.exists()) {
                    setAttendanceData(prev => ({ ...prev, [monthKey]: snap.data() }));
                }
            });
        });

        return () => unsubscribes.forEach(unsub => unsub());
    }, [ledgerSelectedMonth]);

    const combinedData = useMemo(() => {
        const map = new Map();

        employees.forEach(emp => {
            let history = emp.salaryHistory || [];
            if (history.length === 0 && emp.joinDate && emp.monthlySalary) {
                history = [{ startDate: emp.joinDate, salary: emp.monthlySalary }];
            }

            const breakdown = calculateSalaryBreakdown(history, attendanceData, emp.mobileNo, emp.resignedDate, emp.nightPayRate);
            const totalEarned = breakdown.reduce((acc, b) => acc + b.earned, 0);

            const [selYear, selMonth] = ledgerSelectedMonth.split("-").map(Number);
            const currentMonthKey = `${selYear}-${String(selMonth).padStart(2, '0')}`;

            const lastMonthDate = new Date(selYear, selMonth - 2, 1);
            const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

            const currentMonthData = breakdown.find(b => b.monthKey === currentMonthKey);
            const lastMonthData = breakdown.find(b => b.monthKey === lastMonthKey);

            const earnedThisMonth = currentMonthData?.earned || 0;
            const earnedLastMonth = lastMonthData?.earned || 0;
            const nightsThisMonth = currentMonthData?.n || 0;
            const pThisMonth = currentMonthData?.p || 0;
            const hThisMonth = currentMonthData?.h || 0;
            const aThisMonth = currentMonthData?.a || 0;

            map.set(emp.name?.toLowerCase().trim(), {
                ...emp,
                salaryHistory: history,
                receipts: [],
                totalPaid: 0,
                totalEarned,
                earnedThisMonth,
                earnedLastMonth,
                nightsThisMonth,
                pThisMonth,
                hThisMonth,
                aThisMonth,
                breakdown
            });
        });

        receipts.forEach(receipt => {
            const originalName = receipt.subParticularNature || "Unknown";
            const nameKey = originalName.toLowerCase().trim();
            let emp = map.get(nameKey);

            if (!emp) {
                emp = {
                    name: originalName,
                    mobileNo: receipt.mobile || "",
                    salaryHistory: [],
                    receipts: [],
                    totalPaid: 0,
                    totalEarned: 0,
                    earnedThisMonth: 0,
                    breakdown: [],
                    isUnregistered: true
                };
                map.set(nameKey, emp);
            }
            emp.receipts.push(receipt);
            emp.totalPaid += Number(receipt.amount || 0);
        });

        return Array.from(map.values())
            .map(emp => {
                emp.remaining = emp.totalEarned - emp.totalPaid;
                emp.receipts.sort((a, b) => parseIST(b.receiptDate || 0) - parseIST(a.receiptDate || 0));

                const sortedHistory = [...(emp.salaryHistory || [])].sort((a, b) => parseIST(a.startDate) - parseIST(b.startDate));
                emp.currentSalary = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1].salary : 0;
                emp.joinDate = sortedHistory.length > 0 ? sortedHistory[0].startDate : null;

                return emp;
            })
            .filter(emp => emp.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => {
                // First sort by active vs resigned (null resignedDate first)
                if (!a.resignedDate && b.resignedDate) return -1;
                if (a.resignedDate && !b.resignedDate) return 1;
                // Then sort alphabetically by name
                return a.name.localeCompare(b.name);
            });
    }, [employees, receipts, searchTerm, attendanceData, ledgerSelectedMonth]);

    const openEmployeeModal = (emp) => {
        setSelectedEmp(emp);
        setFormMobile(emp.mobileNo || '');
        setResignedDate(emp.resignedDate || '');
        setNightPayRate(emp.nightPayRate || 0);
        setShowProfileForm(false);

        let history = emp.salaryHistory || [];
        if (history.length === 0 && emp.joinDate && emp.monthlySalary) {
            history = [{ startDate: emp.joinDate, salary: emp.monthlySalary }];
        }

        setSalaryHistory(history.length > 0 ? history : [{ startDate: '', salary: '' }]);
        setIsModalOpen(true);
    };

    const handleHistoryChange = (index, field, value) => {
        const newHistory = [...salaryHistory];
        newHistory[index][field] = value;
        setSalaryHistory(newHistory);
    };

    const addHistoryRow = () => {
        setSalaryHistory([...salaryHistory, { startDate: '', salary: '' }]);
    };

    const removeHistoryRow = (index) => {
        const newHistory = [...salaryHistory];
        newHistory.splice(index, 1);
        setSalaryHistory(newHistory);
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        if (!formMobile) {
            alert("Mobile number required!");
            return;
        }

        const validHistory = salaryHistory.filter(h => h.startDate && h.salary);
        if (validHistory.length === 0) {
            alert("At least one revision required!");
            return;
        }

        try {
            const docRef = doc(db, "salaryLedger", formMobile);
            await setDoc(docRef, {
                name: selectedEmp.name,
                mobileNo: formMobile,
                salaryHistory: validHistory.map(h => ({ startDate: h.startDate, salary: Number(h.salary) })),
                joinDate: validHistory[0].startDate,
                monthlySalary: validHistory[validHistory.length - 1].salary,
                resignedDate: resignedDate || null,
                nightPayRate: Number(nightPayRate)
            }, { merge: true });

            // alert("Saved!");
            setShowProfileForm(false);
        } catch (err) {
            console.error("Error:", err);
            alert("Error saving.");
        }
    };

    const handleSaveAttendance = async () => {
        if (!attendanceDate) return;
        const [year, month] = attendanceDate.split("-");
        const monthKey = `${year}-${month}`;

        try {
            const docRef = doc(db, "staffAttendance", monthKey);
            await setDoc(docRef, {
                [attendanceDate]: tempAttendance
            }, { merge: true });
            // alert("Attendance saved!");
            setIsAttendanceModalOpen(false);
        } catch (err) {
            console.error(err);
            alert("Error saving attendance");
        }
    };

    const openAttendanceModal = () => {
        const today = getISODate(getISTNow());
        setAttendanceDate(today);

        const [year, month] = today.split("-");
        const monthKey = `${year}-${month}`;
        const currentMarks = attendanceData[monthKey]?.[today] || {};

        // Initialize tempAttendance with existing marks or empty
        const initialMarks = {};
        combinedData.forEach(emp => {
            if (!emp.isUnregistered) {
                const info = currentMarks[emp.mobileNo];
                if (typeof info === 'object' && info !== null) {
                    initialMarks[emp.mobileNo] = info;
                } else {
                    initialMarks[emp.mobileNo] = { status: info || "present", night: false };
                }
            }
        });
        setTempAttendance(initialMarks);
        setIsAttendanceModalOpen(true);
    };

    const handleAttendanceDateChange = (newDate) => {
        setAttendanceDate(newDate);
        const [year, month] = newDate.split("-");
        const monthKey = `${year}-${month}`;
        const marks = attendanceData[monthKey]?.[newDate] || {};

        const updatedMarks = {};
        combinedData.forEach(emp => {
            if (!emp.isUnregistered) {
                const info = marks[emp.mobileNo];
                if (typeof info === 'object' && info !== null) {
                    updatedMarks[emp.mobileNo] = info;
                } else {
                    updatedMarks[emp.mobileNo] = { status: info || "present", night: false };
                }
            }
        });
        setTempAttendance(updatedMarks);
    };

    const handlePrintLedger = () => {
        if (!selectedEmp) return;
        const content = `
          <html>
            <head>
              <title>Salary Statement - ${selectedEmp.name}</title>
              <style>
                body { font-family: 'Outfit', sans-serif; padding: 50px; color: #1e293b; }
                h1 { font-size: 24px; font-weight: 700; margin-bottom: 30px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; }
                .info { display: flex; justify-content: space-between; margin-bottom: 40px; }
                table { width: 100%; border-collapse: collapse; margin-top: 30px; }
                th { text-align: left; padding: 12px; font-size: 12px; color: #94a3b8; border-bottom: 1px solid #f1f5f9; text-transform: uppercase; }
                td { padding: 12px; border-bottom: 1px solid #f8fafc; font-size: 14px; }
                .summary { margin-top: 40px; text-align: right; font-weight: 700; font-size: 18px; }
                .footer { margin-top: 80px; display: flex; justify-content: space-between; font-size: 14px; color: #94a3b8; }
              </style>
            </head>
            <body>
              <h1>Salary Ledger Statement</h1>
              <div class="info">
                <div><p>Name: ${selectedEmp.name}</p><p>Mobile: ${selectedEmp.mobileNo || 'N/A'}</p></div>
                <div><p>Date: ${formatIST(getISTNow())}</p><p>Monthly: ${formatCurrency(selectedEmp.currentSalary)}</p></div>
              </div>
              <table>
                <thead><tr><th>Date</th><th>Method</th><th>Description</th><th style="text-align: right;">Amount</th></tr></thead>
                <tbody>${selectedEmp.receipts.map(r => `<tr><td>${formatIST(r.receiptDate)}</td><td>${r.mode}</td><td>${r.description || '-'}</td><td style="text-align: right;">${formatCurrency(r.amount)}</td></tr>`).join('')}</tbody>
              </table>

              <h2 style="margin-top: 40px; font-size: 18px;">Earnings Breakdown</h2>
              <table>
                <thead>
                    <tr>
                        <th>Month</th>
                        <th>Salary</th>
                        <th>Attendance</th>
                        <th>Night Stay</th>
                        <th style="text-align: right;">Earned</th>
                    </tr>
                </thead>
                <tbody>
                    ${(selectedEmp.breakdown || []).slice().reverse().map(b => `
                        <tr>
                            <td>${b.monthName}</td>
                            <td>${formatCurrency(b.salary)}</td>
                            <td>${b.days}/${b.totalDays} days</td>
                            <td>${b.n} Nights</td>
                            <td style="text-align: right;">${formatCurrency(b.earned)}</td>
                        </tr>
                    `).join('')}
                </tbody>
              </table>

              <div class="summary">Net Outstanding: ${formatCurrency(Math.abs(selectedEmp.remaining))} (${selectedEmp.remaining > 0 ? 'Payable' : 'Advance'})</div>
              <div class="footer"><p>Employee Signature</p><p>Authorized Signatory</p></div>
            </body>
          </html>
        `;
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        iframe.contentWindow.document.write(content);
        iframe.contentWindow.document.close();
        iframe.onload = () => { iframe.contentWindow.print(); document.body.removeChild(iframe); };
    };

    const handlePrintAllSalary = (monthKey) => {
        if (!monthKey) return;
        const [year, monthNum] = monthKey.split("-");
        const monthName = new Date(year, monthNum - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

        const content = `
            <html>
                <head>
                    <title>Salary & Attendance Report - ${monthName}</title>
                    <style>
                        body { font-family: 'Outfit', sans-serif; padding: 20px; color: #1e293b; line-height: 1.5; }
                        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
                        h1 { color: #235164; margin: 0; font-size: 24px; }
                        h2 { color: #64748b; font-size: 14px; margin: 5px 0 0 0; font-weight: 400; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
                        th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
                        th { background-color: #f8fafc; color: #475569; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; }
                        .text-right { text-align: right; }
                        .badge { padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; margin-right: 2px; }
                        .p { background: #dcfce7; color: #166534; }
                        .h { background: #fef9c3; color: #854d0e; }
                        .a { background: #fee2e2; color: #991b1b; }
                        .footer { margin-top: 40px; display: flex; justify-content: space-between; padding-top: 20px; border-top: 1px solid #e2e8f0; }
                        .sig-line { width: 200px; border-top: 1px solid #94a3b8; text-align: center; padding-top: 5px; font-size: 12px; font-weight: 600; color: #475569; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Staff Salary & Attendance Report</h1>
                        <h2>Month: ${monthName}</h2>
                        <h2>Generated: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })}</h2>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>S.No</th>
                                <th>Employee Name</th>
                                <th>Attendance (P/H/A-N)</th>
                                <th class="text-right">Monthly Salary</th>
                                <th class="text-right">Advance</th>
                                <th class="text-right">Net Pay</th>
                            </tr>
                        </thead>
                        <tbody>
                             ${combinedData.filter(e => !e.isUnregistered).map((emp, idx) => {
            const targetMonthData = emp.breakdown?.find(b => b.monthKey === monthKey);
            const attendanceStr = targetMonthData ? `
                                     <span class="badge p">${targetMonthData.p}P</span>
                                     <span class="badge h">${targetMonthData.h}H</span>
                                     <span class="badge a">${targetMonthData.a}A</span>
                                     <span class="badge n" style="background: #e0f2fe; color: #0369a1;">${targetMonthData.n}N</span>
                                 ` : 'N/A';

            const earned = targetMonthData?.earned || 0;

            return `
                                     <tr>
                                         <td>${idx + 1}</td>
                                         <td>${emp.name}</td>
                                         <td>${attendanceStr}</td>
                                         <td class="text-right">${formatCurrency(emp.currentSalary)}</td>
                                         <td class="text-right">${emp.remaining < 0 ? formatCurrency(Math.abs(emp.remaining)) : '₹0'}</td>
                                         <td class="text-right">${formatCurrency(earned)}</td>
                                     </tr>
                                 `;
        }).join('')}
                        </tbody>
                    </table>
                    <div class="footer">
                        <div class="sig-line">Manager Signature</div>
                        <div class="sig-line">Authorized Signatory</div>
                    </div>
                </body>
            </html>
        `;
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        iframe.contentWindow.document.write(content);
        iframe.contentWindow.document.close();
        iframe.onload = () => { iframe.contentWindow.print(); document.body.removeChild(iframe); };
        setIsPrintRangeModalOpen(false);
    };

    const handlePrintAttendanceSheet = (monthKey) => {
        if (!monthKey) return;
        const [year, month] = monthKey.split("-").map(Number);
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);

        const days = [];
        let curr = new Date(start);
        while (curr <= end) {
            days.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }

        const monthName = start.toLocaleString('default', { month: 'long', year: 'numeric' });

        const content = `
            <html>
                <head>
                    <title>Attendance Sheet - ${monthName}</title>
                    <style>
                        @page { size: landscape; margin: 10mm; }
                        body { font-family: 'Outfit', sans-serif; font-size: 10px; color: #1e293b; margin: 0; padding: 0; }
                        h1 { font-size: 18px; text-align: center; margin-bottom: 5px; color: #235164; }
                        h2 { font-size: 12px; text-align: center; margin-bottom: 15px; color: #64748b; font-weight: 400; }
                        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                        th, td { border: 1px solid #e2e8f0; text-align: center; padding: 4px 2px; overflow: hidden; }
                        th { background: #f1f5f9; color: #475569; font-size: 8px; }
                        .name-col { width: 120px; text-align: left; padding-left: 5px; font-weight: 600; font-size: 9px; }
                        .day-col { width: 22px; }
                        .stat-col { width: 30px; font-weight: bold; background: #f8fafc; }
                        .p { color: #16a34a; }
                        .h { color: #854d0e; }
                        .a { color: #dc2626; }
                        .n { font-size: 8px; }
                        .footer { margin-top: 20px; display: flex; justify-content: space-between; padding: 0 20px; font-weight: 600; }
                    </style>
                </head>
                <body>
                    <h1>Attendance Register - ${monthName}</h1>
                    <h2>Generated on: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })}</h2>
                    <table>
                        <thead>
                            <tr>
                                <th class="name-col">Staff Name</th>
                                ${days.map(d => `<th class="day-col">${d.getDate()}</th>`).join('')}
                                <th class="stat-col">P</th>
                                <th class="stat-col">H</th>
                                <th class="stat-col">A</th>
                                <th class="stat-col">N</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${combinedData.filter(e => !e.isUnregistered).map(emp => {
            const stats = { p: 0, h: 0, a: 0, n: 0 };
            const daysHtml = days.map(d => {
                const dYear = d.getFullYear();
                const dMonthKey = `${dYear}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const dateStr = getISODate(d);
                const info = attendanceData[dMonthKey]?.[dateStr]?.[emp.mobileNo];

                let status = "";
                let night = false;
                if (typeof info === 'object' && info !== null) {
                    status = info.status;
                    night = info.night;
                } else {
                    status = info || "";
                }

                if (status === "present") { stats.p++; return '<span class="p">P</span>' + (night ? '<br><span class="n">🌙</span>' : ''); }
                if (status === "half-day") { stats.h++; return '<span class="h">H</span>' + (night ? '<br><span class="n">🌙</span>' : ''); }
                if (status === "absent") { stats.a++; return '<span class="a">A</span>'; }
                return "";
            }).map(h => `<td class="day-col">${h}</td>`).join('');

            // Night stays for the month
            days.forEach(d => {
                const dYear = d.getFullYear();
                const dMonthKey = `${dYear}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const dateStr = getISODate(d);
                if (attendanceData[dMonthKey]?.[dateStr]?.[emp.mobileNo]?.night) stats.n++;
            });

            return `
                                    <tr>
                                        <td class="name-col">${emp.name}</td>
                                        ${daysHtml}
                                        <td class="stat-col">${stats.p}</td>
                                        <td class="stat-col">${stats.h}</td>
                                        <td class="stat-col">${stats.a}</td>
                                        <td class="stat-col">${stats.n}</td>
                                    </tr>
                                `;
        }).join('')}
                        </tbody>
                    </table>
                    <div class="footer">
                        <span>Manager Signature</span>
                        <span>Authorized Signatory</span>
                    </div>
                </body>
            </html>
        `;
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        iframe.contentWindow.document.write(content);
        iframe.contentWindow.document.close();
        iframe.onload = () => { iframe.contentWindow.print(); document.body.removeChild(iframe); };
        setIsPrintRangeModalOpen(false);
    };

    return (
        <div className={styles['salary-ledger-page']}>
            <div className={styles['header-container']}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <BackButton />
                    <h1 className={`${styles['page-title']} ${styles['text-primary-theme']}`}>Salary Ledger</h1>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        className={styles['btn-vibrant']}
                        onClick={() => { setPrintType('attendance'); setIsPrintRangeModalOpen(true); }}
                        style={{ background: '#6366f1', color: 'white' }}
                    >
                        Print Attendance Sheet 📋
                    </button>
                    <button
                        className={styles['btn-vibrant']}
                        onClick={() => { setPrintType('salary'); setIsPrintRangeModalOpen(true); }}
                        style={{ background: 'var(--primary)', color: 'white' }}
                    >
                        Print All Staff Report 🖨️
                    </button>
                </div>
            </div>

            <div className={styles['controls-container']}>
                <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
                    <input
                        type="text"
                        className={styles['search-input']}
                        placeholder="Search staff..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <div className={styles['form-group']} style={{ width: '200px' }}>
                        <input
                            type="month"
                            value={ledgerSelectedMonth}
                            onChange={(e) => setLedgerSelectedMonth(e.target.value)}
                            style={{ height: '45px', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '0 1rem' }}
                        />
                    </div>
                </div>
                <div className={styles['stats-bar']}>
                    <div className={styles['stat-box']}>
                        <span className={styles['stat-label']}>Active Staff</span>
                        <div className={`${styles['stat-value']} ${styles['text-primary-theme']}`}>{combinedData.filter(e => !e.isUnregistered).length}</div>
                    </div>
                    <div className={styles['stat-box']} style={{ cursor: 'pointer', background: '#e0f2fe' }} onClick={openAttendanceModal}>
                        <span className={styles['stat-label']}>Daily Attendance</span>
                        <div className={`${styles['stat-value']} ${styles['text-primary-theme']}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>Mark Now</span>
                            <span style={{ fontSize: '1.2rem' }}>📝</span>
                        </div>
                    </div>
                    <div className={styles['stat-box']}>
                        <span className={styles['stat-label']}>Total Payouts</span>
                        <div className={`${styles['stat-value']} ${styles['text-success']}`}>{formatCurrency(combinedData.reduce((acc, curr) => acc + curr.totalPaid, 0))}</div>
                    </div>
                    <div className={styles['stat-box']}>
                        <span className={styles['stat-label']}>Outstanding</span>
                        <div className={`${styles['stat-value']} ${styles['text-danger']}`}>{formatCurrency(combinedData.reduce((acc, curr) => acc + curr.remaining, 0))}</div>
                    </div>
                </div>
            </div>

            <div className={styles['ledger-list']}>
                <div className={styles['list-header']}>
                    <span>S.No</span>
                    <span>Employee Name</span>
                    <span>Monthly Salary</span>
                    <span>Attendance (P/H/A/N)</span>
                    <span>Advance</span>
                    <span>Payable {(() => {
                        const [y, m] = ledgerSelectedMonth.split("-").map(Number);
                        return new Date(y, m - 2, 1).toLocaleString('default', { month: 'short' });
                    })()}</span>
                    <span>Payable {(() => {
                        const [y, m] = ledgerSelectedMonth.split("-").map(Number);
                        return new Date(y, m - 1, 1).toLocaleString('default', { month: 'short' });
                    })()}</span>
                    <span>Net Pay</span>
                </div>
                {combinedData.map((emp, idx) => (
                    <div key={idx} className={styles['list-row']} onClick={() => openEmployeeModal(emp)}>
                        <div className={styles['row-data']} style={{ fontWeight: '600', color: '#94a3b8' }}>
                            {combinedData.length - idx}
                        </div>
                        <div className={styles['row-name']}>
                            <div>
                                <div className={styles['emp-name']}>{emp.name}</div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span className={styles['emp-duration']}>{getDuration(emp.joinDate, emp.resignedDate)}</span>
                                    {emp.resignedDate && (
                                        <span className={styles.badge} style={{ background: '#fee2e2', color: '#dc2626', fontSize: '10px', padding: '2px 6px' }}>Resigned</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className={styles['row-data']}>{formatCurrency(emp.currentSalary)}</div>
                        <div className={styles['row-data']} style={{ fontSize: '0.8rem', fontWeight: '600' }}>
                            <span style={{ color: 'var(--present)' }}>{emp.pThisMonth}P</span>
                            <span style={{ color: '#854d0e', marginLeft: '4px' }}>{emp.hThisMonth}H</span>
                            <span style={{ color: 'var(--absent)', marginLeft: '4px' }}>{emp.aThisMonth}A</span>
                            <span style={{ color: '#6366f1', marginLeft: '4px' }}>{emp.nightsThisMonth}N</span>
                        </div>
                        <div className={styles['row-data']} style={{ color: 'var(--absent)' }}>
                            {emp.remaining < 0 ? formatCurrency(Math.abs(emp.remaining)) : '₹0'}
                        </div>
                        <div className={styles['row-data']} style={{ color: 'var(--text-secondary)' }}>{formatCurrency(emp.earnedLastMonth)}</div>
                        <div className={styles['row-data']} style={{ color: 'var(--present)' }}>{formatCurrency(emp.earnedThisMonth)}</div>
                        <div className={styles['row-data']} style={{
                            color: emp.remaining > 0 ? 'var(--absent)' : 'var(--present)',
                            fontWeight: 'bold'
                        }}>
                            {formatCurrency(Math.abs(emp.remaining))}
                            <span style={{ fontSize: '0.7rem', marginLeft: '4px' }}>
                                ({emp.remaining > 0 ? 'Payable' : 'Adv'})
                            </span>
                        </div>
                    </div>
                ))}
                {combinedData.length === 0 && <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No staff found.</div>}
            </div>

            {isModalOpen && selectedEmp && (
                <div className={styles['modal-overlay']} onClick={() => setIsModalOpen(false)}>
                    <div className={styles['modal-content']} onClick={e => e.stopPropagation()}>
                        <div className={styles['modal-header-colorful']}>
                            <div className={styles['header-left']}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <h2 className={styles['text-primary-theme']}>{selectedEmp.name}</h2>
                                    {selectedEmp.resignedDate && (
                                        <span className={styles.badge} style={{ background: '#fee2e2', color: '#dc2626', fontSize: '12px', padding: '4px 10px' }}>Resigned on {formatIST(selectedEmp.resignedDate)}</span>
                                    )}
                                </div>
                                <div className="header-btns" style={{ display: 'flex', gap: '1rem', margin: '0px 1rem' }}>
                                    <button className={styles['btn-vibrant']} onClick={() => { setShowProfileForm(!showProfileForm); }}>
                                        {showProfileForm ? 'Close Profile' : 'Edit Profile'}
                                    </button>
                                    <button className={styles['btn-vibrant']} onClick={handlePrintLedger}>
                                        Print Statement
                                    </button>
                                </div>
                            </div>
                            <button className={styles['btn-close-modal']} onClick={() => setIsModalOpen(false)}>&times;</button>
                        </div>

                        <div className={styles['modal-body']}>
                            {showProfileForm && (
                                <div className={styles['profile-card']}>
                                    <form onSubmit={handleSaveProfile}>
                                        <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
                                            <div className={styles['form-group']} style={{ flex: 1 }}>
                                                <label className={styles['text-muted']}>Mobile Number</label>
                                                <input type="text" value={formMobile} onChange={e => setFormMobile(e.target.value)} required style={{ width: '100%' }} />
                                            </div>
                                            <div className={styles['form-group']} style={{ flex: 1 }}>
                                                <label className={styles['text-muted']}>Resigned Date (Optional)</label>
                                                <input type="date" value={resignedDate} onChange={e => setResignedDate(e.target.value)} style={{ width: '100%' }} />
                                            </div>
                                            <div className={styles['form-group']} style={{ flex: 1 }}>
                                                <label className={styles['text-muted']}>Night Pay Rate (per night)</label>
                                                <input type="number" value={nightPayRate} onChange={e => setNightPayRate(e.target.value)} style={{ width: '100%' }} />
                                            </div>
                                        </div>
                                        <h3 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', fontWeight: '700' }} className={styles['text-primary-theme']}>Salary Revision History</h3>
                                        {salaryHistory.map((row, index) => (
                                            <div key={index} className={styles['history-item-card']}>
                                                <div style={{ display: 'flex', gap: '2rem' }}>
                                                    <div className={styles['form-group']} style={{ flex: 1 }}>
                                                        <label className={styles['text-muted']}>Effective Date</label>
                                                        <input type="date" value={row.startDate} onChange={e => handleHistoryChange(index, 'startDate', e.target.value)} required style={{ width: '100%' }} />
                                                    </div>
                                                    <div className={styles['form-group']} style={{ flex: 1 }}>
                                                        <label className={styles['text-muted']}>Monthly Salary (₹)</label>
                                                        <input type="number" value={row.salary} onChange={e => handleHistoryChange(index, 'salary', e.target.value)} required style={{ width: '100%' }} />
                                                    </div>
                                                </div>
                                                {salaryHistory.length > 1 && (
                                                    <button type="button" onClick={() => removeHistoryRow(index)} style={{ marginTop: '1.5rem', color: 'var(--danger)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: '600' }}>Remove</button>
                                                )}
                                            </div>
                                        ))}
                                        <button type="button" className={styles['btn-vibrant']} style={{ width: '100%', marginBottom: '1rem', background: 'white', color: 'var(--primary)' }} onClick={addHistoryRow}>+ Add New Period</button>
                                        <button type="submit" className={styles['btn-vibrant']} style={{ width: '100%', background: '#63cbf1', color: 'white' }}>Save Changes</button>
                                    </form>
                                </div>
                            )}

                            <div className="payment-history-section" style={{ marginTop: '0px' }}>
                                <h3 className={styles['text-primary-theme']} style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '700' }}>Payment History</h3>
                                <div className={styles['table-wrapper']}>
                                    <table className={styles['custom-table']}>
                                        <thead><tr><th>Date</th><th>Method</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                                        <tbody>
                                            {selectedEmp.receipts.map(r => (
                                                <tr key={r.id}>
                                                    <td>{formatIST(r.receiptDate)}</td>
                                                    <td>{r.mode}</td>
                                                    <td className={styles['text-muted']} style={{ fontSize: '0.9rem' }}>{r.description || '-'}</td>
                                                    <td className={styles['text-success']} style={{ fontWeight: '700', textAlign: 'right' }}>{formatCurrency(r.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {selectedEmp.receipts.length === 0 && <div className={`${styles['no-data']} ${styles['text-muted']}`} style={{ padding: '2rem', textAlign: 'center' }}>No payment history found.</div>}
                                </div>
                            </div>

                            <div className="breakdown-section" style={{ marginTop: '15px' }}>
                                <h3 className={styles['text-primary-theme']} style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: '700' }}>Earnings Breakdown</h3>
                                <div className={styles['table-wrapper']}>
                                    <table className={`${styles['custom-table']} ${styles['breakdown-table']}`}>
                                        <thead>
                                            <tr>
                                                <th>Month</th>
                                                <th>Base Salary</th>
                                                <th>Attendance</th>
                                                <th>Night Stay</th>
                                                <th style={{ textAlign: 'right' }}>Earned Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(selectedEmp.breakdown || []).slice().reverse().map((b, i) => (
                                                <tr key={i}>
                                                    <td>{b.monthName}</td>
                                                    <td className={styles['text-muted']}>{formatCurrency(b.salary)}</td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <span>{b.days}/{b.totalDays} days</span>
                                                            <div className={styles['attendance-summary']}>
                                                                <span className={`${styles.badge} ${styles.p}`} title="Present">{b.p}P</span>
                                                                <span className={`${styles.badge} ${styles.h}`} title="Half-day">{b.h}H</span>
                                                                <span className={`${styles.badge} ${styles.a}`} title="Absent">{b.a}A</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <span>{b.n} Nights</span>
                                                            <span className={styles['text-muted']} style={{ fontSize: '0.8rem' }}>{formatCurrency(b.nightPay)}</span>
                                                        </div>
                                                    </td>
                                                    <td className={styles['text-primary-theme']} style={{ fontWeight: '700', textAlign: 'right' }}>
                                                        {formatCurrency(b.earned)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {isAttendanceModalOpen && (
                <div className={styles['modal-overlay']} onClick={() => setIsAttendanceModalOpen(false)}>
                    <div className={styles['modal-content']} style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <div className={styles['modal-header-colorful']}>
                            <h2 className={styles['text-primary-theme']}>Mark Attendance</h2>
                            <button className={styles['btn-close-modal']} onClick={() => setIsAttendanceModalOpen(false)}>&times;</button>
                        </div>
                        <div className={styles['modal-body']}>
                            <div className={styles['attendance-controls']}>
                                <div className={styles['form-group']}>
                                    <label>Date</label>
                                    <input
                                        type="date"
                                        value={attendanceDate}
                                        max={getISODate(getISTNow())}
                                        onChange={e => handleAttendanceDateChange(e.target.value)}
                                    />
                                </div>
                                <button className={styles['btn-vibrant']} onClick={handleSaveAttendance} style={{ background: 'var(--present)', color: 'white', border: 'none' }}>
                                    Save Attendance
                                </button>
                            </div>

                            <div className={styles['attendance-list']}>
                                <div className={styles['attendance-row']} style={{ background: 'var(--color-blue)', fontWeight: '800', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>
                                    <div className={styles['attendance-name']}>Staff Name</div>
                                    <div className={styles['toggle-group']}>
                                        <div style={{ width: '40px', textAlign: 'center' }}>P</div>
                                        <div style={{ width: '40px', textAlign: 'center' }}>H</div>
                                        <div style={{ width: '40px', textAlign: 'center' }}>A</div>
                                        <div style={{ width: '40px', textAlign: 'center' }}>Night</div>
                                    </div>
                                </div>
                                {combinedData.filter(emp => !emp.isUnregistered && (!emp.resignedDate || parseIST(emp.resignedDate) >= parseIST(attendanceDate))).map(emp => (
                                    <div key={emp.mobileNo} className={styles['attendance-row']}>
                                        <div className={styles['attendance-name']}>{emp.name}</div>
                                        <div className={styles['toggle-group']}>
                                            <button
                                                className={`${styles['toggle-btn']} ${tempAttendance[emp.mobileNo]?.status === 'present' ? `${styles.active} ${styles.p}` : ''}`}
                                                onClick={() => setTempAttendance({ ...tempAttendance, [emp.mobileNo]: { ...tempAttendance[emp.mobileNo], status: 'present' } })}
                                            >
                                                P
                                            </button>
                                            <button
                                                className={`${styles['toggle-btn']} ${tempAttendance[emp.mobileNo]?.status === 'half-day' ? `${styles.active} ${styles.h}` : ''}`}
                                                onClick={() => setTempAttendance({ ...tempAttendance, [emp.mobileNo]: { ...tempAttendance[emp.mobileNo], status: 'half-day' } })}
                                            >
                                                H
                                            </button>
                                            <button
                                                className={`${styles['toggle-btn']} ${tempAttendance[emp.mobileNo]?.status === 'absent' ? `${styles.active} ${styles.a}` : ''}`}
                                                onClick={() => setTempAttendance({ ...tempAttendance, [emp.mobileNo]: { ...tempAttendance[emp.mobileNo], status: 'absent' } })}
                                            >
                                                A
                                            </button>
                                            <button
                                                className={`${styles['toggle-btn']} ${tempAttendance[emp.mobileNo]?.night ? `${styles.active} ${styles.n}` : ''}`}
                                                onClick={() => setTempAttendance({ ...tempAttendance, [emp.mobileNo]: { ...tempAttendance[emp.mobileNo], night: !tempAttendance[emp.mobileNo]?.night } })}
                                            >
                                                🌙
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isPrintRangeModalOpen && (
                <div className={styles['modal-overlay']} onClick={() => setIsPrintRangeModalOpen(false)}>
                    <div className={styles['modal-content']} style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className={styles['modal-header-colorful']}>
                            <h2 className={styles['text-primary-theme']}>Select Month & Year</h2>
                            <button className={styles['btn-close-modal']} onClick={() => setIsPrintRangeModalOpen(false)}>&times;</button>
                        </div>
                        <div className={styles['modal-body']} style={{ padding: '2rem' }}>
                            <div className={styles['form-group']} style={{ marginBottom: '2rem' }}>
                                <label>Target Month</label>
                                <input
                                    type="month"
                                    value={printSelectedMonth}
                                    onChange={e => setPrintSelectedMonth(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <button
                                className={styles['btn-vibrant']}
                                style={{ width: '100%', background: '#6366f1', color: 'white', border: 'none' }}
                                onClick={() => {
                                    if (printType === 'attendance') {
                                        handlePrintAttendanceSheet(printSelectedMonth);
                                    } else {
                                        handlePrintAllSalary(printSelectedMonth);
                                    }
                                }}
                            >
                                Generate {printType === 'attendance' ? 'Register' : 'Report'} & Print 🖨️
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalaryLedger;
