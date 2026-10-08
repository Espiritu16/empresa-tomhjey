create or replace function public.configurar_serie_factura(
  administrador_objetivo uuid,
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
  serie_activa public.series_comprobante%rowtype;
  serie_existente public.series_comprobante%rowtype;
  resultado public.series_comprobante%rowtype;
begin
  if not exists (
    select 1
    from public.perfiles p
    where p.id = administrador_objetivo
      and p.rol = 'administrador'
      and p.activo
  ) then
    raise exception using
      errcode = '42501',
      message = 'Solo una cuenta administradora activa puede configurar la serie.';
  end if;

  if serie_normalizada is null
    or serie_normalizada !~ '^F[A-Z0-9]{3}$'
    or siguiente_solicitado is null
    or siguiente_solicitado <= 0 then
    raise exception using
      errcode = '22023',
      message = 'La serie debe tener formato F001 y el siguiente número debe ser positivo.';
  end if;

  -- Serializa la configuración con otras reservas y cambios de serie.
  lock table public.series_comprobante in exclusive mode;

  select * into serie_activa
  from public.series_comprobante
  where tipo = 'factura' and activa
  for update;

  select * into serie_existente
  from public.series_comprobante
  where tipo = 'factura' and serie = serie_normalizada
  for update;

  if found and siguiente_solicitado < serie_existente.siguiente_numero then
    raise exception using
      errcode = '22023',
      message = 'El correlativo no puede retroceder.';
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
      set activa = false,
          actualizado_por = administrador_objetivo,
          actualizado_en = now()
      where id = serie_activa.id;
    end if;

    insert into public.series_comprobante (
      tipo, serie, siguiente_numero, activa, actualizado_por, actualizado_en
    ) values (
      'factura', serie_normalizada, siguiente_solicitado, true,
      administrador_objetivo, now()
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
    'configurar_serie_factura',
    'serie_comprobante',
    resultado.id,
    jsonb_build_object(
      'tipo', resultado.tipo,
      'serie', resultado.serie,
      'siguiente_numero', resultado.siguiente_numero
    )
  );

  return resultado;
end;
$$;

revoke all on function public.configurar_serie_factura(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.configurar_serie_factura(uuid, text, bigint)
  to service_role;
