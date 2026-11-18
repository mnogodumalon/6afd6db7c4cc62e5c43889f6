import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { IconPlus, IconCalendarEvent, IconMapPin, IconUsers, IconCircleCheck, IconTrophy } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor, decided, countOf } from '@/config/plan';
import { extractRecordId } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { submissionsOf, topOne } from '@/lib/journey';
import { useClock, gruss, namen } from '@/lib/polish';
import { tx, appLabel, dateFnsLocale } from '@/i18n';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { RecordDoorLink } from '@/components/widgets/RecordDoorLink';

// layout-opt-out: not applicable — composed via DashboardGrid below (no board widget fits poll cards)
export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { umfragen, terminvorschlaege, antworten } = data;
  const clock = useClock();
  const [filter, setFilter] = useState<'all' | 'offen' | 'geschlossen'>('all');

  const goClose = (id: string) => flowActionFor('umfragen', 'status', id, 'geschlossen');
  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'umfragen') return undefined;
      const go = goClose(top.record.record_id);
      return go && lookupKey(top.record.fields.status) === 'offen'
        ? { label: tx('Termin festlegen & schließen'), onClick: go }
        : undefined;
    },
  });
  const enrichedUmfragen = crud.enriched.umfragen;

  const fmt = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : format(d, 'EEE dd.MM. HH:mm', { locale: dateFnsLocale() });
  };

  const cards = useMemo(() => enrichedUmfragen.map(u => {
    const options = terminvorschlaege
      .filter(t => extractRecordId(t.fields.umfrage) === u.record_id)
      .sort((a, b) => (a.fields.beginn ?? '').localeCompare(b.fields.beginn ?? ''));
    const answers = antworten.filter(a => extractRecordId(a.fields.umfrage) === u.record_id);
    const yes = (id: string) => answers.filter(a => extractRecordId(a.fields.terminvorschlag) === id && lookupKey(a.fields.antwort) === 'ja').length;
    const maybe = (id: string) => answers.filter(a => extractRecordId(a.fields.terminvorschlag) === id && lookupKey(a.fields.antwort) === 'vielleicht').length;
    const top = topOne(options, [o => yes(o.record_id), o => maybe(o.record_id)], o => o.fields.beginn);
    const people = submissionsOf(answers, { names: ['teilnehmer_vorname', 'teilnehmer_nachname'] });
    return {
      u, options, top, yes, people,
      isOpen: lookupKey(u.fields.status) !== 'geschlossen',
      isDecided: decided('umfragen', 'finaler_termin', u.fields),
    };
  }).sort((a, b) => Number(b.isOpen) - Number(a.isOpen)), [enrichedUmfragen, terminvorschlaege, antworten]);

  const open = cards.filter(c => c.isOpen);
  const closed = cards.filter(c => !c.isOpen);
  const shown = filter === 'all' ? cards : filter === 'offen' ? open : closed;
  const waiting = open.filter(c => c.options.length > 0 && c.people.length > 0);

  const context = open.length === 0
    ? tx('Keine offene Umfrage — lege eine neue an und teile den Link.')
    : waiting.length > 0
      ? tx`Zu entscheiden: ${namen(waiting.map(c => c.u.fields.titel ?? ''))}.`
      : tx`Offen: ${namen(open.map(c => c.u.fields.titel ?? ''))} — noch keine Antworten.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground">{context}</p>
        </div>
        {crud.umfragen.canWrite && (
          <Button size="lg" className="w-full sm:w-auto" onClick={() => crud.umfragen.openCreate({ status: 'offen' })}>
            <IconPlus size={18} className="shrink-0" />
            {tx('Neue Umfrage')}
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="wide"
        kpis={cards.length > 0 ? (
          <StatStrip>
            <StatStripItem
              title={tx('Offen')} value={open.length} tone={open.length > 0 ? 'primary' : 'default'}
              icon={<IconCalendarEvent size={16} />}
              onClick={() => setFilter(f => f === 'offen' ? 'all' : 'offen')} active={filter === 'offen'}
            />
            <StatStripItem
              title={tx('Geschlossen')} value={closed.length}
              icon={<IconCircleCheck size={16} />}
              onClick={() => setFilter(f => f === 'geschlossen' ? 'all' : 'geschlossen')} active={filter === 'geschlossen'}
            />
          </StatStrip>
        ) : undefined}
        primary={
          cards.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center space-y-3">
              <IconCalendarEvent size={48} className="mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">{tx('Noch keine Umfrage. Lege die erste an und teile den Link mit den Teilnehmenden.')}</p>
              {crud.umfragen.canWrite && (
                <Button size="lg" onClick={() => crud.umfragen.openCreate({ status: 'offen' })}>{tx('Erste Umfrage anlegen')}</Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map(({ u, options, top, yes, people, isOpen, isDecided }) => {
                const go = isOpen ? goClose(u.record_id) : null;
                return (
                  <div key={u.record_id} className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4">
                    <button type="button" className="min-w-0 text-left" onClick={() => crud.umfragen.openDetail(u)}>
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="truncate text-lg font-semibold">{u.fields.titel}</h2>
                        <span className={`shrink-0 text-sm font-medium ${isOpen ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {isOpen ? tx('Offen') : tx('Geschlossen')}
                        </span>
                      </div>
                      {u.fields.ort && (
                        <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted-foreground">
                          <IconMapPin size={14} className="shrink-0" />{u.fields.ort}
                        </p>
                      )}
                      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                        <IconUsers size={14} className="shrink-0" />
                        {countOf('terminvorschlaege', options.length, appLabel('terminvorschlaege'))} · {countOf('antworten', people.length, appLabel('antworten'))}
                      </p>
                    </button>

                    {isDecided ? (
                      <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                        <IconCircleCheck size={16} className="shrink-0" />
                        <span className="truncate">{tx`Final: ${u.finaler_terminName}`}</span>
                      </p>
                    ) : top && people.length > 0 && yes(top.record_id) > 0 ? (
                      <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <IconTrophy size={16} className="shrink-0" />
                        <span className="truncate">{tx`Meiste Ja: ${fmt(top.fields.beginn)} (${yes(top.record_id)})`}</span>
                      </p>
                    ) : null}

                    {go && (
                      <Button size="lg" className="w-full" onClick={go}>
                        {tx('Termin festlegen & schließen')}
                      </Button>
                    )}
                    <RecordDoorLink page="termin-abstimmen" recordId={u.record_id} qr />
                  </div>
                );
              })}
            </div>
          )
        }
      />
      {crud.surfaces}
    </div>
  );
}
