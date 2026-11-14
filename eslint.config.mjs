// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', '.claude/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Princípio 10: tipagem estrita.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
  {
    // Espelho do .claude/hooks/domain-guard.mjs: domínio puro e determinístico
    // (princípios 2, 3 e 7 do CLAUDE.md).
    files: ['src/core/**/*.ts', 'src/domain/**/*.ts'],
    rules: {
      'no-console': 'error',
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'O domínio não acessa rede (princípio 2).',
        },
        {
          name: 'process',
          message:
            'O domínio não lê process.env; receba configuração injetada (princípios 2 e 7).',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random() é proibido; use a porta Rng com semente (princípio 3).',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            'Relógio do sistema quebra o determinismo; use a porta Clock (princípio 3).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'Relógio do sistema quebra o determinismo; use a porta Clock (princípio 3).',
        },
        {
          selector: "CallExpression[callee.name='randomUUID']",
          message:
            'IDs/aleatório do crypto são proibidos; use IdGenerator/Rng (princípio 3).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*'],
              message:
                'O domínio não importa NestJS; a ligação fica em src/infra (princípio 2).',
            },
            {
              group: [
                'drizzle-orm',
                'drizzle-orm/*',
                'pg',
                'postgres',
                'socket.io',
                'socket.io/*',
              ],
              message:
                'O domínio não importa banco nem transporte (princípio 2).',
            },
            {
              group: ['@/infra', '@/infra/*'],
              message: 'O domínio não importa src/infra (princípio 2).',
            },
            {
              group: [
                'node:*',
                'fs',
                'fs/*',
                'http',
                'https',
                'net',
                'child_process',
                'crypto',
              ],
              message:
                'O domínio não faz I/O nem usa crypto (princípios 2 e 3).',
            },
          ],
        },
      ],
    },
  }
)
