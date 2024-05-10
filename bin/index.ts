#!/usr/bin/env -S node --no-warnings

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';
import { promisify } from 'node:util';
import child_process from 'node:child_process';

const exec = promisify(child_process.exec);

import chalk from 'chalk';

import inquirer from 'inquirer';

import latestVersion from 'latest-version';

import updateNotifier from 'update-notifier';

import pkg from '../package.json' assert { type: 'json' };

updateNotifier({ pkg }).notify();

const dirExists = async (path: string) => {
  try {
    await stat(path);

    return true;
  } catch {}

  return false;
};

const isDirEmpty = async (path: string) => {
  try {
    const files = await readdir(path);

    if (files.length === 0) {
      return true;
    }
  } catch {}

  return false;
};

let combinedAnswers: {
  name: string;
  typescript: boolean;
  renderer: 'javascript' | 'javascript-html' | 'react';
  prettier: boolean;
  watch: boolean;
  serve: boolean;
} = {
  name: 'my-app',
  typescript: false,
  renderer: 'javascript',
  prettier: true,
  watch: true,
  serve: true
};

await inquirer
  .prompt([
    {
      name: 'name',
      message: 'What is your project named?',
      default: combinedAnswers.name
    },
    {
      type: 'confirm',
      name: 'typescript',
      message: `Would you like to use ${chalk.blue('TypeScript')}?`,
      default: combinedAnswers.typescript
    }
  ])
  .then(
    async answers => (combinedAnswers = { ...combinedAnswers, ...answers })
  );

await inquirer
  .prompt([
    {
      type: 'list',
      name: 'renderer',
      message: `How would you like to create pages?`,
      choices: [
        {
          name: `${combinedAnswers.typescript ? 'TypeScript' : 'JavaScript'}`,
          value: 'javascript'
        },
        {
          name: `${
            combinedAnswers.typescript ? 'TypeScript' : 'JavaScript'
          } with the \`html\` string template utility`,
          value: 'javascript-html'
        },
        { name: 'React', value: 'react' }
      ],
      default: combinedAnswers.renderer
    }
  ])
  .then(
    async answers => (combinedAnswers = { ...combinedAnswers, ...answers })
  );

await inquirer
  .prompt([
    {
      type: 'confirm',
      name: 'prettier',
      message: 'Include prettier config?',
      default: combinedAnswers.prettier
    },
    {
      type: 'confirm',
      name: 'watch',
      message: 'Do you want to watch for changes?',
      default: combinedAnswers.watch
    },
    {
      type: 'confirm',
      name: 'serve',
      message: 'Do you want to serve files locally?',
      default: combinedAnswers.serve
    }
  ])
  .then(
    async answers => (combinedAnswers = { ...combinedAnswers, ...answers })
  );

const directory = join(cwd(), combinedAnswers.name);

if ((await dirExists(directory)) && !(await isDirEmpty(directory))) {
  console.log(`${directory} is not empty!`);

  exit(1);
}

const devDependencies: { [key: string]: string } = {
  onlybuild: await latestVersion('onlybuild')
};

if (combinedAnswers.renderer === 'react') {
  devDependencies['react'] = await latestVersion('react');
  devDependencies['react-dom'] = await latestVersion('react-dom');
}

console.log(`\nCreating a new onlybuild app in ${chalk.green(directory)}\n`);

await mkdir(directory, { recursive: true });

await mkdir(join(directory, '.vscode/'), { recursive: true });

if (
  combinedAnswers.renderer === 'javascript-html' ||
  combinedAnswers.prettier
) {
  await writeFile(
    join(directory, '.vscode/extensions.json'),
    `${JSON.stringify(
      {
        recommendations: [
          combinedAnswers.renderer === 'javascript-html'
            ? 'bierner.lit-html'
            : undefined,
          combinedAnswers.prettier ? 'esbenp.prettier-vscode' : undefined
        ].filter(Boolean)
      },
      null,
      2
    )}\n`
  );
}

await writeFile(
  join(directory, '.gitignore'),
  `${['node_modules/', 'build/'].join('\n')}\n`
);

await writeFile(join(directory, '.onlyignore'), `${['*.md'].join('\n')}\n`);

if (combinedAnswers.prettier) {
  await writeFile(
    join(directory, '.prettierrc'),
    JSON.stringify(
      {
        arrowParens: 'avoid',
        singleQuote: true,
        tabWidth: 2,
        trailingComma: 'none'
      },
      null,
      2
    )
  );
}

const indexContents = (() => {
  switch (combinedAnswers.renderer) {
    case 'javascript-html':
      return `import { html } from 'onlybuild';

export default html\`<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Hello, world!</title>
  </head>
  <body>
    <h1>Hello, world!</h1>
  </body>
</html>\`;\n`;
    case 'react':
      return `import React from 'react';
import { renderToString } from 'react-dom/server';

function Hello({ name = 'world' }) {
  return <h1>Hello, {name}!</h1>;
}

export default \`<!DOCTYPE html>
\${renderToString(
  <html lang="en">
    <head>
      <title>Hello, world!</title>
    </head>
    <body>
      <Hello name="world" />
    </body>
  </html>
)}\`;\n`;
    default:
      return `export default \`<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Hello, world!</title>
  </head>
  <body>
    <h1>Hello, world!</h1>
  </body>
</html>\`;
\n`;
  }
})();

await writeFile(
  join(
    directory,
    combinedAnswers.typescript
      ? combinedAnswers.renderer === 'react'
        ? 'index.tsx'
        : 'index.ts'
      : combinedAnswers.renderer === 'react'
      ? 'index.jsx'
      : 'index.mjs'
  ),
  indexContents
);

await writeFile(
  join(directory, 'package.json'),
  `${JSON.stringify(
    {
      name: combinedAnswers.name,
      type:
        combinedAnswers.typescript || combinedAnswers.renderer === 'react'
          ? 'module'
          : undefined,
      devDependencies,
      scripts: {
        build: 'onlybuild',
        watch: combinedAnswers.watch
          ? 'npx nodemon --ignore ./build -x "npm run build"'
          : undefined,
        serve: combinedAnswers.serve ? 'npx http-server build' : undefined
      },
      private: true
    },
    null,
    2
  )}\n`
);

await writeFile(join(directory, 'README.md'), `# ${combinedAnswers.name}\n`);

console.log(
  `Installing devDependencies:\n${Object.keys(devDependencies)
    .map(dependency => `- ${chalk.blue(dependency)}`)
    .join('\n')}\n`
);

await exec(`cd ${directory} && npm install`);

console.log('Initializing a git repository.\n');

await exec(
  `cd ${directory} && git init && git add . && git commit -m "Initial commit."`
);

console.log(
  `${chalk.green('Success!')} Created ${combinedAnswers.name} in ${directory}\n`
);

console.log('Next steps:\n');
console.log(`cd ${combinedAnswers.name}/\n`);
console.log(
  `npm run build ${chalk.gray('# Build project to ./build directory.')}`
);

if (combinedAnswers.watch) {
  console.log(
    `npm run watch ${chalk.gray(
      '# Watch for changes and rebuild when detected.'
    )}`
  );
}

if (combinedAnswers.serve) {
  console.log(
    `npm run serve ${chalk.gray('# Serve ./build directory locally.')}`
  );
}
