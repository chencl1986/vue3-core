// This entry is the "full-build" that includes both the runtime
// and the compiler, and supports on-the-fly compilation of the template option.
import { initDev } from './dev'
import { compile, CompilerOptions, CompilerError } from '@vue/compiler-dom'
import { registerRuntimeCompiler, RenderFunction, warn } from '@vue/runtime-dom'
import * as runtimeDom from '@vue/runtime-dom'
import { isString, NOOP, generateCodeFrame, extend } from '@vue/shared'
import { InternalRenderFunction } from 'packages/runtime-core/src/component'

if (__DEV__) {
  initDev()
}

const compileCache: Record<string, RenderFunction> = Object.create(null)

// 为浏览器环境注册编译器，编译器的作用是将template编译成render函数
function compileToFunction(
  // createApp().mount('#app')调用时，template为'#app'内部的html
  template: string | HTMLElement,
  options?: CompilerOptions
): RenderFunction {
  if (!isString(template)) {
    // 如果没有传入template.nodeType，直接返回一个空函数
    if (template.nodeType) {
      template = template.innerHTML
    } else {
      __DEV__ && warn(`invalid template option: `, template)
      return NOOP
    }
  }

  const key = template
  const cached = compileCache[key]
  if (cached) {
    return cached
  }

  // 如果template是'#app'，则获取'#app'内部的html
  if (template[0] === '#') {
    const el = document.querySelector(template)
    if (__DEV__ && !el) {
      warn(`Template element not found or is empty: ${template}`)
    }
    // __UNSAFE__
    // Reason: potential execution of JS expressions in in-DOM template.
    // The user must make sure the in-DOM template is trusted. If it's rendered
    // by the server, the template should not contain any user data.
    template = el ? el.innerHTML : ``
  }

  const opts = extend(
    {
      hoistStatic: true,
      onError: __DEV__ ? onError : undefined,
      onWarn: __DEV__ ? e => onError(e, true) : NOOP
    } as CompilerOptions,
    options
  )

  if (!opts.isCustomElement && typeof customElements !== 'undefined') {
    opts.isCustomElement = tag => !!customElements.get(tag)
  }

  // compile函数在packages/compiler-dom/src/index.ts中定义
  // 字符串模板编译成render函数
  // 如果用户传入了render函数，则直接返回用户传入的render函数
  // code为render函数的字符串形式
  const { code } = compile(template, opts)

  function onError(err: CompilerError, asWarning = false) {
    const message = asWarning
      ? err.message
      : `Template compilation error: ${err.message}`
    const codeFrame =
      err.loc &&
      generateCodeFrame(
        template as string,
        err.loc.start.offset,
        err.loc.end.offset
      )
    warn(codeFrame ? `${message}\n${codeFrame}` : message)
  }

  // The wildcard import results in a huge object with every export
  // with keys that cannot be mangled, and can be quite heavy size-wise.
  // In the global build we know `Vue` is available globally so we can avoid
  // the wildcard object.
  const render = // 使用new Function(code)()创建render函数
    // 通过new Function得到一个工厂函数，然后调用工厂函数得到render函数
    // __GLOBAL__为true，表示是全局构建，直接使用new Function(code)()创建render函数
    // __GLOBAL__为false，表示是非全局构建，使用new Function('Vue', code)(runtimeDom)创建render函数
    // __GLOBAL__来自于format === 'global'，即全局构建
    // format来自于/package.json中的build选项例如-f global（默认为global，可以不传）
    (
      __GLOBAL__ ? new Function(code)() : new Function('Vue', code)(runtimeDom)
    ) as RenderFunction

  // mark the function as runtime compiled
  ;(render as InternalRenderFunction)._rc = true

  return (compileCache[key] = render)
}

// 需要注意compileToFunction的执行时机，[是在createApp().mount('#app')调用时]
// 通过调用compileToFunction，得到render函数
registerRuntimeCompiler(compileToFunction)

export { compileToFunction as compile }
export * from '@vue/runtime-dom'
