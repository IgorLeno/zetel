'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PartnerOrb } from './PartnerOrb';
import { ZetelLockup } from './ZetelLogo';

function greetingFor(hour: number) {
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Saudação da tela inicial. A hora vem do navegador para não depender do fuso do servidor. */
export function HomeGreeting({ resume }: { resume: { slug: string; name: string } | null }) {
  const [greeting, setGreeting] = useState('Olá');
  useEffect(() => setGreeting(greetingFor(new Date().getHours())), []);

  return (
    <>
      <ZetelLockup className="home-brand" />
      <section className="home-hello">
        <PartnerOrb size={88} />
        <div className="home-hello-text">
          <h1>{greeting}!</h1>
          <p className="home-bubble">
            {resume
              ? <>Quer continuar <b>{resume.name}</b> de onde paramos, ou começar algo novo?</>
              : <>Me traga um material — PDF ou Markdown — e a gente estuda junto, conversando.</>}
          </p>
          <div className="home-chips">
            {resume && (
              <Link className="chip chip--accent" href={`/zetel/${resume.slug}`}>
                <span className="chip-dot" aria-hidden /> Retomar {resume.name}
              </Link>
            )}
            <Link className="chip" href="/parceiros">Escolher parceiro</Link>
            <Link className="chip" href="/memoria">Ver memória</Link>
          </div>
        </div>
      </section>
    </>
  );
}
