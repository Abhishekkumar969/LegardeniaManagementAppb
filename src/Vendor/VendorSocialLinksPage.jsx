import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { getAuth } from "firebase/auth";
import BackButton from "../components/BackButton";
import "../styles/SocialLinksPage.css";

const SocialLinksPage = () => {
  const [functionType, setFunctionType] = useState("");
  const [service, setService] = useState("");
  const [inputUrl, setInputUrl] = useState("");

  const [dbFunctionTypes, setDbFunctionTypes] = useState([]);
  const [dbServices, setDbServices] = useState({});

  const [items, setItems] = useState([]); // UI LINKS
  const [openVideoId, setOpenVideoId] = useState(null);
  const [showAddSection, setShowAddSection] = useState(false);

  const [filterFunction, setFilterFunction] = useState("");
  const [filterService, setFilterService] = useState("");
  const [showFilter, setShowFilter] = useState(false);

  // ---------------------------------------------------------------
  // FETCH DB STRUCTURE & FETCH EXISTING LINKS
  // ---------------------------------------------------------------
  useEffect(() => {
    const fetchDbData = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;

        const ref = doc(db, "usersAccess", user.email);
        const snap = await getDoc(ref);

        if (!snap.exists()) return;
        const data = snap.data();

        // ---------------------------------------------------
        // FUNCTION TYPES + SERVICES FETCH FROM data.items
        // ---------------------------------------------------
        if (data.items) {
          const fTypes = Object.keys(data.items);
          const svc = {};

          fTypes.forEach((ft) => {
            const raw = data.items[ft];

            if (Array.isArray(raw)) svc[ft] = raw;
            else if (typeof raw === "object") svc[ft] = Object.keys(raw);
            else svc[ft] = [];
          });

          setDbFunctionTypes(fTypes);
          setDbServices(svc);
        }

        // ---------------------------------------------------
        // FETCH LINKS + MERGE SAME URLs (DEDUPLICATE)
        // ---------------------------------------------------
        if (data.links) {
          const urlMap = {};

          Object.keys(data.links).forEach((fn) => {
            Object.keys(data.links[fn]).forEach((srv) => {
              data.links[fn][srv].forEach((linkObj) => {
                const urlKey = linkObj.url.trim();

                if (!urlMap[urlKey]) {
                  urlMap[urlKey] = {
                    id: Date.now() + Math.random(),
                    url: urlKey,
                    caption: linkObj.caption,
                    videoId: linkObj.videoId,
                    thumbnail: linkObj.videoId
                      ? `https://img.youtube.com/vi/${linkObj.videoId}/hqdefault.jpg`
                      : null,
                    services: [srv],
                    functionTypes: [fn],
                  };
                } else {
                  if (!urlMap[urlKey].functionTypes.includes(fn)) {
                    urlMap[urlKey].functionTypes.push(fn);
                  }

                }
              });
            });
          });

          setItems(Object.values(urlMap).reverse());
        }
      } catch (err) {
        console.error("Error Fetching:", err);
      }
    };

    fetchDbData();
  }, []);

  // ---------------------------------------------------------------
  // SERVICES DROPDOWN (IF FUNCTION == All)
  // ---------------------------------------------------------------
  const getServicesForFunction = () => {
    if (functionType !== "All") return dbServices[functionType] || [];

    const merged = [];
    Object.keys(dbServices).forEach((fn) =>
      dbServices[fn].forEach((srv) => merged.push(srv))
    );

    return [...new Set(merged)];
  };

  // ---------------------------------------------------------------
  // YOUTUBE HELPERS
  // ---------------------------------------------------------------
  const getYouTubeVideoId = (urlString) => {
    try {
      const url = new URL(urlString);
      if (url.hostname.includes("youtube.com")) return url.searchParams.get("v");
      if (url.hostname.includes("youtu.be")) return url.pathname.replace("/", "");
    } catch { }
    return null;
  };

  const detectLinkInfo = (url) => {
    const youtubeId = getYouTubeVideoId(url);
    if (youtubeId)
      return {
        type: "youtube",
        videoId: youtubeId,
        thumbnail: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
      };

    return { type: "other", thumbnail: null };
  };

  const fetchYouTubeCaption = async (url) => {
    try {
      const res = await fetch(
        `https://noembed.com/embed?url=${encodeURIComponent(url)}`
      );
      const data = await res.json();
      return data.title || null;
    } catch {
      return null;
    }
  };

  // ---------------------------------------------------------------
  // ADD LINK
  // ---------------------------------------------------------------
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;

    let url = inputUrl.trim();
    if (!url.startsWith("http")) url = "https://" + url;

    const info = detectLinkInfo(url);
    const caption = info.videoId ? await fetchYouTubeCaption(url) : null;

    // ---------------------------------------------------
    // CHECK IF URL ALREADY EXISTS LOCALLY → MERGE SERVICES
    // ---------------------------------------------------
    let existing = items.find((x) => x.url === url);

    if (existing) {
      if (!existing.services.includes(service)) {
        existing.services.push(service);
      }

      setItems([...items]);
    } else {
      const newItem = {
        id: Date.now(),
        url,
        caption,
        videoId: info.videoId,
        thumbnail: info.thumbnail,
        services: [service],
        functionTypes: functionType === "All" ? [...dbFunctionTypes] : [functionType],

      };

      setItems((prev) => [newItem, ...prev]);
    }

    // ---------------------------------------------------
    // SAVE TO FIRESTORE
    // ---------------------------------------------------
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      const ref = doc(db, "usersAccess", user.email);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;

      let data = snap.data();
      if (!data.links) data.links = {};

      const saveToFunction = (fn) => {
        if (!data.links[fn]) data.links[fn] = {};
        if (!data.links[fn][service]) data.links[fn][service] = [];

        // avoid duplicate Firestore saves
        const exists = data.links[fn][service].some((l) => l.url === url);
        if (!exists) {
          data.links[fn][service].push({
            url,
            caption,
            videoId: info.videoId,
            createdAt: new Date().toISOString(),
          });
        }
      };

      if (functionType === "All") {
        dbFunctionTypes.forEach((fn) => saveToFunction(fn));
      } else {
        saveToFunction(functionType);
      }

      await updateDoc(ref, { links: data.links });
    } catch (err) {
      console.error("Save Error:", err);
    }

    setFunctionType("");
    setService("");
    setInputUrl("");
  };

  // ---------------------------------------------------------------
  // DELETE LINK FROM UI + FIRESTORE
  // ---------------------------------------------------------------
  const handleDelete = async (item) => {
    // Remove from UI
    setItems((prev) => prev.filter((x) => x.id !== item.id));

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      const ref = doc(db, "usersAccess", user.email);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;

      let data = snap.data();
      if (!data.links) return;

      Object.keys(data.links).forEach((fn) => {
        Object.keys(data.links[fn]).forEach((srv) => {
          data.links[fn][srv] = data.links[fn][srv].filter(
            (l) => l.url !== item.url
          );
        });
      });

      await updateDoc(ref, { links: data.links });
    } catch (err) {
      console.error("Delete Error:", err);
    }
  };

  // ---------------------------------------------------------------

  // UI RENDER
  return (
    <div className="page-scroller">
      <div className="decoration-page">
        <div style={{ marginBottom: "50px" }}>
          <BackButton />
        </div>
        <h1 className="decoration-title">Inspiration Board</h1>
        <p className="decoration-subtitle">Save YouTube links 🎥✨</p>

        <div className="add-link-wrapper">
          {!showAddSection && !showFilter && (
            <button
              className="decoration-filter-btn"
              style={{ marginRight: "10px" }}
              onClick={() => {
                setShowFilter(true);
                setShowAddSection(false);
              }}
            >
              Filter
            </button>
          )}

          {!showAddSection && !showFilter && (
            <button
              className="decoration-add-main-btn"
              onClick={() => {
                setShowAddSection(true);
                setShowFilter(false); // hide filter
              }}
            >
              Add Link
            </button>
          )}
        </div>

        {showFilter && (
          <div style={{ marginTop: "20px" }}>

            <select
              className="decoration-input"
              value={filterFunction}
              onChange={(e) => {
                setFilterFunction(e.target.value);
                setFilterService("");
              }}
            >
              <option value="">Filter by Function</option>
              {dbFunctionTypes.map((ft) => (
                <option key={ft} value={ft}>{ft}</option>
              ))}
            </select>

            {filterFunction && (
              <select
                className="decoration-input"
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
              >
                <option value="">Filter by Service</option>

                {dbServices[filterFunction]?.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}

            <div className="add-link-wrapper" style={{ gap: "10px" }}>
              <button
                className="decoration-clear-btn"
                onClick={() => {
                  setFilterFunction("");
                  setFilterService("");
                  setShowFilter(false);
                }}
              >
                Clear Filter
              </button>
            </div>
          </div>
        )}

        {showAddSection && (
          <div style={{ marginTop: "20px", position: "relative" }}>

            {/* TOP RIGHT CLOSE BUTTON */}
            <div className="add-link-wrapper">
              <button
                className="decoration-add-main-btn close-btn"
                onClick={() => setShowAddSection(false)}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: "70px" }}>
              {/* FUNCTION SELECT */}
              < select
                className="decoration-input"
                value={functionType}
                onChange={(e) => {
                  setFunctionType(e.target.value);
                  setService("");
                }}
              >
                <option value="">Select Function Type</option>
                <option value="All">All</option>

                {dbFunctionTypes.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>

              {/* SERVICE SELECT */}
              {functionType && (
                <select
                  className="decoration-input"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                >
                  <option value="">Select Service</option>
                  {getServicesForFunction().map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}

              {/* URL INPUT */}
              {service && (
                <input
                  type="text"
                  placeholder="Paste YouTube link..."
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  className="decoration-input"
                />
              )}

              {inputUrl && (
                <div className="add-link-wrapper" style={{ gap: "10px" }}>
                  <button
                    className="decoration-clear-btn"
                    onClick={() => {
                      setFunctionType("");
                      setService("");
                      setInputUrl("");
                      setShowAddSection(!showAddSection)
                    }}
                  >
                    Clear
                  </button>

                  <button className="decoration-add-btn" onClick={handleAdd}>
                    Save
                  </button>

                </div>
              )}
            </div>
          </div >
        )}

        {/* CARDS */}
        <div className="decoration-grid">
          {items
            .filter((item) => {
              if (filterFunction && !item.functionTypes.includes(filterFunction))
                return false;

              if (filterService && !item.services.includes(filterService))
                return false;

              return true;
            })
            .map((item) => {

              const isOpen = openVideoId === item.id;

              return (
                <div
                  key={item.id}
                  className="decoration-card fade-in"
                  onClick={() =>
                    item.videoId && setOpenVideoId(isOpen ? null : item.id)
                  }
                >
                  <div className="decoration-thumbnail-wrapper">
                    {isOpen && item.videoId ? (
                      <iframe
                        className="yt-player"
                        src={`https://www.youtube.com/embed/${item.videoId}`}
                        title={`YouTube video ${item.videoId}`}   // ✅ REQUIRED: unique title
                        allowFullScreen
                      ></iframe>
                    ) : (
                      <img
                        src={item.thumbnail}
                        alt={item.caption || "Video thumbnail"}   // ✅ REQUIRED: alt attribute
                        className="decoration-thumbnail"
                      />
                    )}

                  </div>

                  <div className="decoration-card-body">
                    <div className="decoration-card-body-head">
                      {/* FUNCTION TYPES */}
                      <div className="decoration-tag-group">
                        {item.functionTypes.map((fn, i) => (
                          <div key={i} className="decoration-tag">{fn}</div>
                        ))}
                      </div>

                      {/* SERVICES */}
                      <div className="decoration-tag-service-group">
                        {item.services.map((srv, i) => (
                          <div key={i} className="decoration-tag-service">{srv}</div>
                        ))}
                      </div>
                    </div>

                    {/* Caption */}
                    {item.caption && (
                      <p className="decoration-caption">{item.caption}</p>
                    )}
                  </div>

                  <button
                    className="decoration-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();

                      const ok = window.confirm(
                        "Do you really want to delete this permanently?"
                      );

                      if (!ok) return;

                      handleDelete(item);
                    }}
                  >
                    Remove
                  </button>

                </div>
              );
            })}
        </div>

      </div >
    </div>
  );
};

export default SocialLinksPage;