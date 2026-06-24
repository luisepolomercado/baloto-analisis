#!/usr/bin/env python3
"""
Enriquecedor de premios: averigua, por sorteo, si alguien GANÓ el premio mayor
(categoría "5 + SB") y cuánto, leyendo el desglose de las páginas de detalle
oficiales de baloto.com.

- Solo aplica a los sorteos oficiales (los que tienen número de sorteo;
  el histórico 2017-2021 de la fuente secundaria no publica ganadores).
- Cachea en data/premios.json keyed por "tipo:sorteo", así el cron diario solo
  descarga los sorteos nuevos (incremental).
- Reescribe data/resultados.json agregando el campo "premio_mayor" a cada
  registro oficial: {"ganadores": N, "valor": $, "acumulo": bool}.

Solo libreria estandar. Ejecutar DESPUÉS de scrape_baloto.py.
"""

import json
import os
import re
import time
import urllib.request

RES = os.path.join("data", "resultados.json")
CACHE = os.path.join("data", "premios.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BalotoHistoryScraper/1.0"
URL = "https://baloto.com/resultados-{tipo}/{sorteo}"

# "5 + SB  $<total>  <ganadores>  $<por ganador>"
MAYOR_RE = re.compile(r"5\s*\+\s*SB\s*\$([\d.]*)\s+([\d.]+)\s+\$([\d.]*)")


def fetch(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="ignore")
        except Exception:  # noqa: BLE001
            time.sleep(1.0 * (i + 1))
    return None


def parse_premio_mayor(html):
    txt = re.sub(r"<[^>]+>", " ", html)
    txt = re.sub(r"\s+", " ", txt)
    m = MAYOR_RE.search(txt)
    if not m:
        return None
    total = int(m.group(1).replace(".", "") or 0)
    ganadores = int(m.group(2).replace(".", ""))
    return {"ganadores": ganadores, "valor": total, "acumulo": ganadores == 0}


def main():
    with open(RES, encoding="utf-8") as f:
        payload = json.load(f)
    sorteos = payload["sorteos"]

    cache = {}
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)

    pendientes = [s for s in sorteos
                  if s.get("sorteo") is not None and f"{s['tipo']}:{s['sorteo']}" not in cache]
    print(f"{len(cache)} en cache · {len(pendientes)} sorteos por consultar")

    nuevos = 0
    for i, s in enumerate(pendientes, 1):
        key = f"{s['tipo']}:{s['sorteo']}"
        html = fetch(URL.format(tipo=s["tipo"], sorteo=s["sorteo"]))
        if html:
            info = parse_premio_mayor(html)
            if info:
                cache[key] = info
                nuevos += 1
        if i % 50 == 0:
            print(f"  {i}/{len(pendientes)} consultados · {nuevos} ok")
            with open(CACHE, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
        time.sleep(0.25)

    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))

    # enriquecer resultados.json
    ganados = 0
    for s in sorteos:
        if s.get("sorteo") is None:
            continue
        info = cache.get(f"{s['tipo']}:{s['sorteo']}")
        if info:
            s["premio_mayor"] = info
            if info["ganadores"] > 0:
                ganados += 1
    with open(RES, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nListo: {len(cache)} sorteos con premio · {ganados} sorteos donde CAYÓ el premio mayor")


if __name__ == "__main__":
    main()
