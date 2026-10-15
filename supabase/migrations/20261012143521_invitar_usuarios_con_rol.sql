alter table public.invitaciones
  add column rol text not null default 'vendedor'
  check (rol in ('administrador', 'vendedor'));

create or replace function private.crear_perfil_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nombre_perfil text;
  rol_invitado text;
begin
  nombre_perfil := nullif(trim(new.raw_user_meta_data ->> 'nombre'), '');
  if nombre_perfil is null then
    nombre_perfil := coalesce(nullif(split_part(new.email, '@', 1), ''), 'Usuario');
  end if;

  select i.rol into rol_invitado
  from public.invitaciones as i
  where i.correo = lower(new.email)
    and i.estado = 'pendiente'
    and i.perfil_id is null
    and i.expira_en > now();

  insert into public.perfiles (id, nombre, rol)
  values (new.id, nombre_perfil, coalesce(rol_invitado, 'vendedor'))
  on conflict (id) do nothing;

  update public.invitaciones
  set perfil_id = new.id
  where correo = lower(new.email)
    and estado = 'pendiente'
    and perfil_id is null
    and expira_en > now();

  return new;
end;
$$;

create or replace function public.invitar_usuario(
  correo_invitado text,
  rol_invitado text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitacion_id uuid;
  correo_limpio text := lower(trim(correo_invitado));
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede invitar usuarios.';
  end if;
  if rol_invitado is null or rol_invitado not in ('administrador', 'vendedor') then
    raise exception using errcode = '22023', message = 'El rol debe ser administrador o vendedor.';
  end if;
  if correo_limpio !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'El correo no tiene un formato válido.';
  end if;
  if exists (select 1 from auth.users where lower(email) = correo_limpio) then
    raise exception using errcode = '23505', message = 'Ya existe una cuenta con ese correo.';
  end if;

  insert into public.invitaciones (correo, rol, invitado_por)
  values (correo_limpio, rol_invitado, (select auth.uid()))
  on conflict (correo) do update
    set estado = 'pendiente', rol = excluded.rol,
        invitado_por = excluded.invitado_por, perfil_id = null,
        expira_en = now() + interval '7 days', creado_en = now()
  returning id into invitacion_id;
  return invitacion_id;
end;
$$;

revoke all on function public.invitar_usuario(text, text) from public, anon;
grant execute on function public.invitar_usuario(text, text) to authenticated;

create or replace function public.invitar_vendedor(correo_invitado text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.invitar_usuario(correo_invitado, 'vendedor');
$$;

revoke all on function public.invitar_vendedor(text) from public, anon;
grant execute on function public.invitar_vendedor(text) to authenticated;
