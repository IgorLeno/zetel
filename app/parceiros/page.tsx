import type { Metadata } from 'next';
import { PartnersPage } from '@/components/PartnersPage';

export const metadata: Metadata = { title: 'Parceiros' };

export default function ParceirosPage() {
  return (
    <div className="page-body page-body--wide">
      <header className="page-hero">
        <h1 className="page-hero-title">Com quem você quer estudar?</h1>
        <p className="page-hero-sub">
          Cada parceiro tem um jeito de ensinar e uma cor. Ajuste os prontos numa sessão ou crie os seus.
        </p>
      </header>
      <PartnersPage />
    </div>
  );
}
