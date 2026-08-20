import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import vueA11y from 'eslint-plugin-vuejs-accessibility'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import configPrettier from 'eslint-config-prettier/flat'
import { builtinModules } from 'node:module'

/**
 * Every Node built-in, in both spellings.
 *
 * Asking Node for the list beats hand-maintaining one: a partial list is worse
 * than none, because it reads as complete. The `node:` prefix was blocked here
 * before but the bare form was not, so `import { readFileSync } from 'fs'`
 * passed lint and was caught only by `"types": []` in the tsconfig — which
 * would stop holding the moment `@types/node` reached that workspace.
 */
const NODE_BUILTINS = builtinModules
  .filter((name) => !name.startsWith('_'))
  .flatMap((name) => [name, `${name}/*`, `node:${name}`, `node:${name}/*`])

export default defineConfigWithVueTs(
  {
    name: 'packwright/ignores',
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
  },

  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  vueA11y.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    name: 'packwright/globals',
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  {
    // A leading underscore marks a binding that is deliberately unused. Not
    // just style: Express identifies an error handler by its arity, so the
    // four-argument signature has to keep its `next` parameter even though
    // nothing calls it.
    name: 'packwright/deliberately-unused',
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  {
    // Enforces the CLAUDE.md invariant mechanically rather than on trust:
    // label-core runs in the browser, on the server, and in tests unchanged,
    // so it must not reach for a framework.
    name: 'packwright/label-core-stays-framework-free',
    files: ['packages/label-core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vue', 'vue/*', '@vue/*', 'pinia', 'vue-router'],
              message:
                'label-core must stay framework-free — it runs in the browser, on the server, and in tests unchanged. Move UI concerns into apps/web.',
            },
            {
              group: ['express', 'express/*', 'mongoose', 'node:*', ...NODE_BUILTINS],
              message:
                'label-core must stay framework-free and platform-agnostic. Move server concerns into apps/api.',
            },
          ],
        },
      ],
    },
  },
  configPrettier,
)
