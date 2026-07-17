const fs = require('fs');

let code = fs.readFileSync('services/weeklyReportCompiler.ts', 'utf8');

const importStatement = `import { GoogleGenAI } from "@google/genai";\n`;
if (!code.includes('GoogleGenAI')) {
    code = importStatement + code;
}

const generateNarrativeCode = `
export async function generateReportNarrative(snapshot: any, attempt = 1): Promise<{ weekAtAGlance: string, comingUpNextWeek: string } | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    const ai = new GoogleGenAI({ apiKey });
    const prompt = \`You write the narrative for a weekly client progress report for an interior design project. You receive a JSON snapshot of verified project state. Write:
1. weekAtAGlance: 3–5 sentences, warm-professional, plain English, no jargon.
2. comingUpNextWeek: 2–3 sentences.
HARD RULES: Use ONLY facts present in the JSON. NEVER invent numbers, dates, amounts, percentages or names. Every number you mention must appear verbatim in the JSON. Refer to money only as already formatted in the JSON. Do not speculate about client satisfaction. Do not apologise. If execution.locked is true, state plainly that execution begins after the Design Complete Gate. Return ONLY strict JSON: { "weekAtAGlance": string, "comingUpNextWeek": string }. No markdown fences.

SNAPSHOT:
\${JSON.stringify(snapshot, null, 2)}\`;

    try {
        const response = await ai.models.generateContent({ 
            model: 'gemini-3.5-flash', 
            contents: prompt, 
            config: { 
                temperature: 0.2, 
                responseMimeType: "application/json" 
            } 
        });
        
        let text = response.text || '';
        // Some robust JSON parsing in case of markdown fences
        if (text.startsWith('\`\`\`')) {
            const lines = text.split('\\n');
            if (lines.length > 2) {
                text = lines.slice(1, -1).join('\\n');
            }
        }
        const narrative = JSON.parse(text);
        
        // POST-PROCESSING GUARD
        const snapshotStr = JSON.stringify(snapshot);
        const combinedText = (narrative.weekAtAGlance || '') + ' ' + (narrative.comingUpNextWeek || '');
        const numberRegex = /(?:₹\\s*)?[\\d,]+(?:\\.\\d+)?/g;
        const matches = combinedText.match(numberRegex) || [];
        
        let failed = false;
        for (const match of matches) {
            if (!snapshotStr.includes(match)) {
                failed = true;
                break;
            }
        }
        
        if (failed) {
            if (attempt === 1) {
                return generateReportNarrative(snapshot, 2);
            }
            return null; // verification failed twice
        }
        
        return {
            weekAtAGlance: narrative.weekAtAGlance || '',
            comingUpNextWeek: narrative.comingUpNextWeek || ''
        };
    } catch (e) {
        if (attempt === 1) {
            return generateReportNarrative(snapshot, 2);
        }
        return null;
    }
}
`;

code = code.replace(/export async function compileWeeklyReport/, generateNarrativeCode + '\nexport async function compileWeeklyReport');

// Update compileWeeklyReport to call generateReportNarrative
code = code.replace(/const newReport = \{[\s\S]*?createdAt: Date\.now\(\),[\s\S]*?snapshot: cleanSnapshot\n    \};/, 
    `const narrativeResult = await generateReportNarrative(cleanSnapshot);
    const newReport = {
        id: reportId,
        periodStart,
        periodEnd,
        status: 'draft',
        createdAt: Date.now(),
        snapshot: cleanSnapshot,
        narrative: narrativeResult 
            ? { ...narrativeResult, approvedByOwner: false } 
            : null,
        narrativeError: narrativeResult ? null : 'Failed to verify narrative facts against project data.'
    };`);

fs.writeFileSync('services/weeklyReportCompiler.ts', code);
console.log('Added generateReportNarrative');
