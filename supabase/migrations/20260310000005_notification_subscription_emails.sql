-- Tracks confirmation emails sent when a user subscribes for pre-registration notifications.
-- Separate from email_deliveries (which is FK'd to the broadcast emails table).
-- The existing Resend webhook handler (app/api/webhooks/resend/route.ts) updates this table
-- via resend_message_id when open/bounce/delivered events arrive.

CREATE TABLE notification_subscription_emails (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id     UUID        REFERENCES email_subscribers(id) ON DELETE CASCADE,
  semester_id       UUID        REFERENCES semesters(id) ON DELETE SET NULL,
  email             TEXT        NOT NULL,
  resend_message_id TEXT        UNIQUE,
  -- 'sent' | 'failed' | 'delivered' | 'opened' | 'bounced' | 'complained'
  status            TEXT        NOT NULL DEFAULT 'sent',
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at      TIMESTAMPTZ,
  opened_at         TIMESTAMPTZ,
  clicked_at        TIMESTAMPTZ,
  bounced_at        TIMESTAMPTZ
);

ALTER TABLE notification_subscription_emails ENABLE ROW LEVEL SECURITY;

-- Admins can read all rows for dashboard reporting
CREATE POLICY "admin read notification_subscription_emails"
  ON notification_subscription_emails
  FOR SELECT
  USING (is_admin_or_super());

-- Service role (used by server actions + webhook) bypasses RLS automatically
