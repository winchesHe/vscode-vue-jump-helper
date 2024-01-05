import type { ExtensionContext } from 'vscode'
import { Context } from './context'
import { CtxData } from './types'
import { logger } from './log'
import { ctxData, initComponents, initCtxData } from '.'

/**
 * 初始化当前导入组件的数据
 */
export async function initRefsUseComponentsData(path: string, ext: ExtensionContext) {
  const script = ctxData[path].ctx.parseData[path].script
  const refList = script.components.refList
  const compRef = ctxData[path].ctx.parseData[path].allRefsUse

  if (!refList || !compRef) {
    logger.error('initRefsUseComponentsData存在问题')
    return
  }

  for (const ref of refList) {
    if (ref.compPath) {
      const hasCtxData = ctxData[ref.compPath]

      if (!hasCtxData) {
        const ctx = new Context(ext)
        initCtxData(ctxData, ref.compPath, ctx)
        ctxData[ref.compPath].notParseComponent = true
        await ctx.scanAlias()
        await ctx.initParse(ref.compPath)
      }
    }
  }
  compRef.forEach((comp) => {
    const name = comp.ref.name

    // 赋值use组件的组件路径，以及组件名
    refList.forEach((component) => {
      if (component.ref === name) {
        if (comp.refUse) {
          const _path = component.compPath
          const ctx = ctxData[_path]

          if (!ctx) {
            logger.error('initRefsUseComponentsData 中赋值use出问题，未找到组件ctx')
          }

          const scriptData = ctxData[_path].ctx.parseData[_path].scriptData
          comp.refUse.target.source = component.compPath

          // 添加目标组件的方法的地址
          const hasKey = scriptData.keyMap?.has(comp.refUse.name)
          if (hasKey) {
            const data = scriptData.keyMap!.get(comp.refUse.name)
            comp.refUse.target.start = data?.range.start as any
            comp.refUse.target.end = data?.range.end as any
          }
        }
      }
    })
  })
}
