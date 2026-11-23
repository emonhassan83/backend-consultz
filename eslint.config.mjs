// ESLint 10 flat config. Replaces the old .eslintrc.json / .eslintignore,
// which ESLint 10 no longer reads. Same rules as before.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'logs/**', 'uploads/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-unused-expressions': 'warn',
      'prefer-const': 'error',
      'no-console': 'warn',
      // TypeScript already reports undefined names; this rule misfires on types
      'no-undef': 'off',
      // Some old comments have broken-encoding characters; code is still checked
      'no-irregular-whitespace': ['error', { skipComments: true }],
      // Existing @ts-ignore lines stay visible but don't fail the run
      '@typescript-eslint/ban-ts-comment': 'warn',
      // Error(msg, { cause }) needs an ES2022 lib; tsconfig targets es2016
      'preserve-caught-error': 'warn',
    },
  },
)
