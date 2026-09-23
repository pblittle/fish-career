export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The house voice writes subjects that say what changed and why; the
    // default 100-column ceiling would reject the style this repo is
    // written in.
    'header-max-length': [2, 'always', 200],
    'body-max-line-length': [0],
  },
};
