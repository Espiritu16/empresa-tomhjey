drop trigger if exists aceptar_invitacion_confirmada on auth.users;
drop function if exists private.aceptar_invitacion_confirmada();
drop function if exists public.invitar_usuario(text, text);
drop function if exists public.invitar_vendedor(text);

alter table public.perfiles add column correo text;

update public.perfiles as p
set correo = lower(u.email)
from auth.users as u
where u.id = p.id;

create unique index perfiles_correo_normalizado_unico
  on public.perfiles (lower(correo))
  where correo is not null;

create or replace function private.sincronizar_correo_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.perfiles
  set correo = lower(new.email), actualizado_en = now()
  where id = new.id;
  return new;
end;
$$;

create trigger sincronizar_correo_al_actualizar_auth
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.sincronizar_correo_auth();

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

  insert into public.perfiles (id, nombre, correo)
  values (new.id, nombre_perfil, lower(new.email))
  on conflict (id) do nothing;

  return new;
end;
$$;
