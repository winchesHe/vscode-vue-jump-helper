import { readFileSync } from 'node:fs'
import type { ExtensionContext } from 'vscode'
import vscode from 'vscode'
import { simple } from 'acorn-walk'
import { parse } from 'acorn'
import { parse as parseVue } from '@vue/compiler-sfc'
import { EXT_ID } from './constants'
import { getTsconfigPath, resolver, throttle } from './utils'
import { getAllScriptData, getMatchImport, getTemplateTagNode, parseScriptContent } from './ast'
import type { Alias, Config, ParseData, ParseResult } from './types'
import { logger } from './log'

export class Context {
  editor: vscode.TextEditor | undefined
  document: vscode.TextDocument | undefined
  config: Config | undefined
  alias: Alias | undefined
  parseResult: ParseResult = {}
  parseData: ParseData = {}

  private _parseChanged = new vscode.EventEmitter<void>()
  public parseChanged = this._parseChanged.event

  constructor(public ext: ExtensionContext) {
    this.updateConfig()
  }

  updateConfig() {
    this.config = (vscode.workspace.getConfiguration(EXT_ID) || {}) as Config
  }

  updateEditor(editor?: vscode.TextEditor) {
    this.editor = editor ?? vscode.window.activeTextEditor
    this.document = this.editor?.document
  }

  async scanAlias() {
    const { webpackConfigPath } = this.config!

    let alias: Alias = {}

    if (webpackConfigPath) {
      const content = await import(resolver(webpackConfigPath))
      alias = content.aliases ?? content.alias
    }
    else {
      // webpack未配置则从tsconfig中获取
      const tsconfigPath = getTsconfigPath()

      if (!tsconfigPath) {
        return logger.error('未解析到tsconfig路径')
      }

      const content = readFileSync(tsconfigPath, 'utf8')
      const ast = parse(`const a = ${content}`, { ecmaVersion: 2016 })

      simple(ast, {
        Property(node: any) {
          if (node.key?.type === 'Literal' && node.key.value === 'paths') {
            if (node.value.type === 'ObjectExpression') {
              alias = {
                ...extractPathsValue(node.value),
                ...alias,
              }
            }
          }
        },
      })
    }

    this.alias = alias
  }

  parseVue(path: string) {
    try {
      const content = readFileSync(path, 'utf8')
      const result = parseVue(content)

      this.parseResult[path] = result.descriptor
    }
    catch (error) {
      console.error(`jump-helper: 解析Vue文件失败${error}`)
    }
  }

  parseTemplate(path: string) {
    const ast = this.parseResult[path].template?.ast

    if (!ast) {
      return
    }

    const resultTag = getTemplateTagNode(ast, 'ref')
    this.parseData[path].refList = resultTag
  }

  parseScript(path: string) {
    const content = this.parseResult[path].script?.content

    if (!content)
      return

    this.parseData[path].script.content = content

    const importList = getMatchImport(content)
    const parseData = parseScriptContent(path, content)

    this.parseData[path].script.parseData = parseData
    this.parseData[path].script.importList = importList
  }

  async parseScriptData(path: string) {
    let docSymbols = await getDocSymbols(path) as []

    if (!docSymbols.length) {
      for (const _ of Array(10)) {
        docSymbols = await getDocSymbols(path) as []

        if (docSymbols.length) {
          break
        }
      }
    }

    const scriptData = getAllScriptData(docSymbols as [])

    if (scriptData) {
      this.parseData[path].scriptData = scriptData
    }
    else {
      logger.error('解析scriptData失败')
    }

    async function getDocSymbols(path: string) {
      return new Promise((resolve) => {
        setTimeout(async () => {
          const result = (await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            vscode.Uri.file(path),
          )) || []
          resolve(result)
        }, 1000)
      })
    }
  }

  async initParse(path: string) {
    if (!path) {
      return console.error(`jump-helper: 初始化Vue文件失败${path}`)
    }
    this.parseData[path] = {
      refList: [],
      script: {
        content: '',
        parseData: {},
        importList: [],
        /** 解析好的组件数据: [[组件名, 路径值]] */
        components: {
          refList: [],
          common: [],
        },
      },
    } as any
    this.parseResult[path] = {} as any

    this.parseVue(path)
    this.parseTemplate(path)
    this.parseScript(path)
    await this.parseScriptData(path)
  }

  throttleParseScriptData() {
    return throttle(this.parseScriptData.bind(this))
  }
}

function extractPathsValue(node) {
  const paths = {}

  node.properties.forEach((property) => {
    if (property.value.type === 'ArrayExpression' && property.value.elements.length === 1) {
      const pathKey = property.key.value
      const pathValue = property.value.elements[0].value
      paths[pathKey] = pathValue
    }
  })

  return paths
}
