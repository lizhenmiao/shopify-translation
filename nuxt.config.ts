// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],
  runtimeConfig: {
    // mysql 配置
    mysql: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    },
    // shopify 配置
    shopify: {
      shop: process.env.SHOPIFY_SHOP,
      apiKey: process.env.SHOPIFY_API_KEY,
      apiSecretKey: process.env.SHOPIFY_API_SECRET_KEY,
      host: process.env.SHOPIFY_HOST,
      version: process.env.SHOPIFY_API_VERSION,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    },
    // 分隔符配置
    separator: {
      // 分隔符类型, single, pair, json
      delimiterType: process.env.DELIMITER_TYPE,
      // 单个分隔符字符
      singleDelimiterChar: process.env.SINGLE_DELIMITER_CHAR,
      // 成对分隔符开始字符
      pairDelimiterStartChar: process.env.PAIR_DELIMITER_START_CHAR,
      // 成对分隔符结束字符
      pairDelimiterEndChar: process.env.PAIR_DELIMITER_END_CHAR,
    },
    // 客户端可用环境变量
    public: {
      apiBaseUrl: '/api',
    }
  }
})