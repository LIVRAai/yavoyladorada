(() => {
  const db = window.yavoyDb;
  const form = document.getElementById("catalogCreateForm");
  const grid = document.getElementById("catalogOwnerGrid");
  const empty = document.getElementById("catalogOwnerEmpty");
  const notice = document.getElementById("catalogNotice");
  const imageInput = document.getElementById("catalogNewImage");
  const preview = document.getElementById("catalogNewPreview");
  const nameInput = document.getElementById("catalogNewName");
  const descriptionInput = document.getElementById("catalogNewDescription");
  const priceInput = document.getElementById("catalogNewPrice");
  const trackStockInput = document.getElementById("catalogNewTrackStock");
  const stockInput = document.getElementById("catalogNewStock");
  const activeInput = document.getElementById("catalogNewActive");
  if (!db || !form || !grid || !empty) return;

  const BUCKET = "local2-product-images";
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MIME_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  let business = null;
  let products = [];
  let newPreviewUrl = "";

  function money(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Precio por confirmar";
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function setNotice(message, type = "ok") {
    if (!notice) return;
    notice.textContent = message;
    notice.className = `inline-notice catalog-notice ${type}`;
    notice.hidden = false;
    window.clearTimeout(setNotice.timer);
    setNotice.timer = window.setTimeout(() => { notice.hidden = true; }, 3500);
  }

  function validateImage(file) {
    if (!file) return;
    if (!MIME_EXT[file.type]) throw new Error("La foto debe ser JPG, PNG o WEBP.");
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error("La foto debe pesar máximo 5 MB.");
  }

  function setImagePreview(container, file, fallbackText = "Foto") {
    container.innerHTML = "";
    if (!file) {
      const span = document.createElement("span");
      span.textContent = fallbackText;
      container.appendChild(span);
      return "";
    }
    validateImage(file);
    const url = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Vista previa del producto";
    container.appendChild(img);
    return url;
  }

  function storagePathFromPublicUrl(url) {
    if (!url) return "";
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const index = String(url).indexOf(marker);
    if (index < 0) return "";
    return decodeURIComponent(String(url).slice(index + marker.length));
  }

  async function uploadImage(productId, file) {
    validateImage(file);
    const ext = MIME_EXT[file.type];
    const unique = crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : `${Date.now()}`;
    const path = `${business.id}/${productId}/cover-${Date.now()}-${unique}.${ext}`;
    const { error } = await db.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error("No pudimos subir la foto del producto.");
    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("No pudimos obtener la dirección de la foto.");
    return { path, url: data.publicUrl };
  }

  async function removeImageByUrl(url) {
    const path = storagePathFromPublicUrl(url);
    if (!path) return;
    const { error } = await db.storage.from(BUCKET).remove([path]);
    if (error) console.warn("No pudimos limpiar la foto anterior del catálogo", error);
  }

  async function loadBusiness() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return null;
    const { data, error } = await db
      .from("businesses")
      .select("id,name,owner_id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function loadProducts() {
    const { data, error } = await db
      .from("local2_products")
      .select("id,business_id,name,description,price_cop,image_url,active,track_stock,stock_quantity,sort_order,updated_at")
      .eq("business_id", business.id)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    products = data || [];
    renderProducts();
  }

  function createField(labelText, control, className = "") {
    const label = document.createElement("label");
    if (className) label.className = className;
    const span = document.createElement("span");
    span.textContent = labelText;
    label.append(span, control);
    return label;
  }

  function renderProducts() {
    grid.innerHTML = "";
    empty.hidden = products.length > 0;

    products.forEach((product) => {
      const card = document.createElement("article");
      card.className = "catalog-owner-product";

      const media = document.createElement("div");
      media.className = "catalog-owner-media";
      const currentImage = document.createElement("div");
      currentImage.className = "catalog-owner-image";
      if (product.image_url) {
        const img = document.createElement("img");
        img.src = product.image_url;
        img.alt = product.name || "Producto";
        img.loading = "lazy";
        currentImage.appendChild(img);
      } else {
        const fallback = document.createElement("span");
        fallback.textContent = (product.name || "P").trim().charAt(0).toUpperCase();
        currentImage.appendChild(fallback);
      }

      const photoLabel = document.createElement("label");
      photoLabel.className = "catalog-photo-button";
      photoLabel.textContent = product.image_url ? "Cambiar foto" : "Agregar foto";
      const photoInput = document.createElement("input");
      photoInput.type = "file";
      photoInput.accept = "image/jpeg,image/png,image/webp";
      photoInput.hidden = true;
      photoLabel.appendChild(photoInput);
      media.append(currentImage, photoLabel);

      const body = document.createElement("div");
      body.className = "catalog-owner-body";
      const name = document.createElement("input");
      name.type = "text";
      name.maxLength = 140;
      name.value = product.name || "";
      name.placeholder = "Nombre del producto";

      const description = document.createElement("textarea");
      description.maxLength = 600;
      description.rows = 3;
      description.value = product.description || "";
      description.placeholder = "Describe el producto y para qué sirve";

      const price = document.createElement("input");
      price.type = "number";
      price.min = "0";
      price.step = "1";
      price.inputMode = "numeric";
      price.value = product.price_cop === null ? "" : String(Math.round(Number(product.price_cop)));
      price.placeholder = "Precio COP";

      const activeLabel = document.createElement("label");
      activeLabel.className = "catalog-check";
      const active = document.createElement("input");
      active.type = "checkbox";
      active.checked = Boolean(product.active);
      activeLabel.append(active, document.createTextNode(" Visible para clientes"));

      const trackLabel = document.createElement("label");
      trackLabel.className = "catalog-check";
      const track = document.createElement("input");
      track.type = "checkbox";
      track.checked = Boolean(product.track_stock);
      trackLabel.append(track, document.createTextNode(" Controlar inventario"));

      const stock = document.createElement("input");
      stock.type = "number";
      stock.min = "0";
      stock.step = "1";
      stock.inputMode = "numeric";
      stock.placeholder = "Unidades disponibles";
      stock.value = product.stock_quantity === null ? "" : String(product.stock_quantity);
      stock.disabled = !track.checked;
      track.addEventListener("change", () => {
        stock.disabled = !track.checked;
        if (!track.checked) stock.value = "";
      });

      const controls = document.createElement("div");
      controls.className = "catalog-owner-controls";
      controls.append(
        createField("Nombre", name),
        createField("Descripción", description, "catalog-wide"),
        createField("Precio", price),
        createField("Stock", stock),
      );

      const options = document.createElement("div");
      options.className = "catalog-owner-options";
      options.append(activeLabel, trackLabel);

      const actions = document.createElement("div");
      actions.className = "catalog-owner-actions";
      const status = document.createElement("span");
      status.className = "catalog-product-status";
      status.textContent = product.active ? "Publicado" : "Oculto";
      const save = document.createElement("button");
      save.type = "button";
      save.className = "button primary small";
      save.textContent = "Guardar cambios";
      actions.append(status, save);

      let pendingPhoto = null;
      let pendingPreviewUrl = "";
      photoInput.addEventListener("change", () => {
        try {
          const file = photoInput.files?.[0] || null;
          if (!file) return;
          validateImage(file);
          if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
          currentImage.innerHTML = "";
          pendingPreviewUrl = URL.createObjectURL(file);
          const img = document.createElement("img");
          img.src = pendingPreviewUrl;
          img.alt = "Nueva foto del producto";
          currentImage.appendChild(img);
          pendingPhoto = file;
          photoLabel.firstChild.textContent = "Foto seleccionada";
        } catch (error) {
          photoInput.value = "";
          setNotice(error?.message || "No pudimos usar esa foto.", "error");
        }
      });

      save.addEventListener("click", async () => {
        const cleanName = name.value.trim();
        if (!cleanName) {
          setNotice("El producto necesita un nombre.", "error");
          name.focus();
          return;
        }
        save.disabled = true;
        save.textContent = pendingPhoto ? "Subiendo foto…" : "Guardando…";
        try {
          let nextImageUrl = product.image_url || null;
          let uploaded = null;
          if (pendingPhoto) {
            uploaded = await uploadImage(product.id, pendingPhoto);
            nextImageUrl = uploaded.url;
          }

          const rawPrice = price.value.trim();
          const stockValue = track.checked ? Math.max(0, Number.parseInt(stock.value || "0", 10) || 0) : null;
          const { data, error } = await db
            .from("local2_products")
            .update({
              name: cleanName,
              description: description.value.trim() || null,
              price_cop: rawPrice ? Number(rawPrice) : null,
              image_url: nextImageUrl,
              active: active.checked,
              track_stock: track.checked,
              stock_quantity: stockValue,
              updated_at: new Date().toISOString(),
            })
            .eq("id", product.id)
            .eq("business_id", business.id)
            .select("id,business_id,name,description,price_cop,image_url,active,track_stock,stock_quantity,sort_order,updated_at")
            .single();
          if (error) throw error;

          const oldImageUrl = product.image_url;
          Object.assign(product, data);
          if (uploaded && oldImageUrl && oldImageUrl !== uploaded.url) await removeImageByUrl(oldImageUrl);
          pendingPhoto = null;
          photoInput.value = "";
          if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
          pendingPreviewUrl = "";
          status.textContent = product.active ? "Publicado" : "Oculto";
          photoLabel.firstChild.textContent = product.image_url ? "Cambiar foto" : "Agregar foto";
          setNotice(`${product.name} quedó actualizado.`);
        } catch (error) {
          console.error("Local 2.0 catalog save", error);
          setNotice(error?.message || "No pudimos guardar el producto.", "error");
        } finally {
          save.disabled = false;
          save.textContent = "Guardar cambios";
        }
      });

      body.append(controls, options, actions);
      card.append(media, body);
      grid.appendChild(card);
    });
  }

  trackStockInput?.addEventListener("change", () => {
    stockInput.disabled = !trackStockInput.checked;
    if (!trackStockInput.checked) stockInput.value = "";
  });

  imageInput?.addEventListener("change", () => {
    try {
      const file = imageInput.files?.[0] || null;
      if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
      newPreviewUrl = setImagePreview(preview, file, "Sube una foto");
    } catch (error) {
      imageInput.value = "";
      newPreviewUrl = "";
      setImagePreview(preview, null, "Sube una foto");
      setNotice(error?.message || "No pudimos usar esa foto.", "error");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const cleanName = nameInput.value.trim();
    if (!cleanName) return;
    const file = imageInput.files?.[0] || null;
    try { validateImage(file); } catch (error) {
      setNotice(error?.message || "Revisa la foto.", "error");
      return;
    }

    submit.disabled = true;
    submit.textContent = file ? "Creando y subiendo foto…" : "Creando producto…";
    try {
      const rawPrice = priceInput.value.trim();
      const stockValue = trackStockInput.checked ? Math.max(0, Number.parseInt(stockInput.value || "0", 10) || 0) : null;
      const { data: created, error: createError } = await db
        .from("local2_products")
        .insert({
          business_id: business.id,
          name: cleanName,
          description: descriptionInput.value.trim() || null,
          price_cop: rawPrice ? Number(rawPrice) : null,
          active: activeInput.checked,
          track_stock: trackStockInput.checked,
          stock_quantity: stockValue,
          sort_order: products.length + 1,
        })
        .select("id,business_id,name,description,price_cop,image_url,active,track_stock,stock_quantity,sort_order,updated_at")
        .single();
      if (createError) throw createError;

      let createdProduct = created;
      if (file) {
        try {
          const uploaded = await uploadImage(created.id, file);
          const { data: updated, error: imageUpdateError } = await db
            .from("local2_products")
            .update({ image_url: uploaded.url, updated_at: new Date().toISOString() })
            .eq("id", created.id)
            .eq("business_id", business.id)
            .select("id,business_id,name,description,price_cop,image_url,active,track_stock,stock_quantity,sort_order,updated_at")
            .single();
          if (imageUpdateError) throw imageUpdateError;
          createdProduct = updated;
        } catch (imageError) {
          console.error("Local 2.0 product image", imageError);
          setNotice("El producto se creó, pero la foto no pudo subirse. Puedes agregarla desde Editar.", "error");
        }
      }

      products.push(createdProduct);
      form.reset();
      activeInput.checked = true;
      trackStockInput.checked = false;
      stockInput.disabled = true;
      setImagePreview(preview, null, "Sube una foto");
      if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
      newPreviewUrl = "";
      renderProducts();
      if (!file || createdProduct.image_url) setNotice(`${createdProduct.name} ya está en tu catálogo.`);
      window.dispatchEvent(new CustomEvent("local2:catalog-updated", { detail: { businessId: business.id } }));
    } catch (error) {
      console.error("Local 2.0 catalog create", error);
      setNotice("No pudimos crear el producto. Revisa los datos e intenta de nuevo.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Guardar producto";
    }
  });

  async function init() {
    try {
      business = await loadBusiness();
      if (!business) return;
      stockInput.disabled = !trackStockInput.checked;
      await loadProducts();
    } catch (error) {
      console.error("Local 2.0 catalog owner", error);
      setNotice("No pudimos cargar el administrador del catálogo.", "error");
    }
  }

  init();
})();
