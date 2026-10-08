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
