import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { renderStyleStill } from "./render";
import { thumbPath, type CustomStyle } from "./styles-store";

const run = promisify(execFile);

// Vignettes une par une, à part de la file des exports : elles ne doivent pas attendre
// un rendu de plusieurs minutes, ni le ralentir beaucoup (une image chacune).
let queue: Promise<unknown> = Promise.resolve();

export const makeThumb = (style: CustomStyle) => {
  const task = async () => {
    const tmp = path.join(os.tmpdir(), `clipcaption-thumb-${style.id}-${Date.now()}.jpg`);
    await renderStyleStill({ styleDef: style.definition, outPath: tmp, scale: 0.5 });
    // Même cadrage que les vignettes des préréglages : 16:9 centré sur les sous-titres.
    const top = Math.max(0, Math.min(960 - 304, Math.round(960 * style.definition.verticalPosition) - 152));
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-vf", `crop=540:304:0:${top},scale=480:-2`, "-q:v", "3", thumbPath(style.id)]);
    fs.rmSync(tmp, { force: true });
  };
  const next = queue.then(task, task);
  queue = next.catch((e) => console.error(`[vignette ${style.id}]`, e instanceof Error ? e.message : e));
  return next;
};
