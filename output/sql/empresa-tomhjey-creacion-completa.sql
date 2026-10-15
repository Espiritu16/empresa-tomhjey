-- Empresa Tomhjey — SQL completo del esquema Supabase
--
-- Este archivo reúne, en orden cronológico, las migraciones versionadas del
-- proyecto. Incluye creación y evolución de tablas, claves, índices,
-- restricciones, funciones, triggers, permisos y políticas RLS.
--
-- Requiere un proyecto Supabase con los componentes administrados de Auth
-- (auth.uid(), roles authenticated/service_role) y la extensión pgcrypto.
-- No incluye datos de la aplicación ni credenciales.
--
-- Para reconstruir una base local de Supabase, el flujo recomendado es
-- `supabase db reset`, que aplica las mismas migraciones desde el CLI.


-- -----------------------------------------------------------------------------
-- Migración: 20261007000100_esquema_mvp.sql
-- -----------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  rol text not null default 'vendedor' check (rol in ('administrador', 'vendedor')),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.empresa (
  unica boolean primary key default true check (unica),
  nombre text not null check (length(trim(nombre)) > 0),
  ruc text check (ruc is null or ruc ~ '^[0-9]{11}$'),
  direccion text,
  telefono text,
  correo text,
  moneda text not null default 'PEN' check (moneda in ('PEN', 'USD')),
  igv_activo boolean not null default true,
  igv_porcentaje numeric(5, 2) not null default 18 check (igv_porcentaje >= 0 and igv_porcentaje <= 100),
  precios_incluyen_igv boolean not null default true,
  actualizado_por uuid references public.perfiles (id) on delete set null,
  actualizado_en timestamptz not null default now()
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (nombre)
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references public.categorias (id) on delete set null,
  sku text not null unique check (length(trim(sku)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text,
  unidad_medida text not null default 'NIU' check (length(trim(unidad_medida)) > 0),
  usa_combinaciones boolean not null default false,
  precio numeric(12, 2) check (precio is null or precio >= 0),
  existencias numeric(12, 3) not null default 0,
  stock_minimo numeric(12, 3) not null default 0 check (stock_minimo >= 0),
  activo boolean not null default true,
  creado_por uuid not null references public.perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (usa_combinaciones or precio is not null),
  check (not usa_combinaciones or precio is null)
);

create table public.opciones_producto (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  posicion smallint not null check (posicion in (1, 2)),
  unique (producto_id, posicion),
  unique (producto_id, id)
);

create table public.valores_opcion (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  opcion_id uuid not null,
  valor text not null check (length(trim(valor)) > 0),
  unique (opcion_id, valor),
  unique (producto_id, id),
  foreign key (producto_id, opcion_id) references public.opciones_producto (producto_id, id) on delete cascade
);

create table public.combinaciones (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  valor_opcion_1_id uuid,
  valor_opcion_2_id uuid,
  sku text not null unique check (length(trim(sku)) > 0),
  precio numeric(12, 2) not null check (precio >= 0),
  existencias numeric(12, 3) not null default 0,
  stock_minimo numeric(12, 3) not null default 0 check (stock_minimo >= 0),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  check (valor_opcion_1_id is not null or valor_opcion_2_id is not null),
  unique nulls not distinct (producto_id, valor_opcion_1_id, valor_opcion_2_id),
  unique (producto_id, id),
  foreign key (producto_id, valor_opcion_1_id) references public.valores_opcion (producto_id, id) on delete restrict,
  foreign key (producto_id, valor_opcion_2_id) references public.valores_opcion (producto_id, id) on delete restrict
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  tipo_documento text not null default 'sin_documento' check (tipo_documento in ('sin_documento', 'dni', 'ruc', 'ce', 'pasaporte')),
  numero_documento text,
  nombre text not null check (length(trim(nombre)) > 0),
  direccion text,
  telefono text,
  correo text,
  notas text,
  activo boolean not null default true,
  creado_por uuid not null references public.perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check ((tipo_documento = 'sin_documento') or length(trim(coalesce(numero_documento, ''))) > 0)
);

create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes (id) on delete set null,
  cliente_nombre text,
  cliente_tipo_documento text,
  cliente_numero_documento text,
  cliente_direccion text,
  estado text not null default 'borrador' check (estado in ('borrador', 'confirmada', 'descartada')),
  moneda text not null default 'PEN' check (moneda in ('PEN', 'USD')),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  igv numeric(12, 2) not null default 0 check (igv >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  nota text,
  creado_por uuid not null references public.perfiles (id) on delete restrict,
  confirmado_por uuid references public.perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  confirmado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  check ((estado = 'confirmada') = (confirmado_en is not null))
);

create table public.lineas_venta (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas (id) on delete cascade,
  producto_id uuid not null references public.productos (id) on delete restrict,
  combinacion_id uuid,
  descripcion_congelada text not null check (length(trim(descripcion_congelada)) > 0),
  sku_congelado text not null,
  unidad_medida text not null,
  cantidad numeric(12, 3) not null check (cantidad > 0),
  precio_unitario numeric(12, 2) not null check (precio_unitario >= 0),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  igv numeric(12, 2) not null check (igv >= 0),
  total numeric(12, 2) not null check (total >= 0),
  creado_en timestamptz not null default now(),
  foreign key (producto_id, combinacion_id) references public.combinaciones (producto_id, id) on delete restrict
);

create table public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete restrict,
  combinacion_id uuid,
  tipo text not null check (tipo in ('ajuste', 'venta')),
  cantidad numeric(12, 3) not null check (cantidad <> 0),
  existencias_resultantes numeric(12, 3) not null,
  motivo text not null check (length(trim(motivo)) > 0),
  venta_id uuid references public.ventas (id) on delete restrict,
  usuario_id uuid not null references public.perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  foreign key (producto_id, combinacion_id) references public.combinaciones (producto_id, id) on delete restrict,
  check ((tipo = 'venta') = (venta_id is not null))
);

create table public.series_comprobante (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('boleta', 'factura')),
  serie text not null check (serie ~ '^[BF][A-Z0-9]{3}$'),
  siguiente_numero bigint not null default 1 check (siguiente_numero > 0),
  activa boolean not null default true,
  actualizado_por uuid references public.perfiles (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  unique (tipo, serie)
);

create unique index series_comprobante_una_activa_por_tipo
  on public.series_comprobante (tipo) where activa;

create table public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null unique references public.ventas (id) on delete restrict,
  tipo text not null check (tipo in ('boleta', 'factura')),
  serie text not null,
  numero bigint not null check (numero > 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'emitido', 'rechazado', 'error')),
  payload jsonb not null,
  respuesta_proveedor jsonb,
  enlace_pdf text,
  enlace_xml text,
  enlace_cdr text,
  cadena_qr text,
  intentos smallint not null default 0 check (intentos >= 0),
  error_publico text,
  solicitado_por uuid not null references public.perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (serie, numero)
);

create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.perfiles (id) on delete set null,
  accion text not null check (length(trim(accion)) > 0),
  entidad text not null check (length(trim(entidad)) > 0),
  entidad_id uuid,
  datos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index opciones_producto_producto_idx on public.opciones_producto (producto_id);
create index valores_opcion_producto_idx on public.valores_opcion (producto_id);
create index combinaciones_producto_idx on public.combinaciones (producto_id);
create index productos_categoria_idx on public.productos (categoria_id);
create index clientes_nombre_idx on public.clientes (nombre);
create index ventas_creado_por_fecha_idx on public.ventas (creado_por, creado_en desc);
create index ventas_estado_fecha_idx on public.ventas (estado, creado_en desc);
create index lineas_venta_venta_idx on public.lineas_venta (venta_id);
create index lineas_venta_producto_idx on public.lineas_venta (producto_id);
create index movimientos_producto_fecha_idx on public.movimientos_inventario (producto_id, creado_en desc);
create index movimientos_combinacion_fecha_idx on public.movimientos_inventario (combinacion_id, creado_en desc) where combinacion_id is not null;
create index comprobantes_estado_fecha_idx on public.comprobantes (estado, creado_en desc);
create index auditoria_entidad_idx on public.auditoria (entidad, entidad_id, creado_en desc);

alter table public.perfiles enable row level security;
alter table public.empresa enable row level security;
alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.opciones_producto enable row level security;
alter table public.valores_opcion enable row level security;
alter table public.combinaciones enable row level security;
alter table public.clientes enable row level security;
alter table public.ventas enable row level security;
alter table public.lineas_venta enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.series_comprobante enable row level security;
alter table public.comprobantes enable row level security;
alter table public.auditoria enable row level security;


-- -----------------------------------------------------------------------------
-- Migración: 20261007000200_operaciones_mvp.sql
-- -----------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo
  );
$$;

create or replace function private.tiene_rol(roles_permitidos text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo
      and p.rol = any (roles_permitidos)
  );
$$;

create or replace function private.ruc_valido(valor text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  factores integer[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  suma integer := 0;
  resto integer;
  digito integer;
begin
  if valor is null or valor !~ '^[0-9]{11}$' or substring(valor from 1 for 2) not in ('10', '15', '17', '20') then
    return false;
  end if;
  for indice in 1..10 loop
    suma := suma + substring(valor from indice for 1)::integer * factores[indice];
  end loop;
  resto := 11 - (suma % 11);
  digito := case resto when 10 then 0 when 11 then 1 else resto end;
  return digito = substring(valor from 11 for 1)::integer;
end;
$$;

revoke all on function private.usuario_activo() from public, anon;
revoke all on function private.tiene_rol(text[]) from public, anon;
revoke all on function private.ruc_valido(text) from public, anon, authenticated;
grant execute on function private.usuario_activo() to authenticated;
grant execute on function private.tiene_rol(text[]) to authenticated;

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
  return new;
end;
$$;

create trigger crear_perfil_al_registrar_auth
  after insert on auth.users
  for each row execute function private.crear_perfil_auth();

create or replace function public.inicializar_administrador(usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Solo el aprovisionamiento inicial puede asignar el primer administrador.';
  end if;

  if exists (select 1 from public.perfiles where rol = 'administrador') then
    raise exception using errcode = '23505', message = 'Ya existe un administrador inicial.';
  end if;

  update public.perfiles
  set rol = 'administrador', actualizado_en = now()
  where id = usuario_id and activo;

  if not found then
    raise exception using errcode = 'P0002', message = 'No existe un usuario activo para aprovisionar.';
  end if;
end;
$$;

revoke all on function public.inicializar_administrador(uuid) from public, anon, authenticated;
grant execute on function public.inicializar_administrador(uuid) to service_role;

create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  correo text not null unique check (correo = lower(trim(correo))),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'cancelada')),
  invitado_por uuid not null references public.perfiles (id) on delete restrict,
  perfil_id uuid references public.perfiles (id) on delete set null,
  expira_en timestamptz not null default now() + interval '7 days',
  creado_en timestamptz not null default now()
);

create index invitaciones_estado_expira_idx on public.invitaciones (estado, expira_en);
alter table public.invitaciones enable row level security;

create policy perfiles_lectura_propios_o_admin
  on public.perfiles for select to authenticated
  using ((select private.usuario_activo()) and (id = (select auth.uid()) or (select private.tiene_rol(array['administrador']))));

create policy empresa_lectura_equipo
  on public.empresa for select to authenticated
  using ((select private.usuario_activo()));

create policy empresa_edicion_admin
  on public.empresa for update to authenticated
  using ((select private.tiene_rol(array['administrador'])))
  with check ((select private.tiene_rol(array['administrador'])));

create policy categorias_lectura_equipo
  on public.categorias for select to authenticated
  using ((select private.usuario_activo()));
create policy categorias_admin
  on public.categorias for all to authenticated
  using ((select private.tiene_rol(array['administrador'])))
  with check ((select private.tiene_rol(array['administrador'])));

create policy productos_lectura_equipo
  on public.productos for select to authenticated
  using ((select private.usuario_activo()));
create policy productos_admin
  on public.productos for all to authenticated
  using ((select private.tiene_rol(array['administrador'])))
  with check ((select private.tiene_rol(array['administrador'])));

create policy opciones_producto_lectura_equipo
  on public.opciones_producto for select to authenticated
  using ((select private.usuario_activo()));
create policy opciones_producto_admin
  on public.opciones_producto for all to authenticated
  using ((select private.tiene_rol(array['administrador'])))
  with check ((select private.tiene_rol(array['administrador'])));

create policy valores_opcion_lectura_equipo
  on public.valores_opcion for select to authenticated
  using ((select private.usuario_activo()));
create policy valores_opcion_admin
  on public.valores_opcion for all to authenticated
  using ((select private.tiene_rol(array['administrador'])))
  with check ((select private.tiene_rol(array['administrador'])));

create policy combinaciones_lectura_equipo
  on public.combinaciones for select to authenticated
  using ((select private.usuario_activo()));
create policy combinaciones_admin
  on public.combinaciones for all to authenticated
  using ((select private.tiene_rol(array['administrador'])))
  with check ((select private.tiene_rol(array['administrador'])));

create policy clientes_lectura_equipo
  on public.clientes for select to authenticated
  using ((select private.usuario_activo()));
create policy clientes_escritura_equipo
  on public.clientes for insert to authenticated
  with check ((select private.tiene_rol(array['administrador', 'vendedor'])) and creado_por = (select auth.uid()));
create policy clientes_actualizacion_equipo
  on public.clientes for update to authenticated
  using ((select private.tiene_rol(array['administrador', 'vendedor'])))
  with check ((select private.tiene_rol(array['administrador', 'vendedor'])));

create policy ventas_lectura_por_rol
  on public.ventas for select to authenticated
  using ((select private.tiene_rol(array['administrador'])) or ((select private.tiene_rol(array['vendedor'])) and creado_por = (select auth.uid())));

create policy lineas_venta_lectura_por_venta
  on public.lineas_venta for select to authenticated
  using (exists (
    select 1 from public.ventas v
    where v.id = venta_id
      and ((select private.tiene_rol(array['administrador'])) or v.creado_por = (select auth.uid()))
  ));

create policy movimientos_lectura_por_rol
  on public.movimientos_inventario for select to authenticated
  using (
    (select private.tiene_rol(array['administrador']))
    or exists (
      select 1 from public.ventas v
      where v.id = venta_id and v.creado_por = (select auth.uid())
    )
  );

create policy series_lectura_equipo
  on public.series_comprobante for select to authenticated
  using ((select private.usuario_activo()));
create policy series_admin
  on public.series_comprobante for all to authenticated
  using ((select private.tiene_rol(array['administrador'])))
  with check ((select private.tiene_rol(array['administrador'])));

create policy comprobantes_lectura_por_venta
  on public.comprobantes for select to authenticated
  using (exists (
    select 1 from public.ventas v
    where v.id = venta_id
      and ((select private.tiene_rol(array['administrador'])) or v.creado_por = (select auth.uid()))
  ));

create policy auditoria_lectura_admin
  on public.auditoria for select to authenticated
  using ((select private.tiene_rol(array['administrador'])));

create policy invitaciones_lectura_admin
  on public.invitaciones for select to authenticated
  using ((select private.tiene_rol(array['administrador'])));

revoke all on public.perfiles, public.empresa, public.categorias, public.productos,
  public.opciones_producto, public.valores_opcion, public.combinaciones,
  public.clientes, public.ventas, public.lineas_venta,
  public.movimientos_inventario, public.series_comprobante,
  public.comprobantes, public.auditoria, public.invitaciones
  from anon, authenticated;

grant select on public.perfiles, public.empresa, public.categorias, public.productos,
  public.opciones_producto, public.valores_opcion, public.combinaciones,
  public.clientes, public.ventas, public.lineas_venta,
  public.movimientos_inventario, public.series_comprobante,
  public.comprobantes to authenticated;
grant select on public.empresa to authenticated;
grant insert, update, delete on public.categorias to authenticated;
grant insert (categoria_id, sku, nombre, descripcion, unidad_medida, usa_combinaciones, precio, stock_minimo, activo, creado_por),
  update (categoria_id, sku, nombre, descripcion, unidad_medida, usa_combinaciones, precio, stock_minimo, activo)
  on public.productos to authenticated;
grant delete on public.productos to authenticated;
grant insert (producto_id, nombre, posicion), update (nombre, posicion), delete
  on public.opciones_producto to authenticated;
grant insert (producto_id, opcion_id, valor), update (valor), delete
  on public.valores_opcion to authenticated;
grant insert (producto_id, valor_opcion_1_id, valor_opcion_2_id, sku, precio, stock_minimo, activa),
  update (valor_opcion_1_id, valor_opcion_2_id, sku, precio, stock_minimo, activa), delete
  on public.combinaciones to authenticated;
grant insert, update on public.clientes to authenticated;
grant select on public.invitaciones, public.auditoria to authenticated;

create or replace function public.invitar_vendedor(correo_invitado text)
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
  if correo_limpio !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'El correo no tiene un formato válido.';
  end if;
  insert into public.invitaciones (correo, invitado_por)
  values (correo_limpio, (select auth.uid()))
  on conflict (correo) do update
    set estado = 'pendiente', invitado_por = excluded.invitado_por,
        perfil_id = null, expira_en = now() + interval '7 days', creado_en = now()
  returning id into invitacion_id;
  return invitacion_id;
end;
$$;

revoke all on function public.invitar_vendedor(text) from public, anon;
grant execute on function public.invitar_vendedor(text) to authenticated;

create or replace function public.cambiar_estado_vendedor(usuario_objetivo uuid, activar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede gestionar el equipo.';
  end if;
  update public.perfiles
  set activo = activar, actualizado_en = now()
  where id = usuario_objetivo and rol = 'vendedor';
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró un vendedor para actualizar.';
  end if;
end;
$$;

revoke all on function public.cambiar_estado_vendedor(uuid, boolean) from public, anon;
grant execute on function public.cambiar_estado_vendedor(uuid, boolean) to authenticated;

create or replace function public.ajustar_existencias(producto_objetivo uuid, combinacion_objetivo uuid, cambio numeric, razon text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  movimiento_id uuid := gen_random_uuid();
  existencias_nuevas numeric(12, 3);
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede ajustar existencias.';
  end if;
  if cambio = 0 or nullif(trim(razon), '') is null then
    raise exception using errcode = '22023', message = 'El ajuste debe tener cantidad y motivo.';
  end if;

  if combinacion_objetivo is null then
    update public.productos
    set existencias = existencias + cambio, actualizado_en = now()
    where id = producto_objetivo and not usa_combinaciones and activo
      and existencias + cambio >= 0
    returning existencias into existencias_nuevas;
  else
    update public.combinaciones
    set existencias = existencias + cambio
    where id = combinacion_objetivo and producto_id = producto_objetivo and activa
      and existencias + cambio >= 0
    returning existencias into existencias_nuevas;
  end if;

  if not found then
    raise exception using errcode = '22023', message = 'El producto no existe, no está activo o el ajuste dejaría stock negativo.';
  end if;

  insert into public.movimientos_inventario (
    id, producto_id, combinacion_id, tipo, cantidad,
    existencias_resultantes, motivo, usuario_id
  ) values (
    movimiento_id, producto_objetivo, combinacion_objetivo, 'ajuste',
    cambio, existencias_nuevas, trim(razon), (select auth.uid())
  );
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values ((select auth.uid()), 'ajustar_existencias', 'producto', producto_objetivo,
    jsonb_build_object('combinacion_id', combinacion_objetivo, 'cambio', cambio, 'motivo', trim(razon)));
  return movimiento_id;
end;
$$;

revoke all on function public.ajustar_existencias(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.ajustar_existencias(uuid, uuid, numeric, text) to authenticated;

create or replace function public.crear_borrador_venta(cliente_objetivo uuid, lineas jsonb, venta_objetivo uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario_actual uuid := (select auth.uid());
  id_venta uuid := venta_objetivo;
  venta_estado text;
  nombre_cliente text;
  tipo_doc_cliente text;
  numero_doc_cliente text;
  direccion_cliente text;
  empresa_config public.empresa%rowtype;
  linea jsonb;
  producto public.productos%rowtype;
  combinacion public.combinaciones%rowtype;
  id_producto uuid;
  id_combinacion uuid;
  cantidad_linea numeric(12, 3);
  precio numeric(12, 2);
  importe numeric(12, 2);
  subtotal_lineas numeric(12, 2) := 0;
  igv_calculado numeric(12, 2);
  total_calculado numeric(12, 2);
  tasa numeric(5, 2);
  incluye_igv boolean;
  descripcion text;
  sku text;
begin
  if not (select private.tiene_rol(array['administrador', 'vendedor'])) then
    raise exception using errcode = '42501', message = 'La sesión no puede crear ventas.';
  end if;
  if jsonb_typeof(lineas) <> 'array' or jsonb_array_length(lineas) = 0 then
    raise exception using errcode = '22023', message = 'Agregue al menos un producto a la venta.';
  end if;

  if cliente_objetivo is not null then
    select nombre, tipo_documento, numero_documento, direccion
      into nombre_cliente, tipo_doc_cliente, numero_doc_cliente, direccion_cliente
    from public.clientes where id = cliente_objetivo and activo;
    if not found then
      raise exception using errcode = 'P0002', message = 'No se encontró el cliente activo.';
    end if;
  end if;
  select * into strict empresa_config from public.empresa limit 1;
  tasa := case when empresa_config.igv_activo then empresa_config.igv_porcentaje / 100 else 0 end;
  incluye_igv := empresa_config.precios_incluyen_igv;

  if id_venta is not null then
    select estado into venta_estado
    from public.ventas
    where id = id_venta
      and ((select private.tiene_rol(array['administrador'])) or creado_por = usuario_actual)
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'No se encontró la venta.';
    end if;
    if venta_estado <> 'borrador' then
      raise exception using errcode = '55000', message = 'Solo se puede editar un borrador.';
    end if;
    update public.ventas set cliente_id = cliente_objetivo,
      cliente_nombre = nombre_cliente, cliente_tipo_documento = tipo_doc_cliente,
      cliente_numero_documento = numero_doc_cliente, cliente_direccion = direccion_cliente,
      actualizado_en = now()
    where id = id_venta;
    delete from public.lineas_venta lv where lv.venta_id = id_venta;
  else
    insert into public.ventas (
      cliente_id, cliente_nombre, cliente_tipo_documento,
      cliente_numero_documento, cliente_direccion, creado_por, moneda
    ) values (
      cliente_objetivo, nombre_cliente, tipo_doc_cliente,
      numero_doc_cliente, direccion_cliente, usuario_actual, empresa_config.moneda
    ) returning id into id_venta;
  end if;

  for linea in select value from jsonb_array_elements(lineas) loop
    id_producto := (linea ->> 'producto_id')::uuid;
    id_combinacion := nullif(linea ->> 'combinacion_id', '')::uuid;
    cantidad_linea := (linea ->> 'cantidad')::numeric;
    if cantidad_linea is null or cantidad_linea <= 0 then
      raise exception using errcode = '22023', message = 'Las cantidades deben ser mayores que cero.';
    end if;

    select * into producto from public.productos
    where id = id_producto and activo;
    if not found then
      raise exception using errcode = 'P0002', message = 'El producto no existe o está inactivo.';
    end if;

    if producto.usa_combinaciones then
      if id_combinacion is null then
        raise exception using errcode = '22023', message = 'Seleccione la combinación del producto.';
      end if;
      select * into combinacion from public.combinaciones
      where id = id_combinacion and producto_id = id_producto and activa;
      if not found then
        raise exception using errcode = 'P0002', message = 'La combinación no existe o está inactiva.';
      end if;
      precio := combinacion.precio;
      sku := combinacion.sku;
      descripcion := producto.nombre || ' ' || coalesce((
        select string_agg(vo.valor, ' ' order by op.posicion)
        from public.valores_opcion vo
        join public.opciones_producto op on op.id = vo.opcion_id
        where vo.id in (combinacion.valor_opcion_1_id, combinacion.valor_opcion_2_id)
      ), '');
    else
      if id_combinacion is not null or producto.precio is null then
        raise exception using errcode = '22023', message = 'La combinación no corresponde al producto.';
      end if;
      precio := producto.precio;
      sku := producto.sku;
      descripcion := producto.nombre;
    end if;

    importe := round(precio * cantidad_linea, 2);
    subtotal_lineas := subtotal_lineas + importe;
    insert into public.lineas_venta (
      venta_id, producto_id, combinacion_id, descripcion_congelada,
      sku_congelado, unidad_medida, cantidad, precio_unitario,
      subtotal, igv, total
    ) values (
      id_venta, id_producto, id_combinacion, trim(descripcion), sku,
      producto.unidad_medida, cantidad_linea, precio, importe, 0, importe
    );
  end loop;

  if incluye_igv and tasa > 0 then
    total_calculado := round(subtotal_lineas, 2);
    igv_calculado := total_calculado - round(total_calculado / (1 + tasa), 2);
    subtotal_lineas := total_calculado - igv_calculado;
  else
    igv_calculado := round(subtotal_lineas * tasa, 2);
    total_calculado := subtotal_lineas + igv_calculado;
  end if;

  update public.ventas
  set subtotal = subtotal_lineas, igv = igv_calculado, total = total_calculado,
      actualizado_en = now()
  where id = id_venta;
  update public.lineas_venta lv
  set igv = case when incluye_igv and tasa > 0
    then round(total * tasa / (1 + tasa), 2)
    else round(total * tasa, 2) end,
      subtotal = case when incluye_igv and tasa > 0
        then total - round(total * tasa / (1 + tasa), 2)
        else total end,
      total = case when incluye_igv then total else total + round(total * tasa, 2) end
  where lv.venta_id = id_venta;
  return id_venta;
end;
$$;

revoke all on function public.crear_borrador_venta(uuid, jsonb, uuid) from public, anon;
grant execute on function public.crear_borrador_venta(uuid, jsonb, uuid) to authenticated;

create or replace function public.confirmar_venta(venta_objetivo uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  venta_actual public.ventas%rowtype;
  empresa_config public.empresa%rowtype;
  producto_actual public.productos%rowtype;
  combinacion_actual public.combinaciones%rowtype;
  linea_actual record;
  grupo record;
  precio_actual numeric(12, 2);
  importe_actual numeric(12, 2);
  impuesto_actual numeric(12, 2);
  tasa_actual numeric(5, 2);
  cantidad_disponible numeric(12, 3);
  existencias_nuevas numeric(12, 3);
begin
  if not (select private.tiene_rol(array['administrador', 'vendedor'])) then
    raise exception using errcode = '42501', message = 'La sesión no puede confirmar ventas.';
  end if;
  select * into venta_actual from public.ventas
  where id = venta_objetivo
    and ((select private.tiene_rol(array['administrador'])) or creado_por = (select auth.uid()))
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró la venta.';
  end if;
  if venta_actual.estado = 'confirmada' then
    return jsonb_build_object('venta_id', venta_actual.id, 'estado', venta_actual.estado, 'total', venta_actual.total);
  end if;
  if venta_actual.estado <> 'borrador' then
    raise exception using errcode = '55000', message = 'La venta ya no está disponible para confirmar.';
  end if;
  if not exists (select 1 from public.lineas_venta where venta_id = venta_objetivo) then
    raise exception using errcode = '22023', message = 'La venta no tiene productos.';
  end if;

  select * into strict empresa_config from public.empresa limit 1;
  tasa_actual := case when empresa_config.igv_activo then empresa_config.igv_porcentaje / 100 else 0 end;
  for linea_actual in
    select * from public.lineas_venta
    where venta_id = venta_objetivo
    order by producto_id, combinacion_id nulls first, id
  loop
    select * into producto_actual from public.productos
    where id = linea_actual.producto_id and activo
    for update;
    if not found then
      raise exception using errcode = '55000', message = 'Un producto de la venta ya no está activo; actualice el borrador.';
    end if;
    if producto_actual.usa_combinaciones then
      select * into combinacion_actual from public.combinaciones
      where id = linea_actual.combinacion_id and producto_id = producto_actual.id and activa
      for update;
      if not found then
        raise exception using errcode = '55000', message = 'Una combinación de la venta ya no está activa; actualice el borrador.';
      end if;
      precio_actual := combinacion_actual.precio;
    elsif linea_actual.combinacion_id is null then
      precio_actual := producto_actual.precio;
    else
      raise exception using errcode = '55000', message = 'La combinación de un producto cambió; actualice el borrador.';
    end if;

    if precio_actual is distinct from linea_actual.precio_unitario then
      raise exception using errcode = '55000', message = 'El precio de un producto cambió; actualice el borrador antes de confirmar.';
    end if;
    importe_actual := round(precio_actual * linea_actual.cantidad, 2);
    if empresa_config.precios_incluyen_igv then
      impuesto_actual := case when tasa_actual > 0 then round(importe_actual * tasa_actual / (1 + tasa_actual), 2) else 0 end;
      if linea_actual.subtotal is distinct from importe_actual - impuesto_actual
        or linea_actual.igv is distinct from impuesto_actual
        or linea_actual.total is distinct from importe_actual then
        raise exception using errcode = '55000', message = 'La configuración de impuestos cambió; actualice el borrador antes de confirmar.';
      end if;
    else
      impuesto_actual := round(importe_actual * tasa_actual, 2);
      if linea_actual.subtotal is distinct from importe_actual
        or linea_actual.igv is distinct from impuesto_actual
        or linea_actual.total is distinct from importe_actual + impuesto_actual then
        raise exception using errcode = '55000', message = 'La configuración de impuestos cambió; actualice el borrador antes de confirmar.';
      end if;
    end if;
  end loop;

  for grupo in
    select producto_id, combinacion_id, sum(cantidad) as cantidad
    from public.lineas_venta where venta_id = venta_objetivo
    group by producto_id, combinacion_id
    order by producto_id, combinacion_id nulls first
  loop
    if grupo.combinacion_id is null then
      select existencias into cantidad_disponible
      from public.productos where id = grupo.producto_id and activo and not usa_combinaciones
      for update;
    else
      select existencias into cantidad_disponible
      from public.combinaciones where id = grupo.combinacion_id and producto_id = grupo.producto_id and activa
      for update;
    end if;
    if not found or cantidad_disponible < grupo.cantidad then
      raise exception using errcode = '23514', message = 'No hay existencias suficientes para confirmar la venta.';
    end if;
  end loop;

  for grupo in
    select producto_id, combinacion_id, sum(cantidad) as cantidad
    from public.lineas_venta where venta_id = venta_objetivo
    group by producto_id, combinacion_id
    order by producto_id, combinacion_id nulls first
  loop
    if grupo.combinacion_id is null then
      update public.productos set existencias = existencias - grupo.cantidad, actualizado_en = now()
      where id = grupo.producto_id returning existencias into existencias_nuevas;
    else
      update public.combinaciones set existencias = existencias - grupo.cantidad
      where id = grupo.combinacion_id returning existencias into existencias_nuevas;
    end if;
    insert into public.movimientos_inventario (
      producto_id, combinacion_id, tipo, cantidad,
      existencias_resultantes, motivo, venta_id, usuario_id
    ) values (
      grupo.producto_id, grupo.combinacion_id, 'venta', -grupo.cantidad,
      existencias_nuevas, 'Venta confirmada', venta_objetivo, (select auth.uid())
    );
  end loop;

  update public.ventas
  set estado = 'confirmada', confirmado_por = (select auth.uid()),
      confirmado_en = now(), actualizado_en = now()
  where id = venta_objetivo;
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values ((select auth.uid()), 'confirmar_venta', 'venta', venta_objetivo,
    jsonb_build_object('total', venta_actual.total));
  return jsonb_build_object('venta_id', venta_objetivo, 'estado', 'confirmada', 'total', venta_actual.total);
end;
$$;

revoke all on function public.confirmar_venta(uuid) from public, anon;
grant execute on function public.confirmar_venta(uuid) to authenticated;

create or replace function public.descartar_borrador_venta(venta_objetivo uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.tiene_rol(array['administrador', 'vendedor'])) then
    raise exception using errcode = '42501', message = 'La sesión no puede descartar ventas.';
  end if;
  update public.ventas
  set estado = 'descartada', actualizado_en = now()
  where id = venta_objetivo and estado = 'borrador'
    and ((select private.tiene_rol(array['administrador'])) or creado_por = (select auth.uid()));
  if not found then
    raise exception using errcode = '55000', message = 'Solo se puede descartar un borrador propio.';
  end if;
end;
$$;

revoke all on function public.descartar_borrador_venta(uuid) from public, anon;
grant execute on function public.descartar_borrador_venta(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Migración: 20261007000300_facturacion_asistente.sql
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- Migración: 20261008044658_facturacion_facturas.sql
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- Migración: 20261008050019_habilitar_boletas.sql
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- Migración: 20261008164647_crear_producto_con_combinaciones.sql
-- -----------------------------------------------------------------------------

create or replace function public.crear_producto_con_combinaciones(
  sku_producto text,
  nombre_producto text,
  categoria_objetivo uuid,
  unidad text,
  precio_base numeric,
  minimo_stock numeric,
  opciones jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  producto_id uuid;
  opcion_id uuid;
  valores_opcion_1_ids uuid[] := array[]::uuid[];
  valores_opcion_2_ids uuid[] := array[]::uuid[];
  valores_actuales uuid[];
  valor_opcion_id uuid;
  combinacion_sku text;
  cantidad_opciones integer;
  valores jsonb;
  nombre_opcion text;
  numero_combinacion integer := 0;
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede crear productos con combinaciones.';
  end if;
  if nullif(trim(sku_producto), '') is null
    or nullif(trim(nombre_producto), '') is null
    or nullif(trim(unidad), '') is null
    or precio_base is null or precio_base < 0
    or minimo_stock is null or minimo_stock < 0
    or jsonb_typeof(opciones) is distinct from 'array'
  then
    raise exception using errcode = '22023', message = 'Revisa los datos del producto y sus opciones.';
  end if;

  cantidad_opciones := jsonb_array_length(opciones);
  if cantidad_opciones not between 1 and 2 then
    raise exception using errcode = '22023', message = 'Un producto requiere una o dos opciones.';
  end if;
  if categoria_objetivo is not null and not exists (
    select 1 from public.categorias where id = categoria_objetivo and activa
  ) then
    raise exception using errcode = '22023', message = 'La categoría no existe o está inactiva.';
  end if;

  for indice_opcion in 1..cantidad_opciones loop
    nombre_opcion := nullif(trim(opciones -> (indice_opcion - 1) ->> 'nombre'), '');
    valores := opciones -> (indice_opcion - 1) -> 'valores';
    if nombre_opcion is null or jsonb_typeof(valores) is distinct from 'array'
      or jsonb_array_length(valores) not between 1 and 20
    then
      raise exception using errcode = '22023', message = 'Cada opción necesita un nombre y entre uno y veinte valores.';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(valores) as elemento(valor)
      where nullif(trim(elemento.valor), '') is null
    ) or (select count(distinct lower(trim(elemento.valor))) from jsonb_array_elements_text(valores) as elemento(valor)) <> jsonb_array_length(valores) then
      raise exception using errcode = '22023', message = 'Los valores de una opción deben estar completos y no repetirse.';
    end if;
  end loop;

  if cantidad_opciones = 2 and lower(trim(opciones -> 0 ->> 'nombre')) = lower(trim(opciones -> 1 ->> 'nombre')) then
    raise exception using errcode = '22023', message = 'Las opciones deben tener nombres distintos.';
  end if;

  insert into public.productos (categoria_id, sku, nombre, unidad_medida, usa_combinaciones, precio, stock_minimo, creado_por)
  values (categoria_objetivo, trim(sku_producto), trim(nombre_producto), upper(trim(unidad)), true, null, minimo_stock, (select auth.uid()))
  returning id into producto_id;

  for indice_opcion in 1..cantidad_opciones loop
    nombre_opcion := trim(opciones -> (indice_opcion - 1) ->> 'nombre');
    valores := opciones -> (indice_opcion - 1) -> 'valores';
    insert into public.opciones_producto (producto_id, nombre, posicion)
    values (producto_id, nombre_opcion, indice_opcion)
    returning id into opcion_id;
    valores_actuales := array[]::uuid[];
    for indice_valor in 0..jsonb_array_length(valores) - 1 loop
      insert into public.valores_opcion (producto_id, opcion_id, valor)
      values (producto_id, opcion_id, trim(valores ->> indice_valor))
      returning id into valor_opcion_id;
      valores_actuales := array_append(valores_actuales, valor_opcion_id);
    end loop;
    if indice_opcion = 1 then
      valores_opcion_1_ids := valores_actuales;
    else
      valores_opcion_2_ids := valores_actuales;
    end if;
  end loop;

  if cantidad_opciones = 1 then
    for indice_valor in 1..coalesce(array_length(valores_opcion_1_ids, 1), 0) loop
      numero_combinacion := numero_combinacion + 1;
      combinacion_sku := trim(sku_producto) || '-' || lpad(indice_valor::text, 2, '0');
      insert into public.combinaciones (producto_id, valor_opcion_1_id, sku, precio, stock_minimo)
      values (producto_id, valores_opcion_1_ids[indice_valor], combinacion_sku, precio_base, minimo_stock);
    end loop;
  else
    for indice_valor in 1..coalesce(array_length(valores_opcion_1_ids, 1), 0) loop
      for indice_segundo in 1..coalesce(array_length(valores_opcion_2_ids, 1), 0) loop
        numero_combinacion := numero_combinacion + 1;
        combinacion_sku := trim(sku_producto) || '-' || lpad(numero_combinacion::text, 2, '0');
        insert into public.combinaciones (producto_id, valor_opcion_1_id, valor_opcion_2_id, sku, precio, stock_minimo)
        values (producto_id, valores_opcion_1_ids[indice_valor], valores_opcion_2_ids[indice_segundo], combinacion_sku, precio_base, minimo_stock);
      end loop;
    end loop;
  end if;
  return producto_id;
end;
$$;

revoke all on function public.crear_producto_con_combinaciones(text, text, uuid, text, numeric, numeric, jsonb) from public, anon;
grant execute on function public.crear_producto_con_combinaciones(text, text, uuid, text, numeric, numeric, jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- Migración: 20261008182102_proteger_estado_clientes.sql
-- -----------------------------------------------------------------------------

create or replace function private.validar_cambio_estado_cliente()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.activo is distinct from old.activo
    and not (select private.tiene_rol(array['administrador'])) then
    raise exception using
      errcode = '42501',
      message = 'Solo administración puede activar o inactivar clientes.';
  end if;
  return new;
end;
$$;

revoke all on function private.validar_cambio_estado_cliente() from public, anon, authenticated;

create trigger validar_estado_cliente
  before update of activo on public.clientes
  for each row execute function private.validar_cambio_estado_cliente();

create or replace function public.cambiar_estado_cliente(cliente_objetivo uuid, activar boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede gestionar clientes.';
  end if;

  update public.clientes
  set activo = activar, actualizado_en = now()
  where id = cliente_objetivo;

  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró el cliente para actualizar.';
  end if;
end;
$$;

revoke all on function public.cambiar_estado_cliente(uuid, boolean) from public, anon;
grant execute on function public.cambiar_estado_cliente(uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- Migración: 20261008182504_aceptar_invitaciones.sql
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- Migración: 20261009043055_validar_documentos_clientes.sql
-- -----------------------------------------------------------------------------

create or replace function private.validar_documento_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.tipo_documento is not distinct from new.tipo_documento
    and old.numero_documento is not distinct from new.numero_documento then
    return new;
  end if;

  if new.tipo_documento = 'dni'
    and new.numero_documento !~ '^[0-9]{8}$' then
    raise exception using errcode = '23514', message = 'El DNI debe contener ocho dígitos.';
  end if;

  if new.tipo_documento = 'ruc'
    and not private.ruc_valido(new.numero_documento) then
    raise exception using errcode = '23514', message = 'El RUC debe tener once dígitos válidos.';
  end if;

  return new;
end;
$$;

revoke all on function private.validar_documento_cliente() from public, anon, authenticated;

create trigger clientes_validar_documento
  before insert or update on public.clientes
  for each row execute function private.validar_documento_cliente();


-- -----------------------------------------------------------------------------
-- Migración: 20261009052644_asistente_resumen_catalogo.sql
-- -----------------------------------------------------------------------------

create or replace function public.asistente_resumen_catalogo()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with productos_visibles as (
    select
      p.id,
      p.usa_combinaciones,
      p.existencias,
      p.stock_minimo,
      exists (
        select 1
        from public.combinaciones c
        where c.producto_id = p.id
          and c.activa
          and c.existencias <= c.stock_minimo
      ) as combinacion_baja,
      exists (
        select 1
        from public.combinaciones c
        where c.producto_id = p.id
          and c.activa
          and c.existencias <= 0
      ) as combinacion_agotada
    from public.productos p
    where p.activo
  )
  select jsonb_build_object(
    'productos_activos', count(*),
    'productos_con_stock_bajo', count(*) filter (
      where (not p.usa_combinaciones and p.existencias <= p.stock_minimo)
        or (p.usa_combinaciones and p.combinacion_baja)
    ),
    'productos_agotados', count(*) filter (
      where (not p.usa_combinaciones and p.existencias <= 0)
        or (p.usa_combinaciones and p.combinacion_agotada)
    ),
    'combinaciones_activas', (
      select count(*)
      from public.combinaciones c
      join public.productos producto on producto.id = c.producto_id
      where producto.activo and c.activa
    ),
    'detalle_reposicion', coalesce((
      select jsonb_agg(to_jsonb(detalle))
      from (
        select
          p.nombre || case when c.id is null then '' else ' ' || coalesce((
            select string_agg(op.nombre || ' ' || vo.valor, ' ' order by op.posicion)
            from public.valores_opcion vo
            join public.opciones_producto op on op.id = vo.opcion_id
            where vo.id in (c.valor_opcion_1_id, c.valor_opcion_2_id)
          ), '') end as producto,
          coalesce(c.sku, p.sku) as sku,
          coalesce(c.existencias, p.existencias) as existencias,
          coalesce(c.stock_minimo, p.stock_minimo) as stock_minimo,
          p.unidad_medida
        from public.productos p
        left join public.combinaciones c
          on c.producto_id = p.id and c.activa
        where p.activo and (
          (not p.usa_combinaciones and p.existencias <= p.stock_minimo)
          or (p.usa_combinaciones and c.id is not null and c.existencias <= c.stock_minimo)
        )
        order by p.nombre, c.sku
        limit 20
      ) detalle
    ), '[]'::jsonb)
  )
  from productos_visibles p;
$$;

revoke all on function public.asistente_resumen_catalogo() from public, anon;
grant execute on function public.asistente_resumen_catalogo() to authenticated;


-- -----------------------------------------------------------------------------
-- Migración: 20261009205151_separar_monedas_en_reportes.sql
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- Migración: 20261010015509_asistente_consultas_modulos.sql
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- Migración: 20261010021034_exigir_cliente_y_vincular_borrador_asistente.sql
-- -----------------------------------------------------------------------------

-- Las ventas nuevas deben tener un cliente. La excepción permite conservar y
-- descartar borradores históricos que se crearon como venta de mostrador.
alter table public.ventas
  add constraint ventas_cliente_obligatorio
  check (cliente_id is not null or estado = 'descartada') not valid;

-- El vínculo permite mostrar y confirmar desde el mensaje del chat, y reconstruir
-- la tarjeta al volver a abrir la conversación.
alter table public.mensajes
  add column venta_id uuid references public.ventas (id) on delete set null;

alter table public.mensajes
  add constraint mensajes_venta_solo_asistente
  check (venta_id is null or rol = 'asistente') not valid;


-- -----------------------------------------------------------------------------
-- Migración: 20261010022710_emision_automatica_venta_confirmada.sql
-- -----------------------------------------------------------------------------

alter table public.ventas
  add column tipo_comprobante text
    check (tipo_comprobante is null or tipo_comprobante in ('factura', 'boleta'));

update public.ventas v
set tipo_comprobante = c.tipo
from public.comprobantes c
where c.venta_id = v.id
  and c.tipo in ('factura', 'boleta')
  and v.tipo_comprobante is null;

create or replace function public.confirmar_venta_con_comprobante(
  venta_objetivo uuid,
  tipo_comprobante_solicitado text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  venta_actual public.ventas%rowtype;
  empresa_actual public.empresa%rowtype;
  resultado jsonb;
begin
  if not (select private.tiene_rol(array['administrador', 'vendedor'])) then
    raise exception using errcode = '42501', message = 'La sesión no puede confirmar ventas.';
  end if;
  if tipo_comprobante_solicitado not in ('factura', 'boleta') then
    raise exception using errcode = '22023', message = 'Selecciona factura o boleta.';
  end if;
  select * into venta_actual from public.ventas v
  where v.id = venta_objetivo
    and ((select private.tiene_rol(array['administrador'])) or v.creado_por = (select auth.uid()))
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró la venta.';
  end if;
  if venta_actual.estado not in ('borrador', 'confirmada') then
    raise exception using errcode = '55000', message = 'La venta ya no está disponible para confirmar.';
  end if;
  if venta_actual.tipo_comprobante is not null
    and venta_actual.tipo_comprobante <> tipo_comprobante_solicitado then
    raise exception using errcode = '23505', message = 'La venta ya tiene asignado otro tipo de comprobante.';
  end if;
  if exists (
    select 1 from public.comprobantes c
    where c.venta_id = venta_objetivo and c.tipo <> tipo_comprobante_solicitado
  ) then
    raise exception using errcode = '23505', message = 'La venta ya tiene un comprobante de otro tipo.';
  end if;

  select * into strict empresa_actual from public.empresa limit 1;
  if empresa_actual.ruc is null or not private.ruc_valido(empresa_actual.ruc) then
    raise exception using errcode = '22023', message = 'Complete el RUC de la empresa antes de confirmar la venta.';
  end if;
  if not exists (
    select 1 from public.series_comprobante s
    where s.tipo = tipo_comprobante_solicitado and s.activa
  ) then
    raise exception using errcode = '22023', message = 'Configure una serie activa antes de confirmar la venta.';
  end if;
  if tipo_comprobante_solicitado = 'factura'
    and (venta_actual.cliente_tipo_documento <> 'ruc'
      or not private.ruc_valido(venta_actual.cliente_numero_documento)) then
    raise exception using errcode = '22023', message = 'La factura requiere un cliente identificado con RUC.';
  end if;
  if tipo_comprobante_solicitado = 'boleta' and venta_actual.total > 700
    and nullif(venta_actual.cliente_numero_documento, '') is null then
    raise exception using errcode = '22023', message = 'Las boletas mayores a S/ 700 requieren identificar al cliente.';
  end if;

  if venta_actual.estado = 'borrador' then
    select public.confirmar_venta(venta_objetivo) into resultado;
  else
    resultado := jsonb_build_object(
      'venta_id', venta_actual.id, 'estado', venta_actual.estado, 'total', venta_actual.total
    );
  end if;
  update public.ventas
  set tipo_comprobante = tipo_comprobante_solicitado, actualizado_en = now()
  where id = venta_objetivo;
  return resultado || jsonb_build_object('tipo_comprobante', tipo_comprobante_solicitado);
end;
$$;

revoke all on function public.confirmar_venta(uuid) from public, anon, authenticated;
revoke all on function public.confirmar_venta_con_comprobante(uuid, text) from public, anon;
grant execute on function public.confirmar_venta_con_comprobante(uuid, text) to authenticated;

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
    where p.id = administrador_objetivo and p.rol in ('administrador', 'vendedor') and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta administradora no está activa.';
  end if;
  if estado_resultado not in ('emitido', 'rechazado', 'error') then
    raise exception using errcode = '22023', message = 'Estado de emisión no válido.';
  end if;

  select c.tipo into tipo_comprobante from public.comprobantes c
  join public.ventas v on v.id = c.venta_id
  where c.id = comprobante_objetivo and c.estado = 'emitiendo'
    and (
      exists (select 1 from public.perfiles p where p.id = administrador_objetivo and p.rol = 'administrador' and p.activo)
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


revoke all on function public.reservar_comprobante(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reservar_comprobante(uuid, uuid, text) to service_role;
revoke all on function public.registrar_resultado_comprobante(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.registrar_resultado_comprobante(uuid, uuid, text, jsonb, text) to service_role;


-- -----------------------------------------------------------------------------
-- Migración: 20261010030000_tipo_comprobante_en_borrador.sql
-- -----------------------------------------------------------------------------

create or replace function public.crear_borrador_venta_con_comprobante(
  cliente_objetivo uuid,
  lineas jsonb,
  tipo_comprobante_solicitado text,
  venta_objetivo uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  venta_id uuid;
  venta_actual public.ventas%rowtype;
begin
  if tipo_comprobante_solicitado not in ('factura', 'boleta') then
    raise exception using errcode = '22023', message = 'Selecciona factura o boleta.';
  end if;

  venta_id := public.crear_borrador_venta(
    cliente_objetivo,
    lineas,
    venta_objetivo
  );

  select * into strict venta_actual
  from public.ventas v
  where v.id = venta_id
    and v.estado = 'borrador';

  if tipo_comprobante_solicitado = 'factura'
    and (
      venta_actual.cliente_tipo_documento <> 'ruc'
      or not private.ruc_valido(venta_actual.cliente_numero_documento)
    ) then
    raise exception using errcode = '22023', message = 'La factura requiere un cliente identificado con RUC válido.';
  end if;

  if tipo_comprobante_solicitado = 'boleta'
    and venta_actual.total > 700
    and nullif(venta_actual.cliente_numero_documento, '') is null then
    raise exception using errcode = '22023', message = 'Las boletas mayores a S/ 700 requieren identificar al cliente.';
  end if;

  update public.ventas
  set tipo_comprobante = tipo_comprobante_solicitado,
      actualizado_en = now()
  where id = venta_id;

  return venta_id;
end;
$$;

revoke all on function public.crear_borrador_venta_con_comprobante(uuid, jsonb, text, uuid)
  from public, anon;
grant execute on function public.crear_borrador_venta_con_comprobante(uuid, jsonb, text, uuid)
  to authenticated;


-- -----------------------------------------------------------------------------
-- Migración: 20261012143521_invitar_usuarios_con_rol.sql
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- Migración: 20261012145033_crear_usuarios_directamente.sql
-- -----------------------------------------------------------------------------

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


-- -----------------------------------------------------------------------------
-- Migración: 20261012150350_restringir_trigger_correo.sql
-- -----------------------------------------------------------------------------

revoke all on function private.sincronizar_correo_auth()
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Migración: 20261012151356_permitir_gestion_catalogo_vendedor.sql
-- -----------------------------------------------------------------------------

create policy productos_crear_vendedor
  on public.productos for insert to authenticated
  with check (
    (select private.tiene_rol(array['vendedor']))
    and creado_por = (select auth.uid())
  );

create policy productos_actualizar_vendedor
  on public.productos for update to authenticated
  using ((select private.tiene_rol(array['vendedor'])))
  with check ((select private.tiene_rol(array['vendedor'])));

-- Las combinaciones se crean por la RPC transaccional, no marcando una fila aislada.
revoke insert (usa_combinaciones) on public.productos from authenticated;
revoke update (usa_combinaciones) on public.productos from authenticated;

create or replace function public.crear_producto_con_combinaciones(
  sku_producto text,
  nombre_producto text,
  categoria_objetivo uuid,
  unidad text,
  precio_base numeric,
  minimo_stock numeric,
  opciones jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  producto_id uuid;
  opcion_id uuid;
  valores_opcion_1_ids uuid[] := array[]::uuid[];
  valores_opcion_2_ids uuid[] := array[]::uuid[];
  valores_actuales uuid[];
  valor_opcion_id uuid;
  combinacion_sku text;
  cantidad_opciones integer;
  valores jsonb;
  nombre_opcion text;
  numero_combinacion integer := 0;
begin
  if not (select private.tiene_rol(array['administrador', 'vendedor'])) then
    raise exception using errcode = '42501', message = 'La sesión no puede crear productos.';
  end if;
  if nullif(trim(sku_producto), '') is null
    or nullif(trim(nombre_producto), '') is null
    or nullif(trim(unidad), '') is null
    or precio_base is null or precio_base < 0
    or minimo_stock is null or minimo_stock < 0
    or jsonb_typeof(opciones) is distinct from 'array'
  then
    raise exception using errcode = '22023', message = 'Revisa los datos del producto y sus opciones.';
  end if;

  cantidad_opciones := jsonb_array_length(opciones);
  if cantidad_opciones not between 1 and 2 then
    raise exception using errcode = '22023', message = 'Un producto requiere una o dos opciones.';
  end if;
  if categoria_objetivo is not null and not exists (
    select 1 from public.categorias where id = categoria_objetivo and activa
  ) then
    raise exception using errcode = '22023', message = 'La categoría no existe o está inactiva.';
  end if;

  for indice_opcion in 1..cantidad_opciones loop
    nombre_opcion := nullif(trim(opciones -> (indice_opcion - 1) ->> 'nombre'), '');
    valores := opciones -> (indice_opcion - 1) -> 'valores';
    if nombre_opcion is null or jsonb_typeof(valores) is distinct from 'array'
      or jsonb_array_length(valores) not between 1 and 20
    then
      raise exception using errcode = '22023', message = 'Cada opción necesita un nombre y entre uno y veinte valores.';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(valores) as elemento(valor)
      where nullif(trim(elemento.valor), '') is null
    ) or (select count(distinct lower(trim(elemento.valor))) from jsonb_array_elements_text(valores) as elemento(valor)) <> jsonb_array_length(valores) then
      raise exception using errcode = '22023', message = 'Los valores de una opción deben estar completos y no repetirse.';
    end if;
  end loop;

  if cantidad_opciones = 2 and lower(trim(opciones -> 0 ->> 'nombre')) = lower(trim(opciones -> 1 ->> 'nombre')) then
    raise exception using errcode = '22023', message = 'Las opciones deben tener nombres distintos.';
  end if;

  insert into public.productos (categoria_id, sku, nombre, unidad_medida, usa_combinaciones, precio, stock_minimo, creado_por)
  values (categoria_objetivo, trim(sku_producto), trim(nombre_producto), upper(trim(unidad)), true, null, minimo_stock, (select auth.uid()))
  returning id into producto_id;

  for indice_opcion in 1..cantidad_opciones loop
    nombre_opcion := trim(opciones -> (indice_opcion - 1) ->> 'nombre');
    valores := opciones -> (indice_opcion - 1) -> 'valores';
    insert into public.opciones_producto (producto_id, nombre, posicion)
    values (producto_id, nombre_opcion, indice_opcion)
    returning id into opcion_id;
    valores_actuales := array[]::uuid[];
    for indice_valor in 0..jsonb_array_length(valores) - 1 loop
      insert into public.valores_opcion (producto_id, opcion_id, valor)
      values (producto_id, opcion_id, trim(valores ->> indice_valor))
      returning id into valor_opcion_id;
      valores_actuales := array_append(valores_actuales, valor_opcion_id);
    end loop;
    if indice_opcion = 1 then
      valores_opcion_1_ids := valores_actuales;
    else
      valores_opcion_2_ids := valores_actuales;
    end if;
  end loop;

  if cantidad_opciones = 1 then
    for indice_valor in 1..coalesce(array_length(valores_opcion_1_ids, 1), 0) loop
      numero_combinacion := numero_combinacion + 1;
      combinacion_sku := trim(sku_producto) || '-' || lpad(indice_valor::text, 2, '0');
      insert into public.combinaciones (producto_id, valor_opcion_1_id, sku, precio, stock_minimo)
      values (producto_id, valores_opcion_1_ids[indice_valor], combinacion_sku, precio_base, minimo_stock);
    end loop;
  else
    for indice_valor in 1..coalesce(array_length(valores_opcion_1_ids, 1), 0) loop
      for indice_segundo in 1..coalesce(array_length(valores_opcion_2_ids, 1), 0) loop
        numero_combinacion := numero_combinacion + 1;
        combinacion_sku := trim(sku_producto) || '-' || lpad(numero_combinacion::text, 2, '0');
        insert into public.combinaciones (producto_id, valor_opcion_1_id, valor_opcion_2_id, sku, precio, stock_minimo)
        values (producto_id, valores_opcion_1_ids[indice_valor], valores_opcion_2_ids[indice_segundo], combinacion_sku, precio_base, minimo_stock);
      end loop;
    end loop;
  end if;
  return producto_id;
end;
$$;

revoke all on function public.crear_producto_con_combinaciones(text, text, uuid, text, numeric, numeric, jsonb) from public, anon;
grant execute on function public.crear_producto_con_combinaciones(text, text, uuid, text, numeric, numeric, jsonb) to authenticated;
