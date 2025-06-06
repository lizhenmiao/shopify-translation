import Logger from "~/server/utils/logger"
import { getShopLocales } from "~/server/utils/shopifyGQL"
import { OpenAI } from "openai"

// 分隔符
export const TEXT_SEPARATOR = '[TEXT_SEPARATOR]';

export const getSystemPrompt = (locale: string): string => {
  const systemPrompt: Record<string, string> = {
    en: `You are a professional translator specializing in HTML and Liquid syntax, translating from {source_lang} to {target_lang}.

      ===CRITICAL RULES===
      1. Translate EACH segment separated by [TEXT_SEPARATOR]
      2. Output MUST contain EXACTLY the same number of [TEXT_SEPARATOR] tokens as input
      3. NEVER add [TEXT_SEPARATOR] at the end of your response
      4. NEVER merge or split segments - segment count mismatch = invalid response

      PRESERVE EXACTLY:
      - HTML tags and attributes
      - Liquid syntax: {% %} and {{ }}
      - HTML comments: <!-- Description --> must NOT be translated
      - Placeholders: {name}, %s, {{var}}
      - URLs and email addresses

      OUTPUT REQUIREMENTS:
      - ONLY translated content
      - NO explanations or meta-text
      - Professional tone and natural fluency
      - Maintain original formatting

      CRITICAL: Any deviation renders response unusable.
    `,
    zh: `你是一位专业的翻译员，擅长处理 HTML 和 Liquid 语法，负责将文本从 {source_lang} 翻译成 {target_lang}。

      ===BEGIN SYSTEM INSTRUCTIONS===
      1. 你的任务是翻译用户消息 (user message) 中提供的全部文本内容。
      2. 输入内容可能包含由分隔符 "${TEXT_SEPARATOR}" 分隔的多个文本段落。请独立翻译每个文本段落。
      3. 仅返回翻译后的文本，并保留文本段落之间的 "${TEXT_SEPARATOR}" 分隔符。
      4. 保持原文的专业语气、上下文连贯和行文流畅。
      5. 严格保留所有格式元素，确保其与原文完全一致：
        - HTML 标签 (例如, <p class="example">) 必须保持原样，包括其属性。
        - Liquid 标签 (例如, {% if user %} 或 {{ product.title }}) 必须保持原样。
        - HTML 注释 (例如, <!-- Description -->) 不得翻译，必须保持原样。
        - 占位符 (例如, {name}, %s, {{placeholder}}) 必须保持不变。
        - URL 和电子邮件地址必须保持不变。
      6. 绝不在输出中包含这些指令本身。
      7. 绝不解释你的翻译内容。
      ===END SYSTEM INSTRUCTIONS===
    `
  }

  // 如果没有找到对应的语言，默认返回英文
  return systemPrompt[locale] || systemPrompt['en']
}

/**
 * 封装一个等待函数
 * @param ms 等待时间
 * @returns Promise
 */
export const sleep = (ms: number) => {
  Logger.info(`等待 ${ms} ms 再继续...`)
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 判断一个翻译请求是否应该根据预设规则跳过。
 * @param content 文本内容
 * @param resourceId 资源ID。
 * @param key 翻译键。
 * @returns 如果应该跳过则返回 true，否则返回 false。
 */
export const shouldSkipTranslation = (content: string, resourceId: string | undefined, key: string) => {
  // 条件1：content 以 "gid://shopify/GenericFile/" 开头
  if (content.startsWith('gid://shopify/GenericFile/')) {
    return true
  }

  // 条件2：content 以 "shopify://" 开头
  if (content.startsWith('shopify://')) {
    return true
  }

  // 条件3：content 是纯数字
  if (/^\d+$/.test(content)) {
    return true
  }

  // 条件4：content 等于特定日期格式字符串
  if (['%B %d, %Y', '%A, %d %m, %Y'].includes(content)) {
    return true
  }

  // 条件5：key 为特定值
  if (key && ['general.phone', 'section.nw-footer.email', 'handle'].includes(key)) {
    return true
  }

  // 条件6：key 匹配特定正则表达式
  const socialLinkRegex = /^general\..*_social_link$/
  if (key && socialLinkRegex.test(key)) {
    return true
  }

  // 条件7：resourceId 以特定前缀开头且 key 为特定值
  if (resourceId && resourceId.startsWith('gid://shopify/Product/') && key === 'title') {
    return true
  }

  // 条件8: <div class='jdgm-rev-widg' 开头
  if (content.startsWith(`<div class='jdgm-rev-widg'`)) {
    return true
  }

  // 条件9: 包含 ***SIMP***
  if (content.includes('***SIMP***')) {
    return true
  }

  // 条件10: content 为 '', null, undefined
  if (['', null, undefined, NaN].includes(content)) {
    return true
  }

  // 默认不跳过
  return false
}

/**
 * 获取语言名称
 * @param locale 语言代码
 * @returns 语言名称
 */
export const getLocaleName = async (locale: string) => {
  const shopLocales = await getShopLocales();

  return shopLocales.get(locale) || locale;
}

/**
 * 填充系统提示
 * @param sourceLocale 源语言代码
 * @param targetLocale 目标语言代码
 * @param templateCode 系统提示模板代码, 目前只有 en, zh
 * @returns 填充后的系统提示
 */
export const fillSystemPrompt = async(sourceLocale: string, targetLocale: string, templateCode: string = 'en') => {
  const systemPrompt = getSystemPrompt(['en', 'zh'].includes(templateCode) ? templateCode : 'en');

  const sourceLocaleName = await getLocaleName(sourceLocale);
  const targetLocaleName = await getLocaleName(targetLocale);

  return systemPrompt.replace('{source_lang}', sourceLocaleName)
        .replace('{target_lang}', targetLocaleName);
}

/**
 * 组装用户数据, 利用 TEXT_SEPARATOR 分隔符分隔
 * @param text 用户数据
 * @returns 组装后的用户数据
 */
export const assembleUserData = (text: any[]) => {
  if (!text || text.length === 0) {
    return '';
  }

  return text.join(TEXT_SEPARATOR);
}

/**
 * 分割返回的翻译结果
 * @param translationResult 翻译结果
 * @returns 分割后的翻译结果
 */
export const splitTranslationResult = (translationResult: string) => {
  return translationResult.split(TEXT_SEPARATOR);
}

/**
 * 获取请求头信息
 * @param headers 请求头
 * @returns 请求头信息
 */
export const getHeadersData = (headers: any) => {
  return ['date', 'retry-after', 'x-ratelimit-limit-requests', 'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens'].reduce((acc: any, key: string) => {
    acc[key] = (headers || {}).get(key);

    return acc;
  }, {});
}

/**
 * 获取 ai 模型返回的翻译结果
 * @param modelResponse 模型返回的数据
 * @returns 翻译结果
 */
export const getTranslationResult = (modelResponse: any) => {
  return modelResponse?.choices?.[0]?.message?.content || '';
}

/**
 * 获取使用的 tokens 数量
 * @param modelResponse 模型返回的数据
 * @returns 使用的 tokens 数量
 */
export const getUsedTokens = (modelResponse: any) => {
  const { usage } = modelResponse || {};
  const { prompt_tokens, completion_tokens, total_tokens } = usage || {};

  return {
    promptTokens: prompt_tokens || 0,
    completionTokens: completion_tokens || 0,
    totalTokens: total_tokens || 0
  }
}

/**
 * 获取当前 UTC 时间
 * @returns 当前 UTC 时间
 */
export const getCurrentUTCTime = () => {
  return new Date().getTime();
}

/**
 * 翻译
 * @param openaiInstance openai 实例
 * @param model 模型
 * @param text 文本
 * @param sourceLocale 源语言
 * @param targetLocale 目标语言
 * @returns 翻译结果
 */
/* export const translate = async (openaiInstance: OpenAI, model: string, text: any[], sourceLocale: string, targetLocale: string) => {
  try {
    const systemPrompt = await fillSystemPrompt(sourceLocale, targetLocale)
    const userMessage = assembleUserData(text)

    const { data: modelResponse, response: raw, request_id }  = await openaiInstance.chat.completions.create({
      model: model as string,
      messages: [{
        role: 'system',
        content: systemPrompt
      }, {
        role: 'user',
        content: userMessage
      }],
      stream: false
    }).withResponse();

    const headersData = getHeadersData(raw.headers);
    const translationResult = getTranslationResult(modelResponse);
    const { promptTokens, completionTokens, totalTokens } = getUsedTokens(modelResponse);

    Logger.info(`翻译结果:\n${translationResult}\nheaders:\n${JSON.stringify(headersData)}\nrequest_id: ${request_id}\nprompt_tokens: ${promptTokens}\ncompletion_tokens: ${completionTokens}\ntotal_tokens: ${totalTokens}`)
  } catch (error: any) {
    Logger.error(`翻译失败: ${error.message || error}`)

    throw error
  }
} */

/**
 * 清理一下 content 中的 liquid 标签
 * @param content 文本内容
 * @returns 清理后的文本内容
 */
/* export const cleanLiquidTags = (content: string) => {
  const liquidCode = content.match(/{{\s*[\w\.]+\s*}}/g);

  const cleanContent = content.replace(/{{\s*[\w\.]+\s*}}/g, '[liquid_code_placeholder]');

  return {
    liquidCode,
    cleanContent
  }
} */

/**
 * 提取时间字符串中的时间，并转换为毫秒
 * @param str 时间字符串
 * @returns 时间字符串、毫秒数、小时数、分钟数、秒数
 */
export const extractAndConvertTime = (str: string) => {
  // 正则表达式匹配时间格式：可选的小时(h)、可选的分钟(m)、必需的秒(s)
  const timeRegex = /(?:(\d+)h)?(?:(\d+)m)?(\d+(?:\.\d+)?)s/;
  const match = str.match(timeRegex);

  if (!match) {
    return {
      timeStr: null,
      milliseconds: null,
      error: "未找到有效的时间格式"
    };
  }

  // 提取完整的时间字符串
  const timeStr = match[0];

  // 提取各个时间单位（如果存在）
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseFloat(match[3]) || 0;

  // 转换为毫秒
  const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;

  return {
    // 原始时间字符串
    timeStr,
    // 毫秒数
    milliseconds: totalMs,
    // 小时数
    hours,
    // 分钟数
    minutes,
    // 秒数
    seconds
  };
}

export default {
  TEXT_SEPARATOR,
  getSystemPrompt,
  sleep,
  shouldSkipTranslation,
  getLocaleName,
  fillSystemPrompt,
  assembleUserData,
  getHeadersData,
  getTranslationResult,
  getUsedTokens,
  getCurrentUTCTime,
  extractAndConvertTime
}
