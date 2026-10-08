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
