import { Sequelize } from 'sequelize';
import Logger from '~/server/utils/logger';

// 读取环境变量
const { mysql } = useRuntimeConfig();
const { host, port, database, username, password } = mysql;

// 创建Sequelize实例
const sequelize = new Sequelize(database, username, password, {
  host,
  port: parseInt(port),
  dialect: 'mysql',
  logging: false,
  dialectOptions: {
    // MySQL特定配置
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true
  },
  define: {
    // 全局模型配置
    charset: 'utf8mb4',
    collate: 'utf8mb4_general_ci',
    freezeTableName: false, // 表名使用复数形式
    timestamps: true, // 默认添加 createdAt 和 updatedAt 字段
  },
  pool: {
    max: 10, // 连接池最大连接数
    min: 0, // 连接池最小连接数
    acquire: 30000, // 获取连接的最大等待时间（毫秒）
    idle: 10000 // 连接在释放前的最大空闲时间（毫秒）
  }
});

// 测试数据库连接
export const testConnection = async () => {
  try {
    await sequelize.authenticate();

    Logger.info('数据库连接已建立');

    return true;
  } catch (error) {
    Logger.error(`无法连接到数据库: ${error}`);

    return false;
  }
};

// 同步数据库模型
export const syncDatabase = async (force = false) => {
  try {
    Logger.info(`开始同步数据库模型 (force=${force})...`);

    // 使用alter选项而不是force，更安全地更新表结构
    // force=true会删除并重建表，alter=true会尝试更新现有表结构
    const options = force ? { force: true } : { alter: true };

    await sequelize.sync(options);

    Logger.info('数据库同步成功');

    return true;
  } catch (error: any) {
    Logger.error(`数据库同步失败: ${error.message}`);

    // 输出Sql错误详情（如果有）
    if (error.original) {
      Logger.error(`SQL错误: ${error.original.sqlMessage || error.original}`);
    }

    return false;
  }
};

export default sequelize;
