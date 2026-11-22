export type ReaderArticle = {
  title: string;
  byline: string;
  text: string;
  excerpt: string;
};

const DROP_RE = /<(script|style|nav|footer|aside|noscript|svg|form)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;
const TAG_RE = /<[^>]+>/g;
const WS_RE = /\s+/g;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function strip(html: string): string {
  return decodeEntities(html.replace(DROP_RE, " ").replace(TAG_RE, " ").replace(WS_RE, " ").trim());
}

function firstMatch(html: string, re: RegExp): string {
  const match = re.exec(html);
  return match?.[1]?.trim() ?? "";
}

function block(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const match = re.exec(html);
  return match ? match[0] : null;
}

function largestDiv(html: string): string | null {
  const re = /<div(\s[^>]*)?>([\s\S]*?)<\/div>/gi;
  let best: string | null = null;
  let bestLen = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const text = strip(match[0]);
    if (text.length > bestLen) {
      best = match[0];
      bestLen = text.length;
    }
  }
  return best;
}

export function extractArticleFromHtml(html: string, fallbackTitle = ""): ReaderArticle {
  const title =
    firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ||
    firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/\s+/g, " ") ||
    firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(TAG_RE, " ").trim() ||
    fallbackTitle ||
    "Article";
  const byline =
    firstMatch(html, /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)/i) ||
    firstMatch(html, /<(?:p|span|div)[^>]*class=["'][^"']*\b(?:byline|author)\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|div)>/i).replace(TAG_RE, " ").trim();
  const articleHtml =
    block(html, "article") ||
    html.match(/<div[^>]+role=["']main["'][^>]*>[\s\S]*?<\/div>/i)?.[0] ||
    block(html, "main") ||
    largestDiv(html) ||
    block(html, "body") ||
    html;
  const text = strip(articleHtml);
  const excerpt = text.slice(0, 240);
  return { title: strip(title) || "Article", byline, text, excerpt };
}

export function isReadable(article: ReaderArticle): boolean {
  return article.text.split(/\s+/).filter(Boolean).length >= 40;
}
