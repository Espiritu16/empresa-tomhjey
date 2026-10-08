alter table public.comprobantes
  drop constraint comprobantes_estado_check,
  add constraint comprobantes_estado_check
    check (estado in ('pendiente', 'emitiendo', 'emitido', 'rechazado', 'error')),
  add column procesando_hasta timestamptz;

create or replace function public.guardar_empresa(
  nombre_empresa text,
  ruc_empresa text,
  direccion_empresa text,
  telefono_empresa text,
  correo_empresa text,
  moneda_empresa text,
  igv_habilitado boolean,
  tasa_igv numeric,
  precios_con_igv boolean
)
returns public.empresa
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultado public.empresa%rowtype;
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede configurar la empresa.';
  end if;
  if nullif(trim(nombre_empresa), '') is null
    or (ruc_empresa is not null and not private.ruc_valido(ruc_empresa))
    or moneda_empresa not in ('PEN', 'USD')
    or tasa_igv < 0 or tasa_igv > 100 then
    raise exception using errcode = '22023', message = 'Revisa el nombre, RUC, moneda y tasa de IGV.';
  end if;

  insert into public.empresa (
    unica, nombre, ruc, direccion, telefono, correo, moneda,
    igv_activo, igv_porcentaje, precios_incluyen_igv, actualizado_por, actualizado_en
  ) values (
    true, trim(nombre_empresa), nullif(trim(ruc_empresa), ''),
    nullif(trim(direccion_empresa), ''), nullif(trim(telefono_empresa), ''),
    nullif(lower(trim(correo_empresa)), ''), moneda_empresa,
    igv_habilitado, tasa_igv, precios_con_igv, (select auth.uid()), now()
  )
  on conflict (unica) do update set
    nombre = excluded.nombre,
    ruc = excluded.ruc,
    direccion = excluded.direccion,
    telefono = excluded.telefono,
    correo = excluded.correo,
    moneda = excluded.moneda,
    igv_activo = excluded.igv_activo,
    igv_porcentaje = excluded.igv_porcentaje,
    precios_incluyen_igv = excluded.precios_incluyen_igv,
    actualizado_por = excluded.actualizado_por,
    actualizado_en = now()
  returning * into resultado;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values ((select auth.uid()), 'guardar_empresa', 'empresa', null,
    jsonb_build_object('nombre', resultado.nombre, 'ruc_actualizado', resultado.ruc is not null));
  return resultado;
end;
$$;

revoke all on function public.guardar_empresa(text, text, text, text, text, text, boolean, numeric, boolean) from public, anon;
grant execute on function public.guardar_empresa(text, text, text, text, text, text, boolean, numeric, boolean) to authenticated;

create or replace function public.reservar_comprobante(
  administrador_objetivo uuid,
  venta_objetivo uuid,
  tipo_solicitado text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  venta_actual public.ventas%rowtype;
  config_empresa public.empresa%rowtype;
  serie_actual public.series_comprobante%rowtype;
  comprobante_actual public.comprobantes%rowtype;
  nuevo_id uuid;
  nuevo_numero bigint;
  payload_fiscal jsonb;
  mapa_documento text;
  subtotal_lineas numeric(12, 2);
  igv_lineas numeric(12, 2);
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo and p.rol = 'administrador' and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta administradora no está activa.';
  end if;
  if tipo_solicitado not in ('boleta', 'factura') then
    raise exception using errcode = '22023', message = 'Tipo de comprobante no válido.';
  end if;

  select * into venta_actual from public.ventas
  where id = venta_objetivo and estado = 'confirmada'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Solo se puede facturar una venta confirmada.';
  end if;

  select * into config_empresa from public.empresa limit 1;
  if config_empresa.ruc is null or not private.ruc_valido(config_empresa.ruc) then
    raise exception using errcode = '22023', message = 'Complete el RUC de la empresa antes de emitir.';
  end if;
  if tipo_solicitado = 'factura' and (venta_actual.cliente_tipo_documento <> 'ruc' or not private.ruc_valido(venta_actual.cliente_numero_documento)) then
    raise exception using errcode = '22023', message = 'La factura requiere un cliente identificado con RUC.';
  end if;
  if tipo_solicitado = 'boleta' and venta_actual.total > 700 and nullif(venta_actual.cliente_numero_documento, '') is null then
    raise exception using errcode = '22023', message = 'Las boletas mayores a S/ 700 requieren identificar al cliente.';
  end if;

  select * into comprobante_actual from public.comprobantes
  where venta_id = venta_objetivo
  for update;
  if found then
    if comprobante_actual.tipo <> tipo_solicitado then
      raise exception using errcode = '23505', message = 'La venta ya tiene un comprobante de otro tipo.';
    end if;
    if comprobante_actual.estado = 'emitido' or comprobante_actual.estado = 'rechazado' then
      return jsonb_build_object(
        'comprobante_id', comprobante_actual.id, 'estado', comprobante_actual.estado,
        'puede_emitir', false, 'reconciliar', false, 'payload', comprobante_actual.payload
      );
    end if;
    if comprobante_actual.estado = 'emitiendo' and comprobante_actual.procesando_hasta > now() then
      return jsonb_build_object(
        'comprobante_id', comprobante_actual.id, 'estado', comprobante_actual.estado,
        'puede_emitir', false, 'reconciliar', false, 'payload', comprobante_actual.payload
      );
    end if;
    update public.comprobantes
    set estado = 'emitiendo', procesando_hasta = now() + interval '2 minutes',
        intentos = intentos + 1, error_publico = null, actualizado_en = now()
    where id = comprobante_actual.id;
    return jsonb_build_object(
      'comprobante_id', comprobante_actual.id, 'estado', 'emitiendo',
      'puede_emitir', true, 'reconciliar', comprobante_actual.intentos > 0,
      'serie', comprobante_actual.serie, 'numero', comprobante_actual.numero,
      'payload', comprobante_actual.payload
    );
  end if;

  select * into serie_actual from public.series_comprobante
  where tipo = tipo_solicitado and activa
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Configure una serie activa antes de emitir.';
  end if;
  nuevo_numero := serie_actual.siguiente_numero;
  update public.series_comprobante
  set siguiente_numero = siguiente_numero + 1, actualizado_en = now()
  where id = serie_actual.id;
  nuevo_id := extensions.gen_random_uuid();
  mapa_documento := case venta_actual.cliente_tipo_documento
    when 'dni' then '1' when 'ce' then '4' when 'ruc' then '6'
    when 'pasaporte' then '7' else '0' end;

  select coalesce(sum(l.subtotal), 0), coalesce(sum(l.igv), 0)
  into subtotal_lineas, igv_lineas
  from public.lineas_venta l where l.venta_id = venta_objetivo;
  if round(subtotal_lineas + igv_lineas, 2) <> venta_actual.total then
    raise exception using errcode = '23514', message = 'Las líneas de venta no cuadran con el total; no se emitió el comprobante.';
  end if;

  select jsonb_build_object(
    'operacion', 'generar_comprobante',
    'tipo_de_comprobante', case tipo_solicitado when 'factura' then 1 else 2 end,
    'serie', serie_actual.serie,
    'numero', nuevo_numero,
    'sunat_transaction', 1,
    'cliente_tipo_de_documento', mapa_documento,
    'cliente_numero_de_documento', coalesce(nullif(venta_actual.cliente_numero_documento, ''), '00000000'),
    'cliente_denominacion', coalesce(nullif(venta_actual.cliente_nombre, ''), 'CLIENTE VARIOS'),
    'cliente_direccion', coalesce(venta_actual.cliente_direccion, ''),
    'cliente_email', '',
    'fecha_de_emision', to_char(venta_actual.confirmado_en at time zone 'America/Lima', 'DD-MM-YYYY'),
    'moneda', case venta_actual.moneda when 'PEN' then 1 else 2 end,
    'tipo_de_cambio', '',
    'porcentaje_de_igv', case when config_empresa.igv_activo then config_empresa.igv_porcentaje else 0 end,
    'total_gravada', subtotal_lineas,
    'total_igv', igv_lineas,
    'total', venta_actual.total,
    'enviar_automaticamente_a_la_sunat', true,
    'enviar_automaticamente_al_cliente', false,
    'codigo_unico', nuevo_id::text,
    'formato_de_pdf', '',
    'items', (
      select jsonb_agg(jsonb_build_object(
        'unidad_de_medida', l.unidad_medida,
        'codigo', l.sku_congelado,
        'descripcion', l.descripcion_congelada,
        'cantidad', l.cantidad,
        'valor_unitario', case when config_empresa.precios_incluyen_igv
          then round(l.subtotal / l.cantidad, 4)
          else l.precio_unitario end,
        'precio_unitario', case when config_empresa.precios_incluyen_igv
          then l.precio_unitario
          else round(l.total / l.cantidad, 4) end,
        'subtotal', l.subtotal,
        'tipo_de_igv', case when config_empresa.igv_activo then 1 else 9 end,
        'igv', l.igv,
        'total', l.total
      ) order by l.creado_en, l.id)
      from public.lineas_venta l where l.venta_id = venta_objetivo
    )
  ) into payload_fiscal;

  insert into public.comprobantes (
    id, venta_id, tipo, serie, numero, estado, payload, solicitado_por,
    intentos, procesando_hasta
  ) values (
    nuevo_id, venta_objetivo, tipo_solicitado, serie_actual.serie,
    nuevo_numero, 'emitiendo', payload_fiscal, administrador_objetivo,
    1, now() + interval '2 minutes'
  );

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (administrador_objetivo, 'reservar_comprobante', 'venta', venta_objetivo,
    jsonb_build_object('tipo', tipo_solicitado, 'serie', serie_actual.serie, 'numero', nuevo_numero));

  return jsonb_build_object(
    'comprobante_id', nuevo_id, 'estado', 'emitiendo', 'puede_emitir', true,
    'reconciliar', false, 'serie', serie_actual.serie, 'numero', nuevo_numero,
    'payload', payload_fiscal
  );
end;
$$;

revoke all on function public.reservar_comprobante(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reservar_comprobante(uuid, uuid, text) to service_role;

create or replace function public.registrar_resultado_comprobante(
  administrador_objetivo uuid,
  comprobante_objetivo uuid,
  estado_resultado text,
  respuesta jsonb,
  error_mostrable text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo and p.rol = 'administrador' and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta administradora no está activa.';
  end if;
  if estado_resultado not in ('emitido', 'rechazado', 'error') then
    raise exception using errcode = '22023', message = 'Estado de emisión no válido.';
  end if;
  update public.comprobantes
  set estado = estado_resultado,
      respuesta_proveedor = coalesce(respuesta, '{}'::jsonb),
      enlace_pdf = nullif(respuesta ->> 'enlace_del_pdf', ''),
      enlace_xml = nullif(respuesta ->> 'enlace_del_xml', ''),
      enlace_cdr = nullif(respuesta ->> 'enlace_del_cdr', ''),
      cadena_qr = nullif(respuesta ->> 'cadena_para_codigo_qr', ''),
      error_publico = error_mostrable,
      procesando_hasta = null,
      actualizado_en = now()
  where id = comprobante_objetivo and estado = 'emitiendo';
  if not found then
    raise exception using errcode = 'P0002', message = 'El comprobante no está en proceso.';
  end if;
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (administrador_objetivo, 'registrar_resultado_comprobante', 'comprobante', comprobante_objetivo,
    jsonb_build_object('estado', estado_resultado));
end;
$$;

revoke all on function public.registrar_resultado_comprobante(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.registrar_resultado_comprobante(uuid, uuid, text, jsonb, text) to service_role;

create table public.conversaciones (
  id uuid primary key default extensions.gen_random_uuid(),
  titulo text not null default 'Asistente',
  usuario_id uuid not null references public.perfiles (id) on delete restrict,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

create table public.mensajes (
  id uuid primary key default extensions.gen_random_uuid(),
  conversacion_id uuid not null references public.conversaciones (id) on delete cascade,
  rol text not null check (rol in ('usuario', 'asistente')),
  contenido text not null check (length(trim(contenido)) > 0),
  creado_en timestamptz not null default now()
);

create index conversaciones_usuario_fecha_idx on public.conversaciones (usuario_id, actualizada_en desc);
create index mensajes_conversacion_fecha_idx on public.mensajes (conversacion_id, creado_en desc);
alter table public.conversaciones enable row level security;
alter table public.mensajes enable row level security;

create policy conversaciones_propias_select
  on public.conversaciones for select to authenticated
  using ((select private.usuario_activo()) and usuario_id = (select auth.uid()));
create policy conversaciones_propias_insert
  on public.conversaciones for insert to authenticated
  with check ((select private.tiene_rol(array['administrador', 'vendedor'])) and usuario_id = (select auth.uid()));
create policy conversaciones_propias_update
  on public.conversaciones for update to authenticated
  using ((select private.usuario_activo()) and usuario_id = (select auth.uid()))
  with check ((select private.usuario_activo()) and usuario_id = (select auth.uid()));

create policy mensajes_propios_select
  on public.mensajes for select to authenticated
  using (exists (
    select 1 from public.conversaciones c
    where c.id = conversacion_id and c.usuario_id = (select auth.uid())
  ));
create policy mensajes_usuario_insert
  on public.mensajes for insert to authenticated
  with check (
    rol = 'usuario'
    and exists (
      select 1 from public.conversaciones c
      where c.id = conversacion_id
        and c.usuario_id = (select auth.uid())
        and (select private.usuario_activo())
    )
  );

revoke all on public.conversaciones, public.mensajes from anon, authenticated;
grant select, insert, update on public.conversaciones to authenticated;
grant select, insert on public.mensajes to authenticated;

create or replace function public.asistente_buscar_productos(texto_busqueda text, max_resultados integer default 8)
returns table (
  producto_id uuid,
  combinacion_id uuid,
  nombre text,
  sku text,
  precio numeric,
  existencias numeric,
  unidad_medida text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, c.id, p.nombre || case when c.id is null then '' else ' ' || coalesce((
    select string_agg(vo.valor, ' ' order by op.posicion)
    from public.valores_opcion vo
    join public.opciones_producto op on op.id = vo.opcion_id
    where vo.id in (c.valor_opcion_1_id, c.valor_opcion_2_id)
  ), '') end,
  coalesce(c.sku, p.sku), coalesce(c.precio, p.precio), coalesce(c.existencias, p.existencias), p.unidad_medida
  from public.productos p
  left join public.combinaciones c on c.producto_id = p.id and c.activa
  where p.activo
    and (p.nombre ilike '%' || trim(texto_busqueda) || '%' or p.sku ilike '%' || trim(texto_busqueda) || '%'
      or c.sku ilike '%' || trim(texto_busqueda) || '%')
  order by p.nombre, c.sku
  limit greatest(1, least(coalesce(max_resultados, 8), 20));
$$;

revoke all on function public.asistente_buscar_productos(text, integer) from public, anon;
grant execute on function public.asistente_buscar_productos(text, integer) to authenticated;

create or replace function public.asistente_resumen_ventas(desde timestamptz, hasta timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'cantidad', count(*),
    'total', coalesce(sum(total), 0),
    'periodo_desde', desde,
    'periodo_hasta', hasta
  )
  from public.ventas
  where estado = 'confirmada'
    and confirmado_en >= desde and confirmado_en < hasta;
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
  select jsonb_build_object(
    'ventas', count(*),
    'total_ventas', coalesce(sum(v.total), 0),
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
  )
  from public.ventas v
  where v.estado = 'confirmada'
    and v.confirmado_en >= desde and v.confirmado_en < hasta;
$$;

revoke all on function public.resumen_inicio(timestamptz, timestamptz) from public, anon;
grant execute on function public.resumen_inicio(timestamptz, timestamptz) to authenticated;

create or replace function public.reporte_ventas(desde timestamptz, hasta timestamptz)
returns table (
  descripcion text,
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
    count(distinct v.id),
    sum(l.cantidad),
    sum(l.total)
  from public.lineas_venta l
  join public.ventas v on v.id = l.venta_id
  where v.estado = 'confirmada'
    and v.confirmado_en >= desde and v.confirmado_en < hasta
  group by l.descripcion_congelada
  order by sum(l.total) desc, l.descripcion_congelada;
$$;

revoke all on function public.reporte_ventas(timestamptz, timestamptz) from public, anon;
grant execute on function public.reporte_ventas(timestamptz, timestamptz) to authenticated;
