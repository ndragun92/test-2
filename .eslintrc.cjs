module.exports = {
  env: {
    browser: true,
    es2021: true
  },
  ignorePatterns: ['dist/', 'node_modules/', 'src/**.spec.ts'],
  extends: 'standard-with-typescript',
  overrides: [
    {
      env: {
        node: true
      },
      files: [
        '.eslintrc.{js,cjs}'
      ],
      parserOptions: {
        sourceType: 'script'
      }
    },
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
  },
}
