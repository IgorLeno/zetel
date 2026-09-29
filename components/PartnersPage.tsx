'use client';

import { PartnerStudio, useTutorProfiles } from './PartnerStudio';

/** Página Parceiros: gerencia perfis sem sessão aberta (escolha por sessão fica na conversa). */
export function PartnersPage() {
  const { profiles, setProfiles, error } = useTutorProfiles();
  if (error) return <p className="feedback err">{error}</p>;
  if (profiles.length === 0) return <p className="chat-placeholder">Chamando os parceiros…</p>;
  return <PartnerStudio profiles={profiles} setProfiles={setProfiles} />;
}
