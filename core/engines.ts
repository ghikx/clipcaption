// Moteurs de rendu : Remotion pilote un Chrome invisible. Sur certains Mac, le Chrome
// fourni par Remotion (« headless shell ») meurt dès le lancement (« Target closed »).
// On essaie donc plusieurs moteurs dans l'ordre, et on mémorise celui qui marche.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChromiumOptions } from "@remotion/renderer";
import { WORKSPACE } from "./paths";

export type Engine = {
  name: string;
  label: string;
  browserExecutable: string | null;
  chromeMode: "headless-shell" | "chrome-for-testing";
  // Mode sûr : un seul onglet et rendu graphique logiciel.
  safe: boolean;
};

const MEMORY = path.join(WORKSPACE, "render-engine.json");

// Google Chrome installé sur la machine (le navigateur habituel).
const systemChrome = () =>
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
  ].find((p) => fs.existsSync(p)) ?? null;

export const engines = (): Engine[] => {
  if (process.env.REMOTION_BROWSER) {
    return [{ name: "custom", label: "navigateur REMOTION_BROWSER", browserExecutable: process.env.REMOTION_BROWSER, chromeMode: "headless-shell", safe: process.env.CLIPCAPTION_SAFE_RENDER === "1" }];
  }
  const list: Engine[] = [
    { name: "remotion", label: "Chrome de Remotion", browserExecutable: null, chromeMode: "headless-shell", safe: false },
    { name: "remotion-safe", label: "Chrome de Remotion (mode sûr)", browserExecutable: null, chromeMode: "headless-shell", safe: true },
  ];
  const chrome = systemChrome();
  if (chrome) {
    list.push(
      { name: "chrome", label: "Google Chrome", browserExecutable: chrome, chromeMode: "chrome-for-testing", safe: false },
      { name: "chrome-safe", label: "Google Chrome (mode sûr)", browserExecutable: chrome, chromeMode: "chrome-for-testing", safe: true },
    );
  }
  // CLIPCAPTION_SAFE_RENDER=1 : on ne garde que les moteurs en mode sûr.
  const filtered = process.env.CLIPCAPTION_SAFE_RENDER === "1" ? list.filter((e) => e.safe) : list;
  // Le moteur qui a marché la dernière fois passe en premier.
  const remembered = readRemembered();
  return [...filtered].sort((a, b) => Number(b.name === remembered) - Number(a.name === remembered));
};

const readRemembered = () => {
  try {
    return JSON.parse(fs.readFileSync(MEMORY, "utf8")).engine as string;
  } catch {
    return null;
  }
};

const remember = (e: Engine) => {
  try {
    fs.mkdirSync(WORKSPACE, { recursive: true });
    fs.writeFileSync(MEMORY, JSON.stringify({ engine: e.name, at: new Date().toISOString() }));
  } catch {
    // mémorisation facultative
  }
};

export const engineOptions = (e: Engine) => ({
  browserExecutable: e.browserExecutable,
  chromeMode: e.chromeMode,
  chromiumOptions: (e.safe ? { gl: "swangle" } : {}) as ChromiumOptions,
});

// Plantage ou lancement impossible du navigateur, y compris l'échec du téléchargement du
// Chrome de Remotion (premier lancement hors ligne, réseau filtré).
const isBrowserCrash = (message: string) =>
  /target closed|session closed|crash|protocol error|browser has disconnected|page crashed|failed to launch|could not find|ENOENT.*chrome|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|download/i.test(message);

// Exécute une tâche de rendu en essayant les moteurs un par un. Seuls les plantages du
// navigateur passent au moteur suivant ; les autres erreurs remontent telles quelles.
export const withEngine = async <T>(task: (e: Engine) => Promise<T>, onRetry?: (next: Engine) => void): Promise<T> => {
  const list = engines();
  const failures: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const engine = list[i];
    try {
      const result = await task(engine);
      remember(engine);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!isBrowserCrash(message)) throw e;
      failures.push(`${engine.label} : ${message.split("\n")[0]}`);
      const next = list[i + 1];
      console.error(`[rendu] ${engine.label} a planté (${message.split("\n")[0]}).${next ? ` Essai avec ${next.label}…` : ""}`);
      if (next) onRetry?.(next);
    }
  }
  throw new Error(
    `Aucun moteur de rendu n'a pu démarrer.\n${failures.join("\n")}\n` +
      (systemChrome() ? "" : "Installe Google Chrome (https://www.google.com/chrome/) : il sert de moteur de secours."),
  );
};
