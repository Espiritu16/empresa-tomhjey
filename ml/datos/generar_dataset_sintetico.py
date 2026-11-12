"""
Generador de datos sintéticos de ventas para una MYPE de pantalones y shorts (Lima, Perú).

- Periodo: noviembre de 2025 a octubre de 2026 = 12 meses (52 semanas de lunes a domingo).
- Todo registro generado lleva origen = "simulado"; los registros reales llevan origen = "real".
- Calibrado con las ventas reales de septiembre y octubre de 2026 (Intento_Dataset.xlsx).
- Incluye los modelos del catálogo (Catalogo_Pantalones_y_Shorts.xlsx) que no aparecen en las ventas.
- Simula demanda semanal por variante (producto + talla), estacionalidad de Lima, fechas comerciales,
  promociones con elasticidad al precio, pedidos mayoristas y un inventario gestionado "por intuición"
  que produce quiebres de stock (~15 % de demanda no atendida).

Uso:  python generar_dataset_sintetico.py  [ruta_dataset_real.xlsx]
Cambia SEMILLA, FECHA_INICIO o los diccionarios de abajo para generar otras versiones.
"""
import sys
import numpy as np
import pandas as pd

SEMILLA = 42
FECHA_INICIO = "2025-11-03"   # primer lunes de noviembre de 2025
FECHA_FIN = "2026-11-01"      # domingo que cierra la última semana (oct-2026)
N_SEMANAS = (pd.Timestamp(FECHA_FIN) - pd.Timestamp(FECHA_INICIO)).days // 7 + 1   # 52 semanas = 12 meses
MONEDA = "PEN"
CANAL = "Tienda física"   # los registros reales no distinguen canal
rng = np.random.default_rng(SEMILLA)

TALLAS_ADULTO = ["28", "30", "32", "34"]
TALLAS_NINO = ["2", "4", "6", "8", "10", "12", "14", "16"]
TALLAS_LETRA = ["S", "M", "L", "XL"]
TALLAS_EXTRA = ["36", "38", "40"]
PESO_TALLA = {
    "adulto": [0.20, 0.34, 0.30, 0.16],
    "nino":   [0.08, 0.11, 0.14, 0.15, 0.15, 0.14, 0.12, 0.11],
    "letra":  [0.18, 0.35, 0.31, 0.16],
    "extra":  [0.50, 0.32, 0.18],
}

# producto_id: (prenda, tela, modelo, segmento, grupo_tallas, precio_lista_2026, nombre_en_ventas,
#               origen, fecha_lanzamiento, tiempo_entrega_semanas, demanda_base_semanal_si_no_hay_dato_real)
PRODUCTOS = {
    "P01": ("Pantalón", "Pepertash", "Semipitillo", "Adulto", "adulto", 38, "Pantalón papertash", "Ventas + catálogo", "2024-01-01", 1, None),
    "P02": ("Pantalón", "Jean stretch", "Skinny", "Adulto", "adulto", 40, "Pantalón stretch", "Ventas + catálogo", "2024-01-01", 2, None),
    "P03": ("Pantalón", "Jean", "Clásico recto", "Adulto", "adulto", 45, "Pantalón jean clásico", "Solo catálogo", "2024-01-01", 2, 4.0),
    "P04": ("Pantalón", "Jean", "Clásico recto", "Niño", "nino", 40, "Pantalón jean niño", "Ventas + catálogo", "2024-01-01", 2, None),
    "P05": ("Pantalón", "Jean", "Oversize", "Adulto", "adulto", 50, "Pantalón jean oversize", "Solo catálogo", "2024-09-02", 2, 5.0),
    "P06": ("Pantalón", "Jean", "Oversize", "Niño", "nino", 42, "Pantalón jean oversize niño", "Solo catálogo", "2024-09-02", 2, 2.5),
    "P07": ("Pantalón", "Jean", "Baggy", "Adulto", "adulto", 52, "Pantalón jean baggy", "Solo catálogo", "2025-03-03", 2, 6.0),
    "P08": ("Pantalón", "Jean", "Baggy", "Niño", "nino", 44, "Pantalón jean baggy niño", "Solo catálogo", "2025-03-03", 2, 2.5),
    "P09": ("Pantalón", "Estampado", "Estampado", "Adulto", "adulto", 45, "Pantalón estampado", "Solo ventas", "2024-01-01", 1, None),
    "P10": ("Pantalón", "Pepertash", "Extra (tallas grandes)", "Adulto", "extra", 42, "Pantalón extra", "Solo ventas", "2024-01-01", 1, None),
    "S01": ("Short", "Pepertash", "Papertash", "Adulto", "adulto", 30, "Short papertash", "Solo ventas", "2024-01-01", 1, None),
    "S02": ("Short", "Jean", "Oversize", "Adulto", "adulto", 33, "Short jean", "Ventas + catálogo", "2024-01-01", 2, None),
    "S03": ("Short", "Jean", "Oversize", "Niño", "nino", 25, "Short jean niño", "Ventas + catálogo", "2024-01-01", 2, None),
    "S04": ("Short", "Tafeta", "Skinny", "Adulto", "adulto", 30, "Short tafeta", "Ventas + catálogo", "2026-10-05", 1, 4.0),
    "S05": ("Short", "Algodón", "Jogger", "Adulto", "adulto", 30, "Short jogger", "Solo ventas", "2024-01-01", 1, None),
    "S06": ("Short", "Estampado", "Estampado", "Adulto", "adulto", 35, "Short estampado", "Solo ventas", "2024-01-01", 1, None),
    "S07": ("Short", "Pepertash", "Extra (tallas grandes)", "Adulto", "extra", 35, "Short extra", "Solo ventas", "2024-01-01", 1, None),
    "S08": ("Short", "Deportivo", "Performance extra", "Adulto", "extra", 35, "Short performance extra", "Solo ventas", "2024-01-01", 1, None),
}
TALLAS_GRUPO = {"adulto": TALLAS_ADULTO, "nino": TALLAS_NINO, "letra": TALLAS_LETRA, "extra": TALLAS_EXTRA}

# Estacionalidad mensual en Lima (verano dic-mar, invierno jun-sep)
EST_SHORT = {1: 1.50, 2: 1.50, 3: 1.30, 4: 1.00, 5: 0.80, 6: 0.65, 7: 0.70, 8: 0.70, 9: 0.85, 10: 1.00, 11: 1.20, 12: 1.60}
EST_PANT = {1: 0.80, 2: 0.80, 3: 1.05, 4: 1.00, 5: 1.15, 6: 1.30, 7: 1.40, 8: 1.20, 9: 1.00, 10: 0.95, 11: 0.95, 12: 1.30}
ELASTICIDAD = -1.6
P_YAPE_REAL = 0.45   # se recalcula con los datos reales

# ---------------------------------------------------------------- normalización de nombres reales
ALIAS = {
    "pantalon papertash": "P01", "pantalon papaertash": "P01",
    "pantalon stretch": "P02", "pantalon stretech": "P02",
    "pantalon jean nino": "P04", "pantalon estampado": "P09", "pantalon extra": "P10",
    "short papertash": "S01", "shor papertash": "S01",
    "short jean": "S02", "short jean nino": "S03", "short tafeta": "S04",
    "short jogger": "S05", "short estampado": "S06", "short extra": "S07",
    "short performance extra": "S08",
}


def normalizar(nombre):
    import unicodedata
    s = unicodedata.normalize("NFKD", str(nombre)).encode("ascii", "ignore").decode().lower()
    return " ".join(s.split())


def leer_reales(ruta):
    filas = []
    for hoja in ["Septiembre", "Octubre"]:
        d = pd.read_excel(ruta, sheet_name=hoja, header=None).iloc[3:, [1, 3, 6, 8, 10, 12]]
        d.columns = ["fecha", "nombre_original", "cantidad", "precio_unitario", "monto_total", "metodo_pago"]
        d = d.dropna(subset=["fecha"])
        d["mes_hoja"] = hoja
        filas.append(d)
    r = pd.concat(filas, ignore_index=True)
    r["fecha"] = pd.to_datetime(r["fecha"])
    r["producto_id"] = r["nombre_original"].map(lambda x: ALIAS.get(normalizar(x)))
    r["nombre_normalizado"] = r["producto_id"].map(lambda p: PRODUCTOS[p][6] if p else None)
    for c in ["cantidad", "precio_unitario", "monto_total"]:
        r[c] = pd.to_numeric(r[c])
    r["metodo_pago"] = r["metodo_pago"].astype(str).str.strip()
    r["venta_id"] = [f"VR-{i:04d}" for i in range(1, len(r) + 1)]   # cada fila del registro = 1 venta
    r["moneda"], r["canal"], r["origen"] = MONEDA, CANAL, "real"
    r["talla"] = "No registrada"
    return r


# ---------------------------------------------------------------- calendario
def evento_semana(lunes, prenda, segmento):
    """Devuelve (nombre_evento, multiplicador) para la semana que empieza en `lunes`."""
    dias = pd.date_range(lunes, periods=7)
    def contiene(m, d1, d2):
        return any((x.month == m) and (d1 <= x.day <= d2) for x in dias)
    # Día del Padre: tercer domingo de junio
    junio = pd.date_range(f"{lunes.year}-06-01", f"{lunes.year}-06-30")
    padre = junio[junio.dayofweek == 6][2]
    if contiene(12, 14, 24):
        return "Navidad", 1.65
    if contiene(12, 8, 13):
        return "Pre-Navidad", 1.25
    if contiene(7, 20, 28):
        return "Fiestas Patrias / gratificación", 1.40
    if (padre - pd.Timedelta(days=6)) <= lunes <= padre and prenda == "Pantalón" and segmento == "Adulto":
        return "Día del Padre", 1.35
    if (contiene(2, 15, 29) or contiene(3, 1, 10)) and segmento == "Niño":
        return "Campaña escolar", 1.50
    if contiene(12, 26, 31) or contiene(1, 1, 3):
        return "Año Nuevo", 1.20
    return "Ninguno", 1.0


def cyber(lunes):
    """Semanas tipo Cyber Wow (abril, julio y noviembre aprox.)."""
    for m, d in [(4, 8), (7, 8), (11, 4)]:
        f = pd.Timestamp(lunes.year, m, d)
        if lunes <= f < lunes + pd.Timedelta(days=7):
            return True
    return False


def temporada(mes):
    return {12: "Verano", 1: "Verano", 2: "Verano", 3: "Verano", 4: "Otoño", 5: "Otoño",
            6: "Invierno", 7: "Invierno", 8: "Invierno", 9: "Invierno", 10: "Primavera", 11: "Primavera"}[mes]


def descuento_semana(pid, prenda, lunes):
    if cyber(lunes):
        return 0.15
    if prenda == "Short" and ((lunes.month == 4) or (lunes.month == 5 and lunes.day <= 15)):
        return 0.20   # liquidación de verano
    if prenda == "Pantalón" and lunes.month == 10 and pid in ("P02", "P03", "P09"):
        return 0.125  # liquidación de invierno (observada en 'Pantalón stretch' oct-2026)
    if rng.random() < 0.06:
        return float(rng.choice([0.10, 0.15, 0.20]))  # promoción puntual en redes
    return 0.0


def tendencia(lunes):
    """Crecimiento del negocio: 2024 ≈ 0.82, 2025 ≈ 0.91, 2026 ≈ 1.00."""
    t = (lunes - pd.Timestamp("2026-10-01")).days / 365.0
    return float(np.exp(0.10 * t))


def rampa_lanzamiento(lunes, lanz):
    sem = (lunes - pd.Timestamp(lanz)).days / 7
    return 1 / (1 + np.exp(-(sem - 6) / 3))  # adopción progresiva en ~12 semanas


def precio_lista(base, lunes):
    return base - 2 if lunes.year == 2024 else base


# ---------------------------------------------------------------- calibración
def calibrar(reales):
    """Unidades por semana (6 días hábiles; la tienda no abre domingos) en las ventanas reales."""
    dias_habiles = {"Septiembre": 9, "Octubre": 12}
    tasas = {}
    for pid in PRODUCTOS:
        sub = reales[reales.producto_id == pid]
        vals = []
        for hoja, dh in dias_habiles.items():
            u = sub[sub.mes_hoja == hoja].cantidad.sum()
            vals.append(u / dh * 6)
        tasas[pid] = np.mean(vals)
    base = {}
    for pid, info in PRODUCTOS.items():
        prenda = info[0]
        est = EST_SHORT if prenda == "Short" else EST_PANT
        if info[10] is not None:
            base[pid] = info[10]
        else:
            # se divide entre la estacionalidad sep-oct y se sube 15 % porque lo vendido < demanda (quiebres)
            base[pid] = max(tasas[pid], 1.5) / np.mean([est[9], est[10]]) / 0.85
    return tasas, base


# ---------------------------------------------------------------- simulación
def simular(base):
    lunes_all = pd.date_range(FECHA_INICIO, periods=N_SEMANAS, freq="7D")
    filas = []
    transacciones = []
    pesos_dia = np.array([0.15, 0.14, 0.14, 0.15, 0.18, 0.24, 0.0])  # lun..dom (domingo cerrado)
    for pid, info in PRODUCTOS.items():
        prenda, tela, modelo, segmento, grupo, p26, nombre, origen, lanz, lead, _ = info
        tallas = TALLAS_GRUPO[grupo]
        pesos = PESO_TALLA[grupo]
        est = EST_SHORT if prenda == "Short" else EST_PANT
        lanz_ts = pd.Timestamp(lanz)
        # precalcular semana a semana a nivel producto (descuento común para todas las tallas)
        info_sem = []
        for lunes in lunes_all:
            if lunes < lanz_ts:
                info_sem.append(None)
                continue
            d = descuento_semana(pid, prenda, lunes)
            ev, mult_ev = evento_semana(lunes, prenda, segmento)
            mult = est[lunes.month] * mult_ev * tendencia(lunes) * (1 - d) ** ELASTICIDAD
            if lanz_ts > pd.Timestamp(FECHA_INICIO):
                mult *= rampa_lanzamiento(lunes, lanz)
            if modelo in ("Oversize", "Baggy") and prenda == "Pantalón":
                mult *= 1 + 0.25 * max(0, (lunes - lanz_ts).days / 365)   # moda en crecimiento
            # pedido mayorista ocasional (como los 64 'Pantalón papertash' del 20-oct-2026)
            mayorista = 0
            if base[pid] > 8 and rng.random() < 0.035:
                mayorista = int(rng.integers(20, 61))
            # días de la semana en que este producto tuvo ventas (las ventas reales se concentran en pocos días)
            n_dias = int(np.clip(round(np.sqrt(base[pid]) / 2) + rng.integers(0, 2), 1, 6))
            p6 = pesos_dia[:6] / pesos_dia[:6].sum()
            dias_act = np.sort(rng.choice(6, size=n_dias, replace=False, p=p6))
            info_sem.append((d, ev, mult, mayorista, dias_act))

        for talla, w in zip(tallas, pesos):
            sku = f"{pid}-{talla}"
            # parámetro de negocio: ~media semana de demanda base por cada semana de entrega
            stock_seg = max(1, int(np.ceil(0.5 * base[pid] * w * lead)))
            stock = None
            pendientes = []   # (semana_llegada, unidades)
            hist_ventas = []
            for i, lunes in enumerate(lunes_all):
                s = info_sem[i]
                if s is None:
                    continue
                d, ev, mult, mayorista, dias_act = s
                mu = base[pid] * w * mult
                k = 2.5
                retail = int(rng.negative_binomial(k, k / (k + mu))) if mu > 0 else 0
                may = int(round(mayorista * w)) if mayorista else 0
                demanda = retail + may
                if stock is None:   # stock inicial = ~4 semanas de demanda base
                    stock = int(np.ceil(base[pid] * w * 4)) + 1
                recibidas = sum(q for (sem, q) in pendientes if sem == i)
                pendientes = [(sem, q) for (sem, q) in pendientes if sem != i]
                stock_ini = stock + recibidas
                vendidas = min(demanda, stock_ini)
                stock = stock_ini - vendidas
                hist_ventas.append(vendidas)
                # política del dueño: mira lo vendido en las últimas 4 semanas, sin anticipar temporada
                prom4 = np.mean(hist_ventas[-4:])
                en_camino = sum(q for _, q in pendientes)
                pto_pedido = prom4 * (lead + 0.0)
                if stock + en_camino <= pto_pedido or (stock + en_camino == 0):
                    q = max(2, int(np.ceil(prom4 * 1.8)))
                    pendientes.append((i + lead, q))
                pl = precio_lista(p26, lunes)
                pu = round(pl * (1 - d), 2)
                filas.append({
                    "periodo_semana": lunes.date(), "anio": lunes.year, "mes": lunes.month,
                    "semana_iso": int(lunes.isocalendar().week), "temporada": temporada(lunes.month),
                    "evento": ev, "producto_id": pid, "SKU": sku, "nombre_producto": nombre,
                    "prenda": prenda, "tela": tela, "modelo": modelo, "segmento": segmento, "talla": talla,
                    "precio_lista": pl, "descuento": d, "precio_unitario": pu, "en_promocion": int(d > 0),
                    "moneda": MONEDA, "canal": CANAL,
                    "semanas_desde_lanzamiento": int((lunes - lanz_ts).days // 7),
                    "stock_disponible": stock_ini, "unidades_recibidas": recibidas,
                    "unidades_vendidas": vendidas, "stock_final": stock,
                    "tiempo_de_entrega": lead, "stock_de_seguridad": stock_seg,
                    "quiebre_stock": int(demanda > stock_ini),
                    "demanda_no_atendida": demanda - vendidas, "demanda_real": demanda,
                    "origen": "simulado",
                })
                # ------------- transacciones diarias que suman las unidades vendidas
                if vendidas == 0:
                    continue
                restante = vendidas
                if may and vendidas >= may:
                    dia = int(rng.choice(6, p=pesos_dia[:6] / pesos_dia[:6].sum()))
                    transacciones.append((lunes + pd.Timedelta(days=dia), pid, talla, may, pl, d, pu))
                    restante -= may
                if restante > 0:
                    pw = pesos_dia[dias_act] / pesos_dia[dias_act].sum()
                    reparto = rng.multinomial(restante, pw)
                    for dia, u in zip(dias_act, reparto):
                        while u > 0:   # una o pocas líneas por día
                            q = u if rng.random() < 0.7 else max(1, u // 2)
                            transacciones.append((lunes + pd.Timedelta(days=int(dia)), pid, talla, q, pl, d, pu))
                            u -= q
    semanal = pd.DataFrame(filas)
    tx = pd.DataFrame(transacciones, columns=["fecha", "producto_id", "talla", "cantidad",
                                              "precio_lista", "descuento", "precio_unitario"])
    tx["nombre_producto"] = tx.producto_id.map(lambda p: PRODUCTOS[p][6])
    tx["modelo"] = tx.producto_id.map(lambda p: PRODUCTOS[p][2])
    tx["monto_total"] = (tx.cantidad * tx.precio_unitario).round(2)
    # Yape gana algo de participación durante el año (calibrado con sep-oct 2026)
    tx["_u"] = rng.random(len(tx))
    tx = tx.sort_values(["fecha", "_u"]).reset_index(drop=True)
    # agrupar líneas del mismo día en ventas (boletas) de 1 a 3 líneas
    venta, linea, nv = [], [], 0
    for _, grupo in tx.groupby("fecha", sort=True):
        n, i = len(grupo), 0
        while i < n:
            tam = int(rng.choice([1, 2, 3], p=[0.6, 0.3, 0.1]))
            nv += 1
            for j in range(min(tam, n - i)):
                venta.append(f"VS-{nv:06d}"); linea.append(j + 1)
            i += tam
    tx["venta_id"], tx["linea_id"] = venta, linea
    tx["SKU"] = tx.producto_id + "-" + tx.talla
    frac_v = tx.groupby("venta_id").fecha.transform("first")
    frac_v = (frac_v - pd.Timestamp(FECHA_INICIO)).dt.days / (N_SEMANAS * 7)
    u_v = tx.groupby("venta_id")["_u"].transform("first")
    tx["metodo_pago"] = np.where(u_v < P_YAPE_REAL - 0.04 + 0.08 * frac_v, "Yape", "Efectivo")
    tx["moneda"], tx["canal"], tx["origen"] = MONEDA, CANAL, "simulado"
    tx["fecha_operacion"] = tx.fecha.dt.date
    tx = tx[["fecha_operacion", "venta_id", "linea_id", "producto_id", "SKU", "nombre_producto", "modelo",
             "talla", "cantidad", "precio_lista", "descuento", "precio_unitario", "monto_total", "moneda",
             "metodo_pago", "canal", "origen"]]
    return semanal, tx


def catalogo_df(base, tasas):
    filas = []
    for pid, i in PRODUCTOS.items():
        filas.append({
            "producto_id": pid, "nombre_producto": i[6], "prenda": i[0], "tela": i[1], "modelo": i[2],
            "segmento": i[3], "tallas": ", ".join(TALLAS_GRUPO[i[4]]), "precio_lista_2026": i[5],
            "fuente_producto": i[7], "fecha_lanzamiento": pd.Timestamp(i[8]).date(),
            "tiempo_entrega_semanas": i[9],
            "venta_real_semanal_sep_oct_2026": round(tasas[pid], 1),
            "demanda_base_semanal_usada": round(base[pid], 1),
        })
    return pd.DataFrame(filas)


if __name__ == "__main__":
    ruta = sys.argv[1] if len(sys.argv) > 1 else "Intento_Dataset.xlsx"
    reales = leer_reales(ruta)
    tasas, base = calibrar(reales)
    P_YAPE_REAL = float((reales.metodo_pago.str.strip() == "Yape").mean())
    semanal, tx = simular(base)
    cat = catalogo_df(base, tasas)
    semanal.to_csv("dataset_semanal_modelo.csv", index=False, encoding="utf-8-sig")
    tx.to_csv("ventas_diarias_sinteticas.csv", index=False, encoding="utf-8-sig")
    cat.to_csv("catalogo_productos.csv", index=False, encoding="utf-8-sig")
    reales.to_csv("ventas_reales_limpias.csv", index=False, encoding="utf-8-sig")
    print(semanal.shape, tx.shape)
