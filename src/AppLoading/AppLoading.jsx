import React from "react";

export default function AppLoading() {
    return (
        <div style={styles.wrapper}>
            {/* Spinner */}
            <div style={styles.spinner}></div>

            {/* Text */}
            <div style={styles.text}>Loading, please wait...</div>
        </div>
    );
}

const styles = {
    wrapper: {
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8f9fa",
    },

    spinner: {
        width: "48px",
        height: "48px",
        border: "5px solid #e0e0e0",
        borderTop: "5px solid #0d6efd",
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
    },

    text: {
        marginTop: "14px",
        fontSize: "14px",
        color: "#555",
        letterSpacing: "0.5px",
    },
};
