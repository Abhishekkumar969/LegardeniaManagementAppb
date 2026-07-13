import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // 1️⃣ window scroll
    window.scrollTo(0, 0);

    // 2️⃣ common app scroll containers
    const containers = [
      ".prebook-wrapper",
      ".table-fixed-wrapper",
      ".leads-table-container",
      ".service-section",
    ];

    containers.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) el.scrollTop = 0;
    });

    // 3️⃣ fallback: any scrollable div
    document.querySelectorAll("*").forEach(el => {
      const style = getComputedStyle(el);
      if (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        el.scrollTop > 0
      ) {
        el.scrollTop = 0;
      }
    });

  }, [pathname]);

  return null;
};

export default ScrollToTop;
