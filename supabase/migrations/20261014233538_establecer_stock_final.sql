create or replace function public.establecer_stock_final(
  producto_objetivo uuid,
  combinacion_objetivo uuid,
  existencias_nuevas numeric,
  razon text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  movimiento_id uuid := gen_random_uuid();
  existencias_actuales numeric(12, 3);
  diferencia numeric(12, 3);
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede ajustar existencias.';
  end if;
  if existencias_nuevas is null
    or existencias_nuevas < 0
    or existencias_nuevas > 999999999.999
    or round(existencias_nuevas, 3) <> existencias_nuevas
    or nullif(trim(razon), '') is null
  then
    raise exception using errcode = '22023', message = 'Indica un stock final válido y el motivo del ajuste.';
  end if;

  if combinacion_objetivo is null then
    select p.existencias
      into existencias_actuales
    from public.productos as p
    where p.id = producto_objetivo
      and not p.usa_combinaciones
      and p.activo
    for update;
  else
    select c.existencias
      into existencias_actuales
    from public.combinaciones as c
    join public.productos as p on p.id = c.producto_id
    where c.id = combinacion_objetivo
      and c.producto_id = producto_objetivo
      and c.activa
      and p.activo
    for update of c, p;
  end if;

  if not found then
    raise exception using errcode = '22023', message = 'El producto no existe o está inactivo.';
  end if;

  diferencia := existencias_nuevas - existencias_actuales;
  if diferencia = 0 then
    raise exception using errcode = '22023', message = 'El nuevo stock coincide con el stock actual.';
  end if;

  if combinacion_objetivo is null then
    update public.productos
    set existencias = existencias_nuevas,
        actualizado_en = now()
    where id = producto_objetivo;
  else
    update public.combinaciones
    set existencias = existencias_nuevas
    where id = combinacion_objetivo
      and producto_id = producto_objetivo;
  end if;

  insert into public.movimientos_inventario (
    id, producto_id, combinacion_id, tipo, cantidad,
    existencias_resultantes, motivo, usuario_id
  ) values (
    movimiento_id, producto_objetivo, combinacion_objetivo, 'ajuste',
    diferencia, existencias_nuevas, trim(razon), (select auth.uid())
  );
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (
    (select auth.uid()), 'establecer_stock_final', 'producto', producto_objetivo,
    jsonb_build_object(
      'combinacion_id', combinacion_objetivo,
      'stock_anterior', existencias_actuales,
      'stock_nuevo', existencias_nuevas,
      'cambio', diferencia,
      'motivo', trim(razon)
    )
  );
  return movimiento_id;
end;
$$;

revoke all on function public.establecer_stock_final(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.establecer_stock_final(uuid, uuid, numeric, text) to authenticated;
