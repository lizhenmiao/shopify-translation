import Logger from '~/server/utils/logger'
import { getSupportedLocales } from '~/server/utils/shopifyGQL';
import { QueryTypes } from 'sequelize';
import sequelize from '@/server/db';
import { shouldSkipTranslation } from '~/server/utils';
import TranslationManager from '~/server/utils/translation';

interface TranslationRequest {
  sourceText: string;
  sourceLocale: string;
  targetLocale: string;
  resourceId?: string;
  key?: string;
  digestHash?: string;
}

let translationManager: TranslationManager;

export default defineEventHandler(async (event) => {
  try {
    const { targetLocale, sourceLocale, resourceTypes } = await readBody(event);

    if (!targetLocale) {
      return {
        code: 400,
        message: '目标语言不能为空'
      }
    }

    // 获取支持的语言
    const supportedLocales = await getSupportedLocales();

    let primaryLocale = sourceLocale;

    // 如果源语言未传, 或者源语言不是支持的语言, 则使用主语言
    if (!sourceLocale || !supportedLocales.find((locale: any) => locale.locale === sourceLocale)) {
      // 查找主语言
      const { locale } = supportedLocales.find((locale: any) => locale.primary) || {};

      primaryLocale = locale;
    }

    let resourceIdsClause = '';

    if (resourceTypes && Array.isArray(resourceTypes) && resourceTypes.length > 0) {
      resourceIdsClause = resourceTypes.map((resourceType: string) => `ri_primary.resourceId LIKE 'gid://shopify/${formatResourceType(resourceType)}/%'`).join(' OR ');
    }

    // 查找 syncStatus 为 0 或 2 的待翻译资源
    const sql = `
      SELECT
        ri_primary.resourceId,
        ri_primary.key,
        ri_primary.locale AS source_locale,
        ri_primary.content AS source_content,
        ri_primary.digestHash,
        ri_target.locale AS target_locale,
        ri_target.syncStatus AS target_syncStatus
      FROM
        resource_items AS ri_primary
        JOIN resource_items AS ri_target ON ri_primary.resourceId = ri_target.resourceId
        AND ri_primary.key = ri_target.key
      WHERE
        ri_primary.locale = :primaryLocale
        AND ri_target.locale = :targetLocale
        AND ri_target.syncStatus IN (0, 2)
        AND ri_primary.content <> ''
        AND ri_primary.content IS NOT NULL
        ${resourceIdsClause ? `AND (${resourceIdsClause})` : ''};
    `;

    // Logger.info(`执行SQL查询: ${sql}`);

    // 执行原生SQL查询
    const results = await sequelize.query(sql, {
      replacements: {
        primaryLocale,
        targetLocale
      },
      type: QueryTypes.SELECT
    });

    const translationRequests: TranslationRequest[] = [];
    const contentSet = new Set<string>();

    for (const item of results as any[]) {
      // 跳过指定规则的资源或已处理的重复内容
      if (shouldSkipTranslation(item.source_content, item.resourceId, item.key) || contentSet.has(item.source_content)) {
        continue;
      }

      // 添加到已处理集合
      contentSet.add(item.source_content);

      // 创建翻译请求
      translationRequests.push({
        sourceText: item.source_content,
        sourceLocale: primaryLocale,
        targetLocale,
        resourceId: item.resourceId,
        key: item.key,
        digestHash: item.digestHash
      });
    }

    if (!translationManager) {
      translationManager = new TranslationManager();
    }

    translationManager.addQueue(translationRequests);

    return {
      code: 200,
      message: `共查询到 ${results.length} 个待翻译资源, 其中 ${translationRequests.length} 个资源符合翻译条件`,
    }
  } catch (error: any) {
    Logger.error(`批量翻译失败: ${error.message || error}`);

    return {
      code: 500,
      message: '批量翻译任务创建失败'
    }
  }
});
