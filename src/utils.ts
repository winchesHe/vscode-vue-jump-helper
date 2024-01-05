import path, { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

import os from 'node:os'
import { workspace } from 'vscode'
import type { ToKebab } from './types'
import { ctxData } from '.'

export const isWin = os.platform() === 'win32'

export const root = workspace.rootPath || ''

export function curResolver(path: string) {
  const curPath = getCurPath()

  if (!curPath || !root) {
    return ''
  }

  const transformPath = curPath?.replace(/(packages[\\/]\w+[\\/]).*/, '$1')
  return resolve(transformPath, path)
}

export function getCurPath() {
  return ctxData.document?.uri.fsPath || ''
}

export function resolver(path: string) {
  if (!root) {
    return ''
  }
  return resolve(root, path)
}

export function getTsconfigPath() {
  const curPath = curResolver('tsconfig.json')
  const rootPath = resolver('tsconfig.json')
  if (existsSync(curPath)) {
    return curPath
  }
  else if (existsSync(rootPath)) {
    return rootPath
  }
  else {
    return ''
  }
}

/**
 * @param str camelString
 * @returns IfaceComponent --> iface-component
 */
export function toKebab<T extends string>(str: T): ToKebab<T> {
  if (!str) {
    return '' as ToKebab<T>
  }

  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() as ToKebab<T>
}

export function normalizePath(targetUrl: string) {
  if (!targetUrl)
    return ''

  const activePath = getCurPath()
  const basename = path.basename(activePath)
  const convertPath = isWin ? activePath.replace(`\\${basename}`, '') : activePath.replace(`/${basename}`, '')

  if (targetUrl.startsWith('.') && activePath) {
    const joinName = setExtPath(path.join(convertPath, targetUrl))
    return joinName
  }

  let pattern = ''
  let val = ''
  const transformPath = getTsconfigPath()
  const pathVal = ctxData[activePath].ctx.alias!

  const isAliasImport = Object.keys(pathVal).some((item) => {
    const convertAlias = item.replace('/*', '')
    const importUrl = targetUrl.split('/')[0]
    pattern = convertAlias
    val = pathVal[item].replace('/*', '')
    return importUrl === pattern
  })
  const _targetUrl = isAliasImport ? targetUrl.replace(pattern, val) : targetUrl
  const transformUrl = setExtPath(path.join(transformPath, _targetUrl))
  const rootTransformUrl = setExtPath(path.join(root, _targetUrl))

  if (existsSync(transformUrl))
    return transformUrl

  if (existsSync(rootTransformUrl))
    return rootTransformUrl

  return targetUrl
}

export function setExtPath(url: string) {
  const ext = ['.vue', '.js', '.ts']

  for (const item of ext) {
    const extPath = `${url}${item}`
    const extIndexPath = `${url}${isWin ? '\\' : '/'}index${item}`

    if (existsSync(extPath))
      return extPath
    if (existsSync(extIndexPath))
      return extIndexPath
  }
  return url
}

let canRun = true
export function throttle<T extends any[]>(
  func: (...args: T) => void,
  timeout = 3000,
) {
  return function (this: any, ...args: T) {
    if (canRun) {
      canRun = false
      setTimeout(() => {
        func.apply(this, args)
        canRun = true
      }, timeout)
    }
  }
}
