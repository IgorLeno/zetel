'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { StudySession } from '@/types/study-session';
import {
  AXES,
  AXIS_LABELS,
  TONE_KEYS,
  TONE_LABELS,
  applyOverrides,
  type PartnerColor,
  type ProfileOverrides,
  type TutorProfile,
} from '@/lib/tutor-profiles';
import {
  AXIS_ENDS,
  LEVEL_WORDS_3,
  LEVEL_WORDS_5,
  PARTNER_COLORS,
  PARTNER_COLOR_LABELS,
  TONE_ENDS,
  partnerColorVar,
  partnerSample,
  partnerTagline,
  partnerTraits,
  radarPoints,
} from '@/lib/partner-identity';
import { PartnerOrb } from './PartnerOrb';

/** Carrega a lista de perfis uma vez; built-ins vêm do servidor junto dos personalizados. */
export function useTutorProfiles() {
  const [profiles, setProfiles] = useState<TutorProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tutor-profiles');
        if (!res.ok) throw new Error('profiles');
        const data = await res.json() as { profiles: TutorProfile[] };
        if (!cancelled) setProfiles(data.profiles);
      } catch {
        if (!cancelled) setError('Não foi possível carregar os parceiros.');
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return { profiles, setProfiles, error };
}

/** Parceiro efetivo da sessão (perfil base + ajustes), com fallback em Conversa Livre. */
export function resolvePartner(profiles: TutorProfile[], session: StudySession | null): TutorProfile | null {
  if (profiles.length === 0) return null;
  const base = profiles.find((profile) => profile.id === session?.profileId)
    ?? profiles.find((profile) => profile.id === 'conversa-livre')
    ?? profiles[0]!;
  return applyOverrides(base, session?.profileId === base.id ? session.profileOverrides : null);
}

async function patchSession(zetelId: string, body: Record<string, unknown>): Promise<StudySession> {
  const res = await fetch(`/api/zetels/${zetelId}/sessions`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({})) as { session?: StudySession; error?: string };
  if (!res.ok || !data.session) throw new Error(data.error ?? 'Não foi possível atualizar a sessão.');
  return data.session;
}

/**
 * Galeria de parceiros + editor do jeito de ensinar. Com sessão, escolher um
 * cartão já troca o parceiro da conversa; sem sessão (página Parceiros), só edita.
 * Perfis integrados nunca são alterados: ajuste vale para a sessão ou vira parceiro novo.
 */
export function PartnerStudio({
  profiles,
  setProfiles,
  session = null,
  zetelId = null,
  disabled = false,
  onSessionChange,
}: {
  profiles: TutorProfile[];
  setProfiles: (update: (current: TutorProfile[]) => TutorProfile[]) => void;
  session?: StudySession | null;
  zetelId?: string | null;
  disabled?: boolean;
  onSessionChange?: (session: StudySession) => void;
}) {
  const inSession = Boolean(session && zetelId);
  const [selectedId, setSelectedId] = useState<string>(session?.profileId ?? 'conversa-livre');
  const [draft, setDraft] = useState<TutorProfile | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<PartnerColor>('rosa');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;

  // Rascunho parte do perfil escolhido; na sessão ativa, inclui os ajustes já aplicados.
  useEffect(() => {
    if (!selected) return;
    const overrides = session?.profileId === selected.id ? session.profileOverrides : null;
    setDraft(applyOverrides(selected, overrides));
    setName(selected.builtin ? '' : selected.name);
    setColor(selected.builtin ? nextFreeColor(profiles, selected.color) : selected.color);
    // Só reinicia ao trocar de parceiro ou de sessão — não a cada edição local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, session?.id, session?.profileId, profiles.length]);

  useEffect(() => {
    if (session?.profileId) setSelectedId(session.profileId);
  }, [session?.profileId]);

  const changed = useMemo(() => selected && draft ? overridesAgainst(selected, draft) : null, [selected, draft]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2400);
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado.');
    } finally {
      setBusy(false);
    }
  }

  function choose(profile: TutorProfile) {
    setSelectedId(profile.id);
    if (!inSession || session!.profileId === profile.id) return;
    void run(async () => {
      const updated = await patchSession(zetelId!, {
        sessionId: session!.id, profileId: profile.id, profileOverrides: null,
      });
      onSessionChange?.(updated);
      flash(`Agora você estuda com ${profile.name}.`);
    });
  }

  function applyTweaks() {
    if (!inSession || !selected || !draft) return;
    void run(async () => {
      const updated = await patchSession(zetelId!, {
        sessionId: session!.id, profileId: selected.id, profileOverrides: overridesAgainst(selected, draft),
      });
      onSessionChange?.(updated);
      flash('Ajuste aplicado nesta sessão.');
    });
  }

  function saveNew() {
    if (!selected || !draft) return;
    if (!name.trim()) {
      setError('Dê um nome ao novo parceiro.');
      return;
    }
    void run(async () => {
      const res = await fetch('/api/tutor-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), baseProfileId: selected.id, color, axes: draft.axes, tone: draft.tone,
        }),
      });
      const data = await res.json().catch(() => ({})) as { profile?: TutorProfile; error?: string };
      if (!res.ok || !data.profile) throw new Error(data.error ?? 'Não foi possível criar o parceiro.');
      const created = data.profile;
      setProfiles((current) => [...current, created]);
      setSelectedId(created.id);
      if (inSession) {
        const updated = await patchSession(zetelId!, {
          sessionId: session!.id, profileId: created.id, profileOverrides: null,
        });
        onSessionChange?.(updated);
      }
      flash(`${created.name} está pronto.`);
    });
  }

  function saveCustom() {
    if (!selected || selected.builtin || !draft) return;
    void run(async () => {
      const res = await fetch(`/api/tutor-profiles/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || selected.name, color, axes: draft.axes, tone: draft.tone }),
      });
      const data = await res.json().catch(() => ({})) as { profile?: TutorProfile; error?: string };
      if (!res.ok || !data.profile) throw new Error(data.error ?? 'Não foi possível salvar o parceiro.');
      const saved = data.profile;
      setProfiles((current) => current.map((profile) => profile.id === saved.id ? saved : profile));
      // Ajustes de sessão viraram parte do perfil salvo; limpa para não aplicar em dobro.
      if (inSession && session!.profileId === saved.id && session!.profileOverrides) {
        onSessionChange?.(await patchSession(zetelId!, { sessionId: session!.id, profileOverrides: null }));
      }
      flash('Parceiro atualizado.');
    });
  }

  const locked = disabled || busy;
  const activeId = session?.profileId ?? null;

  return (
    <div className="partner-studio">
      <div className="partner-grid" role="list">
        {profiles.map((profile) => {
          const isSelected = profile.id === selectedId;
          const isActive = profile.id === activeId;
          const sample = partnerSample(profile);
          return (
            <button
              key={profile.id}
              type="button"
              role="listitem"
              className={`partner-card${isSelected ? ' selected' : ''}`}
              style={{ '--c': partnerColorVar(profile.color) } as CSSProperties}
              disabled={locked}
              aria-pressed={isSelected}
              onClick={() => choose(profile)}
            >
              <span className="partner-card-head">
                <PartnerOrb color={profile.color} size={48} />
                <span className="partner-card-id">
                  <span className="partner-card-name">{profile.name}</span>
                  <span className="partner-card-tag">{partnerTagline(profile)}</span>
                </span>
                {isActive && <span className="partner-card-now">Com você</span>}
              </span>
              {sample && <span className="partner-card-sample">“{sample}”</span>}
              <span className="partner-card-traits">
                {partnerTraits(profile).map((trait) => <span key={trait}>{trait}</span>)}
              </span>
            </button>
          );
        })}
      </div>

      {draft && selected && (
        <section className="partner-editor" aria-label={`Ajustar ${selected.name}`}
          style={{ '--p': partnerColorVar(color) } as CSSProperties}>
          <div className="partner-editor-preview">
            <PartnerOrb color={color} size={96} />
            <input
              className="partner-name-input"
              aria-label={selected.builtin ? 'Nome do novo parceiro' : 'Nome do parceiro'}
              placeholder={selected.builtin ? `Meu ${selected.name}` : selected.name}
              value={name}
              maxLength={80}
              disabled={locked}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="partner-swatches" role="radiogroup" aria-label="Cor do parceiro">
              {PARTNER_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={color === option}
                  aria-label={PARTNER_COLOR_LABELS[option]}
                  title={PARTNER_COLOR_LABELS[option]}
                  className={color === option ? 'on' : ''}
                  style={{ '--c': partnerColorVar(option) } as CSSProperties}
                  disabled={locked}
                  onClick={() => setColor(option)}
                />
              ))}
            </div>
            <p className="partner-editor-hint">
              {selected.builtin
                ? 'Parceiros prontos não mudam. Ajuste e use só nesta sessão, ou salve como um parceiro seu.'
                : 'Este parceiro é seu: nome, cor e jeito de ensinar podem mudar.'}
            </p>
          </div>

          <div className="partner-editor-scales">
            <h3>Jeito de ensinar</h3>
            <div className="partner-scales">
              {AXES.map((axis) => (
                <Scale
                  key={axis}
                  label={AXIS_LABELS[axis]}
                  value={draft.axes[axis]}
                  max={4}
                  words={LEVEL_WORDS_5}
                  ends={AXIS_ENDS[axis]}
                  disabled={locked}
                  onChange={(value) => setDraft({ ...draft, axes: { ...draft.axes, [axis]: value } })}
                />
              ))}
            </div>
            <h3>Tom</h3>
            <div className="partner-scales">
              {TONE_KEYS.map((key) => (
                <Scale
                  key={key}
                  label={TONE_LABELS[key]}
                  value={draft.tone[key]}
                  max={2}
                  words={LEVEL_WORDS_3}
                  ends={TONE_ENDS[key]}
                  disabled={locked}
                  onChange={(value) => setDraft({ ...draft, tone: { ...draft.tone, [key]: value } })}
                />
              ))}
            </div>
            <PartnerRadar axes={draft.axes} />
            <div className="partner-editor-actions">
              {inSession && (
                <button type="button" className="btn primary" disabled={locked || (!changed && !session!.profileOverrides)}
                  onClick={applyTweaks}>
                  Usar nesta sessão
                </button>
              )}
              {!selected.builtin && (
                <button type="button" className="btn primary" disabled={locked} onClick={saveCustom}>
                  Salvar parceiro
                </button>
              )}
              <button type="button" className="btn" disabled={locked} onClick={saveNew}>
                Salvar como novo parceiro
              </button>
            </div>
            {notice && <p className="feedback ok" role="status">{notice}</p>}
            {error && <p className="feedback err" role="alert">{error}</p>}
          </div>
        </section>
      )}
    </div>
  );
}

function Scale({
  label,
  value,
  max,
  words,
  ends,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  words: readonly string[];
  ends: readonly [string, string];
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="partner-scale">
      <div className="partner-scale-head">
        <span>{label}</span>
        <span className="partner-scale-word">{words[value]}</span>
      </div>
      <div className="partner-scale-steps" role="radiogroup" aria-label={label}>
        {Array.from({ length: max + 1 }, (_, level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            aria-label={`${label}: ${words[level]}`}
            className={level <= value ? 'filled' : ''}
            disabled={disabled}
            onClick={() => onChange(level)}
          />
        ))}
      </div>
      <div className="partner-scale-ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>
    </div>
  );
}

function overridesAgainst(base: TutorProfile, draft: TutorProfile): ProfileOverrides | null {
  const out: ProfileOverrides = {};
  for (const axis of AXES) {
    if (draft.axes[axis] !== base.axes[axis]) out[axis] = draft.axes[axis];
  }
  for (const key of TONE_KEYS) {
    if (draft.tone[key] !== base.tone[key]) out[key] = draft.tone[key];
  }
  return Object.keys(out).length === 0 ? null : out;
}

/** Sugere para um parceiro novo uma cor que ainda não está em uso. */
function nextFreeColor(profiles: TutorProfile[], fallback: PartnerColor): PartnerColor {
  const used = new Set(profiles.map((profile) => profile.color));
  return PARTNER_COLORS.find((option) => !used.has(option)) ?? fallback;
}

/** Radar só de leitura: resume o jeito de ensinar; as escalas continuam sendo o editor. */
function PartnerRadar({ axes }: { axes: TutorProfile['axes'] }) {
  const label = AXES.map((axis) => `${AXIS_LABELS[axis]} ${axes[axis]} de 4`).join(', ');
  return (
    <svg className="partner-radar" viewBox="0 0 160 160" role="img" aria-label={`Radar do jeito de ensinar: ${label}`}>
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon key={ring} points={radarPoints(axes, ring)} fill="none" stroke="currentColor" strokeOpacity={0.2} />
      ))}
      <polygon points={radarPoints(axes)} fill="currentColor" fillOpacity={0.25} stroke="currentColor" />
    </svg>
  );
}
