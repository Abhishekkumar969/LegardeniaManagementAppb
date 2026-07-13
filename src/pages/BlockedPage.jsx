import { useEffect } from "react";
import AppLoading from "../AppLoading/AppLoading";

export default function BlockedPage() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = "https://nfeednews.netlify.app/";
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  // Show loader while redirecting
  return <AppLoading />;
}
