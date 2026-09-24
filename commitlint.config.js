// Conventional-commits gate for fish.career. Rules are inlined rather
// than extends-ing @commitlint/config-conventional: the preset resolves
// from the repo root while the dependency lives in fish-career/node_modules
// (MODULE_NOT_FOUND in CI on 2026-09-23). These are the rules the house
// enforces anyway.
export default {
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ],
    ],
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
    'header-max-length': [2, 'always', 200],
    'body-max-line-length': [0],
  },
};
