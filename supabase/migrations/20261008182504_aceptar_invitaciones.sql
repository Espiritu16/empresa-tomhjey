create or replace function private.crear_perfil_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nombre_perfil text;
begin
  nombre_perfil := nullif(trim(new.raw_user_meta_data ->> 'nombre'), '');
  if nombre_perfil is null then
    nombre_perfil := coalesce(nullif(split_part(new.email, '@', 1), ''), 'Usuario');
  end if;

  insert into public.perfiles (id, nombre)
  values (new.id, nombre_perfil)
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

create or replace function private.aceptar_invitacion_confirmada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invitaciones
  set estado = 'aceptada'
  where correo = lower(new.email)
    and perfil_id = new.id
    and estado = 'pendiente'
    and expira_en > now();
  return new;
end;
$$;

revoke all on function private.aceptar_invitacion_confirmada() from public, anon, authenticated;

create trigger aceptar_invitacion_confirmada
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.aceptar_invitacion_confirmada();
