import { navigationTransformer } from '../server/ai/code-pipeline/navigation-transformer.js';

async function runTests() {
  console.log('\nStarting Navigation Transformer Tests...\n');
  let failures = 0;

  const testCases = [
    {
      name: 'Transform <a> with internal link',
      input: `
export default function App() {
  return (
    <div>
      <a href="/impressum">Impressum</a>
      <a href="/contact">Contact</a>
    </div>
  );
}`,
      expectedContains: [
        'href="#"',
        "onClick={(e) => { e.preventDefault(); setView('impressum'); }}",
        "onClick={(e) => { e.preventDefault(); setView('contact'); }}",
      ],
      expectedNotContains: ['href="/impressum"'],
    },
    {
      name: 'Ignore external links',
      input: `
export default function App() {
  return <a href="https://google.com">Google</a>;
}`,
      expectedContains: ['href="https://google.com"'],
      expectedNotContains: ['onClick'],
    },
    {
      name: 'Transform Router <Link>',
      input: `
import { Link } from 'react-router-dom';
export default function App() {
  return <Link to="/about">About Us</Link>;
}`,
      expectedContains: [
        '<a',
        'href="#"',
        "onClick={(e) => { e.preventDefault(); setView('about'); }}",
      ],
      expectedNotContains: ['<Link', 'to="/about"'],
    },
  ];

  for (const test of testCases) {
    console.log(`Test: ${test.name}`);
    try {
      const result = navigationTransformer.transform(test.input);
      const passedContains = test.expectedContains.every((s) => result.includes(s));
      const passedNotContains = test.expectedNotContains.every((s) => !result.includes(s));

      if (passedContains && passedNotContains) {
        console.log('PASS');
      } else {
        failures += 1;
        console.error('FAIL');
        console.log('Input:', test.input);
        console.log('Result:', result);
        if (!passedContains) {
          console.log('Missing expected:', test.expectedContains.filter((s) => !result.includes(s)));
        }
        if (!passedNotContains) {
          console.log('Found forbidden:', test.expectedNotContains.filter((s) => result.includes(s)));
        }
      }
    } catch (error) {
      failures += 1;
      console.error('CRASH:', error);
    }
    console.log('-----------------------------------');
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
