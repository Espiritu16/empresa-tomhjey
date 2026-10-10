-- Las ventas nuevas deben tener un cliente. La excepción permite conservar y
-- descartar borradores históricos que se crearon como venta de mostrador.
alter table public.ventas
  add constraint ventas_cliente_obligatorio
  check (cliente_id is not null or estado = 'descartada') not valid;

-- El vínculo permite mostrar y confirmar desde el mensaje del chat, y reconstruir
-- la tarjeta al volver a abrir la conversación.
alter table public.mensajes
  add column venta_id uuid references public.ventas (id) on delete set null;

alter table public.mensajes
  add constraint mensajes_venta_solo_asistente
  check (venta_id is null or rol = 'asistente') not valid;
