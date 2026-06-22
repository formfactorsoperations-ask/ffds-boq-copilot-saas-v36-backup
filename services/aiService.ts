import { GoogleGenAI } from '@google/genai';

// Initialize the Gemini API client
// In this environment, process.env.GEMINI_API_KEY is automatically available
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ExtractedMaterial {
    roomId: string;
    itemName: string;
    category: string;
    brand: string;
    finishCode: string;
}

export async function extractMaterialsFromText(text: string): Promise<ExtractedMaterial[]> {
    try {
        const prompt = `
You are an AI assistant for an interior design operations team.
A team member at a shop has sent a message (via WhatsApp or Email) describing one or more material selections.
Extract the details for EACH material mentioned in the text. If a detail is missing, leave it as an empty string.
Return ONLY a valid JSON ARRAY of objects with these exact keys, no markdown formatting, no backticks.

Keys for each object:
- roomId (e.g., "Master Bedroom", "Living Room", "Kitchen")
- itemName (e.g., "Wardrobe Laminate", "Sofa Fabric", "Floor Tile")
- category (Must be one of: "Laminate", "Veneer", "Flooring", "Lighting", "Sanitaryware", "Hardware", "Fabric", "Paint", "Other")
- brand (e.g., "Royal Touche", "Jaquar", "Greenply")
- finishCode (e.g., "8765-SF", "Model X")

Text to parse:
"${text}"
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.1,
            }
        });

        const responseText = response.text || '[]';
        // Clean up potential markdown formatting
        const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const parsed = JSON.parse(cleanedText);
        
        if (Array.isArray(parsed)) {
            return parsed.map(item => ({
                roomId: item.roomId || '',
                itemName: item.itemName || 'Unknown Item',
                category: item.category || 'Other',
                brand: item.brand || '',
                finishCode: item.finishCode || ''
            }));
        } else if (typeof parsed === 'object' && parsed !== null) {
             return [{
                roomId: parsed.roomId || '',
                itemName: parsed.itemName || 'Unknown Item',
                category: parsed.category || 'Other',
                brand: parsed.brand || '',
                finishCode: parsed.finishCode || ''
            }];
        }
        return [];
    } catch (error) {
        console.error("Failed to extract material info:", error);
        return [];
    }
}
