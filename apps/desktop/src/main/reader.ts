import { extractArticleFromHtml, isReadable, type ReaderArticle } from "../shared/readerExtract";

export type StoredReader = ReaderArticle & { url: string };

let last: StoredReader | null = null;

export function setReaderArticle(article: StoredReader): void {
  last = article;
}

export function getReaderArticle(): StoredReader | null {
  return last;
}

export function articleFromHtml(html: string, url: string, fallbackTitle = ""): StoredReader {
  const article = extractArticleFromHtml(html, fallbackTitle);
  if (!isReadable(article) && article.text.length < 80) {
    throw new Error("This page does not look like an article I can simplify.");
  }
  const stored = { ...article, url };
  setReaderArticle(stored);
  return stored;
}
