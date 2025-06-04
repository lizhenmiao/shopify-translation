import { Model, DataTypes } from 'sequelize';
import sequelize from '@/server/db';

/**
 * 资源表，存储Shopify的可翻译资源信息
 */
class Resource extends Model {
  declare id: number;
  declare resourceId: string;
  declare resourceType: string;
  declare lastSynced: Date;
  declare createdAt: Date;
  declare updatedAt: Date;
}

Resource.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  resourceId: {
    type: DataTypes.STRING(191),
    allowNull: false,
    unique: { name: 'idx_resource_resourceId', msg: 'Resource ID must be unique' },
    comment: 'Shopify资源ID'
  },
  resourceType: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '资源类型'
  },
  lastSynced: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '最后同步时间'
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
  modelName: 'Resource',
  tableName: 'resources',
  timestamps: true
});

export default Resource;
