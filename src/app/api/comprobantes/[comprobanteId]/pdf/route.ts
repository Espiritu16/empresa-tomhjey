import { generarPdfComprobante } from "@/funcionalidades/facturacion/generar-pdf";
import { cargarComprobanteImpresion } from "@/funcionalidades/facturacion/consultas";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ comprobanteId: string }> },
) {
  const perfil = await obtenerPerfilActual();
  if (!perfil?.activo) {
    return Response.redirect(new URL("/acceso", request.url), 307);
  }

  const { comprobanteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(comprobanteId)) {
    return new Response("No se encontró el comprobante.", { status: 404 });
  }

  const datos = await cargarComprobanteImpresion(comprobanteId);
  if (!datos) {
    return new Response("No se encontró el comprobante.", { status: 404 });
  }
  if (!datos.cadenaQr?.trim()) {
    return new Response(
      "NubeFacT todavía no entregó el código QR de este comprobante.",
      {
        status: 409,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  const pdf = await generarPdfComprobante(datos);
  const cuerpo = new Uint8Array(pdf.length);
  cuerpo.set(pdf);
  const serie = datos.serie.replace(/[^a-z0-9-]/gi, "");
  const numero = String(datos.numero).padStart(8, "0");

  return new Response(cuerpo.buffer as ArrayBuffer, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${serie}-${numero}.pdf"`,
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
