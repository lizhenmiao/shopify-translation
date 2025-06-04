import Resource from '@/server/models/Resource';
import ResourceItem from '@/server/models/ResourceItem';
import Translation from '@/server/models/Translation';
import Provider from '@/server/models/Provider';
import ApiKeyUsageLog from '@/server/models/ApiKeyUsageLog';

// 设置模型关联关系
Resource.hasMany(ResourceItem, { foreignKey: 'resourceId', onDelete: 'CASCADE' });
ResourceItem.belongsTo(Resource, { foreignKey: 'resourceId' });

export {
  Resource,
  ResourceItem,
  Translation,
  Provider,
  ApiKeyUsageLog
};

// 初始化模型
export const initModels = async () => {
  // 引入所有模型以确保它们都被正确初始化
  return {
    Resource,
    ResourceItem,
    Translation,
    Provider,
    ApiKeyUsageLog
  };
};
