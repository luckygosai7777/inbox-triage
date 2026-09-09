/* Bulk send: the four-step composer.

   The campaign lives on the server. localStorage only remembers which campaign
   was open and where the user had got to, so a reload mid-flight resumes. */
import { useCallback, useEffect, useState } from 'react';

import { api } from '../api/client.js';
import StepDocuments from '../components/bulk/StepDocuments.jsx';
import StepMessage from '../components/bulk/StepMessage.jsx';
import StepRecipients from '../components/bulk/StepRecipients.jsx';
import StepSend from '../components/bulk/StepSend.jsx';
import { ErrorNote, Spinner } from '../components/ui.jsx';
import { useApp } from '../state/AppContext.jsx';
import { loadCampaignState, saveCampaignState } from '../state/campaignStorage.js';

const STEPS = [
  { n: 1, label: 'Documents' },
  { n: 2, label: 'Recipients' },
  { n: 3, label: 'Message' },
  { n: 4, label: 'Send' },
];

export default function BulkSendView() {
  const { say } = useApp();
  const [campaign, setCampaign] = useState(null);
  const [useCases, setUseCases] = useState([]);
  const [step, setStep] = useState(() => loadCampaignState().step);
  const [previewIndex, setPreviewIndex] = useState(() => loadCampaignState().previewIndex);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pick up where the user left off: the remembered campaign if it still
  // exists, otherwise the most recent one, otherwise create a fresh draft.
  const boot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [templates, list] = await Promise.all([api.useCases(), api.campaigns()]);
      setUseCases(templates.use_cases || []);

      const remembered = loadCampaignState().campaignId;
      const existing =
        list.results.find((row) => row.id === remembered) || list.results[0] || null;

      setCampaign(existing || (await api.createCampaign({ use_case: 'Job application' })));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (campaign) saveCampaignState({ campaignId: campaign.id, step, previewIndex });
  }, [campaign, step, previewIndex]);

  const reload = useCallback(async () => {
    if (!campaign) return;
    try {
      setCampaign(await api.campaign(campaign.id));
    } catch (caught) {
      say(caught.message);
    }
  }, [campaign, say]);

  const patch = useCallback(
    async (fields) => {
      if (!campaign) return;
      try {
        setCampaign(await api.updateCampaign(campaign.id, fields));
      } catch (caught) {
        say(caught.message);
      }
    },
    [campaign, say],
  );

  const goTo = (target) => {
    setStep(target);
    if (campaign && campaign.step !== target) patch({ step: target });
  };

  if (loading) return <Spinner label="Loading campaign" />;

  if (error) {
    return (
      <div className="section">
        <div className="col-main">
          <ErrorNote error={error} onRetry={boot} />
        </div>
      </div>
    );
  }

  if (!campaign) return null;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="h1">Bulk send</h1>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            One message, personalised per recipient, sent on a queue
          </p>
        </div>
        <div
          className="row gap-8"
          style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-pill)',
            padding: '7px 14px',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background:
                campaign.state === 'review'
                  ? 'var(--accent)'
                  : campaign.state === 'done'
                    ? 'var(--success)'
                    : 'var(--text-tertiary)',
            }}
          />
          <span className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {campaign.state === 'review'
              ? 'Reviewing'
              : campaign.state === 'done'
                ? 'Finished'
                : 'Draft'}
          </span>
          <span className="mono muted">
            {campaign.cursor}/{campaign.total_count}
          </span>
        </div>
      </header>

      <section className="section" style={{ display: 'block' }}>
        <div className="steps">
          {STEPS.map((item) => (
            <div key={item.n} className="row gap-8">
              <button
                type="button"
                className="step-btn"
                data-state={step === item.n ? 'active' : step > item.n ? 'passed' : 'todo'}
                onClick={() => goTo(item.n)}
              >
                <span className="step-num">{item.n}</span>
                <span className="step-label">{item.label}</span>
              </button>
              {item.n < 4 && <span className="step-sep" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <StepDocuments
            campaign={campaign}
            reload={reload}
            say={say}
            onNext={() => goTo(2)}
          />
        )}
        {step === 2 && (
          <StepRecipients
            campaign={campaign}
            reload={reload}
            say={say}
            onNext={() => goTo(3)}
            onBack={() => goTo(1)}
          />
        )}
        {step === 3 && (
          <StepMessage
            campaign={campaign}
            useCases={useCases}
            patch={patch}
            reload={reload}
            say={say}
            previewIndex={previewIndex}
            setPreviewIndex={setPreviewIndex}
            onNext={() => goTo(4)}
            onBack={() => goTo(2)}
          />
        )}
        {step === 4 && (
          <StepSend
            campaign={campaign}
            patch={patch}
            reload={reload}
            say={say}
            onBack={() => goTo(3)}
          />
        )}
      </section>
    </>
  );
}
