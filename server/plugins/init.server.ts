import { initDatabase } from '@/server/initDb';
import Logger from '~/server/utils/logger';

export default defineNitroPlugin(async (nitroApp) => {
  await import('@shopify/shopify-api/adapters/node')

  try {
    Logger.info('开始系统初始化...');

    // 初始化数据库
    const success = await initDatabase();

    if (success) {
      Logger.info('系统初始化完成');
    } else {
      Logger.error('系统初始化失败，请检查日志');
    }
  } catch (error: any) {
    Logger.error(`系统初始化出错: ${error.message || '未知错误'}`);
  }
});
