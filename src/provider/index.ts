import vscode from 'vscode'
import { getCurPath } from '../utils'
import { ctxData } from '..'

const firstReg = /[:"'\s]/

/**
 * 提供本地函数this.xxx的跳转
 */
export class ScriptDataProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ) {
    const wordRange = document.getWordRangeAtPosition(position)

    const curPath = getCurPath()
    const scriptData = ctxData[curPath].ctx.parseData?.[curPath].scriptData

    const word = document.getText(wordRange)
    const canMatch = canMatchLineWord(word, document.lineAt(position.line).text)

    if (!wordRange || !scriptData || !canMatch) {
      return null
    }

    const result = scriptData.keyMap?.has(word)
    if (result) {
      const data = scriptData.keyMap!.get(word)!
      const startPosition = new vscode.Position(data.range.start.line, (data.range.start as any).e)
      const endPosition = new vscode.Position(data.range.end.line, (data.range.end as any).e)
      const linkLocation: vscode.Location = {
        uri: vscode.Uri.file(curPath),
        range: new vscode.Range(startPosition, endPosition),
      }

      return [linkLocation]
    }
  }
}

export class AllComponentRefProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ) {
    const wordRange = document.getWordRangeAtPosition(position)
    const curPath = getCurPath()
    const allRefsUse = ctxData[curPath].ctx.parseData?.[curPath].allRefsUse

    if (!wordRange || !allRefsUse) {
      return null
    }

    const result = allRefsUse.find(item => item.ref.name === document.getText(wordRange))
    if (result) {
      const startPosition = new vscode.Position(result.ref.target.start.line - 1, result.ref.target.start.column)
      const endPosition = new vscode.Position(result.ref.target.end.line - 1, result.ref.target.end.column - 2)
      const linkLocation: vscode.LocationLink = {
        targetUri: vscode.Uri.file(curPath),
        targetRange: new vscode.Range(startPosition, endPosition),
        originSelectionRange: wordRange,
      }

      return [linkLocation]
    }

    const lineText = document.lineAt(position.line).text
    const refUse = allRefsUse.find((item) => {
      return item.refUse?.name === document.getText(wordRange) && lineText.includes(item.ref.name)
    })
    if (refUse?.refUse) {
      const startPosition = new vscode.Position(refUse.refUse.target.start.line, refUse.refUse.target.start.e)
      const endPosition = new vscode.Position(refUse.refUse.target.end.line, refUse.refUse.target.end.e)
      const targetUri = refUse.refUse?.target.source
      const linkLocation: vscode.LocationLink = {
        targetUri: vscode.Uri.file(targetUri!),
        targetRange: new vscode.Range(startPosition, endPosition),
        originSelectionRange: wordRange,
      }

      return [linkLocation]
    }
  }
}

function canMatchLineWord(word: string, lineText: string) {
  const matchWordReg = new RegExp(word, 'g')
  const match = matchWordReg.exec(lineText)

  if (match) {
    const startPos = match.index - 1
    const firstText = lineText[startPos]

    // firstReg用来匹配属性的使用，lineText用来匹配是否是this的调用
    return firstReg.test(firstText) || lineText.includes(`this.${word}`)
  }
  return false
}
