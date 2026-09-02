(function () {
  const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
  const MAX_WIDTH = 1200;
  const MAX_HEIGHT = 800;
  const MAX_DATA_URL_LENGTH = 480000;

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("No pudimos leer la imagen seleccionada."));
      };
      image.src = url;
    });
  }

  function fitSize(width, height, maxWidth, maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio))
    };
  }

  function renderToDataUrl(image, width, height, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/webp", quality);
  }

  async function compressFile(file) {
    if (!(file instanceof File)) {
      throw new Error("Selecciona una imagen válida.");
    }
    if (!ACCEPTED_TYPES.has(file.type)) {
      throw new Error("Usa una imagen JPG, PNG o WEBP.");
    }
    if (file.size > MAX_SOURCE_BYTES) {
      throw new Error("La imagen es demasiado pesada. El máximo es 10 MB.");
    }

    const image = await loadImage(file);
    let size = fitSize(image.naturalWidth, image.naturalHeight, MAX_WIDTH, MAX_HEIGHT);
    let quality = 0.8;
    let result = renderToDataUrl(image, size.width, size.height, quality);

    while (result.length > MAX_DATA_URL_LENGTH && (quality > 0.52 || size.width > 720)) {
      if (quality > 0.52) {
        quality -= 0.08;
      } else {
        size = fitSize(size.width, size.height, Math.round(size.width * 0.82), Math.round(size.height * 0.82));
      }
      result = renderToDataUrl(image, size.width, size.height, quality);
    }

    if (result.length > MAX_DATA_URL_LENGTH) {
      throw new Error("No pudimos reducir suficientemente esta imagen. Prueba con una foto más pequeña.");
    }

    return result;
  }

  function isSafeImageSource(value) {
    if (!value || typeof value !== "string") return "";
    if (/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value;
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  window.YaVoyCoverImage = {
    compressFile,
    isSafeImageSource
  };
})();
