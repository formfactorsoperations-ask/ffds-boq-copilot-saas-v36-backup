/*
  The schema type names Gemini's structured output takes (responseSchema).

  The same strings as the SDK's `Type` enum. The browser imported that enum
  from @google/genai, which pulled the whole SDK (about 1.2 MB with the regex
  engine it brings) into the first download, though every AI call in the
  browser goes through the server-side proxy (services/aiClient.ts) and the
  enum was all it used.
*/
export const Type = {
  TYPE_UNSPECIFIED: 'TYPE_UNSPECIFIED',
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  INTEGER: 'INTEGER',
  BOOLEAN: 'BOOLEAN',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT',
  NULL: 'NULL',
} as const;
