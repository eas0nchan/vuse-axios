import { ref, shallowRef, onUnmounted, getCurrentInstance } from 'vue'
import type { Ref, ShallowRef } from 'vue'
import axios, { AxiosError } from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

interface UseAxiosOptions<T, D> {
  autoCancelLastReq?: boolean
  autoCancelOnUnmounted?: boolean
  immediate?: boolean
  payload?: T | (() => T)
  retry?: number
  onSuccess?: (data: D, response: AxiosResponse<D>) => void
  onError?: (error: AxiosError) => void
  onFinish?: () => void
}

interface UseAxiosReturn<T, D> {
  response: ShallowRef<AxiosResponse<D> | undefined>
  data: ShallowRef<D | undefined>
  error: ShallowRef<AxiosError | undefined>
  isLoading: Ref<boolean>
  isFinished: Ref<boolean>
  execute: (payload?: T) => Promise<ExecuteReturn<D>>
  cancel: () => void
}

interface ExecuteReturn<D> {
  response: AxiosResponse<D> | undefined
  data: D | undefined
  error: AxiosError | undefined
  isCancel: boolean
}

interface Payload {
  params?: Record<string, string | number | boolean>
  data?: object
  urlParams?: Record<string, string | number>
}

export function useAxios<T extends Payload = never, D = any>(
  url: string,
  config?: AxiosRequestConfig,
  options: UseAxiosOptions<T, D> = {},
  instance: AxiosInstance = axios
): UseAxiosReturn<T, D> {
  const {
    autoCancelLastReq = false,
    autoCancelOnUnmounted = false,
    immediate = false,
    payload,
    retry = 0,
    onSuccess,
    onError,
    onFinish
  } = options

  const defaultPayload = () => (typeof payload === 'function' ? payload() : payload)

  const response = shallowRef<AxiosResponse<D>>()
  const data = shallowRef<D>()
  const error = shallowRef<AxiosError>()
  const isLoading = ref(false)
  const isFinished = ref(false)

  const isDynamicURL = /\{\w+\}/.test(url)

  async function execute(payload: T | undefined = defaultPayload()): Promise<ExecuteReturn<D>> {
    if (autoCancelLastReq) cancel()

    controller = new AbortController()

    let _url = url
    const { urlParams, ...restPayload } = payload ?? {}
    if (isDynamicURL && urlParams) {
      _url = url.replace(/\{(\w+)\}/, (_, key: string) => String(urlParams[key]))
    }
    const _config = Object.assign({}, config, restPayload, { signal: controller.signal })

    isLoading.value = true
    isFinished.value = false
    const [res, err] = await executeWithRetry<D>(() => instance(_url, _config), retry)
    if (axios.isCancel(err)) return { isCancel: true } as ExecuteReturn<D>
    response.value = res
    data.value = res?.data
    error.value = err
    isLoading.value = false
    if (res) onSuccess?.(res.data, res)
    else if (err) onError?.(err)
    isFinished.value = true
    onFinish?.()

    return { response: res, data: res?.data, error: err, isCancel: false }
  }

  let controller: AbortController
  function cancel() {
    if (isLoading.value) return
    controller?.abort()
    isLoading.value = false
  }

  if (autoCancelOnUnmounted && getCurrentInstance()) onUnmounted(cancel)

  if (immediate) execute()

  return { response, data, error, isLoading, isFinished, execute, cancel }
}

function executeWithRetry<D>(
  asyncFn: () => Promise<any>,
  time = 0
): Promise<[AxiosResponse<D> | undefined, AxiosError | undefined]> {
  return new Promise(resolve => {
    const asyncFnWrap = () => {
      asyncFn()
        .then(res => resolve([res, undefined]))
        .catch(err => (time-- > 0 ? asyncFnWrap() : resolve([undefined, err])))
    }
    asyncFnWrap()
  })
}
