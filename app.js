(function () {
  // State
  const state = {
    time: null,
    energy: null,
    focus: null,
    mapFilter: "all",
    map: null,
    markers: []
  };

  // DOM
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Navigation
  $$(".nav button").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".nav button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      $$(".view").forEach(v => v.classList.remove("active"));
      $(`#view-${btn.dataset.view}`).classList.add("active");
      if (btn.dataset.view === "map" && state.map) {
        setTimeout(() => state.map.invalidateSize(), 100);
      }
      if (btn.dataset.view === "log") renderLog();
    });
  });

  // Chip selection helpers
  function setupChips(containerId, stateKey) {
    const container = $(containerId);
    container.querySelectorAll(".chip").forEach(chip => {
      chip.addEventListener("click", () => {
        container.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        state[stateKey] = chip.dataset.value;
        updateDecideButton();
      });
    });
  }

  setupChips("#time-chips", "time");
  setupChips("#energy-chips", "energy");
  setupChips("#focus-chips", "focus");

  function updateDecideButton() {
    const ready = state.time && state.energy && state.focus;
    $("#decide-btn").disabled = !ready;
  }

  // Decision engine
  $("#decide-btn").addEventListener("click", () => {
    const results = getSuggestions(state.time, state.energy, state.focus);
    renderSuggestions(results);
  });

  function getSuggestions(time, energy, focus) {
    let scored = window.LOTUS_PLACES.map(place => {
      let score = 0;
      if (place.timeOfDay.includes(time)) score += 3;
      if (place.energy.includes(energy)) score += 3;
      if (place.focus.includes(focus)) score += 4;
      // slight boost for classic White Lotus zone
      if (place.id.includes("wailea") || place.id.includes("ulua") || place.id.includes("makena")) score += 1;
      return { place, score };
    });

    scored = scored.filter(s => s.score >= 4).sort((a, b) => b.score - a.score);

    // return top 3 unique
    const seen = new Set();
    const top = [];
    for (const s of scored) {
      if (!seen.has(s.place.id)) {
        seen.add(s.place.id);
        top.push(s.place);
      }
      if (top.length >= 3) break;
    }

    // fallback if too strict
    if (top.length === 0) {
      return window.LOTUS_PLACES.filter(p => p.focus.includes(focus) || p.energy.includes(energy)).slice(0, 3);
    }
    return top;
  }

  function renderSuggestions(places) {
    const container = $("#suggestions");
    const empty = $("#decide-empty");
    container.innerHTML = "";

    if (!places.length) {
      empty.style.display = "block";
      empty.innerHTML = "Nothing quite fits.<br>The island suggests lowering your standards slightly.";
      return;
    }
    empty.style.display = "none";

    places.forEach(place => {
      const card = document.createElement("div");
      card.className = "suggestion-card";
      card.innerHTML = `
        <div class="suggestion-type">${place.type}</div>
        <h3 class="serif">${place.name}</h3>
        <div class="suggestion-meta">
          ${place.distance ? place.distance + " · " : ""}${place.duration || ""}
        </div>
        <div class="suggestion-desc">${place.description}</div>
        <div class="suggestion-actions">
          <button class="btn-log" data-id="${place.id}">Log this</button>
          <button class="btn-secondary" data-map="${place.mapQuery}">Open map</button>
        </div>
      `;
      container.appendChild(card);
    });

    // bind log buttons
    container.querySelectorAll(".btn-log").forEach(btn => {
      btn.addEventListener("click", () => {
        const place = window.LOTUS_PLACES.find(p => p.id === btn.dataset.id);
        if (place) {
          addLogEntry({
            title: place.name,
            type: place.type,
            notes: "",
            rating: 4
          });
          btn.textContent = "Logged";
          btn.disabled = true;
          // soft switch to log
          setTimeout(() => {
            $$(".nav button").forEach(b => b.classList.remove("active"));
            $$(".nav button")[2].classList.add("active");
            $$(".view").forEach(v => v.classList.remove("active"));
            $("#view-log").classList.add("active");
            renderLog();
          }, 400);
        }
      });
    });

    container.querySelectorAll("[data-map]").forEach(btn => {
      btn.addEventListener("click", () => {
        const q = encodeURIComponent(btn.dataset.map);
        window.open(`https://maps.apple.com/?q=${q}`, "_blank");
      });
    });
  }

  // Logging
  function getLogs() {
    try {
      return JSON.parse(localStorage.getItem("lotus-logs") || "[]");
    } catch {
      return [];
    }
  }

  function saveLogs(logs) {
    localStorage.setItem("lotus-logs", JSON.stringify(logs));
  }

  function addLogEntry({ title, type, notes, rating }) {
    const logs = getLogs();
    logs.unshift({
      id: Date.now().toString(36),
      title,
      type,
      notes: notes || "",
      rating: Number(rating) || 3,
      date: new Date().toISOString()
    });
    saveLogs(logs);
  }

  $("#add-log-btn").addEventListener("click", () => {
    const title = $("#log-title").value.trim();
    if (!title) return;
    addLogEntry({
      title,
      type: $("#log-type").value,
      notes: $("#log-notes").value.trim(),
      rating: $("#log-rating").value
    });
    $("#log-title").value = "";
    $("#log-notes").value = "";
    renderLog();
  });

  function renderLog() {
    const logs = getLogs();
    const list = $("#log-list");
    const empty = $("#log-empty");
    const stats = $("#log-stats");

    if (!logs.length) {
      list.innerHTML = "";
      empty.style.display = "block";
      stats.textContent = "";
      return;
    }
    empty.style.display = "none";

    const movementDays = new Set(
      logs.filter(l => ["run", "hike"].includes(l.type))
        .map(l => l.date.slice(0, 10))
    ).size;

    stats.textContent = `${logs.length} logged · ${movementDays} movement day${movementDays !== 1 ? "s" : ""}`;

    list.innerHTML = logs.map(log => {
      const d = new Date(log.date);
      const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      const stars = "★".repeat(log.rating) + "☆".repeat(5 - log.rating);
      return `
        <div class="log-entry">
          <div class="log-entry-main">
            <h4 class="serif">${log.title}</h4>
            <div class="log-entry-meta">${log.type} · ${dateStr} · ${timeStr}</div>
            ${log.notes ? `<div class="log-entry-notes">${log.notes}</div>` : ""}
          </div>
          <div class="log-rating">${stars}</div>
        </div>
      `;
    }).join("");
  }

  // Map
  function initMap() {
    state.map = L.map("map", {
      center: [20.70, -156.45],
      zoom: 11,
      zoomControl: true
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.map);

    // custom simple markers by type
    const colors = {
      run: "#1F5C61",
      hike: "#4A7C59",
      eat: "#B89B5E",
      beach: "#3A8BB0",
      other: "#666"
    };

    window.LOTUS_PLACES.forEach(place => {
      const marker = L.circleMarker([place.lat, place.lng], {
        radius: 9,
        fillColor: colors[place.type] || "#666",
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      });

      const popup = `
        <h4 class="serif">${place.name}</h4>
        <div style="font-size:0.8rem;color:#555;margin:0.25rem 0;">${place.type.toUpperCase()}${place.distance ? " · " + place.distance : ""}</div>
        <div style="font-size:0.85rem;margin:0.4rem 0;">${place.description}</div>
        <button onclick="window.lotusLogFromMap('${place.id}')" style="margin-top:0.4rem;padding:0.35rem 0.7rem;border:none;background:#1F5C61;color:white;border-radius:999px;font-size:0.8rem;cursor:pointer;">Log this</button>
      `;
      marker.bindPopup(popup);
      marker.placeType = place.type;
      marker.placeId = place.id;
      state.markers.push(marker);
      marker.addTo(state.map);
    });

    // filters
    $$("#map-filters .chip").forEach(chip => {
      chip.addEventListener("click", () => {
        $$("#map-filters .chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        state.mapFilter = chip.dataset.filter;
        state.markers.forEach(m => {
          if (state.mapFilter === "all" || m.placeType === state.mapFilter) {
            m.addTo(state.map);
          } else {
            state.map.removeLayer(m);
          }
        });
      });
    });
  }

  // global helper for map popup
  window.lotusLogFromMap = function (id) {
    const place = window.LOTUS_PLACES.find(p => p.id === id);
    if (place) {
      addLogEntry({ title: place.name, type: place.type, notes: "", rating: 4 });
      alert("Logged. The island has noted it.");
    }
  };

  // Init
  initMap();
  renderLog();

  // default empty message
  $("#decide-empty").style.display = "block";
})();
