-- Evita sumar como si fueran equivalentes importes históricos en monedas distintas.
create or replace function public.asistente_resumen_ventas(desde timestamptz, hasta timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with ventas_periodo as (
    select v.total, v.moneda
    from public.ventas v
    where v.estado = 'confirmada'
      and v.confirmado_en >= desde and v.confirmado_en < hasta
  ),
  totales as (
    select moneda, sum(total) as total
    from ventas_periodo
    group by moneda
  )
  select jsonb_build_object(
    'cantidad', (select count(*) from ventas_periodo),
    'total', case
      when (select count(*) from totales) <= 1
        then coalesce((select sum(total) from totales), 0)
      else null
    end,
    'totales_por_moneda', coalesce(
      (select jsonb_object_agg(moneda, total) from totales),
      '{}'::jsonb
    ),
    'periodo_desde', desde,
    'periodo_hasta', hasta
  );
$$;

revoke all on function public.asistente_resumen_ventas(timestamptz, timestamptz) from public, anon;
grant execute on function public.asistente_resumen_ventas(timestamptz, timestamptz) to authenticated;

create or replace function public.resumen_inicio(desde timestamptz, hasta timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with ventas_periodo as (
    select v.total, v.moneda
    from public.ventas v
    where v.estado = 'confirmada'
      and v.confirmado_en >= desde and v.confirmado_en < hasta
  ),
  totales as (
    select moneda, sum(total) as total
    from ventas_periodo
    group by moneda
  )
  select jsonb_build_object(
    'ventas', (select count(*) from ventas_periodo),
    'total_ventas', case
      when (select count(*) from totales) <= 1
        then coalesce((select sum(total) from totales), 0)
      else null
    end,
    'totales_por_moneda', coalesce(
      (select jsonb_object_agg(moneda, total) from totales),
      '{}'::jsonb
    ),
    'moneda_base', (select e.moneda from public.empresa e where e.unica),
    'stock_bajo', (
      select count(*) from public.productos p
      where p.activo and (
        (not p.usa_combinaciones and p.existencias <= p.stock_minimo)
        or (p.usa_combinaciones and exists (
          select 1 from public.combinaciones c
          where c.producto_id = p.id and c.activa and c.existencias <= c.stock_minimo
        ))
      )
    )
  );
$$;

revoke all on function public.resumen_inicio(timestamptz, timestamptz) from public, anon;
grant execute on function public.resumen_inicio(timestamptz, timestamptz) to authenticated;

drop function public.reporte_ventas(timestamptz, timestamptz);

create function public.reporte_ventas(desde timestamptz, hasta timestamptz)
returns table (
  descripcion text,
  moneda text,
  ventas bigint,
  unidades numeric,
  total numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.descripcion_congelada,
    v.moneda,
    count(distinct v.id),
    sum(l.cantidad),
    sum(l.total)
  from public.lineas_venta l
  join public.ventas v on v.id = l.venta_id
  where v.estado = 'confirmada'
    and v.confirmado_en >= desde and v.confirmado_en < hasta
  group by l.descripcion_congelada, v.moneda
  order by v.moneda, sum(l.total) desc, l.descripcion_congelada;
$$;

revoke all on function public.reporte_ventas(timestamptz, timestamptz) from public, anon;
grant execute on function public.reporte_ventas(timestamptz, timestamptz) to authenticated;
