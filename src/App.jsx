import { BrowserRouter as Router } from "react-router-dom";
import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebaseConfig";
import AppRoutes from "./AppRoutes";
import LoginPage from "./auth/LoginPage";
import AppLoading from "./AppLoading/AppLoading";
import PowerGuard from "./PowerGuard";

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [power, setPower] = useState(undefined);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "appControl", "appStatus"), (snap) => {
      if (snap.exists()) {
        setPower(snap.data()?.power === true);
      } else {
        setPower(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthChecked(true);
    });
  }, []);

  if (!authChecked || power === undefined) return <AppLoading />;

  return (
    <PowerGuard power={power}>
      <Router>
        {authUser ? <AppRoutes /> : <LoginPage />}
      </Router>
    </PowerGuard>
  );
}
