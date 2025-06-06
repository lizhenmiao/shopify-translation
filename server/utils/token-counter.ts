import { encoding_for_model, get_encoding, TiktokenModel, Tiktoken, TiktokenEncoding } from 'tiktoken';
import Logger from '~/server/utils/logger';

// OpenAI 模型名称到 Tiktoken Encoding 名称的映射
const OPENAI_MODEL_ENCODINGS: Record<string, TiktokenEncoding> = {
  'gpt-4o': 'cl100k_base',
  'gpt-4o-mini': 'cl100k_base',
  'gpt-4': 'cl100k_base',
  'gpt-4-turbo': 'cl100k_base',
  'gpt-3.5-turbo': 'cl100k_base',
  'gpt-3.5-turbo-16k': 'cl100k_base',
  'text-embedding-ada-002': 'cl100k_base',
  'text-davinci-003': 'p50k_base',
  'text-davinci-002': 'p50k_base',
  'code-davinci-002': 'p50k_base',
  'davinci': 'r50k_base',
  'curie': 'r50k_base',
  'babbage': 'r50k_base',
  'ada': 'r50k_base'
};

// 创建一个 map 来存储 tiktoken 实例, 使用模型名称或编码名称作为 key
const tokenEncoderCache = new Map<string, Tiktoken>();

/**
 * 使用 tiktoken 准确计算 OpenAI 模型的 token 数量。
 * 如果模型不受支持，则尝试使用默认模型进行计算。
 * 仅当获取编码或编码过程失败时，才回退到字符数计算。
 * @param text 要计算的文本
 * @param model OpenAI 模型名称
 * @returns token 数量或字符数（如果回退）
 */
export function countTokens(text: string, model: string): number {
  try {
    if (!text) {
      return 0;
    }

    let encoding = tokenEncoderCache.get(model);

    if (encoding) {
      return encoding.encode(text).length;
    }

    // 标准化模型名称
    const normalizedModel = model.toLowerCase().trim();

    // 获取编码名称
    const encodingName = OPENAI_MODEL_ENCODINGS[normalizedModel] || 'cl100k_base';

    try {
      // 尝试使用模型名称获取编码器
      encoding = encoding_for_model(normalizedModel as TiktokenModel);
    } catch (e) {
      // 如果失败，使用编码名称
      encoding = get_encoding(encodingName as TiktokenEncoding);
    }

    if (!encoding) {
      throw new Error(`无法为模型 ${model} 创建编码器。`);
    }

    tokenEncoderCache.set(model, encoding);

    return encoding.encode(text).length;
  } catch (error: any) {
    Logger.error(`[countTokens] 计算 ${model} 的 token 数量失败: ${error.message || error}`);

    // 回退到基本估算
    return Math.ceil(text.length * 0.25) * 1.2;
  }
}

/**
 * 释放所有已缓存的 tiktoken 编码器实例以释放 WASM 内存。
 * 在应用程序关闭或不再需要这些编码器时调用此函数。
 */
export function freeAllTokenEncoders(): void {
  if (tokenEncoderCache.size === 0) {
    Logger.info(`没有需要释放的 tiktoken 编码器实例。`);

    return;
  }

  for (const [model, encoding] of tokenEncoderCache.entries()) {
    try {
      encoding.free();
    } catch (error: any) {
      Logger.error(`释放 ${model} 模型的 tiktoken 编码器实例失败: ${error.message || error}`);
    }
  }

  tokenEncoderCache.clear();
}

export default {
  countTokens,
  freeAllTokenEncoders
};