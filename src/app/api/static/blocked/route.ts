export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Blocked</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #0f172a;
            color: #e2e8f0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            max-width: 36rem;
            padding: 2rem;
            text-align: center;
        }
        h1 {
            font-size: 2rem;
            font-weight: 600;
            margin-bottom: 1rem;
        }
        p {
            color: #cbd5e1;
            font-size: 1rem;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Access blocked</h1>
        <p>This client has been blocked by the Traefik Proxy Admin native IP jail.</p>
    </div>
</body>
</html>`;

  return new Response(html, {
    status: 403,
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-store",
    },
  });
}
