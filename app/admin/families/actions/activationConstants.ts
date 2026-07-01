/**
 * Largest cohort a single activation-invite batch may send (#62, Option A).
 * Keeps outbound email + Supabase auth load bounded and nudges the admin toward
 * the small -> large rollout. Shared by the server action and the console UI, so
 * it can't live in the "use server" action module (those export only functions).
 */
export const MAX_ACTIVATION_BATCH = 200;
