import 'dotenv/config';
const apiKey = process.env.VITE_GEMINI_API_KEY; // This is actually the OpenRouter key now
if (!apiKey) {
    console.error('No API Key found');
    return;
}

const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
        Authorization: `Bearer ${apiKey}`
    }
});

const data = await response.json();
const geminiModels = data.data.filter((m: any) => m.id.includes('gemini') && m.id.includes('free'));
console.log('Available Free Gemini Models:', geminiModels.map((m: any) => m.id));
}

checkModel();
