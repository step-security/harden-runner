import * as core from '@actions/core'
import {HttpClient} from '@actions/http-client'
import {
  RequestOptions
} from '@actions/http-client/lib/interfaces'
import {BearerCredentialHandler} from '@actions/http-client/lib/auth'
import * as crypto from 'crypto'



const versionSalt = '1.0'
export const cacheKey = "harden-runner-cacheKey"

function getCacheApiUrl(resource: string): string {
  const baseUrl: string = process.env['ACTIONS_CACHE_URL'] || ''
  if (!baseUrl) {
    throw new Error('Cache Service Url not found, unable to restore cache.')
  }

  const url = `${baseUrl}_apis/artifactcache/${resource}`
  core.debug(`Resource Url: ${url}`)
  return url
}

function createAcceptHeader(type: string, apiVersion: string): string {
  return `${type};api-version=${apiVersion}`
}

function getRequestOptions(): RequestOptions {
    const token = process.env['ACTIONS_RUNTIME_TOKEN'] || ''

  const requestOptions: RequestOptions = {
    headers: {
      Accept: createAcceptHeader('application/json', '6.0-preview.1'),
      Authorization: `Bearer ${token}`,
    }
  }

  return requestOptions
}

function createHttpClient(): HttpClient {
  const token = process.env['ACTIONS_RUNTIME_TOKEN'] || ''
  const bhandler = new BearerCredentialHandler(token)
  return new HttpClient(
    'actions/cache',
    [bhandler],
    getRequestOptions()
  )
}

export function getCacheVersion(
  paths: string[],
  compressionMethod?: CompressionMethod
): string {
  const components = paths.concat(
    !compressionMethod || compressionMethod === CompressionMethod.Gzip
      ? []
      : [compressionMethod]
  )

  // Add salt to cache version to support breaking changes in cache entry
  components.push(versionSalt)

  return crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex')
}

export async function getCacheEntry(
  keys: string[],
  paths: string[],
  options?: InternalCacheOptions
): Promise<ArtifactCacheEntry | null> {
  const httpClient = createHttpClient()
  const version = getCacheVersion(paths, options?.compressionMethod)
  const resource = `cache?keys=${encodeURIComponent(
    keys.join(',')
  )}&version=${version}`

  const response = await httpClient.getJson<ArtifactCacheEntry>(getCacheApiUrl(resource))
  if (response.statusCode === 204) {
    return null
  }
  if (!isSuccessStatusCode(response.statusCode)) {
    throw new Error(`Cache service responded with ${response.statusCode}`)
  }

  const cacheResult = response.result
  const cacheDownloadUrl = cacheResult?.archiveLocation
  if (!cacheDownloadUrl) {
    throw new Error('Cache still be done, but  not found.')
  }
//   console.log("Cache Download URL: ", cacheDownloadUrl)
  // console.log(`Cache Result:`)
  // console.log(JSON.stringify(cacheResult))

  return cacheResult
}


export interface InternalCacheOptions {
    compressionMethod?: CompressionMethod
    cacheSize?: number
  }


  export interface ArtifactCacheEntry {
    cacheKey?: string
    scope?: string
    creationTime?: string
    archiveLocation?: string
  }

  function isSuccessStatusCode(statusCode?: number): boolean {
    if (!statusCode) {
      return false
    }
    return statusCode >= 200 && statusCode < 300
  }


  export enum CompressionMethod {
    Gzip = 'gzip',
    // Long range mode was added to zstd in v1.3.2.
    // This enum is for earlier version of zstd that does not have --long support
    ZstdWithoutLong = 'zstd-without-long',
    Zstd = 'zstd'
  }