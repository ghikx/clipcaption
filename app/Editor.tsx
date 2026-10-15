import { Player, type PlayerRef } from "@remotion/player";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaptionedVideo, type CaptionedVideoProps } from "../src/CaptionedVideo";
import { buildEdit, type EditSettings } from "../src/edit";
import { toOutputMs, type Segment } from "../src/segments";
import { STYLES, type CaptionStyle, type StyleName, type StyleOverrides } from "../src/styles";
import { StyleDesigner } from "./StyleDesigner";
import type { Word } from "../src/words";
import { api, formatTime, isBusy, mediaUrl, statusLabel, type Project, type StyleInfo } from "./api";
import { Logo } from "./App";

type Tab = "style" | "montage" | "export";
type SaveState = "saved" | "saving" | "error";

const ACCENTS = ["#EEF26B", "#FFFFFF", "#7B2FF7", "#22D3EE", "#FF3D7F", "#4ADE80", "#FB923C"];

// Instant de la vidéo source correspondant à un instant de la vidéo montée.
const toSourceMs = (segments: Segment[] | null, outMs: number) => {
  if (!segments) return outMs;
  let offset = 0;
  for (const s of segments) {
    const len = s.toMs - s.fromMs;
    if (outMs < offset + len) return s.fromMs + (outMs - offset);
    offset += len;
  }
  return segments.length ? segments[segments.length - 1].toMs : 0;
};

// Index du mot prononcé à un instant source (recherche dichotomique).
const wordAt = (words: Word[], ms: number) => {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].startMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 && ms <= words[found].endMs + 250 ? found : -1;
};

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
};

export const Editor = ({ id }: { id: string }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [words, setWords] = useState<Word[] | null>(null);
  const [past, setPast] = useState<Word[][]>([]);
  const [future, setFuture] = useState<Word[][]>([]);
  const [style, setStyle] = useState<StyleName>("chenek");
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  // Designer ouvert : style en cours d'édition (id si style perso existant).
  const [designer, setDesigner] = useState<{ id?: string; base?: string; name: string; draft: CaptionStyle } | null>(null);
  const [designerSaving, setDesignerSaving] = useState(false);
  const [designerError, setDesignerError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<StyleOverrides>({});
  const [settings, setSettings] = useState<EditSettings>({ cutSilences: false, minSilenceMs: 500 });
  const [name, setName] = useState("");
  const [tab, setTab] = useState<Tab>("style");
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const player = useRef<PlayerRef>(null);
  const dirty = useRef(false);
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  // Chargement initial, puis suivi tant qu'un traitement tourne.
  const applyServer = useCallback((p: Project, initial: boolean) => {
    setProject(p);
    setWords((current) => {
      // Les mots du serveur remplacent les mots locaux seulement s'ils viennent d'une
      // (nouvelle) transcription : sinon on écraserait les modifications en cours.
      if (initial || !current || !p.words || p.words.length !== current.length) return p.words;
      return current;
    });
    if (initial) {
      setStyle(p.style);
      setOverrides(p.overrides ?? {});
      setSettings(p.settings);
      setName(p.name);
    }
  }, []);

  useEffect(() => {
    api.project(id).then((p) => applyServer(p, true), (e) => setLoadError(e.message));
  }, [id, applyServer]);

  const loadStyles = useCallback(() => api.styles().then(setStyles).catch(() => {}), []);
  useEffect(() => {
    loadStyles();
  }, [loadStyles]);
  // Les vignettes des styles perso sont rendues après l'enregistrement : on les recharge.
  useEffect(() => {
    if (!styles.some((s) => s.custom && !s.thumb)) return;
    const t = setTimeout(loadStyles, 2500);
    return () => clearTimeout(t);
  }, [styles, loadStyles]);

  const busy = project ? isBusy(project) : false;
  const waitingPreview = project ? !project.preview : false;
  useEffect(() => {
    if (!busy && !waitingPreview) return;
    const t = setInterval(() => api.project(id).then((p) => applyServer(p, false)).catch(() => {}), 1000);
    return () => clearInterval(t);
  }, [busy, waitingPreview, id, applyServer]);

  // Sauvegarde automatique, 600 ms après la dernière modification.
  const save = useCallback(() => {
    if (!dirty.current) return saving.current;
    dirty.current = false;
    setSaveState("saving");
    saving.current = api
      .update(id, { name, style, overrides, settings, ...(words ? { words } : {}) })
      .then((p) => {
        setProject((cur) => (cur ? { ...cur, renders: p.renders, updatedAt: p.updatedAt } : p));
        setSaveState(dirty.current ? "saving" : "saved");
      })
      .catch(() => setSaveState("error"));
    return saving.current;
  }, [id, name, style, overrides, settings, words]);

  const markDirty = () => {
    dirty.current = true;
    setSaveState("saving");
  };
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(save, 600);
    return () => clearTimeout(t);
  }, [save]);

  // Modifications des mots avec historique (annuler / rétablir).
  const changeWords = useCallback((f: (w: Word[]) => Word[]) => {
    setWords((cur) => {
      if (!cur) return cur;
      const next = f(cur);
      setPast((p) => [...p.slice(-99), cur]);
      setFuture([]);
      return next;
    });
    markDirty();
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      setWords((cur) => {
        if (cur) setFuture((f) => [cur, ...f]);
        return p[p.length - 1];
      });
      return p.slice(0, -1);
    });
    markDirty();
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setWords((cur) => {
        if (cur) setPast((p) => [...p, cur]);
        return f[0];
      });
      return f.slice(1);
    });
    markDirty();
  }, []);

  const media = project?.media;
  const edit = useMemo(() => {
    if (!media) return null;
    if (!words) {
      return { captions: [], segments: null, durationInFrames: Math.max(1, Math.floor((media.durationMs / 1000) * media.fps)) };
    }
    return buildEdit(words, settings, media.durationMs, media.fps);
  }, [words, settings, media]);

  const currentStyle = styles.find((s) => s.name === style);
  const currentDef: CaptionStyle = currentStyle?.definition ?? (STYLES as Record<string, CaptionStyle>)[style] ?? STYLES.chenek;
  // Pendant le design, l'aperçu montre le brouillon tel quel (sans ajustements rapides).
  const previewDef = designer?.draft ?? currentDef;

  const inputProps = useMemo<CaptionedVideoProps | null>(() => {
    if (!project || !edit) return null;
    return {
      // Tant que le proxy n'est pas prêt, aperçu des sous-titres sur fond neutre.
      videoSrc: project.preview ? mediaUrl(project.id, project.preview) : "",
      captions: words ?? [],
      segments: edit.segments,
      style,
      styleDef: previewDef,
      overrides: designer ? undefined : overrides,
      width: project.media.width,
      height: project.media.height,
      fps: project.media.fps,
      durationInFrames: edit.durationInFrames,
    };
    // project.source/media ne changent pas après le chargement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.preview, edit, words, style, overrides, previewDef, designer]);

  const pickStyle = (name: string) => {
    setStyle(name);
    markDirty();
  };

  const saveDesign = async () => {
    if (!designer) return;
    setDesignerSaving(true);
    setDesignerError(null);
    try {
      const saved = designer.id
        ? await api.updateStyle(designer.id, designer.name, designer.draft)
        : await api.createStyle(designer.name, designer.base, designer.draft);
      await loadStyles();
      pickStyle(saved.id);
      setDesigner(null);
    } catch (e) {
      setDesignerError((e as Error).message);
    } finally {
      setDesignerSaving(false);
    }
  };

  const removeStyle = async (sid: string) => {
    if (!confirm("Supprimer ce style ? Les projets qui l'utilisent repasseront sur chenek.")) return;
    await api.deleteStyle(sid);
    if (style === sid) pickStyle("chenek");
    setDesigner(null);
    loadStyles();
  };

  // Mot prononcé : mis à jour seulement quand il change, pas à chaque frame.
  useEffect(() => {
    const p = player.current;
    if (!p || !words || !media || !edit) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      const src = toSourceMs(edit.segments, (e.detail.frame / media.fps) * 1000);
      const i = wordAt(words, src);
      setActiveIndex((cur) => (cur === i ? cur : i));
    };
    p.addEventListener("frameupdate", onFrame);
    return () => p.removeEventListener("frameupdate", onFrame);
  }, [words, media, edit, inputProps]);

  const seekSource = useCallback(
    (ms: number) => {
      if (!media || !edit) return;
      const out = edit.segments ? toOutputMs(edit.segments, ms) : ms;
      player.current?.seekTo(Math.max(0, Math.min(edit.durationInFrames - 1, Math.round((out / 1000) * media.fps))));
    },
    [media, edit],
  );

  const range = selection ? ([Math.min(...selection), Math.max(...selection)] as const) : null;
  const toggleCut = useCallback(() => {
    if (!range || !words) return;
    const allCut = words.slice(range[0], range[1] + 1).every((w) => w.cut);
    changeWords((ws) => ws.map((w, i) => (i >= range[0] && i <= range[1] ? { ...w, cut: !allCut } : w)));
  }, [range, words, changeWords]);
  const toggleEmphasis = useCallback(() => {
    if (!range || !words) return;
    const all = words.slice(range[0], range[1] + 1).every((w) => w.emphasis);
    changeWords((ws) => ws.map((w, i) => (i >= range[0] && i <= range[1] ? { ...w, emphasis: !all } : w)));
  }, [range, words, changeWords]);
  const editText = useCallback(
    (i: number, text: string) =>
      changeWords((ws) => ws.map((w, j) => (j === i ? { ...w, text: (i === 0 ? "" : " ") + text.trim() } : w))),
    [changeWords],
  );

  // Raccourcis clavier de l'éditeur.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === " ") {
        e.preventDefault();
        player.current?.toggle();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        toggleCut();
      } else if (e.key.toLowerCase() === "e" && !mod) {
        toggleEmphasis();
      } else if (e.key === "Escape") {
        setSelection(null);
      } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && words) {
        e.preventDefault();
        const from = range ? (e.key === "ArrowRight" ? range[1] : range[0]) : Math.max(0, activeIndex);
        const i = Math.max(0, Math.min(words.length - 1, from + (e.key === "ArrowRight" ? 1 : -1)));
        setSelection([i, i]);
        seekSource(words[i].startMs);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [undo, redo, toggleCut, toggleEmphasis, words, range, activeIndex, seekSource]);

  const exportNow = async () => {
    setTab("export");
    await save();
    await saving.current;
    try {
      setProject(await api.render(id));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (loadError) {
    return (
      <div className="editor-empty">
        <Logo />
        <p className="error-text">{loadError}</p>
        <a className="btn" href="#/">
          Retour aux projets
        </a>
      </div>
    );
  }
  if (!project || !inputProps || !edit) return <div className="editor-empty mono muted">Chargement…</div>;

  const vertical = project.media.height >= project.media.width;
  const setOv = (o: Partial<StyleOverrides>) => {
    setOverrides((cur) => ({ ...cur, ...o }));
    markDirty();
  };

  return (
    <div className="editor">
      <header className="topbar editor-top">
        <div className="topbar-left">
          <Logo />
          <a className="back mono" href="#/">
            ← Projets
          </a>
          <input
            className="name-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              markDirty();
            }}
          />
        </div>
        <div className="topbar-right">
          <span className={`pill mono save ${busy ? project.status : saveState}`}>
            <span className="dot" />
            {busy ? statusLabel(project) : saveState === "saving" ? "Sauvegarde…" : saveState === "error" ? "Non sauvegardé" : "Sauvegardé"}
          </span>
          <button className="btn primary" disabled={!words || busy} onClick={exportNow}>
            Exporter
          </button>
        </div>
      </header>

      {project.status === "error" && project.message && (
        <div className="banner error">
          <span className="dot" /> {project.message}
          {!words && (
            <button className="btn small" onClick={async () => setProject(await api.transcribe(id, project.lang))}>
              Relancer
            </button>
          )}
        </div>
      )}

      <div className="editor-grid">
        <section className="stage">
          <div className={`player-frame ${vertical ? "vertical" : "horizontal"}`}>
            {!project.preview && <span className="pill mono preview-wait">Aperçu vidéo en préparation…</span>}
            <Player
              key={inputProps.videoSrc}
              ref={player}
              component={CaptionedVideo}
              inputProps={inputProps}
              durationInFrames={inputProps.durationInFrames}
              compositionWidth={inputProps.width}
              compositionHeight={inputProps.height}
              fps={inputProps.fps}
              controls
              clickToPlay
              acknowledgeRemotionLicense
              errorFallback={() => (
                <div className="player-error">
                  <p className="mono small">Aperçu en préparation…</p>
                </div>
              )}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
          <Timeline
            player={player}
            playerKey={inputProps.videoSrc}
            segments={edit.segments}
            totalMs={project.media.durationMs}
            fps={project.media.fps}
            outFrames={edit.durationInFrames}
            onSeek={seekSource}
          />
        </section>

        <section className="transcript-panel card">
          <div className="panel-head">
            <span className="mono label">Transcription</span>
            {words && (
              <div className="toolbar">
                {range ? (
                  <>
                    <span className="mono muted small">
                      {range[1] - range[0] + 1} mot{range[1] > range[0] ? "s" : ""}
                    </span>
                    <button className="chip" onClick={toggleCut}>
                      {words.slice(range[0], range[1] + 1).every((w) => w.cut) ? "Restaurer" : "Couper"} <kbd>⌫</kbd>
                    </button>
                    <button className="chip" onClick={toggleEmphasis}>
                      Mettre en avant <kbd>E</kbd>
                    </button>
                    <button className="chip ghost" onClick={() => setSelection(null)}>
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <button className="chip ghost" disabled={!past.length} onClick={undo} title="Annuler (⌘Z)">
                      ↶
                    </button>
                    <button className="chip ghost" disabled={!future.length} onClick={redo} title="Rétablir (⇧⌘Z)">
                      ↷
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {words ? (
            <>
              <Transcript
                words={words}
                activeIndex={activeIndex}
                selection={range}
                onSelect={setSelection}
                onSeek={seekSource}
                onEditText={editText}
              />
              <p className="hint mono muted small">
                Clic : aller au mot · glisser : sélectionner · double-clic : corriger · ⌫ couper · E mettre en avant · espace
                lecture
              </p>
            </>
          ) : (
            <TranscribingCard project={project} />
          )}
        </section>

        <aside className={`inspector card ${designer ? "designing" : ""}`}>
          <div className="tabs">
            {(["style", "montage", "export"] as Tab[]).map((t) => (
              <button key={t} className={`pill mono ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
                {t === "style" ? "Style" : t === "montage" ? "Montage" : "Export"}
              </button>
            ))}
          </div>

          {tab === "style" && designer && (
            <StyleDesigner
              draft={designer.draft}
              onChange={(d) => setDesigner({ ...designer, draft: d })}
              name={designer.name}
              onName={(n) => setDesigner({ ...designer, name: n })}
              editing={!!designer.id}
              saving={designerSaving}
              error={designerError}
              onCancel={() => setDesigner(null)}
              onSave={saveDesign}
              onDelete={designer.id ? () => removeStyle(designer.id!) : undefined}
            />
          )}

          {tab === "style" && !designer && (
            <div className="tab-body">
              <button
                className="btn primary wide design-btn"
                onClick={() => {
                  setDesignerError(null);
                  setDesigner({ name: `${currentStyle?.label.split(" :")[0] ?? "Mon"} perso`, base: style, draft: { ...currentDef } });
                }}
              >
                + Créer un style
              </button>
              {styles.some((s) => s.custom) && <span className="mono label small">Mes styles</span>}
              <div className="style-grid">
                {styles
                  .filter((s) => s.custom)
                  .map((s) => (
                    <StyleCard
                      key={s.name}
                      s={s}
                      on={style === s.name}
                      onPick={() => pickStyle(s.name)}
                      onEdit={() => {
                        setDesignerError(null);
                        setDesigner({ id: s.name, name: s.label, draft: { ...s.definition } });
                      }}
                    />
                  ))}
              </div>
              <span className="mono label small">Préréglages · {styles.filter((s) => !s.custom).length}</span>
              <div className="style-grid">
                {styles
                  .filter((s) => !s.custom)
                  .map((s) => (
                    <StyleCard key={s.name} s={s} on={style === s.name} onPick={() => pickStyle(s.name)} />
                  ))}
              </div>
              <p className="muted small style-desc">{currentStyle?.custom ? currentStyle.label : currentDef.label}</p>

              <div className="divider" />
              <span className="mono label">Ajustements rapides</span>
              <div className="field-group">
                <span className="mono label small">Accent</span>
                <div className="swatches">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      className={`swatch ${overrides.accent === c ? "on" : ""}`}
                      style={{ background: c }}
                      onClick={() => setOv({ accent: c })}
                      title={c}
                    />
                  ))}
                  <label className="swatch custom" title="Couleur libre">
                    <input type="color" value={overrides.accent ?? "#EEF26B"} onChange={(e) => setOv({ accent: e.target.value })} />
                  </label>
                </div>
              </div>

              <Slider label="Taille" value={overrides.sizeScale ?? 1} min={0.6} max={1.6} step={0.05} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setOv({ sizeScale: v })} />
              <Slider label="Position" value={overrides.position ?? currentDef.verticalPosition} min={0.12} max={0.9} step={0.01} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setOv({ position: v })} />
              <Slider label="Mots par écran" value={overrides.maxWords ?? currentDef.maxWords} min={1} max={8} step={1} format={(v) => String(v)} onChange={(v) => setOv({ maxWords: v })} />

              <div className="field-group row">
                <span className="mono label small">Majuscules</span>
                <div className="segmented">
                  {[
                    { v: undefined, l: "Style" },
                    { v: true, l: "Oui" },
                    { v: false, l: "Non" },
                  ].map((o) => (
                    <button key={o.l} className={overrides.uppercase === o.v ? "on" : ""} onClick={() => setOv({ uppercase: o.v })}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="btn ghost small"
                onClick={() => {
                  setOverrides({});
                  markDirty();
                }}
              >
                Réinitialiser les ajustements
              </button>
            </div>
          )}

          {tab === "montage" && (
            <MontageTab
              project={project}
              settings={settings}
              edit={edit}
              words={words}
              onSettings={(s) => {
                setSettings(s);
                markDirty();
              }}
              onRetranscribe={async (lang) => {
                await save();
                setProject(await api.transcribe(id, lang));
                setWords(null);
                setPast([]);
                setFuture([]);
              }}
            />
          )}

          {tab === "export" && <ExportTab project={project} canExport={!!words && !busy} onExport={exportNow} outMs={(edit.durationInFrames / project.media.fps) * 1000} />}
        </aside>
      </div>
    </div>
  );
};

const StyleCard = ({ s, on, onPick, onEdit }: { s: StyleInfo; on: boolean; onPick: () => void; onEdit?: () => void }) => (
  <div className={`style-card ${on ? "on" : ""}`} onClick={onPick} role="button" tabIndex={0}>
    {s.thumb ? <img src={s.thumb} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <div className="thumb-wait mono small">Aperçu…</div>}
    <span className="mono">{s.custom ? s.label : s.name}</span>
    {onEdit && (
      <button
        className="style-edit"
        title="Modifier"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        ✎
      </button>
    )}
  </div>
);

const Slider = ({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) => (
  <div className="field-group">
    <div className="slider-head">
      <span className="mono label small">{label}</span>
      <span className="mono small">{format(value)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </div>
);

// Transcription interactive : un span par mot, paragraphes aux pauses longues.
const Transcript = memo(
  ({
    words,
    activeIndex,
    selection,
    onSelect,
    onSeek,
    onEditText,
  }: {
    words: Word[];
    activeIndex: number;
    selection: readonly [number, number] | null;
    onSelect: (s: [number, number] | null) => void;
    onSeek: (ms: number) => void;
    onEditText: (i: number, text: string) => void;
  }) => {
    const anchor = useRef<number | null>(null);
    const [editing, setEditing] = useState<number | null>(null);
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const up = () => (anchor.current = null);
      addEventListener("mouseup", up);
      return () => removeEventListener("mouseup", up);
    }, []);

    // Garde le mot prononcé visible pendant la lecture.
    useEffect(() => {
      if (activeIndex < 0 || anchor.current !== null) return;
      const el = container.current?.querySelector<HTMLElement>(`[data-i="${activeIndex}"]`);
      const box = container.current;
      if (!el || !box) return;
      const top = el.offsetTop - box.offsetTop;
      if (top < box.scrollTop + 40 || top > box.scrollTop + box.clientHeight - 60) {
        box.scrollTo({ top: top - box.clientHeight / 3, behavior: "smooth" });
      }
    }, [activeIndex]);

    return (
      <div className="transcript" ref={container}>
        {words.map((w, i) => {
          const breakBefore = i > 0 && w.startMs - words[i - 1].endMs > 1200;
          const selected = selection && i >= selection[0] && i <= selection[1];
          const cls = ["w", w.cut && "cut", w.emphasis && "em", i === activeIndex && "active", selected && "sel"].filter(Boolean).join(" ");
          return (
            <span key={i}>
              {breakBefore && <span className="para" />}
              {editing === i ? (
                <input
                  className="w-edit"
                  autoFocus
                  defaultValue={w.text.trim()}
                  size={Math.max(3, w.text.trim().length + 1)}
                  onBlur={(e) => {
                    if (e.target.value.trim()) onEditText(i, e.target.value);
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <span
                  data-i={i}
                  className={cls}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (e.shiftKey && selection) {
                      onSelect([Math.min(selection[0], i), Math.max(selection[1], i)]);
                      return;
                    }
                    anchor.current = i;
                    onSelect([i, i]);
                    onSeek(w.startMs);
                  }}
                  onMouseEnter={() => anchor.current !== null && onSelect([anchor.current, i])}
                  onDoubleClick={() => setEditing(i)}
                >
                  {w.text.trim()}
                </span>
              )}{" "}
            </span>
          );
        })}
      </div>
    );
  },
);

const TranscribingCard = ({ project }: { project: Project }) => (
  <div className="transcribing">
    {project.status === "transcribing" || project.status === "uploaded" ? (
      <>
        <p className="big">
          Transcription <span className="thin">en cours</span>
        </p>
        <div className="bar">
          <div style={{ width: `${project.progress * 100}%` }} />
        </div>
        <p className="mono muted small">{Math.round(project.progress * 100)} % · tu peux déjà choisir ton style</p>
      </>
    ) : (
      <p className="muted">Pas de transcription.</p>
    )}
  </div>
);

// Barre de montage : la vidéo source entière, passages gardés en clair, coupes hachurées.
const Timeline = ({
  player,
  playerKey,
  segments,
  totalMs,
  fps,
  outFrames,
  onSeek,
}: {
  player: React.RefObject<PlayerRef | null>;
  // Change quand le lecteur est recréé : il faut alors se réabonner.
  playerKey: string;
  segments: Segment[] | null;
  totalMs: number;
  fps: number;
  outFrames: number;
  onSeek: (ms: number) => void;
}) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener("frameupdate", onFrame);
    return () => p.removeEventListener("frameupdate", onFrame);
  }, [player, playerKey, segments]);
  const outMs = (frame / fps) * 1000;
  const srcMs = toSourceMs(segments, outMs);
  const pct = (ms: number) => `${(ms / Math.max(1, totalMs)) * 100}%`;
  return (
    <div className="timeline">
      <div
        className="track"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - r.left) / r.width) * totalMs);
        }}
      >
        {(segments ?? [{ fromMs: 0, toMs: totalMs }]).map((s, i) => (
          <div key={i} className="kept" style={{ left: pct(s.fromMs), width: pct(s.toMs - s.fromMs) }} />
        ))}
        <div className="playhead" style={{ left: pct(srcMs) }} />
      </div>
      <div className="timeline-meta mono small">
        <span>{formatTime(outMs)}</span>
        <span className="muted">
          {segments ? `${segments.length} plan${segments.length > 1 ? "s" : ""} · ` : ""}
          {formatTime((outFrames / fps) * 1000)}
        </span>
      </div>
    </div>
  );
};

const MontageTab = ({
  project,
  settings,
  edit,
  words,
  onSettings,
  onRetranscribe,
}: {
  project: Project;
  settings: EditSettings;
  edit: { segments: Segment[] | null; durationInFrames: number };
  words: Word[] | null;
  onSettings: (s: EditSettings) => void;
  onRetranscribe: (lang: string) => void;
}) => {
  const [lang, setLang] = useState<string>(project.lang);
  const outMs = (edit.durationInFrames / project.media.fps) * 1000;
  const removed = project.media.durationMs - outMs;
  const cutWords = words?.filter((w) => w.cut).length ?? 0;
  return (
    <div className="tab-body">
      <div className="stats">
        <div>
          <span className="mono label small">Original</span>
          <span className="stat">{formatTime(project.media.durationMs)}</span>
        </div>
        <div>
          <span className="mono label small">Final</span>
          <span className="stat accent">{formatTime(outMs)}</span>
        </div>
        <div>
          <span className="mono label small">Retiré</span>
          <span className="stat">{Math.max(0, Math.round((removed / project.media.durationMs) * 100))} %</span>
        </div>
      </div>

      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.cutSilences}
          onChange={(e) => onSettings({ ...settings, cutSilences: e.target.checked })}
        />
        <span className="switch" />
        <span>
          Couper les silences
          <span className="muted small block">Jump cuts automatiques entre les mots</span>
        </span>
      </label>

      <div className={`field-group ${settings.cutSilences ? "" : "disabled"}`}>
        <div className="slider-head">
          <span className="mono label small">Silence minimum</span>
          <span className="mono small">{settings.minSilenceMs} ms</span>
        </div>
        <input
          type="range"
          min={200}
          max={1500}
          step={50}
          value={settings.minSilenceMs}
          disabled={!settings.cutSilences}
          onChange={(e) => onSettings({ ...settings, minSilenceMs: Number(e.target.value) })}
        />
        <div className="range-legend mono small muted">
          <span>Nerveux</span>
          <span>Posé</span>
        </div>
      </div>

      <p className="muted small">
        {cutWords > 0
          ? `${cutWords} mot${cutWords > 1 ? "s" : ""} coupé${cutWords > 1 ? "s" : ""} à la main dans la transcription.`
          : "Pour couper un passage : sélectionne ses mots dans la transcription et appuie sur ⌫."}
      </p>

      <div className="divider" />
      <div className="field-group">
        <span className="mono label small">Langue de la transcription</span>
        <div className="row-gap">
          <div className="segmented">
            {["auto", "fr", "en"].map((l) => (
              <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
                {l === "auto" ? "Auto" : l.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            className="btn small"
            disabled={isBusy(project)}
            onClick={() => {
              if (!words || confirm("Retranscrire efface tes corrections et tes coupes. Continuer ?")) onRetranscribe(lang);
            }}
          >
            Retranscrire
          </button>
        </div>
      </div>
    </div>
  );
};

const ExportTab = ({
  project,
  canExport,
  onExport,
  outMs,
}: {
  project: Project;
  canExport: boolean;
  onExport: () => void;
  outMs: number;
}) => (
  <div className="tab-body">
    <div className="export-hero">
      <span className="mono label small">MP4 · H.264 · {project.media.width}×{project.media.height}</span>
      <p className="big">
        {formatTime(outMs)} <span className="thin">à exporter</span>
      </p>
      {project.status === "rendering" ? (
        <>
          <div className="bar">
            <div style={{ width: `${project.progress * 100}%` }} />
          </div>
          <p className="mono small muted">Rendu {Math.round(project.progress * 100)} %</p>
        </>
      ) : (
        <button className="btn primary wide" disabled={!canExport} onClick={onExport}>
          Exporter la vidéo
        </button>
      )}
    </div>
    <span className="mono label small">Exports</span>
    {project.renders.length === 0 && <p className="muted small">Aucun export pour l'instant.</p>}
    <ul className="renders">
      {project.renders.map((r) => (
        <li key={r.file}>
          <div>
            <span className="render-name">{r.style}</span>
            <span className="mono muted small">
              {new Date(r.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · {formatTime(r.durationMs)}
            </span>
          </div>
          <div className="row-gap">
            <a className="chip" href={mediaUrl(project.id, r.file)} target="_blank" rel="noreferrer">
              Voir
            </a>
            <a className="chip on" href={mediaUrl(project.id, r.file)} download={`${project.name}-${r.style}.mp4`}>
              Télécharger
            </a>
          </div>
        </li>
      ))}
    </ul>
  </div>
);
