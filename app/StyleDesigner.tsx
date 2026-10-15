import { useEffect, useState } from "react";
import { refreshFonts } from "../src/fonts";
import type { Animation, CaptionStyle } from "../src/styles";
import { api } from "./api";

type Props = {
  draft: CaptionStyle;
  onChange: (s: CaptionStyle) => void;
  name: string;
  onName: (n: string) => void;
  editing: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
};

// --- couleurs : <input type=color> ne gère pas l'alpha, on le compose à part ---

const parseColor = (c: string | null | undefined): { hex: string; alpha: number } => {
  if (!c) return { hex: "#ffffff", alpha: 1 };
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) return { hex: c.toLowerCase(), alpha: 1 };
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (short) return { hex: `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase(), alpha: 1 };
  const rgba = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/i.exec(c);
  if (rgba) {
    const h = (n: string) => Number(n).toString(16).padStart(2, "0");
    return { hex: `#${h(rgba[1])}${h(rgba[2])}${h(rgba[3])}`, alpha: rgba[4] ? Number(rgba[4]) : 1 };
  }
  if (c === "white") return { hex: "#ffffff", alpha: 1 };
  if (c === "black") return { hex: "#000000", alpha: 1 };
  return { hex: "#ffffff", alpha: 1 };
};

const toColor = (hex: string, alpha: number) => {
  if (alpha >= 1) return hex.toUpperCase();
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.round(alpha * 100) / 100})`;
};

const ColorField = ({ label, value, onChange, alpha }: { label: string; value: string; onChange: (v: string) => void; alpha?: boolean }) => {
  const c = parseColor(value);
  return (
    <div className="d-row">
      <span className="d-label">{label}</span>
      <div className="d-color">
        <label className="swatch-input" style={{ background: value }}>
          <input type="color" value={c.hex} onChange={(e) => onChange(toColor(e.target.value, c.alpha))} />
        </label>
        {alpha && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={c.alpha}
            title="Opacité"
            onChange={(e) => onChange(toColor(c.hex, Number(e.target.value)))}
          />
        )}
      </div>
    </div>
  );
};

// Couleur facultative : interrupteur + couleur.
const OptColor = ({
  label,
  value,
  fallback,
  onChange,
  alpha,
}: {
  label: string;
  value: string | null | undefined;
  fallback: string;
  onChange: (v: string | null) => void;
  alpha?: boolean;
}) => (
  <>
    <Toggle label={label} checked={!!value} onChange={(on) => onChange(on ? fallback : null)} />
    {value && <ColorField label="" value={value} onChange={onChange} alpha={alpha} />}
  </>
);

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="toggle d-toggle">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="switch" />
    <span>{label}</span>
  </label>
);

const Range = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => String(v),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) => (
  <div className="d-range">
    <div className="slider-head">
      <span className="d-label">{label}</span>
      <span className="mono small">{format(value)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </div>
);

const Seg = <T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) => (
  <div className="d-row column">
    <span className="d-label">{label}</span>
    <div className="segmented wrap">
      {options.map(([v, l]) => (
        <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  </div>
);

const Section = ({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) => (
  <details className="d-section" open={open}>
    <summary className="mono">{title}</summary>
    <div className="d-body">{children}</div>
  </details>
);

// Préréglages d'ombre : le CSS final reste modifiable à la main.
const shadowPresets = (glow: string, relief: string): [string, string, string | null][] => [
  ["none", "Aucune", null],
  ["soft", "Douce", "0 0.05em 0.3em rgba(0,0,0,0.55)"],
  ["drop", "Portée", "0 0.09em 0 #000000"],
  ["glow", "Lueur", `0 0 0.08em ${glow}, 0 0 0.35em ${glow}, 0 0 0.8em ${glow}`],
  ["relief", "Relief", `0.05em 0.05em 0 ${relief}, 0.1em 0.1em 0 #22D3EE`],
];

const FontPicker = ({ value, onChange, allowInherit }: { value: string | undefined; onChange: (f: string | undefined) => void; allowInherit?: boolean }) => {
  const [fonts, setFonts] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/fonts").then((r) => r.json()).then(setFonts).catch(() => {});
  }, []);
  const install = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/fonts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ family: custom }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      await refreshFonts();
      setFonts((f) => [...new Set([...f, body.family])].sort());
      onChange(body.family);
      setCustom("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="d-row column">
      <select className="field select" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} style={{ fontFamily: value }}>
        {allowInherit && <option value="">Même police que le texte</option>}
        {value && !fonts.includes(value) && <option value={value}>{value}</option>}
        {fonts.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f}
          </option>
        ))}
      </select>
      <div className="drive-row">
        <input className="field small-field" placeholder="Autre police Google Fonts…" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && custom && install()} />
        <button className="btn small" disabled={!custom || busy} onClick={install}>
          {busy ? "…" : "Installer"}
        </button>
      </div>
      {error && <p className="error-text small">{error}</p>}
    </div>
  );
};

export const StyleDesigner = ({ draft: s, onChange, name, onName, editing, saving, error, onSave, onCancel, onDelete }: Props) => {
  const set = (patch: Partial<CaptionStyle>) => onChange({ ...s, ...patch });
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const glowColor = parseColor(s.activeColor).hex;
  const presets = shadowPresets(glowColor, "#FF3D7F");
  const shadowKey = presets.find(([, , css]) => css === s.shadow)?.[0] ?? (s.shadow ? "custom" : "none");
  const em = s.emphasis;
  const setEm = (patch: Partial<NonNullable<CaptionStyle["emphasis"]>>) => set({ emphasis: { scale: 1.2, ...(em ?? {}), ...patch } });

  return (
    <div className="designer">
      <div className="designer-head">
        <input className="field" value={name} onChange={(e) => onName(e.target.value)} placeholder="Nom du style" />
        <div className="row-gap">
          <button className="btn ghost small" onClick={onCancel}>
            Annuler
          </button>
          <button className="btn primary small" disabled={saving || !name.trim()} onClick={onSave}>
            {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le style"}
          </button>
        </div>
      </div>
      {error && <p className="error-text small">{error}</p>}
      <p className="muted small">L'aperçu à gauche se met à jour en direct.</p>

      <Section title="Typographie" open>
        <FontPicker value={s.fontFamily} onChange={(f) => f && set({ fontFamily: f })} />
        <Range label="Graisse" value={s.fontWeight} min={100} max={900} step={100} onChange={(v) => set({ fontWeight: v })} />
        <Range label="Taille" value={s.fontSizeRatio} min={0.03} max={0.16} step={0.002} format={(v) => `${Math.round(v * 1000) / 10} %`} onChange={(v) => set({ fontSizeRatio: v })} />
        <Range
          label="Interlettrage"
          value={parseFloat(s.letterSpacing ?? "0") || 0}
          min={-0.08}
          max={0.25}
          step={0.005}
          format={(v) => `${v.toFixed(3)} em`}
          onChange={(v) => set({ letterSpacing: `${v}em` })}
        />
        <Range label="Interligne" value={s.lineHeight ?? 1.15} min={0.8} max={1.7} step={0.05} onChange={(v) => set({ lineHeight: v })} />
        <Toggle label="Majuscules" checked={s.uppercase} onChange={(v) => set({ uppercase: v })} />
        <Toggle label="Italique" checked={!!s.italic} onChange={(v) => set({ italic: v })} />
      </Section>

      <Section title="Couleurs">
        <ColorField label="Texte" value={s.color} onChange={(v) => set({ color: v })} alpha />
        <ColorField label="Mot prononcé" value={s.activeColor} onChange={(v) => set({ activeColor: v })} />
        <OptColor label="Pastille sur le mot prononcé" value={s.activeBackground} fallback="#EEF26B" onChange={(v) => set({ activeBackground: v })} alpha />
        <OptColor label="Couleur des mots déjà dits (karaoké)" value={s.spokenColor} fallback={s.activeColor} onChange={(v) => set({ spokenColor: v })} />
        <OptColor label="Fond derrière chaque mot" value={s.wordBackground} fallback="#FFFFFF" onChange={(v) => set({ wordBackground: v })} alpha />
        <Range label="Arrondi des pastilles" value={s.wordRadiusRatio ?? 0.18} min={0} max={0.6} step={0.02} onChange={(v) => set({ wordRadiusRatio: v })} />
        <Range label="Opacité des mots à venir" value={s.futureOpacity ?? 1} min={0} max={1} step={0.05} onChange={(v) => set({ futureOpacity: v })} />
        <Toggle
          label="Dégradé"
          checked={!!s.gradient}
          onChange={(on) => set({ gradient: on ? { from: "#FDE047", to: "#FF3D7F", target: "active" } : null })}
        />
        {s.gradient && (
          <>
            <ColorField label="De" value={s.gradient.from} onChange={(v) => set({ gradient: { ...s.gradient!, from: v } })} />
            <ColorField label="À" value={s.gradient.to} onChange={(v) => set({ gradient: { ...s.gradient!, to: v } })} />
            <Seg
              label="Appliqué à"
              value={s.gradient.target}
              options={[
                ["active", "Mot prononcé"],
                ["all", "Tous les mots"],
              ]}
              onChange={(v) => set({ gradient: { ...s.gradient!, target: v } })}
            />
          </>
        )}
      </Section>

      <Section title="Contour & ombre">
        <Toggle label="Contour" checked={!!s.stroke} onChange={(on) => set({ stroke: on ? { color: "#000000", ratio: 0.12 } : null })} />
        {s.stroke && (
          <>
            <ColorField label="Couleur" value={s.stroke.color} onChange={(v) => set({ stroke: { ...s.stroke!, color: v } })} />
            <Range label="Épaisseur" value={s.stroke.ratio} min={0.01} max={0.3} step={0.01} onChange={(v) => set({ stroke: { ...s.stroke!, ratio: v } })} />
          </>
        )}
        <Seg
          label="Ombre"
          value={shadowKey}
          options={[...presets.map(([k, l]) => [k, l] as [string, string]), ["custom", "CSS"]]}
          onChange={(k) => {
            const p = presets.find(([key]) => key === k);
            if (p) set({ shadow: p[2] });
            else set({ shadow: s.shadow ?? "0 0.05em 0.3em rgba(0,0,0,0.55)" });
          }}
        />
        {shadowKey === "custom" && (
          <input className="field mono-field" value={s.shadow ?? ""} onChange={(e) => set({ shadow: e.target.value || null })} placeholder="text-shadow CSS, en em" />
        )}
      </Section>

      <Section title="Mot prononcé">
        <Range label="Grossissement" value={s.activeScale} min={1} max={1.5} step={0.01} format={(v) => `×${v.toFixed(2)}`} onChange={(v) => set({ activeScale: v })} />
        <Range label="Inclinaison" value={s.activeRotate ?? 0} min={-15} max={15} step={1} format={(v) => `${v}°`} onChange={(v) => set({ activeRotate: v })} />
        <Toggle label="Souligné" checked={s.activeDecoration === "underline"} onChange={(v) => set({ activeDecoration: v ? "underline" : "none" })} />
      </Section>

      <Section title="Mots importants">
        <Toggle label="Mettre en avant les mots importants" checked={!!em} onChange={(on) => set({ emphasis: on ? { scale: 1.2, color: "#EEF26B" } : null })} />
        {em && (
          <>
            <Range label="Taille" value={em.scale} min={1} max={2.5} step={0.05} format={(v) => `×${v.toFixed(2)}`} onChange={(v) => setEm({ scale: v })} />
            <OptColor label="Couleur" value={em.color} fallback="#EEF26B" onChange={(v) => setEm({ color: v ?? undefined })} />
            <OptColor label="Pastille" value={em.background} fallback="#EEF26B" onChange={(v) => setEm({ background: v ?? undefined })} alpha />
            <span className="d-label">Police</span>
            <FontPicker value={em.fontFamily} onChange={(f) => setEm({ fontFamily: f })} allowInherit />
            <Range label="Graisse" value={em.fontWeight ?? s.fontWeight} min={100} max={900} step={100} onChange={(v) => setEm({ fontWeight: v })} />
            <Toggle label="Italique" checked={!!em.italic} onChange={(v) => setEm({ italic: v })} />
            <Range label="Inclinaison" value={em.rotate ?? 0} min={-15} max={15} step={1} format={(v) => `${v}°`} onChange={(v) => setEm({ rotate: v })} />
          </>
        )}
      </Section>

      <Section title="Bloc de fond">
        <OptColor label="Fond derrière le texte" value={s.box?.color} fallback="rgba(0,0,0,0.6)" onChange={(v) => set({ box: v ? { radiusRatio: 0.3, ...(s.box ?? {}), color: v } : null })} alpha />
        {s.box && (
          <>
            <Range label="Arrondi" value={s.box.radiusRatio} min={0} max={1.2} step={0.05} onChange={(v) => set({ box: { ...s.box!, radiusRatio: v } })} />
            <Range label="Flou (verre)" value={s.box.blur ?? 0} min={0} max={40} step={1} format={(v) => `${v}px`} onChange={(v) => set({ box: { ...s.box!, blur: v } })} />
          </>
        )}
      </Section>

      <Section title="Mise en page">
        <Range label="Position verticale" value={s.verticalPosition} min={0.08} max={0.92} step={0.01} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => set({ verticalPosition: v })} />
        <Seg
          label="Alignement"
          value={s.align ?? "center"}
          options={[
            ["left", "Gauche"],
            ["center", "Centre"],
            ["right", "Droite"],
          ]}
          onChange={(v) => set({ align: v })}
        />
        <Range label="Largeur max" value={s.maxWidthRatio ?? 0.88} min={0.4} max={1} step={0.02} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => set({ maxWidthRatio: v })} />
        <Range label="Mots par écran" value={s.maxWords} min={1} max={12} step={1} onChange={(v) => set({ maxWords: v, combineWithinMs: v === 1 ? 0 : Math.max(s.combineWithinMs, v * 320) })} />
        <Range label="Regroupement" value={s.combineWithinMs} min={0} max={4000} step={50} format={(v) => `${v} ms`} onChange={(v) => set({ combineWithinMs: v })} />
      </Section>

      <Section title="Animation">
        <Seg
          label="Apparition"
          value={s.reveal}
          options={[
            ["page", "Écran entier"],
            ["spoken", "Mot par mot"],
            ["typewriter", "Lettres"],
          ]}
          onChange={(v) => set({ reveal: v })}
        />
        <Seg
          label="Entrée"
          value={s.animation ?? "pop"}
          options={
            [
              ["pop", "Pop"],
              ["bounce", "Rebond"],
              ["slide-up", "Montée"],
              ["fade", "Fondu"],
              ["blur", "Flou"],
              ["none", "Aucune"],
            ] as [Animation, string][]
          }
          onChange={(v) => set({ animation: v })}
        />
        <Toggle
          label="Chaos (angles, tailles, couleurs)"
          checked={!!s.chaos}
          onChange={(on) =>
            set({
              chaos: on ? { palette: ["#FF3D7F", "#FFE500", "#22D3EE", "#A3E635"], fonts: [s.fontFamily, "Instrument Serif", "Anton"], maxRotateDeg: 9 } : null,
              emphasis: on && !s.emphasis ? { scale: 1.7 } : s.emphasis,
            })
          }
        />
        {s.chaos && (
          <Range label="Inclinaison max" value={s.chaos.maxRotateDeg} min={0} max={25} step={1} format={(v) => `${v}°`} onChange={(v) => set({ chaos: { ...s.chaos!, maxRotateDeg: v } })} />
        )}
      </Section>

      <Section title="JSON">
        <p className="muted small">Le style complet. Tu peux coller ici un style généré par Claude.</p>
        <textarea
          className="field json"
          value={json || JSON.stringify(s, null, 2)}
          onFocus={() => setJson(JSON.stringify(s, null, 2))}
          onChange={(e) => setJson(e.target.value)}
          onBlur={() => {
            try {
              onChange({ ...s, ...JSON.parse(json) });
              setJsonError(null);
              setJson("");
            } catch {
              setJsonError("JSON invalide");
            }
          }}
          spellCheck={false}
        />
        {jsonError && <p className="error-text small">{jsonError}</p>}
      </Section>

      {onDelete && (
        <button className="btn ghost small danger" onClick={onDelete}>
          Supprimer ce style
        </button>
      )}
    </div>
  );
};
