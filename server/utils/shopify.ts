import { shopifyApi, ApiVersion, Session, GraphqlClient, LogSeverity } from '@shopify/shopify-api';
import Logger from '~/server/utils/logger';

// Shopify API 单例
let shopifyApiInstance: ReturnType<typeof shopifyApi> | null = null;
let shopifySessionInstance: Session | null = null;

// 缓存配置
let configCache: {
  apiKey: string;
  apiSecretKey: string;
  host: string;
  version: ApiVersion;
  shop: string;
  accessToken: string;
} | null = null;

/**
 * 获取runtime配置
 */
const getRuntimeConfig = () => {
  // 如果已缓存，直接返回
  if (configCache) {
    return configCache;
  }

  const { shopify } = useRuntimeConfig();
  const { apiKey, apiSecretKey, host, version, shop, accessToken } = shopify;

  // 缓存配置
  configCache = {
    apiKey: apiKey as string,
    apiSecretKey: apiSecretKey as string,
    host: host as string,
    version: version as ApiVersion || ApiVersion.January25,
    shop: shop as string,
    accessToken: accessToken as string,
  };

  return configCache;
};

// 初始化Shopify API - 使用单例模式避免重复初始化
const initShopifyApi = () => {
  // 如果已经初始化过，直接返回缓存的实例
  if (shopifyApiInstance) {
    return shopifyApiInstance;
  }

  const config = getRuntimeConfig();

  try {
    // 生产环境下减少日志输出级别，提升性能
    const logLevel = process.env.NODE_ENV === 'production'
      ? LogSeverity.Warning
      : LogSeverity.Debug;

    // 初始化 API 并缓存实例
    shopifyApiInstance = shopifyApi({
      apiKey: config.apiKey,
      apiSecretKey: config.apiSecretKey,
      scopes: ['read_translations', 'write_translations'],
      hostName: (config.host || 'localhost').replace(/https?:\/\//, ''),
      apiVersion: config.version,
      isEmbeddedApp: false,
      logger: {
        level: logLevel,
        timestamps: true,
        // 只在开发环境下记录HTTP请求
        httpRequests: process.env.NODE_ENV !== 'production'
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

  const config = getRuntimeConfig();

  try {
    // 创建会话对象并缓存
    shopifySessionInstance = new Session({
      id: 'offline_' + config.shop,
      shop: config.shop,
      state: '',
      isOnline: false
    });

    // 设置访问令牌
    shopifySessionInstance.accessToken = config.accessToken;

    Logger.info('[Shopify Session] 创建完成');
    return shopifySessionInstance;
  } catch (error: any) {
    Logger.error(`创建Shopify会话失败: ${error.message || '未知错误'}`);
    throw error;
  }
};

// 缓存GraphQL客户端实例
let graphqlClientInstance: GraphqlClient | null = null;

/**
 * 创建Shopify GraphQL客户端
 * @returns GraphQL客户端实例
 */
const createShopifyGraphQLClient = (): GraphqlClient => {
  // 如果已经创建过客户端，直接返回缓存的客户端
  if (graphqlClientInstance) {
    return graphqlClientInstance;
  }

  const shopify = initShopifyApi();
  const session = createShopifySession();

  graphqlClientInstance = new shopify.clients.Graphql({
    session,
  }) as GraphqlClient;

  return graphqlClientInstance;
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

    // 只在非生产环境下输出详细日志
    if (process.env.NODE_ENV !== 'production') {
      Logger.info(`[Shopify GraphQL] 执行查询完成，查询消耗信息: ${JSON.stringify(response?.extensions?.cost || {})}`);
    }

    // 确保返回response.data，这是Shopify API的标准响应格式
    return response.data as T;
  } catch (error: any) {
    throw error;
  }
};
