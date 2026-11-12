-- Código de barras opcional para buscar y vender productos con cámara o lector.
-- Cambio solo aditivo: no modifica ni elimina filas existentes.
alter table public.productos
  add column codigo_barras text
    constraint productos_codigo_barras_formato
      check (codigo_barras ~ '^[0-9A-Za-z.-]{4,64}$');

comment on column public.productos.codigo_barras is
  'Código de barras del producto (EAN, UPC, Code 128...). Único cuando existe.';

create unique index productos_codigo_barras_unico
  on public.productos (codigo_barras)
  where codigo_barras is not null;

grant insert (codigo_barras), update (codigo_barras)
  on public.productos to authenticated;
