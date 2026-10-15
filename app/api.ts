import type { Project } from "../core/projects";
import type { CaptionStyle } from "../src/styles";

export type { Project };
export type ProjectSummary = Omit<Project, "words"> & { wordCount: number };
export type StyleInfo = { name: string; label: string; custom: boolean; definition: CaptionStyle; thumb: string | null };
export type Info = {
  root: string;
  whisper: { installed: boolean; model: string; modelReady: boolean };
  mcpCommand: string;
};

const json = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erreur ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
};

const send = (method: string, url: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

export const api = {
  info: () => fetch("/api/info").then(json<Info>),
  styles: () => fetch("/api/styles").then(json<StyleInfo[]>),
  projects: () => fetch("/api/projects").then(json<ProjectSummary[]>),
  project: (id: string) => fetch(`/api/projects/${id}`).then(json<Project>),
  update: (id: string, patch: Partial<Project>) => send("PATCH", `/api/projects/${id}`, patch).then(json<Project>),
  transcribe: (id: string, lang: string) => send("POST", `/api/projects/${id}/transcribe`, { lang }).then(json<Project>),
  render: (id: string) => send("POST", `/api/projects/${id}/render`, {}).then(json<Project>),
  remove: (id: string) => send("DELETE", `/api/projects/${id}`).then(json<void>),
  createStyle: (name: string, base: string | undefined, changes: CaptionStyle) =>
    send("POST", "/api/styles", { name, base, changes }).then(json<{ id: string }>),
  updateStyle: (id: string, name: string, changes: CaptionStyle) => send("PUT", `/api/styles/${id}`, { name, changes }).then(json<{ id: string }>),
  deleteStyle: (id: string) => send("DELETE", `/api/styles/${id}`).then(json<void>),
  saveConfig: (config: Record<string, unknown>) => send("POST", "/api/configs", config).then(json<unknown>),
  importDrive: (url: string, lang: string) => send("POST", "/api/projects/drive", { url, lang }).then(json<Project>),

  // XHR plutôt que fetch : seul XHR donne la progression de l'envoi.
  upload: (file: File, lang: string, onProgress: (p: number) => void) =>
    new Promise<Project>((resolve, reject) => {
      const form = new FormData();
      form.append("lang", lang);
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/projects");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        const body = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.error ?? `Erreur ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error("Envoi interrompu"));
      xhr.send(form);
    }),
};

export const mediaUrl = (id: string, file: string) => `${location.origin}/media/${id}/${file}`;

export const isBusy = (p: { status: string }) => p.status === "transcribing" || p.status === "rendering";

export const formatTime = (ms: number) => {
  const s = Math.max(0, ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};

export const statusLabel = (p: { status: string; progress: number }) => {
  const pct = `${Math.round(p.progress * 100)} %`;
  switch (p.status) {
    case "transcribing":
      return `Transcription ${pct}`;
    case "rendering":
      return `Export ${pct}`;
    case "error":
      return "Erreur";
    case "uploaded":
      return "En attente";
    default:
      return "Prêt";
  }
};
