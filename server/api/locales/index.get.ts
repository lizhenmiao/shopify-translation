import { getSupportedLocales } from '~/server/utils/shopifyGQL';
import Logger from '@/server/utils/logger';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const refresh = query.refresh || 'false';

    // 从Shopify获取支持的语言
    const locales = await getSupportedLocales(refresh === 'true');

    Logger.info(`获取Shopify支持的语言成功: ${locales.length}条记录`);

    return {
      code: 200,
      message: 'success',
      data: locales
    };
  } catch (error: any) {
    Logger.error(`获取Shopify支持的语言失败: ${error.message}`);

    return {
      code: 500,
      message: error.message || 'error'
    }
  }
});
