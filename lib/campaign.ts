export type CampaignSchedule = {
  state: string;
  opens_at: string;
  is_test: boolean;
};

export function isCampaignOpen(campaign: CampaignSchedule, now = Date.now()) {
  if (campaign.state === "open") return true;
  if (campaign.state !== "scheduled") return false;

  const opensAt = Date.parse(campaign.opens_at);
  return Number.isFinite(opensAt) && now >= opensAt;
}

export function getCampaignDisplayState(campaign: CampaignSchedule, now = Date.now()) {
  return isCampaignOpen(campaign, now) ? "open" : campaign.state;
}

export function campaignOpenDelay(campaign: CampaignSchedule, now = Date.now()) {
  if (campaign.state !== "scheduled") return null;

  const opensAt = Date.parse(campaign.opens_at);
  if (!Number.isFinite(opensAt)) return null;

  return Math.max(0, opensAt - now);
}

export function campaignCountdown(campaign: CampaignSchedule, now = Date.now()) {
  const delay = campaignOpenDelay(campaign, now);
  if (delay === null || delay === 0) return null;

  const totalSeconds = Math.ceil(delay / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatCountdown(countdown: ReturnType<typeof campaignCountdown>) {
  if (!countdown) return null;

  if (countdown.hours >= 24) {
    const days = Math.floor(countdown.hours / 24);
    const hours = countdown.hours % 24;
    const dayLabel = `${days} hari`;
    return hours > 0 ? `${dayLabel} ${hours} jam` : dayLabel;
  }

  return [countdown.hours, countdown.minutes, countdown.seconds]
    .map(value => String(value).padStart(2, "0"))
    .join(":");
}
