import React, { useEffect, useState, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";
import "../styles/EnquiryStats.css";

const EnquiryStats = () => {
    const [enquiries, setEnquiries] = useState([]);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "enquiry"), (snapshot) => {
            let all = [];
            snapshot.forEach((docSnap) => {
                const monthData = docSnap.data();
                Object.entries(monthData).forEach(([id, data]) => {
                    all.push({ id, ...data });
                });
            });
            setEnquiries(all);
        });

        return () => unsubscribe();
    }, []);

    const stats = useMemo(() => {

        const todayStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
        }).format(new Date());

        const now = new Date();

        const total = enquiries.length;

        const todayCount = enquiries.filter(
            (e) => e.enquiryDate === todayStr
        ).length;

        const upcoming = enquiries.filter(
            (e) => new Date(e.functionDate) >= now
        ).length;

        const expired = enquiries.filter(
            (e) => new Date(e.functionDate) < now
        ).length;

        const totalPax = enquiries.reduce(
            (sum, e) => sum + Number(e.pax || 0),
            0
        );

        const avgPax = total ? (totalPax / total).toFixed(0) : 0;

        // ===============================
        // Revenue Potential
        // ===============================
        const estimatedRevenue = enquiries.reduce((sum, e) => {
            const pax = Number(e.pax || 0);
            const estimatedPlateCost = 1500; // adjust
            return sum + pax * estimatedPlateCost;
        }, 0);

        // ===============================
        // Monthly Distribution
        // ===============================
        const monthMap = {};

        enquiries.forEach(e => {
            if (!e.enquiryDate) return;
            const month = e.enquiryDate.slice(0, 7);
            monthMap[month] = (monthMap[month] || 0) + 1;
        });

        // ===============================
        // Function Type & Source Ranking
        // ===============================
        const functionTypeMap = {};
        const sourceMap = {};
        const dayNightMap = { Day: 0, Night: 0 };

        enquiries.forEach((e) => {
            if (e.functionType)
                functionTypeMap[e.functionType] =
                    (functionTypeMap[e.functionType] || 0) + 1;

            if (e.source)
                sourceMap[e.source] =
                    (sourceMap[e.source] || 0) + 1;

            if (e.dayNight)
                dayNightMap[e.dayNight] =
                    (dayNightMap[e.dayNight] || 0) + 1;
        });

        const topFunction =
            Object.entries(functionTypeMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

        const topSource =
            Object.entries(sourceMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

        const top5Functions =
            Object.entries(functionTypeMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

        const top5Sources =
            Object.entries(sourceMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

        // ===============================
        // Follow-Up Intelligence
        // ===============================
        let followUpPending = 0;
        let followUpToday = 0;

        enquiries.forEach(e => {
            if (!Array.isArray(e.followUpDetails)) return;

            e.followUpDetails.forEach(f => {
                if (!f?.date) return;

                if (f.date === todayStr) followUpToday++;

                if (new Date(f.date) >= now)
                    followUpPending++;
            });
        });

        return {
            total,
            todayCount,
            upcoming,
            expired,
            avgPax,
            estimatedRevenue,
            topFunction,
            topSource,
            dayNightMap,
            top5Functions,
            top5Sources,
            monthMap,
            followUpPending,
            followUpToday,
        };

    }, [enquiries]);

    return (
        <div className="stats-container">

            <div className="stats-grid">

                <StatCard title="Total Enquiries" value={stats.total} />
                <StatCard title="Today Enquiries" value={stats.todayCount} />
                <StatCard title="Upcoming Events" value={stats.upcoming} />
                <StatCard title="Expired Enquiries" value={stats.expired} />
                <StatCard title="Average Pax" value={stats.avgPax} />
                <StatCard title="Top Function Type" value={stats.topFunction} />
                <StatCard title="Top Source" value={stats.topSource} />

                <StatCard title="Estimated Revenue Potential" value={`₹ ${stats.estimatedRevenue.toLocaleString("en-IN")}`} />
                <StatCard title="Follow-up Pending" value={stats.followUpPending} />
                <StatCard title="Follow-up Today" value={stats.followUpToday} />

            </div>

            <h3>Day vs Night Distribution</h3>
            <div className="stats-grid">
                <StatCard title="Day Events" value={stats.dayNightMap.Day || 0} />
                <StatCard title="Night Events" value={stats.dayNightMap.Night || 0} />
            </div>

        </div>
    );
};

const StatCard = ({ title, value }) => (
    <div className="stat-card">
        <h4>{title}</h4>
        <p>{value}</p>
    </div>
);

export default EnquiryStats;
