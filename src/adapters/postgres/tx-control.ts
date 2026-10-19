const TRANSACTION_CONTROL_KEYWORDS = new Set([
  "begin",
  "start",
  "commit",
  "end",
  "rollback",
  "abort",
  "savepoint",
  "release",
]);

// Multi-word forms are checked against the first two keywords.
const TWO_WORD_FORMS = new Set([
  "prepare transaction",
  "commit prepared",
  "rollback prepared",
  "set transaction",
  "set session",
]);

function stripLeadingWhitespaceAndComments(sql: string): string {
  let text = sql;
  for (;;) {
    const trimmed = text.replace(/^\s+/, "");
    if (trimmed.startsWith("--")) {
      const newlineIdx = trimmed.indexOf("\n");
      text = newlineIdx === -1 ? "" : trimmed.slice(newlineIdx + 1);
      continue;
    }
    if (trimmed.startsWith("/*")) {
      const endIdx = trimmed.indexOf("*/");
      text = endIdx === -1 ? "" : trimmed.slice(endIdx + 2);
      continue;
    }
    if (trimmed !== text) {
      text = trimmed;
      continue;
    }
    return trimmed;
  }
}

export function isTransactionControlStatement(sql: string): boolean {
  const stripped = stripLeadingWhitespaceAndComments(sql);
  const wordMatch = /^([A-Za-z]+)(?:\s+([A-Za-z]+))?/.exec(stripped);
  if (!wordMatch) return false;

  const first = wordMatch[1]?.toLowerCase() ?? "";
  const second = wordMatch[2]?.toLowerCase();

  if (TRANSACTION_CONTROL_KEYWORDS.has(first)) return true;

  if (second) {
    const twoWord = `${first} ${second}`;
    if (TWO_WORD_FORMS.has(twoWord)) return true;
  }
  if (first === "set" && second === "session") return true;

  return false;
}
