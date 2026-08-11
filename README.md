# YaVoy — MVP V1

Primera versión funcional de **YaVoy**, pensada como una combinación de:

1. **Catálogo local** de negocios, productos y servicios.
2. **Central de domicilios y mandados** para La Dorada y Puerto Salgar.


## Identidad visual

Paleta principal de YaVoy:

- Azul cobalto: `#3157D5`
- Azul noche: `#18233D`
- Menta: `#66D6B8`
- Fondo: `#F5F7FB`
- Blanco: `#FFFFFF`
- Texto: `#20242C`

La interfaz evita el naranja como color de marca para diferenciar visualmente YaVoy de otras plataformas de domicilios.

## Propuesta de valor

YaVoy no funciona solamente como mensajería. El catálogo permite descubrir negocios locales y, desde cada ficha, convertir ese descubrimiento en una solicitud de recogida y entrega.

## Flujo del MVP

- El usuario busca en el catálogo.
- Puede hablar directamente con el negocio o tocar **Pedir con YaVoy**.
- YaVoy precarga el negocio como origen del servicio.
- El usuario agrega destino y detalle.
- La web calcula una **tarifa de referencia**.
- El pedido se envía a la central por WhatsApp.
- La central confirma disponibilidad y valor final antes de iniciar.

## Configuración obligatoria

En `script.js`, cambia:

```js
const YAVOY_WHATSAPP = "573000000000";
```

por el número real de la central.

## Tarifas provisionales

También en `script.js`:

```js
const RATES = {
  sameCity: 6000,
  crossCity: 8000,
  compraExtra: 2000,
  mandadoExtra: 2000
};
```

Estos valores son únicamente una configuración inicial del MVP y pueden modificarse sin tocar el resto de la página.

## Agregar negocios

Cada negocio es un `<article class="business-card">` dentro de `index.html`.

Datos principales:

- `data-category`
- `data-city`: `la-dorada` o `puerto-salgar`
- `data-city-label`
- `data-search`
- `data-name`
- `data-description`
- `data-location`
- `data-hours`
- `data-whatsapp`
- `data-instagram`
- `data-reel`

El botón **Pedir con YaVoy** funciona automáticamente al copiar la estructura de una tarjeta existente.

## Alcance deliberadamente fuera de V1

Todavía no incluye:

- Geolocalización o cálculo real por kilómetros.
- Pagos en línea.
- Registro de usuarios.
- Base de datos de pedidos.
- Asignación automática de domiciliarios.
- Seguimiento en tiempo real.
- Panel administrativo.

La intención es validar primero catálogo + demanda + operación por WhatsApp.

## Archivos

- `index.html`
- `styles.css`
- `script.js`
- `README.md`

Se puede publicar como sitio estático en Vercel, Netlify, GitHub Pages o un hosting tradicional.

## Optimización móvil

Esta versión incluye ajustes específicos para celular:
- barra inferior fija con accesos a Catálogo y Pedir un YaVoy;
- categorías y filtros en carrusel horizontal;
- tarjetas de negocio compactas con prioridad para “Pedir con YaVoy”;
- campos de formulario a 16 px para evitar zoom automático en iPhone;
- controles táctiles de al menos 42–48 px;
- formulario y perfil adaptados a una sola columna;
- soporte de `safe-area` para iPhone;
- tipografía, espaciado y hero reducidos para pantallas pequeñas;
- perfil de negocio presentado como panel inferior en móvil.
