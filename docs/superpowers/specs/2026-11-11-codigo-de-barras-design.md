# Código de barras en productos y ventas

## Intención

El equipo necesita registrar, buscar y vender productos por código de barras. Para la
presentación se usa la cámara del celular, porque es más accesible que una pistola
lectora; la pistola debe funcionar igual sin trabajo adicional.

## Alcance

- `productos.codigo_barras`: opcional, único entre productos y con formato
  alfanumérico de 4 a 64 caracteres (se admiten `-` y `.`). La unicidad la aplica
  Postgres con un índice único parcial; la interfaz traduce el error a un mensaje claro.
- Migración solo aditiva: columna nueva nula, índice y grants de columna. No modifica
  ni borra filas existentes.
- Lector con cámara compartido (`src/compartido/componentes/lector-codigo.tsx`):
  usa `BarcodeDetector` del navegador y, si no existe (Safari/iOS), el polyfill
  `barcode-detector` (ZXing en WebAssembly). Formatos: EAN-13, EAN-8, UPC-A, UPC-E,
  Code 128 y Code 39. Cámara trasera, cierre al primer código leído y vibración.
- Productos: campo «Código de barras» con botón de cámara en el formulario; el
  buscador encuentra por código y tiene botón de cámara.
- Inventario: el buscador encuentra por código y tiene botón de cámara.
- Ventas: el buscador de producto acepta código + Enter (pistola) o cámara. Un código
  exacto agrega una unidad del producto; si ya está en la venta, aumenta su cantidad.
  Si el producto usa combinaciones, se filtra la lista para elegir la variante.

## Fuera de alcance

- Códigos de barras por combinación (la interfaz actual no administra combinaciones).
- Generar o imprimir etiquetas.
- Asistente IA (oculto).

## Restricciones

- La cámara solo funciona en contexto seguro (`https` o `localhost`).
- La autorización sigue en RLS; el código de barras no cambia permisos.

## Verificación

- pgTAP: unicidad, formato y edición por vendedor.
- Playwright: en Ventas, escribir un código y presionar Enter agrega el producto.
- La lectura con cámara se valida manualmente en el celular.
