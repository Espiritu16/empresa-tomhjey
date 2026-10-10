create or replace function public.asistente_consultar_modulo(
  modulo text,
  busqueda text default null,
  desde timestamptz default null,
  hasta timestamptz default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  inicio_periodo timestamptz;
  fin_periodo timestamptz;
  resultado jsonb;
begin
  if modulo is null or modulo not in (
    'inicio', 'productos', 'inventario', 'clientes', 'ventas',
    'facturacion', 'reportes', 'empresa', 'usuarios'
  ) then
    raise exception using errcode = '22023', message = 'El módulo no está disponible para consulta.';
  end if;

  if busqueda is not null and length(trim(busqueda)) > 120 then
    raise exception using errcode = '22023', message = 'La búsqueda es demasiado larga.';
  end if;

  if modulo in ('empresa', 'usuarios') and not exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.rol = 'administrador' and p.activo
  ) then
    raise exception using errcode = '42501', message = 'Esta consulta requiere el rol de administrador.';
  end if;

  if modulo in ('inicio', 'ventas', 'facturacion', 'reportes') then
    inicio_periodo := coalesce(
      desde,
      date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima'
    );
    fin_periodo := coalesce(hasta, inicio_periodo + interval '1 day');
    if inicio_periodo >= fin_periodo then
      raise exception using errcode = '22023', message = 'El periodo indicado no es válido.';
    end if;
  end if;

  case
    when modulo = 'inicio' then
      resultado := jsonb_build_object(
        'modulo', modulo,
        'catalogo', public.asistente_resumen_catalogo(),
        'ventas', public.asistente_resumen_ventas(inicio_periodo, fin_periodo)
      );

    when modulo in ('productos', 'inventario') then
      select jsonb_build_object(
        'modulo', modulo,
        'productos_activos', (select count(*) from public.productos p where p.activo),
        'productos', coalesce((
          select jsonb_agg(to_jsonb(producto))
          from (
            select
              p.id as producto_id,
              p.nombre,
              p.sku,
              p.unidad_medida,
              p.usa_combinaciones,
              p.precio,
              p.existencias,
              p.stock_minimo,
              p.activo,
              coalesce((
                select jsonb_agg(jsonb_build_object(
                  'combinacion_id', c.id,
                  'nombre', p.nombre || ' ' || coalesce((
                    select string_agg(op.nombre || ' ' || vo.valor, ' ' order by op.posicion)
                    from public.valores_opcion vo
                    join public.opciones_producto op on op.id = vo.opcion_id
                    where vo.id in (c.valor_opcion_1_id, c.valor_opcion_2_id)
                  ), ''),
                  'sku', c.sku,
                  'precio', c.precio,
                  'existencias', c.existencias,
                  'stock_minimo', c.stock_minimo,
                  'activa', c.activa
                ) order by c.sku)
                from public.combinaciones c
                where c.producto_id = p.id and c.activa
              ), '[]'::jsonb) as combinaciones
            from public.productos p
            where p.activo and (
              nullif(trim(busqueda), '') is null
              or p.nombre ilike '%' || trim(busqueda) || '%'
              or p.sku ilike '%' || trim(busqueda) || '%'
              or exists (
                select 1 from public.combinaciones c
                where c.producto_id = p.id and c.activa
                  and c.sku ilike '%' || trim(busqueda) || '%'
              )
            )
            order by p.nombre
            limit 20
          ) producto
        ), '[]'::jsonb)
      ) || case when modulo = 'inventario' then jsonb_build_object(
        'movimientos', coalesce((
          select jsonb_agg(to_jsonb(movimiento))
          from (
            select
              m.tipo,
              p.nombre as producto,
              coalesce(c.sku, p.sku) as sku,
              m.cantidad,
              m.existencias_resultantes as existencias,
              m.motivo,
              m.creado_en as fecha
            from public.movimientos_inventario m
            join public.productos p on p.id = m.producto_id
            left join public.combinaciones c on c.id = m.combinacion_id
            where nullif(trim(busqueda), '') is null
              or p.nombre ilike '%' || trim(busqueda) || '%'
              or p.sku ilike '%' || trim(busqueda) || '%'
              or c.sku ilike '%' || trim(busqueda) || '%'
            order by m.creado_en desc
            limit 20
          ) movimiento
        ), '[]'::jsonb)
      ) else '{}'::jsonb end
      into resultado;

    when modulo = 'clientes' then
      select jsonb_build_object(
        'modulo', modulo,
        'total', (select count(*) from public.clientes c where nullif(trim(busqueda), '') is null or c.nombre ilike '%' || trim(busqueda) || '%'),
        'clientes', coalesce((
          select jsonb_agg(to_jsonb(cliente))
          from (
            select
              c.id as cliente_id,
              c.nombre,
              c.activo,
              (select count(*) from public.ventas v where v.cliente_id = c.id and v.estado = 'confirmada') as ventas_confirmadas
            from public.clientes c
            where nullif(trim(busqueda), '') is null or c.nombre ilike '%' || trim(busqueda) || '%'
            order by c.nombre
            limit 20
          ) cliente
        ), '[]'::jsonb)
      ) into resultado;

    when modulo = 'ventas' then
      select jsonb_build_object(
        'modulo', modulo,
        'periodo_desde', inicio_periodo,
        'periodo_hasta', fin_periodo,
        'por_estado', coalesce((
          select jsonb_object_agg(estado, cantidad)
          from (select v.estado, count(*) as cantidad from public.ventas v
            where v.creado_en >= inicio_periodo and v.creado_en < fin_periodo
            group by v.estado) estados
        ), '{}'::jsonb),
        'ventas', coalesce((
          select jsonb_agg(to_jsonb(venta))
          from (
            select v.id as venta_id, v.estado, v.moneda, v.total, v.creado_en,
              v.confirmado_en, v.cliente_nombre,
              coalesce((select jsonb_agg(jsonb_build_object(
                'producto', l.descripcion_congelada,
                'cantidad', l.cantidad,
                'total', l.total
              ) order by l.creado_en) from public.lineas_venta l where l.venta_id = v.id), '[]'::jsonb) as productos
            from public.ventas v
            where v.creado_en >= inicio_periodo and v.creado_en < fin_periodo
              and (nullif(trim(busqueda), '') is null or v.cliente_nombre ilike '%' || trim(busqueda) || '%')
            order by v.creado_en desc
            limit 20
          ) venta
        ), '[]'::jsonb),
        'resumen_confirmadas', public.asistente_resumen_ventas(inicio_periodo, fin_periodo)
      ) into resultado;

    when modulo = 'facturacion' then
      select jsonb_build_object(
        'modulo', modulo,
        'periodo_desde', inicio_periodo,
        'periodo_hasta', fin_periodo,
        'por_estado', coalesce((
          select jsonb_object_agg(estado, cantidad)
          from (select c.estado, count(*) as cantidad from public.comprobantes c
            where c.creado_en >= inicio_periodo and c.creado_en < fin_periodo
            group by c.estado) estados
        ), '{}'::jsonb),
        'comprobantes', coalesce((
          select jsonb_agg(to_jsonb(comprobante))
          from (
            select c.id as comprobante_id, c.tipo, c.serie, c.numero, c.estado,
              c.error_publico, c.creado_en, c.actualizado_en
            from public.comprobantes c
            where c.creado_en >= inicio_periodo and c.creado_en < fin_periodo
              and (nullif(trim(busqueda), '') is null
                or c.serie ilike '%' || trim(busqueda) || '%'
                or (c.serie || '-' || c.numero::text) ilike '%' || trim(busqueda) || '%')
            order by c.creado_en desc
            limit 20
          ) comprobante
        ), '[]'::jsonb)
      ) into resultado;

    when modulo = 'reportes' then
      select jsonb_build_object(
        'modulo', modulo,
        'periodo_desde', inicio_periodo,
        'periodo_hasta', fin_periodo,
        'resumen', public.asistente_resumen_ventas(inicio_periodo, fin_periodo),
        'productos_vendidos', coalesce((
          select jsonb_agg(to_jsonb(detalle))
          from (
            select descripcion as producto, moneda, ventas, unidades, total
            from public.reporte_ventas(inicio_periodo, fin_periodo)
            order by unidades desc, descripcion
            limit 20
          ) detalle
        ), '[]'::jsonb)
      ) into resultado;

    when modulo = 'empresa' then
      select jsonb_build_object(
        'modulo', modulo,
        'empresa', jsonb_build_object(
          'nombre', e.nombre,
          'ruc', e.ruc,
          'moneda', e.moneda,
          'igv_activo', e.igv_activo,
          'igv_porcentaje', e.igv_porcentaje,
          'precios_incluyen_igv', e.precios_incluyen_igv,
          'direccion_configurada', nullif(trim(coalesce(e.direccion, '')), '') is not null,
          'telefono_configurado', nullif(trim(coalesce(e.telefono, '')), '') is not null
        )
      ) into resultado
      from public.empresa e where e.unica;

    when modulo = 'usuarios' then
      select jsonb_build_object(
        'modulo', modulo,
        'usuarios', coalesce(jsonb_agg(jsonb_build_object(
          'nombre', p.nombre,
          'rol', p.rol,
          'activo', p.activo
        ) order by p.nombre), '[]'::jsonb),
        'total', count(*)
      ) into resultado
      from public.perfiles p;
  end case;

  return coalesce(resultado, jsonb_build_object('modulo', modulo, 'datos', null));
end;
$$;

revoke all on function public.asistente_consultar_modulo(text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.asistente_consultar_modulo(text, text, timestamptz, timestamptz) to authenticated;
