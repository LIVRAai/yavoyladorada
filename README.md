# YaVoy La Dorada

YaVoy es un catálogo local para La Dorada y Puerto Salgar con un flujo de autoregistro para negocios y suscripción mensual mediante Mercado Pago.

## Flujo de negocios

1. El comercio crea una cuenta en `registro.html` usando Supabase Auth.
2. Inicia sesión y registra su negocio en `negocio.html`.
3. El negocio se guarda inicialmente con estado `draft`.
4. La página invoca la Edge Function `create-subscription` con el `business_id` recién creado.
5. Mercado Pago crea una suscripción mensual de **$29.900 COP** y devuelve el checkout.
6. El negocio pasa a `pending_payment`.
7. El webhook `mercadopago-webhook` procesa los eventos de Mercado Pago.
8. Cuando se confirma un pago aprobado, el negocio pasa a `active`.
9. El catálogo público solo consulta negocios con `status = active`.

Resultado esperado:

```text
Cuenta → Negocio → Mercado Pago → Webhook → active → Catálogo público
```

## Páginas principales

- `index.html`: página de presentación.
- `registro.html`: creación de cuenta de comercio.
- `login.html`: autenticación.
- `negocio.html`: alta inicial del negocio y entrada al checkout.
- `mi-negocio.html`: panel del comercio para editar perfil, revisar estado y continuar/reactivar pagos.
- `retorno-pago.html`: pantalla de verificación después de Mercado Pago.
- `catalogo-dinamico.html`: catálogo conectado a Supabase.
- `catalogo.html`: versión histórica del catálogo; en Vercel se reescribe hacia `catalogo-dinamico.html`.

## Datos del perfil comercial

El flujo utiliza los campos existentes de `businesses`:

- `owner_id`
- `name`
- `category`
- `city`
- `description`
- `location`
- `hours`
- `instagram`
- `image_url`
- `reel_url`
- `phone`
- `whatsapp`
- `status`

Estados del negocio:

- `draft`
- `pending_payment`
- `active`
- `suspended`

## Suscripciones

Tabla: `business_subscriptions`.

Datos principales:

- `business_id`
- `provider`
- `mp_preapproval_id`
- `mp_plan_id`
- `status`
- `amount_cop`
- `last_payment_date`
- `next_payment_date`

Estados de suscripción usados por la aplicación:

- `pending`
- `authorized`
- `paused`
- `cancelled`

## Supabase y seguridad

El cliente web utiliza únicamente la URL y la Publishable Key de Supabase desde `supabase-client.js`.

Nunca se deben publicar en el frontend:

- `SUPABASE_SERVICE_ROLE_KEY`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`

Esos valores deben permanecer como secretos de las Edge Functions.

RLS debe mantener estas reglas:

- el público puede leer únicamente negocios `active`;
- cada usuario autenticado puede crear, consultar y editar únicamente sus propios negocios;
- cada propietario puede consultar la suscripción asociada a sus negocios.

## Edge Functions

### `create-subscription`

- exige usuario autenticado;
- comprueba que el negocio pertenece al usuario;
- crea o reutiliza la suscripción de Mercado Pago;
- utiliza $29.900 COP / mes;
- cambia el negocio a `pending_payment`;
- devuelve `init_point` para abrir el checkout.

### `mercadopago-webhook`

- valida la firma del webhook;
- consulta la fuente real en Mercado Pago;
- actualiza `business_subscriptions`;
- registra fechas de pago;
- cambia el negocio a `active` cuando existe un pago aprobado;
- suspende el negocio cuando corresponde.

## Retorno de Mercado Pago

La versión del repositorio usa:

```text
https://yavoyladorada.vercel.app/retorno-pago.html
```

Por compatibilidad con una versión anterior ya desplegada, `home.js` también detecta:

```text
/?subscription=return
```

y redirige al usuario a `retorno-pago.html`.

## Vercel

`vercel.json` reescribe:

```text
/catalogo.html → /catalogo-dinamico.html
/catalogo      → /catalogo-dinamico.html
```

Esto permite conservar los enlaces existentes mientras el catálogo público pasa a ser dinámico.

## Configuración de cliente

`supabase-client.js` contiene exclusivamente valores públicos del cliente Supabase.

No agregar secretos al repositorio.
