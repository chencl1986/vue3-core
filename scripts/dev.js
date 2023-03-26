// @ts-check

// Using esbuild for faster dev builds.
// We are still using Rollup for production builds because it generates
// smaller files w/ better tree-shaking.

import esbuild from 'esbuild'
import { resolve, relative, dirname } from 'node:path'
// https://qlg22w6jh4.feishu.cn/docx/RgHPdrLazoGgurxjJYxcQOT5ngc#E6m2dGSIMoG8ykxoLVJc2JWUnre
import { fileURLToPath } from 'node:url'
// https://qlg22w6jh4.feishu.cn/docx/RgHPdrLazoGgurxjJYxcQOT5ngc#JmOCdQWy8oqQ4QxWQDecghMGnQg
import { createRequire } from 'node:module'
import minimist from 'minimist'
import { NodeModulesPolyfillPlugin as nodePolyfills } from '@esbuild-plugins/node-modules-polyfill'

// https://qlg22w6jh4.feishu.cn/docx/RgHPdrLazoGgurxjJYxcQOT5ngc#EYKwdWmIao6g8uxoDvfcvQiwntg
const require = createRequire(import.meta.url)
// https://qlg22w6jh4.feishu.cn/docx/RgHPdrLazoGgurxjJYxcQOT5ngc#WUSOd6MMyowM8mxIPMscl6Fln5c
const __dirname = dirname(fileURLToPath(import.meta.url))
const args = minimist(process.argv.slice(2))
// 输入目标，打包的是哪些package，例如vue、compiler、runtime、compiler-sfc等，因script的输入不同
// 在没有传参的情况下，此处默认设置为vue
const target = args._[0] || 'vue'
// 输出格式，比如cjs、esm、global（前两者结合？），dev模式下f没有传参，此处默认设置为global
const format = args.f || 'global'
// 猜测这里应该是个Boolean，如果有值的话，就不设置externals，将所有依赖都打包
// https://qlg22w6jh4.feishu.cn/docx/RgHPdrLazoGgurxjJYxcQOT5ngc#FQI2dMQCGosWOixoFPicpp04nUb
const inlineDeps = args.i || args.inline
// 读取打包target package的配置，例如packages/vue/package.json
const pkg = require(`../packages/${target}/package.json`)

// resolve output
const outputFormat = format.startsWith('global')
  ? 'iife'
  : format === 'cjs'
  ? 'cjs'
  : 'esm'

const postfix = format.endsWith('-runtime')
  ? `runtime.${format.replace(/-runtime$/, '')}`
  : format

const outfile = resolve(
  __dirname,
  `../packages/${target}/dist/${
    target === 'vue-compat' ? `vue` : target
  }.${postfix}.js`
)
const relativeOutfile = relative(process.cwd(), outfile)

// resolve externals
// TODO this logic is largely duplicated from rollup.config.js
// https://qlg22w6jh4.feishu.cn/docx/RgHPdrLazoGgurxjJYxcQOT5ngc#FQI2dMQCGosWOixoFPicpp04nUb
let external = []
if (!inlineDeps) {
  // cjs & esm-bundler: external all deps
  if (format === 'cjs' || format.includes('esm-bundler')) {
    external = [
      ...external,
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
      // for @vue/compiler-sfc / server-renderer
      'path',
      'url',
      'stream'
    ]
  }

  if (target === 'compiler-sfc') {
    const consolidatePkgPath = require.resolve(
      '@vue/consolidate/package.json',
      {
        paths: [resolve(__dirname, `../packages/${target}/`)]
      }
    )
    const consolidateDeps = Object.keys(
      require(consolidatePkgPath).devDependencies
    )
    external = [
      ...external,
      ...consolidateDeps,
      'fs',
      'vm',
      'crypto',
      'react-dom/server',
      'teacup/lib/express',
      'arc-templates/dist/es5',
      'then-pug',
      'then-jade'
    ]
  }
}

const plugins = [
  {
    name: 'log-rebuild',
    setup(build) {
      build.onEnd(() => {
        console.log(`built: ${relativeOutfile}`)
      })
    }
  }
]

if (format === 'cjs' || pkg.buildOptions?.enableNonBrowserBranches) {
  plugins.push(nodePolyfills())
}

// https://qlg22w6jh4.feishu.cn/docx/RgHPdrLazoGgurxjJYxcQOT5ngc#IUOWdS2M6ockmyxozcxcYED4nY2
// https://qlg22w6jh4.feishu.cn/docx/RgHPdrLazoGgurxjJYxcQOT5ngc#YamsdYAEQoSaMcxM3m1cmXOVn4g
esbuild
  .context({
    entryPoints: [resolve(__dirname, `../packages/${target}/src/index.ts`)],
    outfile,
    bundle: true,
    // https://qlg22w6jh4.feishu.cn/docx/RgHPdrLazoGgurxjJYxcQOT5ngc#FQI2dMQCGosWOixoFPicpp04nUb
    external,
    sourcemap: true,
    format: outputFormat,
    globalName: pkg.buildOptions?.name,
    platform: format === 'cjs' ? 'node' : 'browser',
    plugins,
    define: {
      __COMMIT__: `"dev"`,
      __VERSION__: `"${pkg.version}"`,
      __DEV__: `true`,
      __TEST__: `false`,
      __BROWSER__: String(
        format !== 'cjs' && !pkg.buildOptions?.enableNonBrowserBranches
      ),
      __GLOBAL__: String(format === 'global'),
      __ESM_BUNDLER__: String(format.includes('esm-bundler')),
      __ESM_BROWSER__: String(format.includes('esm-browser')),
      __NODE_JS__: String(format === 'cjs'),
      __SSR__: String(format === 'cjs' || format.includes('esm-bundler')),
      __COMPAT__: String(target === 'vue-compat'),
      __FEATURE_SUSPENSE__: `true`,
      __FEATURE_OPTIONS_API__: `true`,
      __FEATURE_PROD_DEVTOOLS__: `false`
    }
  })
  .then(ctx => ctx.watch())
