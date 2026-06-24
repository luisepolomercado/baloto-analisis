# 🎰 Baloto · Analítica de Tendencias

Raspa el histórico de resultados del **Baloto Colombia** (fuente oficial `baloto.com`)
y los muestra en una pequeña landing con analítica de tendencias: frecuencias,
números calientes/fríos, balotas atrasadas, frecuencia de superbalota y un
generador de "jugada sugerida".

> ⚠️ **Honestidad ante todo:** cada sorteo es independiente. Las tendencias de
> balotas **no cambian la probabilidad** de ganar (premio mayor: **1 en 15.401.568**).
> Esto es un proyecto educativo de análisis de datos, no una fórmula para ganar.

## Estructura

```
scrape_baloto.py        # oficial reciente + fusiona histórico → CSV + data/resultados.json
scrape_historico.py     # histórico antiguo 2017-2021 (fuente secundaria) → data/historico_2017_2021.json
scrape_premios.py       # ganadores del premio mayor por sorteo (incremental) → data/premios.json
index.html · app.js · styles.css   # landing estática (Chart.js por CDN)
data/resultados.json    # datos fusionados que consume la web
.github/workflows/update.yml        # cron + deploy a GitHub Pages
```

### Datos de ganadores (¿cuándo cayó el premio mayor?)
`scrape_premios.py` lee el desglose oficial de cada sorteo y registra, para la
categoría **"5 + SB"** (premio mayor), cuántos ganadores hubo y el monto. Cachea
en `data/premios.json` (keyed por `tipo:sorteo`) para que el cron solo consulte
los sorteos nuevos. Solo cubre el periodo oficial (2021→), porque la fuente del
histórico antiguo no publica ganadores.

## Uso local

```bash
python scrape_baloto.py          # genera/actualiza los datos
python -m http.server 8000       # sirve la landing
# abre http://localhost:8000
```

(El navegador no puede leer `data/resultados.json` con `file://` por CORS;
hay que servirlo con un servidor estático como el de arriba.)

## Datos

- **Fuente:** tabla paginada oficial de `https://baloto.com/resultados` (`?page=N`).
- **Cobertura:** la fuente oficial conserva los **últimos ~592 sorteos**
  (desde 2021-05-01), que corresponden a la modalidad vigente (5 balotas 1–43 + superbalota 1–16).
  Los sorteos anteriores ya no están disponibles en el sitio oficial.
- **Campos:** `sorteo, fecha, tipo (baloto/revancha), balotas[5], superbalota`.

## Auto-actualización

`/.github/workflows/update.yml` corre **mar/jue/dom 12:00 UTC** (mañana siguiente a
cada sorteo), re-raspa, commitea los datos si cambiaron y redepliega GitHub Pages.
También se puede lanzar manualmente desde la pestaña *Actions* (`workflow_dispatch`).

### Activar GitHub Pages
En el repo: **Settings → Pages → Source: GitHub Actions**.
