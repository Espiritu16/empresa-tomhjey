import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import QRCode from "qrcode";
import type { DatosComprobanteImpresion } from "./consultas";

const MILIMETROS_A_PUNTOS = 72 / 25.4;
const ANCHO_PAPEL = 80 * MILIMETROS_A_PUNTOS;
const MARGEN_HORIZONTAL = 17;
const ANCHO_CONTENIDO = ANCHO_PAPEL - MARGEN_HORIZONTAL * 2;
const TINTA = rgb(0, 0, 0);

const EMISOR = {
  nombre: "ESCOBAL QUISQUICHE JOSE JOEL",
  ruc: "10473656774",
  direccion: "AV. BAUZATE Y MEZA 1532 INT. C-20",
  ubicacion: "GALERIAS SHADDAI - LA VICTORIA - LIMA",
} as const;

type OperacionDibujo =
  | {
      tipo: "texto";
      texto: string;
      x: number;
      arriba: number;
      tamano: number;
      fuente: PDFFont;
    }
  | { tipo: "linea"; arriba: number }
  | { tipo: "qr"; arriba: number; matriz: ReturnType<typeof QRCode.create> };

export async function generarPdfComprobante(
  datos: DatosComprobanteImpresion,
): Promise<Uint8Array> {
  const documento = await PDFDocument.create();
  const normal = await documento.embedFont(StandardFonts.Helvetica);
  const negrita = await documento.embedFont(StandardFonts.HelveticaBold);
  const operaciones: OperacionDibujo[] = [];
  let arriba = 12;

  function agregarTexto(
    texto: string,
    opciones: {
      tamano?: number;
      fuente?: PDFFont;
      alineacion?: "izquierda" | "centro" | "derecha";
      ancho?: number;
      x?: number;
      interlineado?: number;
    } = {},
  ) {
    const tamano = opciones.tamano ?? 9;
    const fuente = opciones.fuente ?? normal;
    const ancho = opciones.ancho ?? ANCHO_CONTENIDO;
    const lineas = envolverTexto(texto, fuente, tamano, ancho);
    const interlineado = opciones.interlineado ?? tamano + 2;

    for (const linea of lineas) {
      const anchoTexto = fuente.widthOfTextAtSize(linea, tamano);
      const xBase = opciones.x ?? MARGEN_HORIZONTAL;
      let x = xBase;
      if (opciones.alineacion === "centro") {
        x = (ANCHO_PAPEL - anchoTexto) / 2;
      }
      if (opciones.alineacion === "derecha") {
        x = xBase + ancho - anchoTexto;
      }
      operaciones.push({
        tipo: "texto",
        texto: linea,
        x,
        arriba,
        tamano,
        fuente,
      });
      arriba += interlineado;
    }
  }

  function agregarRegla() {
    operaciones.push({ tipo: "linea", arriba });
    arriba += 8;
  }

  function agregarParTexto(etiqueta: string, valor: string) {
    agregarTexto(`${etiqueta}: ${valor}`, { tamano: 9, interlineado: 11 });
  }

  const tipo = datos.tipo === "factura" ? "FACTURA" : "BOLETA";
  agregarTexto(EMISOR.nombre, {
    tamano: 10,
    fuente: negrita,
    alineacion: "centro",
    interlineado: 12,
  });
  agregarTexto(`RUC ${EMISOR.ruc}`, {
    tamano: 9,
    fuente: negrita,
    alineacion: "centro",
  });
  agregarTexto(EMISOR.direccion, { tamano: 9, alineacion: "centro" });
  agregarTexto(EMISOR.ubicacion, { tamano: 9, alineacion: "centro" });
  arriba += 3;
  agregarTexto(`${tipo} DE VENTA ELECTRONICA`, {
    tamano: 10,
    fuente: negrita,
    alineacion: "centro",
    interlineado: 12,
  });
  agregarTexto(`${datos.serie}-${String(datos.numero).padStart(8, "0")}`, {
    tamano: 10,
    fuente: negrita,
    alineacion: "centro",
    interlineado: 12,
  });
  arriba += 5;

  if (datos.tipo === "factura") {
    agregarTexto("ADQUIRIENTE", {
      tamano: 9,
      fuente: negrita,
      interlineado: 11,
    });
    if (datos.clienteTipoDocumento && datos.clienteNumeroDocumento) {
      agregarParTexto(
        etiquetaDocumento(datos.clienteTipoDocumento),
        datos.clienteNumeroDocumento,
      );
    }
    agregarParTexto("Cliente", datos.clienteNombre);
    if (datos.clienteDireccion)
      agregarParTexto("Direccion", datos.clienteDireccion);
    agregarParTexto("Fecha emision", formatearFecha(datos.fecha));
  } else {
    agregarParTexto("Fecha emision", formatearFecha(datos.fecha));
    if (datos.clienteTipoDocumento === "dni" && datos.clienteNumeroDocumento) {
      agregarParTexto("DNI", datos.clienteNumeroDocumento);
    }
  }
  agregarRegla();

  const anchoImporte = 45;
  const anchoDescripcion = ANCHO_CONTENIDO - anchoImporte - 8;
  operaciones.push({
    tipo: "texto",
    texto: "CANT. / DESCRIPCION",
    x: MARGEN_HORIZONTAL,
    arriba,
    tamano: 9,
    fuente: negrita,
  });
  const anchoTituloTotal = negrita.widthOfTextAtSize("TOTAL", 9);
  operaciones.push({
    tipo: "texto",
    texto: "TOTAL",
    x: ANCHO_PAPEL - MARGEN_HORIZONTAL - anchoTituloTotal,
    arriba,
    tamano: 9,
    fuente: negrita,
  });
  arriba += 11;

  for (const linea of datos.lineas) {
    const unidad = linea.unidadMedida === "NIU" ? "" : `${linea.unidadMedida} `;
    const descripcion = `${formatearCantidad(linea.cantidad)} ${unidad}${linea.descripcion}`;
    const inicio = arriba;
    const lineasDescripcion = envolverTexto(
      descripcion,
      normal,
      9,
      anchoDescripcion,
    );
    for (const texto of lineasDescripcion) {
      agregarTexto(texto, {
        tamano: 9,
        ancho: anchoDescripcion,
        interlineado: 11,
      });
    }
    operaciones.push({
      tipo: "texto",
      texto: limitarTexto(
        formatearMoneda(linea.total, datos.moneda),
        negrita,
        9,
        anchoImporte,
      ),
      x:
        MARGEN_HORIZONTAL +
        anchoDescripcion +
        8 +
        anchoImporte -
        negrita.widthOfTextAtSize(
          limitarTexto(
            formatearMoneda(linea.total, datos.moneda),
            negrita,
            8,
            anchoImporte,
          ),
          9,
        ),
      arriba: inicio,
      tamano: 9,
      fuente: negrita,
    });
    arriba += 2;
    agregarTexto(`P/U ${formatearMoneda(linea.precioUnitario, datos.moneda)}`, {
      tamano: 8,
      interlineado: 10,
    });
    agregarRegla();
  }

  agregarTotal(
    "GRAVADA",
    formatearMoneda(datos.subtotal, datos.moneda),
    negrita,
  );
  agregarTotal("IGV", formatearMoneda(datos.igv, datos.moneda), normal);
  agregarTotal("TOTAL", formatearMoneda(datos.total, datos.moneda), negrita, 9);
  agregarRegla();
  agregarTexto("Representacion impresa del comprobante electronico", {
    tamano: 8,
    alineacion: "centro",
    interlineado: 10,
  });

  if (datos.cadenaQr?.trim()) {
    arriba += 8;
    const matriz = QRCode.create(datos.cadenaQr, {
      errorCorrectionLevel: "M",
    });
    operaciones.push({ tipo: "qr", arriba, matriz });
    arriba += 132;
    agregarTexto("Consulta este comprobante con el codigo QR", {
      tamano: 8,
      alineacion: "centro",
      interlineado: 10,
    });
  }

  const altoPagina = Math.max(arriba + 12, 280);
  const pagina = documento.addPage([ANCHO_PAPEL, altoPagina]);
  dibujarOperaciones(pagina, operaciones, altoPagina);
  return documento.save();

  function agregarTotal(
    etiqueta: string,
    valor: string,
    fuente: PDFFont,
    tamano = 9,
  ) {
    const valorLimitado = limitarTexto(valor, fuente, tamano, ANCHO_CONTENIDO);
    const arribaFila = arriba;
    operaciones.push({
      tipo: "texto",
      texto: etiqueta,
      x: MARGEN_HORIZONTAL,
      arriba: arribaFila,
      tamano,
      fuente,
    });
    operaciones.push({
      tipo: "texto",
      texto: valorLimitado,
      x:
        MARGEN_HORIZONTAL +
        ANCHO_CONTENIDO -
        fuente.widthOfTextAtSize(valorLimitado, tamano),
      arriba: arribaFila,
      tamano,
      fuente,
    });
    arriba += tamano + 2;
  }
}

function dibujarOperaciones(
  pagina: PDFPage,
  operaciones: OperacionDibujo[],
  altoPagina: number,
) {
  for (const operacion of operaciones) {
    if (operacion.tipo === "texto") {
      pagina.drawText(operacion.texto, {
        x: operacion.x,
        y: altoPagina - operacion.arriba - operacion.tamano,
        size: operacion.tamano,
        font: operacion.fuente,
        color: TINTA,
      });
    } else if (operacion.tipo === "linea") {
      pagina.drawLine({
        start: { x: MARGEN_HORIZONTAL, y: altoPagina - operacion.arriba },
        end: {
          x: ANCHO_PAPEL - MARGEN_HORIZONTAL,
          y: altoPagina - operacion.arriba,
        },
        thickness: 0.5,
        color: TINTA,
      });
    } else {
      dibujarQr(pagina, operacion.matriz, altoPagina - operacion.arriba - 120);
    }
  }
}

function dibujarQr(
  pagina: PDFPage,
  qr: ReturnType<typeof QRCode.create>,
  y: number,
) {
  const tamano = 120;
  const margen = 4;
  const paso = tamano / (qr.modules.size + margen * 2);
  const x0 = (ANCHO_PAPEL - tamano) / 2 + margen * paso;
  const y0 = y + margen * paso;

  pagina.drawRectangle({
    x: (ANCHO_PAPEL - tamano) / 2,
    y,
    width: tamano,
    height: tamano,
    color: rgb(1, 1, 1),
  });

  for (let fila = 0; fila < qr.modules.size; fila += 1) {
    for (let columna = 0; columna < qr.modules.size; columna += 1) {
      if (qr.modules.get(fila, columna) !== 1) continue;
      pagina.drawRectangle({
        x: x0 + columna * paso,
        y: y0 + (qr.modules.size - fila - 1) * paso,
        width: paso + 0.1,
        height: paso + 0.1,
        color: TINTA,
      });
    }
  }
}

function envolverTexto(
  texto: string,
  fuente: PDFFont,
  tamano: number,
  ancho: number,
) {
  const palabras = normalizarTexto(texto).split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let linea = "";

  for (const palabra of palabras) {
    const candidata = linea ? `${linea} ${palabra}` : palabra;
    if (fuente.widthOfTextAtSize(candidata, tamano) <= ancho || !linea) {
      linea = candidata;
    } else {
      lineas.push(linea);
      linea = palabra;
    }
  }
  if (linea) lineas.push(linea);
  return lineas.length ? lineas : [""];
}

function limitarTexto(
  texto: string,
  fuente: PDFFont,
  tamano: number,
  ancho: number,
) {
  const normalizado = normalizarTexto(texto);
  if (fuente.widthOfTextAtSize(normalizado, tamano) <= ancho)
    return normalizado;
  let limitado = normalizado;
  while (
    limitado.length > 1 &&
    fuente.widthOfTextAtSize(`${limitado}...`, tamano) > ancho
  ) {
    limitado = limitado.slice(0, -1);
  }
  return `${limitado}...`;
}

function normalizarTexto(texto: string) {
  return texto
    .normalize("NFC")
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .replace(/[^\u0009-\u00ff]/g, "");
}

function etiquetaDocumento(tipo: string) {
  switch (tipo) {
    case "dni":
      return "DNI";
    case "ruc":
      return "RUC";
    case "ce":
      return "CE";
    case "pasaporte":
      return "Pasaporte";
    default:
      return "Documento";
  }
}

function formatearFecha(valor: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(valor));
}

function formatearMoneda(valor: number, moneda: "PEN" | "USD") {
  const numero = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
  return `${moneda === "PEN" ? "S/" : "US$"} ${numero}`;
}

function formatearCantidad(valor: number) {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format(
    valor,
  );
}
