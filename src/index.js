import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

import { db } from "./firebaseConfig";
import { doc, getDocFromServer } from "firebase/firestore";

async function bootstrap() {
  try {
    const snap = await getDocFromServer(
      doc(db, "appControl", "appStatus")
    );

    // ✅ ONLY TRUE ALLOWED
    if (!snap.exists() || snap.data()?.power !== true) {
      window.location.replace("https://nfeednews.netlify.app/");
      return;
    }

    const root = ReactDOM.createRoot(
      document.getElementById("root")
    );

    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (e) {
    console.error("BOOTSTRAP ERROR:", e);
    window.location.replace("https://nfeednews.netlify.app/");
  }
}

bootstrap();
reportWebVitals();
