Deno.serve((_req) => {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "yavoy-backend",
      message: "Edge Function operativa"
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );
});
