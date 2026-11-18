/**
 * Umfrage abschließen — 3-Schritt-Wizard.
 * Steps: 1) Offene Umfrage wählen → 2) Finalen Termin aus den Vorschlägen wählen → 3) Prüfen & schließen.
 * Reads: umfragen, terminvorschlaege, antworten. Writes: umfragen (finaler_termin, status=geschlossen; update).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useRef, useState } from 'react';
import { parseISO, format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldDate, fieldLookup, fieldRef, useLiveList } from '@/lib/journey';
import { useUmfrageAbschliessenFlow } from '@/lib/journey/flows/UmfrageAbschliessen';
import { tx } from '@/i18n';

function slot(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'dd.MM.yyyy HH:mm');
  } catch {
    return iso;
  }
}

export default function UmfrageAbschliessenPage() {
  const [step, setStep] = useState(1);
  const pickedRef = useRef<string | null>(null);

  const flow = useUmfrageAbschliessenFlow({
    steps: { umfragen: 1, finaler_termin: 2 },
    items: {
      umfragen: r => ({
        id: r.id,
        title: fieldText(r, 'titel'),
        subtitle: fieldText(r, 'ort') || undefined,
        status: fieldLookup(r, 'status') ?? undefined,
      }),
      finaler_termin: r => ({
        id: r.id,
        title: slot(fieldDate(r, 'beginn')),
        subtitle: tx`bis ${slot(fieldDate(r, 'ende'))}`,
      }),
    },
    where: {
      umfragen: r => fieldLookup(r, 'status')?.key === 'offen',
      finaler_termin: r => fieldRef(r, 'umfrage') === pickedRef.current,
    },
  });

  const umfrageId = (flow.pick('umfragen').selectedId as string | null | undefined) ?? null;
  pickedRef.current = umfrageId;

  const termine = useLiveList(flow.port, 'terminvorschlaege', { intervalMs: 0, enabled: Boolean(umfrageId) });
  const antworten = useLiveList(flow.port, 'antworten', { intervalMs: 0, enabled: Boolean(umfrageId) });

  const tally = termine.records
    .filter(t => fieldRef(t, 'umfrage') === umfrageId)
    .map(t => {
      const votes = antworten.records.filter(a => fieldRef(a, 'terminvorschlag') === t.id);
      const count = (k: string) => votes.filter(a => fieldLookup(a, 'antwort')?.key === k).length;
      return { id: t.id, label: slot(fieldDate(t, 'beginn')), ja: count('ja'), vielleicht: count('vielleicht'), nein: count('nein') };
    });

  return (
    <IntentWizardShell
      title={tx('Umfrage abschließen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Wähle den finalen Termin und schließe die Umfrage ab.'),
        needs: [tx('Eine offene Umfrage mit Terminvorschlägen')],
      }}
    >
      <WizardStep label={tx('Umfrage')} description={tx('Welche offene Umfrage möchtest du abschließen?')}>
        <EntitySelectStep
          {...flow.picks.umfragen.select}
          {...flow.pick('umfragen')}
          searchPlaceholder={tx('Titel oder Ort …')}
          avatar="none"
        />
      </WizardStep>

      <WizardStep label={tx('Finaler Termin')} description={tx('Welcher Terminvorschlag soll gelten?')}>
        {umfrageId ? (
          <div className="space-y-4">
            {tally.length > 0 && (
              <div className="rounded-2xl border bg-card p-3 overflow-hidden">
                <p className="text-sm font-medium mb-2">{tx('Bisherige Antworten')}</p>
                <ul className="space-y-1 text-sm">
                  {tally.map(t => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-3">
                      <span className="min-w-0 truncate">{t.label}</span>
                      <span className="text-muted-foreground">
                        {tx`${t.ja} Ja · ${t.vielleicht} Vielleicht · ${t.nein} Nein`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <EntitySelectStep
              {...flow.picks.finaler_termin.select}
              {...flow.pick('finaler_termin')}
              avatar="none"
              emptyText={tx('Diese Umfrage hat keine Terminvorschläge.')}
            />
            <StepNav onBack={() => setStep(1)} onNext={() => flow.validateStep(2)} nextStepLabel={tx('Prüfen')} />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
          </StepNav>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[{ key: 'status', label: tx('Status'), value: tx('Geschlossen') }]}
            whatHappensNext={tx('Die Umfrage wird geschlossen und der gewählte Termin gilt als final.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          undo={flow.undo}
          next={[
            { label: tx('Umfrage mit Terminen anlegen'), href: '#/intents/umfrage-anlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
