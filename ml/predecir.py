"""
Predicción de demanda semanal por SKU para Tomhjey Jeans (APF3).

Carga el modelo exportado por el notebook (modelo/modelo_demanda.joblib) y responde
a un registro con los campos que el MVP ya captura. Devuelve las unidades estimadas
para la semana y una sugerencia de reposición.

Uso:
    python predecir.py ejemplo_entrada.json        # imprime la respuesta en JSON
    python predecir.py --servir 8000               # endpoint POST /predecir
"""

from __future__ import annotations

import json
import math
import sys
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

RUTA_MODELO = Path(__file__).resolve().parent / "modelo" / "modelo_demanda.joblib"

CAMPOS_OBLIGATORIOS = (
    "producto_id",
    "talla",
    "semana",
    "precio_lista",
    "ventas_ultimas_4_semanas",
    "stock_actual",
)

_cache: dict = {}


# ------------------------------------------------------------------ calendario
# Mismas reglas de temporada y fechas comerciales de Lima usadas al construir el dataset.
def temporada(mes: int) -> str:
    return {
        12: "Verano", 1: "Verano", 2: "Verano", 3: "Verano",
        4: "Otoño", 5: "Otoño",
        6: "Invierno", 7: "Invierno", 8: "Invierno", 9: "Invierno",
        10: "Primavera", 11: "Primavera",
    }[mes]


def evento_semana(lunes: date, prenda: str, segmento: str) -> str:
    dias = [lunes + timedelta(days=i) for i in range(7)]

    def contiene(mes: int, d1: int, d2: int) -> bool:
        return any(x.month == mes and d1 <= x.day <= d2 for x in dias)

    domingos_junio = [
        date(lunes.year, 6, d)
        for d in range(1, 31)
        if date(lunes.year, 6, d).weekday() == 6
    ]
    dia_padre = domingos_junio[2]
    if contiene(12, 14, 24):
        return "Navidad"
    if contiene(12, 8, 13):
        return "Pre-Navidad"
    if contiene(7, 20, 28):
        return "Fiestas Patrias / gratificación"
    if (
        dia_padre - timedelta(days=6) <= lunes <= dia_padre
        and prenda == "Pantalón"
        and segmento == "Adulto"
    ):
        return "Día del Padre"
    if (contiene(2, 15, 29) or contiene(3, 1, 10)) and segmento == "Niño":
        return "Campaña escolar"
    if contiene(12, 26, 31) or contiene(1, 1, 3):
        return "Año Nuevo"
    return "Ninguno"


# ------------------------------------------------------------------ modelo
def cargar_modelo(ruta: Path = RUTA_MODELO) -> dict:
    if ruta not in _cache:
        _cache[ruta] = joblib.load(ruta)
    return _cache[ruta]


def construir_fila(registro: dict, catalogo: dict) -> pd.DataFrame:
    """Convierte el JSON del MVP en la fila de variables que espera el modelo."""
    faltantes = [c for c in CAMPOS_OBLIGATORIOS if c not in registro]
    if faltantes:
        raise ValueError(f"Faltan campos obligatorios: {', '.join(faltantes)}")

    producto_id = str(registro["producto_id"])
    if producto_id not in catalogo:
        raise ValueError(f"Producto desconocido: {producto_id}")
    producto = catalogo[producto_id]
    talla = str(registro["talla"])
    if talla not in producto["tallas"]:
        raise ValueError(f"La talla {talla} no existe para {producto_id}")

    lunes = date.fromisoformat(str(registro["semana"]))
    if lunes.weekday() != 0:
        raise ValueError("semana debe ser la fecha del lunes que inicia la semana")

    historial = [float(x) for x in registro["ventas_ultimas_4_semanas"]]
    if len(historial) != 4 or any(x < 0 for x in historial):
        raise ValueError(
            "ventas_ultimas_4_semanas necesita 4 valores ≥ 0, del más antiguo al más reciente"
        )

    precio_lista = float(registro["precio_lista"])
    descuento = float(registro.get("descuento", 0.0))
    if precio_lista <= 0 or not 0 <= descuento <= 0.5:
        raise ValueError("precio_lista debe ser > 0 y descuento estar entre 0 y 0.5")

    semana_iso = lunes.isocalendar().week
    evento = evento_semana(lunes, producto["prenda"], producto["segmento"])
    lanzamiento = date.fromisoformat(producto["fecha_lanzamiento"])

    fila = {
        "producto_id": producto_id,
        "talla": talla,
        "prenda": producto["prenda"],
        "modelo": producto["modelo"],
        "segmento": producto["segmento"],
        "temporada": temporada(lunes.month),
        "evento": evento,
        "venta_lag1": historial[3],
        "venta_lag2": historial[2],
        "venta_lag4": historial[0],
        "media_4": float(np.mean(historial)),
        "quiebre_lag1": int(bool(registro.get("hubo_quiebre_semana_anterior", False))),
        "precio_unitario": round(precio_lista * (1 - descuento), 2),
        "descuento": descuento,
        "en_promocion": int(descuento > 0),
        "es_evento": int(evento != "Ninguno"),
        "semanas_desde_lanzamiento": max(0, (lunes - lanzamiento).days // 7),
        "semana_sen": math.sin(2 * math.pi * semana_iso / 52),
        "semana_cos": math.cos(2 * math.pi * semana_iso / 52),
        "tiempo_de_entrega": int(
            registro.get("tiempo_entrega_semanas", producto["tiempo_entrega_semanas"])
        ),
    }
    return pd.DataFrame([fila])


def predecir(registro: dict, ruta: Path = RUTA_MODELO) -> dict:
    """Devuelve las unidades estimadas para la semana y la reposición sugerida."""
    artefacto = cargar_modelo(ruta)
    fila = construir_fila(registro, artefacto["catalogo"])[artefacto["variables"]]
    estimadas = max(0.0, float(artefacto["modelo"].predict(fila)[0]))

    tiempo_entrega = int(fila["tiempo_de_entrega"].iloc[0])
    stock_actual = float(registro["stock_actual"])
    stock_seguridad = float(registro.get("stock_seguridad", 0))
    # Cubrir la semana actual más las semanas que tarda en llegar el pedido.
    necesidad = estimadas * (tiempo_entrega + 1) + stock_seguridad
    reponer = max(0, math.ceil(necesidad - stock_actual))

    return {
        "sku": f"{registro['producto_id']}-{registro['talla']}",
        "semana": str(registro["semana"]),
        "evento": str(fila["evento"].iloc[0]),
        "unidades_estimadas": round(estimadas, 2),
        "unidades_estimadas_redondeadas": int(round(estimadas)),
        "cobertura_semanas": tiempo_entrega + 1,
        "reposicion_sugerida": reponer,
        "accion": "reponer" if reponer > 0 else "stock suficiente",
        "modelo": artefacto["nombre_modelo"],
        "mae_prueba": artefacto["metricas_prueba"]["MAE"],
    }


# ------------------------------------------------------------------ endpoint
class _Manejador(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 (nombre exigido por http.server)
        if self.path != "/predecir":
            self._responder(404, {"error": "Ruta no encontrada"})
            return
        try:
            largo = int(self.headers.get("Content-Length", 0))
            registro = json.loads(self.rfile.read(largo) or b"{}")
            self._responder(200, predecir(registro))
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            self._responder(400, {"error": str(error)})

    def _responder(self, codigo: int, cuerpo: dict) -> None:
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)


def servir(puerto: int = 8000) -> None:
    cargar_modelo()
    print(f"Endpoint listo en http://127.0.0.1:{puerto}/predecir (POST JSON)")
    HTTPServer(("127.0.0.1", puerto), _Manejador).serve_forever()


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--servir":
        servir(int(sys.argv[2]) if len(sys.argv) > 2 else 8000)
    elif len(sys.argv) == 2:
        with open(sys.argv[1], encoding="utf-8") as archivo:
            print(json.dumps(predecir(json.load(archivo)), ensure_ascii=False, indent=2))
    else:
        print(__doc__)
