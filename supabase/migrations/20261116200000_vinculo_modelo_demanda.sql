-- Vínculo de cada producto del MVP con el catálogo del modelo de demanda (APF3).
-- Permite que la Edge Function prediccion-demanda tome solas las ventas, el stock
-- y el precio del producto. Cambio solo aditivo: columnas opcionales y nulas.
alter table public.productos
  add column modelo_producto text
    constraint productos_modelo_producto_formato
      check (modelo_producto ~ '^[A-Z][0-9]{2}$'),
  add column modelo_talla text
    constraint productos_modelo_talla_formato
      check (modelo_talla ~ '^[0-9A-Z]{1,4}$'),
  add constraint productos_modelo_completo
    check ((modelo_producto is null) = (modelo_talla is null));

comment on column public.productos.modelo_producto is
  'Código del producto en el catálogo del modelo de demanda (P01–S08).';
comment on column public.productos.modelo_talla is
  'Talla del catálogo del modelo que corresponde a este producto.';

-- Una talla del catálogo del modelo solo puede representarla un producto del MVP.
create unique index productos_modelo_unico
  on public.productos (modelo_producto, modelo_talla)
  where modelo_producto is not null;

grant insert (modelo_producto, modelo_talla), update (modelo_producto, modelo_talla)
  on public.productos to authenticated;
