import { testConnection, syncDatabase } from '@/server/db';
import { initModels } from '@/server/models';
import Logger from '~/server/utils/logger';

/**
 * 初始化数据库
 * 1. 测试数据库连接
 * 2. 同步数据库模型
 */
export const initDatabase = async (force = false) => {
  try {
    Logger.info('开始初始化数据库...');

    // 测试数据库连接
    const connected = await testConnection();

    if (!connected) {
      Logger.error('无法连接到数据库，请检查数据库配置');

      return false;
    }

    // 初始化模型
    await initModels();

    try {
      // 同步数据库模型
      const synced = await syncDatabase(force);

      if (!synced) {
        Logger.error('同步数据库模型失败');

        return false;
      }
    } catch (syncError: any) {
      Logger.error(`同步数据库模型失败: ${syncError.message}`);
      Logger.error(`sqlError: ${syncError.original?.sqlMessage || '无SQL错误信息'}`);

      return false;
    }

    Logger.info('数据库初始化成功');

    return true;
  } catch (error: any) {
    Logger.error(`初始化数据库失败: ${error.message}`);

    return false;
  }
};

