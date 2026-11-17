"""Continúa la simulación del dataset APF3 dos semanas más (2 y 9 de noviembre de 2026).

Sirve para cargar en el MVP un historial de ventas simuladas que llegue hasta la semana
anterior a la demo. NO cambia el dataset con el que se entrenó el modelo:

1. Reproduce `dataset_semanal_modelo.csv` y `ventas_diarias_sinteticas.csv` con la misma
   semilla y comprueba que salen idénticos (así se usa exactamente la misma lógica).
2. Reconstruye, talla por talla, el stock final y los pedidos en camino al 1-nov-2026.
3. Simula las semanas del 2 y 9 de noviembre con el mismo proceso de demanda
   (estacionalidad, Cyber Wow, tendencia, mayoristas, quiebres y política de reposición)
   y otra semilla, para no alterar las 52 semanas originales.

Uso:  python extender_noviembre_2026.py
Salida: extension_semanal_noviembre_2026.csv y extension_diaria_noviembre_2026.csv (origen = simulado).
"""

import numpy as np
import pandas as pd

import generar_dataset_sintetico as g

SEMILLA_EXTENSION = 20261102
SEMANAS_EXTRA = pd.date_range("2026-11-02", periods=2, freq="7D")


def cargar_reales():
    r = pd.read_csv("ventas_reales_limpias.csv", encoding="utf-8-sig")
    r["fecha"] = pd.to_datetime(r["fecha_operacion"])
    r["mes_hoja"] = r.fecha.dt.month.map({9: "Septiembre", 10: "Octubre"})
    return r


def comprobar_reproduccion(base):
    g.rng = np.random.default_rng(g.SEMILLA)
    semanal, tx = g.simular(base)
    original_s = pd.read_csv("dataset_semanal_modelo.csv", encoding="utf-8-sig")
    original_d = pd.read_csv("ventas_diarias_sinteticas.csv", encoding="utf-8-sig")
    assert len(semanal) == len(original_s) and len(tx) == len(original_d)
    for col in ["SKU", "unidades_vendidas", "unidades_recibidas", "stock_final"]:
        assert (semanal[col].astype(str).values == original_s[col].astype(str).values).all(), col
    for col in ["venta_id", "SKU", "cantidad", "metodo_pago"]:
        assert (tx[col].astype(str).values == original_d[col].astype(str).values).all(), col
    return original_s, original_d


def estado_final(semanal):
    """Stock, pedidos en camino e historial de ventas de cada SKU al cierre de la semana 52."""
    estados = {}
    for sku, sub in semanal.groupby("SKU", sort=False):
        sub = sub.sort_values("periodo_semana").reset_index(drop=True)
        lead = int(sub.tiempo_de_entrega.iloc[0])
        pendientes, hist = [], []
        for i, fila in sub.iterrows():
            recibidas = sum(q for (sem, q) in pendientes if sem == i)
            assert recibidas == fila.unidades_recibidas, (sku, fila.periodo_semana)
            pendientes = [(sem, q) for (sem, q) in pendientes if sem != i]
            hist.append(int(fila.unidades_vendidas))
            prom4 = np.mean(hist[-4:])
            en_camino = sum(q for _, q in pendientes)
            if fila.stock_final + en_camino <= prom4 * lead or (fila.stock_final + en_camino == 0):
                pendientes.append((i + lead, max(2, int(np.ceil(prom4 * 1.8)))))
        n = len(sub)
        estados[sku] = {
            "stock": int(sub.stock_final.iloc[-1]),
            "pendientes": [(sem - n, q) for (sem, q) in pendientes],  # semana relativa: 0 = 2-nov
            "hist": hist,
            "ultima": sub.iloc[-1],
        }
    return estados


def simular_extension(base, estados, ultima_venta):
    g.rng = np.random.default_rng(SEMILLA_EXTENSION)
    pesos_dia = np.array([0.15, 0.14, 0.14, 0.15, 0.18, 0.24, 0.0])
    filas, transacciones = [], []
    for pid, info in g.PRODUCTOS.items():
        prenda, tela, modelo, segmento, grupo, p26, nombre, origen, lanz, lead, _ = info
        est = g.EST_SHORT if prenda == "Short" else g.EST_PANT
        lanz_ts = pd.Timestamp(lanz)
        info_sem = []
        for lunes in SEMANAS_EXTRA:
            d = g.descuento_semana(pid, prenda, lunes)
            ev, mult_ev = g.evento_semana(lunes, prenda, segmento)
            mult = est[lunes.month] * mult_ev * g.tendencia(lunes) * (1 - d) ** g.ELASTICIDAD
            if lanz_ts > pd.Timestamp(g.FECHA_INICIO):
                mult *= g.rampa_lanzamiento(lunes, lanz)
            if modelo in ("Oversize", "Baggy") and prenda == "Pantalón":
                mult *= 1 + 0.25 * max(0, (lunes - lanz_ts).days / 365)
            mayorista = 0
            if base[pid] > 8 and g.rng.random() < 0.035:
                mayorista = int(g.rng.integers(20, 61))
            n_dias = int(np.clip(round(np.sqrt(base[pid]) / 2) + g.rng.integers(0, 2), 1, 6))
            p6 = pesos_dia[:6] / pesos_dia[:6].sum()
            dias_act = np.sort(g.rng.choice(6, size=n_dias, replace=False, p=p6))
            info_sem.append((d, ev, mult, mayorista, dias_act))

        for talla, w in zip(g.TALLAS_GRUPO[grupo], g.PESO_TALLA[grupo]):
            sku = f"{pid}-{talla}"
            e = estados[sku]
            stock, pendientes, hist, ref = e["stock"], list(e["pendientes"]), list(e["hist"]), e["ultima"]
            for i, lunes in enumerate(SEMANAS_EXTRA):
                d, ev, mult, mayorista, dias_act = info_sem[i]
                mu = base[pid] * w * mult
                k = 2.5
                retail = int(g.rng.negative_binomial(k, k / (k + mu))) if mu > 0 else 0
                may = int(round(mayorista * w)) if mayorista else 0
                demanda = retail + may
                recibidas = sum(q for (sem, q) in pendientes if sem == i)
                pendientes = [(sem, q) for (sem, q) in pendientes if sem != i]
                stock_ini = stock + recibidas
                vendidas = min(demanda, stock_ini)
                stock = stock_ini - vendidas
                hist.append(vendidas)
                prom4 = np.mean(hist[-4:])
                en_camino = sum(q for _, q in pendientes)
                if stock + en_camino <= prom4 * lead or (stock + en_camino == 0):
                    pendientes.append((i + lead, max(2, int(np.ceil(prom4 * 1.8)))))
                pl = g.precio_lista(p26, lunes)
                pu = round(pl * (1 - d), 2)
                filas.append({
                    "periodo_semana": lunes.date(), "anio": lunes.year, "mes": lunes.month,
                    "semana_iso": int(lunes.isocalendar().week), "temporada": g.temporada(lunes.month),
                    "evento": ev, "producto_id": pid, "SKU": sku, "nombre_producto": nombre,
                    "prenda": prenda, "tela": tela, "modelo": modelo, "segmento": segmento, "talla": talla,
                    "precio_lista": pl, "descuento": d, "precio_unitario": pu, "en_promocion": int(d > 0),
                    "moneda": g.MONEDA, "canal": g.CANAL,
                    "semanas_desde_lanzamiento": int((lunes - lanz_ts).days // 7),
                    "stock_disponible": stock_ini, "unidades_recibidas": recibidas,
                    "unidades_vendidas": vendidas, "stock_final": stock,
                    "tiempo_de_entrega": lead, "stock_de_seguridad": int(ref.stock_de_seguridad),
                    "quiebre_stock": int(demanda > stock_ini),
                    "demanda_no_atendida": demanda - vendidas, "demanda_real": demanda,
                    "origen": "simulado",
                })
                if vendidas == 0:
                    continue
                restante = vendidas
                if may and vendidas >= may:
                    dia = int(g.rng.choice(6, p=pesos_dia[:6] / pesos_dia[:6].sum()))
                    transacciones.append((lunes + pd.Timedelta(days=dia), pid, talla, may, pl, d, pu))
                    restante -= may
                if restante > 0:
                    pw = pesos_dia[dias_act] / pesos_dia[dias_act].sum()
                    reparto = g.rng.multinomial(restante, pw)
                    for dia, u in zip(dias_act, reparto):
                        while u > 0:
                            q = u if g.rng.random() < 0.7 else max(1, u // 2)
                            transacciones.append((lunes + pd.Timedelta(days=int(dia)), pid, talla, q, pl, d, pu))
                            u -= q

    tx = pd.DataFrame(transacciones, columns=["fecha", "producto_id", "talla", "cantidad",
                                              "precio_lista", "descuento", "precio_unitario"])
    tx["nombre_producto"] = tx.producto_id.map(lambda p: g.PRODUCTOS[p][6])
    tx["modelo"] = tx.producto_id.map(lambda p: g.PRODUCTOS[p][2])
    tx["monto_total"] = (tx.cantidad * tx.precio_unitario).round(2)
    tx["_u"] = g.rng.random(len(tx))
    tx = tx.sort_values(["fecha", "_u"]).reset_index(drop=True)
    venta, linea, nv = [], [], ultima_venta
    for _, grupo in tx.groupby("fecha", sort=True):
        n, i = len(grupo), 0
        while i < n:
            tam = int(g.rng.choice([1, 2, 3], p=[0.6, 0.3, 0.1]))
            nv += 1
            for j in range(min(tam, n - i)):
                venta.append(f"VS-{nv:06d}"); linea.append(j + 1)
            i += tam
    tx["venta_id"], tx["linea_id"] = venta, linea
    tx["SKU"] = tx.producto_id + "-" + tx.talla
    u_v = tx.groupby("venta_id")["_u"].transform("first")
    # misma tendencia de Yape que el generador, al final del periodo (fracción ≈ 1)
    tx["metodo_pago"] = np.where(u_v < g.P_YAPE_REAL - 0.04 + 0.08, "Yape", "Efectivo")
    tx["moneda"], tx["canal"], tx["origen"] = g.MONEDA, g.CANAL, "simulado"
    tx["fecha_operacion"] = tx.fecha.dt.date
    tx = tx[["fecha_operacion", "venta_id", "linea_id", "producto_id", "SKU", "nombre_producto", "modelo",
             "talla", "cantidad", "precio_lista", "descuento", "precio_unitario", "monto_total", "moneda",
             "metodo_pago", "canal", "origen"]]
    return pd.DataFrame(filas), tx


if __name__ == "__main__":
    reales = cargar_reales()
    tasas, base = g.calibrar(reales)
    g.P_YAPE_REAL = float((reales.metodo_pago.str.strip() == "Yape").mean())
    semanal, diaria = comprobar_reproduccion(base)
    estados = estado_final(semanal)
    ultima = int(diaria.venta_id.str[3:].astype(int).max())
    ext_s, ext_d = simular_extension(base, estados, ultima)
    ext_s.to_csv("extension_semanal_noviembre_2026.csv", index=False, encoding="utf-8-sig")
    ext_d.to_csv("extension_diaria_noviembre_2026.csv", index=False, encoding="utf-8-sig")
    print("reproducción idéntica; extensión:", ext_s.shape, ext_d.shape,
          "unidades:", ext_s.groupby("periodo_semana").unidades_vendidas.sum().to_dict())
