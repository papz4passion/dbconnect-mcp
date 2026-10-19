const MASK = "****";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface RedactorSecrets {
  password?: string;
  connectionStrings?: string[];
}

export type Redactor = (text: string) => string;

const URI_CREDENTIALS_PATTERN = /(\w+:\/\/[^:/?#\s]*:)([^@/?#\s]*)(@)/g;

function maskUriCredentials(text: string): string {
  return text.replace(URI_CREDENTIALS_PATTERN, (_match, prefix: string, _pass: string, at: string) => {
    return `${prefix}${MASK}${at}`;
  });
}

export function createRedactor(secrets: RedactorSecrets): Redactor {
  const literals = new Set<string>();

  if (secrets.password && secrets.password.length > 0) {
    literals.add(secrets.password);
    try {
      literals.add(encodeURIComponent(secrets.password));
    } catch {
      // ignore encode failures for unusual input
    }
  }

  for (const cs of secrets.connectionStrings ?? []) {
    if (!cs) continue;
    try {
      const match = /^\w+:\/\/[^:/?#\s]*:([^@/?#\s]*)@/.exec(cs);
      if (match && match[1]) {
        literals.add(match[1]);
        try {
          literals.add(decodeURIComponent(match[1]));
        } catch {
          // not URL-encoded, ignore
        }
      }
    } catch {
      // ignore malformed connection strings; URI-pattern masking still applies
    }
  }

  const literalPatterns = [...literals]
    .filter((s) => s.length > 0)
    .sort((a, b) => b.length - a.length)
    .map((s) => new RegExp(escapeRegExp(s), "g"));

  return function redact(text: string): string {
    if (!text) return text;
    let result = maskUriCredentials(text);
    for (const pattern of literalPatterns) {
      result = result.replace(pattern, MASK);
    }
    return result;
  };
}

export const identityRedactor: Redactor = (text: string) => text;
