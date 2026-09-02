# Local 💚

Local 💚 es una comunidad de emprendimientos de La Dorada, Puerto Salgar y la región. Su propósito es **visibilizar, apoyar, conectar y profesionalizar** proyectos locales.

El producto combina una experiencia pública para descubrir emprendimientos con un espacio privado donde cada miembro administra su perfil y su membresía.

## Experiencia principal

### Persona que descubre

```text
Inicio → Explorar comunidad → Ver perfil → Contactar / apoyar
```

### Emprendimiento

```text
Inicio → Quiero ser parte → Crear cuenta → Crear perfil → Activar membresía → Mi espacio → Publicado
```

## Páginas principales

- `index.html`: propuesta de valor y concepto de comunidad.
- `catalogo.html`: entrada a la experiencia de exploración.
- `catalogo-dinamico.html`: comunidad pública conectada a Supabase.
- `registro.html`: creación de cuenta.
- `login.html`: acceso a Mi espacio.
- `negocio.html`: creación inicial del perfil del emprendimiento.
- `mi-negocio.html`: administración del perfil, membresía y estado de publicación.
- `retorno-pago.html`: verificación de activación después de Mercado Pago.

Los nombres técnicos históricos (`businesses`, `business_subscriptions`, `business_id`, etc.) se conservan para evitar migraciones innecesarias. En la experiencia de usuario se habla de **emprendimientos, perfiles, comunidad y membresía**.

## Membresía

Valor actual: **$29.900 COP / mes**.

La Edge Function `create-subscription` crea o reutiliza una membresía mediante Mercado Pago y utiliza el concepto:

```text
Local 💚 - Membresía mensual
```

Flujo técnico:

```text
Cuenta → Perfil → Mercado Pago → Webhook → active → Publicado en Local
```

## Estados

Estados técnicos de `businesses`:

- `draft`: perfil creado, todavía no publicado.
- `pending_payment`: activación pendiente.
- `active`: perfil publicado.
- `suspended`: publicación pausada.

Estados técnicos de `business_subscriptions`:

- `pending`
- `authorized`
- `paused`
- `cancelled`

## Perfil de emprendimiento

Se utilizan los campos existentes:

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

La foto de portada se selecciona desde el dispositivo y se optimiza antes de guardarse en `image_url` para el MVP.

## Seguridad

El frontend utiliza únicamente la URL y la Publishable Key de Supabase.

Nunca deben publicarse:

- `SUPABASE_SERVICE_ROLE_KEY`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`

RLS debe mantener que:

- el público solo pueda leer perfiles `active`;
- cada usuario autenticado pueda crear, consultar y editar sus propios perfiles;
- cada propietario pueda consultar la membresía asociada a su perfil.

## Infraestructura

El dominio técnico actual se mantiene temporalmente en:

```text
https://yavoyladorada.vercel.app/
```

Esto evita romper callbacks y configuración existente mientras se define el dominio definitivo de Local 💚.
