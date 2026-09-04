(() => {
  function businessUrl(businessId) {
    const url = new URL("catalogo-dinamico.html", window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("negocio", businessId);
    return url.href;
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("No se pudo copiar el enlace.");
  }

  async function shareBusiness(business) {
    const url = businessUrl(business.id);
    const cityLabels = { "la-dorada": "La Dorada", "puerto-salgar": "Puerto Salgar" };
    const city = cityLabels[business.city] || business.city || "nuestra región";
    const data = {
      title: `${business.name} | Local 💚`,
      text: `Mira ${business.name} en Local 💚. Descubre este emprendimiento de ${city}.`,
      url
    };

    if (navigator.share) {
      try {
        await navigator.share(data);
        return { shared: true, copied: false };
      } catch (error) {
        if (error?.name === "AbortError") return { shared: false, copied: false, cancelled: true };
      }
    }

    await copyText(url);
    return { shared: false, copied: true };
  }

  window.LocalShareBusiness = { businessUrl, shareBusiness };
})();
