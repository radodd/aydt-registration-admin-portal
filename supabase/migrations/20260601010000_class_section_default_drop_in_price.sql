-- Meeting-plan #10: class builder default drop-in price not persisting.
--
-- The class/offering editor lets an admin set a schedule-level default drop-in
-- price (e.g. Adult Jazz = $40). The sync action propagates that value onto each
-- generated class_meetings row (Mode B), but never stored it at the schedule
-- (class_sections) level — and class_sections had no column for it. The editor
-- hydrator (mapSemesterToDraft) reads cs.drop_in_price for the schedule default,
-- so on reopen the field was always blank and every priced date was mis-read as a
-- per-date override.
--
-- This adds the missing schedule-level column so the default round-trips, and
-- backfills it from existing meetings (the schedule default = the most common
-- non-null per-meeting price for that section).

ALTER TABLE class_sections
  ADD COLUMN drop_in_price NUMERIC(10,2) NULL CHECK (drop_in_price >= 0);

-- Backfill: for each section, the schedule-level default is the most frequent
-- non-null drop_in_price across its meetings (ties broken by the lower price).
UPDATE class_sections cs
SET drop_in_price = sub.price
FROM (
  SELECT section_id, drop_in_price AS price
  FROM (
    SELECT
      section_id,
      drop_in_price,
      ROW_NUMBER() OVER (
        PARTITION BY section_id
        ORDER BY COUNT(*) DESC, drop_in_price ASC
      ) AS rn
    FROM class_meetings
    WHERE drop_in_price IS NOT NULL
    GROUP BY section_id, drop_in_price
  ) ranked
  WHERE rn = 1
) sub
WHERE cs.id = sub.section_id;
