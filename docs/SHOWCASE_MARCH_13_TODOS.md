# AYDT Parent Portal – Showcase Debrief & To-Do List

**Meeting Date:** March 13, 2026 | **Duration:** ~60 min
**Recording:** https://fathom.video/share/S9CujzygyEYzcyeNtub4td_P5rvjoniz

---

## Summary

Ethan demoed the current state of the admin portal to AYDT. Topics covered:

- Competition track class creation and invite/audition flow
- Class-level enrollment requirements (concurrent, teacher rec, prerequisite, audition)
- Payment step: tuition rate bands, special programs, fee config
- Discount + promo code tabs
- Email broadcast flow (recipients selector, TipTap editor, preview, test send)
- Admin registration flow (families → register dancer → class selection → questions → checkout)
- Pre-registration landing page (not demoed due to time/disorganization)

Key themes: AYDT wants more **admin control** (fee exemptions, tuition overrides, block/warning toggles), cleaner **invite/audition email flow**, and smoother **checkout** with monthly plan selection visible.
I have a question about what the endpoints would look like once in production. The domain aydt.nyc already has a website deployed with Squarespace, and then when this registration portal is done, the site will be deployed if the intent is to be tied into the aydt.nyc domain. What would that domain look like if there's already an existing website on another platform?

---

## AYDT Action Items

- [ ] Send Canva branding board to Ethan for email color palette

---

## Ethan's To-Do List

### SMS

- [ ] **Complete SMS full integration** — charge $50 setup fee to AYDT card, then wire up Twilio/provider end-to-end (session cancellations, waitlist notifications, etc.)

---

### Class & Semester Management

- [x] **Enrollment requirements — refine types**
  - Keep: `prerequisite`, `teacher_recommendation` (soft), `audition_required`, `concurrent_enrollment`
  - Remove: `skill_qualification` (redundant with prerequisite)
  - Flush out `concurrent_enrollment` logic (what class must be co-enrolled?)
  - Teacher rec: implement as soft warning; add ability to upload an approved-dancer list so the system can auto-validate
  - Audition required: hard block until admin marks dancer as passed

- [x] **Add per-class tuition override field** in Classes & Offerings form
  - Competition and Pointe have different rates than the division default
  - Admin should be able to type in a flat override that bypasses rate-band lookup

- [x] **Resolve Point class question** _(needs AYDT decision)_
  - Option A: add-on session under a parent class (hidden from catalog, only visible to enrolled dancers)
  - Option B: standalone class with enrollment requirement gating
  - Either way, implement chosen approach once AYDT decides

---

### Payment Step

- [x] **Add semester-level fee-exemption controls** in Fee Config tab
  - Current: hard-coded text "Technique, Pointe, Competition are exempt from senior division fee"
  - Replace with: multi-select or per-class toggle so admin can add/remove exemptions without code changes
  - Future-proof: any new class type can be marked exempt by admin

- [x] **Auto-populate Technique 1/2/3 special program rates**
  - Currently admin must manually enter these in Special Programs tab
  - Investigate mapping class name/code → auto-fill rate when class is added to semester

- [x] **Monthly payment plan: surface $25 admin fee in checkout**
  - Admin reg flow step 3 (checkout): add payment plan selector (Full vs Monthly)
  - When Monthly is selected, show $25 fee line item and 5-installment schedule
  - Note: blocked on Elavon hosted-component integration (in progress)

---

### Discounts / Promo Codes

- [x] **Fix discount code input — zeros bug**
  - Input fields for dollar/percentage amounts are showing unexpected zeros
  - Reproduce and fix validation/formatting on the coupon form

---

### Competition Invites & Auditions

- [x] **Fix invite/audition email flow**
  - Auto-populate email body with invite details (dancer name, class, link, date)
  - Replace draft link with the correct public-facing registration/acceptance URL
  - Add a one-click "Send Email" button on the invite card (no copy-paste required)
  - Verify activity log updates when recipient clicks the link

---

### Email Editor

- [ ] **Image resizing in TipTap email editor**
  - Toolbar shows alignment options but no resize handle
  - Add Small / Medium / Large (or px width) size selector for inserted images, consistent with banner height control

- [ ] **PDF attachment support in email editor**
  - Currently no way to attach a PDF (e.g., flyers, schedules)
  - Add file attachment UI; store in Supabase storage, insert download link into email body

- [ ] **Update email color palette**
  - Awaiting Canva branding board from AYDT
  - Once received, update preset colors in TipTap toolbar to match official brand

---

### Admin Registration Flow

- [ ] **Add class search in admin registration flow**
  - When selecting classes for a dancer, the list will be long — add a search/filter input
  - Filtering by name, discipline, or division would be most useful

---

### Documentation

- [ ] **Create hard-blocks vs. soft-warnings reference doc** in shared Google Doc
  - List every enforcement point: age restriction, grade restriction, time conflict, enrollment requirement, division mismatch
  - For each: is it a hard block (prevents progression) or soft warning (notifies but allows override)?
  - Share link with AYDT so they have a reference

---

### Gaps / Unresolved Items

| Gap                                     | Status      | Notes                                                                                          |
| --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Pre-registration landing page           | Not demoed  | Endpoint unclear during meeting; needs a clear URL and end-to-end test                         |
| Teacher recommendation upload list      | No decision | AYDT suggested uploading approved-dancer CSV; design needed                                    |
| Elavon hosted-payment component         | In progress | Blocks monthly plan checkout; Ethan met with Elavon SWE the evening of March 12                |
| Competition track as its own division   | No decision | Currently under Senior; leaving as-is until AYDT decides if it needs separate tuition category |
| Pointe as add-on vs. standalone         | No decision | Deferred; AYDT to confirm preferred UX                                                         |
| Session cancellation SMS/email triggers | Not started | Mentioned during SMS discussion; needs dedicated flow                                          |

---

## Priority Order (suggested)

1. Fix discount zeros bug (quick, blocking demo polish)
2. Image resizing in email editor (quick, visible UX gap)
3. Invite/audition email auto-populate + send button (moderate, key competition-track flow)
4. Tuition override per class (moderate, needed before real data entry)
5. Fee-exemption admin controls (moderate, future-proofing)
6. Enrollment requirements refine + concurrent enrollment logic (moderate)
7. Class search in admin reg flow (moderate)
8. Monthly plan in checkout — unblocks after Elavon component lands (dependent)
9. SMS full integration (ongoing, $50 charge first)
10. PDF attachments in email editor (lower priority)
11. Hard-block/soft-warning doc (documentation, do alongside #6)
