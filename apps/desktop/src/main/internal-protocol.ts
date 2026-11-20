import { protocol, type Session } from "electron";
import { INTERNAL_TITLES, parseInternalPage } from "../shared/url";

export function registerLurkwireScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "lurkwire",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export function handleLurkwireProtocol(ses: Session): void {
  if (ses.protocol.isProtocolHandled("lurkwire")) {
    return;
  }
  ses.protocol.handle("lurkwire", (request) => {
    const page = parseInternalPage(request.url);
    const title = page ? INTERNAL_TITLES[page] : "Lurkwire";
    const html = `<!doctype html><meta charset="utf-8"><title>${title}</title><style>html,body{margin:0;background:transparent}</style>`;
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  });
}
