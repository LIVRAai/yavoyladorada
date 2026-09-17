(() => {
  const ownerApp = document.getElementById("ownerApp");
  const publicLink = document.getElementById("publicLink");
  if (!ownerApp || !publicLink) return;

  let mounted = false;
  let qrInstance = null;

  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    return Promise.resolve();
  }

  function loadQrLibrary() {
    if (window.QRCode) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-local2-qr="1"]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      script.async = true;
      script.dataset.local2Qr = "1";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function buildMessage(url, businessName) {
    return `Hola 👋 En ${businessName} puedes consultar nuestros productos, hacer pedidos y revisar el estado de tu compra con nuestro asistente aquí: ${url}`;
  }

  async function mount() {
    if (mounted || ownerApp.hidden) return;
    const businessName = document.getElementById("businessName")?.textContent?.trim() || "nuestro negocio";
    const url = publicLink.href;
    if (!url || url.endsWith("local2-beta.html")) return;
    mounted = true;

    const card = document.createElement("section");
    card.className = "card local2-share-kit";
    card.innerHTML = `
      <div class="section-head">
        <div><span class="eyebrow">Comparte tu atención digital</span><h2>Tu enlace de atención</h2></div>
      </div>
      <p class="section-copy">Pon este enlace en tu WhatsApp Business, bio de Instagram, historias, empaques o tarjetas. Tus clientes entran directamente a tu asistente.</p>
      <div class="local2-share-url"></div>
      <div class="item-actions local2-share-actions">
        <button class="button primary" type="button" data-share-action="share">Compartir</button>
        <button class="button ghost" type="button" data-share-action="whatsapp">WhatsApp</button>
        <button class="button ghost" type="button" data-share-action="copy">Copiar enlace</button>
        <button class="button ghost" type="button" data-share-action="qr">Mostrar QR</button>
      </div>
      <div class="local2-share-note notice"></div>
      <div class="local2-qr" hidden></div>
    `;

    const firstGrid = ownerApp.querySelector(".owner-grid");
    ownerApp.insertBefore(card, firstGrid || null);

    const urlEl = card.querySelector(".local2-share-url");
    urlEl.textContent = url;
    urlEl.style.wordBreak = "break-all";
    urlEl.style.padding = "12px";
    urlEl.style.border = "1px solid #dce6df";
    urlEl.style.borderRadius = "12px";
    urlEl.style.background = "#f8fbf9";
    urlEl.style.margin = "12px 0";

    const note = card.querySelector(".local2-share-note");
    const qrBox = card.querySelector(".local2-qr");
    qrBox.style.marginTop = "16px";
    qrBox.style.padding = "16px";
    qrBox.style.background = "white";
    qrBox.style.border = "1px solid #dce6df";
    qrBox.style.borderRadius = "16px";
    qrBox.style.width = "fit-content";

    card.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-share-action]");
      if (!button) return;
      const action = button.dataset.shareAction;
      const message = buildMessage(url, businessName);
      try {
        if (action === "share") {
          if (navigator.share) {
            await navigator.share({ title: businessName, text: `Habla con nuestro asistente de ${businessName}`, url });
            note.textContent = "Listo. Puedes elegir WhatsApp, Instagram u otra app disponible en tu celular.";
          } else {
            await copyText(message);
            note.textContent = "Tu navegador no ofrece el menú Compartir. Copiamos el mensaje para que lo pegues donde quieras.";
          }
        }
        if (action === "whatsapp") {
          window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
          note.textContent = "Abrimos WhatsApp con un mensaje listo para compartir.";
        }
        if (action === "copy") {
          await copyText(url);
          note.textContent = "Enlace copiado ✓";
        }
        if (action === "qr") {
          await loadQrLibrary();
          qrBox.hidden = false;
          qrBox.innerHTML = "";
          qrInstance = new window.QRCode(qrBox, { text: url, width: 190, height: 190, correctLevel: window.QRCode.CorrectLevel.M });
          note.textContent = "QR generado. Puedes mostrarlo desde el celular o usarlo como referencia para tus piezas impresas.";
        }
      } catch (error) {
        console.warn("Local2 share kit", error);
        note.textContent = "No pudimos completar esa acción. Puedes copiar el enlace manualmente.";
      }
    });
  }

  const observer = new MutationObserver(mount);
  observer.observe(ownerApp, { attributes: true, attributeFilter: ["hidden"] });
  window.setTimeout(mount, 600);
})();
