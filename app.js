/**
 * Visual Crossing Weather App
 * - Current conditions (temp, windspeed, precipprob, conditions)
 * - Previous + next 24 hours (hourly)
 * - Refresh button
 * - Default view via geolocation (stretch)
 *
 * Docs:
 * Timeline endpoint + include param: https://.../timeline/[location]/[date1]/[date2]?include=... :contentReference[oaicite:1]{index=1}
 */

const API_KEY = "KH57D7CT6H7EE2HH6RLFJ4HPZ"; // <-- put your key here

const BASE_URL =
  "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/";

const UNIT_GROUP = "metric"; // metric | us | uk

// We only request what we need (smaller payload)
const ELEMENTS = [
  "datetime",
  "datetimeEpoch",
  "temp",
  "windspeed",
  "precipprob",
  "conditions",
  "icon",
].join(",");

const ICON_EMOJI = {
  "clear-day": "☀️",
  "clear-night": "🌙",
  "partly-cloudy-day": "⛅",
  "partly-cloudy-night": "☁️🌙",
  cloudy: "☁️",
  rain: "🌧️",
  snow: "❄️",
  wind: "💨",
  fog: "🌫️",
  "thunder-rain": "⛈️",
  "thunder-showers-day": "⛈️",
  "thunder-showers-night": "⛈️",
  "showers-day": "🌦️",
  "showers-night": "🌧️",
};

const $ = (sel) => document.querySelector(sel);

const els = {
  form: $("#searchForm"),
  input: $("#locationInput"),
  geoBtn: $("#geoBtn"),
  refreshBtn: $("#refreshBtn"),
  status: $("#status"),
  loading: $("#loading"),

  currentCard: $("#currentCard"),
  placeName: $("#placeName"),
  asOf: $("#asOf"),
  icon: $("#icon"),
  temp: $("#temp"),
  wind: $("#wind"),
  rainChance: $("#rainChance"),
  conditions: $("#conditions"),

  prevBody: $("#prevBody"),
  nextBody: $("#nextBody"),
};

let lastQuery = null;

init();

function init() {
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = els.input.value.trim();
    if (!q) return;
    loadWeather(q);
  });

  els.refreshBtn.addEventListener("click", () => {
    if (lastQuery) loadWeather(lastQuery, { silent: true });
  });

  els.geoBtn.addEventListener("click", () => {
    loadFromGeolocation();
  });

  if (API_KEY.includes("PASTE_YOUR")) {
    setStatus("Add your Visual Crossing API key in app.js to start.");
    return;
  }

  // Stretch goal: try default weather view via geolocation on load
  loadFromGeolocation({ onFailShowHint: true });
}

function setStatus(msg) {
  els.status.textContent = msg || "";
}

function setLoading(isLoading) {
  els.loading.classList.toggle("hidden", !isLoading);
  els.loading.setAttribute("aria-hidden", String(!isLoading));
  els.refreshBtn.disabled = isLoading || !lastQuery;
}

function buildUrl(locationQuery) {
  // Request yesterday..tomorrow so we have enough hourly points to slice:
  // previous 24h + next 24h around "now".
  // Date/time formats are ISO-based and can use dynamic date keywords. :contentReference[oaicite:2]{index=2}
  const path = `${BASE_URL}${encodeURIComponent(locationQuery)}/yesterday/tomorrow`;

  const params = new URLSearchParams({
    key: API_KEY,
    unitGroup: UNIT_GROUP,
    include: "days,hours,current",
    elements: ELEMENTS,
    contentType: "json",
    options: "nonulls",
  });

  return `${path}?${params.toString()}`;
}

async function fetchWeather(locationQuery) {
  const url = buildUrl(locationQuery);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

async function loadWeather(locationQuery, { silent = false } = {}) {
  try {
    lastQuery = locationQuery;
    setLoading(true);
    if (!silent) setStatus("Fetching weather…");

    const data = await fetchWeather(locationQuery);

    renderCurrent(data);
    renderPrevNext24h(data);

    els.currentCard.classList.remove("hidden");
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(
      "Couldn’t fetch weather. Check the location text and your API key, then try again."
    );
  } finally {
    setLoading(false);
  }
}

function renderCurrent(data) {
  // currentConditions commonly includes temp, windspeed, conditions, icon, etc. :contentReference[oaicite:3]{index=3}
  const cc = data.currentConditions || {};
  const tz = data.timezone || "UTC";

  els.placeName.textContent = data.resolvedAddress || data.address || lastQuery || "—";

  const nowEpoch = cc.datetimeEpoch ? cc.datetimeEpoch * 1000 : Date.now();
  const dt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(nowEpoch));

  els.asOf.textContent = `As of ${dt} (${tz})`;

  els.icon.textContent = iconToEmoji(cc.icon);
  els.temp.textContent = formatTemp(cc.temp);
  els.wind.textContent = formatWind(cc.windspeed);
  els.rainChance.textContent = formatRainChance(cc.precipprob);
  els.conditions.textContent = cc.conditions || "—";

  els.refreshBtn.disabled = false;
}

function renderPrevNext24h(data) {
  const cc = data.currentConditions || {};
  const nowEpochSec = cc.datetimeEpoch;

  const tz = data.timezone || "UTC";

  // Flatten all hourly records across the returned days
  const hours = [];
  for (const day of data.days || []) {
    for (const h of day.hours || []) {
      if (typeof h.datetimeEpoch === "number") {
        hours.push(h);
      }
    }
  }
  hours.sort((a, b) => a.datetimeEpoch - b.datetimeEpoch);

  if (typeof nowEpochSec !== "number") {
    fillTable(els.prevBody, [], tz);
    fillTable(els.nextBody, [], tz);
    return;
  }

  const startPrev = nowEpochSec - 24 * 3600;
  const endNext = nowEpochSec + 24 * 3600;

  const prev = hours.filter(
    (h) => h.datetimeEpoch >= startPrev && h.datetimeEpoch < nowEpochSec
  );
  const next = hours.filter(
    (h) => h.datetimeEpoch >= nowEpochSec && h.datetimeEpoch < endNext
  );

  fillTable(els.prevBody, prev, tz);
  fillTable(els.nextBody, next, tz);
}

function fillTable(tbody, rows, tz) {
  tbody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "muted";
    td.textContent = "No data available for this period.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const frag = document.createDocumentFragment();

  for (const r of rows) {
    const tr = document.createElement("tr");

    const timeTd = document.createElement("td");
    timeTd.textContent = formatHour(r.datetimeEpoch, tz);
    tr.appendChild(timeTd);

    const tempTd = document.createElement("td");
    tempTd.textContent = formatTemp(r.temp);
    tr.appendChild(tempTd);

    const windTd = document.createElement("td");
    windTd.textContent = formatWind(r.windspeed);
    tr.appendChild(windTd);

    const rainTd = document.createElement("td");
    rainTd.textContent = formatRainChance(r.precipprob);
    tr.appendChild(rainTd);

    const condTd = document.createElement("td");
    condTd.textContent = `${iconToEmoji(r.icon)} ${r.conditions || "—"}`;
    tr.appendChild(condTd);

    frag.appendChild(tr);
  }

  tbody.appendChild(frag);
}

function formatHour(epochSec, tz) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(epochSec * 1000));
}

function iconToEmoji(icon) {
  return ICON_EMOJI[icon] || "⛅";
}

function formatTemp(v) {
  if (typeof v !== "number") return "—";
  const unit = UNIT_GROUP === "us" ? "°F" : "°C";
  return `${Math.round(v)}${unit}`;
}

function formatWind(v) {
  if (typeof v !== "number") return "—";
  // In metric/uk, Visual Crossing uses kph for windspeed. :contentReference[oaicite:4]{index=4}
  const unit = UNIT_GROUP === "us" ? "mph" : "kph";
  return `${Math.round(v)} ${unit}`;
}

function formatRainChance(v) {
  // precipprob is precipitation chance (0–100%). :contentReference[oaicite:5]{index=5}
  if (typeof v !== "number") return "—";
  return `${Math.round(v)}%`;
}

function loadFromGeolocation({ onFailShowHint = false } = {}) {
  if (!navigator.geolocation) {
    if (onFailShowHint) setStatus("Geolocation not supported. Enter a location to search.");
    return;
  }

  setStatus("Requesting your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      // Visual Crossing accepts "latitude,longitude" as the location path segment. :contentReference[oaicite:6]{index=6}
      const q = `${lat},${lon}`;
      els.input.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      loadWeather(q, { silent: true });
    },
    () => {
      if (onFailShowHint) {
        setStatus("Location permission denied. Enter a location above to search.");
      } else {
        setStatus("");
      }
    },
    { enableHighAccuracy: false, timeout: 8000 }
  );
}
