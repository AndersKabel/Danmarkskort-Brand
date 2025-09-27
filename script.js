/* ===========================================
   Brand – Danmarkskort (etape 1)
   - Basiskort
   - DAWA adressesøgning + valg
   - Popup med adresse
   - Klar til netselskab-opslag via proxy
   =========================================== */

// Sæt denne til din Cloudflare Worker, når du er klar med proxyen.
// Lad den være tom ("") for at slå elnet-opslag fra.
const PROXY_BASE = ""; // fx: "https://brand-elnet-proxy.anderskabel.workers.dev"

// Leaflet-kort
const map = L.map("map", { zoomControl: true, attributionControl: true })
  .setView([56.2639, 9.5018], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap-bidragydere'
}).addTo(map);

// UI refs
const searchInput = document.getElementById("searchInput");
const resultsBox  = document.getElementById("results");
const infoTpl     = document.getElementById("info-template");

let marker = null;

/* ---------- Hjælpere ---------- */
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- DAWA søgning ---------- */
// Autocomplete (officiel Dataforsyningen)
async function dawaAutocomplete(q) {
  const url = `https://api.dataforsyningen.dk/adresser/autocomplete?q=${encodeURIComponent(q)}&fuzzy=`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error("Adresse-autocomplete fejlede");
  return r.json();
}

// Slå adresse op fra id (for koordinater mm.)
async function dawaGetById(id) {
  const url = `https://api.dataforsyningen.dk/adresser/${id}`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error("Adresseopslag fejlede");
  return r.json();
}

/* ---------- Elnet via proxy (valgfri) ---------- */
async function elnetAutocomplete(fullAddress) {
  if (!PROXY_BASE) return [];
  const url = `${PROXY_BASE}/elnet/autocomplete?q=${encodeURIComponent(fullAddress)}`;
  const r = await fetch(url, { headers: { "Accept": "application/json" }});
  if (!r.ok) throw new Error("Elnet autocomplete via proxy fejlede");
  return r.json();
}
async function elnetSupplierByExternalId(externalId) {
  if (!PROXY_BASE) return [];
  const url = `${PROXY_BASE}/elnet/supplier?externalId=${encodeURIComponent(externalId)}`;
  const r = await fetch(url, { headers: { "Accept": "application/json" }});
  if (!r.ok) throw new Error("Elnet supplier via proxy fejlede");
  return r.json();
}

/* ---------- UI: vis forslag ---------- */
function showResults(items) {
  if (!items || !items.length) {
    resultsBox.style.display = "none";
    resultsBox.innerHTML = "";
    return;
  }
  resultsBox.innerHTML = items.slice(0, 12).map(x => (
    `<div class="item" data-id="${x.adresse.id}" data-tekst="${escapeHtml(x.tekst)}">${escapeHtml(x.tekst)}</div>`
  )).join("");
  resultsBox.style.display = "block";
}

/* ---------- Hovedflow: vælg adresse ---------- */
async function onPickAddress(adresseId, visningstekst) {
  try {
    // 1) Hent adresse + koordinater
    const adr = await dawaGetById(adresseId);
    // Dataforsyningen bruger [x,y] = [lon, lat] (WGS84)
    const [lon, lat] = adr.adgangsadresse.adgangspunkt.koordinater;
    const position = [lat, lon];

    // 2) Marker + zoom
    if (!marker) marker = L.marker(position).addTo(map);
    marker.setLatLng(position);
    map.setView(position, 16);

    // 3) (Valgfrit) elnet-opslag via proxy
    let supplier = null;
    if (PROXY_BASE) {
      const auto = await elnetAutocomplete(visningstekst);
      const best = Array.isArray(auto) && auto.length ? auto[0] : null;
      if (best?.ExternalSupplierId) {
        const res = await elnetSupplierByExternalId(best.ExternalSupplierId);
        supplier = (Array.isArray(res) && res.length) ? res[0] : null;
      }
    }

    // 4) Byg popup
    const node = infoTpl.content.cloneNode(true);
    node.querySelector('[data-bind="address"]').textContent = visningstekst;

    const netWrap = node.querySelector(".net");
    if (supplier) {
      node.querySelector('[data-bind="name"]').textContent = supplier.Name ?? "";
      node.querySelector('[data-bind="phone"]').textContent = supplier.PhoneNumber ? `Tlf.: ${supplier.PhoneNumber}` : "";
      const a = node.querySelector('[data-bind="website"]');
      if (supplier.Website) {
        a.href = supplier.Website.startsWith("http") ? supplier.Website : `https://${supplier.Website}`;
        a.textContent = supplier.Website;
      } else { a.remove(); }
      const logo = node.querySelector('[data-bind="logo"]');
      if (supplier.LogoUrl) logo.src = supplier.LogoUrl; else logo.remove();
    } else {
      netWrap.innerHTML = "<strong>Netselskab</strong><br><em>( slået fra eller ikke fundet )</em>";
    }

    marker.bindPopup(node, { maxWidth: 320 }).openPopup();
  } catch (err) {
    console.error(err);
    alert("Der opstod en fejl under opslag. Se Console for detaljer.");
  }
}

/* ---------- Events ---------- */
searchInput.addEventListener("input", debounce(async (e) => {
  const q = e.target.value.trim();
  if (q.length < 3) { showResults([]); return; }
  try {
    const res = await dawaAutocomplete(q);
    showResults(res);
  } catch (err) {
    console.error(err);
    showResults([]);
  }
}, 250));

resultsBox.addEventListener("click", (e) => {
  const item = e.target.closest(".item");
  if (!item) return;
  const id = item.getAttribute("data-id");
  const tekst = item.getAttribute("data-tekst");
  resultsBox.style.display = "none";
  resultsBox.innerHTML = "";
  searchInput.value = tekst;
  onPickAddress(id, tekst);
});

// Luk forslag når man klikker udenfor
document.addEventListener("click", (e) => {
  if (!resultsBox.contains(e.target) && e.target !== searchInput) {
    resultsBox.style.display = "none";
  }
});
