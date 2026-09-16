(() => {
  const modeEl = document.getElementById("statAiMode");
  const aiMessagesEl = document.getElementById("statAiMessages");
  const aiDetailEl = document.getElementById("aiDetail");
  if (!modeEl || !aiMessagesEl) return;

  const setDetail = (text) => {
    if (aiDetailEl) aiDetailEl.textContent = text;
  };

  async function loadHealth() {
    try {
      const response = await fetch("/api/local2-ai-status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error("health unavailable");
      modeEl.textContent = data.ai_configured ? "IA activa" : "Guiado";
      modeEl.classList.toggle("good", Boolean(data.ai_configured));
      setDetail(data.ai_configured
        ? "OpenAI está disponible para la beta. Las respuestas pueden usar IA real."
        : "La beta está usando respuestas guiadas de respaldo hasta configurar OPENAI_API_KEY en Supabase.");
    } catch (error) {
      console.warn("Local2 health", error);
      modeEl.textContent = "Sin verificar";
      setDetail("No pudimos verificar la conexión con IA. El resto de la operación puede seguir funcionando.");
    }
  }

  async function loadAiMessageCount() {
    if (!window.yavoyDb) return;
    try {
      const { data: { user } } = await window.yavoyDb.auth.getUser();
      if (!user) return;
      const { data: businesses, error: businessError } = await window.yavoyDb
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .limit(1);
      if (businessError || !businesses?.length) return;
      const businessId = businesses[0].id;
      const { data, error } = await window.yavoyDb
        .from("local2_messages")
        .select("id,metadata")
        .eq("business_id", businessId)
        .eq("role", "assistant")
        .limit(500);
      if (error) throw error;
      const rows = data || [];
      const ai = rows.filter((row) => row.metadata?.mode === "ai").length;
      const guided = rows.filter((row) => row.metadata?.mode === "guided").length;
      aiMessagesEl.textContent = String(ai);
      aiMessagesEl.title = `${ai} respuestas IA · ${guided} respuestas guiadas`;
    } catch (error) {
      console.warn("Local2 AI metrics", error);
      aiMessagesEl.textContent = "—";
    }
  }

  const refresh = () => Promise.allSettled([loadHealth(), loadAiMessageCount()]);
  refresh();
  window.addEventListener("local2:refresh", refresh);
  window.setInterval(refresh, 60000);
})();
