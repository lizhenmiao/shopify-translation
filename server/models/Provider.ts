import { Model, DataTypes } from 'sequelize';
import sequelize from '@/server/db';

/**
 * 翻译提供商表，存储翻译服务提供商信息
 */
class Provider extends Model {
  declare id: number;
  declare name: string;
  declare baseUrl: string;
  declare isActive: boolean;
  declare model: string;
  declare providerType: string;
  declare key: string;
  declare requestsPerMinute: number;
  declare requestsPerDay: number;
  declare tokensPerMinute: number;
  declare tokensPerDay: number;
  declare dailyRequestCount: number;
  declare dailyTokenCount: number;
  declare minuteRequestCount: number;
  declare minuteTokenCount: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Provider.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: { name: 'idx_provider_name', msg: 'Provider name must be unique' },
    comment: '提供商名称'
  },
  baseUrl: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'API基础URL'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: '是否激活'
  },
  model: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '使用的模型名称'
  },
  providerType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'openai',
    comment: '提供商类型: openai'
  },
  key: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'API密钥值'
  },
  requestsPerMinute: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '每分钟请求限制(0表示不限制)'
  },
  requestsPerDay: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '每日请求限制(0表示不限制)'
  },
  tokensPerMinute: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '每分钟token限制(0表示不限制)'
  },
  tokensPerDay: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '每日token限制(0表示不限制)'
  },
  dailyRequestCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '当日请求计数'
  },
  dailyTokenCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '当日token计数'
  },
  minuteRequestCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '当前分钟请求计数'
  },
  minuteTokenCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '当前分钟token计数'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'Provider',
  tableName: 'providers',
  timestamps: true
});

export default Provider;
