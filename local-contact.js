/* Local contact links — one shared, conservative normalization path.
   Colombia mobile numbers are 10 digits, beginning with 3. A full international
   number is used as supplied; never guess country codes for other local formats. */
(() => {
  "use strict";
  function phoneDigits(value) {
    let digits = String(value ?? "").replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.length === 10 && /^3\d{9}$/.test(digits)) digits = "57" + digits;
    if (!/^\d{11,15}$/.test(digits)) return "";
    if (digits.startsWith("57") && !/^573\d{9}$/.test(digits)) return "";
    return digits;
  }
  function whatsappUrl(value, businessName) {
    const digits = phoneDigits(value);
    if (!digits) return "";
    const message = encodeURIComponent("Hola, vi " + String(businessName || "tu emprendimiento") + " en Local 💚 y quiero más información.");
    return "https://wa.me/" + digits + "?text=" + message;
  }
  function businessWhatsappUrl(business) {
    if (!business) return "";
    const name = business.name || "tu emprendimiento";
    return whatsappUrl(business.whatsapp, name) || whatsappUrl(business.phone, name);
  }
  window.LocalContact = Object.freeze({ phoneDigits, whatsappUrl, businessWhatsappUrl });
})();