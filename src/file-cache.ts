import path from 'node:path'
import { promises as fsPromises, readdirSync, statSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'

interface TCacheOptions {
  basePath: string
  defaultTTL: number // milliseconds
}

interface TCacheSet {
  fileNamePrefix?: string
  fileName: string
  payload: unknown
  ttl?: number
}

type TCacheGet = Pick<TCacheSet, 'fileNamePrefix' | 'fileName'>

interface TLogsOverTime {
  id: number
  bytes: number
  mb: number
  totalSize: string
  endpointInvalidateRequestCount: number
  endpointDeleteRequestCount: number
  endpointDeleteByRegexRequestCount: number
}

// Global variables
let GLOBAL_ENDPOINT_INVALIDATE_REQUEST_COUNT = 0
let GLOBAL_ENDPOINT_DELETE_REQUEST_COUNT = 0
let GLOBAL_ENDPOINT_DELETE_BY_REGEX_REQUEST_COUNT = 0
const GLOBAL_LOGS_OVER_TIME: TLogsOverTime[] = []

export default class FileSystemCachePlugin {
  basePath: string
  defaultTTL: number

  constructor ({ basePath, defaultTTL }: TCacheOptions) {
    this.basePath = basePath
    this.defaultTTL = defaultTTL || 60 // 60 seconds
  }

  private formatFileName ({ fileNamePrefix = '', fileName }: TCacheGet): string {
    return `${fileNamePrefix ? `${fileNamePrefix} hash_` : 'hash_'}${createHash('sha256').update(fileName).digest('hex')}`
  }

  async set ({ fileNamePrefix = '', fileName, payload, ttl = this.defaultTTL }: TCacheSet): Promise<string> {
    const FILE_TTL = ttl * 1000
    const FILE_NAME = this.formatFileName({ fileNamePrefix, fileName })

    try {
      // Construct the cache folder path
      const cacheFolderPath = path.resolve(this.basePath)

      // Ensure the cache folder exists
      await fsPromises.mkdir(cacheFolderPath, { recursive: true })

      // Construct the file path within the cache folder
      const filePath = path.resolve(cacheFolderPath, FILE_NAME)

      // Convert the payload to text format
      const dataToStore = Object(payload)

      // Construct the data object
      const data = {
        payload: dataToStore,
        ttl: FILE_TTL,
        expiration: FILE_TTL ? Date.now() + FILE_TTL : null
      }

      // Write data to the file
      await fsPromises.writeFile(filePath, JSON.stringify(data))

      // console.log(`Data stored successfully to ${this.basePath}/${FILE_NAME} | TTL: ${FILE_TTL}`)

      return filePath
    } catch (err) {
      console.error('Error:', err)
      throw err
    }
  }

  async get ({ fileNamePrefix = '', fileName }: TCacheGet): Promise<any> {
    const FILE_NAME = this.formatFileName({ fileNamePrefix, fileName })
    try {
      // Construct the file path within the cache folder
      const filePath = path.resolve(this.basePath, `${FILE_NAME}`)

      // Check if the file exists
      const stats = await fsPromises.stat(filePath)

      if (!stats.isFile()) {
        throw new Error(`File ${FILE_NAME} does not exist in the cache folder.`)
      }

      // Read the content of the file
      const fileContent = await fsPromises.readFile(filePath, 'utf-8')

      // Parse the JSON content
      const data = JSON.parse(fileContent)

      // Return the payload data
      return data.payload
    } catch (err) {
      // console.error('Error:', err)
      throw err
    }
  }

  private async validateFile (fileName: TCacheGet['fileName']): Promise<{ ttl: number, expiresIn: number | null } | undefined> {
    const FILE_NAME = fileName
    try {
      // Construct the file path within the cache folder
      const filePath = path.resolve(this.basePath, `${FILE_NAME}`)

      // Check if the file exists
      const stats = await fsPromises.stat(filePath)

      if (!stats.isFile()) {
        throw new Error(`File ${fileName} does not exist in the cache folder.`)
      }

      // Read the content of the file
      const fileContent = await fsPromises.readFile(filePath, 'utf-8')

      // Parse the JSON content
      const data = JSON.parse(fileContent)

      // Calculate remaining time until expiration (in seconds)
      const expiresIn = data.expiration ? Math.max(0, (data.expiration - Date.now()) / 1000) : null
      // Return the payload data and TTL

      return {
        ttl: data.ttl / 1000,
        expiresIn
      }
    } catch (err) {
      // console.error('Error:', err)
      // throw err
    }
  }

  async invalidate (): Promise<{ endpointInvalidateRequestCount: number, filesInvalidated: number, totalSize: string, bytes: number, mb: number, logs: any[], logsOverTime: TLogsOverTime[] }> {
    const logs: any[] = []
    let filesInvalidated = 0
    let totalSize = 0
    try {
      const files = readdirSync(this.basePath)
      GLOBAL_ENDPOINT_INVALIDATE_REQUEST_COUNT++
      for (const file of files) {
        const object = { file: '', ttl: 0, diff: 0, size: '0', valid: true }
        const stats = statSync(`${this.basePath}/${file}`)
        try {
          const { ttl, expiresIn } = (await this.validateFile(file)) || { ttl: 0, expiresIn: 0 }
          const invalid = (expiresIn || 0) <= 0
          object.file = file
          object.ttl = ttl
          object.diff = expiresIn || 0
          const sizeInMB = stats.size / (1024 * 1024)
          object.size = `${sizeInMB.toFixed(2)} MB | ${stats.size} bytes`
          totalSize += stats.size
          object.valid = !invalid
          if (invalid) {
            unlinkSync(`${this.basePath}/${file}`)
            filesInvalidated++
          }
          logs.push(object)
        } catch (_) {}
      }
    } catch (e) {}
    const totalSizeInMB = totalSize / (1024 * 1024)
    GLOBAL_LOGS_OVER_TIME.push({
      id: new Date().getTime(),
      bytes: totalSize,
      mb: totalSizeInMB,
      totalSize: `${totalSizeInMB.toFixed(2)} MB | ${totalSize} bytes`,
      endpointInvalidateRequestCount: GLOBAL_ENDPOINT_INVALIDATE_REQUEST_COUNT,
      endpointDeleteRequestCount: GLOBAL_ENDPOINT_DELETE_REQUEST_COUNT,
      endpointDeleteByRegexRequestCount: GLOBAL_ENDPOINT_DELETE_BY_REGEX_REQUEST_COUNT
    })
    return {
      endpointInvalidateRequestCount: GLOBAL_ENDPOINT_INVALIDATE_REQUEST_COUNT,
      filesInvalidated,
      totalSize: `${totalSizeInMB.toFixed(2)} MB | ${totalSize} bytes`,
      bytes: totalSize,
      mb: totalSizeInMB,
      logs,
      logsOverTime: GLOBAL_LOGS_OVER_TIME
    }
  }

  async flushByRegex (org: string, regex: string = ''): Promise<{ endpointDeleteRequestByRegexCount: number, deleted: number } | undefined> {
    try {
      GLOBAL_ENDPOINT_DELETE_BY_REGEX_REQUEST_COUNT++
      const files = readdirSync(this.basePath)
      let deleted = 0

      for (const file of files) {
        if (file.match(org) && file.match(regex)) {
          unlinkSync(`${this.basePath}/${file}`)
          deleted++
        }
      }
      return {
        endpointDeleteRequestByRegexCount: GLOBAL_ENDPOINT_DELETE_BY_REGEX_REQUEST_COUNT,
        deleted
      }
    } catch (error: any) {
      console.error('Error reading cache folder:', error.message)
    }
  }

  async flushAll (): Promise<{ endpointDeleteRequestCount: number, deleted: number } | undefined> {
    try {
      GLOBAL_ENDPOINT_DELETE_REQUEST_COUNT++
      const files = readdirSync(this.basePath)

      for (const file of files) {
        unlinkSync(`${this.basePath}/${file}`)
      }
      return {
        endpointDeleteRequestCount: GLOBAL_ENDPOINT_DELETE_REQUEST_COUNT,
        deleted: files.length
      }
    } catch (error: any) {
      console.error('Error reading cache folder:', error.message)
    }
  }
}
