//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='button']",
          message:
            'Raw <button> is not allowed outside src/components/ui/. Use <Button>, <Badge>, or <InteractiveRow> from @/components/ui instead.',
        },
      ],
    },
  },
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    ignores: [
      '.agents/**',
      '.beads/**',
      '.claude/**',
      '.codex/**',
      '.output/**',
      'dist/**',
      'dist-ssr/**',
      'docs/design/**',
      'eslint.config.js',
      'node_modules/**',
      'prettier.config.js',
      'src/routeTree.gen.ts',
    ],
  },
]
