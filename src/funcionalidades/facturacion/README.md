# Facturación

Emisión y seguimiento de facturas mediante NubeFacT. Solo administración puede
configurar la serie y emitir.

## Antes de emitir

- La empresa debe tener un RUC válido.
- Configura la serie F y el siguiente correlativo que NubeFacT tiene habilitados.
  El sistema no permite retroceder el correlativo y conserva las series
  anteriores como inactivas.
- La venta debe estar confirmada, tener un cliente identificado con RUC y no
  tener ya un comprobante.
- `NUBEFACT_RUTA` y `NUBEFACT_TOKEN` viven en
  `supabase/functions/.env.local` para desarrollo local. Nunca se exponen en
  variables `NEXT_PUBLIC_*`.

La Edge Function reserva el correlativo y persiste el payload antes de llamar a
NubeFacT. Si una respuesta es incierta, el reintento consulta el mismo número y
lo compara con los datos reservados antes de considerarlo propio. La pantalla
separa «Enviada a NubeFacT» de «Aceptada por SUNAT» y presenta el PDF solo cuando
el proveedor devuelve un enlace HTTPS de NubeFacT.

Esta entrega no habilita boletas, consulta diferida de aceptación, notas de
crédito ni anulaciones fiscales.
