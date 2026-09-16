-- Local 2.0 Beta — configuración simulada de GAIA
-- Datos reales del negocio no se modifican aquí.
-- Este seed documenta la prueba aplicada el 2026-09-16 sobre tablas local2_*.
--
-- Configuración:
-- • Empleado Digital habilitado en modo productos.
-- • 8 productos demo con precios y stock.
-- • 3 medios de pago ficticios (Nequi, Bre-B y DaviPlata).
-- • 5 clientes demo.
-- • 5 pedidos demo distribuidos entre: esperando pago, pago reportado,
--   en preparación, listo y entregado.
--
-- Identificadores para limpiar datos de prueba:
-- customers.email LIKE '%@local-demo.invalid'
-- orders.notes LIKE '[DEMO LOCAL2]%'
-- payment_methods.instructions LIKE '[DEMO LOCAL2]%'
--
-- IMPORTANTE: los medios de pago son ficticios. No realizar transferencias reales.

select 'local2_beta_gaia_demo_seed' as seed_name;
