export function requireApiKey(request: Request): Response | null {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.API_SECRET) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}