// Local 💚 — mejoras de UX para Explorar
(function setupExploreUx() {
  const grid = document.getElementById("catalogGrid");
  const searchInput = document.getElementById("searchInput");
  const cityFilter = document.getElementById("cityFilter");
  const filterRow = document.getElementById("categoryFilters");
  if (!grid || !searchInput || !cityFilter || !filterRow) return;

  // Envuelve el buscador para mostrar un icono sin alterar la lógica existente.
  if (!searchInput.parentElement?.classList.contains("search-input-shell")) {
    const shell = document.createElement("div");
    shell.className = "search-input-shell";
    searchInput.parentNode.insertBefore(shell, searchInput);
    shell.appendChild(searchInput);
  }

  // Cabecera de filtros + contador de resultados.
  const meta = document.createElement("div");
  meta.className = "explore-toolbar-meta";

  const copy = document.createElement("div");
  copy.className = "explore-toolbar-copy";

  const title = document.createElement("span");
  title.className = "explore-toolbar-title";
  title.textContent = "Explora por categoría";

  const count = document.createElement("span");
  count.className = "explore-result-count";
  count.setAttribute("aria-live", "polite");
  count.textContent = "Cargando emprendimientos…";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "explore-clear";
  clearButton.textContent = "Limpiar filtros";
  clearButton.hidden = true;

  copy.append(title, count);
  meta.append(copy, clearButton);
  filterRow.parentNode.insertBefore(meta, filterRow);

  function hasActiveFilters() {
    const activeChip = filterRow.querySelector(".filter-chip.active");
    return Boolean(
      searchInput.value.trim() ||
      cityFilter.value !== "todas" ||
      (activeChip && activeChip.dataset.category !== "todos")
    );
  }

  function updateMeta() {
    const empty = grid.querySelector(".empty");
    const cards = grid.querySelectorAll(".catalog-card");
    if (empty) {
      count.textContent = hasActiveFilters() ? "0 emprendimientos encontrados" : "Sin emprendimientos publicados";
    } else {
      const total = cards.length;
      count.textContent = total === 1 ? "1 emprendimiento encontrado" : `${total} emprendimientos encontrados`;
    }
    clearButton.hidden = !hasActiveFilters();
  }

  const observer = new MutationObserver(updateMeta);
  observer.observe(grid, { childList: true, subtree: false });

  [searchInput, cityFilter].forEach((control) => {
    control.addEventListener(control === searchInput ? "input" : "change", () => {
      window.requestAnimationFrame(updateMeta);
    });
  });

  filterRow.addEventListener("click", () => window.requestAnimationFrame(updateMeta));

  clearButton.addEventListener("click", () => {
    searchInput.value = "";
    cityFilter.value = "todas";
    const allChip = filterRow.querySelector('[data-category="todos"]');
    if (allChip) allChip.click();
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    cityFilter.dispatchEvent(new Event("change", { bubbles: true }));
    searchInput.focus();
    window.requestAnimationFrame(updateMeta);
  });

  updateMeta();
})();
