import antfu from '@antfu/eslint-config';

export default antfu(
  {
    // Вимикаємо вбудований Prettier-плагін, щоб він не єбав мізки через пробіли
    formatters: false,
    stylistic: false,
  },
  {
    rules: {
      'ts/interface-name-prefix': 'off',
      'ts/explicit-function-return-type': 'off',
      'ts/explicit-module-boundary-types': 'off',
      'ts/no-explicit-any': 'off',
      // Жорстко вирубаємо правила форматування eslint-plugin-format чи prettier
      'format/prettier': 'off',
      'style/max-len': 'off',
    },
  },
);