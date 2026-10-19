import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatTime, isBusy, mediaUrl, statusLabel, type ConfigInfo, type Info, type ProjectSummary } from "./api";
import { Logo, go } from "./App";

const LANGS = [
  { value: "auto", label: "Auto" },
  { value: "fr", label: "FR" },
  { value: "en", label: "EN" },
];

// Préférences de la zone d'envoi, gardées d'une visite à l'autre (si le navigateur le permet).
const pref = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(`clipcaption.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
};
const setPref = (key: string, value: string) => {
  try {
    localStorage.setItem(`clipcaption.${key}`, value);
  } catch {
    /* navigation privée */
  }
};

// Nom du fichier téléchargé : le nom du projet, sans suffixe.
const fileName = (p: { name: string }) => `${p.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "video"}.mp4`;

// Chrome (File System Access) : écrit directement dans un dossier choisi une seule fois.
type DirHandle = {
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<{ createWritable: () => Promise<WritableStream> }>;
};
const pickFolder = (window as unknown as { showDirectoryPicker?: (o?: { mode?: string; id?: string }) => Promise<DirHandle> }).showDirectoryPicker;

// Ne remplace jamais un fichier déjà présent (ex. la vidéo d'origine du même nom) : « nom 2.mp4 ».
const freeName = async (dir: DirHandle, name: string) => {
  const base = name.replace(/\.mp4$/, "");
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? name : `${base} ${i}.mp4`;
    try {
      await dir.getFileHandle(candidate);
    } catch {
      return candidate;
    }
  }
};

const download = (id: string, file: string, name: string) => {
  const a = document.createElement("a");
  a.href = mediaUrl(id, file);
  a.download = name;
  a.click();
};

const isVideo = (f: File) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name);

export const Home = () => {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [configs, setConfigs] = useState<ConfigInfo[]>([]);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = useCallback(
    () =>
      api
        .projects()
        .then((list) => {
          setProjects(list);
          // Les projets supprimés (ici, par Claude ou ailleurs) sortent de la sélection.
          setSelected((s) => {
            const ids = new Set(list.map((p) => p.id));
            return [...s].every((id) => ids.has(id)) ? s : new Set([...s].filter((id) => ids.has(id)));
          });
        })
        .catch((e) => setError(e.message)),
    [],
  );

  useEffect(() => {
    refresh();
    api.info().then(setInfo).catch(() => {});
    api.configs().then(setConfigs).catch(() => {});
  }, [refresh]);

  // Rafraîchit tant qu'un projet est en cours (y compris ceux lancés depuis Claude).
  useEffect(() => {
    const t = setInterval(refresh, projects?.some(isBusy) ? 1500 : 5000);
    return () => clearInterval(t);
  }, [projects, refresh]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="home">
      <header className="topbar">
        <Logo />
        <div className="topbar-right">
          <span className="pill mono">FR · EN</span>
          <span className="pill mono">100 % local</span>
        </div>
      </header>

      {info && (!info.whisper.installed || !info.whisper.modelReady) && (
        <div className="banner">
          <span className="dot" /> Transcription pas encore installée : lance <code>npm run setup</code> dans le
          dossier du projet, puis recharge la page.
        </div>
      )}

      <section className="hero">
        <div className="hero-text">
          <h1>
            <span className="hl">Sous-titres</span> qui
            <br />
            retiennent <span className="thin">l'attention.</span>
            <svg className="scribble" viewBox="0 0 420 18" preserveAspectRatio="none" aria-hidden>
              <path d="M2 12 C 90 4, 200 16, 300 8 S 400 6, 418 10" />
            </svg>
          </h1>
          <div className="pill-row">
            <span className="pill mono">Transcription</span>
            <span className="pill mono">Coupes</span>
            <span className="pill mono">23 styles</span>
            <span className="pill mono">Export MP4</span>
          </div>
        </div>
        <Uploader configs={configs} onSingle={(id) => go(`#/p/${id}`)} onMany={refresh} />
      </section>

      {error && <p className="error-text">{error}</p>}

      <section className="projects">
        <div className="section-head">
          <span className="mono label">Projets</span>
          <span className="mono muted">{projects?.length ?? 0}</span>
          {!!projects?.length && (
            <label className="select-all">
              <input
                type="checkbox"
                checked={selected.size === projects.length}
                ref={(el) => {
                  if (el) el.indeterminate = selected.size > 0 && selected.size < projects.length;
                }}
                onChange={() => setSelected(selected.size === projects.length ? new Set() : new Set(projects.map((p) => p.id)))}
              />
              <span className="mono small">Tout sélectionner</span>
            </label>
          )}
        </div>
        {selected.size > 0 && projects && (
          <BulkBar
            ids={[...selected]}
            projects={projects}
            configs={configs}
            onDone={refresh}
            onClear={() => setSelected(new Set())}
          />
        )}
        {projects && projects.length === 0 && (
          <p className="empty">Aucun projet pour l'instant. Dépose une ou plusieurs vidéos pour commencer.</p>
        )}
        <div className="grid">
          {projects?.map((p) => (
            <ProjectCard
              key={p.id}
              p={p}
              selected={selected.has(p.id)}
              selecting={selected.size > 0}
              onToggle={() => toggle(p.id)}
              onDeleted={refresh}
            />
          ))}
        </div>
      </section>

      {info && <ClaudeCard command={info.mcpCommand} />}

      <footer className="foot">
        <Logo />
        <span className="mono muted">whisper.cpp · remotion</span>
      </footer>
    </div>
  );
};

type UploadRow = { name: string; progress: number; state: "waiting" | "sending" | "done" | "error"; error?: string };

const Uploader = ({ configs, onSingle, onMany }: { configs: ConfigInfo[]; onSingle: (id: string) => void; onMany: () => void }) => {
  const [lang, setLangState] = useState(() => pref("lang", "fr"));
  const [config, setConfigState] = useState(() => pref("config", "chenek"));
  // Désactivé par défaut : l'export ne part que si on le demande.
  const [autoExport, setAutoExportState] = useState(() => pref("autoExport", "false") === "true");
  const setLang = (v: string) => (setLangState(v), setPref("lang", v));
  const setConfig = (v: string) => (setConfigState(v), setPref("config", v));
  const setAutoExport = (v: boolean) => (setAutoExportState(v), setPref("autoExport", String(v)));
  const [drag, setDrag] = useState(false);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveBusy, setDriveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const sending = rows.some((r) => r.state === "waiting" || r.state === "sending");

  // Configuration retenue qui n'existe plus : on revient à la première. « Aucune » ("") reste un choix valable.
  useEffect(() => {
    if (config && configs.length && !configs.some((c) => c.name === config)) setConfigState(configs[0].name);
  }, [configs, config]);

  // Envoi une par une : chaque vidéo devient un projet, transcrit (et exporté si coché).
  const send = async (list: File[]) => {
    setError(null);
    const files = list.filter(isVideo);
    if (!files.length) {
      setError("Aucune vidéo dans la sélection.");
      return;
    }
    setRows(files.map((f) => ({ name: f.name, progress: 0, state: "waiting" })));
    const update = (i: number, r: Partial<UploadRow>) => setRows((rs) => rs.map((row, j) => (j === i ? { ...row, ...r } : row)));
    let lastId = "";
    for (let i = 0; i < files.length; i++) {
      update(i, { state: "sending" });
      try {
        const p = await api.upload(files[i], lang, (progress) => update(i, { progress }), { config, autoExport });
        lastId = p.id;
        update(i, { state: "done", progress: 1 });
        onMany();
      } catch (e) {
        update(i, { state: "error", error: (e as Error).message });
      }
    }
    // Une seule vidéo sans export automatique : on ouvre directement l'éditeur.
    if (files.length === 1 && lastId && !autoExport) onSingle(lastId);
    else setTimeout(() => setRows([]), 2500);
  };

  const importDrive = async () => {
    setError(null);
    setDriveBusy(true);
    try {
      const p = await api.importDrive(driveUrl.trim(), lang, { config, autoExport });
      setDriveUrl("");
      if (autoExport) onMany();
      else onSingle(p.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  };

  return (
    <div className="card upload-card">
      <div className="card-head">
        <span className="mono label">Nouveaux projets</span>
        <div className="segmented">
          {LANGS.map((l) => (
            <button key={l.value} className={lang === l.value ? "on" : ""} onClick={() => setLang(l.value)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="upload-options">
        <label className="d-row">
          <span className="mono label small">Configuration</span>
          <select className="field select small-field" value={config} onChange={(e) => setConfig(e.target.value)}>
            {configs.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} · {c.style}
              </option>
            ))}
            <option value="">Aucune (réglages par défaut)</option>
          </select>
        </label>
        <label className="toggle d-toggle">
          <input type="checkbox" checked={autoExport} onChange={(e) => setAutoExport(e.target.checked)} />
          <span className="switch" />
          <span>Exporter automatiquement après la transcription</span>
        </label>
      </div>

      <div
        className={`dropzone ${drag ? "drag" : ""} ${sending ? "sending" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!sending) send([...e.dataTransfer.files]);
        }}
        onClick={() => !sending && input.current?.click()}
      >
        <input
          ref={input}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) send([...e.target.files]);
            e.target.value = "";
          }}
        />
        {rows.length === 0 ? (
          <>
            <div className="drop-icon">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="drop-title">
              Glisse tes vidéos <span className="thin">ici</span>
            </p>
            <p className="mono muted small">Une ou plusieurs · MP4 · MOV · WEBM — ou clique pour parcourir</p>
          </>
        ) : (
          <ul className="upload-list">
            {rows.map((r, i) => (
              <li key={i}>
                <span className="upload-name">{r.name}</span>
                <span className="mono small muted">
                  {r.state === "waiting" ? "en attente" : r.state === "sending" ? `${Math.round(r.progress * 100)} %` : r.state === "done" ? "envoyée ✓" : "erreur"}
                </span>
                <div className="bar">
                  <div style={{ width: `${(r.state === "done" ? 1 : r.progress) * 100}%` }} />
                </div>
                {r.error && <span className="error-text small">{r.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="drive">
        <span className="mono label small">Google Drive</span>
        <div className="drive-row">
          <input
            className="field"
            placeholder="Colle le lien de partage du fichier"
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && driveUrl && importDrive()}
          />
          <button className="btn" disabled={!driveUrl || driveBusy} onClick={importDrive}>
            {driveBusy ? "Import…" : "Importer"}
          </button>
        </div>
        <p className="muted small">Partage réglé sur « Tous les utilisateurs disposant du lien ».</p>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
};

// Barre d'actions sur les projets sélectionnés.
const BulkBar = ({
  ids,
  projects,
  configs,
  onDone,
  onClear,
}: {
  ids: string[];
  projects: ProjectSummary[];
  configs: ConfigInfo[];
  onDone: () => void;
  onClear: () => void;
}) => {
  const [config, setConfig] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const chosen = projects.filter((p) => ids.includes(p.id));
  const withExport = chosen.filter((p) => p.renders.length > 0);

  const run = async (action?: "export" | "delete") => {
    if (action === "delete" && !confirm(`Supprimer ${ids.length > 1 ? `ces ${ids.length} projets` : "ce projet"} et leurs exports ? Les copies déjà enregistrées dans tes dossiers de sortie sont gardées.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.bulk(ids, { action, config: config || undefined });
      const errors = res.filter((r) => r.error);
      const later = res.filter((r) => r.queued).length;
      if (action === "delete" && !errors.length) {
        onClear();
        onDone();
        return;
      }
      setMessage(
        errors.length
          ? `${errors.length} erreur(s) : ${errors[0].error}`
          : action === "export"
            ? `${res.length - later} export(s) lancé(s)${later ? `, ${later} après leur transcription` : ""}.`
            : `Configuration « ${config} » appliquée.`,
      );
      onDone();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Dernier export de chaque projet. Dans Chrome : un seul choix de dossier, puis tous les
  // fichiers y sont écrits sans autre confirmation. Ailleurs : téléchargements classiques.
  const downloadAll = async () => {
    if (!pickFolder) {
      withExport.forEach((p, i) => setTimeout(() => download(p.id, p.renders[0].file, fileName(p)), i * 400));
      return;
    }
    let dir: DirHandle;
    try {
      dir = await pickFolder.call(window, { mode: "readwrite", id: "clipcaption-exports" });
    } catch {
      return; // choix du dossier annulé
    }
    setBusy(true);
    let done = 0;
    const failed: string[] = [];
    for (const p of withExport) {
      setMessage(`Téléchargement ${done + 1}/${withExport.length} : ${p.name}`);
      try {
        const res = await fetch(mediaUrl(p.id, p.renders[0].file));
        if (!res.ok || !res.body) throw new Error(`Erreur ${res.status}`);
        const file = await dir.getFileHandle(await freeName(dir, fileName(p)), { create: true });
        await res.body.pipeTo(await file.createWritable());
        done++;
      } catch {
        failed.push(p.name);
      }
    }
    setBusy(false);
    setMessage(failed.length ? `${done} téléchargé(s), échec : ${failed.join(", ")}` : `${done} vidéo(s) enregistrée(s) dans le dossier choisi.`);
  };

  return (
    <div className="bulk-bar card">
      <span className="mono label small">
        {ids.length} sélectionné{ids.length > 1 ? "s" : ""}
      </span>
      <select className="field select small-field" value={config} onChange={(e) => setConfig(e.target.value)}>
        <option value="">Garder leurs réglages</option>
        {configs.map((c) => (
          <option key={c.name} value={c.name}>
            Appliquer : {c.name} · {c.style}
          </option>
        ))}
      </select>
      {config && (
        <button className="btn small" disabled={busy} onClick={() => run()}>
          Appliquer
        </button>
      )}
      <button className="btn primary small" disabled={busy} onClick={() => run("export")}>
        Exporter {ids.length > 1 ? `les ${ids.length}` : ""}
      </button>
      <button
        className="btn small"
        disabled={busy || !withExport.length}
        onClick={downloadAll}
        title={pickFolder ? "Choisis un dossier : tous les derniers exports y sont enregistrés d'un coup" : "Dernier export de chaque projet"}
      >
        Télécharger ({withExport.length})
      </button>
      <button className="btn small danger" disabled={busy} onClick={() => run("delete")}>
        Supprimer
      </button>
      <button className="chip ghost" onClick={onClear} title="Annuler la sélection">
        ✕
      </button>
      {message && <p className="muted small bulk-msg">{message}</p>}
    </div>
  );
};

const ProjectCard = ({
  p,
  selected,
  selecting,
  onToggle,
  onDeleted,
}: {
  p: ProjectSummary;
  selected: boolean;
  selecting: boolean;
  onToggle: () => void;
  onDeleted: () => void;
}) => {
  const busy = isBusy(p);
  const last = p.renders[0];
  return (
    <a
      className={`project-card ${selected ? "selected" : ""}`}
      href={`#/p/${p.id}`}
      // Pendant une sélection, un clic sur la carte la (dé)sélectionne au lieu de l'ouvrir.
      onClick={(e) => {
        if (!selecting) return;
        e.preventDefault();
        onToggle();
      }}
    >
      <div className="thumb">
        <img src={mediaUrl(p.id, "thumb.jpg")} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.opacity = "0")} />
        <button
          className={`select-box ${selected ? "on" : ""}`}
          title="Sélectionner"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
          }}
        >
          {selected ? "✓" : ""}
        </button>
        <span className={`status pill mono ${p.status}`}>
          <span className="dot" />
          {p.status === "ready" && last ? "Exporté" : p.status === "ready" && p.autoExport ? "En file" : statusLabel(p)}
        </span>
        {busy && (
          <div className="thumb-bar">
            <div style={{ width: `${p.progress * 100}%` }} />
          </div>
        )}
      </div>
      <div className="project-meta">
        <span className="project-name">{p.name}</span>
        <span className="mono muted small">
          {formatTime(p.media.durationMs)} · {p.style}
          {p.renders.length ? ` · ${p.renders.length} export${p.renders.length > 1 ? "s" : ""}` : ""}
        </span>
      </div>
      {last && (
        // Bouton (pas un lien) : un <a> dans la carte, elle-même un lien, serait invalide.
        <button
          className="icon-btn download"
          title="Télécharger le dernier export"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            download(p.id, last.file, fileName(p));
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <button
        className="icon-btn delete"
        title="Supprimer"
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (confirm(`Supprimer « ${p.name} » et ses exports ?`)) {
            await api.remove(p.id);
            onDeleted();
          }
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" strokeLinecap="round" />
        </svg>
      </button>
    </a>
  );
};

const ClaudeCard = ({ command }: { command: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <section className="card claude-card">
      <div>
        <span className="mono label">Claude · MCP</span>
        <h2>
          Demande tes sous-titres <span className="thin">à Claude.</span>
        </h2>
        <p className="muted">
          Une fois branché, Claude peut sous-titrer, couper et exporter tes vidéos avec cet outil. Les projets créés par
          Claude apparaissent ici.
        </p>
      </div>
      <div className="command">
        <code>{command}</code>
        <button
          className="btn"
          onClick={() => {
            navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
    </section>
  );
};
