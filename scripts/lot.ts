// Sous-titre toutes les vidéos d'un dossier avec une configuration enregistrée.
//
//   npm run lot -- <dossier> [--config chenek] [--out <dossier>] [--watch]
//                            [--style chenek] [--lang fr] [--cut-silences] [--min-silence 400] [--accent "#EEF26B"]
//   npm run lot -- --configs                      liste les configurations
//   npm run lot -- --save <nom> [--style …] …     enregistre une configuration
//
// Les vidéos déjà faites (« <nom>.sous-titres.mp4 » présent dans le dossier de sortie)
// sont sautées. Sortie par défaut : <dossier>/Sous-titrées. Avec --watch, le dossier est
// surveillé et chaque nouvelle vidéo est traitée (pratique avec Google Drive pour ordinateur).
import path from "node:path";
import { parseArgs } from "node:util";
import { defaultOutputDir, runBatch, scanFolder } from "../core/batch";
import { expandHome, getConfig, listConfigs, saveConfig, type Config } from "../core/configs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: "string", default: "chenek" },
    out: { type: "string" },
    watch: { type: "boolean", default: false },
    configs: { type: "boolean", default: false },
    save: { type: "string" },
    style: { type: "string" },
    lang: { type: "string" },
    "cut-silences": { type: "boolean" },
    "no-cut-silences": { type: "boolean" },
    "min-silence": { type: "string" },
    accent: { type: "string" },
  },
});

const show = (c: Config) =>
  `${c.name.padEnd(14)} style ${c.style}, ${c.lang.toUpperCase()}, ` +
  `${c.cutSilences ? `coupe des silences > ${c.minSilenceMs} ms` : "sans coupe"}` +
  `${c.accent ? `, accent ${c.accent}` : ""}` +
  `${c.sizeScale ? `, taille ${Math.round(c.sizeScale * 100)} %` : ""}${c.position ? `, position ${Math.round(c.position * 100)} %` : ""}` +
  `${c.maxWords ? `, ${c.maxWords} mot(s)/écran` : ""}${c.outputDir ? `\n${"".padEnd(15)}sortie : ${c.outputDir}` : ""}`;

// Réglages passés en ligne de commande, par-dessus la configuration.
const cliChanges = (): Partial<Config> => ({
  ...(values.style ? { style: values.style } : {}),
  ...(values.lang ? { lang: values.lang as Config["lang"] } : {}),
  ...(values["cut-silences"] ? { cutSilences: true } : {}),
  ...(values["no-cut-silences"] ? { cutSilences: false } : {}),
  ...(values["min-silence"] ? { minSilenceMs: Number(values["min-silence"]) } : {}),
  ...(values.accent ? { accent: values.accent } : {}),
  ...(values.out ? { outputDir: values.out } : {}),
});

if (values.configs) {
  for (const c of listConfigs()) console.log(show(c));
  process.exit(0);
}

if (values.save) {
  let base: Partial<Config> = {};
  try {
    base = getConfig(values.save);
  } catch {
    // nouvelle configuration
  }
  const saved = saveConfig({ ...base, ...cliChanges(), name: values.save });
  console.log(`Configuration enregistrée :\n${show(saved)}`);
  process.exit(0);
}

const input = positionals[0];
if (!input) {
  console.error("Usage : npm run lot -- <dossier> [--config chenek] [--out <dossier>] [--watch]\n        npm run lot -- --configs");
  process.exit(1);
}

const config: Config = { ...getConfig(values.config), ...cliChanges() };
const inputDir = path.resolve(expandHome(input));
const outputDir = path.resolve(expandHome(config.outputDir ?? defaultOutputDir(inputDir)));
const name = (f: string) => path.basename(f);

console.log(`Configuration :\n${show(config)}\nDossier : ${inputDir}\nSortie  : ${outputDir}\n`);

const once = async () => {
  const batch = await runBatch({
    inputDir,
    outputDir,
    config,
    onEvent: (e) => {
      if (e.type === "start") console.log(`[${e.index}/${e.total}] ${name(e.file)} : transcription et export…`);
      if (e.type === "done") console.log(`  ✓ ${name(e.output)}`);
      if (e.type === "error") console.log(`  ✗ ${name(e.file)} : ${e.error}`);
    },
  });
  const count = (s: string) => batch.items.filter((i) => i.status === s).length;
  return { done: count("done"), skipped: count("skipped"), errors: count("error") };
};

if (!values.watch) {
  const r = await once();
  console.log(`\nTerminé : ${r.done} faite(s), ${r.skipped} déjà faite(s), ${r.errors} erreur(s).`);
  process.exit(r.errors ? 1 : 0);
}

// Surveillance : on relance un passage toutes les 30 s s'il y a du nouveau. Une vidéo
// tout juste apparue est attendue tant que sa taille change (copie ou synchro en cours).
console.log("Surveillance du dossier (Ctrl + C pour arrêter)…\n");
const sizes = new Map<string, number>();
const fs = await import("node:fs");
for (;;) {
  const pending = scanFolder(inputDir, outputDir).filter((f) => !f.done);
  const stable = pending.filter(({ file }) => {
    const size = fs.statSync(file).size;
    const was = sizes.get(file);
    sizes.set(file, size);
    return was === size && size > 0;
  });
  if (stable.length) {
    const r = await once();
    console.log(`Passage terminé : ${r.done} faite(s), ${r.errors} erreur(s). En attente de nouvelles vidéos…\n`);
  }
  await new Promise((r) => setTimeout(r, 30_000));
}
