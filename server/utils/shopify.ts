import { shopifyApi, ApiVersion, Session, GraphqlClient, LogSeverity } from '@shopify/shopify-api';
import Logger from '~/server/utils/logger';

// Shopify API 单例
let shopifyApiInstance: any = null;
let shopifySessionInstance: Session | null = null;

// 初始化Shopify API - 使用单例模式避免重复初始化
const initShopifyApi = () => {
  // 如果已经初始化过，直接返回缓存的实例
  if (shopifyApiInstance) {
    return shopifyApiInstance;
  }

  const { shopify } = useRuntimeConfig();
  const { apiKey, apiSecretKey, host, version } = shopify;

  try {
    // 初始化 API 并缓存实例
    shopifyApiInstance = shopifyApi({
      apiKey: apiKey as string,
      apiSecretKey: apiSecretKey as string,
      scopes: ['read_translations', 'write_translations'],
      hostName: (host as string || 'localhost').replace(/https?:\/\//, ''),
      apiVersion: version as ApiVersion || ApiVersion.January25,
      isEmbeddedApp: false,
      logger: {
        level: LogSeverity.Debug,
        timestamps: true,
        httpRequests: true
      },
    });

    Logger.info('[Shopify API] 初始化完成');

    return shopifyApiInstance;
  } catch (error: any) {
    Logger.error(`初始化Shopify API失败: ${error.message || '未知错误'}`);

    throw error;
  }
};

// 创建Shopify会话 - 使用单例模式避免重复创建
const createShopifySession = () => {
  // 如果已经创建过会话，直接返回缓存的会话
  if (shopifySessionInstance) {
    return shopifySessionInstance;
  }

  const { shopify } = useRuntimeConfig();
  const { shop, accessToken } = shopify;

  try {
    // 创建会话对象并缓存
    shopifySessionInstance = new Session({
      id: 'offline_' + shop as string,
      shop: shop as string,
      state: '',
      isOnline: false
    });

    // 设置访问令牌
    shopifySessionInstance.accessToken = accessToken as string;

    Logger.info('[Shopify Session] 创建完成');
    return shopifySessionInstance;
  } catch (error: any) {
    Logger.error(`创建Shopify会话失败: ${error.message || '未知错误'}`);

    throw error;
  }
};

/**
 * 创建Shopify GraphQL客户端
 * @returns GraphQL客户端实例
 */
const createShopifyGraphQLClient = (): GraphqlClient => {
  const shopify = initShopifyApi();
  const session = createShopifySession();

  return new shopify.clients.Graphql({
    session,
  }) as GraphqlClient;
};

/**
 * 执行GraphQL查询
 * @param query GraphQL查询字符串
 * @param variables 查询变量
 * @returns 查询结果
 */
export const executeGraphQLQuery = async <T = any>(query: string, variables: Record<string, any> = {}): Promise<T> => {
  const client = createShopifyGraphQLClient();

  try {
    const response = await client.request(query, {
      variables: variables
    });

    Logger.info(`[Shopify GraphQL] 执行查询完成，查询消耗信息: ${JSON.stringify(response?.extensions?.cost || {})}`);

    // 确保返回response.data，这是Shopify API的标准响应格式
    return response.data as T;
  } catch (error: any) {
    throw error;
  }
};
