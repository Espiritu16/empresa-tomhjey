# Facturación

Emisión y seguimiento de facturas y boletas mediante NubeFacT. Solo
administración puede configurar las series y emitir.

## Antes de emitir

- La empresa debe tener un RUC válido.
- Configura por separado la serie F para facturas y B para boletas, con el
  siguiente correlativo que NubeFacT tiene habilitado. El sistema no permite
  retroceder un correlativo y conserva las series anteriores como inactivas.
- La venta debe estar confirmada y no tener ya un comprobante. La factura
  requiere RUC válido del cliente; la boleta puede emitirse sin documento hasta
  el límite fiscal aplicado por la reserva.
- `NUBEFACT_RUTA` y `NUBEFACT_TOKEN` viven en
  `supabase/functions/.env.local` para desarrollo local. Nunca se exponen en
  variables `NEXT_PUBLIC_*`.

La Edge Function reserva el correlativo y persiste el payload antes de llamar a
NubeFacT. Si una respuesta es incierta, el reintento consulta el mismo número y
lo compara con los datos reservados antes de considerarlo propio. La factura
puede reflejar la aceptación informada durante el envío. Una boleta siempre
queda pendiente al enviarse: la consulta manual de aceptación se habilita
después de siete días y, si sigue pendiente, una vez al día. El panel presenta
el PDF solo cuando el proveedor devuelve un enlace HTTPS de NubeFacT.

Esta entrega no habilita notas de crédito ni anulaciones fiscales.
