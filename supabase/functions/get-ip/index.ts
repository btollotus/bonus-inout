Deno.serve(async () => {
  const res = await fetch("https://api.ipify.org?format=json");
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});