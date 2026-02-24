/**
 * Email variable resolution utility.
 *
 * Resolves {{token}} placeholders in an email HTML template using
 * structured context data. Designed to be server-side only and
 * extensible for future variable additions.
 *
 * Usage:
 *   const html = resolveEmailVariables(templateHtml, { parent, participant, semester, session });
 */

export interface EmailParticipant {
  firstName: string;
  lastName: string;
}

export interface EmailSemester {
  name: string;
}

export interface EmailSession {
  name: string;
}

export interface EmailVariableContext {
  parent?: {
    firstName: string;
    lastName: string;
  } | null;
  participant?: EmailParticipant | null;
  semester?: EmailSemester | null;
  session?: EmailSession | null;
}

/**
 * Resolves all supported {{variable}} tokens in a template HTML string.
 * Unknown tokens are left unchanged (e.g. {{future_var}} stays as-is).
 */
export function resolveEmailVariables(
  templateHtml: string,
  context: EmailVariableContext,
): string {
  const vars: Record<string, string> = {
    parent_name: context.parent
      ? `${context.parent.firstName} ${context.parent.lastName}`.trim()
      : "",
    student_name: context.participant
      ? `${context.participant.firstName} ${context.participant.lastName}`.trim()
      : "",
    semester_name: context.semester?.name ?? "",
    session_name: context.session?.name ?? "",
  };

  return templateHtml.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => vars[key] ?? `{{${key}}}`,
  );
}

/**
 * Mock context used in previews and test sends.
 * Represents a realistic sample recipient.
 */
export const MOCK_EMAIL_CONTEXT: EmailVariableContext = {
  parent: { firstName: "Alex", lastName: "Johnson" },
  participant: { firstName: "Emma", lastName: "Johnson" },
  semester: { name: "Spring 2025" },
  session: { name: "Ballet Fundamentals" },
};

/**
 * Convenience wrapper: apply mock tokens for preview/test purposes.
 */
export function applyMockTokens(templateHtml: string): string {
  return resolveEmailVariables(templateHtml, MOCK_EMAIL_CONTEXT);
}
