import { iconValidator } from '../server/ai/code-pipeline/icon-validator.js';
import { iconRegistry } from '../server/utils/icon-registry.js';

async function runTests() {
  await iconRegistry.discoverIcons();
  console.log('\nStarting Icon Validator Tests...\n');
  let failures = 0;

  const testCases = [
    {
      name: 'Valid code keeps valid icons',
      input: `import React from 'react';
import { User, House } from 'lucide-react';

export default function App() {
  return <div><User /><House /></div>;
}`,
      expectedContains: ['User', 'House'],
      expectedNotContains: [],
    },
    {
      name: 'Existing icon Scooter is kept',
      input: `import React from 'react';
import { Scooter } from 'lucide-react';

export default function App() {
  return <Scooter />;
}`,
      expectedContains: ['Scooter'],
      expectedNotContains: ['HelpCircle'],
    },
    {
      name: 'Alias Trash is accepted as-is',
      input: `import React from 'react';
import { Trash } from 'lucide-react';

export default function App() {
  return <Trash />;
}`,
      expectedContains: ['Trash'],
      expectedNotContains: ['Trash2'],
    },
    {
      name: 'Invalid icon falls back to Info',
      input: `import React from 'react';
import { User, NonExistentIcon123 } from 'lucide-react';

export default function App() {
  return <div><User /><NonExistentIcon123 /></div>;
}`,
      expectedContains: ['User', 'Info'],
      expectedNotContains: ['NonExistentIcon123'],
    },
  ];

  for (const test of testCases) {
    console.log(`Test: ${test.name}`);
    try {
      const result = iconValidator.validate(test.input);
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
