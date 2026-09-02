(() => {
  const PREFIX = "LOCAL_PROFILE_V1:";

  function toBase64Url(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function fromBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function cleanList(list) {
    return [...new Set((Array.isArray(list) ? list : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean))]
      .slice(0, 8);
  }

  function parse(raw) {
    const fallback = {
      summary: String(raw || "").trim(),
      offerings: [],
      modes: [],
      localStory: ""
    };

    if (!raw || !String(raw).startsWith(PREFIX)) return fallback;

    try {
      const decoded = JSON.parse(fromBase64Url(String(raw).slice(PREFIX.length)));
      return {
        summary: String(decoded.summary || "").trim(),
        offerings: cleanList(decoded.offerings),
        modes: cleanList(decoded.modes),
        localStory: String(decoded.localStory || "").trim()
      };
    } catch (error) {
      console.warn("No se pudo leer el perfil enriquecido de Local", error);
      return fallback;
    }
  }

  function serialize({ summary, offerings, modes, localStory }) {
    const payload = {
      summary: String(summary || "").trim().slice(0, 420),
      offerings: cleanList(offerings),
      modes: cleanList(modes),
      localStory: String(localStory || "").trim().slice(0, 280)
    };
    return `${PREFIX}${toBase64Url(JSON.stringify(payload))}`;
  }

  function offeringsFromText(value) {
    return cleanList(String(value || "").split(","));
  }

  window.LocalProfileData = { parse, serialize, offeringsFromText };
})();
