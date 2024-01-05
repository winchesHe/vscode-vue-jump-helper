import type { ExtensionContext } from 'vscode'
import vscode from 'vscode'
import { Context } from './context'
import type { CtxData } from './types'
import { EXT_ID } from './constants'
import { getCurPath } from './utils'
import { getAllRefsUse, getScriptComponents } from './ast'
import { AllComponentRefProvider, ScriptDataProvider } from './provider'
import { initRefsUseComponentsData } from './components'
import { logger } from './log'

export const ctxData = {} as CtxData

export async function activate(ext: ExtensionContext) {
  const ctx = new Context(ext)

  initCtxEditor()
  const curPath = getCurPath()

  initCtxData(ctxData, curPath, ctx)
  await ctx.scanAlias()
  await ctx.initParse(curPath)

  initComponents(curPath)
  await initRefsUseComponentsData(curPath, ext)
  initSubscriptions(ext)
}

export function initComponents(path: string) {
  try {
    // 设置script.components值
    getScriptComponents(path)
    // 设置parseData【path】allRefsUse
    getAllRefsUse(path)
  }
  catch (error) {
    logger.error(`initComponents错误：${error}`)
  }
}

function initSubscriptions(ext: ExtensionContext) {
  ext.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor) {
        initCtxEditor()
        const curPath = getCurPath()

        if (!ctxData[curPath]) {
          // 部分组件只经过initParse，具体看initRefsUseComponentsData
          if (ctxData[curPath].notParseComponent) {
            initComponents(curPath)
            await initRefsUseComponentsData(curPath, ext)
            ctxData[curPath].notParseComponent = false
          }
          else {
            const ctx = new Context(ext)
            initCtxData(ctxData, curPath, ctx)
            await ctx.scanAlias()
            await ctx.initParse(curPath)
            initComponents(curPath)
            await initRefsUseComponentsData(curPath, ext)
          }
        }
      }
    }, null, ext.subscriptions),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(EXT_ID)) {
        const curPath = getCurPath()

        ctxData[curPath].ctx.updateConfig()
      }
    }),
    vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document === ctxData.document) {
        const curPath = getCurPath()

        if (!ctxData[curPath]) {
          return
        }

        ctxData[curPath].ctx.throttleParseScriptData()(curPath)
      }
    }),
  )

  vscode.languages.registerDefinitionProvider(
    [
      { scheme: 'file', language: 'vue' },
    ],
    new AllComponentRefProvider(),
  )
  vscode.languages.registerDefinitionProvider(
    [
      { scheme: 'file', language: 'vue' },
    ],
    new ScriptDataProvider(),
  )
}

export function initCtxData(target: any, path: string, ctx: any) {
  if (!target[path]) {
    target[path] = {}
    target[path].ctx = ctx
  }
}

function initCtxEditor() {
  ctxData.editor = vscode.window.activeTextEditor
  ctxData.document = ctxData.editor?.document
}

export function deactivate() {

}
