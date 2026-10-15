import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatTime, isBusy, mediaUrl, statusLabel, type Info, type ProjectSummary } from "./api";
import { Logo, go } from "./App";

const LANGS = [
  { value: "auto", label: "Auto" },
  { value: "fr", label: "FR" },
  { value: "en", label: "EN" },
];

export const Home = () => {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => api.projects().then(setProjects).catch((e) => setError(e.message)), []);

  useEffect(() => {
    refresh();
    api.info().then(setInfo).catch(() => {});
  }, [refresh]);

  // Rafraîchit tant qu'un projet est en cours (y compris ceux lancés depuis Claude).
  useEffect(() => {
    const t = setInterval(refresh, projects?.some(isBusy) ? 1500 : 5000);
    return () => clearInterval(t);
  }, [projects, refresh]);

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
            <span className="pill mono">10 styles</span>
            <span className="pill mono">Export MP4</span>
          </div>
        </div>
        <Uploader onCreated={(id) => go(`#/p/${id}`)} />
      </section>

      {error && <p className="error-text">{error}</p>}

      <section className="projects">
        <div className="section-head">
          <span className="mono label">Projets</span>
          <span className="mono muted">{projects?.length ?? 0}</span>
        </div>
        {projects && projects.length === 0 && (
          <p className="empty">Aucun projet pour l'instant. Dépose une vidéo pour commencer.</p>
        )}
        <div className="grid">
          {projects?.map((p) => (
            <ProjectCard key={p.id} p={p} onDeleted={refresh} />
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

const Uploader = ({ onCreated }: { onCreated: (id: string) => void }) => {
  const [lang, setLang] = useState("fr");
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveBusy, setDriveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const send = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) {
      setError("Ce fichier n'est pas une vidéo.");
      return;
    }
    setProgress(0);
    try {
      const p = await api.upload(file, lang, setProgress);
      onCreated(p.id);
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  };

  const importDrive = async () => {
    setError(null);
    setDriveBusy(true);
    try {
      const p = await api.importDrive(driveUrl.trim(), lang);
      onCreated(p.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  };

  return (
    <div className="card upload-card">
      <div className="card-head">
        <span className="mono label">Nouveau projet</span>
        <div className="segmented">
          {LANGS.map((l) => (
            <button key={l.value} className={lang === l.value ? "on" : ""} onClick={() => setLang(l.value)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`dropzone ${drag ? "drag" : ""} ${progress !== null ? "sending" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) send(f);
        }}
        onClick={() => progress === null && input.current?.click()}
      >
        <input
          ref={input}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => e.target.files?.[0] && send(e.target.files[0])}
        />
        {progress === null ? (
          <>
            <div className="drop-icon">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="drop-title">
              Glisse ta vidéo <span className="thin">ici</span>
            </p>
            <p className="mono muted small">MP4 · MOV · WEBM — ou clique pour parcourir</p>
          </>
        ) : (
          <>
            <p className="drop-title">
              Envoi <span className="thin">{Math.round(progress * 100)} %</span>
            </p>
            <div className="bar">
              <div style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mono muted small">La transcription démarre juste après</p>
          </>
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

const ProjectCard = ({ p, onDeleted }: { p: ProjectSummary; onDeleted: () => void }) => {
  const busy = isBusy(p);
  return (
    <a className="project-card" href={`#/p/${p.id}`}>
      <div className="thumb">
        <img src={mediaUrl(p.id, "thumb.jpg")} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.opacity = "0")} />
        <span className={`status pill mono ${p.status}`}>
          <span className="dot" />
          {statusLabel(p)}
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
          {formatTime(p.media.durationMs)} · {p.renders.length} export{p.renders.length > 1 ? "s" : ""}
        </span>
      </div>
      <button
        className="icon-btn delete"
        title="Supprimer"
        onClick={async (e) => {
          e.preventDefault();
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
