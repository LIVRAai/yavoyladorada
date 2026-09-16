export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const vercelConfigured = Boolean(process.env.OPENAI_API_KEY);
  try {
    const response = await fetch('https://upahrzjvpfjfmbcrjrco.supabase.co/functions/v1/local2-health');
    const data = await response.json().catch(() => null);
    res.status(response.ok ? 200 : response.status).json({
      ok: response.ok && Boolean(data?.ok),
      service: 'local2-beta',
      ai_configured: Boolean(data?.ai_configured || vercelConfigured),
      supabase_ai_configured: Boolean(data?.ai_configured),
      vercel_ai_configured: vercelConfigured,
      checked_at: new Date().toISOString()
    });
  } catch (error) {
    res.status(200).json({
      ok: true,
      service: 'local2-beta',
      ai_configured: vercelConfigured,
      supabase_ai_configured: false,
      vercel_ai_configured: vercelConfigured,
      checked_at: new Date().toISOString(),
      warning: 'No pudimos consultar Supabase; se verificó únicamente Vercel.'
    });
  }
}
