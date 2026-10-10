create or replace function public.crear_borrador_venta_con_comprobante(
  cliente_objetivo uuid,
  lineas jsonb,
  tipo_comprobante_solicitado text,
  venta_objetivo uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  venta_id uuid;
  venta_actual public.ventas%rowtype;
begin
  if tipo_comprobante_solicitado not in ('factura', 'boleta') then
    raise exception using errcode = '22023', message = 'Selecciona factura o boleta.';
  end if;

  venta_id := public.crear_borrador_venta(
    cliente_objetivo,
    lineas,
    venta_objetivo
  );

  select * into strict venta_actual
  from public.ventas v
  where v.id = venta_id
    and v.estado = 'borrador';

  if tipo_comprobante_solicitado = 'factura'
    and (
      venta_actual.cliente_tipo_documento <> 'ruc'
      or not private.ruc_valido(venta_actual.cliente_numero_documento)
    ) then
    raise exception using errcode = '22023', message = 'La factura requiere un cliente identificado con RUC válido.';
  end if;

  if tipo_comprobante_solicitado = 'boleta'
    and venta_actual.total > 700
    and nullif(venta_actual.cliente_numero_documento, '') is null then
    raise exception using errcode = '22023', message = 'Las boletas mayores a S/ 700 requieren identificar al cliente.';
  end if;

  update public.ventas
  set tipo_comprobante = tipo_comprobante_solicitado,
      actualizado_en = now()
  where id = venta_id;

  return venta_id;
end;
$$;

revoke all on function public.crear_borrador_venta_con_comprobante(uuid, jsonb, text, uuid)
  from public, anon;
grant execute on function public.crear_borrador_venta_con_comprobante(uuid, jsonb, text, uuid)
  to authenticated;
