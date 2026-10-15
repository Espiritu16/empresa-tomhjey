create or replace function private.validar_stock_linea_borrador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  estado_venta text;
  existencias_disponibles numeric(12, 3);
  cantidad_solicitada numeric(12, 3);
begin
  select v.estado into estado_venta
  from public.ventas v
  where v.id = new.venta_id;

  if estado_venta is distinct from 'borrador' then
    return new;
  end if;

  select sum(lv.cantidad) into cantidad_solicitada
  from public.lineas_venta lv
  where lv.venta_id = new.venta_id
    and lv.producto_id = new.producto_id
    and lv.combinacion_id is not distinct from new.combinacion_id;

  if new.combinacion_id is null then
    select p.existencias into existencias_disponibles
    from public.productos p
    where p.id = new.producto_id
      and p.activo
      and not p.usa_combinaciones
    for update;
  else
    select c.existencias into existencias_disponibles
    from public.combinaciones c
    where c.id = new.combinacion_id
      and c.producto_id = new.producto_id
      and c.activa
    for update;
  end if;

  if not found
    or existencias_disponibles is null
    or cantidad_solicitada > existencias_disponibles then
    raise exception using
      errcode = '23514',
      constraint = 'ventas_stock_suficiente',
      message = 'No hay existencias suficientes para crear el borrador de venta.';
  end if;

  return new;
end;
$function$;

revoke all on function private.validar_stock_linea_borrador()
  from public, anon, authenticated;

create trigger validar_stock_linea_borrador
  after insert or update on public.lineas_venta
  for each row
  execute function private.validar_stock_linea_borrador();
