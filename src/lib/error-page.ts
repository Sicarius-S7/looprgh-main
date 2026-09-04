/** Renders a standalone, self-styled HTML fallback page shown when the app itself fails to load. */
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { --bg: #f2fafa; --fg: #0c2429; --muted: #4a6469; --card: #ffffff; --line: #d5e4e6; --brand: #023e46; --brand-fg: #ffffff; }
      @media (prefers-color-scheme: dark) { :root { --bg: #06171b; --fg: #eaf5f5; --muted: #9db6ba; --card: #0e2429; --line: #1d3b41; --brand: #7cc4c9; --brand-fg: #06171b; } }
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: var(--muted); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: var(--brand); color: var(--brand-fg); }
      .secondary { background: var(--card); color: var(--fg); border-color: var(--line); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
