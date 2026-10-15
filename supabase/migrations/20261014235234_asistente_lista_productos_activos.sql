create or replace function public.asistente_resumen_catalogo()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with productos_visibles as (
    select
      p.id,
      p.usa_combinaciones,
      p.existencias,
      p.stock_minimo,
      exists (
        select 1
        from public.combinaciones c
        where c.producto_id = p.id
          and c.activa
          and c.existencias <= c.stock_minimo
      ) as combinacion_baja,
      exists (
        select 1
        from public.combinaciones c
        where c.producto_id = p.id
          and c.activa
          and c.existencias <= 0
      ) as combinacion_agotada
    from public.productos p
    where p.activo
  )
  select jsonb_build_object(
    'productos_activos', count(*),
    'lista_productos_activos', coalesce((
      select jsonb_agg(producto.nombre order by producto.nombre)
      from (
        select p.nombre
        from public.productos p
        where p.activo
        order by p.nombre
        limit 50
      ) producto
    ), '[]'::jsonb),
    'productos_con_stock_bajo', count(*) filter (
      where (not p.usa_combinaciones and p.existencias <= p.stock_minimo)
        or (p.usa_combinaciones and p.combinacion_baja)
    ),
    'productos_agotados', count(*) filter (
      where (not p.usa_combinaciones and p.existencias <= 0)
        or (p.usa_combinaciones and p.combinacion_agotada)
    ),
    'combinaciones_activas', (
      select count(*)
      from public.combinaciones c
      join public.productos producto on producto.id = c.producto_id
      where producto.activo and c.activa
    ),
    'detalle_reposicion', coalesce((
      select jsonb_agg(to_jsonb(detalle))
      from (
        select
          p.nombre || case when c.id is null then '' else ' ' || coalesce((
            select string_agg(op.nombre || ' ' || vo.valor, ' ' order by op.posicion)
            from public.valores_opcion vo
            join public.opciones_producto op on op.id = vo.opcion_id
            where vo.id in (c.valor_opcion_1_id, c.valor_opcion_2_id)
          ), '') end as producto,
          coalesce(c.sku, p.sku) as sku,
          coalesce(c.existencias, p.existencias) as existencias,
          coalesce(c.stock_minimo, p.stock_minimo) as stock_minimo,
          p.unidad_medida
        from public.productos p
        left join public.combinaciones c
          on c.producto_id = p.id and c.activa
        where p.activo and (
          (not p.usa_combinaciones and p.existencias <= p.stock_minimo)
          or (p.usa_combinaciones and c.id is not null and c.existencias <= c.stock_minimo)
        )
        order by p.nombre, c.sku
        limit 20
      ) detalle
    ), '[]'::jsonb)
  )
  from productos_visibles p;
$$;

revoke all on function public.asistente_resumen_catalogo() from public, anon;
grant execute on function public.asistente_resumen_catalogo() to authenticated;
