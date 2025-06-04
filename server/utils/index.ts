import Logger from "~/server/utils/logger"

export const getSystemPrompt = (locale: string): string => {
  const systemPrompt: Record<string, string> = {
    en: `You are a professional translator specializing in HTML and Liquid syntax. Follow all formatting guidelines in the user prompt precisely, including preserving HTML tags, Liquid tags, placeholders, and special markers. Ensure your translation maintains the original text's tone, context, and formatting while adapting naturally to the target language.`,
    zh: `你是一个专业的HTML和Liquid语法翻译专家。严格按照用户提示中的所有格式化指南进行翻译，包括保留HTML标签、Liquid标签、占位符和特殊标记。确保你的翻译保持原文的语气、上下文和格式，同时自然地适应目标语言。`
  };

  // 如果没有找到对应的语言，默认返回英文
  return systemPrompt[locale] || systemPrompt['en'];
};

/**
 * 封装一个等待函数
 * @param ms 等待时间
 * @returns Promise
 */
export const wait = (ms: number) => {
  Logger.info(`等待 ${ms} ms 再继续...`);
  return new Promise(resolve => setTimeout(resolve, ms));
};

export default {
  getSystemPrompt,
  wait
};
