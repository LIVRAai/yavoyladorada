Deno.serve(async (_req) => {
  const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

  if (!accessToken) {
    return new Response(
      JSON.stringify({
        ok: false,
        mercadopago_authenticated: false,
        error: "MERCADOPAGO_ACCESS_TOKEN no configurado"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  }

  try {
    const response = await fetch("https://api.mercadolibre.com/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("Mercado Pago credential check failed", response.status, body);

      return new Response(
        JSON.stringify({
          ok: false,
          mercadopago_authenticated: false,
          provider_status: response.status
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        }
      );
    }

    const account = await response.json();

    return new Response(
      JSON.stringify({
        ok: true,
        mercadopago_authenticated: true,
        account_id: account?.id ?? null
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  } catch (error) {
    console.error("Mercado Pago health check error", error);

    return new Response(
      JSON.stringify({
        ok: false,
        mercadopago_authenticated: false,
        error: "No fue posible consultar Mercado Pago"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  }
});
