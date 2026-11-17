-- Entrada de mercadería: la reposición (compra al proveedor) suma unidades al stock y
-- queda como movimiento «entrada», separada de los ajustes por corrección o merma.
alter table public.movimientos_inventario
  drop constraint movimientos_inventario_tipo_check;

alter table public.movimientos_inventario
  add constraint movimientos_inventario_tipo_check
    check (tipo in ('ajuste', 'venta', 'entrada'));

alter table public.movimientos_inventario
  add constraint movimientos_inventario_entrada_positiva
    check (tipo <> 'entrada' or cantidad > 0);

create or replace function public.registrar_entrada(
  producto_objetivo uuid,
  combinacion_objetivo uuid,
  unidades numeric,
  razon text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  movimiento_id uuid := gen_random_uuid();
  existencias_nuevas numeric(12, 3);
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede registrar entradas de mercadería.';
  end if;
  if unidades is null
    or unidades <= 0
    or unidades > 999999999.999
    or round(unidades, 3) <> unidades
    or nullif(trim(razon), '') is null
  then
    raise exception using errcode = '22023', message = 'Indica cuántas unidades entran y el motivo de la entrada.';
  end if;

  if combinacion_objetivo is null then
    update public.productos
    set existencias = existencias + unidades,
        actualizado_en = now()
    where id = producto_objetivo
      and not usa_combinaciones
      and activo
    returning existencias into existencias_nuevas;
  else
    update public.combinaciones as c
    set existencias = c.existencias + unidades
    from public.productos as p
    where c.id = combinacion_objetivo
      and c.producto_id = producto_objetivo
      and c.activa
      and p.id = c.producto_id
      and p.activo
    returning c.existencias into existencias_nuevas;
  end if;

  if not found then
    raise exception using errcode = '22023', message = 'El producto no existe o está inactivo.';
  end if;

  insert into public.movimientos_inventario (
    id, producto_id, combinacion_id, tipo, cantidad,
    existencias_resultantes, motivo, usuario_id
  ) values (
    movimiento_id, producto_objetivo, combinacion_objetivo, 'entrada',
    unidades, existencias_nuevas, trim(razon), (select auth.uid())
  );
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (
    (select auth.uid()), 'registrar_entrada', 'producto', producto_objetivo,
    jsonb_build_object(
      'combinacion_id', combinacion_objetivo,
      'unidades', unidades,
      'stock_nuevo', existencias_nuevas,
      'motivo', trim(razon)
    )
  );
  return movimiento_id;
end;
$$;

revoke all on function public.registrar_entrada(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.registrar_entrada(uuid, uuid, numeric, text) to authenticated;
