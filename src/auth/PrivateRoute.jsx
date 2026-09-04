import { Navigate } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../firebaseConfig";
import AppLoading from "../AppLoading/AppLoading";

export default function PrivateRoute({ children }) {
    const [user, loading] = useAuthState(auth);

    if (loading) {
        return <AppLoading message="Verifying route access" />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return children;
}