import { createServer, type Server } from "node:http";
import { BrowserWindow } from "electron";
import type { ControlClient } from "../control";
import type { WbOAuth2 } from "../../shared/workbench";
import {
  buildAuthorizationUrl,
  generatePkce,
  parseRedirectCallback,
  tokenForm,
} from "../../shared/workbench/oauthPkce";

export type OAuthTokenResult = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  raw: string;
};

async function listenCallback(): Promise<{ url: string; wait: (expectedState: string) => Promise<string>; close: () => void }> {
  const server: Server = createServer();
  const url = await new Promise<string>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not bind a local OAuth callback port."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}/callback`);
    });
  });
  const wait = (expectedState: string) =>
    new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for the OAuth redirect.")), 180_000);
      server.on("request", (req, res) => {
        const found = new URL(req.url ?? "/", url);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<html><body><p>You can close this window and return to Lurkwire.</p></body></html>");
        try {
          const parsed = parseRedirectCallback(found.toString(), expectedState);
          clearTimeout(timer);
          resolve(parsed.code);
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    });
  return {
    url,
    wait,
    close: () => {
      server.close();
    },
  };
}

export async function exchangeOauthCode(
  oauth: WbOAuth2,
  input: { code: string; redirectUri: string; verifier?: string },
  control: ControlClient,
  projectId?: string | null,
): Promise<OAuthTokenResult> {
  if (!oauth.tokenUrl) {
    throw new Error("Set the token URL first.");
  }
  const body = tokenForm(oauth, input);
  const flow = await control.sendWorkbench({
    project_id: projectId ?? undefined,
    method: "POST",
    url: oauth.tokenUrl,
    headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
    body,
    source: "oauth",
  });
  const raw = flow.resp_preview ?? "";
  let parsed: { access_token?: string; refresh_token?: string; token_type?: string } = {};
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    parsed = Object.fromEntries(new URLSearchParams(raw));
  }
  if (!parsed.access_token) {
    throw new Error(raw || "The token endpoint did not return an access_token. Check scope for the token host.");
  }
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    tokenType: parsed.token_type,
    raw,
  };
}

export async function startOauthBrowserFlow(
  oauth: WbOAuth2,
  parent: BrowserWindow | null,
  control: ControlClient,
  projectId?: string | null,
  partition?: string,
): Promise<OAuthTokenResult> {
  const pkce = await generatePkce();
  const callback = oauth.redirectUri?.trim() ? null : await listenCallback();
  const redirectUri = oauth.redirectUri?.trim() || callback!.url;
  const authorize = buildAuthorizationUrl(oauth, redirectUri, pkce);
  const child = new BrowserWindow({
    parent: parent ?? undefined,
    width: 520,
    height: 740,
    title: "Lurkwire — authorize",
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const captured = new Promise<string>((resolve, reject) => {
    const fail = (error: Error) => reject(error);
    const tryUrl = (next: string) => {
      if (!next.startsWith(redirectUri)) {
        return;
      }
      try {
        resolve(parseRedirectCallback(next, pkce.state).code);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    };
    child.webContents.on("will-redirect", (_event, url) => tryUrl(url));
    child.webContents.on("will-navigate", (_event, url) => tryUrl(url));
    child.on("closed", () => fail(new Error("The authorization window was closed.")));
  });
  const codePromise = callback ? callback.wait(pkce.state) : captured;
  try {
    await child.loadURL(authorize);
    const code = await Promise.race([
      codePromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for authorization.")), 180_000)),
    ]);
    return await exchangeOauthCode(oauth, { code, redirectUri, verifier: pkce.verifier }, control, projectId);
  } finally {
    callback?.close();
    if (!child.isDestroyed()) {
      child.close();
    }
  }
}
