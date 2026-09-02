import { db } from "../db";

// Generic outgoing webhook notifier. No-ops silently if no URL is configured,
// so this is safe to call unconditionally from route handlers. Payload shape
// is Slack-compatible ({ text }) since that's the most common incoming-webhook
// format (Slack, Discord, Mattermost, Teams via connector).
//
// The URL is read from the DB `settings` table first (set via Manage > Integrations
// in-app), falling back to the NOTIFY_WEBHOOK_URL env var for zero-migration
// compatibility with existing deployments that only ever set the env var.
export function getWebhookUrl(): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'webhook_url'").get() as { value: string } | undefined;
  return row?.value || process.env.NOTIFY_WEBHOOK_URL || "";
}

export function notifyWebhook(text: string) {
  const url = getWebhookUrl();
  if (!url) return;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch((err) => {
    console.error("[webhook] notify failed:", err instanceof Error ? err.message : err);
  });
}
