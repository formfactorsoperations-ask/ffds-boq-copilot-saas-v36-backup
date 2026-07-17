const fs = require('fs');

let code = fs.readFileSync('src/tests/weeklyReportCompiler.test.ts', 'utf8');

code = code.replace(/GoogleGenAI: vi\.fn\(\)\.mockImplementation\(\(\) => \{/, 'GoogleGenAI: class { constructor() {');
code = code.replace(/return \{/g, 'this.models = {');
code = code.replace(/models: \{/, '');
code = code.replace(/generateContent: vi\.fn\(\)\.mockImplementation\(async \(\{ contents \}\) => \{/, 'generateContent = vi.fn().mockImplementation(async ({ contents }) => {');

// I'll just rewrite the file replacing the whole mock block.
code = code.replace(/vi\.mock\('@google\/genai', \(\) => \{[\s\S]*?\}\);/, `vi.mock('@google/genai', () => {
    return {
        GoogleGenAI: class {
            models = {
                generateContent: vi.fn().mockImplementation(async ({ contents }) => {
                    if (contents.includes('"bad_fact"')) {
                        return { text: '{"weekAtAGlance": "The cost is ₹1,000,000.", "comingUpNextWeek": "Nothing."}' };
                    }
                    if (contents.includes('"no_numbers"')) {
                        return { text: '{"weekAtAGlance": "All good.", "comingUpNextWeek": "Nothing."}' };
                    }
                    return { text: '{"weekAtAGlance": "The cost is ₹5,000.", "comingUpNextWeek": "Nothing."}' };
                })
            };
        }
    };
});`);

fs.writeFileSync('src/tests/weeklyReportCompiler.test.ts', code);
