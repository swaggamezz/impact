declare module 'papaparse' {
  type ParseConfig = {
    header?: boolean
    skipEmptyLines?: boolean
  }

  type ParseResult<T> = {
    data: T[]
    errors: unknown[]
  }

  const Papa: {
    parse<T>(input: string, config?: ParseConfig): ParseResult<T>
  }

  export default Papa
}

declare module 'mammoth/mammoth.browser' {
  type ExtractResult = {
    value: string
    messages: unknown[]
  }

  export function extractRawText(options: {
    arrayBuffer: ArrayBuffer
  }): Promise<ExtractResult>
}
