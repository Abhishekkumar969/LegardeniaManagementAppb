/**
 * Cross-platform print helper that works reliably on:
 * - iOS Safari / WebKit (iPhone & iPad)
 * - Android (Chrome, Samsung Internet, etc.)
 * - Desktop (Windows, macOS, Linux - Chrome, Edge, Firefox, Safari)
 *
 * Key fixes for iOS Safari / WebKit:
 * 1. NEVER use `display: none` or `width: 0; height: 0`. WebKit omits elements with 0 dimensions
 *    or display:none from the render tree, resulting in blank PDF/print pages.
 * 2. Position the iframe offscreen with a realistic viewport dimension (1024x768) and opacity 0.
 * 3. Give WebKit 350ms to finish parsing the DOM, calculating layout, and loading fonts before calling .print().
 * 4. Injects iOS print engine CSS fixes (overflow: visible, height: auto, exact color adjust).
 * 5. Remove previous iframe so document contexts and event listeners do not conflict.
 */
/**
 * Generates formatted file name for Lead / Booking PDF:
 * Format: "DD.MM.YYYY_500 pax" (e.g. "15.02.2027_500 pax")
 */
export const getLeadPdfFileName = (lead, defaultFallback = "Event_Booking") => {
  if (!lead) return defaultFallback;

  // Format event date as DD.MM.YYYY
  let dateStr = "";
  const rawDate = lead.functionDate || lead.eventDate;
  if (rawDate) {
    try {
      if (typeof rawDate === "string") {
        const clean = rawDate.trim();
        // Check YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
          const [y, m, d] = clean.slice(0, 10).split("-");
          dateStr = `${d}.${m}.${y}`;
        } else if (/^\d{2}[-./]\d{2}[-./]\d{4}/.test(clean)) {
          const [d, m, y] = clean.slice(0, 10).split(/[-./]/);
          dateStr = `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`;
        }
      }
      if (!dateStr) {
        const d = rawDate?.toDate ? rawDate.toDate() : (rawDate instanceof Date ? rawDate : new Date(rawDate));
        if (!isNaN(d.getTime())) {
          const utc = d.getTime();
          const istOffset = 5.5 * 60 * 60 * 1000;
          const istDate = new Date(utc + istOffset);
          const dd = String(istDate.getUTCDate()).padStart(2, "0");
          const mm = String(istDate.getUTCMonth() + 1).padStart(2, "0");
          const yyyy = istDate.getUTCFullYear();
          dateStr = `${dd}.${mm}.${yyyy}`;
        }
      }
    } catch {
      dateStr = "";
    }
  }

  // Extract pax (lead.noOfPlates || lead.pax)
  let paxValue = lead.noOfPlates ?? lead.pax ?? "";
  if (!paxValue && lead.selectedMenus && typeof lead.selectedMenus === "object") {
    const firstMenu = Object.values(lead.selectedMenus)[0];
    if (firstMenu?.noOfPlates) {
      paxValue = firstMenu.noOfPlates;
    }
  }

  paxValue = String(paxValue || "").trim();
  let paxStr = "";
  if (paxValue) {
    if (paxValue.toLowerCase().endsWith("pax")) {
      paxStr = paxValue;
    } else {
      paxStr = `${paxValue} pax`;
    }
  }

  if (dateStr && paxStr) {
    return `${dateStr}_${paxStr}`;
  }
  if (dateStr) {
    return `${dateStr}_pax`;
  }
  if (paxStr) {
    return paxStr;
  }
  return defaultFallback;
};

export const printHtmlContent = (htmlContent, documentTitle) => {
  if (!htmlContent) return;

  // Extract or assign title
  let title = documentTitle;
  if (!title) {
    const titleMatch = htmlContent.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    }
  }

  // Clean up any existing iframe to avoid stale DOM/state
  const existingFrame = document.getElementById("print-frame");
  if (existingFrame) {
    try {
      existingFrame.remove();
    } catch {
      if (existingFrame.parentNode) {
        existingFrame.parentNode.removeChild(existingFrame);
      }
    }
  }

  // Create iframe
  const iframe = document.createElement("iframe");
  iframe.id = "print-frame";

  // Crucial: Offscreen styling with actual dimensions for iOS Safari WebKit renderer
  iframe.style.position = "fixed";
  iframe.style.top = "-9999px";
  iframe.style.left = "-9999px";
  iframe.style.width = "1024px";
  iframe.style.height = "768px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";

  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    console.error("Unable to access print iframe document");
    return;
  }

  // Ensure universal print styles for iOS Safari & Android
  const iosPrintStyles = `
    <style id="ios-print-engine-fixes">
      @media print {
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          overflow: visible !important;
          height: auto !important;
        }
      }
    </style>
  `;

  let finalContent = htmlContent;

  // If title is available, update or inject <title>
  if (title) {
    if (/<title[^>]*>.*?<\/title>/i.test(finalContent)) {
      finalContent = finalContent.replace(/<title[^>]*>.*?<\/title>/i, `<title>${title}</title>`);
    } else if (finalContent.includes("<head>")) {
      finalContent = finalContent.replace("<head>", `<head><title>${title}</title>`);
    } else {
      finalContent = `<head><title>${title}</title></head>${finalContent}`;
    }
  }

  if (finalContent.includes("</head>")) {
    finalContent = finalContent.replace("</head>", `${iosPrintStyles}</head>`);
  } else {
    finalContent = `${iosPrintStyles}${finalContent}`;
  }

  iframeDoc.open();
  iframeDoc.write(finalContent);
  iframeDoc.close();

  if (title) {
    try {
      iframeDoc.title = title;
    } catch {
      // ignore
    }
  }

  // WebKit on iOS requires a brief delay for DOM layout & styling calculation
  setTimeout(() => {
    try {
      if (iframe.contentWindow) {
        const originalDocTitle = document.title;
        if (title) {
          document.title = title;
        }

        const cleanup = () => {
          if (title) {
            document.title = originalDocTitle;
          }
          window.removeEventListener("afterprint", cleanup);
          if (iframe.contentWindow) {
            try {
              iframe.contentWindow.removeEventListener("afterprint", cleanup);
            } catch {
              // ignore
            }
          }
        };

        window.addEventListener("afterprint", cleanup);
        if (iframe.contentWindow) {
          try {
            iframe.contentWindow.addEventListener("afterprint", cleanup);
          } catch {
            // ignore
          }
        }
        setTimeout(cleanup, 2500);

        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
    } catch (err) {
      console.error("Error executing print:", err);
    }
  }, 350);
};

export default printHtmlContent;
