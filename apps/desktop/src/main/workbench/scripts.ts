import { createContext, runInContext } from "node:vm";
import type { HeaderPair } from "../../shared/types";
import type { VariableMap } from "../../shared/workbench";
import type { WbTestResult } from "../../shared/workbench";

export type ScriptRequest = {
  method: string;
  url: string;
  headers: HeaderPair[];
  body?: string;
};

export type ScriptResponse = {
  code: number;
  status: number;
  headers: HeaderPair[];
  text: string;
  responseTime: number;
  responseSize: number;
};

export type ScriptRun = {
  logs: string[];
  tests: WbTestResult[];
  env: VariableMap;
  globals: VariableMap;
  collection: VariableMap;
  request: ScriptRequest;
};

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function makeExpect(pushError: (message: string) => void) {
  const wrap = (actual: unknown) => {
    const fail = (message: string) => {
      pushError(message);
      throw new Error(message);
    };
    const to = {
      equal: (expected: unknown) => {
        if (actual !== expected) {
          fail(`expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
        }
        return to;
      },
      eql: (expected: unknown) => {
        if (!deepEqual(actual, expected)) {
          fail(`expected ${JSON.stringify(actual)} to deeply equal ${JSON.stringify(expected)}`);
        }
        return to;
      },
      include: (expected: unknown) => {
        if (typeof actual === "string") {
          if (!actual.includes(String(expected))) {
            fail(`expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
          }
        } else if (Array.isArray(actual)) {
          if (!actual.some((item) => deepEqual(item, expected))) {
            fail(`expected array to include ${JSON.stringify(expected)}`);
          }
        } else {
          fail("include() is only supported on strings and arrays");
        }
        return to;
      },
      be: {
        ok: Boolean(actual),
        true: actual === true,
        false: actual === false,
        a: (type: string) => {
          const got = Array.isArray(actual) ? "array" : typeof actual;
          if (got !== type) {
            fail(`expected ${JSON.stringify(actual)} to be a ${type}`);
          }
        },
        below: (n: number) => {
          if (typeof actual !== "number" || actual >= n) {
            fail(`expected ${JSON.stringify(actual)} to be below ${n}`);
          }
        },
        above: (n: number) => {
          if (typeof actual !== "number" || actual <= n) {
            fail(`expected ${JSON.stringify(actual)} to be above ${n}`);
          }
        },
      },
      have: {
        status: (code: number) => {
          const value =
            actual && typeof actual === "object" && "code" in (actual as object)
              ? (actual as { code: number }).code
              : actual;
          if (value !== code) {
            fail(`expected status ${JSON.stringify(value)} to be ${code}`);
          }
        },
        header: (name: string) => {
          const headers =
            actual && typeof actual === "object" && "headers" in (actual as object)
              ? ((actual as { headers: HeaderPair[] }).headers ?? [])
              : [];
          if (!headers.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
            fail(`expected to have header ${name}`);
          }
        },
        property: (key: string) => {
          if (!actual || typeof actual !== "object" || !(key in (actual as object))) {
            fail(`expected to have property ${key}`);
          }
        },
      },
    };
    // chai-style getters that throw immediately when used as `to.be.ok`
    Object.defineProperty(to.be, "ok", {
      get() {
        if (!actual) {
          fail(`expected ${JSON.stringify(actual)} to be ok`);
        }
        return true;
      },
    });
    Object.defineProperty(to.be, "true", {
      get() {
        if (actual !== true) {
          fail(`expected ${JSON.stringify(actual)} to be true`);
        }
        return true;
      },
    });
    Object.defineProperty(to.be, "false", {
      get() {
        if (actual !== false) {
          fail(`expected ${JSON.stringify(actual)} to be false`);
        }
        return true;
      },
    });
    return { to };
  };
  return wrap;
}

function varApi(map: VariableMap) {
  return {
    get: (key: string) => map[key],
    set: (key: string, value: unknown) => {
      map[key] = String(value);
    },
    unset: (key: string) => {
      delete map[key];
    },
    has: (key: string) => Object.prototype.hasOwnProperty.call(map, key),
    clear: () => {
      for (const key of Object.keys(map)) {
        delete map[key];
      }
    },
    toObject: () => ({ ...map }),
  };
}

export function runWorkbenchScript(
  script: string,
  kind: "prerequest" | "test",
  input: {
    env: VariableMap;
    globals: VariableMap;
    collection: VariableMap;
    request: ScriptRequest;
    response?: ScriptResponse;
  },
  timeoutMs = 2000,
): ScriptRun {
  const logs: string[] = [];
  const tests: WbTestResult[] = [];
  const env = { ...input.env };
  const globals = { ...input.globals };
  const collection = { ...input.collection };
  const request: ScriptRequest = {
    method: input.request.method,
    url: input.request.url,
    headers: input.request.headers.map((item) => ({ ...item })),
    body: input.request.body,
  };

  const stringify = (args: unknown[]) =>
    args
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .join(" ");

  const currentTestErrors: string[] = [];
  const expect = makeExpect((message) => {
    if (currentTestErrors.length === 0 || currentTestErrors[currentTestErrors.length - 1] !== message) {
      currentTestErrors.push(message);
    }
  });

  const json = () => {
    try {
      return JSON.parse(input.response?.text || "null");
    } catch (error) {
      throw new Error(`response is not JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const response = input.response
    ? {
        code: input.response.code,
        status: input.response.status,
        headers: input.response.headers,
        responseTime: input.response.responseTime,
        responseSize: input.response.responseSize,
        text: () => input.response?.text ?? "",
        json,
        to: {
          have: {
            status: (code: number) => expect({ code }).to.have.status(code),
            header: (name: string) => expect({ headers: input.response?.headers ?? [] }).to.have.header(name),
          },
        },
      }
    : undefined;

  const pm = {
    info: { eventName: kind === "prerequest" ? "prerequest" : "test" },
    environment: varApi(env),
    globals: varApi(globals),
    collectionVariables: varApi(collection),
    variables: {
      get: (key: string) => env[key] ?? collection[key] ?? globals[key],
    },
    request,
    response,
    test: (name: string, fn: () => void) => {
      currentTestErrors.length = 0;
      try {
        fn();
        tests.push({ name, passed: currentTestErrors.length === 0, error: currentTestErrors[0] });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        tests.push({ name, passed: false, error: message });
      }
    },
    expect,
  };

  const sandbox = {
    pm,
    console: {
      log: (...args: unknown[]) => logs.push(stringify(args)),
      warn: (...args: unknown[]) => logs.push(stringify(args)),
      error: (...args: unknown[]) => logs.push(stringify(args)),
      info: (...args: unknown[]) => logs.push(stringify(args)),
    },
    JSON,
    Math,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    atob: (value: string) => Buffer.from(value, "base64").toString("utf8"),
    btoa: (value: string) => Buffer.from(value, "utf8").toString("base64"),
  };

  if (script.trim()) {
    try {
      const context = createContext(sandbox, {
        name: "lurkwire-workbench-script",
        codeGeneration: { strings: false, wasm: false },
      });
      runInContext(script, context, {
        filename: kind === "prerequest" ? "pre-request.js" : "test.js",
        timeout: timeoutMs,
        displayErrors: true,
      });
    } catch (error) {
      tests.push({
        name: kind === "prerequest" ? "Pre-request script" : "Test script",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { logs, tests, env, globals, collection, request };
}
