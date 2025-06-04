import { getSupportedResourceTypes } from '~/server/utils/shopifyGQL';
import Logger from '@/server/utils/logger';

export default defineEventHandler(async (event) => {
  try {
    // 从Shopify获取支持的资源类型
    const resourceTypes = await getSupportedResourceTypes();

    Logger.info(`获取Shopify支持的资源类型成功: ${resourceTypes.length}条记录`);

    return {
      code: 200,
      message: 'success',
      data: resourceTypes
    };
  } catch (error: any) {
    Logger.error(`获取Shopify支持的资源类型失败: ${error.message}`);

    return {
      code: 500,
      message: error.message || 'error'
    }
  }
});
