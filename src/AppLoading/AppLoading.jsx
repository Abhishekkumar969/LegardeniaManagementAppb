import React from "react";
import "./AppLoading.css";

export default function AppLoading({ title = "NfeedNews Publisher Portal", message = "Verifying Credentials & Access, please wait..." }) {
  return (
    <div className="blue-loading-wrapper">
      {/* Background ambient lighting */}
      <div className="ambient-glow" />

      {/* Floating Animated Bubbles */}
      <div className="bubbles-container">
        <span className="bubble b1" />
        <span className="bubble b2" />
        <span className="bubble b3" />
        <span className="bubble b4" />
        <span className="bubble b5" />
        <span className="bubble b6" />
        <span className="bubble b7" />
        <span className="bubble b8" />
        <span className="bubble b9" />
        <span className="bubble b10" />
        <span className="bubble b11" />
        <span className="bubble b12" />
        <span className="bubble b13" />
        <span className="bubble b14" />
        <span className="bubble b15" />
      </div>

      {/* Center Loading Card */}
      <div className="loading-card">
        <div className="spinner-container">
          <div className="outer-spinner-ring" />
          <div className="inner-pulsing-orb" />
        </div>

        <h2 className="loading-title">{title}</h2>
        <p className="loading-subtitle">
          {message}
          <span className="animated-dots" />
        </p>
      </div>
    </div>
  );
}
