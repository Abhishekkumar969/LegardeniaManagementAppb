import AppLoading from "./AppLoading/AppLoading";
import BlockedPage from "./pages/BlockedPage";

export default function PowerGuard({ power, children }) {
    if (power === undefined) return <AppLoading />;
    if (power === false) return <BlockedPage />;
    return children;
}
