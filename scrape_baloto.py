#!/usr/bin/env python3
"""
Scraper del historico completo del Baloto Colombia (fuente oficial baloto.com).

Recorre la tabla paginada de https://baloto.com/resultados (?page=N) y extrae,
para cada sorteo, los resultados de Baloto y de Revancha:
  sorteo, fecha (ISO), tipo, n1..n5, superbalota

Solo usa la libreria estandar (no requiere pip install).
Salida: baloto_resultados.csv
"""

import csv
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timezone

BASE = "https://baloto.com/resultados"
OUT = "baloto_resultados.csv"
JSON_OUT = os.path.join("data", "resultados.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BalotoHistoryScraper/1.0"

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

ROW_RE = re.compile(r"<tr.*?</tr>", re.S | re.I)
TABLE_RE = re.compile(r"<table.*?</table>", re.S | re.I)
DATE_RE = re.compile(r"(\d{1,2})\s+de\s+([A-Za-zÁ-úáéíóúñ]+)\s+de\s+(\d{4})", re.I)
NUMS_RE = re.compile(r"(\d{1,2}(?:\s*-\s*\d{1,2}){4})\s*-\s*<span[^>]*>(\d{1,2})</span>", re.S | re.I)
LINK_RE = re.compile(r'href="/resultados-(baloto|revancha)/(\d+)"')


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


def parse_fecha(texto):
    m = DATE_RE.search(texto)
    if not m:
        return ""
    d, mes, y = m.group(1), m.group(2).lower(), m.group(3)
    mes_num = MESES.get(mes)
    if not mes_num:
        return ""
    return date(int(y), mes_num, int(d)).isoformat()


def detectar_ultima_pagina(html):
    paginas = [int(n) for n in re.findall(r"\?page=(\d+)", html)]
    return max(paginas) if paginas else 1


def parse_pagina(html):
    """Devuelve lista de filas: (sorteo, fecha_iso, tipo, [n1..n5], super)."""
    tabla = TABLE_RE.search(html)
    if not tabla:
        return []
    filas = []
    for tr in ROW_RE.findall(tabla.group(0)):
        link = LINK_RE.search(tr)
        nums = NUMS_RE.search(tr)
        if not link or not nums:
            continue  # cabecera u otras filas
        tipo = link.group(1)            # baloto | revancha
        sorteo = int(link.group(2))
        fecha = parse_fecha(tr)
        principales = [int(x) for x in re.split(r"\s*-\s*", nums.group(1))]
        superbalota = int(nums.group(2))
        if len(principales) != 5:
            continue
        filas.append((sorteo, fecha, tipo, principales, superbalota))
    return filas


def main():
    print(f"Descargando pagina 1 de {BASE} ...")
    primera = fetch(BASE)
    ultima = detectar_ultima_pagina(primera)
    print(f"Ultima pagina detectada: {ultima}")

    vistos = set()
    registros = []

    def agregar(html):
        for sorteo, fecha, tipo, principales, sup in parse_pagina(html):
            clave = (sorteo, tipo)
            if clave in vistos:
                continue
            vistos.add(clave)
            registros.append((sorteo, fecha, tipo, *principales, sup))

    agregar(primera)
    for page in range(2, ultima + 1):
        url = f"{BASE}?page={page}"
        try:
            html = fetch(url)
        except RuntimeError as e:
            print(f"  ! {e}", file=sys.stderr)
            continue
        agregar(html)
        if page % 10 == 0 or page == ultima:
            print(f"  pagina {page}/{ultima} - acumulados {len(registros)} registros")
        time.sleep(0.4)  # cortesia con el servidor

    registros.sort(key=lambda r: (r[0], r[2]))

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["sorteo", "fecha", "tipo", "n1", "n2", "n3", "n4", "n5", "superbalota"])
        w.writerows(registros)

    # JSON para el frontend (data/resultados.json)
    os.makedirs(os.path.dirname(JSON_OUT), exist_ok=True)
    sorteos = [
        {
            "sorteo": r[0],
            "fecha": r[1],
            "tipo": r[2],
            "balotas": list(r[3:8]),
            "superbalota": r[8],
        }
        for r in registros
    ]
    payload = {
        "actualizado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fuente": BASE,
        "total": len(sorteos),
        "rango_fechas": [
            min((s["fecha"] for s in sorteos if s["fecha"]), default=""),
            max((s["fecha"] for s in sorteos if s["fecha"]), default=""),
        ],
        "sorteos": sorteos,
    }
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nListo: {len(registros)} registros -> {OUT} y {JSON_OUT}")
    if registros:
        print(f"Rango de sorteos: {registros[0][0]} a {registros[-1][0]}")


if __name__ == "__main__":
    main()
