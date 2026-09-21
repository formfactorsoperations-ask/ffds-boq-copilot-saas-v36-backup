/**
 * THE MODELS THIS STUDIO CALLS.
 *
 * Every Gemini model name used to be written at its call site -- forty-six of
 * them across five files, in a mix of single and double quotes. That is fine
 * until Google retires one: `gemini-2.0-flash` now answers
 *
 *   404 - This model models/gemini-2.0-flash is no longer available.
 *
 * and answering that means finding and editing every site. Worse, the names
 * had already drifted apart on their own: thirty-two calls sat on 3.5-flash
 * while seven others had been moved on to newer models, so "which model does
 * the app use" had no single answer.
 *
 * Named by the job rather than the version number, so upgrading one tier does
 * not require re-reading what each call site was trying to do.
 */

/**
 * The workhorse. Extraction, classification, short structured answers -- the
 * great majority of calls, and the one to change when the default moves on.
 */
export const FLASH_MODEL = "gemini-3.6-flash";

/**
 * Heavier analysis and generation, where the extra capability is worth the
 * latency: execution-risk analysis, template generation and auditing, room
 * item suggestion.
 */
export const REASONING_MODEL = "gemini-3.7-flash";

/**
 * The one job given a pro model rather than flash: generating the tiered BOQ
 * packages, which is the longest and most consequential piece of reasoning
 * the studio asks for.
 */
export const PRO_MODEL = "gemini-3.1-pro-preview";
