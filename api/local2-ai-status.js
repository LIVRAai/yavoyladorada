export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const response = await fetch('https://upahrzjvpfjfmbcrjrco.supabase.co/functions/v1/local2-health');
    const text = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    res.send(text);
  } catch (error) {
    res.status(502).json({ ok: false, error: 'No pudimos verificar el estado de IA.' });
  }
}
