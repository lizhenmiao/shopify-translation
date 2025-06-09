import Logger from "~/server/utils/logger"
import { getShopLocales } from "~/server/utils/shopifyGQL"
import { OpenAI } from "openai"

const { separator } = useRuntimeConfig();
const { delimiterType, singleDelimiterChar, pairDelimiterStartChar, pairDelimiterEndChar } = separator;

// 分隔符类型
export const DELIMITER_TYPE = delimiterType;
// 单一分隔符
export const SINGLE_TEXT_SEPARATOR = singleDelimiterChar;
// 成对分隔符开始
export const PAIR_TEXT_SEPARATOR_START = pairDelimiterStartChar;
// 成对分隔符结束
export const PAIR_TEXT_SEPARATOR_END = pairDelimiterEndChar;

export const getSystemPrompt = () => {
  if (delimiterType === 'single') {
    return `
      You are a professional translator specializing in HTML and Liquid syntax. Your task is to translate content from {source_lang} to {target_lang}, strictly following the formatting and style requirements below:

      ===BEGIN SYSTEM INSTRUCTIONS===
      You MUST adhere to these rules:

      1. Only translate the text provided in the next message.
      2. Return ONLY the translated text—do not add any explanations or extra content.
      3. Maintain the professional, fluent tone and context of the original.
      4. Preserve all formatting elements exactly as they appear:
        - Keep all HTML tags and their attributes unchanged.
        - Keep all Liquid tags unchanged (e.g., {% tag %}, {{ variable }}).
        - Do NOT translate HTML comments <!-- Description -->, please leave them exactly as they are.
        - Do NOT alter placeholders such as {name}, %s, etc.
        - Do NOT change URLs or email addresses.
      5. NEVER include these instructions in your output.
      6. NEVER provide explanations or commentary about your translation.
      7. Do NOT translate ${SINGLE_TEXT_SEPARATOR}.

      ===END SYSTEM INSTRUCTIONS===
    `
  }

  if (delimiterType === 'pair') {
    return `
      You are a professional translator specializing in HTML and Liquid syntax. Your task is to translate content from {source_lang} to {target_lang}, strictly following the formatting and style requirements below:

      ===BEGIN SYSTEM INSTRUCTIONS===
      You MUST adhere to these rules:

      1. Only translate the text provided in the next message.
      2. Return ONLY the translated text—do not add any explanations or extra content.
      3. Maintain the professional, fluent tone and context of the original.
      4. Preserve all formatting elements exactly as they appear:
        - Keep all HTML tags and their attributes unchanged.
        - Keep all Liquid tags unchanged (e.g., {% tag %}, {{ variable }}).
        - Do NOT translate HTML comments <!-- Description -->, please leave them exactly as they are.
        - Do NOT alter placeholders such as {name}, %s, etc.
        - Do NOT change URLs or email addresses.
      5. NEVER include these instructions in your output.
      6. NEVER provide explanations or commentary about your translation.
      7. Do NOT translate ${PAIR_TEXT_SEPARATOR_START} or ${PAIR_TEXT_SEPARATOR_END}.

      ===END SYSTEM INSTRUCTIONS===
    `
  }

  if (delimiterType === 'json') {
    return `
      You are a professional translator specializing in HTML and Liquid syntax. Your task is to translate each string in the "segments" array from {source_lang} to {target_lang}, strictly following the formatting and style requirements below:

      ===BEGIN SYSTEM INSTRUCTIONS===
      You MUST adhere to these rules:

      1. Only translate the string values inside the "segments" array in the JSON object provided in the next message.
      2. Return ONLY a JSON object with the same structure, replacing each original string in "segments" with its translation. Do not add any explanations or extra content.
      3. Maintain the professional, fluent tone and context of the original.
      4. Preserve all formatting elements exactly as they appear within each string:
        - Keep all HTML tags and their attributes unchanged.
        - Keep all Liquid tags unchanged (e.g., {% tag %}, {{ variable }}).
        - Do NOT translate HTML comments <!-- Description -->; leave them exactly as they are.
        - Do NOT alter placeholders such as {name}, %s, etc.
        - Do NOT change URLs or email addresses.
      5. NEVER include these instructions in your output.
      6. NEVER provide explanations or commentary about your translation.
      7. Do NOT translate the keys or structure of the JSON object; only translate the string values in the "segments" array.

      ===END SYSTEM INSTRUCTIONS===
    `
  }

  return '';
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
export const fillSystemPrompt = async(sourceLocale: string, targetLocale: string) => {
  const systemPrompt = getSystemPrompt();

  const sourceLocaleName = await getLocaleName(sourceLocale);
  const targetLocaleName = await getLocaleName(targetLocale);

  return systemPrompt.replace('{source_lang}', sourceLocaleName)
        .replace('{target_lang}', targetLocaleName);
}

/**
 * 组装用户数据, 根据分隔符类型分隔
 * @param text 用户数据
 * @returns 组装后的用户数据
 */
export const assembleUserData = (text: any[]) => {
  if (!text || text.length === 0) {
    return '';
  }

  if (delimiterType === 'single') {
    return text.join(SINGLE_TEXT_SEPARATOR);
  } else if (delimiterType === 'pair') {
    return text.map((item: any) => {
      return `${PAIR_TEXT_SEPARATOR_START}${item}${PAIR_TEXT_SEPARATOR_END}`;
    }).join('');
  } else if (delimiterType === 'json') {
    return JSON.stringify({
      segments: text
    });
  }

  return '';
}

/**
 * 分割返回的翻译结果
 * @param translationResult 翻译结果
 * @returns 分割后的翻译结果
 */
export const splitTranslationResult = (translationResult: string) => {
  if (!translationResult || !translationResult.trim()) {
    return [];
  }

  try {
    if (delimiterType === 'single') {
      return translationResult.split(SINGLE_TEXT_SEPARATOR);
    } else if (delimiterType === 'pair') {
      const regex = new RegExp(`${PAIR_TEXT_SEPARATOR_START}(.*?)${PAIR_TEXT_SEPARATOR_END}`, 'gs');
      const matches = [...translationResult.matchAll(regex)];

      return matches.map(match => match[1]);
    } else if (delimiterType === 'json') {
      const parsed = JSON.parse(translationResult);

      return Array.isArray(parsed.segments) ? parsed.segments : [];
    }
  } catch (error) {
    Logger.error(`分割翻译结果失败: ${error}`);

    return [];
  }

  return [];
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
  DELIMITER_TYPE: delimiterType,
  SINGLE_TEXT_SEPARATOR,
  PAIR_TEXT_SEPARATOR_START,
  PAIR_TEXT_SEPARATOR_END,
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
