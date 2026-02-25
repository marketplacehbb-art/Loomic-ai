import http from 'node:http';

const BASE_URL = 'http://localhost:3000';

const endpoints = [
    { path: '/api/csrf-token', expected: 200 }
];

async function checkUrl(path, expected) {
    return new Promise((resolve) => {
        console.log(`Checking ${BASE_URL}${path}...`);
        http.get(BASE_URL + path, (res) => {
            if (res.statusCode === expected) {
                console.log(`✅ [${res.statusCode}] ${path}`);
                resolve(true);
            } else {
                console.error(`❌ [${res.statusCode}] ${path} (Expected ${expected})`);
                resolve(false);
            }
        }).on('error', (e) => {
            console.error(`❌ [ERROR] ${path}: ${e.message}`);
            resolve(false);
        });
    });
}

(async () => {
    console.log('--- Verifying CSRF Endpoint ---');
    const pass = await checkUrl('/api/csrf-token', 200);

    if (pass) {
        console.log('\nCSRF Endpoint is accessible.');
    } else {
        console.error('\nCSRF Endpoint failed. Server might need restart.');
    }
})();
