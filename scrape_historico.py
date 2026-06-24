#!/usr/bin/env python3
"""
Scraper del histórico ANTIGUO del Baloto (2017-04-22 .. 2021-04-30).

La web oficial (baloto.com) solo conserva los ~592 sorteos más recientes
(desde 2021-05). Para completar la historia de la modalidad vigente
(5 balotas 1-43 + superbalota 1-16, que arrancó el 22/04/2017) usamos una
fuente secundaria con archivo por año: resultados-de-loteria.com.

Este histórico es estático (el pasado no cambia), así que se rasca UNA vez y
se guarda en data/historico_2017_2021.json. El pipeline diario (scrape_baloto.py)
lo fusiona con los datos oficiales recientes.

Solo libreria estandar. Salida: data/historico_2017_2021.json
"""

import json
import os
import re
import time
import urllib.request
from datetime import date

ANIOS = [2017, 2018, 2019, 2020, 2021]
URL = "https://resultados-de-loteria.com/baloto/resultados/{anio}"
OUT = os.path.join("data", "historico_2017_2021.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BalotoHistoryScraper/1.0"

# Modalidad vigente: superbalota desde el 22/04/2017.
INICIO = date(2017, 4, 22)
# El oficial es autoritativo desde 2021-05-01; cortamos aquí para no solaparnos.
FIN = date(2021, 4, 30)

ROW_RE = re.compile(r"<tr.*?</tr>", re.S | re.I)
DATE_RE = re.compile(r"resultados/(\d{2})-(\d{2})-(\d{4})")
UL_RE = re.compile(r'<ul class="balls clas">(.*?)</ul>', re.S | re.I)
BALL_RE = re.compile(r'<li class="ball">\s*(\d{1,2})\s*</li>', re.S | re.I)


def fetch(url, retries=4):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="ignore")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"Fallo al descargar {url}: {last}")


def parse_anio(html):
    registros = []
    for tr in ROW_RE.findall(html):
        md = DATE_RE.search(tr)
        if not md:
            continue
        dd, mm, yyyy = int(md.group(1)), int(md.group(2)), int(md.group(3))
        try:
            f = date(yyyy, mm, dd)
        except ValueError:
            continue
        if f < INICIO or f > FIN:
            continue
        # Dos bloques <ul>: [0]=Baloto, [1]=Revancha; cada uno 5 balotas + superbalota
        bloques = UL_RE.findall(tr)
        for idx, tipo in ((0, "baloto"), (1, "revancha")):
            if idx >= len(bloques):
                continue
            nums = [int(x) for x in BALL_RE.findall(bloques[idx])]
            if len(nums) != 6:
                continue
            balotas, sup = nums[:5], nums[5]
            registros.append({
                "sorteo": None,            # esta fuente no expone el numero de sorteo
                "fecha": f.isoformat(),
                "tipo": tipo,
                "balotas": balotas,
                "superbalota": sup,
            })
    return registros


def main():
    todos = []
    for anio in ANIOS:
        url = URL.format(anio=anio)
        print(f"Descargando {anio} ...")
        html = fetch(url)
        regs = parse_anio(html)
        print(f"  {anio}: {len(regs)} registros (en rango {INICIO}..{FIN})")
        todos.extend(regs)
        time.sleep(0.6)

    # dedup por (fecha, tipo) y orden cronologico
    vistos = {}
    for r in todos:
        vistos[(r["fecha"], r["tipo"])] = r
    registros = sorted(vistos.values(), key=lambda r: (r["fecha"], r["tipo"]))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(registros, f, ensure_ascii=False, separators=(",", ":"))

    fechas = [r["fecha"] for r in registros]
    print(f"\nListo: {len(registros)} registros -> {OUT}")
    if fechas:
        print(f"Rango: {min(fechas)} .. {max(fechas)}")


if __name__ == "__main__":
    main()
