/*
  The browser's schema type names (services/aiSchema.ts) stand in for the
  Gemini SDK's `Type` enum so the SDK stays out of the browser bundle. They
  must be the very strings the SDK sends.
*/
import { test, expect } from 'vitest';
import { Type as SdkType } from '@google/genai';
import { Type } from '../../services/aiSchema';

test('every schema type name matches the SDK', () => {
  for (const [k, v] of Object.entries(Type)) expect((SdkType as any)[k]).toBe(v);
  for (const k of ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT']) expect(Type).toHaveProperty(k);
});
