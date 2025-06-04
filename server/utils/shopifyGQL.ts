import Logger from '~/server/utils/logger';
import { executeGraphQLQuery } from '~/server/utils/shopify';
import { Resource, ResourceItem } from '~/server/models';
import { Op } from 'sequelize';

// 支持的语言列表
let supportedLocales: any[] = [];
/**
 * 获取支持的语言
 * @param forceRefresh 是否强制刷新
 * @returns 支持的语言列表
 */
export const getSupportedLocales = async (forceRefresh: boolean = false) => {
  // 如果已经获取过支持的语言，并且不需要强制刷新，直接返回缓存
  if (supportedLocales.length > 0 && !forceRefresh) {
    return supportedLocales;
  }

  const query = `
    query {
      shopLocales {
        locale
        name
        published
        primary
      }
    }
  `;

  try {
    // 使用公共函数执行GraphQL查询
    const response = await executeGraphQLQuery(query);

    // 将支持的语言列表缓存到内存中
    supportedLocales = response?.shopLocales || [];

    // 返回语言列表
    return supportedLocales;
  } catch (error: any) {
    throw error;
  }
};

/**
 * 获取支持的资源类型
 * shopify api 文档：https://shopify.dev/docs/api/admin-graphql/latest/queries/translatableresources#argument-resourceType
 * @returns 支持的资源类型列表
 */
export const getSupportedResourceTypes = () => {
  return [
    'ARTICLE',
    'BLOG',
    'COLLECTION',
    // 'COOKIE_BANNER',
    'DELIVERY_METHOD_DEFINITION',
    'EMAIL_TEMPLATE',
    'FILTER',
    'LINK',
    'MENU',
    'METAFIELD',
    'METAOBJECT',
    'ONLINE_STORE_THEME',
    'ONLINE_STORE_THEME_APP_EMBED',
    'ONLINE_STORE_THEME_JSON_TEMPLATE',
    'ONLINE_STORE_THEME_LOCALE_CONTENT',
    'ONLINE_STORE_THEME_SECTION_GROUP',
    'ONLINE_STORE_THEME_SETTINGS_CATEGORY',
    'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS',
    'PACKING_SLIP_TEMPLATE',
    'PAGE',
    'PAYMENT_GATEWAY',
    'PRODUCT',
    'PRODUCT_OPTION',
    'PRODUCT_OPTION_VALUE',
    'SELLING_PLAN',
    'SELLING_PLAN_GROUP',
    'SHOP',
    'SHOP_POLICY'
  ];
}

interface TranslatableContent {
  key: string;
  value: string;
  digest: string;
  locale: string;
}

interface Translation {
  key: string;
  locale: string;
  value: string;
  outdated: boolean;
  updatedAt: string;
}

interface TranslatableResourceNode {
  resourceId: string;
  translatableContent: TranslatableContent[];
  translations?: Translation[];
}

interface TranslatableResourceEdge {
  cursor: string;
  node: TranslatableResourceNode;
}

/**
 * 获取可翻译资源
 * @param resourceType 资源类型
 * @returns 可翻译资源列表
 */
export const getTranslatableResources = async (resourceType: string) => {
  const query = `
    query GetTranslatableResources(
      $resourceType: TranslatableResourceType!,
      $first: Int!,
      $after: String
    ) {
      translatableResources(resourceType: $resourceType, first: $first, after: $after) {
        edges {
          cursor
          node {
            resourceId
            translatableContent {
              key
              value
              digest
              locale
            }
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }
  `

  const variables = {
    resourceType,
    first: 250
  }

  try {
    // 定义从响应中提取数据的函数
    const getEdges = (data: any) => data?.translatableResources?.edges || [];
    const getPageInfo = (data: any) => data?.translatableResources?.pageInfo || {
      hasNextPage: false,
      endCursor: null
    };

    const result = await fetchAllPages<TranslatableResourceEdge[], any>(
      query,
      variables,
      getEdges,
      getPageInfo,
      (type: string, page: number, allEdges: any[]) => {
        if (type === 'start') {
          Logger.info(`[${resourceType}] 开始获取第 ${page} 页数据...`);
        } else if (type === 'end') {
          Logger.info(`[${resourceType}] 获取第 ${page} 页数据完成，已获取 ${allEdges.length} 条记录...`);
        }
      }
    );

    Logger.info(`[${resourceType}] 获取可翻译资源完成，共获取 ${result.length} 条记录..., 开始同步到数据库...`);

    // 拿到数据后再做标记
    if (result && result.length > 0) {
      // 获取主语言 locale
      const primaryLocale = result[0]?.node.translatableContent[0]?.locale || null;

      if (!primaryLocale) {
        throw new Error('主语言 locale 为空');
      }

      // 标记当前 resourceType && primaryLocale 的记录为 -1
      await ResourceItem.update(
        {
          syncStatus: -1,
          updatedAt: new Date()
        },
        {
          where: {
            locale: primaryLocale,
            resourceId: {
              [Op.like]: `gid://shopify/${formatResourceType(resourceType)}/%`
            }
          }
        }
      );

      // 开始将数据同步到数据库
      const resourceUpserts = [];
      const resourceItemUpserts = [];

      for (const edge of result) {
        const { resourceId, translatableContent } = edge.node || {};

        if (!resourceId || !translatableContent || translatableContent.length === 0) {
          continue;
        }

        resourceUpserts.push({
          resourceId,
          resourceType,
          lastSynced: new Date(),
          updatedAt: new Date()
        });

        for (const content of translatableContent) {
          const { key, value, digest, locale } = content;

          resourceItemUpserts.push({
            resourceId,
            key,
            content: value,
            digestHash: digest,
            locale,
            syncStatus: 3,
            updatedAt: new Date()
          });
        }
      }

      if (resourceUpserts.length > 0) {
        await Resource.bulkCreate(resourceUpserts, {
          updateOnDuplicate: ['lastSynced', 'updatedAt']
        });
      }

      if (resourceItemUpserts.length > 0) {
        await ResourceItem.bulkCreate(resourceItemUpserts, {
          updateOnDuplicate: ['content', 'digestHash', 'syncStatus', 'updatedAt']
        });
      }

      Logger.info(`[${resourceType}] 同步完成，resource 表共同步 ${resourceUpserts.length} 条记录，resourceItem 表共同步 ${resourceItemUpserts.length} 条记录`);
    }

    return result;
  } catch (error: any) {
    Logger.error(`获取可翻译资源失败: ${error.message || '未知错误'}`);

    throw error;
  }
}

/**
 * 获取指定资源ID的翻译资源
 * @param resourceType 资源类型
 * @param resourceIds 资源ID列表
 * @param locale 语言
 */
export const getTranslatableResourcesByIds = async (resourceType: string, resourceIds: string[], locale: string) => {
  const query = `
    query GetTranslatableResourcesByIds(
      $resourceIds: [ID!]!,
      $first: Int!,
      $cursor: String,
      $locale: String!
    ) {
      translatableResourcesByIds(resourceIds: $resourceIds, first: $first, after: $cursor) {
        edges {
          cursor
          node {
            resourceId
            translatableContent {
              key
              value
              digest
              locale
            }
            translations(locale: $locale) {
              key
              locale
              value
              outdated
              updatedAt
            }
          }
        }
        pageInfo {
          startCursor
          endCursor
          hasNextPage
          hasPreviousPage
        }
      }
    }
  `;

  const resourceIdsBatches = createBatches(resourceIds);

  try {
    const getEdges = (data: any) => data?.translatableResourcesByIds?.edges || [];
    const getPageInfo = (data: any) => data?.translatableResourcesByIds?.pageInfo || {
      hasNextPage: false,
      endCursor: null
    };

    // 批次索引
    let batchIndex = 0;

    for (const resourceIdsBatch of resourceIdsBatches) {
      const variables = {
        resourceIds: resourceIdsBatch,
        first: 250,
        locale
      };

      const result = await fetchAllPages<TranslatableResourceEdge[], any>(
        query,
        variables,
        getEdges,
        getPageInfo,
        (type: string, page: number, allEdges: any[]) => {
          if (type === 'start') {
            Logger.info(`[${resourceType} - ${locale}] 开始获取第 ${page} 页数据...`);
          } else if (type === 'end') {
            Logger.info(`[${resourceType} - ${locale}] 获取第 ${page} 页数据完成，已获取 ${allEdges.length} 条记录...`);
          }
        }
      );

      Logger.info(`[${resourceType} - ${locale} - 批次 ${batchIndex}] 获取指定资源ID的翻译资源完成，共获取 ${result.length} 条记录..., 开始同步到数据库...`);

      if (result && result.length > 0) {
        // 将 resourceItem 表中，指定 resourceType 和 locale 条件下，syncStatus 值不为 0、2 或 3 的记录，全部更新为 syncStatus = -1
        Logger.info(`[${resourceType} - ${locale} - 批次 ${batchIndex}] 开始更新 resourceItem 表中，指定 resourceType 和 locale 条件下，syncStatus 值不为 0、2 或 3 的记录，全部更新为 syncStatus = -1`);

        await ResourceItem.update(
          {
            syncStatus: -1
          },
          {
            where: {
              resourceId: {
                [Op.like]: `gid://shopify/${formatResourceType(resourceType)}/%`
              },
              locale,
              syncStatus: {
                [Op.notIn]: [0, 2, 3]
              }
            }
          }
        );

        // 开始将数据同步到数据库
        const resourceUpserts = [];
        const resourceItemUpserts = [];

        for (const edge of result) {
          const { resourceId, translatableContent, translations } = edge.node || {};

          if (!resourceId || !translatableContent || translatableContent.length === 0) {
            continue;
          }

          resourceUpserts.push({
            resourceId,
            resourceType,
            lastSynced: new Date(),
            updatedAt: new Date()
          });

          for (const content of translatableContent) {
            const { key, digest } = content;
            const translation = (translations || []).find((translation: any) => translation.key === key);

            // 需要先判断当前的 resourceItem 表中是否存在该资源 ID 和key的记录
            const resourceItem = await ResourceItem.findOne({
              where: {
                resourceId,
                key,
                locale
              }
            });

            // 如果存在, 获取其 syncStatus 值
            const oldSyncStatus = resourceItem?.syncStatus || null;

            // 默认为需要翻译
            let syncStatus = 0;

            if (oldSyncStatus === 1) {
              // 如果 oldSyncStatus 值为 1, 则表示该资源已翻译但还未同步到Shopify, 判断 translation 的 outdated 值, 如果 outdated 为 true, 则表示该资源已过期, 更新 syncStatus 值为 2, 否则不更新 syncStatus 值
              syncStatus = translation?.outdated ? 2 : 1;
            } else if (oldSyncStatus === 4) {
              // 如果 oldSyncStatus 值为 4, 则表示该资源已删除翻译, 不进行更新 syncStatus 值
              syncStatus = 4;
            } else {
              // 判断 translation 是否存在, 如果存在, 则判断 translation 的 outdated 值, 如果 outdated 为 true, 则表示该资源已过期, 更新 syncStatus 值为 2, 如果 outdated 为 false, 则表示该资源已翻译且未过期, 更新 syncStatus 值为 3
              // 如果 translation 不存在, 则表示该资源未翻译, 更新 syncStatus 值为 0
              syncStatus = translation ? (translation.outdated ? 2 : 3) : 0;
            }


            resourceItemUpserts.push({
              resourceId,
              key,
              content: translation?.value || null,
              digestHash: digest,
              locale,
              syncStatus,
              updatedAt: new Date(),
              lastModified: new Date(),
              lastSynced: translation && !translation.outdated && translation.updatedAt ? translation.updatedAt : new Date(),
            });
          }

          // 将 translations 中在 translatableContent 中不存在的记录进行更新
          for (const translation of (translations || [])) {
            const { key, value, outdated, updatedAt } = translation;

            const translatableContentItem = translatableContent.find((content: any) => content.key === key);

            if (translatableContentItem) {
              continue;
            }

            const resourceItem = await ResourceItem.findOne({
              where: {
                resourceId,
                key,
                locale
              }
            });

            // 如果存在, 获取其 syncStatus 值
            const oldSyncStatus = resourceItem?.syncStatus || null;

            // 默认为需要翻译
            let syncStatus = 0;

            if (oldSyncStatus === 1) {
              // 如果 oldSyncStatus 值为 1, 则表示该资源已翻译但还未同步到Shopify, 判断 translation 的 outdated 值, 如果 outdated 为 true, 则表示该资源已过期, 更新 syncStatus 值为 2, 否则不更新 syncStatus 值
              syncStatus = translation?.outdated ? 2 : 1;
            } else if (oldSyncStatus === 4) {
              // 如果 oldSyncStatus 值为 4, 则表示该资源已删除翻译, 不进行更新 syncStatus 值
              syncStatus = 4;
            } else {
              // 判断 translation 是否存在, 如果存在, 则判断 translation 的 outdated 值, 如果 outdated 为 true, 则表示该资源已过期, 更新 syncStatus 值为 2, 如果 outdated 为 false, 则表示该资源已翻译且未过期, 更新 syncStatus 值为 3
              // 如果 translation 不存在, 则表示该资源未翻译, 更新 syncStatus 值为 0
              syncStatus = translation ? (translation.outdated ? 2 : 3) : 0;
            }

            resourceItemUpserts.push({
              resourceId,
              key,
              content: value,
              digestHash: null,
              locale,
              syncStatus,
              updatedAt: new Date(),
              lastModified: new Date(),
              lastSynced: updatedAt || new Date()
            });
          }
        }

        if (resourceUpserts.length > 0) {
          await Resource.bulkCreate(resourceUpserts, {
            updateOnDuplicate: ['lastSynced', 'updatedAt']
          });
        }

        if (resourceItemUpserts.length > 0) {
          await ResourceItem.bulkCreate(resourceItemUpserts, {
            updateOnDuplicate: ['content', 'digestHash', 'syncStatus', 'updatedAt', 'lastModified', 'lastSynced']
          });
        }

        Logger.info(`[${resourceType} - ${locale} - 批次 ${batchIndex}] 同步完成，resource 表共同步 ${resourceUpserts.length} 条记录，resourceItem 表共同步 ${resourceItemUpserts.length} 条记录`);
      }

      batchIndex++;
    }
  } catch (error: any) {
    Logger.error(`获取指定资源ID的翻译资源失败: ${error.message || '未知错误'}`);

    throw error;
  }
}

/**
 * 分页获取所有数据
 * @param query GraphQL查询字符串
 * @param initialVariables 初始查询变量
 * @param getEdges 从响应中提取边的函数
 * @param getPageInfo 从响应中提取分页信息的函数
 * @returns 所有收集的数据
 */
export const fetchAllPages = async <T, R>(
  query: string,
  initialVariables: Record<string, any>,
  getEdges: (data: R) => any[],
  getPageInfo: (data: R) => { hasNextPage: boolean; endCursor: string | null },
  logCallback: (type: string, page: number, allEdges: any[]) => void
): Promise<T> => {
  let hasNextPage = true;
  let endCursor: string | null = null;
  let allEdges: any[] = [];
  let variables = { ...initialVariables };
  // 第几页
  let page = 1;

  while (hasNextPage) {
    // 打印进度
    if (logCallback) {
      logCallback('start', page, allEdges);
    }

    if (endCursor) {
      variables.after = endCursor;
    }

    const response = await executeGraphQLQuery<R>(query, variables);
    const edges = getEdges(response);

    if (!edges || edges.length === 0) break;

    // 合并边
    allEdges = allEdges.concat(edges);

    // 更新分页信息
    const pageInfo = getPageInfo(response);
    hasNextPage = pageInfo?.hasNextPage || false;
    endCursor = pageInfo?.endCursor || null;

    // 打印进度
    if (logCallback) {
      logCallback('end', page, allEdges);
    }

    page++;

    // 等待 1 秒再继续
    Logger.info(`等待 1 秒再继续...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return allEdges as T;
};

/**
 * 将资源类型转换为首字母大写的格式
 * @param resourceType 资源类型, 例如：EMAIL_TEMPLATE, 返回：EmailTemplate
 * @returns 首字母大写的资源类型
 */
export const formatResourceType = (resourceType: string): string => {
  // 将资源类型按下划线分割，每个部分首字母大写，然后拼接在一起
  return resourceType.toLowerCase().split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * 从资源ID中提取资源类型
 * @param resourceId 资源ID, 例如：gid://shopify/Article/556884557887, 返回：Article
 * @returns 资源类型
 */
export const extractResourceTypeFromId = (resourceId: string): string => {
  const parts = resourceId.split('/');
  return parts.length > 2 ? parts[parts.length - 2] : 'Unknown';
}

/**
 * 按照批量大小进行分组
 * @param resourceIds 资源ID列表
 * @param batchSize 每个批量的大小
 * @returns 分组后的资源ID列表, 例如：[[1, 2, 3], [4, 5, 6], [7, 8, 9]]
 */
export const createBatches = (resourceIds: string[], batchSize: number = 250) => {
  const batches = []

  for (let i = 0; i < resourceIds.length; i += batchSize) {
    const batch = resourceIds.slice(i, i + batchSize)

    batches.push(batch)
  }

  return batches
}