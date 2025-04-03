const { nodeResolve } = require('@rollup/plugin-node-resolve');
const terser = require('@rollup/plugin-terser');
const commonjs = require('@rollup/plugin-commonjs');

const plugins = [commonjs(), nodeResolve({ browser: true, preferBuiltins: true }), terser()];
module.exports = [
  {
    input: './size-all.js',
    output: {
      file: 'dist/all.js',
      format: 'cjs',
    },
    plugins,
  },
  {
    input: './size-object.js',
    output: {
      file: 'dist/object.js',
      format: 'cjs',
    },
    plugins,
  },
  {
    input: './size-init.js',
    output: {
      file: 'dist/init.js',
      format: 'cjs',
    },
    plugins,
  },
];
