-- Las ventas pertenecen a la operación compartida de la empresa. Ambos roles
-- consultan la misma lista, sus líneas, comprobantes y movimientos asociados.
drop policy ventas_lectura_por_rol on public.ventas;
create policy ventas_lectura_equipo
  on public.ventas for select to authenticated
  using ((select private.tiene_rol(array['administrador', 'vendedor'])));

drop policy lineas_venta_lectura_por_venta on public.lineas_venta;
create policy lineas_venta_lectura_equipo
  on public.lineas_venta for select to authenticated
  using (exists (
    select 1 from public.ventas v
    where v.id = venta_id
      and (select private.tiene_rol(array['administrador', 'vendedor']))
  ));

drop policy movimientos_lectura_por_rol on public.movimientos_inventario;
create policy movimientos_lectura_equipo
  on public.movimientos_inventario for select to authenticated
  using ((select private.tiene_rol(array['administrador', 'vendedor'])));

drop policy comprobantes_lectura_por_venta on public.comprobantes;
create policy comprobantes_lectura_equipo
  on public.comprobantes for select to authenticated
  using (exists (
    select 1 from public.ventas v
    where v.id = venta_id
      and (select private.tiene_rol(array['administrador', 'vendedor']))
  ));
