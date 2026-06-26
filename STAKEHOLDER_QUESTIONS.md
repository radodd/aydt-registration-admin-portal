# Stakeholder Input Needed

Running list of open questions that require stakeholder (client) input before we
can build or finalize a decision. Add new items to the **Open** section; move
resolved items to **Resolved** with the answer and date.

---

## Open

### 1. What is the use case for the "Coming Soon" landing page + pre-registration flow?

**The ask:** Explain the intended real-world use case for the pre-registration /
"Coming Soon" experience. Specifically:

- Who is supposed to see the Coming Soon landing page, and when?
- Should the public (families, not logged in) be able to see a semester
  **before** it's published — e.g. to "pre-register" or get on a notify list?
- If yes, how do families reach it — a link AYDT shares, a public listing, or
  something else?
- Is the "notify me when registration opens" email signup a feature you actually
  want live, or leftover from an earlier idea?

**Why we're asking (current technical reality):**

- The Coming Soon landing (countdown + "Get notified when registration opens"
  form) **only renders for semesters in `scheduled` status** (before publish).
- But database security rules (RLS) only let the **public read `published`
  semesters**. A logged-out family hitting a `scheduled` semester gets a **404**.
- Net effect today: **no public/family user can actually reach the Coming Soon
  landing or the notify-me form**, so the subscription confirmation email
  effectively never fires in production. Only logged-in admins can see it.
- There is **no semester-level "share before publish" link** today. The only
  pre-publish share mechanism is the **competition/audition invite link**
  (`/audition/{token}`), which is per-class, invite-only, and shows a class
  booking page — not the semester Coming Soon view.

**What their answer unblocks:** whether we (a) wire up a public/share path so
families can reach pre-registration (new RLS read for scheduled + a share link,
modeled on the audition token flow), (b) leave it admin-only, or (c) remove the
Coming Soon / notify-me flow entirely.

**Status:** awaiting stakeholder input.
**Related:** memory `project_prereg_landing_rls_unreachable`; email-template
flag #44 (the subscription confirmation email is still on the old template).

---

## Resolved

_(none yet)_
