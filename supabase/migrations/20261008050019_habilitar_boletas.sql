alter table public.comprobantes
  add column respuesta_consulta_sunat jsonb,
  add column consulta_sunat_desde timestamptz,
  add column consultado_sunat_en timestamptz,
  add column consulta_en_proceso_hasta timestamptz;

create or replace function public.configurar_serie_comprobante(
  administrador_objetivo uuid,
  tipo_solicitado text,
  serie_solicitada text,
  siguiente_solicitado bigint
)
returns public.series_comprobante
language plpgsql
security definer
set search_path = ''
as $$
declare
  serie_normalizada text := upper(trim(serie_solicitada));
  prefijo_esperado text := case tipo_solicitado when 'factura' then 'F' when 'boleta' then 'B' end;
  serie_activa public.series_comprobante%rowtype;
  serie_existente public.series_comprobante%rowtype;
  resultado public.series_comprobante%rowtype;
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo and p.rol = 'administrador' and p.activo
  ) then
    raise exception using errcode = '42501', message = 'Solo una cuenta administradora activa puede configurar la serie.';
  end if;
  if prefijo_esperado is null
    or serie_normalizada is null
    or serie_normalizada !~ ('^' || prefijo_esperado || '[A-Z0-9]{3}$')
    or siguiente_solicitado is null or siguiente_solicitado <= 0 then
    raise exception using errcode = '22023', message = 'La serie no corresponde al tipo y el correlativo debe ser positivo.';
  end if;

  lock table public.series_comprobante in exclusive mode;

  select * into serie_activa from public.series_comprobante
  where tipo = tipo_solicitado and activa for update;
  select * into serie_existente from public.series_comprobante
  where tipo = tipo_solicitado and serie = serie_normalizada for update;

  if found and siguiente_solicitado < serie_existente.siguiente_numero then
    raise exception using errcode = '22023', message = 'El correlativo no puede retroceder.';
  end if;

  if found and serie_existente.id = serie_activa.id then
    update public.series_comprobante
    set siguiente_numero = siguiente_solicitado,
        actualizado_por = administrador_objetivo,
        actualizado_en = now()
    where id = serie_existente.id
    returning * into resultado;
  else
    if serie_activa.id is not null then
      update public.series_comprobante
      set activa = false, actualizado_por = administrador_objetivo, actualizado_en = now()
      where id = serie_activa.id;
    end if;
    insert into public.series_comprobante (
      tipo, serie, siguiente_numero, activa, actualizado_por, actualizado_en
    ) values (
      tipo_solicitado, serie_normalizada, siguiente_solicitado, true, administrador_objetivo, now()
    )
    on conflict (tipo, serie) do update set
      siguiente_numero = excluded.siguiente_numero,
      activa = true,
      actualizado_por = excluded.actualizado_por,
      actualizado_en = excluded.actualizado_en
    returning * into resultado;
  end if;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (
    administrador_objetivo,
    'configurar_serie_comprobante',
    'serie_comprobante',
    resultado.id,
    jsonb_build_object('tipo', resultado.tipo, 'serie', resultado.serie,
      'siguiente_numero', resultado.siguiente_numero)
  );
  return resultado;
end;
$$;

revoke all on function public.configurar_serie_comprobante(uuid, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.configurar_serie_comprobante(uuid, text, text, bigint)
  to service_role;

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
declare
  tipo_comprobante text;
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

  select c.tipo into tipo_comprobante from public.comprobantes c
  where c.id = comprobante_objetivo and c.estado = 'emitiendo'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'El comprobante no está en proceso.';
  end if;

  update public.comprobantes
  set estado = estado_resultado,
      respuesta_proveedor = coalesce(respuesta, '{}'::jsonb),
      enlace_pdf = coalesce(nullif(respuesta ->> 'enlace_del_pdf', ''), enlace_pdf),
      enlace_xml = coalesce(nullif(respuesta ->> 'enlace_del_xml', ''), enlace_xml),
      enlace_cdr = coalesce(nullif(respuesta ->> 'enlace_del_cdr', ''), enlace_cdr),
      cadena_qr = coalesce(nullif(respuesta ->> 'cadena_para_codigo_qr', ''), cadena_qr),
      error_publico = error_mostrable,
      procesando_hasta = null,
      consulta_sunat_desde = case
        when tipo_comprobante = 'boleta' and estado_resultado = 'emitido'
          then now() + interval '7 days'
        else null
      end,
      consultado_sunat_en = null,
      consulta_en_proceso_hasta = null,
      actualizado_en = now()
  where id = comprobante_objetivo;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (administrador_objetivo, 'registrar_resultado_comprobante', 'comprobante', comprobante_objetivo,
    jsonb_build_object('estado', estado_resultado));
end;
$$;

create or replace function public.reservar_consulta_boleta(
  administrador_objetivo uuid,
  comprobante_objetivo uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  comprobante_actual public.comprobantes%rowtype;
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo and p.rol = 'administrador' and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta administradora no está activa.';
  end if;

  select * into comprobante_actual from public.comprobantes
  where id = comprobante_objetivo for update;
  if not found or comprobante_actual.tipo <> 'boleta' or comprobante_actual.estado <> 'emitido' then
    raise exception using errcode = '22023', message = 'Solo se consulta una boleta ya emitida.';
  end if;
  if comprobante_actual.consulta_sunat_desde is null
    or comprobante_actual.consulta_sunat_desde > now() then
    raise exception using errcode = '22023', message = 'La consulta de aceptación estará disponible después de siete días.';
  end if;
  if comprobante_actual.consultado_sunat_en > now() - interval '24 hours' then
    raise exception using errcode = '22023', message = 'La boleta ya se consultó hoy. Inténtalo mañana si sigue pendiente.';
  end if;
  if comprobante_actual.consulta_en_proceso_hasta > now() then
    raise exception using errcode = '55P03', message = 'Ya hay una consulta en proceso para esta boleta.';
  end if;

  update public.comprobantes
  set consulta_en_proceso_hasta = now() + interval '2 minutes'
  where id = comprobante_objetivo;
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (administrador_objetivo, 'reservar_consulta_boleta', 'comprobante', comprobante_objetivo, '{}'::jsonb);

  return jsonb_build_object(
    'comprobante_id', comprobante_actual.id,
    'serie', comprobante_actual.serie,
    'numero', comprobante_actual.numero,
    'payload', comprobante_actual.payload
  );
end;
$$;

create or replace function public.registrar_consulta_boleta(
  administrador_objetivo uuid,
  comprobante_objetivo uuid,
  respuesta jsonb
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

  update public.comprobantes
  set respuesta_consulta_sunat = respuesta,
      respuesta_proveedor = coalesce(respuesta, respuesta_proveedor),
      enlace_pdf = coalesce(nullif(respuesta ->> 'enlace_del_pdf', ''), enlace_pdf),
      enlace_xml = coalesce(nullif(respuesta ->> 'enlace_del_xml', ''), enlace_xml),
      enlace_cdr = coalesce(nullif(respuesta ->> 'enlace_del_cdr', ''), enlace_cdr),
      cadena_qr = coalesce(nullif(respuesta ->> 'cadena_para_codigo_qr', ''), cadena_qr),
      consultado_sunat_en = now(),
      consulta_en_proceso_hasta = null,
      actualizado_en = now()
  where id = comprobante_objetivo and tipo = 'boleta' and estado = 'emitido'
    and consulta_en_proceso_hasta > now();
  if not found then
    raise exception using errcode = 'P0002', message = 'La consulta de la boleta ya no está reservada.';
  end if;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (
    administrador_objetivo, 'registrar_consulta_boleta', 'comprobante', comprobante_objetivo,
    jsonb_build_object(
      'encontrada', respuesta is not null,
      'aceptada_por_sunat', coalesce(respuesta ->> 'aceptada_por_sunat' = 'true', false)
    )
  );
end;
$$;

revoke all on function public.reservar_consulta_boleta(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.registrar_consulta_boleta(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.reservar_consulta_boleta(uuid, uuid)
  to service_role;
grant execute on function public.registrar_consulta_boleta(uuid, uuid, jsonb)
  to service_role;
