-- #53 Scheduled-payment auto-retry over business days.
--
-- The recurring-charge job (process-overdue-payments) already retries a declined
-- installment up to 3 times and only alerts AYDT on the final decline. But with no
-- per-attempt date gate it burned all 3 attempts on consecutive ~5-minute cron
-- ticks. This column spaces the retries: after each decline the job sets
-- next_attempt_date to the next business day (weekdays only) and re-charges an
-- installment only once its retry date has arrived.

ALTER TABLE order_payment_installments
  ADD COLUMN next_attempt_date date;

COMMENT ON COLUMN order_payment_installments.next_attempt_date IS
  'Earliest date the recurring-charge job may next attempt this installment. NULL = eligible on the first run after it goes overdue. Set to the next business day after each decline; the 3rd decline moves status to ''failed'' and stops retries.';
