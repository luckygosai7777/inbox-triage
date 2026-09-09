/* localStorage for the bulk-send composer.

   The server owns the campaign record. What is kept here is the small amount of
   local UI state that would otherwise be lost on reload mid-flight: which
   campaign was open, which step, and which recipient the preview was showing.
   Every read is defensive - a private window, cleared site data, or a browser
   set to block storage all make these throw. */

const KEY = 'inboxTriage.campaign.v1';

const EMPTY = { campaignId: null, step: 1, previewIndex: 0 };

export function loadCampaignState() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const saved = JSON.parse(raw);
    return {
      campaignId: Number.isFinite(saved.campaignId) ? saved.campaignId : null,
      step: [1, 2, 3, 4].includes(saved.step) ? saved.step : 1,
      previewIndex: Number.isFinite(saved.previewIndex) ? Math.max(0, saved.previewIndex) : 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveCampaignState(state) {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        campaignId: state.campaignId ?? null,
        step: state.step ?? 1,
        previewIndex: state.previewIndex ?? 0,
      }),
    );
  } catch {
    /* storage unavailable - the server still holds the campaign itself */
  }
}

export function clearCampaignState() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
