'use client';

import { useEffect, useState } from 'react';
import type { StudySession } from '@/types/study-session';
import {
  AXES,
  AXIS_LABELS,
  TONE_KEYS,
  TONE_LABELS,
  applyOverrides,
  type ProfileOverrides,
  type TutorProfile,
} from '@/lib/tutor-profiles';

/**
 * Editor do perfil no painel do parceiro, não sobre o material.
 * Barras editam; o radar só mostra. Aplicar grava na sessão, não no built-in.
 */
export function TutorProfilePanel({
  zetelId,
  session,
  disabled,
  onSessionChange,
}: {
  zetelId: string;
  session: StudySession | null;
  disabled: boolean;
  onSessionChange: (session: StudySession) => void;
}) {
  const [profiles, setProfiles] = useState<TutorProfile[]>([]);
  const [selectedId, setSelectedId] = useState('conversa-livre');
  const [draft, setDraft] = useState<TutorProfile | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tutor-profiles');
        if (!res.ok) throw new Error('profiles');
        const data = await res.json() as { profiles: TutorProfile[] };
        if (!cancelled) setProfiles(data.profiles);
      } catch {
        if (!cancelled) setError('Não foi possível carregar os perfis.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (profiles.length === 0) return;
    const id = session?.profileId && profiles.some((profile) => profile.id === session.profileId)
      ? session.profileId
      : 'conversa-livre';
    const base = profiles.find((profile) => profile.id === id) ?? profiles[0];
    setSelectedId(base.id);
    setDraft(applyOverrides(base, session?.profileId === base.id ? session.profileOverrides : null));
  }, [profiles, session]);

  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;

  function choose(id: string) {
    const base = profiles.find((profile) => profile.id === id);
    if (!base) return;
    setSelectedId(id);
    setDraft(applyOverrides(base, session?.profileId === id ? session.profileOverrides : null));
  }

  function setAxis(axis: (typeof AXES)[number], value: number) {
    setDraft((current) => current ? { ...current, axes: { ...current.axes, [axis]: value } } : current);
  }

  function setTone(key: (typeof TONE_KEYS)[number], value: number) {
    setDraft((current) => current ? { ...current, tone: { ...current.tone, [key]: value } } : current);
  }

  async function applyToSession() {
    if (!session || !draft || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/zetels/${zetelId}/sessions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          profileId: selected.id,
          profileOverrides: overridesAgainst(selected, draft),
        }),
      });
      const data = await res.json() as { session?: StudySession; error?: string };
      if (!res.ok || !data.session) throw new Error(data.error ?? 'Não foi possível aplicar o perfil.');
      onSessionChange(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aplicar o perfil.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAsNew() {
    if (!draft || !selected || !newName.trim()) {
      setError('Dê um nome ao novo perfil.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await fetch('/api/tutor-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          baseProfileId: selected.id,
          axes: draft.axes,
          tone: draft.tone,
        }),
      });
      const data = await created.json() as { profile?: TutorProfile; error?: string };
      if (!created.ok || !data.profile) throw new Error(data.error ?? 'Não foi possível salvar o perfil.');
      setProfiles((current) => [...current, data.profile!]);
      setSelectedId(data.profile.id);
      setDraft(data.profile);
      setNewName('');
      if (session) {
        const applied = await fetch(`/api/zetels/${zetelId}/sessions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            profileId: data.profile.id,
            profileOverrides: null,
          }),
        });
        const sessionData = await applied.json() as { session?: StudySession; error?: string };
        if (!applied.ok || !sessionData.session) {
          throw new Error(sessionData.error ?? 'Perfil salvo, mas a sessão não foi atualizada.');
        }
        onSessionChange(sessionData.session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCustom() {
    if (!draft || !selected || selected.builtin) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tutor-profiles/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ axes: draft.axes, tone: draft.tone }),
      });
      const data = await res.json() as { profile?: TutorProfile; error?: string };
      if (!res.ok || !data.profile) throw new Error(data.error ?? 'Não foi possível salvar o perfil.');
      setProfiles((current) => current.map((profile) => profile.id === data.profile!.id ? data.profile! : profile));
      setDraft(data.profile);
      if (session?.profileId === data.profile.id) {
        const applied = await fetch(`/api/zetels/${zetelId}/sessions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, profileOverrides: null }),
        });
        const sessionData = await applied.json() as { session?: StudySession };
        if (applied.ok && sessionData.session) onSessionChange(sessionData.session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return (
      <details className="tutor-profile">
        <summary>Perfil do tutor</summary>
        <p className="tutor-profile-note">{error ?? 'Carregando perfis…'}</p>
      </details>
    );
  }

  const radarLabel = AXES.map((axis) => `${AXIS_LABELS[axis]} ${draft.axes[axis]} de 4`).join(', ');

  return (
    <details className="tutor-profile">
      <summary>Perfil do tutor</summary>
      <label className="tutor-profile-field">
        Perfil
        <select
          aria-label="Perfil do tutor"
          value={selectedId}
          disabled={disabled || busy}
          onChange={(event) => choose(event.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}{profile.builtin ? '' : ' (personalizado)'}
            </option>
          ))}
        </select>
      </label>
      <div className="tutor-profile-body">
        <div>
          <fieldset disabled={disabled || busy}>
            <legend>Eixos</legend>
            {AXES.map((axis) => (
              <label key={axis} className="tutor-axis">
                <span>{AXIS_LABELS[axis]}</span>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={1}
                  value={draft.axes[axis]}
                  aria-valuetext={`${draft.axes[axis]} de 4`}
                  onChange={(event) => setAxis(axis, Number(event.target.value))}
                />
                <span>{draft.axes[axis]}</span>
              </label>
            ))}
          </fieldset>
          <fieldset disabled={disabled || busy}>
            <legend>Tom</legend>
            {TONE_KEYS.map((key) => (
              <label key={key} className="tutor-axis">
                <span>{TONE_LABELS[key]}</span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={draft.tone[key]}
                  aria-valuetext={`${draft.tone[key]} de 2`}
                  onChange={(event) => setTone(key, Number(event.target.value))}
                />
                <span>{draft.tone[key]}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <ProfileRadar axes={draft.axes} label={radarLabel} />
      </div>
      <div className="tutor-profile-actions">
        <button type="button" className="mini-btn" disabled={!session || disabled || busy} onClick={() => void applyToSession()}>
          Aplicar só nesta sessão
        </button>
        <button type="button" className="mini-btn" disabled={selected?.builtin !== false || disabled || busy} onClick={() => void saveCustom()}>
          Salvar perfil
        </button>
      </div>
      <div className="tutor-profile-actions">
        <input
          aria-label="Nome do novo perfil"
          placeholder="Nome do novo perfil"
          value={newName}
          disabled={disabled || busy}
          onChange={(event) => setNewName(event.target.value)}
        />
        <button type="button" className="mini-btn" disabled={disabled || busy} onClick={() => void saveAsNew()}>
          Salvar como novo perfil
        </button>
      </div>
      {selected?.builtin && <p className="tutor-profile-note">Perfis integrados não são alterados. O ajuste vale para esta sessão, ou vira um perfil novo.</p>}
      {!session && <p className="tutor-profile-note">Abra uma sessão para aplicar o perfil.</p>}
      {error && <p className="feedback err">{error}</p>}
    </details>
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

function ProfileRadar({ axes, label }: { axes: TutorProfile['axes']; label: string }) {
  const cx = 80;
  const cy = 80;
  const radius = 58;
  const point = (index: number, scale: number) => {
    const angle = (-Math.PI / 2) + (index * 2 * Math.PI) / AXES.length;
    return `${(cx + Math.cos(angle) * radius * scale).toFixed(1)},${(cy + Math.sin(angle) * radius * scale).toFixed(1)}`;
  };
  const rings = [0.25, 0.5, 0.75, 1];
  return (
    <svg className="tutor-radar" viewBox="0 0 160 160" role="img" aria-label={`Radar do perfil: ${label}`}>
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={AXES.map((_, index) => point(index, ring)).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.25}
        />
      ))}
      <polygon
        points={AXES.map((axis, index) => point(index, axes[axis] / 4)).join(' ')}
        fill="currentColor"
        fillOpacity={0.28}
        stroke="currentColor"
      />
    </svg>
  );
}
