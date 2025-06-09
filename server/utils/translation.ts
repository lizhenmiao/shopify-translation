import { getCurrentUTCTime, fillSystemPrompt, DELIMITER_TYPE, SINGLE_TEXT_SEPARATOR, PAIR_TEXT_SEPARATOR_START, PAIR_TEXT_SEPARATOR_END } from '~/server/utils'
import { Provider, ApiKeyUsageLog, ResourceItem } from '~/server/models'
import { Op } from 'sequelize'
import { countTokens, freeAllTokenEncoders } from '~/server/utils/token-counter'
import Logger from '~/server/utils/logger'
import TranslationProvider from '~/server/utils/translationsProvider'

// 创建一个管理翻译数据的类, 用于管理多个翻译提供商
class TranslationManager {
  // 首先需要获取所有翻译提供商
  private providers: Map<string | number, TranslationProvider> = new Map();
  // 获取所有翻译提供商的 model, 为之后计算 token 数量做准备
  private models: string[] = [];
  // 待翻译队列
  private queue: any[] = [];
  // 翻译成功队列
  private successQueue: any[] = [];
  // 翻译失败队列
  private errorQueue: any[] = [];
  // 正在处理的任务 Map，用于防止重复处理
  private processingItems: Map<string, boolean> = new Map();

  // 每个模型和每种语言下的 system prompt 的 tokens 数量
  private systemPromptTokens: Map<string, number> = new Map();

  // 每个模型下的 单一分割符 的 tokens 数量
  private separatorTokens: Map<string, number> = new Map();
  // 每个模型下的 成对分割符 开始 的 tokens 数量
  private separatorStartTokens: Map<string, number> = new Map();
  // 每个模型下的 成对分割符 结束 的 tokens 数量
  private separatorEndTokens: Map<string, number> = new Map();
  // JSON格式包装的额外tokens数量估算
  private jsonOverheadTokens: Map<string, number> = new Map();

  // 当前翻译队列中的语言数组
  private languages: Map<string, number> = new Map();

  constructor() {
    // 待翻译队列
    this.queue = [];
    // 翻译成功队列
    this.successQueue = [];
    // 翻译失败队列
    this.errorQueue = [];
    // 正在处理的任务
    this.processingItems = new Map();

    this.providers = new Map();
    this.models = [];

    this.systemPromptTokens = new Map();

    this.separatorTokens = new Map();
    this.separatorStartTokens = new Map();
    this.separatorEndTokens = new Map();
    this.jsonOverheadTokens = new Map();

    this.languages = new Map();
  }

  // 获取所有翻译提供商
  public async getProviders() {
    const providers = await Provider.findAll({
      where: {
        isActive: 1
      }
    });

    // 依次创建翻译提供商
    for (const provider of providers) {
      if (this.providers.has(provider.id)) {
        continue;
      }

      const { requestsPerMinute, requestsPerDay, tokensPerMinute, tokensPerDay, dailyRequestCount, dailyTokenCount, id, key, baseUrl, model } = provider;

      // 查询当前翻译提供商的当前分钟的请求数据
      const currentMinute = getCurrentUTCTime();
      const currentMinuteRequests = await ApiKeyUsageLog.findAll({
        where: {
          providerId: id,
          model,
          apiKey: key,
          createdAt: {
            [Op.gte]: currentMinute
          }
        },
        order: [
          ['createdAt', 'ASC']
        ]
      });

      // 进行初始化一个翻译提供商
      const translationProvider = new TranslationProvider({
        apiKey: key,
        baseURL: baseUrl,
        model,
        rpm: requestsPerMinute,
        rpd: requestsPerDay,
        tpm: tokensPerMinute,
        tpd: tokensPerDay,
        dailyRequestCount,
        dailyTokenCount,
        currentMinuteRequests: currentMinuteRequests.map((item: any) => ({
          start: item.requestStartTime,
          tokens: item.tokensUsed
        })),
        manager: this,
        providerId: id,
        providerName: provider.name
      });

      this.providers.set(provider.id, translationProvider);

      if (!this.models.includes(model)) {
        this.models.push(model);
      }
    }

    for (const model of this.models) {
      if (DELIMITER_TYPE === 'single') {
        if (!this.separatorTokens.has(model)) {
          this.separatorTokens.set(model, countTokens(SINGLE_TEXT_SEPARATOR, model));
        }

        continue;
      }

      if (DELIMITER_TYPE === 'pair') {
        if (!this.separatorStartTokens.has(model)) {
          this.separatorStartTokens.set(model, countTokens(PAIR_TEXT_SEPARATOR_START, model));
        }

        if (!this.separatorEndTokens.has(model)) {
          this.separatorEndTokens.set(model, countTokens(PAIR_TEXT_SEPARATOR_END, model));
        }

        continue;
      }

      if (DELIMITER_TYPE === 'json') {
        // 计算空的JSON包装的tokens数量
        const emptyJsonWrapper = JSON.stringify({ segments: [] });
        const jsonOverhead = countTokens(emptyJsonWrapper, model);
        this.jsonOverheadTokens.set(model, jsonOverhead);

        continue;
      }
    }

    Logger.info(`已获取 ${this.providers.size} 个翻译提供商, 模型: ${this.models.join(', ')}`);
  }

  // 检查是否存在重复的资源
  private checkRepeat(item: any, queue: any[]) {
    const { sourceText, sourceLocale, targetLocale, resourceId, key, digestHash } = item;

    if (queue.find((item: any) => item.sourceText === sourceText && item.sourceLocale === sourceLocale && item.targetLocale === targetLocale && item.resourceId === resourceId && item.key === key && item.digestHash === digestHash)) {
      return true;
    }

    return false;
  }

  // 添加翻译队列
  public async addQueue(translationQueue: any[]) {
    await this.getProviders();

    // 初始化队列
    const queue: any[] = [];

    // 遍历翻译队列
    for (const item of translationQueue) {
      const { sourceText, sourceLocale, targetLocale, resourceId, key, digestHash } = item;

      // 需要确保当前 待翻译队列、翻译成功队列、翻译失败队列 中没有重复的资源
      if (this.checkRepeat(item, this.queue)) {
        continue;
      }

      if (this.checkRepeat(item, this.successQueue)) {
        continue;
      }

      if (this.checkRepeat(item, this.errorQueue)) {
        continue;
      }

      const languageKey = `${sourceLocale}-${targetLocale}`;
      if (!this.languages.has(languageKey)) {
        this.languages.set(languageKey, 0);
      }

      // 将队列项添加到队列中
      queue.push({
        sourceText,
        sourceLocale,
        targetLocale,
        resourceId,
        key,
        digestHash,
        ...this.models.reduce((acc: any, model: string) => {
          acc[model] = countTokens(sourceText, model);
          return acc;
        }, {}),
        taskId: `${resourceId}:${key}:${digestHash}:${sourceLocale}-${targetLocale}`
      });
    }

    // 释放所有 token 编码器
    freeAllTokenEncoders();

    // 将队列添加到待翻译队列中
    this.queue.push(...queue);

    for (const language of this.languages.keys()) {
      for (const model of this.models) {
        const [sourceLocale, targetLocale] = language.split('-');
        const systemPromptKey = this.generateSystemPromptKey(sourceLocale, targetLocale, model);

        if (this.systemPromptTokens.has(systemPromptKey)) {
          continue;
        }

        const systemPrompt = await fillSystemPrompt(sourceLocale, targetLocale);
        const systemPromptTokens = countTokens(systemPrompt, model);

        this.systemPromptTokens.set(systemPromptKey, systemPromptTokens);
      }
    }

    Logger.info(`已添加 ${queue.length} 个翻译资源, 待翻译队列长度: ${this.queue.length}`);

    // 通知翻译提供商获取待翻译数据
    for (const provider of this.providers.values()) {
      provider.start();
    }
  }

  // 生成 system prompt 的 map key
  private generateSystemPromptKey(sourceLocale: string, targetLocale: string, model: string) {
    return `${sourceLocale}-${targetLocale}-${model}`;
  }

  // 获取待翻译的任务, 传入 model 以及需要的 token 数量, 之后会返回 任务列表 以及 总预估 token 数量
  public getTranslationTask(model: string, targetTokens: number): {
    tasks: any[],
    totalTokens: number,
    message?: string
  } {
    const tasks: any[] = [];

    // 队列为空时直接返回
    if (this.queue.length === 0) {
      return { tasks, totalTokens: 0 };
    }

    // 目标区间
    const targetTokens70 = targetTokens * 0.7;
    const targetTokens80 = targetTokens * 0.8;

    // 使用任务ID集合而不是索引，避免并发问题
    const selectedTaskIds = new Set<string>();

    // 先找第一个不超过 80% 限制的任务
    let firstTask = null;

    // 创建队列的快照，避免在遍历过程中队列被修改
    const queueSnapshot = [...this.queue];

    for (const item of queueSnapshot) {
      // 如果任务已被其他提供商处理，跳过
      if (this.processingItems.has(item.taskId)) {
        continue;
      }

      const itemTokens = item[model] || 0;
      const systemPromptKey = this.generateSystemPromptKey(item.sourceLocale, item.targetLocale, model);
      const systemPromptTokens = this.systemPromptTokens.get(systemPromptKey) || 0;


      let totalItemTokens = itemTokens + systemPromptTokens;

      if (DELIMITER_TYPE === 'pair') {
        // 计算包含标签的tokens
        const separatorStartTokens = this.separatorStartTokens.get(model) || 0;
        const separatorEndTokens = this.separatorEndTokens.get(model) || 0;

        totalItemTokens += separatorStartTokens + separatorEndTokens;
      }

      if (DELIMITER_TYPE === 'json') {
        // 获取JSON包装的额外tokens
        const jsonOverheadTokens = this.jsonOverheadTokens.get(model) || 0;

        totalItemTokens += jsonOverheadTokens;
      }

      // 找到第一个不超过限制的任务
      if (totalItemTokens <= targetTokens80) {
        firstTask = item;
        selectedTaskIds.add(item.taskId);
        this.processingItems.set(item.taskId, item);
        tasks.push(item);

        break;
      }
    }

    // 如果没有找到合适的第一个任务，返回null
    if (firstTask === null) {
      return {
        tasks,
        totalTokens: 0,
        message: 'TOO_FEW_TOKENS'
      };
    }

    // 移除选中的任务并标记为处理中
    this.queue = this.queue.filter(item => {
      if (selectedTaskIds.has(item.taskId)) {
        return false; // 从队列中移除
      }

      return true; // 保留在队列中
    });

    // 计算第一个任务的tokens (包含system prompt)
    const { sourceLocale, targetLocale } = firstTask;
    const firstTaskTokens = firstTask[model] || 0;
    const systemPromptKey = this.generateSystemPromptKey(sourceLocale, targetLocale, model);
    const systemPromptTokens = this.systemPromptTokens.get(systemPromptKey) || 0;

    let separatorTokens = 0;
    if (DELIMITER_TYPE === 'single') {
      separatorTokens = this.separatorTokens.get(model) || 0;
    } else if (DELIMITER_TYPE === 'pair') {
      separatorTokens = (this.separatorStartTokens.get(model) || 0) + (this.separatorEndTokens.get(model) || 0);
    } else if (DELIMITER_TYPE === 'json') {
      separatorTokens = this.jsonOverheadTokens.get(model) || 0;
    }

    /**
     * DELIMITER_TYPE === 'single' 时：
     * 总tokens = 第一个任务tokens + system prompt tokens
     * DELIMITER_TYPE === 'pair' 时：
     * 总tokens = 第一个任务tokens + system prompt tokens + 一对分隔标签的 tokens
     *
     * 注意：
     * 1. 分隔符只有在 tasks.length > 0 时才需要计算
     * 2. 分隔符在每个任务都需要计算
     */
    let totalTokens = firstTaskTokens + systemPromptTokens + (['pair', 'json'].includes(DELIMITER_TYPE) ? separatorTokens : 0);

    // 如果单个任务已经在目标区间，直接返回
    if (totalTokens >= targetTokens70) {
      return { tasks, totalTokens };
    }

    // 寻找更多同语言任务来批处理
    let remainingTokens = targetTokens80 - totalTokens;
    selectedTaskIds.clear(); // 清空已选任务ID集合，准备第二轮选择

    // 再次创建队列快照
    const queueSnapshot2 = [...this.queue];

    for (const task of queueSnapshot2) {
      // 跳过已处理或不匹配语言的任务
      if (this.processingItems.has(task.taskId) ||
          task.sourceLocale !== sourceLocale ||
          task.targetLocale !== targetLocale) {
        continue;
      }

      const taskTokens = task[model] || 0;
      /**
       * 注意：这里要考虑分隔符
       * DELIMITER_TYPE === 'single' 时，分隔符只有在 tasks.length > 0 时才需要计算
       * DELIMITER_TYPE === 'pair' 时，分隔符在每个任务都需要计算
       * DELIMITER_TYPE === 'json' 时，不需要计算分隔符
       */
      const tokenWithSeparator = taskTokens + (DELIMITER_TYPE === 'pair' || (DELIMITER_TYPE === 'single' && tasks.length > 0) ? separatorTokens : 0);

      // 检查添加这个任务是否会超过限制
      if (tokenWithSeparator <= remainingTokens) {
        selectedTaskIds.add(task.taskId);
        remainingTokens -= tokenWithSeparator;
        totalTokens += tokenWithSeparator;
        this.processingItems.set(task.taskId, task);
        tasks.push(task);

        // 如果达到目标区间，停止添加
        if (totalTokens >= targetTokens70) {
          break;
        }
      }
    }

    // 移除选中的附加任务并标记为处理中
    if (selectedTaskIds.size > 0) {
      this.queue = this.queue.filter(item => {
        if (selectedTaskIds.has(item.taskId)) {
          return false; // 从队列中移除
        }
        return true; // 保留在队列中
      });
    }

    // 计算分隔符的总 tokens 数量
    let totalSeparatorTokens = 0;
    // system prompt 只计算一次，分隔符计算 (tasks.length - 1) 次
    if (DELIMITER_TYPE === 'single') {
      totalSeparatorTokens = (tasks.length > 1 ? (tasks.length - 1) * separatorTokens : 0);
    } else if (DELIMITER_TYPE === 'pair') {
      // system prompt 只计算一次，每个任务需要一对分隔标签
      totalSeparatorTokens = tasks.length * separatorTokens;
    } else if (DELIMITER_TYPE === 'json') {
      // system prompt只计算一次，JSON包装只计算一次
      totalSeparatorTokens = separatorTokens;
    }

    // 重新计算总tokens，确保准确性
    totalTokens = systemPromptTokens + tasks.reduce((sum, task) => sum + (task[model] || 0), 0) + totalSeparatorTokens;

    return { tasks, totalTokens };
  }

  /**
   * 更新单个 task 的翻译结果
   * @param task
   * @param translatedText
   */
  public async updateSingleTask(task: any, translatedText: string) {
    const { resourceId, key, sourceLocale, targetLocale } = task;
    const now = new Date();

    try {
      const resourceItem = await ResourceItem.findOne({
        where: {
          resourceId,
          key,
          locale: targetLocale,
          syncStatus: {
            [Op.or]: [0, 2]
          }
        }
      });

      if (resourceItem) {
        resourceItem.content = translatedText;
        resourceItem.syncStatus = 1;
        resourceItem.lastTranslated = now;
        resourceItem.lastModified = now;
        resourceItem.updatedAt = now;

        await resourceItem.save();

        // 更新翻译成功队列
        this.successQueue.push(task);

        Logger.info(`resourceId: ${resourceId}, key: ${key}, locale: ${targetLocale} 更新成功`);
      } else {
        // 更新翻译失败队列
        this.errorQueue.push(task);

        Logger.warn(`未找到要更新的 ResourceItem: resourceId=${resourceId}, key=${key}, locale=${targetLocale}. 任务详情: ${JSON.stringify(task)}`);
      }

      // 再次查询数据库中, 当前 content 和 sourceText 都相同的资源, 如果存在, 则更新对应的 目标语言的 数据
      const resourceItems = await ResourceItem.findAll({
        where: {
          locale: sourceLocale,
          content: task.sourceText,
          resourceId: {
            [Op.ne]: resourceId
          }
        }
      });

      if (resourceItems.length > 0) {
        const targetResourceItems: any[] = [];

        for (const resourceItem of resourceItems) {
          const targetResourceItem = await ResourceItem.findOne({
            where: {
              resourceId: resourceItem.resourceId,
              key: resourceItem.key,
              locale: targetLocale,
              syncStatus: {
                [Op.or]: [0, 2]
              },
              content: task.sourceText
            }
          });

          if (targetResourceItem) {
            targetResourceItems.push(targetResourceItem);
          }
        }

        if (targetResourceItems.length > 0) {
          for (const targetResourceItem of targetResourceItems) {
            targetResourceItem.content = translatedText;
            targetResourceItem.syncStatus = 1;
            targetResourceItem.lastTranslated = now;
            targetResourceItem.lastModified = now;
            targetResourceItem.updatedAt = now;

            await targetResourceItem.save();

            Logger.info(`resourceId: ${resourceId}, key: ${key}, locale: ${targetLocale} 同步更新 targetResourceItem: ${targetResourceItem.resourceId}, key: ${targetResourceItem.key}, locale: ${targetResourceItem.locale} 成功`);
          }

          Logger.info(`resourceId: ${resourceId}, key: ${key}, locale: ${targetLocale} 同步更新其它的 ${targetResourceItems.length} 个资源更新成功`);
        } else {
          Logger.info(`resourceId: ${resourceId}, key: ${key}, locale: ${targetLocale} 与当前资源 content 相同的资源有 ${resourceItems.length} 个, 但都已同步更新`);
        }
      } else {
        Logger.info(`resourceId: ${resourceId}, key: ${key}, locale: ${targetLocale} 没有与当前资源 content 相同的资源`);
      }
    } catch (error: any) {
      Logger.error(`更新 ResourceItem (resourceId=${resourceId}, key=${key}, locale=${targetLocale}) 失败: ${error.message}`);
    }
  }

  /**
   * 处理翻译成功
   * @param tasks 任务列表
   * @param results 翻译结果
   */
  public async handleTranslationSuccess(tasks: any[], results: string[]) {
    if (!tasks || !results || tasks.length !== results.length) {
      Logger.error(`处理翻译成功失败: 任务和结果数量不匹配`);

      this.handleTranslationError(tasks, new Error("任务与结果数量不匹配导致无法确认成功条目"));
      return;
    }

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const translatedText = results[i];

      // 释放任务锁定
      this.processingItems.delete(task.taskId);

      await this.updateSingleTask(task, translatedText);
    }
  }

  /**
   * 处理翻译失败
   * @param tasks 任务列表
   * @param error 错误信息
   */
  public handleTranslationError(tasks: any[], error: any) {
    if (!tasks) {
      Logger.error(`处理翻译失败: 没有任务`);

      return;
    }

    let retryTasksCount = 0;

    for (const task of tasks) {
      // 释放任务锁定
      this.processingItems.delete(task.taskId);
      const retryCount = task.retryCount || 0;

      // 如果重试次数小于 3, 则将任务重新加入队列, 包含原本请求的话一共会请求 3 次
      if (retryCount < 3) {
        this.queue.push({
          ...task,
          retryCount: retryCount + 1
        });

        retryTasksCount++;
      }

      // 添加到失败队列
      this.errorQueue.push({
        ...task,
        error: error.message || String(error)
      });
    }

    Logger.error(`处理 ${tasks.length} 个翻译任务失败: ${error.message || error}${retryTasksCount ? `, ${retryTasksCount} 个任务已重新加入队列` : ''}`);
  }
}

export default TranslationManager;

