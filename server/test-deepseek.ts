
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testDeepSeek() {
    const apiKey = process.env.VITE_DEEPSEEK_API_KEY;
    console.log('🔑 API Key present:', !!apiKey);

    if (!apiKey) {
        console.error('❌ No API Key found!');
        return;
    }

    const endpoint = 'https://api.deepseek.com/chat/completions';

    console.log('📡 Connecting to:', endpoint);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-coder',
                messages: [
                    { role: 'system', content: 'You are a helper.' },
                    { role: 'user', content: 'Say hello world in JSON.' }
                ],
                stream: false
            })
        });

        console.log('📥 Status:', response.status);

        const text = await response.text();
        console.log('📄 Raw Response:', text.substring(0, 500)); // First 500 chars

        if (!response.ok) {
            console.error('❌ Request failed');
            return;
        }

        const data = JSON.parse(text);
        console.log('✅ Parsed Data Valid:', !!data.choices);
        if (data.choices && data.choices.length > 0) {
            console.log('💬 Content:', data.choices[0].message.content);
        } else {
            console.error('⚠️ No choices in response');
        }

    } catch (error) {
        console.error('❌ Exception:', error);
    }
}

testDeepSeek();
