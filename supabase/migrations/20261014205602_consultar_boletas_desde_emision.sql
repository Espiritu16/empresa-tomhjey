-- Las boletas se pueden consultar desde que NubeFacT confirma su emisión.
-- Normaliza las fechas futuras guardadas por la regla anterior.
update public.comprobantes
set consulta_sunat_desde = now()
where tipo = 'boleta'
  and estado = 'emitido'
  and consulta_sunat_desde > now();

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
    where p.id = administrador_objetivo
      and p.rol in ('administrador', 'vendedor')
      and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta no está activa.';
  end if;
  if estado_resultado not in ('emitido', 'rechazado', 'error') then
    raise exception using errcode = '22023', message = 'Estado de emisión no válido.';
  end if;

  select c.tipo into tipo_comprobante
  from public.comprobantes c
  join public.ventas v on v.id = c.venta_id
  where c.id = comprobante_objetivo
    and c.estado = 'emitiendo'
    and (
      exists (
        select 1 from public.perfiles p
        where p.id = administrador_objetivo
          and p.rol = 'administrador'
          and p.activo
      )
      or v.creado_por = administrador_objetivo
    )
  for update of c;
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
        when tipo_comprobante = 'boleta' and estado_resultado = 'emitido' then now()
        else null
      end,
      consultado_sunat_en = null,
      consulta_en_proceso_hasta = null,
      actualizado_en = now()
  where id = comprobante_objetivo;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (
    administrador_objetivo,
    'registrar_resultado_comprobante',
    'comprobante',
    comprobante_objetivo,
    jsonb_build_object('estado', estado_resultado)
  );
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
    where p.id = administrador_objetivo
      and p.rol = 'administrador'
      and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta administradora no está activa.';
  end if;

  select * into comprobante_actual
  from public.comprobantes
  where id = comprobante_objetivo
  for update;
  if not found
    or comprobante_actual.tipo <> 'boleta'
    or comprobante_actual.estado <> 'emitido' then
    raise exception using errcode = '22023', message = 'Solo se consulta una boleta ya emitida.';
  end if;
  if comprobante_actual.respuesta_consulta_sunat ->> 'aceptada_por_sunat' = 'true'
    or comprobante_actual.respuesta_proveedor ->> 'aceptada_por_sunat' = 'true' then
    raise exception using errcode = '22023', message = 'La boleta ya figura aceptada por SUNAT.';
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
  values (
    administrador_objetivo,
    'reservar_consulta_boleta',
    'comprobante',
    comprobante_objetivo,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'comprobante_id', comprobante_actual.id,
    'serie', comprobante_actual.serie,
    'numero', comprobante_actual.numero,
    'payload', comprobante_actual.payload
  );
end;
$$;
