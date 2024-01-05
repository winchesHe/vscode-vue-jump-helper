import type { SFCParseResult } from '@vue/compiler-sfc'
import type { Position } from '@vue/compiler-dom'
import type { SourceFile } from 'ts-morph'
import type { SourceLocation } from 'acorn'
import type { DocumentSymbol } from 'vscode'
import type vscode from 'vscode'
import type { Context } from './context'
import type { Result as TagList } from './ast'

export type CtxData = {
  [path: string]: {
    ctx: Context
    notParseComponent: boolean
  }
} & {
  document: vscode.TextDocument | undefined
  editor: vscode.TextEditor | undefined
}

export interface Config {
  webpackConfigPath?: string
}

export interface Alias {
  [key: string]: string
}

/** 解析后的Vue数据 */
export interface ParseResult {
  /** 路径：descriptor */
  [path: string]: SFCParseResult['descriptor']
}

export interface RefList {
  ref: string | undefined
  tag: string
  loc: SourceLocation | undefined
  compPath: string
}

export interface ScriptData {
  data?: Record<string, DocumentSymbol>
  props?: Record<string, DocumentSymbol>
  computed?: Record<string, DocumentSymbol>
  methods?: Record<string, DocumentSymbol>
  keyMap?: Map<string, DocumentSymbol>
}

export interface TransformData {
  /** [[{ tag: 'sf-tag', loc }, { loc: { start, end, source } name: string type: number value: { type, loc, content } }]] */
  refList: TagList
  allRefsUse?: RefsUseResult
  script: {
    content: string
    parseData?: SourceFile
    importList: string[][]
    components: {
      /** 匹配到ref的组件 */
      refList: RefList[]
      /** 解析好的已导入组件数据: [[组件名, 路径值]] */
      common: string[][]
    }
  }
  /** 存放当前script中的data和props等数据 */
  scriptData: ScriptData
}

export interface ParseData {
  [path: string]: TransformData
}

/**
 * @example 将类型 'SfTable' ---> 'sf-table'
 */
export type ToKebab<T extends string, O extends string = Uncapitalize<T>> = O extends `${infer First}${infer Rest}`
  ? First extends Capitalize<First>
    ? `-${Lowercase<First>}${ToKebab<Rest>}`
    : `${First}${ToKebab<Rest, Rest>}`
  : T

interface Loc {
  start: Position
  end: Position
  source: string
}

interface UseLoc {
  c: number
  character: number
  e: number
  line: number
}

/** [组件Ref名/组件方法，loc对象] */
export type RefsUseResult = {
  ref: {
    name: string
    start: string
    end: string
    target: Loc
  }
  refUse?: {
    name: string
    start: string
    end: string
    target: {
      start: UseLoc
      end: UseLoc
      source: string
    }
  }
}[]
