import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const bootstrapUrl = new URL("../public/analytics-bootstrap.js", import.meta.url);
const layoutUrl = new URL("../src/layouts/BaseLayout.astro", import.meta.url);
const source = await readFile(bootstrapUrl, "utf8");

function runBootstrap({ search = "", webdriver = false, storage = new Map() } = {}) {
  const appendedScripts = [];
  const documentElement = { dataset: {} };
  const config = {
    dataset: {
      umamiScriptUrl: "https://analytics.bohodigitalservices.com/script.js",
      umamiWebsiteId: "fefef93c-b1d6-4d04-95d3-064af3d38a41",
      umamiDomains: "howbiscuit.com,www.howbiscuit.com",
      gaId: "G-NG0NQMVFEH",
      gaPublicHosts: "howbiscuit.com,www.howbiscuit.com",
    },
  };
  const document = {
    currentScript: config,
    documentElement,
    head: { appendChild(script) { appendedScripts.push(script); } },
    createElement() {
      return {
        async: false,
        src: "",
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
      };
    },
  };
  const sessionStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); },
  };
  const window = {
    location: { search, hostname: "howbiscuit.com" },
  };

  vm.runInNewContext(source, {
    Date,
    URLSearchParams,
    document,
    encodeURIComponent,
    navigator: { webdriver },
    sessionStorage,
    window,
  });

  return { appendedScripts, documentElement, storage, window };
}

test("normal visits load the configured analytics providers", () => {
  const result = runBootstrap();
  assert.equal(result.appendedScripts.length, 2);
  assert.equal(result.appendedScripts[0].src, "https://analytics.bohodigitalservices.com/script.js");
  assert.equal(result.appendedScripts[0].attributes["data-website-id"], "fefef93c-b1d6-4d04-95d3-064af3d38a41");
  assert.equal(result.appendedScripts[0].attributes["data-domains"], "howbiscuit.com,www.howbiscuit.com");
  assert.equal(result.appendedScripts[0].attributes["data-do-not-track"], "true");
  assert.equal(result.appendedScripts[0].attributes["data-exclude-search"], "true");
  assert.equal(result.appendedScripts[1].src, "https://www.googletagmanager.com/gtag/js?id=G-NG0NQMVFEH");
  assert.equal(result.window.dataLayer.length, 2);
  assert.equal(result.window.dataLayer[1][0], "config");
  assert.equal(result.window.dataLayer[1][1], "G-NG0NQMVFEH");
  assert.equal(result.window.dataLayer[1][2].anonymize_ip, true);
});

test("Boho QA marker suppresses analytics for the current tab and can be cleared", () => {
  const storage = new Map();
  const marked = runBootstrap({ search: "?boho_qa=1", storage });
  assert.equal(marked.appendedScripts.length, 0);
  assert.equal(marked.documentElement.dataset.analyticsSuppressed, "boho-qa");
  assert.equal(storage.get("boho_qa"), "1");

  const persisted = runBootstrap({ storage });
  assert.equal(persisted.appendedScripts.length, 0);

  const cleared = runBootstrap({ search: "?boho_qa=0", storage });
  assert.equal(cleared.appendedScripts.length, 2);
  assert.equal(storage.has("boho_qa"), false);
});

test("webdriver is an additional suppression safeguard", () => {
  const result = runBootstrap({ webdriver: true });
  assert.equal(result.appendedScripts.length, 0);
  assert.equal(result.documentElement.dataset.analyticsSuppressed, "boho-qa");
});

test("the root layout delegates analytics to the first-party bootstrap", async () => {
  const layout = await readFile(layoutUrl, "utf8");
  assert.match(layout, /src=["']\/analytics-bootstrap\.js["']/);
  assert.match(layout, /data-analytics-bootstrap=["']boho-v1["']/);
  assert.match(layout, /data-umami-website-id=["']fefef93c-b1d6-4d04-95d3-064af3d38a41["']/);
  assert.doesNotMatch(layout, /<script[^>]+src=["']https:\/\/analytics\.bohodigitalservices\.com\/script\.js/);
});
