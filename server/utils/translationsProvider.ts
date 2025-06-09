import { OpenAI } from 'openai'
import { fillSystemPrompt, getTranslationResult, getUsedTokens, getHeadersData, assembleUserData, splitTranslationResult, extractAndConvertTime, DELIMITER_TYPE } from '~/server/utils'
import Logger from '~/server/utils/logger'
import { ApiKeyUsageLog, Provider } from '~/server/models'
import TranslationManager from '~/server/utils/translation'
import { Sequelize } from 'sequelize'

// 每次请求的最大 tokens 数量
const TARGET_TOKENS = 8192;

// 创建一个翻译提供商的类, 用于管理单个翻译提供商, 可用于管理 rpm, rpd, tpm, tpd 等限制, 采用滑动窗口算法计算下次请求时间, 并根据请求次数和请求时间计算请求限制, 还有就是当前翻译提供商如果空闲了, 则可以向父类索要待翻译数据, 需要确保每次翻译的数据都要饱和, 可以达到每次 maxTokens 的 70 ~ 80%
class TranslationProvider {
  private model: string;
  private rpm: number;
  private rpd: number;
  private tpm: number;
  private tpd: number;
  private dailyRequestCount: number;
  private dailyTokenCount: number;
  private providerId: number;
  private providerName: string;
  private apiKey: string;

  // 请求队列
  private requestQueue: any[] = [];
  // 上次请求时间
  private lastRequestTime: number = 0;
  // 是否正在处理请求
  private isProcessing: boolean = false;
  // 父翻译管理器
  private manager: TranslationManager;
  // 是否正在运行
  private running: boolean = false;

  // openai 实例
  private openaiInstance: OpenAI;

  // 当前翻译提供商是否可用
  private isAvailable: boolean = true;

  constructor(providerInfo: any) {
    const { apiKey, baseURL, model, rpm, rpd, tpm, tpd, dailyRequestCount, dailyTokenCount, currentMinuteRequests, manager, providerId, providerName } = providerInfo;

    this.model = model;
    this.rpm = rpm;
    this.rpd = rpd;
    this.tpm = tpm;
    this.tpd = tpd;
    this.dailyRequestCount = dailyRequestCount;
    this.dailyTokenCount = dailyTokenCount;
    this.requestQueue = currentMinuteRequests || [];
    this.manager = manager;
    this.providerId = providerId;
    this.providerName = providerName;
    this.apiKey = apiKey;

    Logger.info(`初始化翻译提供商: [${providerName} | ${providerId}] 模型: ${model}, 请求限制: ${rpm} 次/分钟, ${rpd} 次/天, ${tpm} tokens/分钟, ${tpd} tokens/天, apiKey: ${apiKey}, baseURL: ${baseURL}`);

    this.openaiInstance = new OpenAI({
      apiKey,
      baseURL,
      maxRetries: 0 // 禁用SDK内部的重试，由我们自己的逻辑控制
    });

    this.start();
  }

  // 启动翻译提供商，开始请求翻译任务
  public start() {
    if (this.running) {
      return;
    }

    if (!this.isAvailable) {
      Logger.info(`翻译提供商 [${this.providerName} | ${this.providerId}] 不可用, 跳过...`);

      return;
    }

    Logger.info(`翻译提供商 [${this.providerName} | ${this.providerId}] 开始处理翻译任务...`);

    this.running = true;
    this.processNextTask();
  }

  // 停止翻译提供商
  public stop() {
    this.running = false;
    this.isProcessing = false;
  }

  // 处理下一个任务
  private async processNextTask() {
    if (!this.running || this.isProcessing) {
      return;
    }

    let requestParams: any = {};
    let response: any = {};
    let headersData: any = {};

    this.isProcessing = true;

    // 计算是否可以发送请求
    const { canSend, waitTime } = this.canSendRequest();

    if (!canSend) {
      Logger.info(`提供商 [${this.providerName} | ${this.providerId}] 需要等待 ${waitTime}ms 才能发送下一个请求`);

      setTimeout(() => {
        this.isProcessing = false;
        this.processNextTask();
      }, waitTime);

      return;
    }

    // 如果可以请求, 那么计算当前分钟已请求的 tokens 数量, 以及当前天已请求的 tokens 数量
    const tokensInLastMinute = this.requestQueue.reduce((sum, req) => sum + req.tokens, 0);
    // 获取当前分钟可请求的 tokens 数量
    const canRequestTokens = this.tpm - tokensInLastMinute;
    // 获取当前天可请求的 tokens 数量
    const canRequestTokensInDay = this.tpd - this.dailyTokenCount;
    // 本次请求的 tokens 数量, 不能超出 TARGET_TOKENS
    const requestTokens = Math.min(canRequestTokens, canRequestTokensInDay, TARGET_TOKENS);
    Logger.info(`提供商 [${this.providerName} | ${this.providerId}] 本次要拿的任务的 tokens 数量: ${requestTokens}`);

    // 从管理器获取翻译任务
    const taskBatch = this.manager.getTranslationTask(this.model, requestTokens);

    if (taskBatch && taskBatch.message === 'TOO_FEW_TOKENS') {
      // 表示当前翻译提供商当前分钟内 tokens 数量不足, 需要等到下一个分钟将 tokens 数量补足
      // 找到最早的请求，计算何时可以发送下一个请求
      const oneMinute = 60 * 1000;
      const earliestRequest = this.requestQueue[0];
      const nextRequestTime = earliestRequest.start.getTime() + oneMinute;
      const waitTime = nextRequestTime - new Date().getTime();

      Logger.info(`提供商 [${this.providerName} | ${this.providerId}] 当前分钟内 tokens 数量不足, 需要等到下一个分钟将 tokens 数量补足, 等待 ${waitTime}ms`);

      setTimeout(() => {
        this.isProcessing = false;
        this.processNextTask();
      }, waitTime);

      return;
    }

    if (!taskBatch || taskBatch.tasks.length === 0) {
      this.stop();

      return;
    }

    const { tasks, totalTokens } = taskBatch;

    // 预估的 tokens 数量
    const estimatedInputTokens = tasks.reduce((sum, task) => sum + (task[this.model] || 0), 0);

    // 提取要翻译的文本
    const textsToTranslate = tasks.map((task: any) => task.sourceText);
    const { sourceLocale, targetLocale } = tasks[0];

    Logger.info(`提供商 [${this.providerName} | ${this.providerId}] 开始翻译 ${tasks.length} 个任务, 预计使用 ${totalTokens} tokens`);

    // 执行翻译请求
    const systemPrompt = await fillSystemPrompt(sourceLocale, targetLocale);
    const userMessage = assembleUserData(textsToTranslate);

    // 记录请求开始时间
    const requestStartTime = new Date();
    this.lastRequestTime = requestStartTime.getTime();

    requestParams = {
      model: this.model,
      messages: [{
        role: 'system',
        content: systemPrompt
      }, {
        role: 'user',
        content: userMessage
      }],
      stream: false,
      temperature: 0,
      ...(DELIMITER_TYPE === 'json' ? {
        response_format: {
          type: 'json_object'
        }
      } : {})
    }

    try {
      response = await this.openaiInstance.chat.completions.create(requestParams).withResponse();

      headersData = getHeadersData(response.response.headers);

      // 记录请求结束时间
      const requestEndTime = new Date();
      const durationMs = requestEndTime.getTime() - requestStartTime.getTime();

      // 获取使用的 token 数量
      const { totalTokens: usedTokens, promptTokens: inputTokens, completionTokens: outputTokens } = getUsedTokens(response.data);

      // 拿返回的数据中的 created 时间戳
      const created = response.data.created;

      // 更新请求记录
      this.requestQueue.push({
        requestStartTime,
        // 客户端请求开始时间
        start: created ? new Date(created * 1000) : requestStartTime,
        // 如果没拿到, 那就使用预估的 tokens 数量
        tokens: usedTokens || estimatedInputTokens,
        // 预估的 tokens 数量
        estimatedInputTokens,
        // 实际使用的 tokens 数量
        usedTokens,
        // 服务端得到客户端响应的时间
        backStartTime: created || null
      });

      // 增加计数
      this.dailyRequestCount++;
      this.dailyTokenCount += usedTokens;

      // 需要实时更新 provider 的 当前分钟请求次数, 以及当前分钟请求 tokens 数量, 还有就是当前天请求次数, 以及当前天请求 tokens 数量
      const provider = await Provider.findOne({
        where: {
          id: this.providerId
        }
      });

      if (provider) {
        // 获取当前分钟已请求的 tokens 数量
        const tokensInLastMinute = this.requestQueue.reduce((sum, req) => sum + req.tokens, 0);

        // 使用原子操作更新
        await Provider.update({
          minuteRequestCount: this.requestQueue.length || 0,
          minuteTokenCount: tokensInLastMinute || 0,
          dailyRequestCount: Sequelize.literal(`dailyRequestCount + 1`),
          dailyTokenCount: Sequelize.literal(`dailyTokenCount + ${usedTokens}`)
        }, {
          where: {
            id: this.providerId
          }
        });

        Logger.info(`提供商 [${this.providerName} | ${this.providerId}] 更新分钟请求次数: ${provider.minuteRequestCount}, 更新分钟请求 tokens 数量: ${provider.minuteTokenCount}, 更新天请求次数: ${provider.dailyRequestCount}, 更新天请求 tokens 数量: ${provider.dailyTokenCount}`);
      }

      // 记录API使用日志
      await ApiKeyUsageLog.create({
        providerId: this.providerId,
        model: this.model,
        apiKey: this.apiKey,
        estimatedInputTokens,
        inputTokens,
        outputTokens,
        tokensUsed: usedTokens,
        requestType: 'translate',
        status: 'ok',
        requestStartTime,
        requestEndTime,
        durationMs,
        requestParams: JSON.stringify(requestParams || {}),
        responseData: JSON.stringify({
          headers: headersData,
          data: response.data
        })
      });

      // 获取翻译结果
      const translationResult = getTranslationResult(response.data);

      // 处理结果，分割多个文本
      const results = splitTranslationResult(translationResult);

      // 通知管理器处理成功
      this.manager.handleTranslationSuccess(tasks, results);

      Logger.info(`提供商 [${this.providerName} | ${this.providerId}] 翻译成功, 使用了 ${usedTokens} tokens, 耗时 ${durationMs}ms`);
    } catch (error: any) {
      Logger.error(`提供商 [${this.providerName} | ${this.providerId}] 翻译失败: ${error.message || error}`);

      // 通知管理器处理失败
      if (this.manager) {
        this.manager.handleTranslationError(tasks, error);
      }

      // 获取使用的 token 数量
      const { totalTokens: usedTokens, promptTokens: inputTokens, completionTokens: outputTokens } = getUsedTokens(response.data);

      // 如果翻译失败, 也需要更新 provider 的 当前分钟请求次数, 以及当前分钟请求 tokens 数量, 还有就是当前天请求次数, 以及当前天请求 tokens 数量
      const provider = await Provider.findOne({
        where: {
          id: this.providerId
        }
      });

      if (provider) {
        await Provider.update({
          minuteRequestCount: Sequelize.literal(`minuteRequestCount + 1`),
          minuteTokenCount: Sequelize.literal(`minuteTokenCount + 1`)
        }, {
          where: {
            id: this.providerId
          }
        });

        Logger.info(`提供商 [${this.providerName} | ${this.providerId}] 更新分钟请求次数: ${provider.minuteRequestCount}, 更新分钟请求 tokens 数量: ${provider.minuteTokenCount}`);
      }

      // 记录API使用日志 - 失败
      await ApiKeyUsageLog.create({
        providerId: this.providerId,
        model: this.model,
        apiKey: this.apiKey,
        tokensUsed: usedTokens || 0,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        estimatedInputTokens,
        requestType: 'translate',
        status: 'error',
        errorMsg: error.message || String(error),
        requestStartTime: new Date(this.lastRequestTime),
        requestEndTime: new Date(),
        durationMs: new Date().getTime() - this.lastRequestTime,
        requestParams: JSON.stringify(requestParams || {}),
        responseData: JSON.stringify({
          headers: headersData,
          data: response.data
        })
      });

      if (error instanceof OpenAI.APIError) {
        const { status } = error;

        if (status === 429) {
          const { timeStr, milliseconds } = extractAndConvertTime(error.message);
          Logger.info(`timeStr: ${timeStr}`);

          Logger.info(`提供商 [${this.providerName} | ${this.providerId}] 被限流, 需要等待 ${milliseconds}ms 才能继续请求`);

          this.isAvailable = false;
          this.stop();

          setTimeout(() => {
            this.isAvailable = true;
            this.start();
          }, milliseconds || 0);

          return;
        }
      }
    } finally {
      this.isProcessing = false;

      // 继续处理下一个任务
      if (this.running) {
        // 添加一点延迟，避免过于频繁的请求
        setTimeout(() => this.processNextTask(), 100);
      }
    }
  }

  // 检查是否可以发送请求
  private canSendRequest(): { canSend: boolean, waitTime: number } {
    const now = new Date().getTime();
    const oneMinute = 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    // 清理超过一分钟的请求
    this.requestQueue = this.requestQueue.filter(req => (now - req.start.getTime()) <= oneMinute);

    // 检查RPM限制
    if (this.rpm > 0) {
      const requestsInLastMinute = this.requestQueue.length;
      if (requestsInLastMinute >= this.rpm) {
        // 找到最早的请求，计算何时可以发送下一个请求
        const earliestRequest = this.requestQueue[0];
        const nextRequestTime = earliestRequest.start.getTime() + oneMinute;

        return { canSend: false, waitTime: Math.max(1, nextRequestTime - now) };
      }
    }

    // 检查RPD限制
    if (this.rpd > 0 && this.dailyRequestCount >= this.rpd) {
      // 需要等到第二天
      return { canSend: false, waitTime: oneDay };
    }

    // 检查TPM限制
    if (this.tpm > 0) {
      const tokensInLastMinute = this.requestQueue.reduce((sum, req) => sum + req.tokens, 0);
      if (tokensInLastMinute >= this.tpm) {
        // 找到最早的请求，计算何时可以发送下一个请求
        const earliestRequest = this.requestQueue[0];
        const nextRequestTime = earliestRequest.start.getTime() + oneMinute;
        return { canSend: false, waitTime: Math.max(1, nextRequestTime - now) };
      }
    }

    // 检查TPD限制
    if (this.tpd > 0 && this.dailyTokenCount >= this.tpd) {
      // 需要等到第二天
      return { canSend: false, waitTime: oneDay };
    }

    // 如果距离上次请求时间太短，等待一小段时间
    const minRequestInterval = 1000; // 最小请求间隔，防止请求过于频繁
    if (now - this.lastRequestTime < minRequestInterval) {
      return { canSend: false, waitTime: minRequestInterval - (now - this.lastRequestTime) };
    }

    return { canSend: true, waitTime: 0 };
  }
}

export default TranslationProvider;