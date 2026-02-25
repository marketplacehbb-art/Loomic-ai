const BASE_URL = 'http://127.0.0.1:3000';

function getSetCookies(headers) {
    if (typeof headers.getSetCookie === 'function') {
        return headers.getSetCookie();
    }

    const cookie = headers.get('set-cookie');
    return cookie ? [cookie] : [];
}

async function runTests() {
    console.log('🔒 Verifying HttpOnly Auth Refactor (with CSRF)...');

    // 0. Fetch CSRF Token
    console.log('\n[TEST 0] Fetching CSRF Token...');
    let csrfToken = '';
    let cookies = []; // Store preliminary cookies (like _csrf)
    try {
        const res = await fetch(`${BASE_URL}/api/csrf-token`);
        const data = await res.json();
        csrfToken = data.csrfToken;

        // Capture cookies from CSRF response (important for csurf middleware)
        const rawCookies = getSetCookies(res.headers);
        if (rawCookies) {
            cookies = rawCookies.map(c => c.split(';')[0]);
        }

        console.log('✅ CSRF Token obtained:', csrfToken);
    } catch (e) {
        console.error('❌ CSRF Fetch Failed', e);
        return;
    }

    // 1. Login
    console.log('\n[TEST 1] Testing Login & Cookie Setting...');
    try {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
                'Cookie': cookies.join('; ')
            },
            body: JSON.stringify({ email: 'test@example.com', otp: '123456' })
        });

        // Check for Set-Cookie header
        const resCookies = getSetCookies(res.headers);
        let tokenCookieFound = false;

        if (resCookies) {
            const tokenCookie = resCookies.find(c => c.includes('token='));
            if (tokenCookie && tokenCookie.includes('HttpOnly')) {
                console.log('✅ Login Response Set-Cookie Header FOUND and is HttpOnly');
                tokenCookieFound = true;
                cookies.push(tokenCookie.split(';')[0]);
            }
        }

        if (!tokenCookieFound) {
            console.error('❌ Login Response missing correct Set-Cookie header', resCookies);
        }

        if (res.ok) console.log('✅ Login Status OK');
        else console.error('❌ Login Failed', res.status);

    } catch (e) {
        console.error('❌ Login Exception', e);
    }

    // 2. Check /me with Cookie
    if (cookies.some(c => c.includes('token='))) {
        console.log('\n[TEST 2] Testing /me with Cookie...');
        try {
            const res = await fetch(`${BASE_URL}/api/auth/me`, {
                headers: { 'Cookie': cookies.join('; ') }
            });
            const data = await res.json();

            if (res.ok && data.user) {
                console.log('✅ /me returned user:', data.user.email);
            } else {
                console.error('❌ /me failed or no user', res.status, data);
            }
        } catch (e) {
            console.error('❌ /me Exception', e);
        }
    } else {
        console.log('⚠️ Skipping [TEST 2] because no cookie was obtained.');
    }

    // 3. Logout
    if (cookies.some(c => c.includes('token='))) {
        console.log('\n[TEST 3] Testing Logout...');
        try {
            const res = await fetch(`${BASE_URL}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Cookie': cookies.join('; '),
                    'X-CSRF-Token': csrfToken
                }
            });

            const resCookies = getSetCookies(res.headers);
            // Check if cookie is cleared (expires in past or empty value)
            if (resCookies && resCookies.some(c => c.includes('token=') && (c.includes('Expires=') || c.includes('Max-Age=0')))) {
                console.log('✅ Logout cleared cookie');
            } else {
                console.error('❌ Logout did not clearly expire cookie', resCookies);
            }

        } catch (e) {
            console.error('❌ Logout Exception', e);
        }
    }
}

runTests();
