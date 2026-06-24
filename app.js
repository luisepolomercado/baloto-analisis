// Baloto · Analítica de Tendencias — lógica del dashboard (vanilla JS + Chart.js)

const MAX_BALOTA = 43;   // balotas principales 1..43
const MAX_SUPER = 16;    // superbalota 1..16
const PICK = 5;          // se eligen 5 balotas

const state = { data: null, tipo: "baloto", ventana: 0 };
const charts = {}; // registro de instancias Chart.js por id de canvas
function setChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}

// C(n, k)
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}
const ODDS = comb(MAX_BALOTA, PICK) * MAX_SUPER; // 15.401.568

function fmt(n) { return n.toLocaleString("es-CO"); }

async function load() {
  const res = await fetch("data/resultados.json", { cache: "no-store" });
  state.data = await res.json();
  document.getElementById("fuente").href = state.data.fuente;
  const [d0, d1] = state.data.rango_fechas || ["", ""];
  document.getElementById("meta").textContent =
    `${fmt(state.data.total)} registros · ${d0} → ${d1} · actualizado ${new Date(state.data.actualizado).toLocaleString("es-CO")}`;
  render();
}

function sorteosFiltrados() {
  let arr = state.data.sorteos.filter((s) => s.tipo === state.tipo);
  // Orden cronológico por fecha (el histórico 2017-2021 no trae nº de sorteo).
  arr.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  if (state.ventana > 0) arr = arr.slice(-state.ventana);
  return arr;
}

function calcularEstadisticas(arr) {
  const freq = Array(MAX_BALOTA + 1).fill(0);
  const freqSuper = Array(MAX_SUPER + 1).fill(0);
  const ultimaAparicion = Array(MAX_BALOTA + 1).fill(-1); // índice del último sorteo donde salió

  arr.forEach((s, idx) => {
    s.balotas.forEach((b) => {
      if (b >= 1 && b <= MAX_BALOTA) { freq[b]++; ultimaAparicion[b] = idx; }
    });
    if (s.superbalota >= 1 && s.superbalota <= MAX_SUPER) freqSuper[s.superbalota]++;
  });

  const total = arr.length;
  const atrasadas = [];
  for (let n = 1; n <= MAX_BALOTA; n++) {
    const sinSalir = ultimaAparicion[n] < 0 ? total : total - 1 - ultimaAparicion[n];
    atrasadas.push({ n, sinSalir, freq: freq[n] });
  }
  return { freq, freqSuper, atrasadas, total };
}

function ball(n, red = false) {
  return `<span class="ball${red ? " red" : ""}">${String(n).padStart(2, "0")}</span>`;
}

function renderRankList(elId, items, valueKey, label, maxVal, red = false) {
  const el = document.getElementById(elId);
  el.innerHTML = items.map((it) => {
    const pct = maxVal ? Math.round((it[valueKey] / maxVal) * 100) : 0;
    return `<li>${ball(it.n, red)}
      <span class="bar"><i style="width:${pct}%"></i></span>
      <span class="n">${it[valueKey]} ${label}</span></li>`;
  }).join("");
}

function renderKpis(arr, stats) {
  const calientes = stats.atrasadas.slice().sort((a, b) => b.freq - a.freq)[0];
  const fria = stats.atrasadas.slice().sort((a, b) => a.freq - b.freq)[0];
  const masAtrasada = stats.atrasadas.slice().sort((a, b) => b.sinSalir - a.sinSalir)[0];
  const cards = [
    { k: "Sorteos analizados", v: fmt(stats.total) },
    { k: "Balota más caliente", v: String(calientes.n).padStart(2, "0") },
    { k: "Balota más fría", v: String(fria.n).padStart(2, "0") },
    { k: "Más atrasada", v: `${String(masAtrasada.n).padStart(2, "0")} (${masAtrasada.sinSalir})` },
  ];
  document.getElementById("kpis").innerHTML = cards
    .map((c) => `<div class="card"><div class="v">${c.v}</div><div class="k">${c.k}</div></div>`)
    .join("");
}

function renderCharts(stats) {
  const labels = Array.from({ length: MAX_BALOTA }, (_, i) => i + 1);
  setChart("chartBalotas", {
    type: "bar",
    data: { labels, datasets: [{ label: "Veces que salió", data: labels.map((n) => stats.freq[n]), backgroundColor: "#ffcc00" }] },
    options: chartOpts(),
  });

  const sLabels = Array.from({ length: MAX_SUPER }, (_, i) => i + 1);
  setChart("chartSuper", {
    type: "bar",
    data: { labels: sLabels, datasets: [{ label: "Veces", data: sLabels.map((n) => stats.freqSuper[n]), backgroundColor: "#ff4d6d" }] },
    options: chartOpts(),
  });
}

// ---- gráficas de patrones de las combinaciones ----
function renderPatrones(arr) {
  // Suma de las 5 balotas: histograma agrupado de a 10
  const sumas = arr.map((s) => s.balotas.reduce((a, b) => a + b, 0));
  const minB = 10, maxB = 215; // rango teórico (1+2+3+4+5 .. 39+40+41+42+43)
  const buckets = {};
  for (let lo = Math.floor(minB / 10) * 10; lo <= maxB; lo += 10) buckets[lo] = 0;
  sumas.forEach((v) => { const lo = Math.floor(v / 10) * 10; buckets[lo] = (buckets[lo] || 0) + 1; });
  const sLabels = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  setChart("chartSuma", {
    type: "bar",
    data: { labels: sLabels.map((l) => `${l}-${l + 9}`), datasets: [{ data: sLabels.map((l) => buckets[l]), backgroundColor: "#4da3ff" }] },
    options: chartOpts(),
  });

  // Pares por sorteo (0..5)
  const pares = Array(6).fill(0);
  arr.forEach((s) => { pares[s.balotas.filter((b) => b % 2 === 0).length]++; });
  setChart("chartPar", {
    type: "bar",
    data: { labels: ["0", "1", "2", "3", "4", "5"], datasets: [{ data: pares, backgroundColor: "#2ee6a6" }] },
    options: chartOpts(),
  });

  // Distribución por decenas
  const rangos = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 43]];
  const dec = rangos.map(([lo, hi]) => arr.reduce((acc, s) => acc + s.balotas.filter((b) => b >= lo && b <= hi).length, 0));
  setChart("chartDec", {
    type: "bar",
    data: { labels: rangos.map(([lo, hi]) => `${lo}–${hi}`), datasets: [{ data: dec, backgroundColor: "#ffcc00" }] },
    options: chartOpts(),
  });

  // Promedio de la suma por año (tendencia temporal)
  const porAnio = {};
  arr.forEach((s) => {
    const y = s.fecha.slice(0, 4);
    const suma = s.balotas.reduce((a, b) => a + b, 0);
    (porAnio[y] = porAnio[y] || []).push(suma);
  });
  const anios = Object.keys(porAnio).sort();
  const prom = anios.map((y) => Math.round(porAnio[y].reduce((a, b) => a + b, 0) / porAnio[y].length));
  setChart("chartYear", {
    type: "line",
    data: { labels: anios, datasets: [{ data: prom, borderColor: "#ff4d6d", backgroundColor: "rgba(255,77,109,.2)", tension: 0.3, fill: true, pointRadius: 4 }] },
    options: chartOpts(),
  });
}

function chartOpts() {
  const grid = { color: "rgba(255,255,255,.06)" };
  const ticks = { color: "#9aa6c7" };
  return {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { grid, ticks }, y: { grid, ticks, beginAtZero: true } },
  };
}

// ---- generador de jugadas ----
function topN(items, key, n, desc = true) {
  return items.slice().sort((a, b) => (desc ? b[key] - a[key] : a[key] - b[key])).slice(0, n).map((x) => x.n);
}
function sample(pool, k) {
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k).sort((x, y) => x - y);
}
function pintarJugada(balotas, sup) {
  document.getElementById("jugada").innerHTML =
    balotas.map((b) => ball(b)).join("") + ball(sup, true);
}
function generar(modo) {
  const stats = calcularEstadisticas(sorteosFiltrados());
  let balotas;
  if (modo === "random") {
    balotas = sample(Array.from({ length: MAX_BALOTA }, (_, i) => i + 1), PICK);
  } else if (modo === "hot") {
    balotas = topN(stats.atrasadas, "freq", PICK).sort((a, b) => a - b);
  } else { // mixed: 3 calientes + 2 atrasadas
    const hot = topN(stats.atrasadas, "freq", 8);
    const due = topN(stats.atrasadas, "sinSalir", 8);
    const set = new Set();
    sample(hot, 3).forEach((n) => set.add(n));
    for (const n of sample(due, 8)) { if (set.size >= PICK) break; set.add(n); }
    balotas = Array.from(set).slice(0, PICK).sort((a, b) => a - b);
  }
  const sup = (Math.random() * MAX_SUPER | 0) + 1;
  pintarJugada(balotas, sup);
}

function render() {
  const arr = sorteosFiltrados();
  const stats = calcularEstadisticas(arr);
  renderKpis(arr, stats);
  renderCharts(stats);
  renderPatrones(arr);

  const maxFreq = Math.max(...stats.freq.slice(1));
  const porFreq = stats.atrasadas.slice().sort((a, b) => b.freq - a.freq);
  renderRankList("calientes", porFreq.slice(0, 8), "freq", "veces", maxFreq);
  renderRankList("frias", porFreq.slice(-8).reverse(), "freq", "veces", maxFreq);

  const maxDue = Math.max(...stats.atrasadas.map((a) => a.sinSalir));
  const porAtraso = stats.atrasadas.slice().sort((a, b) => b.sinSalir - a.sinSalir).slice(0, 8);
  renderRankList("atrasadas", porAtraso, "sinSalir", "sorteos", maxDue);

  document.getElementById("prob").textContent =
    `Probabilidad de acertar las 5 balotas + superbalota: 1 en ${fmt(ODDS)}. ` +
    `Solo las 5 balotas: 1 en ${fmt(comb(MAX_BALOTA, PICK))}.`;

  generar("mixed");
}

// eventos
document.getElementById("tipo").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  document.querySelectorAll("#tipo button").forEach((b) => b.classList.remove("active"));
  e.target.classList.add("active");
  state.tipo = e.target.dataset.tipo;
  render();
});
document.getElementById("ventana").addEventListener("change", (e) => {
  state.ventana = parseInt(e.target.value, 10);
  render();
});
document.getElementById("genHot").addEventListener("click", () => generar("hot"));
document.getElementById("genRandom").addEventListener("click", () => generar("random"));
document.getElementById("genMixed").addEventListener("click", () => generar("mixed"));

load().catch((e) => {
  document.getElementById("meta").textContent = "Error cargando datos: " + e.message;
});
