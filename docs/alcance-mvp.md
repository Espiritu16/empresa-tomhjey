# Alcance del MVP de Empresa Tomhjey

## Propósito

Aplicación para que una empresa gestione productos, existencias, ventas y facturación
electrónica con asistencia de IA. El producto no administra otras empresas como un SaaS.

## Módulos

1. **Inicio:** actividad reciente y alertas simples de existencias.
2. **Empresa y configuración:** datos comerciales y fiscales requeridos para operar y emitir.
3. **Usuarios y roles:** acceso del equipo con administrador y vendedor.
4. **Productos y catálogo:** productos, tallas o colores, precios y unidades.
5. **Inventario:** existencias y movimientos con motivo, fecha y usuario.
6. **Clientes:** datos esenciales e historial de ventas.
7. **Ventas:** registrar y consultar ventas; el servidor valida y calcula los importes.
8. **Facturación electrónica:** emisión y seguimiento de comprobantes mediante NubeFacT.
9. **Asistente con IA:** consultas del negocio y preparación de acciones; la persona confirma
   antes de guardar cambios.
10. **Reportes básicos:** ventas por periodo, productos vendidos y existencias.

## Roles

| Capacidad                               | Administrador | Vendedor      |
| --------------------------------------- | ------------- | ------------- |
| Gestionar equipo y configuración fiscal | Sí            | No            |
| Crear y editar productos                | Sí            | Consultar     |
| Consultar existencias                   | Sí            | Sí            |
| Ajustar existencias                     | Sí            | No            |
| Registrar ventas                        | Sí            | Sí            |
| Consultar reportes generales            | Sí            | Según permiso |
| Usar el asistente con IA                | Sí            | Sí            |

La autorización se aplica en servidor y base de datos. La interfaz no es una barrera de
seguridad. El detalle de qué ventas puede consultar el vendedor se debe confirmar con la
empresa antes de implementar esa consulta.

## Facturación del MVP

- Administración configura una serie F para facturas y una B para boletas; el correlativo no
  puede retroceder.
- Facturas requieren RUC válido de la empresa y del cliente. Las boletas siguen la validación
  fiscal de identificación del cliente aplicada en el backend.
- La emisión exitosa de una factura muestra la aceptación que devuelve NubeFacT. La boleta se
  muestra como pendiente y permite consultar su aceptación manualmente desde el séptimo día,
  con consultas separadas por al menos 24 horas mientras siga pendiente.
- No hay consulta automática ni cron. Notas de crédito y anulaciones fiscales quedan fuera del
  MVP actual.

## Límites

- Una empresa y una operación compartida por su equipo; sin alta SaaS ni administración de
  múltiples empresas.
- Dos roles sencillos; sin permisos configurables por pantalla.
- Sin sucursales, locales o stock separado por sede.
- NubeFacT es la integración de facturación prevista. No se incluye selector de proveedor ni
  modo manual alternativo.
- La IA respeta los permisos del usuario. No confirma operaciones ni evita las validaciones
  del servidor.
- Sin compras a proveedores, predicción de demanda, tienda en línea, catálogo público,
  analítica avanzada, planes o suscripciones.

## Decisiones pendientes

- Flujos fiscales de anulaciones y notas de crédito.
- Visibilidad de ventas para el rol vendedor.
- Proveedor/modelo de IA y límites de uso.
- Credenciales y entorno de pruebas de NubeFacT para la empresa.
