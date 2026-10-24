'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { buildOpeningMessage, buildProjectInstruction, CHATGPT_URL } from '@/lib/chatgpt-study';
import {
  createChannelWatch,
  INITIAL_CHANNEL_WATCH_STATE,
  type ChannelWatch,
  type ChannelWatchState,
} from '@/lib/channel-watch';
import { drawerQuery } from '@/lib/study-drawer';
import { StudyDrawerButton } from './StudyDrawerButton';

type CopyTarget = 'instrucao' | 'abertura';

const COPY_LABEL: Record<CopyTarget, string> = {
  instrucao: 'Instrução copiada.',
  abertura: 'Abertura copiada.',
};

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Centro da tela de estudo (SPEC-018): o estudo acontece no ChatGPT; o Zetel
 * prepara o Project, abre a conversa e vigia o canal até o relatório chegar.
 */
export function ChatGptStudyCard({
  zetelId,
  slug,
  showDrawerButton = true,
  onUseInternalChat,
}: {
  zetelId: string;
  slug: string;
  showDrawerButton?: boolean;
  /** Ausente quando não há chat interno (Zetel ainda sem fontes). */
  onUseInternalChat?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const watchRef = useRef<ChannelWatch | null>(null);
  const [watch, setWatch] = useState<ChannelWatchState>(INITIAL_CHANNEL_WATCH_STATE);
  const [seenReceived, setSeenReceived] = useState(0);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  // Sem permissão de área de transferência: o texto aparece para copiar à mão.
  const [manualCopy, setManualCopy] = useState<{ target: CopyTarget; text: string } | null>(null);

  useEffect(() => {
    const controller = createChannelWatch({
      zetelId,
      fetch: (...args) => fetch(...args),
      isVisible: () => document.visibilityState === 'visible',
      onChange: setWatch,
    });
    watchRef.current = controller;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') controller.onVisible();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      controller.stop();
      watchRef.current = null;
    };
  }, [zetelId]);

  async function copy(target: CopyTarget) {
    const text = target === 'instrucao' ? buildProjectInstruction(slug) : buildOpeningMessage(slug);
    setManualCopy(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(target);
    } catch {
      setCopied(null);
      setManualCopy({ target, text });
    }
  }

  function openChatGpt() {
    window.open(CHATGPT_URL, '_blank', 'noopener,noreferrer');
    watchRef.current?.start();
  }

  const curadoriaHref = `${pathname}?${drawerQuery(searchParams.toString(), 'curadoria')}`;
  const newReports = watch.received - seenReceived;
  const listening = watch.status === 'listening';

  return (
    <section className="chatgpt-card" aria-labelledby="chatgpt-card-title" data-testid="chatgpt-study-card">
      {showDrawerButton && (
        <div className="chatgpt-card-top">
          <StudyDrawerButton className="topbar-btn chat-drawer-btn" />
        </div>
      )}
      <div className="chatgpt-card-body">
        <h2 id="chatgpt-card-title" className="ce-t">Estudar com o ChatGPT</h2>
        <p className="ce-s">
          A conversa acontece no ChatGPT. O Zetel prepara o começo e guarda o que você estudou.
        </p>

        {watch.status === 'no-channel' ? (
          <div className="chatgpt-notice warn" role="status">
            <strong>Configure o canal</strong>
            <span>
              O Zetel recebe os relatórios por um repositório GitHub (o canal). Defina o clone local dele
              (<code>channel_dir</code>) em <Link href="/configuracoes">Configurações</Link>.
            </span>
          </div>
        ) : null}

        {newReports > 0 && (
          <div className="chatgpt-notice ok" role="status" data-testid="chatgpt-report-received">
            <strong>Relatório recebido</strong>
            <span>
              {newReports === 1 ? 'Um relatório novo chegou' : `${newReports} relatórios novos chegaram`} do canal.
            </span>
            <Link className="btn primary btn-sm" href={curadoriaHref} replace scroll={false}
              onClick={() => setSeenReceived(watch.received)}>
              Revisar na Curadoria
            </Link>
          </div>
        )}

        <ol className="chatgpt-steps">
          <li>
            <div className="chatgpt-step-head">
              <span className="chatgpt-step-n" aria-hidden>1</span>
              <strong>Preparar o Project</strong>
              <span className="chatgpt-step-tag">primeira vez</span>
            </div>
            <p>Crie um Project no ChatGPT para este estudo e cole a instrução nas instruções do Project.</p>
            <div className="chatgpt-step-actions">
              <button type="button" className="btn btn-sm" onClick={() => void copy('instrucao')}>Copiar instrução</button>
            </div>
          </li>
          <li>
            <div className="chatgpt-step-head">
              <span className="chatgpt-step-n" aria-hidden>2</span>
              <strong>Conversar</strong>
            </div>
            <p>Abra o ChatGPT e comece a conversa com a abertura, para ele retomar de onde você parou.</p>
            <div className="chatgpt-step-actions">
              <button type="button" className="btn primary" onClick={openChatGpt}>Abrir ChatGPT</button>
              <button type="button" className="btn btn-sm" onClick={() => void copy('abertura')}>Copiar abertura</button>
            </div>
          </li>
          <li>
            <div className="chatgpt-step-head">
              <span className="chatgpt-step-n" aria-hidden>3</span>
              <strong>Registrar</strong>
            </div>
            <p>
              No fim, peça <strong>“Gere o Relatório Zetel”</strong> e envie o <code>.md</code> e as imagens
              para <code>inbox/{slug}/</code> no canal. O Zetel detecta sozinho.
            </p>
          </li>
        </ol>

        {copied && <p className="feedback ok" role="status">{COPY_LABEL[copied]}</p>}
        {manualCopy && (
          <div className="chatgpt-manual-copy">
            <p className="field-hint">Não consegui copiar automaticamente. Selecione o texto abaixo e copie.</p>
            <textarea readOnly rows={6} value={manualCopy.text} aria-label="Texto para copiar"
              onFocus={(event) => event.currentTarget.select()} />
          </div>
        )}

        {(listening || watch.status === 'failed') && (
          <div className={`chatgpt-listening${listening ? '' : ' stopped'}`} role="status" data-testid="chatgpt-listening">
            {listening && <span className="chatgpt-pulse" aria-hidden />}
            <span>
              {listening ? 'Ouvindo o canal…' : 'Verificação parada depois de erros seguidos.'}
              {watch.lastCheckAt !== null && ` Última verificação: ${formatTime(watch.lastCheckAt)}.`}
            </span>
            {listening ? (
              <button type="button" className="btn btn-sm" onClick={() => watchRef.current?.stop()}>Parar</button>
            ) : (
              <button type="button" className="btn btn-sm" onClick={() => watchRef.current?.start()}>Tentar de novo</button>
            )}
          </div>
        )}
        {watch.error && <p className="feedback err" role="alert">{watch.error}</p>}

        {onUseInternalChat && (
          <button type="button" className="chatgpt-internal-link" onClick={onUseInternalChat}>
            Usar o chat interno
          </button>
        )}
      </div>
    </section>
  );
}
