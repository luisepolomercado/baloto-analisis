// Baloto · Analítica de Tendencias — lógica del dashboard (vanilla JS + Chart.js)

const MAX_BALOTA = 43;   // balotas principales 1..43
const MAX_SUPER = 16;    // superbalota 1..16
const PICK = 5;          // se eligen 5 balotas

const state = { data: null, tipo: "baloto", ventana: 0 };
let chartBalotas = null, chartSuper = null;

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
  arr.sort((a, b) => a.sorteo - b.sorteo);
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
  const data = labels.map((n) => stats.freq[n]);
  if (chartBalotas) chartBalotas.destroy();
  chartBalotas = new Chart(document.getElementById("chartBalotas"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Veces que salió", data, backgroundColor: "#ffcc00" }] },
    options: chartOpts(),
  });

  const sLabels = Array.from({ length: MAX_SUPER }, (_, i) => i + 1);
  const sData = sLabels.map((n) => stats.freqSuper[n]);
  if (chartSuper) chartSuper.destroy();
  chartSuper = new Chart(document.getElementById("chartSuper"), {
    type: "bar",
    data: { labels: sLabels, datasets: [{ label: "Veces", data: sData, backgroundColor: "#ff4d6d" }] },
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
