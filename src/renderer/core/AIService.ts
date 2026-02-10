import { AIProtocol } from './AIProtocol'
import { DiceLogic } from './DiceLogic'

export type APIType = 'chat' | 'image' | 'video'

export interface AIConfig {
  apiKey: string
  baseUrl: string
  model: string
  type?: APIType
}

export interface ImageGenerationOptions {
  prompt: string
  n?: number
  size?: string
  quality?: string
  style?: string
  responseFormat?: 'url' | 'b64_json'
}

export interface VideoGenerationOptions {
  prompt: string
  duration?: number
  resolution?: string
}

export interface GenerationResponse {
  success: boolean
  data?: any
  error?: string
}

export class AIService {
  private chatConfig: AIConfig

  constructor(config: AIConfig) {
    this.chatConfig = config
  }

  async sendMessage(
    userPrompt: string, 
    onToken: (token: string) => void,
    onRoll: (roll: any) => void,
    skipContextInjection: boolean = false
  ): Promise<string> {
    if (!this.chatConfig.apiKey || !this.chatConfig.baseUrl) {
      throw new Error('配置错误: 缺少 API Key 或 Base URL。请检查设置。')
    }

    const fullPrompt = skipContextInjection ? userPrompt : await AIProtocol.injectContext(userPrompt)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    try {
      const fetchResponse = await fetch(`${this.chatConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.chatConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.chatConfig.model,
          messages: [{ role: 'user', content: fullPrompt }],
          stream: true
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!fetchResponse.ok) {
        throw new Error(`AI 服务请求失败: ${fetchResponse.status} ${fetchResponse.statusText}`)
      }

      const reader = fetchResponse.body?.getReader()
      const decoder = new TextDecoder('utf-8')
      let fullText = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n').filter(line => line.trim() !== '')
          
          for (const line of lines) {
            if (line.includes('[DONE]')) break
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                const token = data.choices[0]?.delta?.content || ''
                if (token) {
                  fullText += token
                  onToken(token)

                  const intercepted = AIProtocol.interceptRolls(fullText)
                  if (intercepted) {
                    const result = DiceLogic.parseAndRoll(intercepted.roll)
                    onRoll(result)
                  }
                }
              } catch (e) {
                console.error('Error parsing stream chunk', e)
              }
            }
          }
        }
      }

      return fullText
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('AI Service Timeout')
        throw new Error('连接超时: AI 服务响应时间过长 (60s)，请检查网络或模型服务状态。')
      }
      console.error('AI Service Error:', error)
      throw error
    }
  }

  async generateImage(config: AIConfig, options: ImageGenerationOptions): Promise<GenerationResponse> {
    if (!config.apiKey || !config.baseUrl) {
      return { success: false, error: '配置错误: 缺少 API Key 或 Base URL。请检查设置。' }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000)

    try {
      const endpoint = `${config.baseUrl}/images/generations`
      
      const body: any = {
        model: config.model,
        prompt: options.prompt,
        response_format: options.responseFormat || 'url'
      }

      if (options.n) body.n = options.n
      if (options.size) body.size = options.size
      if (options.quality) body.quality = options.quality
      if (options.style) body.style = options.style

      const fetchResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text()
        throw new Error(`图像生成失败: ${fetchResponse.status} ${fetchResponse.statusText} - ${errorText}`)
      }

      const data = await fetchResponse.json()
      return { success: true, data }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        return { success: false, error: '生成超时: 图像生成时间过长，请检查网络或服务状态。' }
      }
      console.error('Image Generation Error:', error)
      return { success: false, error: error.message }
    }
  }

  async generateVideo(config: AIConfig, options: VideoGenerationOptions): Promise<GenerationResponse> {
    if (!config.apiKey || !config.baseUrl) {
      return { success: false, error: '配置错误: 缺少 API Key 或 Base URL。请检查设置。' }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 300000)

    try {
      const endpoint = `${config.baseUrl}/videos/generations`
      
      const body: any = {
        model: config.model,
        prompt: options.prompt
      }

      if (options.duration) body.duration = options.duration
      if (options.resolution) body.resolution = options.resolution

      const fetchResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text()
        throw new Error(`视频生成失败: ${fetchResponse.status} ${fetchResponse.statusText} - ${errorText}`)
      }

      const data = await fetchResponse.json()
      return { success: true, data }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        return { success: false, error: '生成超时: 视频生成时间过长，请检查网络或服务状态。' }
      }
      console.error('Video Generation Error:', error)
      return { success: false, error: error.message }
    }
  }

  async checkVideoStatus(config: AIConfig, videoId: string): Promise<GenerationResponse> {
    if (!config.apiKey || !config.baseUrl) {
      return { success: false, error: '配置错误: 缺少 API Key 或 Base URL。' }
    }

    try {
      const endpoint = `${config.baseUrl}/videos/${videoId}`
      
      const fetchResponse = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!fetchResponse.ok) {
        throw new Error(`状态查询失败: ${fetchResponse.status} ${fetchResponse.statusText}`)
      }

      const data = await fetchResponse.json()
      return { success: true, data }
    } catch (error: any) {
      console.error('Video Status Check Error:', error)
      return { success: false, error: error.message }
    }
  }
}
