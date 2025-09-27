// Minimalt Leaflet-kort – virker “out of the box”
const map = L.map("map").setView([56.2639, 9.5018], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap-bidragydere'
}).addTo(map);

// Lille markør, så man kan se noget sker
L.marker([55.6761, 12.5683]).addTo(map).bindPopup("Hej fra København 👋");
