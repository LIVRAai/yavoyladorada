Deno.serve(() => {
  const aiConfigured = Boolean(Deno.env.get("OPENAI_API_KEY"));
  return new Response(JSON.stringify({
    ok: true,
    service: "local2-beta",
    ai_configured: aiConfigured,
    checked_at: new Date().toISOString()
  }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    }
  });
});
