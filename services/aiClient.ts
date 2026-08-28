import { GoogleGenAI } from "@google/genai";

const MAX_RETRIES = 3;

export const getAi = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Wrap generateContent to implement retry logic
  const originalGenerateContent = ai.models.generateContent;
  
  ai.models.generateContent = async (params: any) => {
    let retries = 0;
    while (true) {
      try {
        return await originalGenerateContent.call(ai.models, params);
      } catch (error: any) {
        if (error.status === 429 && retries < MAX_RETRIES) {
          retries++;
          const delay = Math.pow(2, retries) * 1000;
          console.warn(`Rate limit hit. Retrying in ${delay}ms... (Attempt ${retries}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
  };

  return ai;
};
