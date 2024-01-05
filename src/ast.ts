import type { SFCTemplateBlock } from '@vue/compiler-sfc'
import type { AttributeNode } from '@vue/compiler-dom'
import { Node, Project, ts } from 'ts-morph'
import type { DocumentSymbol } from 'vscode'
import { logger } from './log'
import { normalizePath, toKebab } from './utils'
import type { RefList, RefsUseResult, ScriptData } from './types'
import { ctxData } from '.'

type ResultNode = AttributeNode
/**
 * [[{ tag: 'sf-tag', loc }, { loc: { start, end, source }
 * name: string
 * type: number
 * value: { type, loc, content } }]]
 */
export type Result = [SFCTemplateBlock['ast'], ResultNode][]

const project = new Project()

/**
 * @returns 返回Tag节点列表[ [{ tag: 'sf-tag', loc }, TagNode] ]
 */
export function getTemplateTagNode(ast: SFCTemplateBlock['ast'], tag: string): Result {
  const result = [] as unknown as Result
  const findTagNode = ast.props?.find(item => item.name === tag) as AttributeNode

  if (findTagNode) {
    result.push([ast, findTagNode])
  }
  ast.children?.forEach((item) => {
    result.push(...getTemplateTagNode(item as SFCTemplateBlock['ast'], tag))
  })

  return result
}

/**
 * @returns [[path, value], [path2, value2]]
 */
export function getMatchImport(str: string) {
  const importRegexAll = /import {?\s*([\w\W]+?)\s*}? from ['"](.+)['"]/g

  const matchAll = str.match(importRegexAll) ?? []
  const result: string[][] = []

  for (const item of matchAll)
    result.push(matchImport(item))

  return result.length ? result : []

  function matchImport(itemImport: string) {
    const importRegex = /import {?\s*([\w\W]+?)\s*}? from ['"](.+)['"]/
    const match = itemImport.match(importRegex) ?? []
    return [match[1] ?? '', match[2] ?? '']
  }
}

export function parseScriptContent(path: string, content: string) {
  try {
    const file = project.createSourceFile(path, content, {
      scriptKind: ts.ScriptKind.TSX,
      overwrite: true,
    })

    return file
  }
  catch (error) {
    logger.error(error)
  }
}

/** 获解析好的已导入组件数据: [[组件名, 路径值]] */
export function getScriptComponents(path: string) {
  const script = ctxData[path].ctx.parseData[path].script
  const parseData = script.parseData

  if (!parseData || !Object.keys(parseData).length)
    return

  // 找到所有的PropertyAssignment
  const propertyAssignments = parseData?.getDescendantsOfKind(ts.SyntaxKind.PropertyAssignment)
  const result: string[][] = []
  const importList = script.importList

  // 遍历每一个PropertyAssignment
  propertyAssignments?.forEach((propertyAssignment) => {
    // 检查是否有ObjectLiteralExpression
    const objectLiteral = propertyAssignment.getFirstChildByKind(ts.SyntaxKind.ObjectLiteralExpression)
    if (objectLiteral) {
      // 获取ObjectLiteralExpression的子元素的key值
      objectLiteral.getProperties()?.forEach((property) => {
        const name = (property as any).getName?.()
        importList.forEach(([key, value]) => {
          if (key.includes(name)) {
            const _value = normalizePath(value)
            result.push([name, _value])
          }
        })
      })
    }
  })

  if (result.length) {
    script.components.common = result
    const refList = ctxData[path].ctx.parseData[path].refList
    const transformRefList = [] as unknown as RefList[]

    // 过滤出ref数据存储
    result.forEach(([_name, value]) => {
      return refList.forEach(([elementNode, attrNode]) => {
        const tag = toKebab(elementNode.tag)
        const name = toKebab(_name)
        const data = {
          ref: attrNode?.value?.content,
          tag,
          loc: attrNode?.value?.loc,
          compPath: value,
        }

        if (tag.includes(name)) {
          transformRefList.push(data)
        }
      })
    })

    if (transformRefList.length) {
      script.components.refList = transformRefList
    }

    return {
      ref: transformRefList,
      common: result,
    }
  }
}

/**
 * @returns 返回该页面全部Refs调用情况
 */
export function getAllRefsUse(path: string) {
  const data = ctxData[path].ctx.parseData[path]
  const parseData = data.script.parseData

  if (!parseData || !Object.keys(parseData).length) {
    return
  }

  const compRef: RefsUseResult = []
  parseData?.forEachDescendant((node) => {
    // 检查是否是属性访问表达式，且属性名为 $refs
    if (Node.isPropertyAccessExpression(node) && node.getName() === '$refs') {
      // 检查是否是 this.$refs.xxx.test() 的形式
      const parent = node.getParent()
      if (parent) {
        // 获取xxx命名
        const parentNameNode = (parent as any).getNameNode?.()
        const _compRef = parentNameNode.getText()

        const root = parent.getParent()
        if (root) {
          // 获取test调用名
          const rootNameNode = (root as any).getNameNode?.()
          const _compRefUse = (root as any).getNameNode?.().getText()

          if (rootNameNode) {
            compRef.push({
              ref: {
                name: _compRef,
                start: parentNameNode.getStart(),
                end: parentNameNode.getEnd(),
                target: {} as any,
              },
              refUse: {
                name: _compRefUse,
                start: rootNameNode.getStart(),
                end: rootNameNode.getEnd(),
                target: {} as any,
              },
            })
          }
          else {
            compRef.push({
              ref: {
                name: _compRef,
                start: parentNameNode.getStart(),
                end: parentNameNode.getEnd(),
                target: {} as any,
              },
            })
          }
        }
      }
    }
  })

  // 添加ref target为跳转使用
  const refList = data.refList

  compRef.forEach((comp) => {
    const name = comp.ref.name

    refList.forEach(([_, ref]) => {
      const targetName = ref.value?.content

      if (targetName === name && ref.value) {
        comp.ref.target.start = ref.value!.loc.start
        comp.ref.target.end = ref.value!.loc.end
      }
    })
  })

  if (compRef.length) {
    ctxData[path].ctx.parseData[path].allRefsUse = compRef
    return compRef
  }
}

const scriptNodeName = ['data', 'props', 'computed', 'methods']

export function getAllScriptData(docSymbols = []) {
  if (docSymbols.length) {
    const result = {
      data: {},
      props: {},
      methods: {},
      computed: {},
      keyMap: new Map(),
    } as ScriptData

    const scriptNode = findScriptNode(docSymbols[0]) as DocumentSymbol[]

    for (const node of scriptNode) {
      result[node.name] = transformChildren(node.children)
    }

    for (const key in result) {
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        const element = result[key]

        for (const _key in element) {
          const _value = element[_key]
          result.keyMap?.set(_key, _value)
        }
      }
    }

    return result
  }
}

function transformChildren(children: DocumentSymbol['children'] = []) {
  const data = {} as Record<string, DocumentSymbol>

  for (const item of children) {
    data[item.name] = {
      ...item,
    }
  }
  return data
}

function findScriptNode(node: any = {}) {
  const stack = [node]
  const result: any = []

  while (stack.length) {
    let curCount = stack.length

    while (curCount--) {
      const node = stack.shift()

      if (scriptNodeName.includes(node.name)) {
        result.push(node)
      }
      if (result.length >= scriptNodeName.length) {
        return result
      }

      if (node.children) {
        for (const _node of node.children) {
          stack.push(_node)
        }
      }
    }
  }
  return result
}
