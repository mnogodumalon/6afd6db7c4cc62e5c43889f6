import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import { OptionVote } from '@/components/blocks/OptionVote';
import {
  loadPublicPagesConfig, PageUnavailableError,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import { VOTES, fieldText, type JourneyRecord } from '@/lib/journey';
import { tx } from '@/i18n';

const SLUG = 'termin-abstimmen';

export default function TerminAbstimmen() {
  const [params] = useSearchParams();
  const linkedId = params.get('umfrage');
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<JourneyRecord | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'invalid' | 'problem'>('loading');

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
    });
  }, []);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  const load = useCallback(async () => {
    if (!port || !linkedId) return;
    setState('loading');
    try {
      const r = await port.get('umfragen', linkedId);
      setRecord(r);
      setState(r ? 'ok' : 'invalid');
    } catch (e) {
      setState(e instanceof PageUnavailableError ? 'invalid' : 'problem');
    }
  }, [port, linkedId]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }

  if (!linkedId) {
    return (
      <PublicShell title={page.title} description={page.description}>
        <p className="text-sm text-muted-foreground">
          {tx('Bitte öffne den Link oder QR-Code deiner Umfrage, um abzustimmen.')}
        </p>
      </PublicShell>
    );
  }

  if (state === 'invalid') {
    return (
      <PublicShell title={page.title}>
        <p className="text-sm">
          {tx('Dieser Link ist nicht mehr gültig. Bitte den aktuellen Link oder QR-Code verwenden.')}
        </p>
      </PublicShell>
    );
  }

  if (state === 'problem') {
    return (
      <PublicShell title={page.title}>
        <LoadProblem onRetry={load} />
      </PublicShell>
    );
  }

  if (state === 'loading' || !record) {
    return <PublicShell loading />;
  }

  const titel = fieldText(record, 'titel');
  const beschreibung = fieldText(record, 'beschreibung');
  const ort = fieldText(record, 'ort');

  return (
    <PublicShell title={titel || page.title} description={beschreibung || page.description} wide>
      <div className="space-y-4">
        {ort && <p className="text-sm text-muted-foreground">{tx('Ort')}: {ort}</p>}
        <OptionVote port={port} vote={VOTES[SLUG]} parentId={linkedId} draftKey={SLUG} />
      </div>
    </PublicShell>
  );
}
