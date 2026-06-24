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
  renderGanadores();
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

const NOMBRE = { baloto: "Baloto", revancha: "Revancha" };
function pesos(v) { return "$" + (v || 0).toLocaleString("es-CO"); }

// ---- ¿Cuándo cayó el premio mayor? (usa TODO el histórico, no el filtro) ----
function renderGanadores() {
  const todos = state.data.sorteos;
  const conPremio = todos.filter((s) => s.premio_mayor);
  const ganados = conPremio
    .filter((s) => s.premio_mayor.ganadores > 0)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)); // más reciente primero

  const info = document.getElementById("ganInfo");
  const tbody = document.querySelector("#tablaGan tbody");

  if (conPremio.length === 0) {
    info.textContent = "Aún no hay datos de premios (se están descargando). Vuelve a cargar en un momento.";
    tbody.innerHTML = "";
    document.getElementById("ganKpis").innerHTML = "";
    return;
  }

  // racha actual de acumulados del Baloto (sorteos seguidos sin caer, desde el último)
  const balotoCron = conPremio
    .filter((s) => s.tipo === "baloto")
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  let rachaActual = 0;
  for (let i = balotoCron.length - 1; i >= 0; i--) {
    if (balotoCron[i].premio_mayor.ganadores > 0) break;
    rachaActual++;
  }
  const ultimoBaloto = [...balotoCron].reverse().find((s) => s.premio_mayor.ganadores > 0);

  const kpis = [
    { k: "Veces que cayó el premio mayor", v: ganados.length },
    { k: "Sorteos de Baloto con datos", v: balotoCron.length },
    { k: "Último Baloto ganado", v: ultimoBaloto ? ultimoBaloto.fecha : "—" },
    { k: "Acumulados seguidos (hoy)", v: rachaActual },
  ];
  document.getElementById("ganKpis").innerHTML = kpis
    .map((c) => `<div class="card"><div class="v">${c.v}</div><div class="k">${c.k}</div></div>`)
    .join("");

  info.innerHTML = `Lista de sorteos donde <strong>alguien acertó las 5 balotas + superbalota</strong> ` +
    `(${ganados.length} de ${conPremio.length} sorteos con datos, desde 2021). ` +
    `Las cifras de ganadores y premios son las publicadas oficialmente por baloto.com.`;

  tbody.innerHTML = ganados.map((s) => {
    const balls = s.balotas.map((b) => ball(b)).join("") + ball(s.superbalota, true);
    return `<tr>
      <td>${s.fecha}</td>
      <td>${NOMBRE[s.tipo] || s.tipo}</td>
      <td class="celdaballs">${balls}</td>
      <td>${s.premio_mayor.ganadores}</td>
      <td>${pesos(s.premio_mayor.valor)}</td>
    </tr>`;
  }).join("");

  renderGanadoresFreq(ganados);
}

// Frecuencia de números DENTRO de las jugadas que ganaron el premio mayor
function renderGanadoresFreq(ganados) {
  const freq = Array(MAX_BALOTA + 1).fill(0);
  const fsup = Array(MAX_SUPER + 1).fill(0);
  ganados.forEach((s) => {
    s.balotas.forEach((b) => { if (b >= 1 && b <= MAX_BALOTA) freq[b]++; });
    if (s.superbalota >= 1 && s.superbalota <= MAX_SUPER) fsup[s.superbalota]++;
  });

  const bl = Array.from({ length: MAX_BALOTA }, (_, i) => i + 1);
  setChart("chartGanBalotas", {
    type: "bar",
    data: { labels: bl, datasets: [{ data: bl.map((n) => freq[n]), backgroundColor: "#2ee6a6" }] },
    options: chartOpts(),
  });
  const sl = Array.from({ length: MAX_SUPER }, (_, i) => i + 1);
  setChart("chartGanSuper", {
    type: "bar",
    data: { labels: sl, datasets: [{ data: sl.map((n) => fsup[n]), backgroundColor: "#ff4d6d" }] },
    options: chartOpts(),
  });

  // top repetidas (con su conteo) y las que nunca ganaron
  const conConteo = bl.map((n) => ({ n, c: freq[n] }));
  const maxC = Math.max(...conConteo.map((x) => x.c));
  const top = conConteo.filter((x) => x.c >= 1).sort((a, b) => b.c - a.c).slice(0, 8);
  const nunca = conConteo.filter((x) => x.c === 0).map((x) => x.n);

  document.getElementById("ganTop").innerHTML = top
    .map((x) => `<span class="ball" title="${x.c} veces">${String(x.n).padStart(2, "0")}<sup>${x.c}</sup></span>`)
    .join("");
  document.getElementById("ganNunca").innerHTML = nunca.length
    ? nunca.map((n) => `<span class="ball cold">${String(n).padStart(2, "0")}</span>`).join("")
    : "<span class='hint'>Todas han aparecido al menos una vez.</span>";

  document.getElementById("ganFreqInfo").innerHTML =
    `Frecuencia de cada número dentro de las <strong>${ganados.length} combinaciones que ganaron</strong> el premio mayor ` +
    `(${ganados.length * 5} apariciones de balota en total). La más repetida salió ${maxC} veces. ` +
    `<em>Ojo: son solo ${ganados.length} casos — muy pocos para predecir nada, pero curioso de ver.</em>`;
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
