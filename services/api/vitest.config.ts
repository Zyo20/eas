import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import path from 'node:path';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        keepClassNames: true,
      },
    }),
  ],
  test: {
    globals: true,
    testTimeout: 30_000,
    server: {
      deps: {
        inline: [
          '@prisma/client',
          '@nestjs/common',
          '@nestjs/core',
          '@nestjs/platform-express',
          '@nestjs/jwt',
          '@nestjs/config',
          '@nestjs/passport',
          'bcryptjs',
          'class-validator',
          'class-transformer',
        ],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
