// Local 💚 — recuperación defensiva de Mi espacio.
// Si la capa de estado/membresía falla después de cargar el negocio,
// el formulario de edición debe seguir siendo utilizable.
(() => {
  const path = window.location.pathname;
  if (!(path.endsWith('/mi-negocio.html') || path.endsWith('mi-negocio.html'))) return;

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value || '';
  }

  function showFallbackError(message) {
    const loading = document.getElementById('loadingNotice');
    const error = document.getElementById('errorNotice');
    if (loading) loading.hidden = true;
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
  }

  function fillProfile(business) {
    ['name', 'category', 'city', 'location', 'hours', 'whatsapp', 'phone', 'instagram', 'reel_url']
      .forEach((field) => setValue(field, business[field]));

    const profile = window.LocalProfileData?.parse
      ? window.LocalProfileData.parse(business.description)
      : { summary: '', offerings: [], modes: [], localStory: '' };

    setValue('description', profile.summary);
    setValue('offerings', Array.isArray(profile.offerings) ? profile.offerings.join(', ') : '');
    setValue('local_story', profile.localStory);

    document.querySelectorAll('input[name="mode"]').forEach((input) => {
      input.checked = Array.isArray(profile.modes) && profile.modes.includes(input.value);
    });

    const safeImage = window.YaVoyCoverImage?.isSafeImageSource?.(business.image_url) || '';
    const image = document.getElementById('coverPreviewImage');
    const placeholder = document.getElementById('coverPlaceholder');
    const remove = document.getElementById('removeCover');
    const filename = document.getElementById('coverFileName');
    if (image && placeholder && remove) {
      image.hidden = !safeImage;
      placeholder.hidden = Boolean(safeImage);
      remove.hidden = !safeImage;
      if (safeImage) image.src = safeImage;
      else image.removeAttribute('src');
    }
    if (filename) filename.textContent = safeImage ? 'Foto de portada actual.' : 'Sin foto de portada.';
  }

  function showDashboard(business) {
    const loading = document.getElementById('loadingNotice');
    const empty = document.getElementById('emptyState');
    const dashboard = document.getElementById('dashboard');
    const businessName = document.getElementById('businessName');
    const badge = document.getElementById('statusBadge');
    const explanation = document.getElementById('statusExplanation');
    const valueNotice = document.getElementById('membershipValueNotice');
    const valueTitle = document.getElementById('membershipValueTitle');
    const valueText = document.getElementById('membershipValueText');
    const subscriptionStatus = document.getElementById('subscriptionStatus');
    const catalogButton = document.getElementById('catalogButton');

    if (loading) loading.hidden = true;
    if (empty) empty.hidden = true;
    if (businessName) businessName.textContent = business.name || 'Mi emprendimiento';
    if (badge) {
      badge.textContent = 'Publicado';
      badge.className = 'status-badge status-active';
    }
    if (explanation) explanation.textContent = 'Tu emprendimiento está visible en Local 💚.';
    if (valueNotice) {
      valueNotice.className = 'membership-status-panel success';
      valueNotice.hidden = false;
    }
    if (valueTitle) valueTitle.textContent = 'Tu espacio está activo en Local 💚';
    if (valueText) valueText.textContent = 'Mantén tu perfil actualizado y aprovecha los beneficios de la comunidad.';
    if (subscriptionStatus && /cargando/i.test(subscriptionStatus.textContent || '')) {
      subscriptionStatus.textContent = 'Disponible';
    }
    if (catalogButton) catalogButton.hidden = false;

    fillProfile(business);
    if (dashboard) dashboard.hidden = false;
  }

  async function recoverIfBlank() {
    // Damos tiempo al flujo normal. Solo intervenimos si terminó el loading
    // pero dashboard y estado vacío siguen ocultos: ese es el estado en blanco.
    await wait(900);

    const loading = document.getElementById('loadingNotice');
    const empty = document.getElementById('emptyState');
    const dashboard = document.getElementById('dashboard');
    const error = document.getElementById('errorNotice');

    const alreadyResolved = !dashboard?.hidden || !empty?.hidden || !loading?.hidden || (error && !error.hidden);
    if (alreadyResolved) return;
    if (!window.yavoyDb) {
      showFallbackError('No pudimos conectar con Local en este momento.');
      return;
    }

    try {
      const { data: userData, error: userError } = await window.yavoyDb.auth.getUser();
      if (userError || !userData?.user) return;

      const { data: business, error: businessError } = await window.yavoyDb
        .from('businesses')
        .select('id,owner_id,name,category,city,description,location,hours,instagram,image_url,reel_url,phone,whatsapp,status,created_at,updated_at')
        .eq('owner_id', userData.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (businessError) throw businessError;
      if (!business) return;
      showDashboard(business);
    } catch (errorValue) {
      console.error('No pudimos recuperar Mi espacio', errorValue);
      showFallbackError('Encontramos tu sesión, pero no pudimos mostrar tu emprendimiento. Intenta recargar la página.');
    }
  }

  recoverIfBlank();
})();
