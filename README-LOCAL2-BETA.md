# Local 2.0 Beta

Local 2.0 se desarrolla en `feature/local-2-beta` sin reemplazar `main` ni la experiencia actual en producción.

## Objetivo del piloto

Validar el flujo completo de un pequeño emprendimiento con GAIA BY PAULA RIVERA como caso piloto:

1. El cliente entra por el enlace público del negocio.
2. Habla con el Empleado Digital.
3. Se identifica con nombre + celular o correo.
4. Crea un pedido con productos y precios reales/simulados de la beta.
5. Consulta medios de pago.
6. Reporta que ya pagó.
7. El negocio confirma el pago.
8. El pedido pasa por preparación, listo y entregado.
9. El cliente vuelve al mismo asistente y consulta el estado.
10. Si cambia de navegador o dispositivo, puede recuperar su pedido con código + celular/correo.
11. El propietario puede compartir el enlace por el menú nativo del celular, WhatsApp, copiarlo o generar un QR.

## Componentes beta

- `local2-beta.html`: experiencia pública del cliente.
- `mi-negocio-v2.html`: panel autenticado del propietario.
- `local2-demo-console.html`: consola pública de simulación, limitada a registros `DEMO LOCAL2`.
- `local2-public-api`: sesiones, conversaciones, pedidos, pagos reportados y seguimiento.
- `local2-recovery-api`: recuperación de pedido entre dispositivos.
- `local2-demo-api`: operación de los datos simulados para validación punta a punta.
- `local2-health`: health check de la beta y señal de configuración de IA.
- `/api/local2-ai-status`: verificación server-side de configuración de IA en Supabase/Vercel sin exponer secretos.
- `local2-owner-insights.js`: muestra estado del motor y cantidad de respuestas generadas con IA.
- `local2-share-kit.js`: kit para compartir el enlace del asistente y generar QR.

## Datos simulados de GAIA

La simulación incluye 8 productos con precios, 3 medios de pago ficticios, 5 clientes y 5 pedidos distribuidos entre distintos estados. Los registros demo están identificados con `DEMO LOCAL2` y dominios `@local-demo.invalid` para facilitar su limpieza.

Los medios de pago demo son ficticios y no deben usarse para transferencias reales.

## IA

La integración usa OpenAI Responses API con `gpt-5.6-luna` y cuenta con un modo guiado de respaldo. La verificación del 2026-09-16 confirmó que `OPENAI_API_KEY` todavía no está configurada ni en Supabase ni en Vercel para esta beta, por lo que las conversaciones siguen usando el respaldo guiado hasta agregar el secreto.

## Seguridad

- La beta usa tablas nuevas `local2_*`.
- `main`, la membresía actual y Mercado Pago actual no se modifican.
- El cliente accede a sus pedidos mediante una sesión privada aleatoria.
- La recuperación entre dispositivos requiere código de pedido + coincidencia de celular o correo.
- Confirmar pagos reales seguirá siendo una acción del propietario autenticado o de una integración de pago verificada.
- La consola demo únicamente puede mutar pedidos marcados como `DEMO LOCAL2`.
- Los diagnósticos de IA solo exponen booleanos de configuración, nunca claves.

## Pendientes antes de producción

- Configurar `OPENAI_API_KEY` como secreto de servidor y comprobar respuesta IA real.
- Sustituir medios de pago ficticios por la configuración real del primer piloto.
- Validar el piloto con usuarios reales.
- Medir costo por conversación y tasa de finalización de pedidos.
- Implementar OTP o mecanismo equivalente para recuperación de cuenta/pedido en producción.
- Separar definitivamente el perfil gratuito de Local de la suscripción del Empleado Digital.
- Aplicar la activación del asistente según estado de la suscripción antes del lanzamiento comercial.
