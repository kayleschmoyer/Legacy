/**
 * @interface LLMProvider
 *
 * Contract for all LLM review providers used by the bot-review system.
 * Each provider encapsulates how to call a specific model/service and
 * returns the model's raw review text.
 */

/**
 * Review a pull request diff using a language model.
 *
 * @function review
 * @memberof LLMProvider
 * @param {object} params
 * @param {string} params.system - System prompt (reviewer persona, instructions, context)
 * @param {string} params.user   - User prompt (the diff / content to review)
 * @returns {Promise<string>} The model's review text
 * @throws {Error} If the provider call fails or returns a non-zero exit code
 */
