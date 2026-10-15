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
    where p.id = administrador_objetivo
      and p.rol in ('administrador', 'vendedor') and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta no tiene acceso activo para emitir comprobantes.';
  end if;
  if tipo_solicitado not in ('boleta', 'factura') then
    raise exception using errcode = '22023', message = 'Tipo de comprobante no válido.';
  end if;

  select * into venta_actual from public.ventas v
  where v.id = venta_objetivo and v.estado = 'confirmada'
    and (
      exists (select 1 from public.perfiles p where p.id = administrador_objetivo and p.rol = 'administrador' and p.activo)
      or v.creado_por = administrador_objetivo
    )
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Solo se puede emitir el comprobante de una venta propia confirmada.';
  end if;
  if venta_actual.tipo_comprobante is distinct from tipo_solicitado then
    raise exception using errcode = '22023', message = 'El tipo seleccionado no coincide con el comprobante elegido al confirmar la venta.';
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
    when 'pasaporte' then '7' when 'sin_documento' then '-' else '0' end;

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
